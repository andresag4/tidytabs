# tidytabs — Claude Code instructions

Chrome extension (Manifest V3): **group your tabs by domain in one click**, with
ticket-aware grouping (Jira `FE-3333` / GitHub `#1234` IDs in titles). v0.1.x, zero
runtime dependencies, plain ES modules — keep it that way unless there's a strong reason.

## Architecture (popup-driven, minimal worker)

- `src/popup.js` → thin UI layer; every user action delegates to `src/actions.js`.
- `src/actions.js` → the orchestrator (`handleTidy()` etc.): wires domain extraction,
  triage, settings, clipboard together. New behavior usually lands here + a module.
- `src/background.js` → **intentionally minimal** service worker; exists only so the
  manifest has a valid module. Don't grow it without a real MV3 reason (events that
  must outlive the popup).
- Core modules (each with a matching `test/*.test.js`):
  - `domain.js` — domain extraction + `prettyName` + group `COLORS`
  - `group.js` — the grouping engine (`runTriage`, `runTicketTriage`)
  - `ticket.js` — Jira/GitHub ticket-ID matching (2+ digits required to skip noise)
  - `settings.js` — `DEFAULTS` (frozen) + storage-backed get/set/reset
  - `clipboard.js` + `offscreen.js`/`offscreen.html` — MV3 clipboard writes need an
    offscreen document; that's the only reason offscreen exists
  - `contextmenu.js`, `options.js` — context-menu + options page

## Commands

```bash
npm test                # node --test 'test/*.test.js' — 110 tests, must stay green
node scripts/generate-icons.js   # regenerate icons/
```

Manual run: chrome://extensions → Developer mode → **Load unpacked** → this folder.
Reload the extension after changes (popup/options reload on reopen; worker needs the ⟳).

## Conventions

- **TDD-friendly modules**: logic lives in pure, importable functions; Chrome APIs are
  touched at the edges (`actions.js`, `popup.js`). Keep new logic testable without Chrome.
- **Zero deps** — stdlib `node --test`, no bundler, no framework. ES modules throughout.
- Commit style: `feat(scope): …` / `fix(scope): …` (see git log).
- Permissions in `manifest.json` are deliberately scoped (`tabs`, `tabGroups`, `storage`,
  `clipboardWrite`, `offscreen`, `scripting`, `activeTab`) — adding one is a design
  decision, not a convenience; justify it in the PR/commit message.

## Nucleus context

This is the **personal/tidytab** planet (galaxy m1, repo `~/projects/personal/tidytabs`,
github `andresag4/tidytabs`). Session memory lives in
`~/.nucleus/sessions/personal/tidytab/` — update the active session's `compact.md` at
natural stopping points.
