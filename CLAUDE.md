# Myths of Time

Myths of Time is Phil's board game in design: build a settlement, grow its economy, then retire villagers into an Assembly as Electors who bank votes every round. Most votes after 20 rounds wins. This repo is its digital version, built on the same pattern as Phil's Mech Attack app (github.com/PhilOutram/mech-attack):

1. a playable game in the browser against AI empires
2. a headless simulator and an evolution tool for testing rule variants
3. later: two-player over a local network (both playing at once, live updates, undo on clashes), then factions, map and conflict

The design documents live in the Claude Project "Myths of Time - AI Board Game" (`design/current-state.md`, `design/digital-sim-plan.md`, `design/endgame-bear-off.md`, `design/play-model-options.md`, `design/mechattack-conflict-mechanic.md`). The original art and spreadsheets are in `C:\Users\phil_\OneDrive\SHARED - FamilyO - LOCAL\Games\Myths of Time`. Read `docs/HANDOVER.md` for where the build is up to.

## Working with Phil
- Windows 11, PowerShell. Give commands in PowerShell syntax.
- British English in all text, comments and UI.
- Concise, technically precise, honest about trade-offs.
- No "AI speak" in docs, UI text or commit messages. Headings state the point plainly. Avoid paired double-clause constructions such as "Two stories, and they point opposite ways".
- When a rule is undecided, ask Phil rather than inventing it silently. If you have to pick something to keep going, put it in `rules-config.js`, mark it provisional and list it in `docs/rules.md`.

## Decisions so far (Phil, 29 October 2026)
- Two resources to start: wheat and wood.
- Players take turns (simple) for play against the AI.
- First opponent: a rival AI empire (one or two of them).
- Target after that: two-player over a local network, both humans playing at the same time, seeing each other's moves live; if one takes a tile the other wanted, they talk and the first undoes. The AI empires are the opponents. No secret-orders "big reveal".
- Mountains produce iron and can be entered.
- The jester token: unknown, ignore for now.

## App conventions
- Plain HTML, CSS and JavaScript ES modules. No build step, no framework, no bundler.
- Hosted on a GitHub Pages subpath (`/myths-of-time/`), so all paths are relative. Never start a path with `/`.
- Installable PWA with an offline service worker (`sw.js`).
- Mobile first: works on a phone and a tablet in portrait, and on a desktop browser.
- Theme: dark parchment; colour tokens on `:root` in `styles.css`; title font Cinzel.

## Every publish
1. Bump `VERSION` in `version.js` and prepend a `CHANGELOG` entry (newest first, YYYY-MM-DD).
2. Update every `?v=` number to match: the `<link>`, the `<script src>` and the import map in `index.html`, and `V` in `sw.js`. Modules import each other by plain name (`./engine.js`), so no `import` line ever changes.
3. Update `CACHE` in `sw.js`.
4. Add every new module to the import map in `index.html` and to `MODULES` in `sw.js`; add every other new file the app needs offline to `ASSETS` in `sw.js`.

## Architecture
Rules are written once and shared by the game, the AI and the simulator:
- `engine.js`: pure rules. No DOM, no `window`, no timers. `applyAction(state, action)` returns a new state. State is plain JSON. Every action names its `player`, and `turnMode` is `"alternate"` (turns) or `"concurrent"` (everyone at once, for network play). `undo(state, p)` takes back p's last action by replaying the round from `roundStart` without it, so one player's undo never disturbs another's moves.
- `rules-config.js`: every cost, rate and rule switch as data.
- `maps.js`: seeded maps. Settlements 6 hexes apart so ring-3 spheres share a 4-tile contested edge; every seat gets the same terrain by symmetry.
- `ai.js`: picks actions using only engine functions. Behaviour comes from a personality (genes).
- `sim.js`: AI vs AI headless (`node sim.js --games 200`). `evolve.js` breeds personalities. `tools/conversion-curve.mjs` finds the best votes for each round of first retirement.
- UI: `index.html`, `app.js` (menu), `game.js` (game screen), `board.js` (SVG board), `dialog.js`.

## Art
`tools/extract-art.py <Myths of Time folder>` cuts tiles (Explore and Conquer map pages), tokens (`Units/AI Units.png`) and buildings (`Units/*.png`) into `art/`. Never modify the originals on OneDrive. Keep each web image well under 200 KB.

## Testing
- `node --test` runs the engine and map tests. Every rule gets a test.
- After a rules change, run the simulator and the conversion curve and report how the numbers moved.
- Check UI changes in a real browser at phone and desktop widths: `python -m http.server 8000`, since ES modules do not load from `file://`.
