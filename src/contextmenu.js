import { extractDomain, prettyName } from './domain.js';
import { copyText } from './clipboard.js';
import { runTriage } from './group.js';
import { getSettings } from './settings.js';

export function filterTabsByDomain(tabs, targetDomain) {
  if (!targetDomain) return [];
  const matching = [];
  for (const t of tabs) {
    if (!t || typeof t.url !== 'string' || t.url.length === 0) continue;
    if (extractDomain(t.url) !== targetDomain) continue;
    matching.push(t);
  }
  matching.sort((a, b) => (a.windowId - b.windowId) || (a.index - b.index));
  return matching.map(t => t.url);
}

export function filterTabIdsByDomain(tabs, targetDomain) {
  if (!targetDomain) return [];
  const matching = [];
  for (const t of tabs) {
    if (!t || typeof t.url !== 'string' || t.url.length === 0) continue;
    if (extractDomain(t.url) !== targetDomain) continue;
    matching.push(t);
  }
  matching.sort((a, b) => (a.windowId - b.windowId) || (a.index - b.index));
  return matching.map(t => t.id);
}

export function sortTabIdsByUrl(tabs) {
  const indexed = tabs.map((t, i) => ({ t, i }));
  indexed.sort((a, b) => {
    const ua = (a.t && typeof a.t.url === 'string') ? a.t.url : '';
    const ub = (b.t && typeof b.t.url === 'string') ? b.t.url : '';
    if (ua < ub) return -1;
    if (ua > ub) return 1;
    return a.i - b.i; // stable for ties
  });
  return indexed.map(x => x.t.id);
}

export function sortTabIdsByAge(tabs) {
  const indexed = tabs.map((t, i) => ({ t, i }));
  indexed.sort((a, b) => {
    const la = (a.t && typeof a.t.lastAccessed === 'number') ? a.t.lastAccessed : 0;
    const lb = (b.t && typeof b.t.lastAccessed === 'number') ? b.t.lastAccessed : 0;
    if (la !== lb) return la - lb;
    return a.i - b.i; // stable for ties
  });
  return indexed.map(x => x.t.id);
}

const MENU_ID = 'tidytabs.copyDomainUrls';
const RELOAD_MENU_ID = 'tidytabs.reloadDomain';
const MERGE_MENU_ID = 'tidytabs.triageMerge';
const SORT_MENU_ID = 'tidytabs.sortGroupByUrl';
const SORT_AGE_MENU_ID = 'tidytabs.sortGroupByAge';
const MOVE_TO_NEW_WINDOW_MENU_ID = 'tidytabs.moveGroupToNewWindow';
const SORT_ALL_URL_MENU_ID = 'tidytabs.sortAllGroupsByUrl';
const SORT_ALL_AGE_MENU_ID = 'tidytabs.sortAllGroupsByAge';
const COLLAPSE_ALL_MENU_ID = 'tidytabs.collapseAllGroups';
const EXPAND_ALL_MENU_ID = 'tidytabs.expandAllGroups';
const TAB_MOVE_TO_GROUP_MENU_ID = 'tidytabs.tabMoveToDomainGroup';
const TAB_CLOSE_OTHERS_MENU_ID = 'tidytabs.tabCloseOthersOnDomain';

