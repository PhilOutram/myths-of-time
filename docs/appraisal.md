# Appraisal: is this the right build?

29 October 2026, before any v0.2 work. Written from reading every file, running the tests
and the simulator, and measuring the running app in a browser at 390 px.

## Verdict

Keep it vanilla. Do not move to React plus Vite.

The app is not slow, and the places where it could become slow are not places a framework
helps. The architecture that matters (a pure rules engine that the game, the simulator, the
evolution tool and the future network server all share) is already right, and it is the part
a rewrite would put at risk.

There are four real problems to fix and one design question for the board game. None of them
is "the wrong framework".

## Does the app need React and Vite?

### What the app actually costs today

Measured in a browser at 390 x 844, two-player map, after a full AI turn:

| What | Measurement |
|---|---|
| Full `render()` (board plus all four panels) | 9.3 ms |
| `drawBoard` alone, 2-player map (70 hexes, 386 SVG nodes) | 4.1 ms |
| `drawBoard` alone, 3-player map (100 hexes, 551 nodes) | 6.0 ms |
| Long tasks (over 50 ms) during a whole AI turn | none |
| Frame time during an AI turn | 16.7 ms median, 29.3 ms at the 95th percentile |
| `node --test` | 18 of 18 pass, 249 ms |
| `node sim.js --games 50` | 1.3 s |
| Saved game in `localStorage`, round 2 | 9.5 KB, 0.06 ms to write |

A phone is roughly three to five times slower than this machine, so a tap costs about 30 to
50 ms there. The threshold at which a tap stops feeling instant is about 100 ms. There is no
performance problem to solve.

### What React would and would not change

React would not make any of the above faster. React's value is that it works out the minimum
set of DOM changes for you; it does not perform them more cheaply than hand-written code, and
reconciling a 4,000-node SVG tree costs more than the imperative code in `board.js` costs now.

React would genuinely tidy one thing. `game.js` builds its panels with `innerHTML` and then
has to keep a `pendingOptions` map of id-to-callback so the rebuilt buttons can find their
handlers again (`game.js:139-147`, `game.js:303-311`). That is the one awkward piece of the
UI code, and components would remove it. It is worth perhaps a hundred lines of tidiness. It
is not worth a rewrite, and it is not what makes a phone feel slow.

### Why the phone feels slow, and why that is not about React

I have not measured Mech Attack, so this is a read of the likely cause rather than a finding.
Zoom and pan feel bad on a phone for three reasons, and all three are rendering decisions
rather than framework decisions:

1. The board is rebuilt from scratch instead of being moved. If a pinch gesture triggers a
   rebuild of every hex, it will stutter however the code is written.
2. Large PNGs are re-rasterised at each new scale. Five tile images at 192 x 166 drawn into
   70 hexes means the browser re-rasterises on every zoom step.
3. The gesture is driven off raw touch events rather than being coalesced into one update per
   animation frame.

The fix for all three is the same in any framework: keep the board DOM alive, move it with a
transform, and only redraw when the state actually changes. React does not do that for you.
If it would help, I can measure Mech Attack directly and confirm or correct this.

### What Vite would buy, and the cheaper way to get it

Vite would give hot reload, npm packages, bundling and TypeScript. Against that, the no-build
rule is doing real work in this project:

- `engine.js` runs unchanged in the browser, in `node sim.js`, in `node evolve.js` and in the
  LAN server that is still to be written. One file, one set of rules, no compilation step
  between the game and the simulator that balances it.
- Publishing is `git push`. A build step introduces a way for the live site to differ from
  what you tested, on a project whose entire deployment story is a GitHub Pages subpath.
- The service worker caches named files. Bundling changes what those files are.

The two things worth having from Vite's list can both be had without a build:

- **Type checking.** JSDoc comments plus `tsc --noEmit --checkJs` type-checks plain JavaScript
  without ever emitting a file. The engine's state shape is exactly the kind of thing that
  benefits, and it will matter more as factions, conflict and the map arrive. This is blocked
  today by the `?v=0.1` query strings in the import lines, which TypeScript cannot resolve.
  Fixing those (below) unblocks it.
- **A dev loop.** `python -m http.server` plus a refresh is adequate for a game you play in
  turns. Hot reload matters for a form-heavy app, much less for this.

### When to revisit

Move to a build step when one of these is true, not before:

- The map grows past roughly 300 hexes **and** incremental board updates are not enough (see
  problem 3 below for the numbers).
- You want a real-time animated board rather than a turn-based one.
- Two-player network play needs a shared package between the browser and the server, and
  copying `engine.js` stops being good enough.

## What is already right

Worth saying plainly, because these are the decisions that are expensive to change later and
they have been made well.

- **The engine is pure.** No DOM, no `window`, no timers, `applyAction` returns a new state,
  state is plain JSON. This is why the simulator exists at all, and why the LAN server will be
  straightforward.
- **Rules are data.** `rules-config.js` holds every cost and switch, and `sim.js --set` can
  override any of them for one run. Balance work never touches engine code. This is the single
  best decision in the repo for a board game still in design.
- **Undo by replay.** `undo()` replays the round without one action rather than keeping an
  inverse for each action type. It is already correct for concurrent play, which is the hard
  case, and it has tests for both modes.
- **Maps are fair by construction.** Symmetry rather than balancing by hand, and
  `mapProblems()` asserts it in the tests.
- **Tests exist and cover rules, not plumbing.** 18 of them, one per rule, all passing.

## What is wrong, in the order I would fix it

### 1. The top bar collides on a phone

`docs/HANDOVER.md` lists this as fixed but unchecked. It is not fixed. At 390 px:

