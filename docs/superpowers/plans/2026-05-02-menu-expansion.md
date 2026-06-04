# Menu expansion — implementation plan

**Goal:** Add 5 new toolbar right-click items, 2 new tab right-click items, and separators to organize the toolbar menu.

**Spec:** [docs/superpowers/specs/2026-05-02-menu-expansion-design.md](../specs/2026-05-02-menu-expansion-design.md)

---

## File Structure

Only `src/contextmenu.js` is modified. No new files. No test changes.

---

## Tasks

### Task 1: Add separators and new toolbar action menu items

**Files:** Modify `src/contextmenu.js`

- [ ] **Step 1: Add new menu ID constants**

In `src/contextmenu.js`, alongside the existing `SORT_AGE_MENU_ID`, add:

```js
const MOVE_TO_NEW_WINDOW_MENU_ID = 'tidytabs.moveGroupToNewWindow';
const SORT_ALL_URL_MENU_ID = 'tidytabs.sortAllGroupsByUrl';
const SORT_ALL_AGE_MENU_ID = 'tidytabs.sortAllGroupsByAge';
const COLLAPSE_ALL_MENU_ID = 'tidytabs.collapseAllGroups';
const EXPAND_ALL_MENU_ID = 'tidytabs.expandAllGroups';
const TAB_MOVE_TO_GROUP_MENU_ID = 'tidytabs.tabMoveToDomainGroup';
const TAB_CLOSE_OTHERS_MENU_ID = 'tidytabs.tabCloseOthersOnDomain';
```

- [ ] **Step 2: Replace `register` with the full menu, including separators and tab-context items**

Replace the existing `register` function with:

```js
export function register() {
  chrome.contextMenus.removeAll(() => {
    // Toolbar action menu — items 1 and 2 (existing)
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
      id: 'tidytabs.sep1', type: 'separator', contexts: ['action']
    });

    // Group create / extract
    chrome.contextMenus.create({
      id: MERGE_MENU_ID,
      title: 'Tidy tabs (merge into existing)',
      contexts: ['action']
    });
    chrome.contextMenus.create({
      id: MOVE_TO_NEW_WINDOW_MENU_ID,
      title: 'Move this group to a new window',
      contexts: ['action']
    });
    chrome.contextMenus.create({
      id: 'tidytabs.sep2', type: 'separator', contexts: ['action']
    });

    // Sort items
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
    chrome.contextMenus.create({
      id: SORT_ALL_URL_MENU_ID,
      title: 'Sort all groups alphabetically by URL',
      contexts: ['action']
    });
    chrome.contextMenus.create({
      id: SORT_ALL_AGE_MENU_ID,
      title: 'Sort all groups by age (oldest first)',
      contexts: ['action']
    });
    chrome.contextMenus.create({
      id: 'tidytabs.sep3', type: 'separator', contexts: ['action']
    });

    // Bulk collapse
    chrome.contextMenus.create({
      id: COLLAPSE_ALL_MENU_ID,
      title: 'Collapse all groups',
      contexts: ['action']
    });
    chrome.contextMenus.create({
      id: EXPAND_ALL_MENU_ID,
      title: 'Expand all groups',
      contexts: ['action']
    });

    // Tab strip right-click menu — separate surface
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
```

- [ ] **Step 3: Replace `handleClick` to route all current and new menu IDs**

Replace the existing `handleClick` with:

```js
async function handleClick(info, tab) {
  switch (info.menuItemId) {
    case MENU_ID: return handleCopyUrls();
    case RELOAD_MENU_ID: return handleReloadDomain();
    case MERGE_MENU_ID: return handleTriageMerge();
    case SORT_MENU_ID: return handleSortGroupByUrl();
    case SORT_AGE_MENU_ID: return handleSortGroupByAge();
    case MOVE_TO_NEW_WINDOW_MENU_ID: return handleMoveGroupToNewWindow();
    case SORT_ALL_URL_MENU_ID: return handleSortAllGroupsByUrl();
    case SORT_ALL_AGE_MENU_ID: return handleSortAllGroupsByAge();
    case COLLAPSE_ALL_MENU_ID: return handleCollapseOrExpandAll(true);
    case EXPAND_ALL_MENU_ID: return handleCollapseOrExpandAll(false);
    case TAB_MOVE_TO_GROUP_MENU_ID: return handleTabMoveToDomainGroup(tab);
    case TAB_CLOSE_OTHERS_MENU_ID: return handleTabCloseOthersOnDomain(tab);
  }
}
```

- [ ] **Step 4: Append the 7 new handlers**

Add these functions alongside the existing `handleCopyUrls`, `handleReloadDomain`, etc.:

```js
async function handleMoveGroupToNewWindow() {
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

async function handleSortAllGroupsByUrl() {
  return sortAllGroups(sortTabIdsByUrl);
}

async function handleSortAllGroupsByAge() {
  return sortAllGroups(sortTabIdsByAge);
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

async function handleCollapseOrExpandAll(collapsed) {
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

> **Note on imports:** The existing imports at the top of `src/contextmenu.js` already include `extractDomain` (from `./domain.js`), `runTriage` and `getSettings`. You ALSO need `prettyName` from `./domain.js` — extend the existing domain.js import to include it:
>
> ```js
> import { extractDomain, prettyName } from './domain.js';
> ```

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: PASS — 73 tests still green (no test changes, no broken existing functionality).

- [ ] **Step 6: Commit**

```bash
git add src/contextmenu.js
git commit -m "feat(contextmenu): menu expansion — 5 toolbar items + 2 tab-context items + separators"
```

---

### Task 2: Manual smoke test

**Files:** None modified.

- [ ] **Step 1: Reload the extension**

`chrome://extensions` → tidytabs → reload icon.

- [ ] **Step 2: Move group to new window**

1. Window with a 4-tab `Github` group.
2. Focus a tab in the group.
3. Right-click toolbar → "Move this group to a new window".
4. Expected: New window appears with the 4 tabs in a group titled `Github`, same color, same collapsed state.

- [ ] **Step 3: Sort all groups by URL**

1. Window with 3 groups, each containing 3+ tabs in random URL order.
2. Right-click toolbar → "Sort all groups alphabetically by URL".
3. Expected: All 3 groups are now sorted internally.

- [ ] **Step 4: Sort all groups by age**

Same as Step 3 but with the age option. Confirm stalest tab in each group ends up leftmost.

- [ ] **Step 5: Collapse all / Expand all**

1. Window with 3 expanded groups.
2. Right-click → "Collapse all groups" → all collapse.
3. Right-click → "Expand all groups" → all expand.

- [ ] **Step 6: Tab right-click — Move to domain group**

1. Window with an existing `Github` group and one ungrouped github.com tab.
2. Right-click the ungrouped tab (in the tab strip, not the toolbar).
3. Expected: New tidytabs items appear in the context menu.
4. Click "Move tab to its domain group".
5. Expected: Tab joins the existing `Github` group.

- [ ] **Step 7: Tab right-click — Move with no matching group**

1. Right-click a github.com tab in a window with no `Github` group.
2. Click "Move tab to its domain group".
3. Expected: No-op.

- [ ] **Step 8: Tab right-click — Close all other tabs on this domain**

1. Window with 4 github.com tabs (one is the active one).
2. Right-click any github.com tab → "Close all other tabs on this domain".
3. Expected: 3 tabs close, 1 (the right-clicked one) remains.

- [ ] **Step 9: Commit pass**

```bash
git commit --allow-empty -m "test: manual smoke pass for menu-expansion"
```

---

## Done criteria

- `npm test` shows 73 passing.
- All 8 manual smoke steps pass.
- Commits on `main`, ready to push.
