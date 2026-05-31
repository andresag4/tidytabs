chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'tidytabs:copy') return false;
  (async () => {
    try {
      await navigator.clipboard.writeText(String(message.text ?? ''));
      sendResponse({ ok: true });
    } catch (e) {
      console.error('tidytabs offscreen: clipboard write failed', e);
      sendResponse({ ok: false, error: String(e) });
    }
  })();
  return true; // keep the message channel open for async sendResponse
});
