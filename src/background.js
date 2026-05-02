import { runTriage } from './group.js';
import { getSettings } from './settings.js';

chrome.action.onClicked.addListener(async () => {
  try {
    const settings = await getSettings();
    await runTriage(settings);
  } catch (e) {
    console.error('tidytabs: triage failed', e);
  }
});
