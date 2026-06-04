# Sort current group tabs by URL — feature spec

**Status:** Design approved 2026-05-02
**Type:** Additive feature for the existing tidytabs Chrome extension
**Parent spec:** [2026-05-02-tab-triage-design.md](2026-05-02-tab-triage-design.md)

## Goal

A right-click menu item that sorts the tabs in the active tab's group alphabetically by URL. Useful when a group has accumulated tabs in random order and the user wants a stable, predictable arrangement.

## Non-goals

- No sort by title, hostname, or last-accessed time. Just URL.
- No descending/ascending toggle. Just ascending.
- No sorting across groups or globally.

## Behavior

### Trigger

Right-click the tidytabs toolbar icon. The menu now ends with:
- Copy URLs for this domain
- Force reload all tabs with this domain
- Tidy tabs (merge into existing)
- **Sort current group tabs alphabetically by URL** (new)
- Options (Chrome-added)

### Action sequence

1. Get the active tab in the focused window.
2. If the active tab is not in a group (`groupId === -1` / `TAB_GROUP_ID_NONE`) → silent no-op.
3. Query all tabs with that `groupId`.
4. If fewer than 2 tabs → silent no-op (nothing to sort).
5. Sort tabs by URL ascending (plain string compare, no locale).
6. Compute the leftmost current index across these tabs (the group's start).
7. Call `chrome.tabs.move(sortedIds, { index: startIndex })` — Chrome moves them to consecutive positions in array order, keeping them in the group.

### Edge cases

- **Group is collapsed:** `chrome.tabs.move` works regardless of collapse state. The group does not auto-expand on move.
- **Tabs still loading (no URL):** treated as empty string for sort. They land at the front of the group.
- **Same-URL duplicate tabs:** stable relative order (the sort is stable; ties preserve input order, which is `chrome.tabs.query` order = tab index order).
- **Sorting in a pinned group:** Chrome doesn't support pinning groups currently — this case can't occur. Pinned single tabs are never in groups.

## Permissions delta

**None.** `chrome.tabs.move` is covered by the existing `tabs` permission.

## Architecture

### Files modified

| Path | Change |
|---|---|
| `src/contextmenu.js` | Add pure `sortTabIdsByUrl`. Register fourth menu item. Add `handleSortGroupByUrl`. Update `handleClick` router. |
| `test/contextmenu.test.js` | Append unit tests for `sortTabIdsByUrl`. |

### `sortTabIdsByUrl` — pure helper

```
sortTabIdsByUrl(tabs) → number[]
```

Takes an array of tab-like objects `{ id, url }`, returns their IDs sorted alphabetically by URL ascending. Stable sort. Tabs without a URL are treated as empty string (sort to the front).

### Menu order

`register()` calls `chrome.contextMenus.create` in this order, fixing the menu display:

1. `tidytabs.copyDomainUrls`
2. `tidytabs.reloadDomain`
3. `tidytabs.triageMerge`
4. `tidytabs.sortGroupByUrl` ← new

### `handleClick` routing

Add a fourth branch dispatching `tidytabs.sortGroupByUrl` → `handleSortGroupByUrl`.

### `handleSortGroupByUrl`

```
1. Query active tab in lastFocusedWindow.
2. If activeTab.groupId is undefined or -1 → return.
3. Query tabs with groupId = activeTab.groupId.
4. If tabs.length < 2 → return.
5. startIndex = min(tabs.map(t => t.index)).
6. sortedIds = sortTabIdsByUrl(tabs).
7. await chrome.tabs.move(sortedIds, { index: startIndex }).
8. Catch and console.error on failure.
```

## Testing

### Unit tests (`test/contextmenu.test.js`, appended)

`sortTabIdsByUrl`:
- Sorts simple set of URLs alphabetically (returns IDs in URL order).
- Empty array returns empty array.
- Single tab returns single ID.
- Tabs with no URL (undefined/empty) sort to the front.
- Sort is stable for ties (same URL → input order preserved).

### Manual smoke test

1. **Happy path:** Create a `Github` group containing tabs in random order. Right-click toolbar → "Sort current group tabs alphabetically by URL". → Tabs in the group reorder alphabetically by URL.
2. **Active tab not in a group:** Focus an ungrouped tab. Right-click → sort. → Nothing happens.
3. **Group has one tab:** Group of one. Right-click → sort. → No-op.
4. **Collapsed group:** Group is collapsed. Right-click → sort. → Tabs reorder inside the group; group stays collapsed.
5. **Multiple groups in window:** Three groups present. Focus a tab in `Github` and run sort. → Only the `Github` group is sorted; the others are untouched.
6. **Mixed protocols / weird URLs:** Group includes a chrome:// tab (rare — can chrome:// tabs even be grouped? In current Chrome, yes if added manually). It sorts by raw URL string. Acceptable.

## Out of scope (future ideas)

- Sort all groups in the window with one action.
- Sort by tab title.
- Reverse-alphabetical option.
