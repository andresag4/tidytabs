# Triage with merge — implementation plan

**Goal:** Add a "Tidy tabs (merge into existing)" right-click menu item that runs triage with merging — same-domain new tabs join existing same-titled tab groups instead of forming parallel ones.

**Spec:** [docs/superpowers/specs/2026-05-02-merge-mode-design.md](../specs/2026-05-02-merge-mode-design.md)

---

## File Structure

| Path | New / Modify | Responsibility |
|---|---|---|
| `src/group.js` | Modify | Add pure `findMergeTarget`; extend `applyGroups` + `runTriage` with `mergeMode` |
| `test/group.test.js` | Modify | Append unit tests for `findMergeTarget` |
| `src/contextmenu.js` | Modify | Register second menu item; route click via menuItemId |

---

## Tasks

### Task 1: `findMergeTarget` (TDD)

**Files:** Modify `test/group.test.js`, modify `src/group.js`

- [ ] **Step 1: Append failing tests**

Append to `test/group.test.js`:

```js
import { findMergeTarget } from '../src/group.js';

const eg = (id, title, leftmostIndex) => ({ id, title, leftmostIndex });

test('findMergeTarget: returns null when no match', () => {
  const groups = [eg(1, 'Github', 0), eg(2, 'Youtube', 5)];
  assert.equal(findMergeTarget(groups, 'Reddit'), null);
});

test('findMergeTarget: returns id when exactly one matches', () => {
  const groups = [eg(1, 'Github', 0), eg(2, 'Youtube', 5)];
  assert.equal(findMergeTarget(groups, 'Youtube'), 2);
});

test('findMergeTarget: returns leftmost id when multiple match', () => {
  const groups = [
    eg(2, 'Github', 10),
    eg(1, 'Github', 0),
    eg(3, 'Github', 20)
  ];
  assert.equal(findMergeTarget(groups, 'Github'), 1);
});

test('findMergeTarget: case-sensitive', () => {
  const groups = [eg(1, 'Github', 0)];
  assert.equal(findMergeTarget(groups, 'github'), null);
  assert.equal(findMergeTarget(groups, 'GITHUB'), null);
});

test('findMergeTarget: empty input returns null', () => {
  assert.equal(findMergeTarget([], 'Github'), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `findMergeTarget is not a function`.

- [ ] **Step 3: Implement `findMergeTarget`**

Append to `src/group.js`:

```js
export function findMergeTarget(existingGroups, title) {
  let best = null;
  for (const g of existingGroups) {
    if (g.title !== title) continue;
    if (best === null || g.leftmostIndex < best.leftmostIndex) {
      best = g;
    }
  }
  return best === null ? null : best.id;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — 55 tests total (50 existing + 5 new).

- [ ] **Step 5: Commit**

```bash
git add src/group.js test/group.test.js
git commit -m "feat(group): findMergeTarget pure helper"
```

---

### Task 2: Extend `applyGroups` and `runTriage` with `mergeMode`

**Files:** Modify `src/group.js`

- [ ] **Step 1: Read current `applyGroups` and `runTriage`**

In `src/group.js`, locate the existing `applyGroups` and `runTriage` exports. You'll modify their signatures and bodies.

- [ ] **Step 2: Replace `applyGroups`**

Replace the entire existing `applyGroups` function with:

```js
export async function applyGroups(buckets, settings, windowId, opts = {}) {
  const mergeMode = opts.mergeMode === true;
  const domains = [...buckets.keys()].sort();

  let existingGroupSnapshots = null;
  if (mergeMode) {
    const groups = await chrome.tabGroups.query({ windowId });
    const allTabs = await chrome.tabs.query({ windowId });
    existingGroupSnapshots = groups.map(g => {
      const members = allTabs.filter(t => t.groupId === g.id);
      return {
        id: g.id,
        title: g.title || '',
        collapsed: g.collapsed,
        leftmostIndex: members.length ? Math.min(...members.map(t => t.index)) : Infinity
      };
    });
  }

  let paletteIndex = 0;
  for (const domain of domains) {
    const tabs = buckets.get(domain);
    const tabIds = tabs.map(t => t.id);
    const title = prettyName(domain);

    let mergedIntoId = null;
    if (mergeMode && existingGroupSnapshots) {
      mergedIntoId = findMergeTarget(existingGroupSnapshots, title);
    }

    if (mergedIntoId !== null) {
      await chrome.tabs.group({ tabIds, groupId: mergedIntoId });
      const snap = existingGroupSnapshots.find(s => s.id === mergedIntoId);
      if (settings.autoCollapse === true && snap && snap.collapsed) {
        await chrome.tabGroups.update(mergedIntoId, { collapsed: true });
      }
    } else {
      const groupId = await chrome.tabs.group({
        tabIds,
        createProperties: { windowId }
      });
      const color = pickGroupColor(domain, paletteIndex, settings);
      await chrome.tabGroups.update(groupId, {
        title,
        color,
        collapsed: settings.autoCollapse === true
      });
      paletteIndex++;
    }
  }
}
```

- [ ] **Step 3: Replace `runTriage`**

Replace the existing `runTriage` with:

```js
export async function runTriage(settings, opts = {}) {
  const windowIds = [];
  if (settings.scope === 'all') {
    const wins = await chrome.windows.getAll({ populate: false });
    for (const w of wins) windowIds.push(w.id);
  } else {
    const w = await chrome.windows.getCurrent();
    windowIds.push(w.id);
  }

  for (const windowId of windowIds) {
    const tabs = await collectGroupableTabs(windowId);
    const buckets = bucketByDomain(tabs, settings.domainThreshold);
    await applyGroups(buckets, settings, windowId, opts);
    await reorderWindow(windowId, settings);
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS — 55 tests still green (signatures changed in a backward-compatible way — `opts` is optional).

- [ ] **Step 5: Commit**

```bash
git add src/group.js
git commit -m "feat(group): mergeMode in applyGroups and runTriage"
```

---

### Task 3: Second context menu item

**Files:** Modify `src/contextmenu.js`

- [ ] **Step 1: Add imports and second menu ID**

Open `src/contextmenu.js`. The current file imports `extractDomain` from `./domain.js` and `copyText` from `./clipboard.js`, and defines `MENU_ID = 'tidytabs.copyDomainUrls'`.

Add the imports needed for the merge action. Find the existing import block at the top and add (or extend the existing imports — do not duplicate):

```js
import { runTriage } from './group.js';
import { getSettings } from './settings.js';
```

Then below the existing `MENU_ID` constant, add:

```js
const MERGE_MENU_ID = 'tidytabs.triageMerge';
```

- [ ] **Step 2: Update `register` to create both menu items**

Find the existing `register` function. Replace it with:

```js
export function register() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: 'Copy URLs for this domain',
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

- [ ] **Step 3: Update `handleClick` to route by menuItemId**

Find the existing `handleClick` function. Replace it with:

```js
async function handleClick(info) {
  if (info.menuItemId === MENU_ID) {
    return handleCopyUrls();
  }
  if (info.menuItemId === MERGE_MENU_ID) {
    return handleTriageMerge();
  }
}

async function handleCopyUrls() {
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

async function handleTriageMerge() {
  try {
    const settings = await getSettings();
    await runTriage(settings, { mergeMode: true });
  } catch (e) {
    console.error('tidytabs: triage-merge failed', e);
  }
}
```

> **Note:** The body of the original `handleClick` (the copy-URLs logic) moves into `handleCopyUrls` verbatim — same try/catch, same query/filter/copy steps.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS — 55 tests still green.

- [ ] **Step 5: Commit**

```bash
git add src/contextmenu.js
git commit -m "feat(contextmenu): second menu item for triage-merge"
```

---

### Task 4: Manual smoke test

**Files:** None modified.

- [ ] **Step 1: Reload the extension**

`chrome://extensions` → tidytabs → reload icon. Confirm no errors.

- [ ] **Step 2: Merge into existing**

1. Create a window with an existing `Github` group (3 tabs).
2. Open 2 more github.com tabs (ungrouped).
3. Right-click tidytabs icon → "Tidy tabs (merge into existing)".
4. Expected: The 2 new tabs join the existing `Github` group. No second `Github` group is created.

- [ ] **Step 3: No existing group**

1. In a clean window with no `Github` group, open 3 github.com tabs.
2. Right-click → merge action.
3. Expected: Identical to left-click — a fresh `Github` group appears.

- [ ] **Step 4: Mixed buckets**

1. Window has existing `Github` group. Open 3 new github.com tabs AND 3 youtube.com tabs.
2. Right-click → merge.
3. Expected: github tabs merge into existing group; youtube tabs form a new `Youtube` group.

- [ ] **Step 5: Multiple same-name groups**

1. From a left-click flow, create `Github` AND `Github (2)` (open new tabs, click left, repeat).
2. Open 2 more github.com tabs.
3. Right-click → merge.
4. Expected: New tabs join the leftmost `Github` group. `Github (2)` is untouched.

- [ ] **Step 6: Collapse respected**

1. Window has a collapsed `Github` group. Open 2 new github.com tabs.
2. Right-click → merge.
3. Expected: Tabs added; group is re-collapsed afterward (since `autoCollapse` default is on).

- [ ] **Step 7: Left-click unchanged**

1. With an existing `Github` group, open 3 more github.com tabs.
2. Left-click the toolbar icon (NOT right-click).
3. Expected: `Github (2)` is created — the original parallel-group behavior is preserved.

- [ ] **Step 8: Commit pass**

If issues, fix and commit. If clean:

```bash
git commit --allow-empty -m "test: manual smoke pass for merge-mode"
```

---

## Done criteria

- `npm test` shows 55 passing.
- Manual steps 2–7 all pass.
- Commits on `main`.
