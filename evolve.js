// Breeds AI personalities by self-play, to find what a good player does under the current rules.
// Usage: node evolve.js [--generations 40] [--population 32] [--seed 1] [--fitness votes|wins]
//                       [--curve 40] [--set rule.path=value ...] [--out ai-personalities.js]
//                       [--report docs/evolution.md] [--json results.json] [--quiet]
//   --fitness  votes (default): most banked votes, playing against the hand-tuned AI.
//              wins: points for beating other members of the population.
//   --curve    tries per round when seeding the starting pool from the conversion curve.
//              0 starts from random players only, which gets stuck converting early.
//   --out      module the best personalities are written to ("-" to skip)
//   --report   Markdown report ("-" to skip)
// Each generation every personality plays both seats; the best quarter survive and the rest
// are replaced by mixed and mutated copies of the survivors.
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { RULES } from "./rules-config.js";
import { buildMap, seededRandom } from "./maps.js";
import {
  DEFAULT_PERSONALITY, GENE_RANGES, randomPersonality, mutatePersonality, crossPersonalities,
  describe,
} from "./ai.js";
import { runGame, runMany, summarise, report, withOverrides } from "./sim.js";
import { conversionCurve } from "./tools/conversion-curve.mjs";

const DEFAULTS = { generations: 40, population: 32, seed: 1, fitness: "votes", curve: 40 };
const ELITE_SHARE = 0.25;
const MUTATION_RATE = 0.3;
const KEEP = 5;
const MAPS = 4;
const SEED_SHARE = 0.5; // at most this much of the starting pool comes from the curve
const NAMES = ["Archon", "Bailiff", "Chancellor", "Doge", "Elder", "Factor", "Grandee", "Herald"];

// The curve's best player for each round of first retirement, strongest first. Seeding the
// pool with these starts evolution from what good play looks like at every timing. Left to
// itself it settles on converting early, which is a local optimum well below the curve.
function curveSeeds({ rules, tries, seed, count }) {
  if (tries <= 0 || count <= 0) return [];
  return conversionCurve({ rules, tries, seed })
    .filter((row) => row.v > 0)
    .sort((a, b) => b.v - a.v)
    .slice(0, count)
    .map((row) => ({ ...row.g }));
}

export function evolve({
  generations, population, seed, fitness, rules = RULES, curve = 0, log = () => {},
}) {
  const random = seededRandom(seed);
  const maps = Array.from({ length: MAPS }, (_, i) => buildMap(seed * 100 + i + 1, 2));
  const seeded = curveSeeds({
    rules, tries: curve, seed, count: Math.floor(population * SEED_SHARE),
  });
  if (seeded.length) log(`seeded ${seeded.length} players from the conversion curve`);
  let pool = [
    { ...DEFAULT_PERSONALITY },
    ...seeded,
    ...Array.from({ length: Math.max(0, population - 1 - seeded.length) },
      () => randomPersonality(random)),
  ];

  // Mean result for g over both seats on every map.
  const votesFitness = (g) => {
    let total = 0;
    let n = 0;
    for (const map of maps) {
      for (const seat of [0, 1]) {
        const personalities = seat === 0 ? [g, DEFAULT_PERSONALITY] : [DEFAULT_PERSONALITY, g];
        const game = runGame({ rules, map, personalities, firstPlayer: 0 });
        total += game.result.votes[seat];
        n += 1;
      }
    }
    return total / n;
  };
  const winsFitness = (list) => {
    const points = list.map(() => 0);
    for (let i = 0; i < list.length; i++) {
      for (let k = 0; k < 4; k++) {
        const j = Math.floor(random() * list.length);
        if (j === i) continue;
        const map = maps[Math.floor(random() * maps.length)];
        const game = runGame({ rules, map, personalities: [list[i], list[j]], firstPlayer: k % 2 });
        const w = game.result.winner;
        if (w === 0) points[i] += 1;
        else if (w === 1) points[j] += 1;
        else { points[i] += 0.5; points[j] += 0.5; }
      }
    }
    return points;
  };

  let scored = [];
  for (let gen = 1; gen <= generations; gen++) {
    const scores = fitness === "wins" ? winsFitness(pool) : pool.map(votesFitness);
    scored = pool.map((g, i) => ({ g, score: scores[i] })).sort((a, b) => b.score - a.score);
    log(`generation ${gen}: best ${scored[0].score.toFixed(1)}, ` +
      `median ${scored[Math.floor(scored.length / 2)].score.toFixed(1)}`);
    if (gen === generations) break;
    const elite = scored.slice(0, Math.max(2, Math.round(population * ELITE_SHARE))).map((x) => x.g);
    pool = [...elite];
    while (pool.length < population) {
      const a = elite[Math.floor(random() * elite.length)];
      const b = elite[Math.floor(random() * elite.length)];
      pool.push(mutatePersonality(crossPersonalities(a, b, random), random, MUTATION_RATE));
    }
  }
  return scored.slice(0, KEEP).map((x, i) => ({
    ...x.g,
    name: NAMES[i % NAMES.length],
    fitness: Math.round(x.score * 10) / 10,
  }));
}

