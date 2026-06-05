# Click-to-open popup menu — implementation plan

**Goal:** Replace `chrome.action.onClicked` + the action-context right-click menu with a popup. Tab-context items stay.

**Spec:** [docs/superpowers/specs/2026-05-02-popup-menu-design.md](../specs/2026-05-02-popup-menu-design.md)

---

## File Structure

| Path | New / Modify |
|---|---|
| `popup.html` | New |
| `popup.css` | New |
| `src/popup.js` | New |
| `src/actions.js` | New (action handlers extracted from contextmenu.js) |
| `manifest.json` | Modify |
| `src/background.js` | Modify |
| `src/contextmenu.js` | Modify (massive cleanup — keep only tab-context bits) |

---

## Tasks

### Task 1: Create `src/actions.js` with all the moving action handlers

**Files:** Create `src/actions.js`

- [ ] **Step 1: Write `src/actions.js`**

This is a pure cut-and-paste move. The bodies of these handlers are taken verbatim from the current `src/contextmenu.js`. Imports at the top mirror those needed by the handlers.

```js
import { extractDomain, prettyName } from './domain.js';
import {
  runTriage,
  runTicketTriage,
  sortTabIdsByUrl,
  sortTabIdsByAge
} from './group.js';
// Wait — these aren't all exported from group.js. Check the actual imports in
// contextmenu.js and match them. Specifically, sortTabIdsByUrl/Age live in
// contextmenu.js currently. Move them to actions.js too OR keep in a shared
// helper. See Step 2 note.
import { getSettings } from './settings.js';
import { copyText } from './clipboard.js';
import { filterTabsByDomain, filterTabIdsByDomain } from './contextmenu.js';
```

