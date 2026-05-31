// Offscreen documents are never focused, so navigator.clipboard.writeText()
// throws "Document is not focused". Use a <textarea> + execCommand('copy'),
// which works without focus (Chrome's canonical offscreen-clipboard pattern).
console.log('tidytabs offscreen: handler v2 (execCommand) loaded');
const textEl = document.getElementById('clipboard');

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'tidytabs:copy') return false;
  try {
    textEl.value = String(message.text ?? '');
    textEl.focus();
    textEl.select();
    const ok = document.execCommand('copy');
    if (!ok) throw new Error('execCommand("copy") returned false');
    sendResponse({ ok: true });
  } catch (e) {
    // Log the real reason (name + message) instead of "[object DOMException]"
    console.error('tidytabs offscreen: clipboard write failed:', e?.name, '-', e?.message, e);
    sendResponse({ ok: false, error: `${e?.name}: ${e?.message}` });
  } finally {
    textEl.value = '';
  }
  return true; // keep the message channel open for sendResponse
});
