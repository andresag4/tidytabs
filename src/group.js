import { extractDomain, COLORS, hashColor, paletteColor, prettyName } from './domain.js';

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

export async function applyGroups(buckets, settings, windowId) {
  const domains = [...buckets.keys()].sort(); // stable order for palette indexing
  let paletteIndex = 0;
  for (const domain of domains) {
    const tabs = buckets.get(domain);
    const tabIds = tabs.map(t => t.id);
    const groupId = await chrome.tabs.group({
      tabIds,
      createProperties: { windowId }
    });
    const color = pickGroupColor(domain, paletteIndex, settings);
    await chrome.tabGroups.update(groupId, {
      title: prettyName(domain),
      color,
      collapsed: settings.autoCollapse === true
    });
    paletteIndex++;
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

export async function runTriage(settings) {
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
    const buckets = bucketByDomain(tabs, settings.domainThreshold);
    await applyGroups(buckets, settings, windowId);
    await reorderWindow(windowId, settings);
  }
}
