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

const MENU_ID = 'tidytabs.copyDomainUrls';
const MERGE_MENU_ID = 'tidytabs.triageMerge';

export function register() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: 'Copy URLs for this domain',
      contexts: ['action']
    });
    chrome.contextMenus.create({
      id: MERGE_MENU_ID,
      title: 'Tidy tabs (merge into existing)',
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
  if (info.menuItemId === MERGE_MENU_ID) {
    return handleTriageMerge();
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

async function handleTriageMerge() {
  try {
    const settings = await getSettings();
    await runTriage(settings, { mergeMode: true });
  } catch (e) {
    console.error('tidytabs: triage-merge failed', e);
  }
}