- `.bar-stock` needs 143 px and is given 53 px.
- The wood and votes figures are painted underneath the Undo button. `elementFromPoint` at
  the centre of the wood figure returns the Undo button, so tapping your wood count presses
  Undo.

You cannot read your wood or your votes on a phone, and a mis-tap takes back your last move.
This is the most important thing in the list because it makes the game unplayable on the
device it is meant for.

The panel fix that was applied (`.game` column `minmax(0, 1fr)`, `.panel` `overflow-x: hidden`)
was correct, but it fixed a different element.

### 2. There is no zoom or pan, and the hexes are too small to tap

The board is scaled to fit the window on every draw (`board.js:77`), so at 390 px a hex is
38 x 33 px on screen. Apple and Google both put the minimum tap target at around 44 px, and
there is no way to zoom in.

This and problem 1 are the two things standing between the app and being usable for the
playtesting it was built for.

### 3. The board is rebuilt from scratch on every tap

`drawBoard` calls `root.replaceChildren()` and recreates every element (`board.js:78`). Today
that costs 4 ms and does not matter. It matters for two reasons:

- It is why zoom and pan cannot simply be added. Any scroll or zoom state would be destroyed
  on every tap, and a gesture that rebuilt the board would stutter.
- It sets the ceiling for the map and exploration phase. Measured on this machine:

| Board | Hexes | SVG nodes | `drawBoard` | Estimated on a phone |
|---|---|---|---|---|
| 2 players, today | 70 | 386 | 4.1 ms | ~16 ms |
| 3 players, today | 100 | 551 | 6.0 ms | ~24 ms |
| One continent, radius 10 | 331 | 1,691 | 17.6 ms | ~70 ms |
| One continent, radius 16 | 817 | 4,121 | 38.7 ms | ~155 ms |

So the current approach has about three times' headroom and then it stops being acceptable.

The fix is to split the board into layers: terrain and sphere borders change rarely and should
be built once and kept; villagers, buildings and highlights are the only things that change
per action. That is a contained change to `board.js` and it is what makes smooth zoom and pan
possible afterwards.

### 4. Publishing needs 32 hand edits, and they block type checking

Every module imports its neighbours as `./engine.js?v=0.1`. There are 32 such strings across
11 files, and the publish checklist in `CLAUDE.md` requires changing all of them by hand on
every release. One missed line means a module loads at the old version and the bug is both
invisible and intermittent.

An import map in `index.html` fixes this. The modules import `./engine.js` with no query, and
one block in `index.html` maps each name to its versioned URL. I have tested this:

- The browser requests `lib.js?v=0.2`, so the service worker cache keys are unchanged.
- Node resolves the same files from the plain relative paths, so `sim.js` and `evolve.js` are
  unaffected.
- TypeScript can then resolve the imports, which unblocks `tsc --checkJs`.

That turns 32 edits per publish into one.

### 5. Saved games are never version-checked

`engine.js` defines and writes `STATE_FORMAT`, and nothing ever reads it. `game.js` loads
whatever is in `localStorage` and plays it. When v0.2 changes a rule or the state shape, a
player resuming a v0.1 game will either play by stale rules without being told or hit an
exception on a screen with no way out. The fix is a few lines in `load()`: check `format`,
and discard the save with a message when it does not match.

Related, and by design rather than broken: a resumed game keeps the rules it was started with,
because `state.rules` is serialised into the save. That is probably what you want for a game
in progress, but it should be a decision rather than an accident.

### 6. Nearly 1 MB to install offline

The service worker precaches 871 KB, of which 645 KB is art. The five terrain tiles are
288 KB between them, at 192 x 166 pixels each. That is about two bytes per pixel, which means
they are near-uncompressed PNGs. The same images as WebP at quality 80 would be roughly 6 to
10 KB each, so the whole art set would come down to something like 150 KB with no visible
loss. Every image is individually under the 200 KB that `CLAUDE.md` asks for; the total is the
problem, on a phone installing over mobile data.

### 7. A design question: the last eight rounds are empty

This one is for the board game, not the code, and it is what the simulator is for.

In `node sim.js --games 50` with the hand-tuned AI, the average game looks like this: income
rises to a peak of 10 in round 9, villagers are retired at 2 a round through rounds 10, 11 and
12, and from round 12 onwards income is zero, purchases are zero and nothing happens for the
remaining eight rounds. Forty per cent of a 20-round game is watching Electors bank a vote
each.

The handover already notes this from the evolution runs and reads it as evolution getting
stuck. The simulator says it is not only the evolved players: it is what the hand-tuned AI
does too, and it follows from the rules. Once a villager is more valuable as a vote than as a
worker, there is no reason to keep an economy, and nothing to spend on afterwards.

That is worth deciding before tuning the dials in next step 4, because it changes what you are
tuning for. Options, briefly: Electors could cost upkeep; the vote rate could rise with the
size of the settlement that seated them; retiring could be capped per round by Assembly size;
or the game could simply be shorter than 20 rounds.

## What I would do about the plan

The handover's next steps 2 and 3 are still the right next steps. I would put two things in
front of them and one thing between them:

1. **Fix the top bar** (problem 1). It is small and it blocks playtesting.
2. **Layer the board, then add pinch zoom and pan** (problems 2 and 3). Done in that order,
   because the layering is what makes the gesture cheap.
3. **Import map** (problem 4), before the v0.2 publish rather than after, so the publish
   itself gets simpler.
4. Then the handover's step 3: seed evolution from the conversion curve, run it, commit
   `ai-personalities.js`, write `docs/simulation.md`.
5. **Save-format check** (problem 5) must land in the same release as any rules change.
6. **Convert the art to WebP** (problem 6). Independent of everything else.
7. Put problem 7 to Phil as a rules question before the dial experiments in step 4.
