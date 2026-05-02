# Tab Triage — Chrome Extension

**Status:** Design approved 2026-05-02
**Type:** Chrome extension, Manifest V3
**Scope:** Personal-use tool. Pure local logic. No backend, no third-party APIs.

## Goal

One-click cleanup of a tab-strip graveyard. Click the toolbar icon → tabs from the same domain collapse into a Chrome tab group. The window goes from 30 visible tabs to 5 collapsed groups.

Designed for the user's two-Chrome-profile workflow (personal + work). Each profile gets its own settings naturally because `chrome.storage` is per-profile.

## Non-goals

Explicitly out of scope:

- No Claude API or LLM use of any kind. Pure deterministic local logic.
- No markdown export, clipboard export, or file output.
- No popup UI on icon click — the click runs the action immediately.
- No topic-based grouping. Domain-only.
- No automatic running on a timer or tab event. Manual trigger only.
- No cross-window groups (Chrome doesn't allow it).
- No mobile, no Firefox port.

## Behavior

### Trigger

- Click the toolbar icon → triage runs immediately. No popup, no menu, no confirmation.
- Settings page opened via right-click toolbar icon → "Options", or `chrome://extensions` → details → "Extension options".

### What triage does

1. Determine windows in scope per `Scope` setting (current window only, or all windows in profile).
2. For each window:
   1. Collect every tab that is **not already in a Chrome tab group** and **not pinned** and has a groupable URL (`http://`, `https://` only — `chrome://`, `edge://`, `about:`, `file://`, `chrome-extension://`, `view-source:` skipped).
   2. Bucket tabs by registrable domain (eTLD+1, e.g., `news.ycombinator.com` → `ycombinator.com`).
   3. For each bucket where `tabs.length >= threshold` (default 3): create a Chrome tab group, name it the titleized domain, assign a color per the color strategy, collapse it iff auto-collapse is on.
   4. Tabs in buckets below threshold remain ungrouped.
3. After grouping in each window, reorder the window's tabs:
   - Pinned tabs stay where they are (Chrome forces them to the front).
   - All Chrome tab groups (existing + newly created) move to the front of the unpinned section, ordered per the `Group order` setting.
   - Ungrouped (and unpinned) tabs go to the position determined by `Ungrouped placement`.
4. Existing groups: their **membership** is never modified. Their **position** in the strip is repositioned per the group-ordering setting.

### Re-running

Clicking again is safe and idempotent for already-grouped tabs:

- Tabs in existing groups are skipped during bucketing (so they keep their current group/membership).
- New tabs opened since the last click get triaged on the next click.
- Existing groups may shift position (per ordering setting) but their contents don't change.

## Settings

Settings live on a dedicated options page. All settings auto-save on change with a transient "Saved ✓" indicator next to the control. Storage uses `chrome.storage.sync` with `chrome.storage.local` fallback if sync is unavailable or fails.

| Setting | Type | Options | Default |
|---|---|---|---|
| Group order | radio | leftmost-member-wins, alphabetical, largest-first | leftmost-member-wins |
| Ungrouped placement | radio | end of window, start of window, leave in place | end of window |
| Domain threshold | slider | 2–5 | 3 |
| Auto-collapse new groups | toggle | on, off | on |
| Color strategy | radio | stable-hash, random, palette-by-order | stable-hash |
| Scope | radio | current window, all windows in profile | current window |
| Reset settings | button | — | — (confirms via `window.confirm`) |

### Setting semantics

- **Group order — leftmost-member-wins:** Each group's sort key is the current tab-index of its leftmost member. Preserves rough mental order on first run.
- **Group order — alphabetical:** A → Z by group name (titleized domain).
- **Group order — largest-first:** Tab count descending. Ties broken alphabetically.
- **Ungrouped placement — leave in place:** Tabs keep their current relative position; groups still get pulled to the front but ungrouped tabs aren't pushed to a fixed end. (Tabs displaced by group reordering shift naturally.)
- **Color strategy — stable-hash:** `hash(domain) mod 9` → one of Chrome's 9 group colors (grey, blue, red, yellow, green, pink, purple, cyan, orange — Chrome exposes these as `chrome.tabGroups.ColorEnum`). Same domain → same color always.
- **Color strategy — random:** Picks a random color when the group is created. Existing groups keep their color.
- **Color strategy — palette-by-order:** Domains in the current run sorted alphabetically; the i-th domain gets palette[i mod 9].
- **Scope — all windows:** Runs the same per-window logic for each window in the current profile. Groups never span windows.

## Architecture

Manifest V3 service-worker extension. No content scripts. No remote code.

### File layout

```
manifest.json
src/
  background.js     // service worker; chrome.action.onClicked handler
  domain.js         // pure: extractDomain, prettyName, pickColor, hash
  group.js          // chrome API: bucketing, group creation, reordering
  settings.js       // get/set with defaults; sync + local fallback
  options.js        // wires the form to settings.js
options.html        // settings page markup
options.css         // settings page styles
test/
  domain.test.js    // unit tests for pure functions
  group.test.js     // unit tests for pure ordering/bucketing logic
icons/
  16.png  32.png  48.png  128.png
```

### Module boundaries

- **`domain.js`** — pure. No Chrome APIs. Easy unit-test target.
  - `extractDomain(url: string): string | null` — returns eTLD+1 or null for ungroupable URLs.
  - `prettyName(domain: string): string` — `"github.com"` → `"Github"`. Drops TLD, titleizes the remaining label.
  - `hashColor(domain: string): ChromeColor` — deterministic hash → color.
  - `paletteColor(index: number): ChromeColor` — `index mod 9` → color.
- **`group.js`** — Chrome API wrappers. Takes pure data in, returns promises.
  - `collectGroupableTabs(windowId): Promise<Tab[]>`
  - `bucketByDomain(tabs: Tab[], settings): Map<domain, Tab[]>`
  - `applyGroups(buckets, settings, windowId): Promise<void>` — creates groups, names, colors, collapses.
  - `reorderWindow(windowId, settings): Promise<void>` — moves groups + ungrouped tabs per settings.
- **`settings.js`** — get/set with defaults. Single object shape consumed everywhere.
  - `getSettings(): Promise<Settings>`
  - `setSetting(key, value): Promise<void>`
  - `resetSettings(): Promise<void>`
  - `DEFAULTS` constant.
- **`background.js`** — wires `chrome.action.onClicked` to the above. Reads settings, iterates windows in scope, calls `collectGroupableTabs` → `bucketByDomain` → `applyGroups` → `reorderWindow`.
- **`options.js`** — listens to form input events, writes via `settings.setSetting`, shows the "Saved ✓" indicator, handles reset button.

### Permissions

`manifest.json` declares only what's needed:
- `tabs` — read titles/URLs and move tabs.
- `tabGroups` — create, name, color, collapse groups.
- `storage` — settings.

No host permissions, no `activeTab`, no scripting. The extension never reads page content.

## Edge cases

- **Ungroupable URLs** (chrome://, file://, view-source:, etc.) → skipped. Won't trigger Chrome errors.
- **Pinned tabs** → skipped from bucketing and reordering. Chrome forces them to the front anyway.
- **Tabs still loading without a URL** → skipped (defensively).
- **No bucket reaches threshold** → silent no-op. No notification, no error.
- **All tabs already grouped** → only reordering runs; that's still useful (groups get sorted).
- **A domain bucket adds to an existing group?** → No. Existing group memberships are immutable per this design. A new group is created for the new tabs even if a same-domain group already exists. (Acceptable v1 behavior; can be revisited if it bites.)
- **Settings storage failure** → fall back to `chrome.storage.local`. If both fail, fall back to in-memory `DEFAULTS` and surface a console warning. Triage still runs.
- **Hashing edge case for `pickColor`:** must use a deterministic non-cryptographic hash (e.g., FNV-1a or simple charCode sum). Crypto APIs are async and overkill here.

## Error handling philosophy

This is a personal-use tool, not a product. Errors surface to `console.error` in the service worker. No user-facing toast/notification system. The extension fails closed: if anything throws, the click becomes a no-op rather than partially-applying changes.

## Testing

### Unit tests (Vitest or Node `node:test`)

`domain.test.js`:
- `extractDomain` — happy paths (subdomains, www, ports, query strings), nulls for chrome://, file://, view-source:, malformed URLs.
- `prettyName` — single-label TLDs, multi-label TLDs, hyphens, numerics.
- `hashColor` — same input → same color across runs; distribution sanity check across a sample of 50 real domains.

`group.test.js`:
- `bucketByDomain` — threshold filtering, mix of groupable/ungroupable URLs, pinned exclusion, already-grouped exclusion.
- Pure ordering helpers (the parts of `reorderWindow` that compute the target order from a tab snapshot — extract these from the Chrome-API-using parts so they're testable).

### Manual test plan

After loading unpacked from `chrome://extensions`:

1. **Happy path:** Open 4 tabs on github.com, 3 on youtube.com, 2 on news.ycombinator.com. Click icon. → Two groups appear ("Github", "Youtube"), both collapsed, the YC tabs stay ungrouped, groups are at the front.
2. **Re-run safety:** Click icon again. → No change to existing group memberships.
3. **New tabs after triage:** Open 3 more github.com tabs (they appear ungrouped since they're new). Click icon. → A second "Github" group is created (acceptable per design), or the design is revisited.
4. **Threshold:** Set threshold to 2 in settings. Open 2 reddit.com tabs. Click icon. → Reddit group is created.
5. **Color stability:** Note GitHub's color. Open a new window, open 3 GitHub tabs, click icon. → Same color.
6. **Random color strategy:** Switch setting. → New groups get random colors, existing groups unchanged.
7. **All-windows scope:** Open 4 GitHub tabs in window A and 3 in window B. Switch scope to "all windows". Click icon (focus on either window). → Both windows get a GitHub group.
8. **Ungroupable URLs:** Open `chrome://settings` and `chrome://flags`. Click icon. → They stay ungrouped, no error.
9. **Pinned tabs:** Pin 3 github.com tabs. Open 3 more github.com tabs unpinned. → Pinned stay pinned, the 3 unpinned get grouped.
10. **Reset settings:** Open options. Click Reset. Confirm. → All controls return to defaults; `chrome.storage.sync` cleared.
11. **Sync fallback:** Disable Chrome sync. → Settings still save (to local) and persist across browser restart.

## Future extensions (not in this spec)

If the tool earns its keep, candidates for v2:
- Add new tabs to an existing same-domain group instead of creating a parallel group.
- Keyboard shortcut to trigger triage.
- Per-domain color overrides in settings.
- A "merge same-domain groups" maintenance action.
- Topic grouping (would re-introduce Claude API as opt-in).

These are explicitly NOT in v1.
