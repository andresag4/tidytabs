# Sort current group tabs by URL — implementation plan

**Goal:** Add a fourth right-click menu item that sorts the tabs in the active tab's group alphabetically by URL.

**Spec:** [docs/superpowers/specs/2026-05-02-sort-group-by-url-design.md](../specs/2026-05-02-sort-group-by-url-design.md)

---

## File Structure

| Path | Change | Responsibility |
|---|---|---|
| `src/contextmenu.js` | Modify | Add `sortTabIdsByUrl`; register fourth menu item; add `handleSortGroupByUrl`; update `handleClick` router |
| `test/contextmenu.test.js` | Modify | Append unit tests for `sortTabIdsByUrl` |

No new files. No manifest changes.

---

## Tasks

### Task 1: `sortTabIdsByUrl` (TDD)

**Files:** Modify `test/contextmenu.test.js`, modify `src/contextmenu.js`

- [ ] **Step 1: Append failing tests**

Append to `test/contextmenu.test.js`:

```js
import { sortTabIdsByUrl } from '../src/contextmenu.js';

const tabU = (id, url) => ({ id, url });

test('sortTabIdsByUrl: sorts ascending by URL string', () => {
  const tabs = [
    tabU(3, 'https://github.com/c'),
    tabU(1, 'https://github.com/a'),
    tabU(2, 'https://github.com/b')
  ];
  assert.deepEqual(sortTabIdsByUrl(tabs), [1, 2, 3]);
});

test('sortTabIdsByUrl: empty array returns empty', () => {
  assert.deepEqual(sortTabIdsByUrl([]), []);
});

test('sortTabIdsByUrl: single tab returns single id', () => {
  assert.deepEqual(sortTabIdsByUrl([tabU(7, 'https://x.com')]), [7]);
});

test('sortTabIdsByUrl: tabs with no URL sort to the front', () => {
  const tabs = [
    tabU(1, 'https://github.com/a'),
    tabU(2, undefined),
    tabU(3, ''),
    tabU(4, 'https://github.com/b')
  ];
  // Two empty-url tabs first (in input order), then a, then b.
  assert.deepEqual(sortTabIdsByUrl(tabs), [2, 3, 1, 4]);
});

test('sortTabIdsByUrl: stable for ties', () => {
  const tabs = [
    tabU(10, 'https://same.com'),
    tabU(20, 'https://same.com'),
    tabU(30, 'https://same.com')
  ];
  assert.deepEqual(sortTabIdsByUrl(tabs), [10, 20, 30]);
});

test('sortTabIdsByUrl: case-sensitive comparison', () => {
  // Uppercase letters sort before lowercase in raw string compare.
  const tabs = [
    tabU(1, 'https://github.com/a'),
    tabU(2, 'https://github.com/B'),
    tabU(3, 'https://github.com/A')
  ];
  // ASCII order: 'A' (65) < 'B' (66) < 'a' (97)
  assert.deepEqual(sortTabIdsByUrl(tabs), [3, 2, 1]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `sortTabIdsByUrl is not a function`.

- [ ] **Step 3: Implement `sortTabIdsByUrl`**

Append to `src/contextmenu.js` (immediately after the existing `filterTabIdsByDomain` function, before the menu/handler code that comes later in the file):

```js
export function sortTabIdsByUrl(tabs) {
  const indexed = tabs.map((t, i) => ({ t, i }));
  indexed.sort((a, b) => {
    const ua = (a.t && typeof a.t.url === 'string') ? a.t.url : '';
    const ub = (b.t && typeof b.t.url === 'string') ? b.t.url : '';
    if (ua < ub) return -1;
    if (ua > ub) return 1;
    return a.i - b.i; // stable for ties
  });
  return indexed.map(x => x.t.id);
}
```

> Pure function — no imports needed beyond what's already at the top of the file.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — 67 tests total (61 existing + 6 new).

- [ ] **Step 5: Commit**

```bash
git add src/contextmenu.js test/contextmenu.test.js
git commit -m "feat(contextmenu): sortTabIdsByUrl"
```

---

### Task 2: Fourth menu item + handler + router

**Files:** Modify `src/contextmenu.js`

- [ ] **Step 1: Add the new menu ID constant**

In `src/contextmenu.js`, find the existing `RELOAD_MENU_ID` and `MERGE_MENU_ID` constants. Add a fourth:

```js
const SORT_MENU_ID = 'tidytabs.sortGroupByUrl';
```

- [ ] **Step 2: Update `register` to create the fourth menu item**

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
    chrome.contextMenus.create({
      id: SORT_MENU_ID,
      title: 'Sort current group tabs alphabetically by URL',
      contexts: ['action']
    });
  });

  if (!register._listenerInstalled) {
    chrome.contextMenus.onClicked.addListener(handleClick);
    register._listenerInstalled = true;
  }
}
```

- [ ] **Step 3: Add the `handleSortGroupByUrl` handler**

Add this function next to the other handlers (`handleCopyUrls`, `handleReloadDomain`, `handleTriageMerge`):

```js
async function handleSortGroupByUrl() {
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
  if (info.menuItemId === SORT_MENU_ID) {
    return handleSortGroupByUrl();
  }
}
```

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: PASS — 67 tests still green.

- [ ] **Step 6: Commit**

```bash
git add src/contextmenu.js
git commit -m "feat(contextmenu): sort current group tabs alphabetically by URL"
```

---

### Task 3: Manual smoke test

**Files:** None modified.

- [ ] **Step 1: Reload the extension**

`chrome://extensions` → tidytabs → reload icon. Confirm no errors.

- [ ] **Step 2: Happy path**

1. Open 4 github.com tabs and triage them into a `Github` group.
2. Manually drag the tabs into a non-alphabetical order within the group.
3. Focus any tab in the group.
4. Right-click toolbar → "Sort current group tabs alphabetically by URL".
5. Expected: Tabs in the group reorder alphabetically by URL.

- [ ] **Step 3: Active tab not in a group**

1. Focus an ungrouped tab. Right-click → sort.
2. Expected: Nothing happens.

- [ ] **Step 4: Group of one tab**

1. Create a Chrome group manually with just one tab. Focus it. Right-click → sort.
2. Expected: No-op.

- [ ] **Step 5: Collapsed group**

1. Collapse a group. Right-click toolbar (you may need to focus a tab in the group first; if the active tab is in a collapsed group, Chrome still reports its groupId). Run sort.
2. Expected: Tabs reorder inside; group remains collapsed.

- [ ] **Step 6: Multiple groups in window**

1. Window has `Github` group and `Youtube` group. Focus a `Github` tab.
2. Run sort.
3. Expected: Only `Github` group's tabs reorder; `Youtube` untouched.

- [ ] **Step 7: Commit pass**

If clean:

```bash
git commit --allow-empty -m "test: manual smoke pass for sort-group-by-url"
```

---

## Done criteria

- `npm test` shows 67 passing.
- Manual steps 2–6 all pass.
- Commits on `main`, ready to push.
