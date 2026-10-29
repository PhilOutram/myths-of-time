// The conversion curve: for each round r, the most votes a player can bank if their first
// villager is retired in round r. Every other gene is searched (random restarts plus hill
// climbing) so the curve shows what good play achieves, not what one fixed AI does.
// If the peak is in the middle of the game, the timing decision is alive; if it is at round 1
// (or at the end), the bear-off mechanic has a corner solution.
// Usage: node tools/conversion-curve.mjs [--tries 120] [--seed 1] [--set rule=value ...]
import { RULES } from "../rules-config.js?v=0.1";
import { buildMap, seededRandom } from "../maps.js?v=0.1";
import {
  DEFAULT_PERSONALITY, randomPersonality, mutatePersonality,
} from "../ai.js?v=0.1";
import { EVOLVED } from "../ai-personalities.js?v=0.1";
import { runGame, withOverrides } from "../sim.js?v=0.1";

const args = { tries: 120, seed: 1, set: [] };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 2) {
  const name = argv[i].replace(/^--/, "");
  if (name === "set") args.set.push(argv[i + 1]);
  else args[name] = Number(argv[i + 1]);
}

const rules = withOverrides(RULES, args.set);
const map = buildMap(1, 2);
const random = seededRandom(args.seed);

// Votes for g in seat 0 against the hand-tuned AI (the economy barely interacts, so the
// opponent hardly matters), counted only if g's first retirement falls in round `round`.
const score = (g, round) => {
  const game = runGame({ rules, map, personalities: [g, DEFAULT_PERSONALITY] });
  const first = game.retires[0].findIndex((n) => n > 0) + 1;
  return first === round ? game.result.votes[0] : -1;
};

export function bestFrom(round) {
  const fix = (g) => ({ ...g, convertFrom: round, assemblyFrom: Math.min(g.assemblyFrom, round) });
  const votes = (g) => score(g, round);
  const seeds = [DEFAULT_PERSONALITY, ...EVOLVED].map(fix);
  let best = seeds.map((g) => ({ g, v: votes(g) })).sort((a, b) => b.v - a.v)[0];
  for (let i = 0; i < args.tries; i++) {
    const g = fix(i % 3 === 0 ? randomPersonality(random) : mutatePersonality(best.g, random, 0.5));
    const v = votes(g);
    if (v > best.v) best = { g, v };
  }
  return best;
}

const rows = [];
for (let r = 1; r <= rules.rounds; r++) rows.push({ round: r, ...bestFrom(r) });
const peak = rows.reduce((a, b) => (b.v > a.v ? b : a));
console.log(`Conversion curve${args.set.length ? ` (${args.set.join(", ")})` : ""}`);
console.log("Start  Best votes");
for (const row of rows) {
  const bar = "#".repeat(Math.round(row.v / 4));
  console.log(`${String(row.round).padStart(5)}  ${String(row.v).padStart(10)}  ${bar}${row === peak ? "  <- peak" : ""}`);
}
const verdict = peak.round <= 2 ? "corner: convert at once"
  : peak.round >= rules.rounds - 1 ? "corner: convert at the end"
  : "interior optimum";
console.log(`Peak: start converting in round ${peak.round} for ${peak.v} votes (${verdict})`);
console.log(`Peak player: ${JSON.stringify(peak.g)}`);
