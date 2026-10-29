// Myths of Time rules engine. Pure functions: no DOM, no window, no timers.
// applyAction(state, action) returns a new state; the old one is never changed.
// State is plain JSON so it can be saved, sent over the network, replayed and logged.
//
// A round: every player collects from their worked tiles, then players act (in turn, or all
// at once in "concurrent" mode), then at the end of the round storage limits apply and every
// Elector banks its votes. After the last round the most votes wins.
import { key, parseKey, disc, distance } from "./hex.js";

export const STATE_FORMAT = 1;

// ---------------------------------------------------------------------------------------
// New game

// players: [{ name, ai: true|false }]. map: from maps.js, with one settlement per player.
export function newGame({ rules, map, players, firstPlayer = 0, seed = 1 }) {
  if (players.length !== map.settlements.length) {
    throw new Error(`Map has ${map.settlements.length} settlements for ${players.length} players`);
  }
  const state = {
    format: STATE_FORMAT,
    seed,
    rules,
    map,
    round: 1,
    firstPlayer,
    current: rules.turnMode === "concurrent" ? null : firstPlayer,
    players: players.map((p, i) => ({
      name: p.name,
      ai: Boolean(p.ai),
      settlement: map.settlements[i],
      ring: rules.start.ring,
      resources: Object.fromEntries(rules.resources.map((r) => [r, rules.start.resources[r] || 0])),
      idle: 0,
      electors: 0,
      votes: 0,
      ended: false,
      resigned: false,
    })),
    // What stands on each tile: { owner, kind: "villager" } or { owner, kind: "building",
    // building }. Settlement hexes are not listed.
    tiles: {},
    // Per-player history, one entry per finished round (for the simulator and charts).
    history: players.map(() => []),
    roundStart: null,
    roundActions: [],
    events: [],
    result: null,
  };
  state.players.forEach((player, p) => placeStartingVillagers(state, p));
  startRound(state);
  return state;
}

function placeStartingVillagers(state, p) {
  const { villagers } = state.rules.start;
  const free = sphere(state, p).filter((k) => !state.tiles[k]);
  // One on farmland and one on forest, then any free tile.
  const order = ["farmland", "forest"];
  let placed = 0;
  for (const terrain of order) {
    if (placed >= villagers) break;
    const k = free.find((t) => !state.tiles[t] && terrainOf(state, t) === terrain);
    if (k) {
      state.tiles[k] = { owner: p, kind: "villager" };
      placed += 1;
    }
  }
  for (const k of free) {
    if (placed >= villagers) break;
    if (state.tiles[k]) continue;
    state.tiles[k] = { owner: p, kind: "villager" };
    placed += 1;
  }
  state.players[p].idle += villagers - placed;
}

// ---------------------------------------------------------------------------------------
// Queries (also used by the AI and the UI)

export function terrainOf(state, k) {
  return state.map.hexes[k]?.terrain ?? null;
}

// Tiles a player's settlement works: every map hex within its ring, settlement hexes excluded.
export function sphere(state, p) {
  const player = state.players[p];
  return disc(parseKey(player.settlement), player.ring)
    .map(([q, r]) => key(q, r))
    .filter((k) => state.map.hexes[k] && terrainOf(state, k) !== "settlement");
}

export function inSphere(state, p, k) {
  const player = state.players[p];
  return Boolean(state.map.hexes[k]) && terrainOf(state, k) !== "settlement" &&
    distance(player.settlement, k) <= player.ring;
}

// Players other than p whose sphere includes k.
export function rivalsFor(state, p, k) {
  return state.players.map((_, i) => i).filter((i) => i !== p && inSphere(state, i, k));
}

export function villagerTiles(state, p) {
  return Object.keys(state.tiles).filter((k) =>
    state.tiles[k].owner === p && state.tiles[k].kind === "villager");
}

export function buildingsOf(state, p, type = null) {
  return Object.keys(state.tiles).filter((k) => {
    const t = state.tiles[k];
    return t.owner === p && t.kind === "building" && (!type || t.building === type);
  });
}

export function villagerCount(state, p) {
  return villagerTiles(state, p).length + state.players[p].idle;
}

// Villagers and Electors: what the next villager's price is based on.
export function population(state, p) {
  return villagerCount(state, p) + state.players[p].electors;
}

export function villagerCost(state, p) {
  const { resource, coefficient } = state.rules.villager;
  return { [resource]: coefficient * (population(state, p) + 1) };
}

export function ringCost(state, p) {
  return state.rules.ringUpgrades[state.players[p].ring + 1] || null;
}