export function register() {
  chrome.contextMenus.removeAll(() => {
    // Toolbar action menu — items 1 and 2 (existing)
    chrome.contextMenus.create({
      id: MENU_ID,
      title: 'Copy URLs for this domain',
      contexts: ['action']
    });
    chrome.contextMenus.create({
      id: RELOAD_MENU_ID,
      title: 'Force reload all tabs with this domain',
      contexts: ['action']
    });
    chrome.contextMenus.create({
      id: 'tidytabs.sep1', type: 'separator', contexts: ['action']
    });

    // Group create / extract
    chrome.contextMenus.create({
      id: MERGE_MENU_ID,
      title: 'Tidy tabs (merge into existing)',
      contexts: ['action']
    });
    chrome.contextMenus.create({
      id: MOVE_TO_NEW_WINDOW_MENU_ID,
      title: 'Move this group to a new window',
      contexts: ['action']
    });
    chrome.contextMenus.create({
      id: 'tidytabs.sep2', type: 'separator', contexts: ['action']
    });

    // Sort items
    chrome.contextMenus.create({
      id: SORT_MENU_ID,
      title: 'Sort current group tabs alphabetically by URL',
      contexts: ['action']
    });
    chrome.contextMenus.create({
      id: SORT_AGE_MENU_ID,
      title: 'Sort current group tabs by age (oldest first)',
      contexts: ['action']
    });
    chrome.contextMenus.create({
      id: SORT_ALL_URL_MENU_ID,
      title: 'Sort all groups alphabetically by URL',
      contexts: ['action']
    });
    chrome.contextMenus.create({
      id: SORT_ALL_AGE_MENU_ID,
      title: 'Sort all groups by age (oldest first)',
      contexts: ['action']
    });
    chrome.contextMenus.create({
      id: 'tidytabs.sep3', type: 'separator', contexts: ['action']
    });

    // Bulk collapse
    chrome.contextMenus.create({
      id: COLLAPSE_ALL_MENU_ID,
      title: 'Collapse all groups',
      contexts: ['action']
    });
    chrome.contextMenus.create({
      id: EXPAND_ALL_MENU_ID,
      title: 'Expand all groups',
      contexts: ['action']
    });

    // Tab strip right-click menu — separate surface
    chrome.contextMenus.create({
      id: TAB_MOVE_TO_GROUP_MENU_ID,
      title: 'Move tab to its domain group',
      contexts: ['tab']
    });
    chrome.contextMenus.create({
      id: TAB_CLOSE_OTHERS_MENU_ID,
      title: 'Close all other tabs on this domain',
      contexts: ['tab']
    });
  });

  if (!register._listenerInstalled) {
    chrome.contextMenus.onClicked.addListener(handleClick);
    register._listenerInstalled = true;
  }
}

async function handleClick(info, tab) {
  switch (info.menuItemId) {
    case MENU_ID: return handleCopyUrls();
    case RELOAD_MENU_ID: return handleReloadDomain();
    case MERGE_MENU_ID: return handleTriageMerge();
    case SORT_MENU_ID: return handleSortGroupByUrl();
    case SORT_AGE_MENU_ID: return handleSortGroupByAge();
    case MOVE_TO_NEW_WINDOW_MENU_ID: return handleMoveGroupToNewWindow();
    case SORT_ALL_URL_MENU_ID: return handleSortAllGroupsByUrl();
    case SORT_ALL_AGE_MENU_ID: return handleSortAllGroupsByAge();
    case COLLAPSE_ALL_MENU_ID: return handleCollapseOrExpandAll(true);
    case EXPAND_ALL_MENU_ID: return handleCollapseOrExpandAll(false);
    case TAB_MOVE_TO_GROUP_MENU_ID: return handleTabMoveToDomainGroup(tab);
    case TAB_CLOSE_OTHERS_MENU_ID: return handleTabCloseOthersOnDomain(tab);
  }
}

async function handleCopyUrls() {
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!activeTab || !activeTab.url) return;
    const domain = extractDomain(activeTab.url);
    if (!domain) return;
    const allTabs = await chrome.tabs.query({});
    const urls = filterTabsByDomain(allTabs, domain);
    if (urls.length === 0) return;
    await copyText(urls.join('\n'));
  } catch (e) {
    console.error('tidytabs: copy-domain-urls failed', e);
  }
}

async function handleReloadDomain() {
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!activeTab || !activeTab.url) return;
    const domain = extractDomain(activeTab.url);
    if (!domain) return;
    const allTabs = await chrome.tabs.query({});
    const tabIds = filterTabIdsByDomain(allTabs, domain);
    for (const id of tabIds) {
      try {
        await chrome.tabs.reload(id, { bypassCache: true });
      } catch (e) {
        console.error('tidytabs: reload failed for tab', id, e);
      }
    }
  } catch (e) {
    console.error('tidytabs: force-reload-domain failed', e);
  }
}

async function handleTriageMerge() {
  try {
    const settings = await getSettings();
    await runTriage(settings, { mergeMode: true });
  } catch (e) {
    console.error('tidytabs: triage-merge failed', e);
  }
}

