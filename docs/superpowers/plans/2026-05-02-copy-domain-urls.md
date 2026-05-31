# Copy URLs for this domain — implementation plan

> **For agentic workers:** Execute task-by-task. Each task ends with a commit using the exact commit message shown.

**Goal:** Add a "Copy URLs for this domain" right-click menu item on the tidytabs toolbar icon. Clicking it copies all open URLs (across all windows) matching the active tab's domain to the clipboard.

**Architecture:** A context menu registered at extension startup, a pure tab-filter function (unit-tested), and an offscreen-document helper to write to the clipboard from MV3.

**Spec:** [docs/superpowers/specs/2026-05-02-copy-domain-urls-design.md](../specs/2026-05-02-copy-domain-urls-design.md)

---

## File Structure

| Path | New / Modify | Responsibility |
|---|---|---|
| `manifest.json` | Modify | Add 3 permissions |
| `src/contextmenu.js` | New | `filterTabsByDomain` (pure) + `register` (chrome.contextMenus integration) |
| `src/clipboard.js` | New | `copyText` — manages offscreen doc lifecycle |
| `offscreen.html` | New | Empty host page for the offscreen worker |
| `src/offscreen.js` | New | Receives message, writes to clipboard, replies |
| `src/background.js` | Modify | Call `register()` from contextmenu.js on install + startup |
| `test/contextmenu.test.js` | New | Unit tests for `filterTabsByDomain` |

---

## Tasks

### Task 1: Manifest update — permissions and offscreen reason

**Files:** Modify `manifest.json`

- [ ] **Step 1: Add permissions**

Update `permissions` array in `manifest.json`:

```json
"permissions": ["tabs", "tabGroups", "storage", "contextMenus", "clipboardWrite", "offscreen"]
```

- [ ] **Step 2: Verify the rest of the manifest is untouched**

The full manifest should look like:

```json
{
  "manifest_version": 3,
  "name": "tidytabs",
  "version": "0.1.0",
  "description": "Group your tabs by domain in one click.",
  "permissions": ["tabs", "tabGroups", "storage", "contextMenus", "clipboardWrite", "offscreen"],
  "icons": {
    "16": "icons/16.png",
    "32": "icons/32.png",
    "48": "icons/48.png",
    "128": "icons/128.png"
  },
  "background": {
    "service_worker": "src/background.js",
    "type": "module"
  },
  "action": {
    "default_title": "Tidy tabs",
    "default_icon": {
      "16": "icons/16.png",
      "32": "icons/32.png",
      "48": "icons/48.png",
      "128": "icons/128.png"
    }
  },
  "options_page": "options.html"
}
```

- [ ] **Step 3: Commit**

```bash
git add manifest.json
git commit -m "feat: add contextMenus, clipboardWrite, offscreen permissions"
```

---

### Task 2: `contextmenu.js` — `filterTabsByDomain` (TDD)

**Files:** Create `test/contextmenu.test.js`, create `src/contextmenu.js`

- [ ] **Step 1: Write the failing test**

