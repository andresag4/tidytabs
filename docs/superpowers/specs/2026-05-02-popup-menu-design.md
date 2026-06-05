# Click-to-open popup menu — feature spec

**Status:** Design approved 2026-05-02
**Type:** Architecture change for the existing tidytabs Chrome extension
**Parent spec:** [2026-05-02-tab-triage-design.md](2026-05-02-tab-triage-design.md)

## Goal

Replace the "left-click runs default triage" + "right-click shows action menu" dual interaction with a single behaviour: **clicking the toolbar icon opens a popup containing all window-scoped actions as buttons**. The 2 tab-scoped actions stay on the tab strip's right-click menu.

This is a structural change, not a visual redesign. The popup is functional, no fancy styling.

## Non-goals

- No polished AdGuard-style UI (cards, gradients, toggles, animations) in this iteration.
- No live counters, badges, or stats.
- No settings page changes.
- No new feature actions — only existing ones are moved.

## Behavior

### Trigger

**Left-click the tidytabs toolbar icon** → popup opens. (Previously this ran triage.)

### Popup contents

Sections grouped by scope, all actions present:

```
┌───────────────────────────────────────────┐
│  tidytabs                         [⚙]     │
├───────────────────────────────────────────┤
│  Triage                                   │
│    ✨ Tidy now                            │
│    ⤵  Tidy + merge into existing groups  │
│    🎫 Group by Jira ticket               │
├───────────────────────────────────────────┤
│  This domain                              │
│    📋 Copy URLs for this domain          │
│    🔄 Force reload all tabs              │
├───────────────────────────────────────────┤
│  Current group                            │
│    🔤 Sort tabs by URL                    │
│    🕒 Sort tabs by age (oldest first)    │
│    ↗  Move group to a new window         │
├───────────────────────────────────────────┤
│  All groups                               │
│    🔤 Sort all by URL                     │
│    🕒 Sort all by age                     │
│    ➖ Collapse all                         │
│    ➕ Expand all                           │
├───────────────────────────────────────────┤
│  Other                                    │
│    👁 Toggle password visibility          │
└───────────────────────────────────────────┘
```

Settings (⚙) opens `options.html` via `chrome.runtime.openOptionsPage()`.

### Click flow

1. User clicks a button.
2. Popup invokes the corresponding action (calls into a shared `src/actions.js` module).
3. Action awaits to completion.
4. Popup closes itself via `window.close()`.

If the action is silent (no matching groups, ungroupable URL, etc.), the popup still closes — same silent-no-op pattern as before.

### What stays on tab right-click

The 2 tab-scoped items remain on `chrome.contextMenus` with `contexts: ['tab']`:
- Move tab to its domain group
- Close all other tabs on this domain

These genuinely behave differently when invoked on the right-clicked tab (vs the active tab), so they belong on the tab right-click surface.

### What's removed

- `chrome.action.onClicked` listener in `src/background.js` (Chrome ignores it when `default_popup` is set; it becomes dead code).
- All `contexts: ['action']` items in `src/contextmenu.js` (~12 items move to the popup).

## Architecture

### New files

| Path | Responsibility |
|---|---|
| `popup.html` | Popup markup — sections + buttons |
| `popup.css` | Minimal popup styling (legible, not designed) |
| `src/popup.js` | Wire button clicks to action handlers |
| `src/actions.js` | Shared action handlers, extracted from `contextmenu.js` |

### Modified files

| Path | Change |
|---|---|
| `manifest.json` | Add `"default_popup": "popup.html"` to `action`. |
| `src/background.js` | Remove the `chrome.action.onClicked` listener. Keep context-menu registration. |
| `src/contextmenu.js` | Remove all `contexts: ['action']` items and their handlers. Keep the 2 tab-context items, route only those in `handleClick`. |

### Action extraction (`src/actions.js`)

The following functions move OUT of `contextmenu.js` and INTO `actions.js`, with their bodies unchanged:

- `handleCopyUrls`
- `handleReloadDomain`
- `handleTriageMerge`
- `handleSortGroupByUrl`
- `handleSortGroupByAge`
- `handleMoveGroupToNewWindow`
- `handleSortAllGroupsByUrl`
- `handleSortAllGroupsByAge`
- `sortAllGroups` (private helper)
- `handleCollapseOrExpandAll`
- `handleTicketTriage`
- `handleTogglePasswordVisibility`

Plus a new `handleTidy` wrapper for the previous left-click default:

```js
export async function handleTidy() {
  const settings = await getSettings();
  await runTriage(settings);
}
```

