// Headless simulator: the AI plays itself and the results are summed up.
// Usage: node sim.js [--games 200] [--seed 1] [--players 2] [--ai default|evolved]
//                    [--set rule.path=value ...] [--json results.json]
//   --games    number of games (default 200); game i is played on map seed + i
//   --players  2 or 3 (default 2)
//   --ai       default (hand-tuned) or evolved (the best from ai-personalities.js)
//   --set      override a rule for this run, e.g. --set villager.coefficient=2 (repeatable;
//              the value is read as JSON, so numbers, true/false and null work)
// The first player rotates between games so no seat always starts.
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { RULES } from "./rules-config.js?v=0.1";
import { buildMap } from "./maps.js?v=0.1";
import { newGame } from "./engine.js?v=0.1";
import { planTurn, DEFAULT_PERSONALITY } from "./ai.js?v=0.1";
import { EVOLVED } from "./ai-personalities.js?v=0.1";

const PURCHASES = ["recruit", "build", "upgrade"];

// Plays one game. personalities: one per seat.
export function runGame({ rules = RULES, map, personalities, firstPlayer = 0, seed = 1 }) {
  const players = personalities.map((g, i) => ({ name: g.name || `AI ${i + 1}`, ai: true }));
  let state = newGame({ rules, map, players, firstPlayer, seed });
  const n = players.length;
  // Per player, per round (index round - 1).
  const purchases = Array.from({ length: n }, () => Array(rules.rounds).fill(0));
  const retires = Array.from({ length: n }, () => Array(rules.rounds).fill(0));
  const built = Array.from({ length: n }, () => ({}));
  while (!state.result) {
    const p = state.current;
    const round = state.round;
    const { actions, state: after } = planTurn(state, p, personalities[p]);
    for (const a of actions) {
      if (PURCHASES.includes(a.type)) purchases[p][round - 1] += 1;
      if (a.type === "retire") retires[p][round - 1] += 1;
      if (a.type === "build") built[p][a.building] = (built[p][a.building] || 0) + 1;
    }
    state = after;
  }
  return {
    seed,
    firstPlayer,
    result: state.result,
    history: state.history,
    purchases,
    retires,
    built,
  };
}

// A copy of rules with "a.b.c=value" overrides applied.
export function withOverrides(rules, overrides = []) {
  const out = structuredClone(rules);
  for (const item of overrides) {
    const eq = item.indexOf("=");
    if (eq < 0) throw new Error(`--set needs path=value, got ${item}`);
    const path = item.slice(0, eq).split(".");
    let value = item.slice(eq + 1);
    try {
      value = JSON.parse(value);
    } catch {
      // Plain string.
    }
    let node = out;
    for (const part of path.slice(0, -1)) {
      if (!(part in node)) throw new Error(`Unknown rule ${item}`);
      node = node[part];
    }
    if (!(path.at(-1) in node)) throw new Error(`Unknown rule ${item}`);
    node[path.at(-1)] = value;
  }
  return out;
}

export function runMany({ games, seed = 1, players = 2, rules = RULES, personalities }) {
  const out = [];
  for (let i = 0; i < games; i++) {
    out.push(runGame({
      rules,
      map: buildMap(seed + i, players),
      personalities,
      firstPlayer: i % players,
      seed: seed + i,
    }));
  }
  return out;
}

// ---------------------------------------------------------------------------------------
// Summary

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