`test/contextmenu.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterTabsByDomain } from '../src/contextmenu.js';

const tab = (id, url, opts = {}) => ({
  id, url,
  windowId: opts.windowId ?? 1,
  index: opts.index ?? id
});

test('filterTabsByDomain: returns URLs matching the domain', () => {
  const tabs = [
    tab(1, 'https://github.com/a'),
    tab(2, 'https://github.com/b'),
    tab(3, 'https://youtube.com/x')
  ];
  assert.deepEqual(filterTabsByDomain(tabs, 'github.com'), [
    'https://github.com/a',
    'https://github.com/b'
  ]);
});

test('filterTabsByDomain: matches by registrable domain, not full host', () => {
  const tabs = [
    tab(1, 'https://github.com/a'),
    tab(2, 'https://api.github.com/b'),
    tab(3, 'https://docs.github.com/c')
  ];
  assert.deepEqual(filterTabsByDomain(tabs, 'github.com'), [
    'https://github.com/a',
    'https://api.github.com/b',
    'https://docs.github.com/c'
  ]);
});

test('filterTabsByDomain: skips tabs with no URL', () => {
  const tabs = [
    tab(1, 'https://github.com/a'),
    tab(2, ''),
    tab(3, undefined),
    tab(4, 'https://github.com/d')
  ];
  assert.deepEqual(filterTabsByDomain(tabs, 'github.com'), [
    'https://github.com/a',
    'https://github.com/d'
  ]);
});

test('filterTabsByDomain: skips tabs with ungroupable URLs', () => {
  const tabs = [
    tab(1, 'https://github.com/a'),
    tab(2, 'chrome://settings/'),
    tab(3, 'file:///x/y')
  ];
  assert.deepEqual(filterTabsByDomain(tabs, 'github.com'), [
    'https://github.com/a'
  ]);
});

test('filterTabsByDomain: sorts by (windowId, index)', () => {
  const tabs = [
    tab(3, 'https://github.com/c', { windowId: 2, index: 0 }),
    tab(1, 'https://github.com/a', { windowId: 1, index: 5 }),
    tab(2, 'https://github.com/b', { windowId: 1, index: 2 })
  ];
  assert.deepEqual(filterTabsByDomain(tabs, 'github.com'), [
    'https://github.com/b',  // win 1, idx 2
    'https://github.com/a',  // win 1, idx 5
    'https://github.com/c'   // win 2, idx 0
  ]);
});

test('filterTabsByDomain: empty input returns empty array', () => {
  assert.deepEqual(filterTabsByDomain([], 'github.com'), []);
});

test('filterTabsByDomain: no matches returns empty array', () => {
  const tabs = [tab(1, 'https://github.com/a')];
  assert.deepEqual(filterTabsByDomain(tabs, 'youtube.com'), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `src/contextmenu.js` not found.

- [ ] **Step 3: Implement `filterTabsByDomain`**

`src/contextmenu.js`:

```js
import { extractDomain } from './domain.js';

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — all 7 new tests + 43 existing = 50 tests.

- [ ] **Step 5: Commit**

```bash
git add src/contextmenu.js test/contextmenu.test.js
git commit -m "feat(contextmenu): filterTabsByDomain"
```

---

### Task 3: `offscreen.html` + `src/offscreen.js`

**Files:** Create `offscreen.html`, create `src/offscreen.js`

- [ ] **Step 1: Write `offscreen.html`**

`offscreen.html`:

```html
<!doctype html>
<html>
<head><meta charset="utf-8" /><title>tidytabs offscreen</title></head>
<body>
  <script type="module" src="src/offscreen.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `src/offscreen.js`**

`src/offscreen.js`:

```js
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
```

- [ ] **Step 3: Confirm tests still pass (no new tests for this part)**

Run: `npm test`
Expected: PASS — 50 tests, unchanged.

- [ ] **Step 4: Commit**

```bash
git add offscreen.html src/offscreen.js
git commit -m "feat: offscreen document for clipboard writes"
```

---

### Task 4: `src/clipboard.js` — offscreen lifecycle + `copyText`

**Files:** Create `src/clipboard.js`

- [ ] **Step 1: Write `src/clipboard.js`**

`src/clipboard.js`:

```js
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
```

- [ ] **Step 2: Confirm tests still pass**

Run: `npm test`
Expected: PASS — 50 tests.

- [ ] **Step 3: Commit**

```bash
git add src/clipboard.js
git commit -m "feat(clipboard): copyText via offscreen document"
```

---

### Task 5: `contextmenu.js` — `register` (menu item + click handler)

**Files:** Modify `src/contextmenu.js`

- [ ] **Step 1: Append `register` and the click handler**

Append to `src/contextmenu.js`:

```js
import { copyText } from './clipboard.js';

