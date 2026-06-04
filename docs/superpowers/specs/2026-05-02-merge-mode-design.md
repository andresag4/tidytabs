# Triage with merge — feature spec

**Status:** Design approved 2026-05-02
**Type:** Additive feature for the existing tidytabs Chrome extension
**Parent spec:** [2026-05-02-tab-triage-design.md](2026-05-02-tab-triage-design.md)

## Goal

Add a right-click menu item on the tidytabs toolbar icon that runs the same triage as left-click, but with one behavioral difference: when a domain bucket finds an existing tab group with the same title in the window, the new tabs get added to that existing group instead of creating a parallel `Github (2)`-style group.

This fixes the documented limitation in the parent spec ("A new group is created for the new tabs even if a same-domain group already exists. Acceptable v1 behavior; can be revisited if it bites.") without changing the default left-click behavior.

## Non-goals

- No change to left-click behavior. Left-click still creates parallel groups when an existing same-named group exists.
- No merging across windows — Chrome tab groups are per-window.
- No automatic merging of pre-existing same-name groups in the strip (e.g., if the user already has both `Github` and `Github (2)`, this feature doesn't combine those two).
- No re-coloring or renaming of the existing group on merge.

## Behavior

### Trigger

Right-click the tidytabs toolbar icon. The menu now contains:
- "Copy URLs for this domain" (existing)
- **"Tidy tabs (merge into existing)"** (new)
- "Options" (Chrome-added)

### Action sequence

The flow is the existing triage pipeline (`runTriage`) with one switch: `mergeMode: true`.

For each window in scope:

1. Collect groupable tabs (`collectGroupableTabs`) — unchanged.
2. Bucket by domain (`bucketByDomain`) — unchanged.
3. Apply groups (`applyGroups`) — **modified**:
   - For each domain bucket, compute the prospective group title via `prettyName(domain)`.
   - Query existing groups in the window. Find any whose `title` exactly equals the prospective title.
   - **If `mergeMode === true` AND a matching group exists:** call `chrome.tabs.group({ tabIds, groupId: existingGroupId })` to merge the new tabs into the existing group. Do NOT change the existing group's color or title.
   - **Otherwise** (mergeMode off, or no match): create a new group with `prettyName`, color, and collapse as before.
4. After merging, if the existing group was collapsed and the merge auto-expanded it, re-collapse it iff `settings.autoCollapse === true`.
5. Reorder window (`reorderWindow`) — unchanged.

### Multiple same-name groups

If the window has multiple existing groups with the same title (e.g., `Github` AND `Github (2)` from past left-clicks), the merge target is the **leftmost** one — the group whose leftmost tab has the lowest index. Deterministic, predictable.

### Edge cases

- **No matching existing group:** behaves identically to left-click for that bucket — creates a fresh group with name/color/collapse.
- **Mixed buckets:** some domains match an existing group, some don't. Each bucket decides independently.
- **Pinned tabs and ungroupable URLs:** unchanged behavior (skipped by `bucketByDomain` upstream).
- **Existing group title differs in case** (`github` vs `Github`): treated as different titles. We compare exact strings. Acceptable v1 — `prettyName` is deterministic so future runs always produce the same casing.

## Architecture changes

### Modified files

| Path | Change |
|---|---|
| `src/group.js` | `applyGroups` accepts a `mergeMode` boolean; `runTriage` accepts `mergeMode` (default false). Add pure helper `findMergeTarget(existingGroups, title)`. |
| `src/contextmenu.js` | Register a second menu item; new handler dispatches `runTriage({ ...settings }, { mergeMode: true })`. |
| `test/group.test.js` | New unit tests for `findMergeTarget`. |

### No new files

The feature is small enough to live in existing modules.

### `findMergeTarget` (pure, testable)

```
findMergeTarget(existingGroups, title) → groupId | null
```

Input shape: `Array<{id, title, leftmostIndex}>`.

Returns the `id` of the leftmost group whose `title` exactly matches, or `null` if none match.

### `applyGroups` change

The signature gains a third argument: an options bag.

```
applyGroups(buckets, settings, windowId, { mergeMode } = {})
```

Per bucket:
- If `mergeMode` is true, query existing tab groups in the window, compute the title via `prettyName(domain)`, and look for a match via `findMergeTarget`.
- If a match: `chrome.tabs.group({ tabIds, groupId: matchedId })`. After the call, re-collapse the existing group iff `settings.autoCollapse` is true.
- If no match: existing branch — create a new group.

### `runTriage` change

```
runTriage(settings, { mergeMode } = {})
```

Just forwards `mergeMode` to `applyGroups`. No other changes.

### Context menu wiring

`contextmenu.js` gains:
- A second `chrome.contextMenus.create({ id: 'tidytabs.triageMerge', title: 'Tidy tabs (merge into existing)', contexts: ['action'] })`.
- The existing `handleClick` switches on `info.menuItemId`. Existing branch for `tidytabs.copyDomainUrls` stays. New branch for `tidytabs.triageMerge` reads settings and calls `runTriage(settings, { mergeMode: true })`.

## Testing

### Unit tests (`test/group.test.js`)

Cover `findMergeTarget`:
- Returns null when no group matches the title.
- Returns the id when exactly one matches.
- Returns the leftmost id when multiple match.
- Empty input returns null.
- Match is exact-string (case-sensitive).

No new unit tests for the Chrome-API parts — covered by manual smoke test.

### Manual smoke test

1. **Merge into existing.** Have a window with an existing `Github` group (3 tabs). Open 2 more github.com tabs (ungrouped). Right-click toolbar → "Tidy tabs (merge into existing)". → The 2 new tabs join the existing `Github` group. No second `Github` group is created.
2. **No existing group:** From a window with no `Github` group, open 3 github.com tabs. Right-click → merge action. → Behaves identically to left-click: fresh `Github` group created.
3. **Mixed buckets:** Window has an existing `Github` group. Open 3 github.com tabs AND 3 youtube.com tabs. Right-click → merge. → New github tabs join existing group; youtube tabs form a fresh `Youtube` group.
4. **Multiple same-name groups:** Window has `Github` (leftmost) AND `Github (2)`. Open 2 new github tabs. Right-click → merge. → The 2 new tabs join the leftmost `Github` group. `Github (2)` is untouched.
5. **Collapse respected:** Existing `Github` group is collapsed. Right-click → merge → tabs added → group is re-collapsed (because `autoCollapse` default is on).
6. **Left-click unchanged:** Confirm left-clicking the toolbar icon still creates `Github (2)` rather than merging — the default behavior is unchanged.

## Out of scope (future ideas)

- Auto-merge same-name groups (combine `Github` + `Github (2)` into one).
- A setting to make merge the default left-click behavior.
- Smart merge across windows (would need to move tabs across windows first).
