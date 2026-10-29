// Rule-based AI. Picks one action at a time using only the engine's public functions, so the
// game, the simulator and evolution all play by exactly the same rules.
// A personality is a set of genes: numbers that steer the choices. evolve.js breeds them.
import {
  applyAction, canAfford, villagerCost, ringCost, freeTiles, terrainOf, income,
  villagerTiles, freeSeats, storageCap, canAct, tileProblem,
} from "./engine.js?v=0.1";

export const DEFAULT_PERSONALITY = {
  name: "Steward",
  convertFrom: 10, // first round in which villagers are retired to the Assembly
  convertPerRound: 2, // most villagers retired in one round (all of them in the last round)
  stopRecruitAfter: 15, // no new villagers after this round
  assemblyFrom: 8, // earliest round to build an Assembly
  wheatShare: 0.5, // share of worked tiles to put on farmland
  patience: 0.5, // 0: buy what you can afford now; 1: save for the thing you want most
  villager: 1.0, // how much each purchase is wanted, before the situation is weighed
  mill: 0.8,
  sawmill: 0.8,
  warehouse: 0.5,
  assembly: 0.9,
  ring2: 0.7,
  ring3: 0.3,
};

// [low, high, whole number?] for every gene.
export const GENE_RANGES = {
  convertFrom: [1, 20, true],
  convertPerRound: [1, 6, true],
  stopRecruitAfter: [1, 20, true],
  assemblyFrom: [1, 20, true],
  wheatShare: [0.2, 0.8, false],
  patience: [0, 1, false],
  villager: [0, 1, false],
  mill: [0, 1, false],
  sawmill: [0, 1, false],
  warehouse: [0, 1, false],
  assembly: [0, 1, false],
  ring2: [0, 1, false],
  ring3: [0, 1, false],
};

const clamp = ([low, high, whole], v) => {
  const x = Math.min(high, Math.max(low, v));
  return whole ? Math.round(x) : Math.round(x * 1000) / 1000;
};

export function randomPersonality(random, name = "Random") {
  const out = { name };
  for (const [gene, [low, high, whole]] of Object.entries(GENE_RANGES)) {
    out[gene] = clamp([low, high, whole], low + random() * (high - low));
  }
  return out;
}

export function mutatePersonality(parent, random, rate = 0.3) {
  const out = { ...parent };
  for (const [gene, range] of Object.entries(GENE_RANGES)) {
    if (random() >= rate) continue;
    const [low, high] = range;
    const spread = (high - low) * 0.2;
    out[gene] = clamp(range, out[gene] + (random() * 2 - 1) * spread);
  }
  return out;
}

export function crossPersonalities(a, b, random) {
  const out = { name: a.name };
  for (const gene of Object.keys(GENE_RANGES)) out[gene] = random() < 0.5 ? a[gene] : b[gene];
  return out;
}

// The whole of player p's turn as a list of actions (the last is endTurn).
export function planTurn(state, p, personality = DEFAULT_PERSONALITY, maxActions = 200) {
  const actions = [];
  let s = state;
  while (canAct(s, p)) {
    for (const action of nextSteps(s, p, personality)) {
      actions.push(action);
      s = applyAction(s, action);
    }
    if (actions.at(-1).type === "endTurn") break;
    if (actions.length > maxActions) throw new Error("AI stuck in a loop");
  }
  return { actions, state: s };
}

// The next action for player p.
export function chooseAction(state, p, g = DEFAULT_PERSONALITY) {
  return nextSteps(state, p, g)[0];
}

// The next step: usually one action, or two when a villager must leave a tile to make room
// for a building (done together so the plan cannot change in between).
function nextSteps(state, p, g) {
  const one = retire(state, p, g);
  if (one) return [one];
  const buy = purchase(state, p, g);
  if (buy) return buy;
  const place = placeIdle(state, p, g);
  if (place) return [place];
  return [{ type: "endTurn", player: p }];
}

// ---------------------------------------------------------------------------------------

function producing(state, k) {
  const produces = state.rules.terrain[terrainOf(state, k)].produces;
  return state.rules.resources.includes(produces) ? produces : null;
}

function retiredThisRound(state, p) {
  return state.roundActions.filter((a) => a.player === p && a.type === "retire").length;
}

function retire(state, p, g) {
  const lastRound = state.round === state.rules.rounds;
  if (!lastRound && state.round < g.convertFrom) return null;
  if (!lastRound && retiredThisRound(state, p) >= g.convertPerRound) return null;
  if (freeSeats(state, p) < 1) return null;
  if (state.players[p].idle > 0) return { type: "retire", player: p, from: "idle" };
  const tiles = villagerTiles(state, p);
  if (!tiles.length) return null;
  // Retire the villager whose loss costs least: off the resource there is most of.
  const have = state.players[p].resources;
  const ranked = [...tiles].sort((a, b) =>
    (have[producing(state, b)] ?? -1) - (have[producing(state, a)] ?? -1));
  return { type: "retire", player: p, from: ranked[0] };
}