> **STOP — read this before pasting:**
>
> Several helpers currently live in `src/contextmenu.js`:
> - Pure: `filterTabsByDomain`, `filterTabIdsByDomain`, `sortTabIdsByUrl`, `sortTabIdsByAge`
> - Handlers: 12 action handlers + 2 tab handlers + `sortAllGroups` private helper
>
> **The pure helpers stay in `contextmenu.js`** because:
> (a) Their tests in `test/contextmenu.test.js` import them from `'../src/contextmenu.js'`. Moving them would break the test imports.
> (b) `actions.js` can simply import them from `contextmenu.js` — same module, no circular issue (contextmenu.js doesn't import from actions.js anymore after the refactor).
>
> **Only the handler FUNCTIONS move**, not the pure helpers.

Now write `src/actions.js`:

```js
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
```

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: PASS — 102 tests. (No tests for actions.js, no test changes.)

- [ ] **Step 3: Commit**

```bash
git add src/actions.js
git commit -m "feat(actions): extract handlers from contextmenu.js"
```

---

### Task 2: Slim down `src/contextmenu.js`

**Files:** Modify `src/contextmenu.js`

- [ ] **Step 1: Replace the entire file with the slimmed-down version**

The new `src/contextmenu.js` keeps:
- Imports (only `extractDomain` and `prettyName` from `./domain.js`)
- The 4 pure functions: `filterTabsByDomain`, `filterTabIdsByDomain`, `sortTabIdsByUrl`, `sortTabIdsByAge` (already exported, tested)
- 2 menu ID constants for tab-context items
- 2 tab handlers: `handleTabMoveToDomainGroup`, `handleTabCloseOthersOnDomain`
- `register` (only the 2 tab-context items)
- `handleClick` (only the 2 tab routes)

Removed:
- All 11 action-context menu ID constants
- All 12 action handlers (now in `actions.js`)
- The `sortAllGroups` helper
- 4 separator IDs
- Imports for `runTriage`, `runTicketTriage`, `getSettings`, `copyText` (no longer needed)

Final file content:

```js
import { extractDomain, prettyName } from './domain.js';

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

export function filterTabIdsByDomain(tabs, targetDomain) {
  if (!targetDomain) return [];
  const matching = [];
  for (const t of tabs) {
    if (!t || typeof t.url !== 'string' || t.url.length === 0) continue;
    if (extractDomain(t.url) !== targetDomain) continue;
    matching.push(t);
  }
  matching.sort((a, b) => (a.windowId - b.windowId) || (a.index - b.index));
  return matching.map(t => t.id);
}

export function sortTabIdsByUrl(tabs) {
  const indexed = tabs.map((t, i) => ({ t, i }));
  indexed.sort((a, b) => {
    const ua = (a.t && typeof a.t.url === 'string') ? a.t.url : '';
    const ub = (b.t && typeof b.t.url === 'string') ? b.t.url : '';
    if (ua < ub) return -1;
    if (ua > ub) return 1;
    return a.i - b.i;
  });
  return indexed.map(x => x.t.id);
}

export function sortTabIdsByAge(tabs) {
  const indexed = tabs.map((t, i) => ({ t, i }));
  indexed.sort((a, b) => {
    const la = (a.t && typeof a.t.lastAccessed === 'number') ? a.t.lastAccessed : 0;
    const lb = (b.t && typeof b.t.lastAccessed === 'number') ? b.t.lastAccessed : 0;
    if (la !== lb) return la - lb;
    return a.i - b.i;
  });
  return indexed.map(x => x.t.id);
}

const TAB_MOVE_TO_GROUP_MENU_ID = 'tidytabs.tabMoveToDomainGroup';
const TAB_CLOSE_OTHERS_MENU_ID = 'tidytabs.tabCloseOthersOnDomain';

export function register() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: TAB_MOVE_TO_GROUP_MENU_ID,
      title: 'Move tab to its domain group',
      contexts: ['tab']
    });
    chrome.contextMenus.create({
      id: TAB_CLOSE_OTHERS_MENU_ID,
      title: 'Close all other tabs on this domain',
      contexts: ['tab']
    });
  });

  if (!register._listenerInstalled) {
    chrome.contextMenus.onClicked.addListener(handleClick);
    register._listenerInstalled = true;
  }
}

async function handleClick(info, tab) {
  if (info.menuItemId === TAB_MOVE_TO_GROUP_MENU_ID) return handleTabMoveToDomainGroup(tab);
  if (info.menuItemId === TAB_CLOSE_OTHERS_MENU_ID) return handleTabCloseOthersOnDomain(tab);
}

async function handleTabMoveToDomainGroup(tab) {
  try {
    if (!tab || !tab.url) return;
    const domain = extractDomain(tab.url);
    if (!domain) return;
    const title = prettyName(domain);
    const groups = await chrome.tabGroups.query({ windowId: tab.windowId });
    const match = groups.find(g => g.title === title);
    if (!match) return;
    await chrome.tabs.group({ tabIds: [tab.id], groupId: match.id });
  } catch (e) {
    console.error('tidytabs: tab-move-to-domain-group failed', e);
  }
}

async function handleTabCloseOthersOnDomain(tab) {
  try {
    if (!tab || !tab.url) return;
    const domain = extractDomain(tab.url);
    if (!domain) return;
    const allTabs = await chrome.tabs.query({});
    const toClose = allTabs
      .filter(t => t.id !== tab.id)
      .filter(t => typeof t.url === 'string' && extractDomain(t.url) === domain)
      .map(t => t.id);
    if (toClose.length === 0) return;
    await chrome.tabs.remove(toClose);
  } catch (e) {
    console.error('tidytabs: tab-close-others-on-domain failed', e);
  }
}
```

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: PASS — 102 tests still green. The pure functions (`filterTabsByDomain`, etc.) are still exported with same signatures; tests import them from `../src/contextmenu.js` and continue to pass.

- [ ] **Step 3: Commit**

```bash
git add src/contextmenu.js
git commit -m "refactor(contextmenu): slim down to tab-context items only"
```

---

### Task 3: Manifest — declare popup

**Files:** Modify `manifest.json`

- [ ] **Step 1: Add `default_popup` to the `action` block**

Replace the `action` block with:

```json
"action": {
  "default_title": "Tidy tabs",
  "default_popup": "popup.html",
  "default_icon": {
    "16": "icons/16.png",
    "32": "icons/32.png",
    "48": "icons/48.png",
    "128": "icons/128.png"
  }
}
```

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: PASS — 102.

- [ ] **Step 3: Commit**

```bash
git add manifest.json
git commit -m "feat: declare popup as default action"
```

---

### Task 4: Remove `chrome.action.onClicked` from `background.js`

**Files:** Modify `src/background.js`

- [ ] **Step 1: Remove the onClicked handler**

The current `src/background.js`:

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

chrome.runtime.onInstalled.addListener(() => registerContextMenu());
chrome.runtime.onStartup.addListener(() => registerContextMenu());
registerContextMenu();
```

Replace with:

```js
import { register as registerContextMenu } from './contextmenu.js';

chrome.runtime.onInstalled.addListener(() => registerContextMenu());
chrome.runtime.onStartup.addListener(() => registerContextMenu());
registerContextMenu();
```

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: PASS — 102.

- [ ] **Step 3: Commit**

```bash
git add src/background.js
git commit -m "refactor(background): remove dead onClicked handler"
```

---

### Task 5: Create the popup files

**Files:** Create `popup.html`, `popup.css`, `src/popup.js`

- [ ] **Step 1: Write `popup.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>tidytabs</title>
  <link rel="stylesheet" href="popup.css" />
</head>
<body>
  <header>
    <span class="brand">tidytabs</span>
    <a href="#" id="open-settings" title="Open settings">⚙</a>
  </header>

  <section>
    <h2>Triage</h2>
    <button data-action="tidy">✨ Tidy now</button>
    <button data-action="tidy-merge">⤵ Tidy + merge into existing groups</button>
    <button data-action="ticket-triage">🎫 Group by Jira ticket</button>
  </section>

  <section>
    <h2>This domain</h2>
    <button data-action="copy-urls">📋 Copy URLs for this domain</button>
    <button data-action="reload-domain">🔄 Force reload all tabs with this domain</button>
  </section>

  <section>
    <h2>Current group</h2>
    <button data-action="sort-group-url">🔤 Sort tabs by URL</button>
    <button data-action="sort-group-age">🕒 Sort tabs by age (oldest first)</button>
    <button data-action="move-group-new-window">↗ Move group to a new window</button>
  </section>

  <section>
    <h2>All groups</h2>
    <button data-action="sort-all-url">🔤 Sort all groups by URL</button>
    <button data-action="sort-all-age">🕒 Sort all groups by age</button>
    <button data-action="collapse-all">➖ Collapse all groups</button>
    <button data-action="expand-all">➕ Expand all groups</button>
  </section>

  <section>
    <h2>Other</h2>
    <button data-action="toggle-passwords">👁 Toggle password visibility</button>
  </section>

  <script type="module" src="src/popup.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `popup.css`**

Minimal but legible. Width ~300px.

```css
* { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #222;
  background: #fafafa;
}
body { width: 300px; }
header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background: white;
  border-bottom: 1px solid #eee;
}
header .brand { font-weight: 600; font-size: 14px; }
header a {
  color: #555;
  text-decoration: none;
  font-size: 16px;
  padding: 0 4px;
}
header a:hover { color: #000; }
section {
  padding: 8px 12px 6px;
  border-bottom: 1px solid #eee;
}
section:last-child { border-bottom: none; }
section h2 {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #888;
  margin: 0 0 4px;
}
button {
  display: block;
  width: 100%;
  text-align: left;
  background: transparent;
  border: none;
  padding: 6px 8px;
  font: inherit;
  color: inherit;
  cursor: pointer;
  border-radius: 4px;
}
button:hover { background: #ececec; }
button:active { background: #ddd; }
```

- [ ] **Step 3: Write `src/popup.js`**

```js
import * as actions from './actions.js';

const ACTION_MAP = {
  'tidy': actions.handleTidy,
  'tidy-merge': actions.handleTriageMerge,
  'ticket-triage': actions.handleTicketTriage,
  'copy-urls': actions.handleCopyUrls,
  'reload-domain': actions.handleReloadDomain,
  'sort-group-url': actions.handleSortGroupByUrl,
  'sort-group-age': actions.handleSortGroupByAge,
  'move-group-new-window': actions.handleMoveGroupToNewWindow,
  'sort-all-url': actions.handleSortAllGroupsByUrl,
  'sort-all-age': actions.handleSortAllGroupsByAge,
  'collapse-all': () => actions.handleCollapseOrExpandAll(true),
  'expand-all': () => actions.handleCollapseOrExpandAll(false),
  'toggle-passwords': actions.handleTogglePasswordVisibility
};

for (const btn of document.querySelectorAll('button[data-action]')) {
  btn.addEventListener('click', async () => {
    const name = btn.dataset.action;
    const fn = ACTION_MAP[name];
    if (!fn) return;
    try {
      await fn();
    } finally {
      window.close();
    }
  });
}

const settingsLink = document.getElementById('open-settings');
if (settingsLink) {
  settingsLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
    window.close();
  });
}
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS — 102 tests still green.

- [ ] **Step 5: Commit**

```bash
git add popup.html popup.css src/popup.js
git commit -m "feat: popup UI for toolbar click"
```

---

### Task 6: Manual smoke test

**Files:** None modified.

- [ ] **Step 1: Reload the extension**

`chrome://extensions` → tidytabs → reload icon.

- [ ] **Step 2: Click toolbar icon**

Expected: a popup appears with the 5 sections and all the buttons.

- [ ] **Step 3: Triage actions**

Click "Tidy now" → window triages, popup closes.
Click "Tidy + merge into existing groups" → merge variant runs.
Click "Group by Jira ticket" → ticket-based groups appear if matches.

- [ ] **Step 4: Domain actions**

Click "Copy URLs for this domain" → URLs on clipboard.
Click "Force reload all tabs with this domain" → matching tabs reload.

- [ ] **Step 5: Group sort + move**

In an existing group, click "Sort tabs by URL" → sorted.
Click "Sort tabs by age" → sorted by lastAccessed.
Click "Move group to a new window" → group extracted to new window.

- [ ] **Step 6: All groups**

Click "Sort all groups by URL" → every group sorts.
"Sort all groups by age" → every group sorts by age.
"Collapse all" / "Expand all" → bulk toggle.

- [ ] **Step 7: Other**

Click "Toggle password visibility" on a login page → passwords reveal / restore.

- [ ] **Step 8: Settings**

Click ⚙ → options page opens.

- [ ] **Step 9: Tab right-click still works**

Right-click a tab in the tab strip. Expected: "Move tab to its domain group" and "Close all other tabs on this domain" still appear. Each behaves as before.

- [ ] **Step 10: Toolbar right-click is now plain**

Right-click the toolbar icon. Expected: only Chrome's default items (Options, Manage extension, Inspect popup, etc.). No tidytabs custom items.

- [ ] **Step 11: Commit pass**

```bash
git commit --allow-empty -m "test: manual smoke pass for popup-menu"
```

---

## Done criteria

- `npm test` shows 102 passing.
- All 11 manual steps pass.
- Commits on `main`, ready to push.
