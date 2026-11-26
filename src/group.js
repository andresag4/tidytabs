import { extractDomain, COLORS, hashColor, paletteColor, prettyName, PRESETS } from './domain.js';
import { bucketByTicket, extractTickets, ticketTitle } from './ticket.js';

export const TAB_GROUP_ID_NONE = -1;

export function bucketByDomain(tabs, threshold) {
  const buckets = new Map();
  for (const t of tabs) {
    if (t.pinned) continue;
    if (t.groupId !== undefined && t.groupId !== TAB_GROUP_ID_NONE) continue;
    const domain = extractDomain(t.url);
    if (!domain) continue;
    if (!buckets.has(domain)) buckets.set(domain, []);
    buckets.get(domain).push(t);
  }
  for (const [domain, list] of buckets) {
    if (list.length < threshold) buckets.delete(domain);
  }
  return buckets;
}

export function pickGroupColor(domain, paletteIndex, settings) {
  const overrides = (settings && settings.domainColors) || {};
  const override = overrides[domain];
  if (override && COLORS.includes(override)) {
    return override;
  }
  if (PRESETS[domain]) {
    return PRESETS[domain];
  }
  switch (settings.colorStrategy) {
    case 'random':
      return COLORS[Math.floor(Math.random() * COLORS.length)];
    case 'palette':
      return paletteColor(paletteIndex);
    case 'stable-hash':
    default:
      return hashColor(domain);
  }
}

export function computeGroupOrder(groups, settings) {
  const copy = [...groups];
  switch (settings.groupOrder) {
    case 'alphabetical':
      copy.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'largest':
      copy.sort((a, b) => (b.size - a.size) || a.name.localeCompare(b.name));
      break;
    case 'leftmost':
    default:
      copy.sort((a, b) => a.leftmostIndex - b.leftmostIndex);
      break;
  }
  return copy.map(g => g.id);
}

export async function collectGroupableTabs(windowId) {
  const tabs = await chrome.tabs.query({ windowId });
  return tabs;
}

export async function applyGroups(buckets, settings, windowId, opts = {}) {
  const mergeMode = opts.mergeMode === true;
  const domains = [...buckets.keys()].sort();

  let existingGroupSnapshots = null;
  if (mergeMode) {
    const groups = await chrome.tabGroups.query({ windowId });
    const allTabs = await chrome.tabs.query({ windowId });
    existingGroupSnapshots = groups.map(g => {
      const members = allTabs.filter(t => t.groupId === g.id);
      return {
        id: g.id,
        title: g.title || '',
        collapsed: g.collapsed,
        leftmostIndex: members.length ? Math.min(...members.map(t => t.index)) : Infinity
      };
    });
  }

  let paletteIndex = 0;
  for (const domain of domains) {
    const tabs = buckets.get(domain);
    const tabIds = tabs.map(t => t.id);
    const title = prettyName(domain);

    let mergedIntoId = null;
    if (mergeMode && existingGroupSnapshots) {
      mergedIntoId = findMergeTarget(existingGroupSnapshots, title);
    }

    if (mergedIntoId !== null) {
      await chrome.tabs.group({ tabIds, groupId: mergedIntoId });
      const snap = existingGroupSnapshots.find(s => s.id === mergedIntoId);
      if (settings.autoCollapse === true && snap && snap.collapsed) {
        await chrome.tabGroups.update(mergedIntoId, { collapsed: true });
      }
    } else if (tabs.length >= settings.domainThreshold) {
      const groupId = await chrome.tabs.group({
        tabIds,
        createProperties: { windowId }
      });
      const color = pickGroupColor(domain, paletteIndex, settings);
      await chrome.tabGroups.update(groupId, {
        title,
        color,
        collapsed: settings.autoCollapse === true
      });
      paletteIndex++;
    }
  }
}

