# Jira ticket grouping — feature spec

**Status:** Design approved 2026-05-02
**Type:** Additive feature for the existing tidytabs Chrome extension
**Parent spec:** [2026-05-02-tab-triage-design.md](2026-05-02-tab-triage-design.md)

## Goal

A new right-click menu item that groups tabs by Jira ticket ID found in their titles. Tab titles like `[FE-3333] Fix login` (the Jira tab itself) and `Fix login (FE-3333) by user · Pull Request #1234` (the GitHub PR) share `FE-3333`, so they belong in the same group — even though their domains differ.

The use case: a working session typically has both the Jira ticket and the GitHub PR(s) open. Domain-based grouping puts them in separate `Github` and `Atlassian` groups; ticket-based grouping puts them together under `FE-3333`.

## Non-goals

- No setting to enable always-on ticket grouping. It's a one-shot menu action — user invokes it when they want it.
- No bare-number matching (e.g., just `3333` without a prefix). Too many false positives.
- No custom regex configuration in settings. The default regex covers Jira / Linear / GitLab issue patterns.
- No mixing of domain and ticket grouping in one pass. The two are separate actions.

## Behavior

### Trigger

Right-click the tidytabs toolbar icon → a new item at the bottom of the action menu: **"Group by Jira ticket"**.

### Action sequence

1. Determine scope per `settings.scope` (current window or all windows).
2. For each window in scope:
   a. Query all tabs in the window (groupable AND already-grouped — ticket triage pulls tabs out of existing groups if they match).
   b. For each tab, extract all ticket IDs from `tab.title` via the ticket regex.
   c. Build per-ticket buckets, resolving multi-ticket tabs (see below).
   d. For each ticket bucket with ≥ 2 tabs:
      - If a tab group with the ticket ID as title already exists in this window: add new tabs to it via `chrome.tabs.group({ tabIds, groupId })`.
      - Otherwise: create a new group via `chrome.tabs.group({ tabIds, createProperties: { windowId } })`, then `chrome.tabGroups.update(groupId, { title: ticketId, color: hashColor(ticketId), collapsed: settings.autoCollapse })`.
3. Tabs not matching any ticket are left alone.

### Regex

```
/\b[A-Z]{2,10}-\d{2,}\b/g
```

- 2-10 uppercase letters (Jira project prefix; covers `AB`, `FE`, `TIDYTABS`, etc.)
- A dash
- 2 or more digits
- Word boundaries on both sides to avoid matching inside longer strings