(Previously this body was inline in `background.js`'s `onClicked` handler.)

All exported. `contextmenu.js` no longer has these.

### `contextmenu.js` after refactor

Slimmed down to ~50 lines:

```js
import { extractDomain, prettyName } from './domain.js';

const TAB_MOVE_TO_GROUP_MENU_ID = 'tidytabs.tabMoveToDomainGroup';
const TAB_CLOSE_OTHERS_MENU_ID = 'tidytabs.tabCloseOthersOnDomain';

export function register() {
  chrome.contextMenus.removeAll(() => {
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

async function handleClick(info, tab) {
  if (info.menuItemId === TAB_MOVE_TO_GROUP_MENU_ID) return handleTabMoveToDomainGroup(tab);
  if (info.menuItemId === TAB_CLOSE_OTHERS_MENU_ID) return handleTabCloseOthersOnDomain(tab);
}

// handleTabMoveToDomainGroup and handleTabCloseOthersOnDomain stay here
// (they need the `tab` arg specifically — not movable to actions.js cleanly)
```

### `popup.js` shape

```js
import * as actions from './actions.js';

const ACTION_MAP = {
  'tidy': actions.handleTidy,
  'tidy-merge': actions.handleTriageMerge,
  'ticket-triage': actions.handleTicketTriage,
  'copy-urls': actions.handleCopyUrls,
  'reload-domain': actions.handleReloadDomain,
  'sort-group-url': actions.handleSortGroupByUrl,
  'sort-group-age': actions.handleSortGroupByAge,
  'move-group-new-window': actions.handleMoveGroupToNewWindow,
  'sort-all-url': actions.handleSortAllGroupsByUrl,
  'sort-all-age': actions.handleSortAllGroupsByAge,
  'collapse-all': () => actions.handleCollapseOrExpandAll(true),
  'expand-all': () => actions.handleCollapseOrExpandAll(false),
  'toggle-passwords': actions.handleTogglePasswordVisibility
};

document.querySelectorAll('button[data-action]').forEach(btn => {
  btn.addEventListener('click', async () => {
    const name = btn.dataset.action;
    const fn = ACTION_MAP[name];
    if (!fn) return;
    try {
      await fn();
    } finally {
      window.close();
    }
  });
});

document.getElementById('open-settings').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
  window.close();
});
```

`window.close()` runs in the `finally` so the popup dismisses even if an action throws. The error is logged in the action handler's own try/catch.

### Why await before closing

A popup's JavaScript context can be torn down when the popup closes. Awaiting the action ensures the chrome API call resolves before tear-down. Action latency is typically 50–500ms — short enough that the user perceives "click → done" rather than "click → wait → done".

If a future action is genuinely long-running, we'd refactor to message the service worker and let it run there. For current actions, awaiting is fine.

## Manifest delta

```json
"action": {
  "default_title": "Tidy tabs",
  "default_popup": "popup.html",
  "default_icon": { ... }
}
```

`default_title` becomes the tooltip-on-hover (since there's no longer a left-click action). All existing icon and permission fields unchanged.

## Cleanup that we're NOT doing in this batch

The popup-based clipboard write could replace the offscreen-document mechanism (`navigator.clipboard.writeText` works directly from a popup context). That would let us delete `src/clipboard.js`, `src/offscreen.js`, `offscreen.html`, and drop the `offscreen` + `clipboardWrite` permissions. **Deferred** — current plumbing works, and refactoring it is its own change worth keeping isolated.

## Edge cases

- **Settings link clicked while popup is busy** → settings page opens, popup closes. Action being run via another button has already kicked off; no conflict.
- **Button clicked twice quickly** → both fire. Idempotency is up to the action; existing handlers are mostly safe (re-running triage is benign). Not worth debouncing.
- **`chrome.runtime.openOptionsPage()` from popup** → standard pattern, works as expected.

## Testing

### Unit tests

No new pure functions; no test changes. Existing 102 tests must remain green.

### Manual smoke test

1. **Click toolbar icon → popup opens** with all sections and buttons.
2. **Tidy now** → triages current window per settings; popup closes.
3. **Copy URLs for this domain** → URLs land on clipboard; popup closes.
4. **Sort tabs by URL** (current group) → active group's tabs reorder.
5. **Sort all by age** → every group's tabs reorder by lastAccessed.
6. **Collapse all / Expand all** → bulk toggle.
7. **Group by Jira ticket** → ticket-named groups appear if matches exist.
8. **Toggle password visibility** → on a login page, password becomes visible / hidden.
9. **Settings (⚙)** → opens options page.
10. **Right-click a tab in the strip** → "Move tab to its domain group" and "Close all other tabs on this domain" still appear. Click each → behaves as before.
11. **Right-click toolbar icon** → only Chrome's default items appear (Options, Manage extension, etc.) — no tidytabs custom items.

## Out of scope

- Polished UI (cards, gradients, custom layouts).
- Live counts / badges on the icon.
- Side-panel variant.
- Clipboard / offscreen-document cleanup.