async function handleSortGroupByUrl() {
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!activeTab) return;
    const gid = activeTab.groupId;
    if (gid === undefined || gid === -1) return;
    const tabsInGroup = await chrome.tabs.query({ groupId: gid });
    if (tabsInGroup.length < 2) return;
    const startIndex = Math.min(...tabsInGroup.map(t => t.index));
    const sortedIds = sortTabIdsByUrl(tabsInGroup);
    await chrome.tabs.move(sortedIds, { index: startIndex });
  } catch (e) {
    console.error('tidytabs: sort-group-by-url failed', e);
  }
}

async function handleSortGroupByAge() {
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!activeTab) return;
    const gid = activeTab.groupId;
    if (gid === undefined || gid === -1) return;
    const tabsInGroup = await chrome.tabs.query({ groupId: gid });
    if (tabsInGroup.length < 2) return;
    const startIndex = Math.min(...tabsInGroup.map(t => t.index));
    const sortedIds = sortTabIdsByAge(tabsInGroup);
    await chrome.tabs.move(sortedIds, { index: startIndex });
  } catch (e) {
    console.error('tidytabs: sort-group-by-age failed', e);
  }
}

async function handleMoveGroupToNewWindow() {
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!activeTab) return;
    const gid = activeTab.groupId;
    if (gid === undefined || gid === -1) return;

    const tabsInGroup = (await chrome.tabs.query({ groupId: gid })).sort((a, b) => a.index - b.index);
    if (tabsInGroup.length === 0) return;
    const groupInfo = await chrome.tabGroups.get(gid);

    const tabIds = tabsInGroup.map(t => t.id);
    const newWindow = await chrome.windows.create({ tabId: tabIds[0] });
    if (tabIds.length > 1) {
      await chrome.tabs.move(tabIds.slice(1), { windowId: newWindow.id, index: -1 });
    }
    const newGroupId = await chrome.tabs.group({
      tabIds,
      createProperties: { windowId: newWindow.id }
    });
    await chrome.tabGroups.update(newGroupId, {
      title: groupInfo.title,
      color: groupInfo.color,
      collapsed: groupInfo.collapsed
    });
  } catch (e) {
    console.error('tidytabs: move-group-to-new-window failed', e);
  }
}

async function handleSortAllGroupsByUrl() {
  return sortAllGroups(sortTabIdsByUrl);
}

async function handleSortAllGroupsByAge() {
  return sortAllGroups(sortTabIdsByAge);
}

async function sortAllGroups(sortFn) {
  try {
    const w = await chrome.windows.getCurrent();
    const groups = await chrome.tabGroups.query({ windowId: w.id });
    for (const g of groups) {
      const tabs = await chrome.tabs.query({ groupId: g.id });
      if (tabs.length < 2) continue;
      const startIndex = Math.min(...tabs.map(t => t.index));
      const sortedIds = sortFn(tabs);
      await chrome.tabs.move(sortedIds, { index: startIndex });
    }
  } catch (e) {
    console.error('tidytabs: sort-all-groups failed', e);
  }
}

async function handleCollapseOrExpandAll(collapsed) {
  try {
    const w = await chrome.windows.getCurrent();
    const groups = await chrome.tabGroups.query({ windowId: w.id });
    for (const g of groups) {
      await chrome.tabGroups.update(g.id, { collapsed });
    }
  } catch (e) {
    console.error('tidytabs: collapse-or-expand-all failed', e);
  }
}

async function handleTabMoveToDomainGroup(tab) {
  try {
    if (!tab || !tab.url) return;
    const domain = extractDomain(tab.url);
    if (!domain) return;
    const title = prettyName(domain);
    const groups = await chrome.tabGroups.query({ windowId: tab.windowId });
    const match = groups.find(g => g.title === title);
    if (!match) return;
    await chrome.tabs.group({ tabIds: [tab.id], groupId: match.id });
  } catch (e) {
    console.error('tidytabs: tab-move-to-domain-group failed', e);
  }
}

async function handleTabCloseOthersOnDomain(tab) {
  try {
    if (!tab || !tab.url) return;
    const domain = extractDomain(tab.url);
    if (!domain) return;
    const allTabs = await chrome.tabs.query({});
    const toClose = allTabs
      .filter(t => t.id !== tab.id)
      .filter(t => typeof t.url === 'string' && extractDomain(t.url) === domain)
      .map(t => t.id);
    if (toClose.length === 0) return;
    await chrome.tabs.remove(toClose);
  } catch (e) {
    console.error('tidytabs: tab-close-others-on-domain failed', e);
  }
}
