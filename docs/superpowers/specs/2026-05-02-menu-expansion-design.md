# Menu expansion — feature spec

**Status:** Design approved 2026-05-02
**Type:** Additive feature batch for the existing tidytabs Chrome extension
**Parent spec:** [2026-05-02-tab-triage-design.md](2026-05-02-tab-triage-design.md)

## Goal

Five new right-click menu items on the toolbar action, plus a new right-click surface on tabs themselves. Reorganize the toolbar action menu with separators so the growing list stays legible.

## Non-goals

- No nested submenus. Keep menu flat with separators for v1.
- No renaming of existing menu items. Existing wording is preserved.
- No settings additions in this batch.

## What gets added

### Toolbar action right-click — new items

Added items (with separators) so the final order becomes:

1. Copy URLs for this domain *(existing)*
2. Force reload all tabs with this domain *(existing)*
3. ─── separator ───
4. Tidy tabs (merge into existing) *(existing)*
5. **Move this group to a new window** *(new)*
6. ─── separator ───
7. Sort current group tabs alphabetically by URL *(existing)*
8. Sort current group tabs by age (oldest first) *(existing)*
9. **Sort all groups alphabetically by URL** *(new)*
10. **Sort all groups by age (oldest first)** *(new)*
11. ─── separator ───
12. **Collapse all groups** *(new)*
13. **Expand all groups** *(new)*

### Tab right-click — new menu surface

Two items added to the right-click menu when right-clicking *a tab in the tab strip* (not the toolbar icon). These use `contexts: ['tab']`:

A. **Move tab to its domain group** — if a tab group with the prettied domain name (e.g., `Github`) already exists in this window, move the right-clicked tab into it. If no such group exists, no-op.
B. **Close all other tabs on this domain** — close every other tab (across all windows) sharing the right-clicked tab's domain. Keeps only the right-clicked tab.

## Behavior — toolbar items

### Move this group to a new window

1. Get the active tab. If not in a group → no-op.
2. Read its `groupId`, title, color, collapsed state.
3. Query tabs in that group.
4. `chrome.windows.create({ tabId: firstTab.id })` to spawn a new window seeded with the leftmost group tab. (Chrome doesn't allow creating a window with multiple tabs in one call.)
5. `chrome.tabs.move(restTabIds, { windowId: newWindowId, index: -1 })` to move the rest.
6. `chrome.tabs.group({ tabIds: allOriginalTabIds, createProperties: { windowId: newWindowId } })` to regroup them.
7. `chrome.tabGroups.update(newGroupId, { title, color, collapsed })` to preserve appearance.

### Sort all groups alphabetically by URL / by age

1. `chrome.tabGroups.query({ windowId: currentWindowId })` — get every group in the current window.
2. For each group, query its tabs.
3. Sort using the existing pure helper (`sortTabIdsByUrl` or `sortTabIdsByAge`).
4. `chrome.tabs.move(sortedIds, { index: groupStartIndex })`.
5. Continue to the next group. Sequential, not parallel.

If a group has fewer than 2 tabs, skip it.

### Collapse all groups / Expand all groups

1. Query all groups in the current window.
2. For each: `chrome.tabGroups.update(groupId, { collapsed: true | false })`.

No-op on a window with no groups.

## Behavior — tab right-click items

### Move tab to its domain group

1. The clicked tab's URL is in `info.linkUrl`? No — for `contexts: ['tab']`, the right-clicked tab is exposed via the second argument `tab` to the `onClicked` listener. Use `tab.url`.
2. Extract domain via `extractDomain(tab.url)`. If null → no-op.
3. Compute prettied title via `prettyName(domain)`.
4. Query existing groups in the tab's window. Find one whose `title` exactly matches the prettied name.
5. If found → `chrome.tabs.group({ tabIds: [tab.id], groupId: matchedGroupId })`. If not found → no-op.

### Close all other tabs on this domain

1. Extract domain via `extractDomain(tab.url)`. If null → no-op.
2. Query all tabs across all windows.
3. Filter to those matching the domain.
4. Subtract the right-clicked tab itself.
5. `chrome.tabs.remove(otherTabIds)`.

This is destructive — but it's an explicit user action with a clear label, no confirmation prompt needed.

## Architecture changes

### Modified files

| Path | Change |
|---|---|
| `src/contextmenu.js` | Add 5 new menu IDs and 5 new handlers for toolbar items. Add 2 new menu IDs and handlers for tab-context items. Extend `register` to create separators and tab-context items. Extend `handleClick` router to accept a `tab` arg and route by menuItemId. |
| `src/group.js` | Add pure helper `extractGroupSnapshot(groups, allTabs)` if needed — actually most of this can be inline. (Decision: keep it inline. New pure helpers only if a function gets repeated.) |
| `test/contextmenu.test.js` | Tests for any new pure helpers added. |

### No new files

The feature is small enough to live in existing modules. No new chrome permissions; `chrome.windows.create` is granted via the existing `tabs` permission.

### Separator support

`chrome.contextMenus.create({ type: 'separator', id: 'sep1', contexts: ['action'] })` adds a horizontal rule. Each separator needs a unique ID.

### `handleClick` signature change

Currently: `handleClick(info)`.
New: `handleClick(info, tab)`. The Chrome API always passes `tab` as the second argument; we just weren't using it. For `contexts: ['tab']` items, `tab` is the right-clicked tab.

## Edge cases

- **Move to new window with collapsed group:** color and collapsed state preserved in the new window.
- **Sort all groups when there are zero groups:** silent no-op.
- **Collapse/expand all when there are zero groups:** silent no-op.
- **Move tab to its domain group: tab is already in that group:** Chrome's `tabs.group` is idempotent; safe.
- **Close all other tabs on this domain when there's only one tab matching:** no other tabs to remove → no-op.
- **Tab right-click on chrome:// or extension pages:** Chrome does not show extension context menu items there. Implicit handling.

## Testing

### Unit tests

No new pure functions in this batch require unit tests beyond what already exists. The new actions are all thin Chrome API integrations.

Existing tests must remain green: 73 tests.

### Manual smoke test

A. **Move group to new window:** Group of 4 tabs → right-click toolbar → "Move this group to a new window" → new window opens with all 4 tabs in a group with the same title and color.

B. **Sort all groups by URL:** Window with 3 groups (each with 3+ tabs in random order). Run sort-all-by-URL. → All 3 groups end up alphabetically sorted internally.

C. **Sort all groups by age:** Same as B but by age.

D. **Collapse all / Expand all:** Window with 3 expanded groups. Click "Collapse all". → All collapse. Click "Expand all". → All expand.

E. **Move tab to its domain group:** Window with a `Github` group and an ungrouped github.com tab. Right-click the ungrouped tab → "Move tab to its domain group". → Tab joins the existing group.

F. **Move tab no matching group:** Right-click a github.com tab when there's no `Github` group. → Nothing happens.

G. **Close other tabs on this domain:** 4 github.com tabs open. Right-click one → "Close all other tabs on this domain". → 3 others close, 1 remains.

## Out of scope

- Save / restore window state.
- Group templates.
- Keyboard shortcuts.