// The resource the next worked tile should produce, keeping to wheatShare.
function wantedResource(state, p, g) {
  const worked = income(state, p).detail;
  const wheat = worked.wheat?.worked || 0;
  const wood = worked.wood?.worked || 0;
  return wheat < g.wheatShare * (wheat + wood + 1) ? "wheat" : "wood";
}

// A free tile for a villager: one producing the wanted resource if possible, else any
// producing tile. Null when no producing tile is free.
function villagerSite(state, p, g) {
  const free = freeTiles(state, p).filter((k) => producing(state, k));
  if (!free.length) return null;
  const want = wantedResource(state, p, g);
  return free.find((k) => producing(state, k) === want) || free[0];
}

// A site for a building: prefer tiles that produce nothing (stone and mountain in a
// two-resource game), then free producing tiles, then a worked tile to clear (the squeeze).
function buildingSite(state, p, building) {
  const free = freeTiles(state, p, building);
  const barren = free.find((k) => !producing(state, k));
  if (barren) return { at: barren };
  if (free.length) return { at: free[0] };
  const occupied = villagerTiles(state, p).filter((k) =>
    !tileProblem({ ...state, tiles: { ...state.tiles, [k]: undefined } }, p, k, building));
  if (occupied.length) return { at: occupied[0], clear: true };
  return null;
}

function wantedPurchases(state, p, g) {
  const { rules } = state;
  const player = state.players[p];
  const out = [];
  const add = (desire, action, cost, site = null) => {
    if (desire > 0 && cost) out.push({ desire, action, cost, site });
  };
  const inc = income(state, p);
  const cap = storageCap(state, p);
  const nearCap = rules.resources.some((r) => player.resources[r] + inc[r] > cap);
  const last = state.history[p].at(-1);
  const wasted = last && Object.keys(last.lost).length > 0;

  if (state.round <= g.stopRecruitAfter) {
    const at = villagerSite(state, p, g);
    if (at) add(g.villager, { type: "recruit", player: p, at }, villagerCost(state, p));
  }
  for (const [type, resource] of [["mill", "wheat"], ["sawmill", "wood"]]) {
    const b = rules.buildings[type];
    const d = inc.detail[resource];
    const unimproved = d.worked - d.improved;
    const site = buildingSite(state, p, type);
    if (site) add(g[type] * (unimproved >= 2 ? 1 : 0.3), { type: "build", player: p, building: type, at: site.at }, b.cost, site);
  }
  {
    const site = buildingSite(state, p, "warehouse");
    if (site) add(g.warehouse * (wasted || nearCap ? 1 : 0.2), { type: "build", player: p, building: "warehouse", at: site.at }, rules.buildings.warehouse.cost, site);
  }
  if (state.round >= g.assemblyFrom) {
    const site = buildingSite(state, p, "assembly");
    const short = freeSeats(state, p) < Math.min(g.convertPerRound, 3);
    if (site) add(g.assembly * (short ? 1 : 0.1), { type: "build", player: p, building: "assembly", at: site.at }, rules.buildings.assembly.cost, site);
  }
  const ringNext = player.ring + 1;
  const rc = ringCost(state, p);
  if (rc) {
    const crowded = freeTiles(state, p).length <= 1;
    add(g[`ring${ringNext}`] * (crowded ? 1 : 0.3), { type: "upgrade", player: p }, rc);
  }
  return out.sort((a, b) => b.desire - a.desire);
}

function purchase(state, p, g) {
  const wants = wantedPurchases(state, p, g);
  if (!wants.length) return null;
  const affordable = wants.filter((w) => canAfford(state, p, w.cost));
  const best = wants[0];
  const choice = canAfford(state, p, best.cost) ? best : affordable[0];
  if (!choice) return null;
  // Save up for the favourite instead, if patient enough and it is wanted much more.
  if (choice !== best && best.desire * g.patience > choice.desire) return null;
  if (choice.desire < 0.05) return null;
  if (choice.site?.clear) {
    return [{ type: "assign", player: p, from: choice.site.at, to: "idle" }, choice.action];
  }
  return [choice.action];
}

function placeIdle(state, p, g) {
  if (state.players[p].idle < 1) return null;
  const at = villagerSite(state, p, g);
  return at ? { type: "assign", player: p, from: "idle", to: at } : null;
}

// One line summing up a personality, for reports.
export function describe(g) {
  return `convert from round ${g.convertFrom}, up to ${g.convertPerRound} a round; ` +
    `recruit until round ${g.stopRecruitAfter}; Assembly from round ${g.assemblyFrom}; ` +
    `patience ${g.patience}`;
}
