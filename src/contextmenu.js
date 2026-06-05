import { extractDomain, prettyName } from './domain.js';

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
    return a.i - b.i;
  });
  return indexed.map(x => x.t.id);
}

export function sortTabIdsByAge(tabs) {
  const indexed = tabs.map((t, i) => ({ t, i }));
  indexed.sort((a, b) => {
    const la = (a.t && typeof a.t.lastAccessed === 'number') ? a.t.lastAccessed : 0;
    const lb = (b.t && typeof b.t.lastAccessed === 'number') ? b.t.lastAccessed : 0;
    if (la !== lb) return la - lb;
    return a.i - b.i;
  });
  return indexed.map(x => x.t.id);
}

const TAB_MOVE_TO_GROUP_MENU_ID = 'tidytabs.tabMoveToDomainGroup';
const TAB_CLOSE_OTHERS_MENU_ID = 'tidytabs.tabCloseOthersOnDomain';

export function register() {
  chrome.contextMenus.removeAll(() => {
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
  if (info.menuItemId === TAB_MOVE_TO_GROUP_MENU_ID) return handleTabMoveToDomainGroup(tab);
  if (info.menuItemId === TAB_CLOSE_OTHERS_MENU_ID) return handleTabCloseOthersOnDomain(tab);
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
