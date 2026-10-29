// The conversion curve: for each round r, the most votes a player can bank if their first
// villager is retired in round r. Every other gene is searched (random restarts plus hill
// climbing) so the curve shows what good play achieves, not what one fixed AI does.
// If the peak is in the middle of the game, the timing decision is alive; if it is at round 1
// (or at the end), the bear-off mechanic has a corner solution.
// Usage: node tools/conversion-curve.mjs [--tries 120] [--seed 1] [--set rule=value ...]
//
// evolve.js imports conversionCurve() to seed its starting pool, so the search lives here
// and the command line is only a way of printing it.
import { pathToFileURL } from "node:url";
import { RULES } from "../rules-config.js";
import { buildMap, seededRandom } from "../maps.js";
import {
  DEFAULT_PERSONALITY, randomPersonality, mutatePersonality,
} from "../ai.js";
import { EVOLVED } from "../ai-personalities.js";
import { runGame, withOverrides } from "../sim.js";

const DEFAULT_TRIES = 120;
const RESTART_EVERY = 3;   // one try in this many starts from a fresh random player
const MUTATION_RATE = 0.5; // the rest are mutations of the best found so far
const BAR_PER_HASH  = 4;   // votes per "#" in the printed chart
const CORNER_EDGE   = 2;   // a peak this close to either end counts as a corner solution

// Votes for g in seat 0 against the hand-tuned AI (the economy barely interacts, so the
// opponent hardly matters), counted only if g's first retirement falls in round `round`.
function score(rules, map, g, round) {
  const game = runGame({ rules, map, personalities: [g, DEFAULT_PERSONALITY] });
  const first = game.retires[0].findIndex((n) => n > 0) + 1;
  return first === round ? game.result.votes[0] : -1;
}

// The best player found whose first retirement falls in `round`.
export function bestFrom(round, { rules, map, tries, random }) {
  const fix = (g) => ({
    ...g, convertFrom: round, assemblyFrom: Math.min(g.assemblyFrom, round),
  });
  const votes = (g) => score(rules, map, g, round);
  const seeds = [DEFAULT_PERSONALITY, ...EVOLVED].map(fix);
  let best = seeds.map((g) => ({ g, v: votes(g) })).sort((a, b) => b.v - a.v)[0];
  for (let i = 0; i < tries; i++) {
    const g = fix(i % RESTART_EVERY === 0
      ? randomPersonality(random)
      : mutatePersonality(best.g, random, MUTATION_RATE));
    const v = votes(g);
    if (v > best.v) best = { g, v };
  }
  return best;
}

// One row per round: { round, g, v }.
export function conversionCurve({ rules = RULES, tries = DEFAULT_TRIES, seed = 1, map } = {}) {
  const random = seededRandom(seed);
  const board = map || buildMap(1, 2);
  const rows = [];
  for (let r = 1; r <= rules.rounds; r++) {
    rows.push({ round: r, ...bestFrom(r, { rules, map: board, tries, random }) });
  }
  return rows;
}

export function curveReport(rows, rules, overrides = []) {
  const peak = rows.reduce((a, b) => (b.v > a.v ? b : a));
  const lines = [
    `Conversion curve${overrides.length ? ` (${overrides.join(", ")})` : ""}`,
    "Start  Best votes",
  ];
  for (const row of rows) {
    const bar = "#".repeat(Math.max(0, Math.round(row.v / BAR_PER_HASH)));
    lines.push(`${String(row.round).padStart(5)}  ${String(row.v).padStart(10)}  ` +
      `${bar}${row === peak ? "  <- peak" : ""}`);
  }
  const verdict = peak.round <= CORNER_EDGE ? "corner: convert at once"
    : peak.round >= rules.rounds - 1 ? "corner: convert at the end"
      : "interior optimum";
  lines.push(`Peak: start converting in round ${peak.round} for ${peak.v} votes (${verdict})`);
  return lines.join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = { tries: DEFAULT_TRIES, seed: 1, set: [] };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i].replace(/^--/, "");
    if (name === "set") args.set.push(argv[i + 1]);
    else args[name] = Number(argv[i + 1]);
  }
  const rules = withOverrides(RULES, args.set);
  const rows = conversionCurve({ rules, tries: args.tries, seed: args.seed });
  const peak = rows.reduce((a, b) => (b.v > a.v ? b : a));
  console.log(curveReport(rows, rules, args.set));
  console.log(`Peak player: ${JSON.stringify(peak.g)}`);
}
