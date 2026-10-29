# Handover: where the build is up to (29 October 2026)

Started in a Claude cloud session, moved to Claude Code. Plan: `design/digital-sim-plan.md` in the Claude Project. This covers phase 1 (scaffold) and most of phase 2 (core loop).

## Done
- **Engine** (`engine.js`): the core loop. Wheat and wood, villagers with escalating price, Mill, Sawmill, Warehouse, Assembly, rings 2 and 3, retiring villagers as Electors, storage limits, votes, 20 rounds, 2 or 3 players. Turn mode and concurrent mode. Per-player undo by replaying the round.
- **Maps** (`maps.js`): seeded, fair by symmetry, 2 or 3 players, ring-3 spheres share a contested edge.
- **Tests**: 18 engine and map tests, all passing (`node --test`).
- **AI** (`ai.js`): genes for when to start converting, how many a round, when to stop recruiting, when to build an Assembly, wheat/wood balance, patience, and a weight per purchase. Retires everyone left in the final round.
- **Simulator** (`sim.js`), **evolution** (`evolve.js`), **conversion curve** (`tools/conversion-curve.mjs`).
- **Browser game**: menu, setup (1 or 2 AI empires, champion or hand-tuned AI, map number), board with Phil's tile, token and building art, tile actions, settlement panel, scores, log, undo, save and resume, game-over screen. Smoke-tested in Chromium at 390 px and 1280 px: a full turn and an AI turn play with no script errors.
- **Art**: `tools/extract-art.py` cuts 5 terrain tiles, 40 tokens (10 figures × 4 colours) and 4 buildings (Castle = settlement, Farm = Mill, Sawmill, Gatehouse = Assembly; provisional stand-ins). The Warehouse is a drawn placeholder.

## Not done yet
1. **`ai-personalities.js` is empty**, so "Champion" in the menu falls back to the hand-tuned AI. Run evolution and commit the result (see the evolution problem below first).
2. **Phone layout**: the panel overflowed sideways at 390 px; a fix is in (`.game` column `minmax(0, 1fr)`, `.panel` `overflow-x: hidden`) but has not been checked in a browser.
3. **Not yet published**: no GitHub repo or Pages site yet.
4. `docs/simulation.md` needs writing up from the results below.

## Simulator findings so far (v0.1 rules)

**The conversion decision has an interior optimum, but a flat one.** Best votes for each round in which the first villager is retired (`node tools/conversion-curve.mjs --tries 500`, best of 4 search seeds):

| First retired in round | 1–3 | 4–8 | 9–11 | 12–13 | 14 | 16 | 18 | 20 |
|---|---|---|---|---|---|---|---|---|
| Best votes | 40–54 | 81–87 | **98–100** | 90–96 | 80–83 | 57–60 | 32–33 | 15–16 |

So converting from round 9–11 is best, which matches spreadsheet v3's round 10. But anything from round 4 to round 13 is within about 20% of the best, so the timing decision is soft. Worth testing whether a steeper engine (improved yield 3, cheaper ring 2) sharpens the peak.

**Plain evolution gets stuck.** `node evolve.js --generations 40 --population 32` found an early-conversion strategy worth 84 votes: 6 Electors by round 8, no ring 2, then nothing to do for 12 rounds. The conversion-curve search found 99–100 by converting around round 10. Evolution needs either seeding from the curve's best players, more generations, or a bigger population before its output is trusted.

**The economy compounds weakly.** Income goes from 5 in round 1 to a peak of about 7–10. Spreadsheet v3 targeted around 11× growth. Ring 1 is the squeeze: once a Mill and Sawmill take 2 of its 6 tiles, villagers go idle until ring 2 (cost 20), and a quarter of rounds end with no free tile.

**Spreadsheet note:** v3's Curve sheet counts a purchase's income in the same round it is bought from, so it runs about one round ahead of any real turn order. Small, but it flatters the early game.

## Next steps, in order
1. Create the GitHub repo and publish to Pages (see below).
2. Check the phone layout in a browser; fix what is left.
3. Seed evolution with the conversion curve's best players, run it, commit `ai-personalities.js` and `docs/evolution.md`, and write `docs/simulation.md`.
4. Dial experiments, one change at a time, with the conversion curve after each: `--set villager.coefficient=2`, `--set buildings.assembly.seats=2`, `--set yield.improved=3`, `--set ringUpgrades.2.wheat=6 --set ringUpgrades.2.wood=6`. Question: does the peak move, and does it get sharper?
5. Two-player over the local network: a small dependency-free Node server (`node lan-server.js`) that serves the app, holds the authoritative state with `turnMode: "concurrent"`, streams updates to every browser (Server-Sent Events) and takes actions by POST. AI seats run on the server. Players join from phones at `http://<laptop-ip>:8000`. The engine already supports this; the undo-by-replay was built for it.
6. Then phase 3 onwards from the plan: more interaction (the contested edge), map and exploration, two factions, bandits.

## Moving it to your PC and GitHub (PowerShell)
```powershell
# 1. Unzip next to your mech-attack clone, e.g.
Expand-Archive "$env:USERPROFILE\OneDrive\SHARED - FamilyO - LOCAL\Games\Myths of Time\myths-of-time.zip" -DestinationPath "C:\Users\phil_\source"
cd C:\Users\phil_\source\myths-of-time
git log --oneline          # the history came with the zip

# 2. Create the empty repo PhilOutram/myths-of-time on github.com (no README), then:
git remote add origin https://github.com/PhilOutram/myths-of-time.git
git push -u origin main

# 3. GitHub: Settings > Pages > Deploy from branch > main, / (root)
#    The game is then at https://philoutram.github.io/myths-of-time/

# 4. Try it locally
node --test
node sim.js --games 50
python -m http.server 8000   # then open http://localhost:8000

# 5. Start Claude Code here
claude
```

First message to Claude Code:

> Read CLAUDE.md and docs/HANDOVER.md. Then do next steps 2 and 3: check the phone layout at 390 px and fix it, then seed evolution with the conversion curve's best players, run it, commit the personalities, and write docs/simulation.md with the findings. Publish as v0.2.
