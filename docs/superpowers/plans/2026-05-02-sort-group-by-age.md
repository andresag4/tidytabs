# Sort current group tabs by age — implementation plan

**Goal:** Add a fifth right-click menu item that sorts the active tab's group by `lastAccessed` ascending — stalest tab leftmost.

**Spec:** [docs/superpowers/specs/2026-05-02-sort-group-by-age-design.md](../specs/2026-05-02-sort-group-by-age-design.md)

---

## File Structure

| Path | Change |
|---|---|
| `src/contextmenu.js` | Add `sortTabIdsByAge`; register fifth menu item; add handler; update router |
| `test/contextmenu.test.js` | Append unit tests for `sortTabIdsByAge` |

No new files. No manifest changes.

---

## Tasks

### Task 1: `sortTabIdsByAge` (TDD)

**Files:** Modify `test/contextmenu.test.js`, modify `src/contextmenu.js`

- [ ] **Step 1: Append failing tests**

Append to `test/contextmenu.test.js`:

```js
import { sortTabIdsByAge } from '../src/contextmenu.js';

const tabA = (id, lastAccessed) => ({ id, lastAccessed });

test('sortTabIdsByAge: sorts ascending by lastAccessed (oldest first)', () => {
  const tabs = [
    tabA(1, 3000),
    tabA(2, 1000),
    tabA(3, 2000)
  ];
  assert.deepEqual(sortTabIdsByAge(tabs), [2, 3, 1]);
});

test('sortTabIdsByAge: tabs without lastAccessed sort to the front', () => {
  const tabs = [
    tabA(1, 5000),
    tabA(2, undefined),
    tabA(3, 3000),
    tabA(4, 0)
  ];
  // 2 and 4 both treated as 0; in input order: 2 then 4. Then 3, then 1.
  assert.deepEqual(sortTabIdsByAge(tabs), [2, 4, 3, 1]);
});

test('sortTabIdsByAge: stable for ties', () => {
  const tabs = [
    tabA(10, 1000),
    tabA(20, 1000),
    tabA(30, 1000)
  ];
  assert.deepEqual(sortTabIdsByAge(tabs), [10, 20, 30]);
});

test('sortTabIdsByAge: empty array returns empty', () => {
  assert.deepEqual(sortTabIdsByAge([]), []);
});

test('sortTabIdsByAge: single tab returns single id', () => {
  assert.deepEqual(sortTabIdsByAge([tabA(7, 1234)]), [7]);
});

test('sortTabIdsByAge: non-number lastAccessed treated as 0', () => {
  const tabs = [
    tabA(1, 'bogus'),
    tabA(2, 100),
    tabA(3, null)
  ];
  // 1 and 3 treated as 0, in input order. Then 2.
  assert.deepEqual(sortTabIdsByAge(tabs), [1, 3, 2]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `sortTabIdsByAge is not a function`.

- [ ] **Step 3: Implement `sortTabIdsByAge`**

Append to `src/contextmenu.js` (immediately after the existing `sortTabIdsByUrl` function):

```js
export function sortTabIdsByAge(tabs) {
  const indexed = tabs.map((t, i) => ({ t, i }));
  indexed.sort((a, b) => {
    const la = (a.t && typeof a.t.lastAccessed === 'number') ? a.t.lastAccessed : 0;
    const lb = (b.t && typeof b.t.lastAccessed === 'number') ? b.t.lastAccessed : 0;
    if (la !== lb) return la - lb;
    return a.i - b.i; // stable for ties
  });
  return indexed.map(x => x.t.id);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — 73 tests total (67 existing + 6 new).

- [ ] **Step 5: Commit**

```bash
git add src/contextmenu.js test/contextmenu.test.js
git commit -m "feat(contextmenu): sortTabIdsByAge"
```

---

### Task 2: Fifth menu item + handler + router

**Files:** Modify `src/contextmenu.js`

- [ ] **Step 1: Add new menu ID constant**

In `src/contextmenu.js`, alongside the existing `SORT_MENU_ID`, add:

```js
const SORT_AGE_MENU_ID = 'tidytabs.sortGroupByAge';
```

- [ ] **Step 2: Update `register` to create the fifth menu item**

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
    chrome.contextMenus.create({
      id: SORT_AGE_MENU_ID,
      title: 'Sort current group tabs by age (oldest first)',
      contexts: ['action']
    });
  });

  if (!register._listenerInstalled) {
    chrome.contextMenus.onClicked.addListener(handleClick);
    register._listenerInstalled = true;
  }
}
```

- [ ] **Step 3: Add `handleSortGroupByAge`**

Add this function alongside `handleSortGroupByUrl`:

```js
async function handleSortGroupByAge() {
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
```

- [ ] **Step 4: Update `handleClick` router**

Replace the existing `handleClick` with:

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
  if (info.menuItemId === SORT_AGE_MENU_ID) {
    return handleSortGroupByAge();
  }
}
```

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: PASS — 73 tests still green.

- [ ] **Step 6: Commit**

```bash
git add src/contextmenu.js
git commit -m "feat(contextmenu): sort current group tabs by age"
```

---

### Task 3: Manual smoke test

**Files:** None modified.

- [ ] **Step 1: Reload the extension**

`chrome://extensions` → tidytabs → reload icon.

- [ ] **Step 2: Happy path**

1. Create a group with 4 tabs. Click through them in a specific order (e.g., tab 3 last, tab 1 first → tab 1 is now the stalest).
2. Focus a tab in the group.
3. Right-click toolbar → "Sort current group tabs by age (oldest first)".
4. Expected: Stalest tab (least-recently-activated) is leftmost.

- [ ] **Step 3: Active tab not in group → no-op**

Focus an ungrouped tab. Run sort. → Nothing happens.

- [ ] **Step 4: Group of one → no-op**

- [ ] **Step 5: Commit pass**

If clean:

```bash
git commit --allow-empty -m "test: manual smoke pass for sort-group-by-age"
```

---

## Done criteria

- `npm test` shows 73 passing.
- Manual smoke passes.
- Commits on `main`, ready to push.
