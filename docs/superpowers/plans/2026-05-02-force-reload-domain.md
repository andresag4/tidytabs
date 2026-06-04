# Force reload all tabs with this domain — implementation plan

**Goal:** Add a "Force reload all tabs with this domain" right-click menu item that reloads every open tab matching the active tab's domain across all windows, bypassing browser cache.

**Spec:** [docs/superpowers/specs/2026-05-02-force-reload-domain-design.md](../specs/2026-05-02-force-reload-domain-design.md)

---

## File Structure

| Path | Change | Responsibility |
|---|---|---|
| `src/contextmenu.js` | Modify | Add `filterTabIdsByDomain`; register third menu item; add `handleReloadDomain`; update `handleClick` router |
| `test/contextmenu.test.js` | Modify | Append unit tests for `filterTabIdsByDomain` |

No manifest changes. No new files.

---

## Tasks

### Task 1: `filterTabIdsByDomain` (TDD)

**Files:** Modify `test/contextmenu.test.js`, modify `src/contextmenu.js`

- [ ] **Step 1: Append failing tests**

Append to `test/contextmenu.test.js`:

```js
import { filterTabIdsByDomain } from '../src/contextmenu.js';

const tabT = (id, url, opts = {}) => ({
  id, url,
  windowId: opts.windowId ?? 1,
  index: opts.index ?? id
});

test('filterTabIdsByDomain: returns IDs for matching tabs', () => {
  const tabs = [
    tabT(1, 'https://github.com/a'),
    tabT(2, 'https://youtube.com/x'),
    tabT(3, 'https://github.com/c')
  ];
  assert.deepEqual(filterTabIdsByDomain(tabs, 'github.com'), [1, 3]);
});

test('filterTabIdsByDomain: skips ungroupable URLs and missing URLs', () => {
  const tabs = [
    tabT(1, 'https://github.com/a'),
    tabT(2, 'chrome://settings/'),
    tabT(3, ''),
    tabT(4, 'https://github.com/d')
  ];
  assert.deepEqual(filterTabIdsByDomain(tabs, 'github.com'), [1, 4]);
});

test('filterTabIdsByDomain: matches subdomains via registrable domain', () => {
  const tabs = [
    tabT(1, 'https://github.com/a'),
    tabT(2, 'https://api.github.com/b'),
    tabT(3, 'https://docs.github.com/c')
  ];
  assert.deepEqual(filterTabIdsByDomain(tabs, 'github.com'), [1, 2, 3]);
});

test('filterTabIdsByDomain: sorts by (windowId, index)', () => {
  const tabs = [
    tabT(3, 'https://github.com/c', { windowId: 2, index: 0 }),
    tabT(1, 'https://github.com/a', { windowId: 1, index: 5 }),
    tabT(2, 'https://github.com/b', { windowId: 1, index: 2 })
  ];
  assert.deepEqual(filterTabIdsByDomain(tabs, 'github.com'), [2, 1, 3]);
});

test('filterTabIdsByDomain: empty input returns empty array', () => {
  assert.deepEqual(filterTabIdsByDomain([], 'github.com'), []);
});

test('filterTabIdsByDomain: no matches returns empty array', () => {
  const tabs = [tabT(1, 'https://github.com/a')];
  assert.deepEqual(filterTabIdsByDomain(tabs, 'youtube.com'), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `filterTabIdsByDomain is not a function`.

- [ ] **Step 3: Implement `filterTabIdsByDomain`**

Append to `src/contextmenu.js` (immediately after the existing `filterTabsByDomain` function — keep them adjacent):

```js
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
```

> Reuses the existing `extractDomain` import at the top of the file. Do not add a duplicate import.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — 61 tests total (55 existing + 6 new).

- [ ] **Step 5: Commit**

```bash
git add src/contextmenu.js test/contextmenu.test.js
git commit -m "feat(contextmenu): filterTabIdsByDomain"
```

---

### Task 2: Third menu item + handler + router

**Files:** Modify `src/contextmenu.js`

- [ ] **Step 1: Add the new menu ID constant**

In `src/contextmenu.js`, find the existing `MERGE_MENU_ID` constant. Add a third constant alongside it:

```js
const RELOAD_MENU_ID = 'tidytabs.reloadDomain';
```

- [ ] **Step 2: Update `register` to create the third menu item in the correct order**

Replace the existing `register` function with:

```js
export function register() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: 'Copy URLs for this domain',
      contexts: ['action']
    });
    chrome.contextMenus.create({
      id: RELOAD_MENU_ID,
      title: 'Force reload all tabs with this domain',
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
```

> Order of `create` calls = display order in the menu. RELOAD goes between COPY and MERGE.

- [ ] **Step 3: Add the `handleReloadDomain` handler**

Add this function alongside the existing `handleCopyUrls` and `handleTriageMerge`:

```js
async function handleReloadDomain() {
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
```

- [ ] **Step 4: Update `handleClick` to route the new menu item**

Replace the existing `handleClick` function with:

```js
async function handleClick(info) {
  if (info.menuItemId === MENU_ID) {
    return handleCopyUrls();
  }
  if (info.menuItemId === RELOAD_MENU_ID) {
    return handleReloadDomain();
  }
  if (info.menuItemId === MERGE_MENU_ID) {
    return handleTriageMerge();
  }
}
```

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: PASS — 61 tests still green.

- [ ] **Step 6: Commit**

```bash
git add src/contextmenu.js
git commit -m "feat(contextmenu): force reload all tabs with this domain"
```

---

### Task 3: Manual smoke test

**Files:** None modified.

- [ ] **Step 1: Reload the extension**

`chrome://extensions` → tidytabs → reload icon. Confirm no errors.

- [ ] **Step 2: Happy path**

1. Open 5 github.com tabs across 2 windows.
2. Focus any github.com tab.
3. Right-click tidytabs icon → "Force reload all tabs with this domain".
4. Expected: All 5 tabs visibly reload (you'll see the spinner on each in the tab strip).

- [ ] **Step 3: Active tab decides domain**

1. Open mixed tabs (github, youtube, reddit).
2. Focus a youtube tab. Right-click → force reload.
3. Expected: Only youtube tabs reload. Github and reddit untouched.

- [ ] **Step 4: chrome:// active tab is a no-op**

1. Focus a `chrome://extensions` tab. Right-click → force reload.
2. Expected: Nothing happens. No other tabs reload.

- [ ] **Step 5: Pinned tabs included**

1. Pin 2 github.com tabs. Open 1 more unpinned github tab. Focus any.
2. Right-click → force reload.
3. Expected: All 3 tabs reload (pinned + unpinned both).

- [ ] **Step 6: Cache bypass works**

1. Open DevTools → Network on a target tab.
2. Run the force-reload action.
3. Expected: Resources should be re-requested from network (not served from cache). You can verify by looking at the Status column — fresh `200`s, not `304`s or `(memory cache)`.

- [ ] **Step 7: Commit pass**

If issues, fix and commit. If clean:

```bash
git commit --allow-empty -m "test: manual smoke pass for force-reload-domain"
```

---

## Done criteria

- `npm test` shows 61 passing.
- Manual steps 2–6 all pass.
- Commits on `main`, ready for `git push origin main`.
