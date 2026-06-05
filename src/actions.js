import { extractDomain, prettyName } from './domain.js';
import { runTriage, runTicketTriage } from './group.js';
import { getSettings } from './settings.js';
import { copyText } from './clipboard.js';
import {
  filterTabsByDomain,
  filterTabIdsByDomain,
  sortTabIdsByUrl,
  sortTabIdsByAge
} from './contextmenu.js';

export async function handleTidy() {
  try {
    const settings = await getSettings();
    await runTriage(settings);
  } catch (e) {
    console.error('tidytabs: tidy failed', e);
  }
}

export async function handleCopyUrls() {
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

export async function handleReloadDomain() {
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

export async function handleTriageMerge() {
  try {
    const settings = await getSettings();
    await runTriage(settings, { mergeMode: true });
  } catch (e) {
    console.error('tidytabs: triage-merge failed', e);
  }
}

export async function handleSortGroupByUrl() {
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

export async function handleSortGroupByAge() {
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

export async function handleMoveGroupToNewWindow() {
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

export async function handleSortAllGroupsByUrl() {
  return sortAllGroups(sortTabIdsByUrl);
}

export async function handleSortAllGroupsByAge() {
  return sortAllGroups(sortTabIdsByAge);
}

export async function handleCollapseOrExpandAll(collapsed) {
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

export async function handleTicketTriage() {
  try {
    const settings = await getSettings();
    await runTicketTriage(settings);
  } catch (e) {
    console.error('tidytabs: ticket-triage failed', e);
  }
}

export async function handleTogglePasswordVisibility() {
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!activeTab || !activeTab.id) return;
    if (typeof activeTab.url !== 'string' || !/^https?:\/\//.test(activeTab.url)) return;
    await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      func: () => {
        const passwords = document.querySelectorAll('input[type="password"]');
        if (passwords.length > 0) {
          passwords.forEach(i => {
            i.type = 'text';
            i.setAttribute('data-tidytabs-was-password', 'true');
          });
          return { revealed: passwords.length, restored: 0 };
        }
        const previouslyRevealed = document.querySelectorAll('input[data-tidytabs-was-password]');
        previouslyRevealed.forEach(i => {
          i.type = 'password';
          i.removeAttribute('data-tidytabs-was-password');
        });
        return { revealed: 0, restored: previouslyRevealed.length };
      }
    });
  } catch (e) {
    console.error('tidytabs: toggle-password-visibility failed', e);
  }
}

export async function handleMoveActiveTabToDomainGroup() {
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!activeTab || !activeTab.url) return;
    const domain = extractDomain(activeTab.url);
    if (!domain) return;
    const title = prettyName(domain);
    const groups = await chrome.tabGroups.query({ windowId: activeTab.windowId });
    const match = groups.find(g => g.title === title);
    if (!match) return;
    await chrome.tabs.group({ tabIds: [activeTab.id], groupId: match.id });
  } catch (e) {
    console.error('tidytabs: move-active-tab-to-domain-group failed', e);
  }
}

export async function handleCloseOthersOnActiveTabDomain() {
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!activeTab || !activeTab.url) return;
    const domain = extractDomain(activeTab.url);
    if (!domain) return;
    const allTabs = await chrome.tabs.query({});
    const toClose = allTabs
      .filter(t => t.id !== activeTab.id)
      .filter(t => typeof t.url === 'string' && extractDomain(t.url) === domain)
      .map(t => t.id);
    if (toClose.length === 0) return;
    await chrome.tabs.remove(toClose);
  } catch (e) {
    console.error('tidytabs: close-others-on-active-tab-domain failed', e);
  }
}
