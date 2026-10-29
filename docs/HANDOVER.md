# Handover: where the build is up to (29 October 2026, v0.2)

Started in a Claude cloud session, moved to Claude Code. Plan: `design/digital-sim-plan.md` in
the Claude Project. Phase 1 (scaffold) and phase 2 (core loop) are done and published.

Live: **https://philoutram.github.io/myths-of-time/**
Repo: **https://github.com/PhilOutram/myths-of-time**

## Done

- **Engine** (`engine.js`): the core loop. Wheat and wood, villagers with escalating price,
  Mill, Sawmill, Warehouse, Assembly, rings 2 and 3, retiring villagers as Electors, storage
  limits, votes, 20 rounds, 2 or 3 players. Turn mode and concurrent mode. Per-player undo by
  replaying the round.
- **Maps** (`maps.js`): seeded, fair by symmetry, 2 or 3 players, ring-3 spheres share a
  contested edge.
- **Tests**: 18 engine and map tests, all passing (`node --test`).
- **AI** (`ai.js`): genes for conversion timing, recruitment, buildings, rings and patience.
  `ai-personalities.js` holds the bred champions, used by the "Champion" menu option.
- **Simulator** (`sim.js`), **evolution** (`evolve.js`), **conversion curve**
  (`tools/conversion-curve.mjs`). Findings written up in `docs/simulation.md`.
- **Browser game**: menu, setup, board with Phil's art, tile actions, settlement panel,
  scores, log, undo, save and resume, game-over screen.
- **Board view** (v0.2): pinch, drag, wheel and buttons zoom and pan. The view is a transform
  on the board's root `<g>`, so a gesture never rebuilds the DOM and taps keep hitting the
  right hex. Terrain is built once per map; only the pieces redraw.
- **Art**: `tools/extract-art.py` cuts 5 terrain tiles, 40 tokens and 4 buildings (provisional
  stand-ins). The Warehouse is a drawn placeholder.
- **Published**: public repo and GitHub Pages from `main` / (root).

## Verified in a browser

At 390 px and 1280 px, measured rather than eyeballed:

- Top bar: all three figures readable at 390 px, nothing under the buttons.
- Hexes 56 x 48 px on a phone (44 is the tap minimum), 88 x 76 px on a 1280 px desktop.
- Full redraw 3.8 ms; no long tasks during a whole AI turn.
- Gestures: the hex under a pinch midpoint and under the wheel cursor both stay put, and a
  drag moves the board 1:1 with the pointer.
- A drag that ends over a hex does not count as a tap; a 3 px wobble still does.

On the live site: every module resolves on the `/myths-of-time/` subpath, the import map
works there, the service worker activates and precaches all 33 assets, and a game plays.

## Not done yet

1. **Offline has not been tried on a real phone.** On the live site the service worker
   registers with the right scope (`/myths-of-time/`), activates, and all 33 precached URLs
   are servable from cache `myths-of-time-v0.2`, so the mechanism works. What is untested is
   the part only a phone can test: install it to the home screen, turn the network off, and
   play a round.
2. **Art weight.** 871 KB is precached for offline, 645 KB of it art. The five terrain tiles
   are 288 KB between them at 192 x 166 px, which is close to uncompressed. As WebP at quality
   80 the whole set would be roughly 150 KB. Every file is individually under the 200 KB that
   `CLAUDE.md` asks for; it is the total that hurts on mobile data.
3. **Two AI genes do nothing.** `convertFrom` has no effect at or below `assemblyFrom`. See
   `docs/simulation.md`. Worth fixing before the next breeding run, but it invalidates the
   personalities currently committed.

## What the simulator says

Full write-up in `docs/simulation.md`. The short version:

- Converting has an interior optimum at round 11 of 20, worth 99 votes, against 40 for
  converting at once and 15 for converting at the end. The decision is real.
- The plateau is wide: rounds 9 to 13 all score 90 to 99. The decision is soft.
- Under best play the last seven rounds contain no decision at all. This is the biggest open
  question for the board game and it is a rules question, not an AI one.
- Ring 2 gates the whole economy. The hand-tuned AI sits at zero free tiles from round 3 to 8.
- Three independent searches put good play at about 100 votes. Use that as the anchor when
  turning dials.

## Next steps, in order

1. **Put the dead rounds to Phil.** `docs/simulation.md` lists four options, cheapest first
   (a shorter game). This changes what the dials are being tuned for, so it comes before them.
2. **Dial experiments**, one change at a time, with the conversion curve after each. Does the
   peak move, and does the plateau narrow?
   `--set ringUpgrades.2.wheat=6 --set ringUpgrades.2.wood=6`, then
   `--set yield.improved=3`, `--set villager.coefficient=2`,
   `--set buildings.assembly.seats=2`, `--set rounds=14`.
3. **Art to WebP**, and verify the PWA installs offline on a real phone.
4. **Two-player over the local network**: a dependency-free Node server (`node lan-server.js`)
   that serves the app, holds the authoritative state with `turnMode: "concurrent"`, streams
   updates by Server-Sent Events and takes actions by POST. AI seats run on the server.
   Players join from phones at `http://<laptop-ip>:8000`. The engine already supports this;
   the undo-by-replay was built for it.
5. Then phase 3 onwards: more interaction on the contested edge, map and exploration, two
   factions, bandits.

## Working on it (PowerShell)

```powershell
cd C:\Dev\mini-games\myths-of-time
node --test                                   # 18 engine and map tests
node sim.js --games 200                       # AI self-play summary
node tools/conversion-curve.mjs --tries 500   # the conversion curve, about 4 minutes
node evolve.js --generations 60 --population 48 --curve 60
python -m http.server 8000                    # then open http://localhost:8000
```

ES modules do not load from `file://`, so the game needs the server to run locally.

To publish an update, follow the "Every publish" checklist in `CLAUDE.md`, then
`git push`. Pages redeploys from `main` on its own.