export function buildingCost(state, type) {
  return state.rules.buildings[type].cost;
}

export function canAfford(state, p, cost) {
  if (!cost) return false;
  const have = state.players[p].resources;
  return Object.entries(cost).every(([r, n]) => (have[r] || 0) >= n);
}

export function storageCap(state, p) {
  const extra = buildingsOf(state, p).reduce((sum, k) =>
    sum + (state.rules.buildings[state.tiles[k].building].storage || 0), 0);
  return state.rules.storage + extra;
}

export function seats(state, p) {
  return buildingsOf(state, p).reduce((sum, k) =>
    sum + (state.rules.buildings[state.tiles[k].building].seats || 0), 0);
}

export function freeSeats(state, p) {
  return seats(state, p) - state.players[p].electors;
}

// Income for the coming collection: { resource: amount }, plus a breakdown per resource of
// worked tiles and improved tiles.
export function income(state, p) {
  const { rules } = state;
  const worked = {};
  for (const k of villagerTiles(state, p)) {
    const produces = rules.terrain[terrainOf(state, k)].produces;
    if (produces && rules.resources.includes(produces)) worked[produces] = (worked[produces] || 0) + 1;
  }
  const improvedSlots = {};
  for (const k of buildingsOf(state, p)) {
    const improves = rules.buildings[state.tiles[k].building].improves;
    if (improves) {
      improvedSlots[improves.resource] = (improvedSlots[improves.resource] || 0) + improves.count;
    }
  }
  const out = {};
  const detail = {};
  for (const r of rules.resources) {
    const w = worked[r] || 0;
    const improved = Math.min(w, improvedSlots[r] || 0);
    out[r] = improved * rules.yield.improved + (w - improved) * rules.yield.base;
    detail[r] = { worked: w, improved };
  }
  return { ...out, detail };
}

// Why p cannot put something on tile k (null when it can).
export function tileProblem(state, p, k, building = null) {
  if (!state.map.hexes[k]) return "Not on the map.";
  if (!inSphere(state, p, k)) return "Outside your settlement's sphere.";
  if (state.tiles[k]) return "Something is already there.";
  if (state.rules.contested === "blocked" && rivalsFor(state, p, k).length) {
    return "Contested: nobody may use this tile.";
  }
  if (building) {
    const terrain = terrainOf(state, k);
    if (!state.rules.terrain[terrain].buildable) return `Nothing can be built on ${terrain}.`;
    const placeOn = state.rules.buildings[building].placeOn;
    if (placeOn && !placeOn.includes(terrain)) {
      const names = placeOn.map((t) => state.rules.terrain[t].name.toLowerCase()).join(" or ");
      return `A ${state.rules.buildings[building].name} must go on ${names}.`;
    }
  }
  return null;
}

export function freeTiles(state, p, building = null) {
  return sphere(state, p).filter((k) => !tileProblem(state, p, k, building));
}

// Can player p act now?
export function canAct(state, p) {
  if (state.result) return false;
  const player = state.players[p];
  if (!player || player.ended || player.resigned) return false;
  return state.rules.turnMode === "concurrent" || state.current === p;
}

// ---------------------------------------------------------------------------------------
// Actions
//
// Every action names its player:
//   { type: "recruit", player, at }        buy a villager; at = a free tile, or null for idle
//   { type: "assign", player, from, to }   move a villager: from/to = a tile key or "idle"
//   { type: "build", player, building, at }
//   { type: "upgrade", player }            add the next ring to the sphere
//   { type: "retire", player, from }       villager (tile key or "idle") becomes an Elector
//   { type: "endTurn", player }
//   { type: "resign", player }

export function applyAction(state, action) {
  const next = cloneState(state);
  next.events = [];
  const check = validate(next, action);
  if (check) throw new Error(check);
  perform(next, action);
  next.roundActions.push(action);
  if (action.type === "endTurn" || action.type === "resign") afterTurnEnds(next, action.player);
  return next;
}

