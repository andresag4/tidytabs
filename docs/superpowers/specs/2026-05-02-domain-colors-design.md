# Domain color presets and overrides — feature spec

**Status:** Design approved 2026-05-02
**Type:** Additive feature for the existing tidytabs Chrome extension
**Parent spec:** [2026-05-02-tab-triage-design.md](2026-05-02-tab-triage-design.md)

## Goal

When tidytabs creates a tab group for a domain, pick a color that matches the user's expectations:

1. A user-specified per-domain override wins (always).
2. Otherwise, a built-in preset for well-known brands (`github.com` → grey, `youtube.com` → red, etc.).
3. Otherwise, the existing color strategy (stable-hash / random / palette-by-order) decides.

## Non-goals

- No reuse of the preset list for ticket groups. Tickets use `hashColor` as before.
- No automatic detection of brand colors from page favicons. Just a static list.
- No color picker UI with a wheel; users pick from Chrome's 9 group colors.

## Behavior

### Built-in preset list

Chrome's tab group colors: `grey`, `blue`, `red`, `yellow`, `green`, `pink`, `purple`, `cyan`, `orange`. No black, no white. Picks below approximate brand colors as closely as Chrome allows.

| Domain | Color | Brand reasoning |
|---|---|---|
| `github.com` | `grey` | Octocat / GitHub dark UI |
| `youtube.com` | `red` | YouTube red |
| `google.com` | `blue` | Google blue |
| `gmail.com` | `red` | Gmail envelope red |
| `twitter.com` | `cyan` | Twitter blue |
| `x.com` | `grey` | X black-and-white |
| `reddit.com` | `orange` | Reddit orange |
| `stackoverflow.com` | `orange` | SO orange |
| `linkedin.com` | `blue` | LinkedIn blue |
| `facebook.com` | `blue` | Meta / FB blue |
| `amazon.com` | `orange` | Amazon orange |
| `apple.com` | `grey` | Apple silver |
| `wikipedia.org` | `grey` | Wiki neutral |
| `news.ycombinator.com` | `orange` | HN orange |
| `notion.so` | `grey` | Notion B&W |
| `figma.com` | `purple` | Figma purple |
| `linear.app` | `purple` | Linear purple |
| `atlassian.net` | `blue` | Atlassian blue |
| `slack.com` | `purple` | Slack purple |
| `discord.com` | `purple` | Discord blurple |
| `spotify.com` | `green` | Spotify green |
| `netflix.com` | `red` | Netflix red |
| `twitch.tv` | `purple` | Twitch purple |

These keys match what `extractDomain` returns (the eTLD+1 form).

### User overrides

Stored in settings as `domainColors: { [domain]: chromeColor }`. The Options page gets a new section letting the user add / edit / remove overrides.

User overrides win over both built-in presets and the global color strategy. So if the user adds `youtube.com → blue`, that's what gets used.

### `pickGroupColor` priority

```
1. settings.domainColors[domain]   (user override)
2. PRESETS[domain]                  (built-in)
3. settings.colorStrategy           (stable-hash / random / palette-by-order, existing logic)
```

## Architecture changes

### Modified files

| Path | Change |
|---|---|
| `src/domain.js` | Export `PRESETS` constant. (Pure data.) |
| `src/settings.js` | Add `domainColors: {}` to `DEFAULTS`. Validate in `applyDefaults` (drop non-object, drop entries with invalid colors). |
| `src/group.js` | Update `pickGroupColor` to consult user overrides then presets before strategy fallback. |
| `test/domain.test.js` | Test `PRESETS` shape. |
| `test/settings.test.js` | Test `domainColors` validation. |
| `test/group.test.js` | Test the new priority order in `pickGroupColor`. |
| `options.html` | New section for domain color overrides. |
| `options.css` | Styles for the override list. |
| `src/options.js` | Wire the override editor to settings. |

### `pickGroupColor` new signature

The existing signature `pickGroupColor(domain, paletteIndex, settings)` is preserved. Logic becomes:

```js
export function pickGroupColor(domain, paletteIndex, settings) {
  const overrides = (settings && settings.domainColors) || {};
  if (overrides[domain] && COLORS.includes(overrides[domain])) {
    return overrides[domain];
  }
  if (PRESETS[domain]) {
    return PRESETS[domain];
  }
  switch (settings.colorStrategy) {
    case 'random':
      return COLORS[Math.floor(Math.random() * COLORS.length)];
    case 'palette':
      return paletteColor(paletteIndex);
    case 'stable-hash':
    default:
      return hashColor(domain);
  }
}
```

### Settings shape

```js
export const DEFAULTS = Object.freeze({
  groupOrder: 'leftmost',
  ungroupedPlacement: 'end',
  domainThreshold: 3,
  autoCollapse: true,
  colorStrategy: 'stable-hash',
  scope: 'current',
  domainColors: {}  // NEW
});
```

`applyDefaults` validates `domainColors` by: copying entries where the key is a non-empty string and the value is in `COLORS`. Drops the rest.

### Options page UI

A new section at the bottom of `options.html`:

```
─── Domain color overrides ───────────────────────────
  Override the auto-assigned color for specific
  domains. Built-in defaults are listed below for
  reference; add an entry to override any of them.

  [ + Add override ]

  ┌────────────────┬────────┬──────┐
  │ example.com    │ blue ▾ │  ×   │
  │ another.com    │ red  ▾ │  ×   │
  └────────────────┴────────┴──────┘

  Built-in defaults:
  github.com → grey, youtube.com → red,
  google.com → blue, ... (full list)
──────────────────────────────────────────────────────
```

- The list is empty by default (no user overrides).
- "Add override" opens a small form: domain input + color select + Save.
- The × button removes the override.
- Built-in presets are read-only text below the editor.

## Edge cases

- **User overrides a domain to the same color as the preset:** harmless; behavior is identical.
- **User adds a malformed entry (empty domain, invalid color):** rejected silently during validation; the form should also disable Save until the inputs are valid.
- **User adds an override with leading/trailing whitespace in domain:** trimmed before storage. Empty after trim → rejected.
- **Same domain appears twice in the user list:** UI prevents this — adding a duplicate updates the existing entry.
- **Preset changes between releases:** users with no override see the new preset. Users with an override are unaffected.

## Testing

### Unit tests

`PRESETS` (in `test/domain.test.js`):
- Shape: every value is in `COLORS`.

`applyDefaults` (in `test/settings.test.js`):
- Empty `domainColors` → empty.
- Valid entries → preserved.
- Invalid color → dropped.
- Empty domain → dropped.
- Non-object → defaults to `{}`.

`pickGroupColor` priority (in `test/group.test.js`):
- User override wins over preset.
- Preset wins over stable-hash strategy.
- Strategy wins when no override or preset.

### Manual smoke test

1. **Preset works out of box:** Triage 3 github.com tabs in a fresh install. Color of group is `grey`.
2. **User override:** Open options, add `github.com → blue`. Re-triage. Group color is `blue`.
3. **Remove override:** Click × on the entry. Re-triage (in a fresh window with no existing Github group, or close + reopen the group). Color reverts to `grey`.
4. **No preset, no override:** Triage 3 tabs from an unfamiliar domain like `randomexample.org`. Color comes from strategy (hash by default).
5. **Invalid input rejected:** Try to add an override with empty domain → form refuses to save.
6. **Persistence:** Add an override, reload Chrome. Override is still there.

## Out of scope

- Importing / exporting overrides as JSON.
- Sharing overrides between profiles.
- Per-domain group name overrides (separate feature).
