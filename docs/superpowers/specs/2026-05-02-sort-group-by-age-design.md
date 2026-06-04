# Sort current group tabs by age — feature spec

**Status:** Design approved 2026-05-02
**Type:** Additive feature for the existing tidytabs Chrome extension
**Parent spec:** [2026-05-02-tab-triage-design.md](2026-05-02-tab-triage-design.md)

## Goal

A right-click menu item that sorts the tabs in the active tab's group by **least-recently-accessed first** so stale tabs visually surface at the front of the group.

"Stale" here = "haven't been activated in a while," not "opened a long time ago." A daily-used Gmail tab opened weeks ago is not stale; a tab opened yesterday but never activated since is.

## Non-goals

- No tracking of tab *creation* time. Chrome doesn't expose it, and tracking it ourselves doesn't match what the user actually wants ("identify stale ones").
- No sort by URL, title, or anything else. Just age.
- No descending option. Always oldest-first.

## Behavior

### Trigger

Right-click the tidytabs toolbar icon. The menu now ends with:
- Copy URLs for this domain
- Force reload all tabs with this domain
- Tidy tabs (merge into existing)
- Sort current group tabs alphabetically by URL
- **Sort current group tabs by age (oldest first)** (new)
- Options

### Action sequence

1. Get the active tab in the focused window.
2. If not in a group (`groupId === -1`) → silent no-op.
3. Query tabs with that `groupId`.
4. If fewer than 2 → silent no-op.
5. Sort by `tab.lastAccessed` ascending (smallest = oldest = least recently active).
6. `chrome.tabs.move(sortedIds, { index: startIndex })`.

### Sort key details

`tab.lastAccessed` is "the last time the tab became active in its window, as ms since epoch" — available since Chrome 121. Tabs that have never been activated since the field existed may have `lastAccessed === undefined` or `0`; we treat both as `0`, so they sort to the front. This is the desired behavior — those ARE the stalest tabs.

Stable for ties: tabs with identical `lastAccessed` preserve input order.

### Edge cases

- **All tabs in the group share `lastAccessed`** (rare — same timestamp ms) → stable sort preserves order, effectively no-op.
- **Group is collapsed** → reorder works; collapse state preserved.
- **Active tab is in a group of one** → no-op.
- **`lastAccessed` missing on older Chrome** → treated as 0, sorts to front. Function still works; just less informative.

## Permissions delta

**None.** `chrome.tabs.move` is already permitted.

## Architecture

### Files modified

| Path | Change |
|---|---|
| `src/contextmenu.js` | Add pure `sortTabIdsByAge`. Register fifth menu item. Add `handleSortGroupByAge`. Update `handleClick` router. |
| `test/contextmenu.test.js` | Append unit tests for `sortTabIdsByAge`. |

### `sortTabIdsByAge` — pure helper

```
sortTabIdsByAge(tabs) → number[]
```

Returns tab IDs sorted by `lastAccessed` ascending. Missing/non-number `lastAccessed` → treated as 0. Stable on ties.

### Menu order

`register()` creates menu items in this order:

1. `tidytabs.copyDomainUrls`
2. `tidytabs.reloadDomain`
3. `tidytabs.triageMerge`
4. `tidytabs.sortGroupByUrl`
5. `tidytabs.sortGroupByAge` ← new

## Testing

### Unit tests (`test/contextmenu.test.js`, appended)

`sortTabIdsByAge`:
- Sorts by `lastAccessed` ascending — oldest (smallest number) first.
- Tabs without `lastAccessed` sort to the front (treated as 0).
- Stable for ties.
- Empty array returns empty.
- Single tab returns single ID.

### Manual smoke test

1. **Happy path:** Open a group with 4 tabs. Click through them in a specific order to set `lastAccessed`. Right-click toolbar → "Sort current group tabs by age (oldest first)". → Tabs reorder so the least-recently-activated is leftmost.
2. **Stale tab surfaces:** Have a group where one tab hasn't been visited in days; click through other tabs frequently. Sort. → The stale tab is at the front.
3. **Active tab not in group:** Focus an ungrouped tab → sort. → No-op.
4. **Group of one:** No-op.
5. **Collapsed group:** Sort works; collapse preserved.

## Out of scope

- True creation-time sort (would need our own tracking).
- Highlight stale tabs visually (badge, color) — different feature.
- Auto-discard tabs older than N days — different feature.