// Why action is not allowed now (null when it is).
export function validate(state, action) {
  const p = action.player;
  const player = state.players[p];
  if (!player) return "No such player.";
  if (state.result) return "The game is over.";
  if (action.type === "resign") return player.resigned ? "Already resigned." : null;
  if (!canAct(state, p)) return "Not your turn.";
  const { rules } = state;
  switch (action.type) {
    case "recruit": {
      if (!canAfford(state, p, villagerCost(state, p))) return "Not enough wheat.";
      if (action.at != null) return tileProblem(state, p, action.at);
      return null;
    }
    case "assign": {
      const { from, to } = action;
      if (from === to) return "Nowhere to move.";
      if (from === "idle") {
        if (player.idle < 1) return "No idle villagers.";
      } else {
        const t = state.tiles[from];
        if (!t || t.owner !== p || t.kind !== "villager") return "No villager of yours there.";
      }
      if (to !== "idle") return tileProblem(state, p, to);
      return null;
    }
    case "build": {
      const b = rules.buildings[action.building];
      if (!b) return "No such building.";
      if (!canAfford(state, p, b.cost)) return `Not enough to build a ${b.name}.`;
      return tileProblem(state, p, action.at, action.building);
    }
    case "upgrade": {
      const cost = ringCost(state, p);
      if (!cost) return "Your sphere is already at its largest.";
      if (!canAfford(state, p, cost)) return "Not enough to grow the sphere.";
      return null;
    }
    case "retire": {
      if (freeSeats(state, p) < 1) return "No free seat in an Assembly.";
      const { from } = action;
      if (from === "idle") return player.idle < 1 ? "No idle villagers." : null;
      const t = state.tiles[from];
      if (!t || t.owner !== p || t.kind !== "villager") return "No villager of yours there.";
      return null;
    }
    case "endTurn":
      return null;
    default:
      return `Unknown action ${action.type}.`;
  }
}

function pay(state, p, cost) {
  for (const [r, n] of Object.entries(cost)) state.players[p].resources[r] -= n;
}

function perform(state, action) {
  const p = action.player;
  const player = state.players[p];
  const { rules } = state;
  switch (action.type) {
    case "recruit": {
      const cost = villagerCost(state, p);
      pay(state, p, cost);
      if (action.at != null) state.tiles[action.at] = { owner: p, kind: "villager" };
      else player.idle += 1;
      state.events.push({ type: "recruit", player: p, at: action.at ?? null, cost });
      break;
    }
    case "assign": {
      if (action.from === "idle") player.idle -= 1;
      else delete state.tiles[action.from];
      if (action.to === "idle") player.idle += 1;
      else state.tiles[action.to] = { owner: p, kind: "villager" };
      state.events.push({ type: "assign", player: p, from: action.from, to: action.to });
      break;
    }
    case "build": {
      const cost = rules.buildings[action.building].cost;
      pay(state, p, cost);
      state.tiles[action.at] = { owner: p, kind: "building", building: action.building };
      state.events.push({ type: "build", player: p, building: action.building, at: action.at, cost });
      break;
    }
    case "upgrade": {
      const cost = ringCost(state, p);
      pay(state, p, cost);
      player.ring += 1;
      state.events.push({ type: "upgrade", player: p, ring: player.ring, cost });
      break;
    }
    case "retire": {
      if (action.from === "idle") player.idle -= 1;
      else delete state.tiles[action.from];
      player.electors += 1;
      state.events.push({ type: "retire", player: p, from: action.from });
      break;
    }
    case "endTurn":
      player.ended = true;
      state.events.push({ type: "endTurn", player: p });
      break;
    case "resign":
      player.resigned = true;
      player.ended = true;
      state.events.push({ type: "resign", player: p });
      break;
    default:
      break;
  }
}

function active(state) {
  return state.players.map((_, i) => i).filter((i) => !state.players[i].resigned);
}

function afterTurnEnds(state, p) {
  const live = active(state);
  if (live.length <= 1 && state.players.length > 1) {
    finishGame(state, "resign");
    return;
  }
  const waiting = live.filter((i) => !state.players[i].ended);
  if (waiting.length === 0) {
    endRound(state);
    return;
  }
  if (state.rules.turnMode !== "concurrent" && !waiting.includes(state.current)) {
    state.current = nextSeat(state, state.current ?? p, waiting);
  }
}

// The next seat after p (wrapping) that is still to act this round.
function nextSeat(state, p, waiting) {
  const n = state.players.length;
  for (let step = 1; step <= n; step++) {
    const i = (p + step) % n;
    if (waiting.includes(i)) return i;
  }
  return null;
}

function roundOrder(state) {
  const n = state.players.length;
  const first = state.rules.turnOrder === "rotate"
    ? (state.firstPlayer + state.round - 1) % n
    : state.firstPlayer;
  return Array.from({ length: n }, (_, i) => (first + i) % n);
}