export function summarise(records) {
  const rounds = records[0].history[0].length;
  const seats = records[0].history.length;
  const perPlayer = records.flatMap((g) => g.history.map((h, p) => ({ g, h, p })));

  const votes = perPlayer.map(({ h }) => h.at(-1).votes);
  const firstRetire = perPlayer
    .map(({ g, p }) => g.retires[p].findIndex((n) => n > 0))
    .filter((i) => i >= 0)
    .map((i) => i + 1);
  const retiresByRound = Array.from({ length: rounds }, (_, r) =>
    mean(perPlayer.map(({ g, p }) => g.retires[p][r])));
  const incomeByRound = Array.from({ length: rounds }, (_, r) =>
    mean(perPlayer.map(({ h }) => sum(h[r].income))));
  const purchasesByRound = Array.from({ length: rounds }, (_, r) =>
    mean(perPlayer.map(({ g, p }) => g.purchases[p][r])));
  const deadTurns = mean(perPlayer.flatMap(({ g, p }) => g.purchases[p].map((n) => (n ? 0 : 1))));
  const squeezed = mean(perPlayer.flatMap(({ h }) => h.map((x) => (x.freeTiles === 0 ? 1 : 0))));
  const idle = mean(perPlayer.flatMap(({ h }) => h.map((x) => x.idle)));
  const lost = mean(perPlayer.map(({ h }) => h.reduce((t, x) => t + sum(x.lost), 0)));
  const ringRound = (n) => perPlayer
    .map(({ h }) => h.findIndex((x) => x.ring >= n))
    .filter((i) => i >= 0)
    .map((i) => i + 1);
  const ring2 = ringRound(2);
  const ring3 = ringRound(3);
  const peakIncome = mean(perPlayer.map(({ h }) => Math.max(...h.map((x) => sum(x.income)))));
  // Leader's income over trailer's, per game, at a few rounds: does the gap widen?
  const gapAt = (r) => mean(records.map((g) => {
    const incs = g.history.map((h) => sum(h[r - 1].income));
    const low = Math.min(...incs);
    return low > 0 ? Math.max(...incs) / low : null;
  }).filter((x) => x !== null));
  const firstWins = mean(records.map((g) => (g.result.winner === g.firstPlayer ? 1 : 0)));
  const draws = mean(records.map((g) => (g.result.winner === null ? 1 : 0)));
  const builtTotals = {};
  for (const { g, p } of perPlayer) {
    for (const [k, n] of Object.entries(g.built[p])) builtTotals[k] = (builtTotals[k] || 0) + n;
  }
  for (const k of Object.keys(builtTotals)) builtTotals[k] /= perPlayer.length;

  return {
    games: records.length,
    seats,
    votes: { mean: mean(votes), median: median(votes), min: Math.min(...votes), max: Math.max(...votes) },
    firstRetireRound: { median: median(firstRetire), share: firstRetire.length / perPlayer.length },
    retiresByRound,
    incomeByRound,
    purchasesByRound,
    peakIncome,
    deadTurns,
    squeezed,
    idle,
    lost,
    ring2: { share: ring2.length / perPlayer.length, median: median(ring2) },
    ring3: { share: ring3.length / perPlayer.length, median: median(ring3) },
    incomeGap: { 5: gapAt(5), 10: gapAt(10), 15: gapAt(15) },
    firstPlayerWins: firstWins,
    draws,
    built: builtTotals,
  };
}

const pct = (x) => `${(100 * x).toFixed(1)}%`;
const f1 = (x) => (x === null || x === undefined ? "–" : Number(x).toFixed(1));

export function report(s) {
  const lines = [];
  lines.push(`${s.games} games, ${s.seats} players`);
  lines.push(`Votes: mean ${f1(s.votes.mean)}, median ${f1(s.votes.median)}, ` +
    `range ${s.votes.min}–${s.votes.max}`);
  lines.push(`First player wins ${pct(s.firstPlayerWins)}, draws ${pct(s.draws)}`);
  lines.push(`First villager retired: median round ${f1(s.firstRetireRound.median)} ` +
    `(${pct(s.firstRetireRound.share)} of players retire any)`);
  lines.push(`Peak income ${f1(s.peakIncome)} a round; round-1 income ${f1(s.incomeByRound[0])}`);
  lines.push(`Turns with no purchase ${pct(s.deadTurns)}; rounds ending with no free tile ` +
    `${pct(s.squeezed)}; idle villagers ${f1(s.idle)} on average`);
  lines.push(`Lost to storage limits ${f1(s.lost)} resources a game`);
  lines.push(`Ring 2 reached by ${pct(s.ring2.share)} (median round ${f1(s.ring2.median)}); ` +
    `ring 3 by ${pct(s.ring3.share)} (median round ${f1(s.ring3.median)})`);
  lines.push(`Leader / trailer income: round 5 ${f1(s.incomeGap[5])}x, round 10 ` +
    `${f1(s.incomeGap[10])}x, round 15 ${f1(s.incomeGap[15])}x`);
  lines.push(`Built per player: ${Object.entries(s.built).map(([k, n]) => `${k} ${f1(n)}`).join(", ")}`);
  lines.push("");
  lines.push("Round  Income  Purchases  Retired");
  s.incomeByRound.forEach((inc, r) => {
    lines.push(`${String(r + 1).padStart(5)}  ${f1(inc).padStart(6)}  ` +
      `${f1(s.purchasesByRound[r]).padStart(9)}  ${f1(s.retiresByRound[r]).padStart(7)}`);
  });
  return lines.join("\n");
}

function parseArgs(argv) {
  const args = { games: 200, seed: 1, players: 2, ai: "default", set: [], json: null };
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i].replace(/^--/, "");
    const value = argv[i + 1];
    if (name === "set") args.set.push(value);
    else if (["games", "seed", "players"].includes(name)) args[name] = Number(value);
    else args[name] = value;
    i += 1;
  }
  return args;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2));
  const rules = withOverrides(RULES, args.set);
  const g = args.ai === "evolved" && EVOLVED.length ? EVOLVED[0] : DEFAULT_PERSONALITY;
  const personalities = Array.from({ length: args.players }, () => g);
  const start = Date.now();
  const records = runMany({ games: args.games, seed: args.seed, players: args.players, rules, personalities });
  console.log(report(summarise(records)));
  console.log(`\n${((Date.now() - start) / 1000).toFixed(1)} s`);
  if (args.json) writeFileSync(args.json, JSON.stringify(records));
}
