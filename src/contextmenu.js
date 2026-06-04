import { extractDomain } from './domain.js';
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

export function register() {
  chrome.contextMenus.removeAll(() => {
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
      id: MERGE_MENU_ID,
      title: 'Tidy tabs (merge into existing)',
      contexts: ['action']
    });
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
  });

  if (!register._listenerInstalled) {
    chrome.contextMenus.onClicked.addListener(handleClick);
    register._listenerInstalled = true;
  }
}

async function handleClick(info) {
  if (info.menuItemId === MENU_ID) {
    return handleCopyUrls();
  }
  if (info.menuItemId === RELOAD_MENU_ID) {
    return handleReloadDomain();
  }
  if (info.menuItemId === MERGE_MENU_ID) {
    return handleTriageMerge();
  }
  if (info.menuItemId === SORT_MENU_ID) {
    return handleSortGroupByUrl();
  }
  if (info.menuItemId === SORT_AGE_MENU_ID) {
    return handleSortGroupByAge();
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
