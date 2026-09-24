import { extractDomain } from './domain.js';
import { runTriage, runTicketTriage } from './group.js';
import { getSettings } from './settings.js';
import { copyText } from './clipboard.js';
import {
  filterTabsByDomain,
  filterTabIdsByDomain
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

async function forceReload(tabIds) {
  for (const id of tabIds) {
    try {
      await chrome.tabs.reload(id, { bypassCache: true });
    } catch (e) {
      console.error('tidytabs: reload failed for tab', id, e);
    }
  }
}

export async function handleReloadDomain() {
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!activeTab || !activeTab.url) return;
    const domain = extractDomain(activeTab.url);
    if (!domain) return;
    const allTabs = await chrome.tabs.query({});
    await forceReload(filterTabIdsByDomain(allTabs, domain));
  } catch (e) {
    console.error('tidytabs: force-reload-domain failed', e);
  }
}

// Tabs of the active tab's group, in tab-strip order; [] when not in a group.
async function activeGroupTabs() {
  const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!activeTab || activeTab.groupId === undefined || activeTab.groupId === -1) return [];
  const tabs = await chrome.tabs.query({ groupId: activeTab.groupId });
  return tabs.sort((a, b) => a.index - b.index);
}

export async function handleCopyGroupUrls() {
  try {
    const urls = (await activeGroupTabs()).map(t => t.url).filter(Boolean);
    if (urls.length === 0) return;
    await copyText(urls.join('\n'));
  } catch (e) {
    console.error('tidytabs: copy-group-urls failed', e);
  }
}

export async function handleReloadGroup() {
  try {
    await forceReload((await activeGroupTabs()).map(t => t.id));
  } catch (e) {
    console.error('tidytabs: force-reload-group failed', e);
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

export async function handleCollapseOrExpandAll(collapsed) {
  try {
    const w = await chrome.windows.getCurrent();
    const [activeTab] = await chrome.tabs.query({ active: true, windowId: w.id });
    const groups = await chrome.tabGroups.query({ windowId: w.id });
    for (const g of groups) {
      if (activeTab && g.id === activeTab.groupId) continue; // leave the group we're in alone
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