const MENU_ID = 'tidytabs.copyDomainUrls';

export function register() {
  // Recreate fresh each time (handles SW restart cleanly).
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: 'Copy URLs for this domain',
      contexts: ['action']
    });
  });

  if (!register._listenerInstalled) {
    chrome.contextMenus.onClicked.addListener(handleClick);
    register._listenerInstalled = true;
  }
}

async function handleClick(info) {
  if (info.menuItemId !== MENU_ID) return;
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
```

> **Note on imports:** `extractDomain` is already imported at the top of the file from Task 2. Do NOT add a second `import { extractDomain }` line — the existing one is reused.

- [ ] **Step 2: Confirm tests still pass**

Run: `npm test`
Expected: PASS — `filterTabsByDomain` tests still pass; the new `register` and `handleClick` are integration-only (not unit tested).

- [ ] **Step 3: Commit**

```bash
git add src/contextmenu.js
git commit -m "feat(contextmenu): register menu item and click handler"
```

---

### Task 6: `background.js` — wire up `register()`

**Files:** Modify `src/background.js`

- [ ] **Step 1: Read current background.js**

It currently looks like:

```js
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
```

- [ ] **Step 2: Add the contextmenu wiring**

Update `src/background.js` to:

```js
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
```

> The top-level `registerContextMenu()` call covers the case where the SW restarts mid-session (neither onInstalled nor onStartup fires); `register()` is idempotent because it calls `chrome.contextMenus.removeAll` first.

- [ ] **Step 3: Confirm tests still pass**

Run: `npm test`
Expected: PASS — 50 tests.

- [ ] **Step 4: Commit**

```bash
git add src/background.js
git commit -m "feat: wire context menu into background service worker"
```

---

### Task 7: Manual smoke test

**Files:** None modified.

- [ ] **Step 1: Reload the unpacked extension**

In `chrome://extensions`, click the reload icon next to tidytabs. Confirm no errors appear in the "Errors" link.

- [ ] **Step 2: Happy path — multiple windows**

1. Open 4 github.com tabs in window A and 3 github.com tabs in window B.
2. Focus any GitHub tab in either window.
3. Right-click the tidytabs toolbar icon. A "Copy URLs for this domain" item should appear above or below "Options".
4. Click it.
5. Paste somewhere (e.g., a new note or text field).
6. Expected: All 7 URLs appear, one per line, in (windowId, index) order.

- [ ] **Step 3: Active-tab decides the domain**

1. Open tabs across github.com, youtube.com, and reddit.com.
2. Focus a youtube.com tab.
3. Right-click toolbar → "Copy URLs for this domain".
4. Expected: Only youtube URLs are copied.

- [ ] **Step 4: chrome:// active tab → no-op**

1. Focus a `chrome://extensions` tab.
2. Right-click toolbar → "Copy URLs for this domain".
3. Expected: Nothing happens. Clipboard contents unchanged.

- [ ] **Step 5: Single tab on domain**

1. Have exactly one tab open on, say, `wikipedia.org`. Focus it.
2. Right-click → "Copy URLs for this domain".
3. Expected: Just that one URL on the clipboard.

- [ ] **Step 6: Service worker restart**

1. `chrome://extensions` → tidytabs → "service worker" link → click "Stop" in DevTools (forces termination).
2. Right-click the toolbar icon.
3. Expected: The menu item is still present (the top-level `registerContextMenu()` call re-creates it when the SW wakes).

- [ ] **Step 7: Commit verification**

If the smoke test surfaces issues, fix them in their owning module, re-run `npm test`, and commit. If everything passes:

```bash
git commit --allow-empty -m "test: manual smoke pass for copy-domain-urls"
```

---

## Done criteria

- `npm test` shows 50 tests passing.
- Manual smoke test steps 2–6 all behave as expected.
- Commits are on `main`; user pushes when ready.
