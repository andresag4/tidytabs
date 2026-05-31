// Manages the offscreen document used to call navigator.clipboard.writeText
// from an MV3 service worker context (which has no DOM of its own).

const OFFSCREEN_PATH = 'offscreen.html';

async function hasOffscreenDocument() {
  if (!chrome.runtime.getContexts) return false; // older Chrome
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });
  return contexts.length > 0;
}

async function ensureOffscreenDocument() {
  if (await hasOffscreenDocument()) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: ['CLIPBOARD'],
    justification: 'Write the user-triggered URL list to the system clipboard.'
  });
}

export async function copyText(text) {
  if (typeof chrome === 'undefined' || !chrome.offscreen) {
    console.warn('tidytabs: offscreen API unavailable; clipboard copy skipped');
    return false;
  }
  await ensureOffscreenDocument();
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'tidytabs:copy',
      text: String(text ?? '')
    });
    if (!response || response.ok !== true) {
      console.error('tidytabs: offscreen clipboard write reported failure', response);
      return false;
    }
    return true;
  } finally {
    // Close the offscreen document so it isn't kept alive between rare clicks.
    try { await chrome.offscreen.closeDocument(); } catch { /* ignore */ }
  }
}
