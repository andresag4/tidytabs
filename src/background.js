import { runTriage } from './group.js';
import { getSettings } from './settings.js';
import { register as registerContextMenu } from './contextmenu.js';

chrome.action.onClicked.addListener(async () => {
  try {
    const settings = await getSettings();
    await runTriage(settings);
  } catch (e) {
    console.error('tidytabs: triage failed', e);
  }
});

// Register the right-click menu both on install (one-time) and on every
// service worker startup (after restart, since menus are not persisted).
chrome.runtime.onInstalled.addListener(() => registerContextMenu());
chrome.runtime.onStartup.addListener(() => registerContextMenu());
registerContextMenu();
