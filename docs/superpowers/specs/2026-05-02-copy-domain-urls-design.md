# Copy URLs for this domain — feature spec

**Status:** Design approved 2026-05-02
**Type:** Additive feature for the existing tidytabs Chrome extension
**Parent spec:** [2026-05-02-tab-triage-design.md](2026-05-02-tab-triage-design.md)

## Goal

One-click extraction of every open tab's URL on a specific domain, copied to the system clipboard, ready to paste into Claude or anywhere else.

Use case: "I have 20 GitHub PRs open and I want to dump the URLs into a Claude conversation."

## Non-goals

- No format options (just newline-separated URLs — no markdown, no titles, no JSON).
- No UI confirmation (no toast, no badge, no notification). Clipboard is the confirmation.
- No history of past copies.
- No selection of which matching tabs to include — it's all-of-them, full stop.
- No keyboard shortcut in v1.

## Behavior

### Trigger

Right-click the tidytabs toolbar icon. The action context menu now contains a new item: **"Copy URLs for this domain"** (next to the existing "Options" entry, which Chrome adds automatically).

### Action sequence

1. Identify the active tab in the currently focused window.
2. Extract its domain using the existing `extractDomain` from `src/domain.js`.
3. If the active tab has no extractable domain (chrome://, file://, view-source:, malformed URL, no URL yet) → silent no-op.
4. Query all tabs across all windows in the current profile (`chrome.tabs.query({})`).
5. Filter to tabs whose `extractDomain(tab.url)` equals the active tab's domain.
6. Sort filtered tabs by `(windowId, index)` for a stable, intuitive order.
7. Map to URLs, join with `\n`.
8. Write the joined string to the system clipboard.

### Edge cases

- **Active tab is on an ungroupable URL** (chrome://, file://, etc.) → no-op. Menu click does nothing visible.
- **Some matching tabs are still loading and have no URL** → skipped (filtered out before the join).
- **No matching tabs other than the active one** → still copies the active tab's URL. (Trivial case but defined.)
- **`navigator.clipboard.writeText` throws** (rare; e.g. user denied clipboard permission in some future Chrome) → logged to console; no user-facing error.
- **Offscreen API unavailable** (Chrome <109) → console warning, silent fail. tidytabs targets modern Chrome.

## Permissions delta

Added to `manifest.json`:

- `contextMenus` — to register the right-click item.
- `clipboardWrite` — to write to the clipboard from the offscreen document.
- `offscreen` — to create the offscreen document that owns the clipboard call.

No new host permissions.

## Architecture

MV3 service workers cannot call `navigator.clipboard.writeText` directly (no DOM, no user-gesture context). The standard workaround is the **offscreen document API**: the service worker creates an invisible DOM document that owns the clipboard call and posts back acknowledgement.

### New files

| Path | Responsibility |
|---|---|
| `src/contextmenu.js` | Pure: `filterTabsByDomain(tabs, domain) → urls[]`. Wrapper: `register()` registers the menu item and click handler. |
| `src/clipboard.js` | Wrapper: `copyText(text)` — ensures an offscreen document exists, sends a message to it with the text, awaits ack, closes the document. |
| `offscreen.html` | Minimal HTML hosting `src/offscreen.js`. No visible content. |
| `src/offscreen.js` | Listens for `chrome.runtime.onMessage` with `{ type: 'copy', text }`, calls `navigator.clipboard.writeText(text)`, replies with `{ ok: true }` or `{ ok: false, error }`. |

### Modified files

| Path | Change |
|---|---|
| `manifest.json` | Add `contextMenus`, `clipboardWrite`, `offscreen` to `permissions`. |
| `src/background.js` | Import `register` from `contextmenu.js` and call it inside both `chrome.runtime.onInstalled` and the top-level (so the menu is present after service worker restart). |

### Module boundaries

- `contextmenu.js` exports a pure helper `filterTabsByDomain` (unit-testable) and an integration `register` (manual-test only).
- `clipboard.js` is a thin wrapper around `chrome.offscreen` and `chrome.runtime.sendMessage`. Not unit-tested.
- `offscreen.js` runs in the offscreen document — receives a message, writes to clipboard, replies. Tiny.
- Reuses `extractDomain` from `src/domain.js` — no duplication.

### Why an offscreen document and not content-script injection?

Two alternatives considered:

- **Inject a content script into the active tab** to do the clipboard write. Rejected: fails when the active tab is `chrome://` or `chrome-extension://` (where scripting is forbidden), which is exactly the case we'd want to silently no-op anyway. But it also fails when the active tab's domain is `chrome://settings` while the *URLs being copied* are from other tabs — wrong tab handling the write. Brittle.
- **Inject into a benign tab** (e.g., any http(s) tab). Hidden coupling between unrelated tabs. Brittle.

Offscreen document is the documented Chrome MV3 way and has zero coupling to which tabs are open.

## Testing

### Unit tests (`test/contextmenu.test.js`)

Cover `filterTabsByDomain`:
- Returns only tabs whose domain matches.
- Returns URLs (not Tab objects).
- Preserves `(windowId, index)` order.
- Skips tabs with no URL (loading).
- Skips tabs whose URL has no extractable domain (chrome://, file://).
- Empty input → empty output.

No tests for the integration pieces (`register`, `clipboard.copyText`, `offscreen.js`) — covered by manual smoke test.

### Manual smoke test

1. **Happy path:** Open 5 github.com tabs across 2 windows. Right-click the tidytabs toolbar icon → "Copy URLs for this domain". Paste somewhere → all 5 URLs appear, one per line.
2. **Active tab is the trigger:** The tab you have focused decides the domain. Switch to a youtube.com tab and run the action → only youtube URLs.
3. **chrome:// active tab:** Focus a `chrome://settings` tab and run the action → nothing happens (clipboard unchanged).
4. **Loading tab:** Open a slow page; before it finishes loading, run the action. → That tab's URL is included if Chrome has it, skipped if not. No error.
5. **Single tab:** Only one tab on the domain. → Just that one URL is copied.
6. **Clipboard sanity:** After copying, the previous clipboard contents are overwritten. (Standard.)

## Out of scope (future ideas)

- Format options (markdown, with titles, etc.) — defer until needed.
- Keyboard shortcut.
- Copy URLs of all tabs in a *group* (not domain). Different mental model; revisit later.
- Filter by URL substring / path.
