# Force reload all tabs with this domain — feature spec

**Status:** Design approved 2026-05-02
**Type:** Additive feature for the existing tidytabs Chrome extension
**Parent spec:** [2026-05-02-tab-triage-design.md](2026-05-02-tab-triage-design.md)

## Goal

Add a right-click menu item that reloads (bypassing browser cache) every open tab on the active tab's domain across all windows.

Use case: "I changed something in our app's CSS and need to see the change in all my open tabs that are looking at the local dev server."

## Non-goals

- No format options or scope toggle. Always all-windows. Always force-reload (bypass cache).
- No confirmation prompt or toast. Silent.
- No selective reload (no "reload only this window's matching tabs").

## Behavior

### Trigger

Right-click the tidytabs toolbar icon. The menu now contains:
- "Copy URLs for this domain"
- **"Force reload all tabs with this domain"** (new, directly below Copy URLs)
- "Tidy tabs (merge into existing)"
- "Options" (Chrome-added)

### Action sequence

1. Read the active tab in the focused window.
2. Extract its domain via `extractDomain` (reuse from `src/domain.js`).
3. If null (chrome://, file://, etc.) → silent no-op.
4. Query all tabs across all windows.
5. Filter to tabs whose domain matches.
6. For each matching tab: `chrome.tabs.reload(tabId, { bypassCache: true })`.

The `bypassCache: true` flag is what makes it a "force" reload — equivalent to Cmd+Shift+R in the browser, ignoring HTTP cache entries.

### Inclusions

- **Active tab itself:** included. "All tabs" means all of them.
- **Pinned tabs:** included.
- **Tabs in any group:** included. (Reloading doesn't disturb group membership.)

### Edge cases

- Active tab on an ungroupable URL → no-op.
- A matching tab is currently loading → `chrome.tabs.reload` is safe to call; Chrome handles it.
- A matching tab is discarded (sleeping) → `chrome.tabs.reload` triggers normal load. Safe.
- A matching tab throws (rare) → caught and logged; the loop continues for remaining tabs.

## Permissions delta

**None.** `chrome.tabs.reload` is covered by the existing `tabs` permission. No manifest changes.

## Architecture

### Files modified

| Path | Change |
|---|---|
| `src/contextmenu.js` | Add pure `filterTabIdsByDomain`. Register a third menu item. Add `handleReloadDomain`. Update `handleClick` router. |
| `test/contextmenu.test.js` | Add unit tests for `filterTabIdsByDomain`. |

### `filterTabIdsByDomain` — pure helper

Returns the tab IDs (numeric) of all tabs matching the target domain, sorted by `(windowId, index)`.

```
filterTabIdsByDomain(tabs, targetDomain) → number[]
```

Structurally parallel to `filterTabsByDomain` — same filtering rules, but returns `tab.id` instead of `tab.url`. Code duplication is intentional: extracting a shared helper for ~10 lines saves nothing and adds an indirection.

### Menu order

`register()` calls `chrome.contextMenus.create` in this order, which fixes the displayed menu order:

1. `tidytabs.copyDomainUrls` — "Copy URLs for this domain"
2. `tidytabs.reloadDomain` — "Force reload all tabs with this domain" ← new
3. `tidytabs.triageMerge` — "Tidy tabs (merge into existing)"

### `handleClick` routing

`handleClick` switches on `info.menuItemId`. Add a third branch for `tidytabs.reloadDomain` → `handleReloadDomain`. The existing copy and merge branches stay unchanged.

### `handleReloadDomain`

```
1. Query active tab in lastFocusedWindow.
2. Extract domain. If null, return.
3. Query all tabs.
4. Compute matching tab IDs via filterTabIdsByDomain.
5. For each id: try chrome.tabs.reload(id, {bypassCache: true}); on per-tab error, console.error and continue.
```

Reloads run sequentially via `for (const id of tabIds)`. Parallelizing with `Promise.all` is possible but offers no real win for a click-triggered action with rarely more than 20 tabs — sequential is simpler and slightly nicer on the network.

## Testing

### Unit tests (`test/contextmenu.test.js`, appended)

`filterTabIdsByDomain`:
- Returns IDs for matching tabs.
- Returns empty array when nothing matches.
- Skips tabs with no URL or ungroupable URLs.
- Sorts by `(windowId, index)`.
- Empty input → empty array.

No tests for `handleReloadDomain` itself — Chrome API integration covered by manual smoke.

### Manual smoke test

1. **Happy path:** Open 5 github.com tabs across 2 windows. Focus any GitHub tab. Right-click toolbar → "Force reload all tabs with this domain". → All 5 tabs reload (you'll see the loading spinner on each).
2. **Active tab decides domain:** Focus a youtube.com tab. Right-click → reload. → Only youtube tabs reload.
3. **chrome:// active tab:** Focus a `chrome://settings` tab. Right-click → reload. → Nothing happens.
4. **Pinned tabs reload too:** Pin 2 github.com tabs. Right-click on one → reload. → Pinned tabs also reload.
5. **Network bypass:** Open DevTools → Network tab on one of the matching tabs. Observe the reload triggered via this feature — the `Disable cache` indicator behavior should match a Cmd+Shift+R hard reload.

## Out of scope (future ideas)

- Soft reload variant (no cache bypass) — could be an option.
- Scope toggle (current window only).
- Reload all tabs in a group, regardless of domain.