This regex covers Jira, Linear, GitLab issue patterns, and most ticket systems. False positives exist (e.g., a title `RFC-1918` would match — that's an IETF RFC) but in practice the user's tab titles will be dominated by real tickets.

Matching is case-sensitive on the prefix (must be all uppercase). This avoids matching ordinary text like `the-3333` or `chapter-15`.

### Multi-ticket resolution

A title like `[FE-3333][FE-3334] Fix login` matches two tickets. Resolution: the tab joins whichever ticket has the **largest cluster** of other tabs. Ties → lexicographically smallest ticket ID. Deterministic.

Algorithm:
1. Build a candidate map: ticketId → Set of tab IDs that mention it.
2. For each tab with multiple ticket IDs, pick its "primary" ticket by:
   - Comparing the candidate set sizes for each of its tickets.
   - Largest set wins. Ties broken by lexicographic order.
3. Re-bucket tabs by their primary ticket only. Now each tab is in exactly one bucket.
4. Apply the threshold (≥ 2 tabs) to the final buckets.

### Pulling tabs out of existing groups

Unlike domain triage (which only operates on ungrouped tabs), ticket triage operates on all tabs — including those already in domain-based groups. A GitHub PR currently in a `Github` group must be moveable into a `FE-3333` ticket group; otherwise the feature is useless for its main use case.

Skipped tabs:
- Pinned tabs (Chrome can't group pinned tabs).
- Tabs without a URL or title.
- Tabs whose URL is ungroupable (chrome://, file://, etc.).

### Color

Ticket groups use `hashColor(ticketId)` — stable across runs. Domain color presets and overrides (from a separate spec) do NOT apply here; ticket IDs aren't domains.

### Group naming

Ticket group title = the exact ticket ID as matched, e.g., `FE-3333`. No prettification.

## Architecture changes

### New files

| Path | Responsibility |
|---|---|
| `src/ticket.js` | Pure: `extractTickets(title)`, `bucketByTicket(tabs)`. |
| `test/ticket.test.js` | Unit tests for the two helpers. |

### Modified files

| Path | Change |
|---|---|
| `src/group.js` | Add `runTicketTriage(settings)` that uses `bucketByTicket` from `ticket.js`. |
| `src/contextmenu.js` | Register a new menu item; route to a new handler that calls `runTicketTriage`. |

### `ticket.js` API

```
extractTickets(title) → string[]
```

Pure function. Returns all unique ticket IDs found in the title, in order of first appearance. Empty array if none.

```
bucketByTicket(tabs) → Map<ticketId, Tab[]>
```

Pure function. Takes an array of `{ id, title, ... }` tabs, returns the post-resolution buckets (each tab in at most one bucket, assigned to its primary ticket via the largest-cluster rule).

### `group.js` — `runTicketTriage`

```
async function runTicketTriage(settings) {
  const windowIds = await getScopedWindowIds(settings);
  for (const windowId of windowIds) {
    const allTabs = await chrome.tabs.query({ windowId });
    const groupableTabs = allTabs.filter(canTicketTriage);
    const buckets = bucketByTicket(groupableTabs);
    await applyTicketGroups(buckets, settings, windowId);
  }
}
```

Where `canTicketTriage(tab)` filters out pinned tabs and tabs with ungroupable URLs (chrome://, file://). Tabs already in groups ARE included.

`applyTicketGroups` mirrors `applyGroups` but uses `ticketId` instead of `prettyName(domain)` for the title.

## Edge cases

- **A tab matches a ticket but is currently in a Chrome tab group:** the `chrome.tabs.group` call moves it to the new ticket group. Original group may end up empty — Chrome auto-removes empty groups.
- **Two tickets, both with cluster size 1:** the tab needing resolution has equal options; we pick lexicographically smallest. The buckets are then size 1 and don't meet threshold → no group created.
- **A title matches the same ticket twice** (`[FE-3333] FE-3333 cleanup`): `extractTickets` returns the unique set, so only one entry.
- **Ticket group already exists from a previous run:** new matching tabs are added to it. Color and title preserved.

## Testing

### Unit tests (`test/ticket.test.js`)

`extractTickets`:
- Single ticket in title.
- Multiple tickets in one title (returns all, unique).
- No tickets → empty array.
- Lowercase prefix → not matched.
- Suffix variations (e.g., FE-3 too short, FE-33 matches).
- Embedded in noise (`[FE-3333] some text` matches).
- Non-string input → empty array.

`bucketByTicket`:
- Each tab in one ticket → bucket per ticket.
- Tab in two tickets, one cluster larger → tab goes to larger.
- Tab in two tickets, equal clusters → tab goes to lex-smallest.
- Tab with no tickets → not in any bucket.
- Empty tabs → empty buckets.

### Manual smoke test

1. **Happy path:** Open a Jira tab with title containing `FE-3333` and a GitHub PR tab with `FE-3333` in its title. Right-click toolbar → "Group by Jira ticket". → Both tabs end up in a group titled `FE-3333`.
2. **Pulls from existing domain group:** Run domain triage first (creates `Github` group containing the PR). Then run ticket triage. → PR is removed from `Github` and added to `FE-3333`.
3. **Multi-ticket title:** A PR with `[FE-3333][FE-3334] Cleanup` joins `FE-3333` if more tabs mention 3333 than 3334.
4. **No matches:** Window with no ticket-tagged titles. Run ticket triage. → No groups created. Silent.
5. **All-windows scope:** Setting set to "all windows". Tabs across 2 windows share a ticket. → Each window gets its own `FE-3333` group (groups can't span windows).

## Out of scope

- Bare-number matching (e.g., `#3333`).
- Custom regex in settings.
- Auto-run on tab open.