// Collect for everyone, then remember the state so a player's actions can be undone by
// replaying the round without them.
function startRound(state) {
  for (const p of active(state)) {
    const player = state.players[p];
    const got = income(state, p);
    for (const r of state.rules.resources) player.resources[r] += got[r];
    player.ended = false;
    state.events.push({ type: "collect", player: p, income: pick(got, state.rules.resources) });
  }
  const order = roundOrder(state).filter((i) => !state.players[i].resigned);
  state.current = state.rules.turnMode === "concurrent" ? null : order[0];
  state.roundActions = [];
  state.roundStart = null;
  state.roundStart = cloneState(state);
  state.roundStart.events = [];
  state.events.push({ type: "newRound", round: state.round });
}

function pick(obj, names) {
  return Object.fromEntries(names.map((n) => [n, obj[n]]));
}

function endRound(state) {
  for (const p of active(state)) {
    const player = state.players[p];
    const cap = storageCap(state, p);
    const lost = {};
    for (const r of state.rules.resources) {
      if (player.resources[r] > cap) {
        lost[r] = player.resources[r] - cap;
        player.resources[r] = cap;
      }
    }
    const votes = player.electors * state.rules.electors.votesPerRound;
    player.votes += votes;
    const got = income(state, p);
    state.history[p].push({
      round: state.round,
      resources: { ...player.resources },
      lost,
      income: pick(got, state.rules.resources),
      villagers: villagerCount(state, p),
      idle: player.idle,
      electors: player.electors,
      votes: player.votes,
      votesThisRound: votes,
      ring: player.ring,
      buildings: buildingsOf(state, p).map((k) => state.tiles[k].building),
      freeTiles: freeTiles(state, p).length,
    });
    state.events.push({ type: "endRound", player: p, lost, votes });
  }
  if (state.round >= state.rules.rounds) {
    finishGame(state, "rounds");
    return;
  }
  state.round += 1;
  startRound(state);
}

function finishGame(state, reason) {
  const live = active(state);
  const best = Math.max(...live.map((i) => state.players[i].votes));
  const leaders = live.filter((i) => state.players[i].votes === best);
  // Tie: most resources left wins; still tied, it is a draw.
  let winners = leaders;
  if (leaders.length > 1) {
    const stock = (i) => Object.values(state.players[i].resources).reduce((a, b) => a + b, 0);
    const most = Math.max(...leaders.map(stock));
    winners = leaders.filter((i) => stock(i) === most);
  }
  state.result = {
    reason,
    winner: winners.length === 1 ? winners[0] : null,
    winners,
    votes: state.players.map((pl) => pl.votes),
  };
  state.current = null;
  state.roundStart = null;
  state.events.push({ type: "gameOver", result: state.result });
}

// ---------------------------------------------------------------------------------------
// Undo: take back player p's last action this round, keeping everyone else's. The round is
// replayed from its start without that action, and any later action that no longer fits is
// dropped. Example, in concurrent play: p moves a villager off a contested tile, q takes the
// tile, then p undoes the move; p's villager goes back and q's move is dropped.
// In turn mode only actions since p's turn began can be undone; ending a turn cannot.

function lastUndoable(state, p) {
  if (!state.roundStart || state.result) return -1;
  const list = state.roundActions;
  for (let i = list.length - 1; i >= 0; i--) {
    const a = list[i];
    if (a.player !== p) {
      if (state.rules.turnMode === "concurrent") continue;
      return -1; // someone else has acted since: their turn came after yours
    }
    if (a.type === "endTurn" || a.type === "resign") return -1;
    return i;
  }
  return -1;
}

export function canUndo(state, p) {
  return lastUndoable(state, p) !== -1 && !state.players[p].ended;
}

export function undo(state, p) {
  const index = lastUndoable(state, p);
  if (index === -1 || state.players[p].ended) throw new Error("Nothing to undo.");
  const keep = state.roundActions.filter((_, i) => i !== index);
  let replay = cloneState(state.roundStart);
  replay.roundStart = state.roundStart;
  const dropped = [];
  for (const action of keep) {
    if (validate(replay, action)) {
      dropped.push(action);
      continue;
    }
    replay = applyAction(replay, action);
  }
  replay.events = [{ type: "undo", player: p, action: state.roundActions[index], dropped }];
  return replay;
}

// ---------------------------------------------------------------------------------------

// rules, map and roundStart are never changed once made, so copies share them.
function cloneState(state) {
  const { roundStart, rules, map, ...rest } = state;
  const copy = structuredClone(rest);
  copy.rules = rules;
  copy.map = map;
  copy.roundStart = roundStart;
  return copy;
}