function geneTable(best) {
  const genes = Object.keys(GENE_RANGES);
  const head = `| Gene | Default | ${best.map((g) => g.name).join(" | ")} |`;
  const rule = `|---|---|${best.map(() => "---").join("|")}|`;
  const rows = genes.map((k) => `| ${k} | ${DEFAULT_PERSONALITY[k]} | ${best.map((g) => g[k]).join(" | ")} |`);
  const fit = `| fitness | | ${best.map((g) => g.fitness).join(" | ")} |`;
  return [head, rule, ...rows, fit].join("\n");
}

const commandLine = (args) =>
  `node evolve.js --generations ${args.generations} --population ${args.population} ` +
  `--seed ${args.seed} --fitness ${args.fitness} --curve ${args.curve}` +
  args.set.map((x) => ` --set ${x}`).join("");

function moduleText(best, args) {
  return `// Personalities bred by evolve.js. Regenerated by each run; do not edit by hand.
// ${commandLine(args)}
export const EVOLVED = ${JSON.stringify(best, null, 2)};
`;
}

function parseArgs(argv) {
  const args = { ...DEFAULTS, set: [], out: "ai-personalities.js", report: "docs/evolution.md", json: null, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i].replace(/^--/, "");
    if (name === "quiet") { args.quiet = true; continue; }
    const value = argv[i + 1];
    i += 1;
    if (name === "set") args.set.push(value);
    else if (["generations", "population", "seed", "curve"].includes(name)) {
      args[name] = Number(value);
    } else args[name] = value;
  }
  return args;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2));
  const rules = withOverrides(RULES, args.set);
  const start = Date.now();
  const best = evolve({ ...args, rules, log: args.quiet ? () => {} : console.log });
  // The champion playing itself, for the behaviour summary.
  const summary = summarise(runMany({ games: 20, seed: 1000, rules, personalities: [best[0], best[0]] }));
  const vsDefault = summarise(runMany({ games: 20, seed: 1000, rules, personalities: [best[0], DEFAULT_PERSONALITY] }));
  const wins = runMany({ games: 20, seed: 2000, rules, personalities: [best[0], DEFAULT_PERSONALITY] })
    .filter((g) => g.result.winner === 0).length;
  const text = [
    `# Evolution run`,
    ``,
    `\`${commandLine(args)}\``,
    ``,
    `## Best personalities`,
    ``,
    geneTable(best),
    ``,
    `Champion: ${describe(best[0])}. Beats the hand-tuned AI in ${wins} of 20 games.`,
    ``,
    `## The champion playing itself`,
    ``,
    "```",
    report(summary),
    "```",
    ``,
    `## The champion (seat 1) against the hand-tuned AI (seat 2)`,
    ``,
    "```",
    report(vsDefault),
    "```",
  ].join("\n");
  if (args.out !== "-") writeFileSync(args.out, moduleText(best, args));
  if (args.report !== "-") writeFileSync(args.report, `${text}\n`);
  if (args.json) writeFileSync(args.json, JSON.stringify({ args, best, summary }, null, 2));
  console.log(`\n${text}\n\n${((Date.now() - start) / 1000).toFixed(1)} s`);
}