export async function reorderWindow(windowId, settings) {
  const allTabs = await chrome.tabs.query({ windowId });
  const groups = await chrome.tabGroups.query({ windowId });

  const pinnedCount = allTabs.filter(t => t.pinned).length;

  // Build the snapshot computeGroupOrder needs.
  const snapshots = groups.map(g => {
    const members = allTabs.filter(t => t.groupId === g.id);
    return {
      id: g.id,
      name: g.title || '',
      leftmostIndex: members.length ? Math.min(...members.map(t => t.index)) : Infinity,
      size: members.length
    };
  });

  const orderedGroupIds = computeGroupOrder(snapshots, settings);

  // Move groups to the front (after pinned tabs), in the chosen order.
  let cursor = pinnedCount;
  for (const gid of orderedGroupIds) {
    await chrome.tabGroups.move(gid, { index: cursor });
    const size = snapshots.find(s => s.id === gid).size;
    cursor += size;
  }

  // Place ungrouped non-pinned tabs.
  if (settings.ungroupedPlacement === 'leave') return;

  const refreshed = await chrome.tabs.query({ windowId });
  const ungrouped = refreshed
    .filter(t => !t.pinned && t.groupId === TAB_GROUP_ID_NONE)
    .sort((a, b) => a.index - b.index);
  if (ungrouped.length === 0) return;
  const ungroupedIds = ungrouped.map(t => t.id);

  if (settings.ungroupedPlacement === 'end') {
    await chrome.tabs.move(ungroupedIds, { index: -1 });
  } else if (settings.ungroupedPlacement === 'start') {
    await chrome.tabs.move(ungroupedIds, { index: pinnedCount });
  }
}

export function findMergeTarget(existingGroups, title) {
  let best = null;
  for (const g of existingGroups) {
    if (g.title !== title) continue;
    if (best === null || g.leftmostIndex < best.leftmostIndex) {
      best = g;
    }
  }
  return best === null ? null : best.id;
}

export async function runTicketTriage(settings) {
  const windowIds = [];
  if (settings.scope === 'all') {
    const wins = await chrome.windows.getAll({ populate: false });
    for (const w of wins) windowIds.push(w.id);
  } else {
    const w = await chrome.windows.getCurrent();
    windowIds.push(w.id);
  }

  for (const windowId of windowIds) {
    const allTabs = await chrome.tabs.query({ windowId });
    const eligible = allTabs.filter(t => {
      if (t.pinned) return false;
      if (typeof t.url !== 'string') return false;
      if (!t.url.startsWith('http://') && !t.url.startsWith('https://')) return false;
      return true;
    });

    // Single tabs count too: they may join an existing ticket group; new groups need 2+.
    const buckets = bucketByTicket(eligible, 1);
    if (buckets.size === 0) continue;

    // Existing ticket groups (title holds an ID), matched on every ID in the title or
    // its tabs' titles, so a lone "PR #1234" tab finds the "FE-3333" group it belongs to.
    const ticketGroups = (await chrome.tabGroups.query({ windowId }))
      .filter(g => extractTickets(g.title).length > 0)
      .map(g => ({
        group: g,
        ids: new Set([g.title, ...allTabs.filter(t => t.groupId === g.id).map(t => t.title)].flatMap(extractTickets))
      }));

    for (const [title, tabsInBucket] of buckets) {
      const tabIds = tabsInBucket.map(t => t.id);
      const ids = tabsInBucket.flatMap(t => extractTickets(t.title));
      const match = ticketGroups.find(e => ids.some(id => e.ids.has(id)));
      if (match) {
        await chrome.tabs.group({ tabIds, groupId: match.group.id });
        const merged = ticketTitle([...extractTickets(match.group.title), ...ids]);
        if (merged !== match.group.title) {
          await chrome.tabGroups.update(match.group.id, { title: merged });
          match.group.title = merged;
        }
        for (const id of ids) match.ids.add(id);
      } else if (tabsInBucket.length >= 2) {
        const newGroupId = await chrome.tabs.group({
          tabIds,
          createProperties: { windowId }
        });
        await chrome.tabGroups.update(newGroupId, {
          title,
          color: hashColor(extractTickets(title)[0]),
          collapsed: settings.autoCollapse === true
        });
      }
    }
  }
}

export async function runTriage(settings, opts = {}) {
  const windowIds = [];
  if (settings.scope === 'all') {
    const wins = await chrome.windows.getAll({ populate: false });
    for (const w of wins) windowIds.push(w.id);
  } else {
    const w = await chrome.windows.getCurrent();
    windowIds.push(w.id);
  }

  for (const windowId of windowIds) {
    const tabs = await collectGroupableTabs(windowId);
    // Merge mode buckets single tabs too: they may join an existing group; applyGroups
    // still holds new groups to the threshold.
    const buckets = bucketByDomain(tabs, opts.mergeMode === true ? 1 : settings.domainThreshold);
    await applyGroups(buckets, settings, windowId, opts);
    await reorderWindow(windowId, settings);
  }
}
