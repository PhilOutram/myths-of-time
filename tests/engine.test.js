import { test } from "node:test";
import assert from "node:assert/strict";
import { RULES } from "../rules-config.js";
import { buildMap, mapProblems, PLAYER_COUNTS } from "../maps.js";
import {
  newGame, applyAction, validate, income, sphere, villagerCost, freeTiles, terrainOf,
  storageCap, freeSeats, canUndo, undo, rivalsFor, villagerTiles,
} from "../engine.js";

const rulesWith = (changes = {}) => ({ ...structuredClone(RULES), ...changes });
const PLAYERS = [{ name: "Blue" }, { name: "Red", ai: true }];

function game(rules = RULES, map = buildMap(1, 2), players = PLAYERS) {
  return newGame({ rules, map, players });
}

// Applies a list of actions in order.
function run(state, actions) {
  return actions.reduce((s, a) => applyAction(s, a), state);
}

function endRound(state) {
  let s = state;
  const round = s.round;
  while (s.round === round && !s.result) {
    const p = s.rules.turnMode === "concurrent"
      ? s.players.findIndex((pl) => !pl.ended)
      : s.current;
    s = applyAction(s, { type: "endTurn", player: p });
  }
  return s;
}

function give(state, p, resources) {
  const s = structuredClone(state);
  Object.assign(s.players[p].resources, resources);
  if (s.roundStart) Object.assign(s.roundStart.players[p].resources, resources);
  return s;
}

function freeOf(state, p, terrain) {
  return freeTiles(state, p).find((k) => terrainOf(state, k) === terrain);
}

test("maps: every seed gives a fair, complete map", () => {
  for (const players of PLAYER_COUNTS) {
    for (let n = 1; n <= 60; n++) {
      assert.deepEqual(mapProblems(buildMap(n, players)), [], `map ${n}, ${players} players`);
    }
  }
});

test("maps: the same number gives the same map", () => {
  assert.deepEqual(buildMap(17, 2), buildMap(17, 2));
  assert.notDeepEqual(buildMap(17, 2).hexes, buildMap(18, 2).hexes);
});

test("maps: two-player spheres share an edge of four contested tiles", () => {
  const s = game();
  s.players.forEach((pl) => { pl.ring = 3; });
  const contested = sphere(s, 0).filter((k) => rivalsFor(s, 0, k).length);
  assert.equal(contested.length, 4);
});

test("start: two villagers on farmland and forest, ring 1, starting resources", () => {
  const s = game();
  for (let p = 0; p < 2; p++) {
    const tiles = villagerTiles(s, p).map((k) => terrainOf(s, k)).sort();
    assert.deepEqual(tiles, ["farmland", "forest"]);
    assert.equal(s.players[p].ring, 1);
    assert.equal(sphere(s, p).length, 6);
    // Round 1 collection has happened: start + 1 of each.
    assert.deepEqual(s.players[p].resources, { wheat: 4, wood: 4 });
  }
  assert.equal(s.round, 1);
  assert.equal(s.current, 0);
});

test("villager price rises with population, counting Electors", () => {
  let s = give(game(), 0, { wheat: 50, wood: 50 });
  assert.deepEqual(villagerCost(s, 0), { wheat: 3 });
  s = applyAction(s, { type: "recruit", player: 0, at: null });
  assert.equal(s.players[0].resources.wheat, 47);
  assert.deepEqual(villagerCost(s, 0), { wheat: 4 });
  const at = freeTiles(s, 0)[0];
  s = run(s, [
    { type: "build", player: 0, building: "assembly", at },
    { type: "retire", player: 0, from: "idle" },
  ]);
  assert.equal(s.players[0].electors, 1);
  assert.deepEqual(villagerCost(s, 0), { wheat: 4 });
});

test("a Mill must stand on farmland and improves up to 3 worked farmland tiles", () => {
  let s = give(game(), 0, { wheat: 50, wood: 50 });
  const forest = freeOf(s, 0, "forest");
  assert.match(validate(s, { type: "build", player: 0, building: "mill", at: forest }), /farmland/);
  const farm = freeOf(s, 0, "farmland");
  s = applyAction(s, { type: "build", player: 0, building: "mill", at: farm });
  // Ring 1: 3 farmland, one has a villager, one now has the Mill, one is free.
  assert.equal(income(s, 0).wheat, 2);
  s = applyAction(s, { type: "recruit", player: 0, at: freeOf(s, 0, "farmland") });
  assert.equal(income(s, 0).wheat, 4);
  assert.equal(income(s, 0).wood, 1);
});

test("a tile holds one thing", () => {
  let s = give(game(), 0, { wheat: 50, wood: 50 });
  const worked = villagerTiles(s, 0)[0];
  assert.match(validate(s, { type: "build", player: 0, building: "warehouse", at: worked }),
    /already/);
  s = applyAction(s, { type: "assign", player: 0, from: worked, to: "idle" });
  s = applyAction(s, { type: "build", player: 0, building: "warehouse", at: worked });
  assert.equal(s.players[0].idle, 1);
});

test("storage limit applies at the end of the round; warehouses raise it", () => {
  let s = give(game(), 0, { wheat: 15, wood: 16 });
  s = endRound(s);
  const last = s.history[0].at(-1);
  assert.deepEqual(last.lost, { wheat: 5, wood: 6 });
  // Round 2 collection on top of the capped 10.
  assert.deepEqual(s.players[0].resources, { wheat: 11, wood: 11 });
  s = applyAction(s, { type: "build", player: 0, building: "warehouse", at: freeTiles(s, 0)[0] });
  assert.equal(storageCap(s, 0), 20);
});

test("Electors need a free seat and bank votes every round, including the round seated", () => {
  let s = give(game(), 0, { wheat: 50, wood: 50 });
  const worked = villagerTiles(s, 0)[0];
  assert.match(validate(s, { type: "retire", player: 0, from: worked }), /seat/);
  s = applyAction(s, { type: "build", player: 0, building: "assembly", at: freeTiles(s, 0)[0] });
  assert.equal(freeSeats(s, 0), 3);
  s = applyAction(s, { type: "retire", player: 0, from: worked });
  s = endRound(s);
  assert.equal(s.players[0].votes, 1);
  s = endRound(s);
  assert.equal(s.players[0].votes, 2);
});

test("ring upgrades add 12 then 18 tiles, and stop at ring 3", () => {
  let s = give(game(), 0, { wheat: 100, wood: 100 });
  s = applyAction(s, { type: "upgrade", player: 0 });
  assert.equal(sphere(s, 0).length, 18);
  s = applyAction(s, { type: "upgrade", player: 0 });
  assert.equal(sphere(s, 0).length, 36);
  assert.deepEqual(s.players[0].resources, { wheat: 60, wood: 60 });
  assert.match(validate(s, { type: "upgrade", player: 0 }), /largest/);
});

test("turns: only the current player acts; the round ends when everyone has ended", () => {
  let s = game();
  assert.match(validate(s, { type: "endTurn", player: 1 }), /turn/);
  s = applyAction(s, { type: "endTurn", player: 0 });
  assert.equal(s.current, 1);
  assert.equal(s.round, 1);
  s = applyAction(s, { type: "endTurn", player: 1 });
  assert.equal(s.round, 2);
  assert.equal(s.current, 0);
});

test("the game ends after the last round and the most votes wins", () => {
  let s = give(game(rulesWith({ rounds: 3 })), 1, { wheat: 50, wood: 50 });
  s = endRound(s);
  s = applyAction(s, { type: "endTurn", player: 0 });
  s = applyAction(s, { type: "build", player: 1, building: "assembly", at: freeTiles(s, 1)[0] });
  s = applyAction(s, { type: "retire", player: 1, from: villagerTiles(s, 1)[0] });
  s = applyAction(s, { type: "endTurn", player: 1 });
  s = endRound(s);
  assert.ok(s.result);
  assert.equal(s.result.winner, 1);
  assert.deepEqual(s.result.votes, [0, 2]);
  assert.match(validate(s, { type: "endTurn", player: 0 }), /over/);
});

test("undo takes back your last action this turn, but not ending a turn", () => {
  let s = give(game(), 0, { wheat: 20, wood: 20 });
  assert.equal(canUndo(s, 0), false);
  s = applyAction(s, { type: "recruit", player: 0, at: null });
  s = applyAction(s, { type: "build", player: 0, building: "warehouse", at: freeTiles(s, 0)[0] });
  assert.equal(canUndo(s, 0), true);
  s = undo(s, 0);
  assert.equal(Object.keys(s.tiles).length, 4); // the 4 starting villagers, no warehouse
  assert.equal(s.players[0].idle, 1);
  s = undo(s, 0);
  assert.equal(s.players[0].idle, 0);
  assert.equal(canUndo(s, 0), false);
  s = applyAction(s, { type: "endTurn", player: 0 });
  assert.equal(canUndo(s, 0), false);
});

test("undo replays from the round start, so resources come back exactly", () => {
  let s = game();
  const before = structuredClone(s.players[0].resources);
  s = applyAction(s, { type: "recruit", player: 0, at: null });
  s = undo(s, 0);
  assert.deepEqual(s.players[0].resources, before);
});

test("concurrent mode: everyone acts at once; undo keeps the other player's moves", () => {
  const rules = rulesWith({ turnMode: "concurrent" });
  let s = game(rules);
  s.players.forEach((pl) => { pl.ring = 3; });
  // Put player 0's villager on a contested tile.
  const contested = sphere(s, 0).find((k) => rivalsFor(s, 0, k).length && !s.tiles[k]);
  s = applyAction(s, { type: "assign", player: 0, from: villagerTiles(s, 0)[0], to: contested });
  s.roundStart = structuredClone(s); // treat this as the start of the round
  s.roundStart.roundStart = null;
  s.roundActions = [];
  s = applyAction(s, { type: "assign", player: 0, from: contested, to: "idle" });
  s = applyAction(s, { type: "assign", player: 1, from: villagerTiles(s, 1)[0], to: contested });
  assert.equal(s.tiles[contested].owner, 1);
  s = undo(s, 0);
  assert.equal(s.tiles[contested].owner, 0);
  assert.equal(s.events[0].dropped.length, 1);
  s = applyAction(s, { type: "endTurn", player: 1 });
  assert.equal(s.round, 1);
  s = applyAction(s, { type: "endTurn", player: 0 });
  assert.equal(s.round, 2);
});

test("contested 'blocked': nobody may use a tile in two spheres", () => {
  let s = game(rulesWith({ contested: "blocked" }));
  s.players.forEach((pl) => { pl.ring = 3; });
  const contested = sphere(s, 0).find((k) => rivalsFor(s, 0, k).length);
  assert.match(validate(s, { type: "recruit", player: 0, at: contested }) || "", /Contested|wheat/);
  s = give(s, 0, { wheat: 50 });
  assert.match(validate(s, { type: "recruit", player: 0, at: contested }), /Contested/);
});

test("three players: seats take turns in order", () => {
  const players = [{ name: "A" }, { name: "B" }, { name: "C" }];
  let s = game(RULES, buildMap(3, 3), players);
  s = run(s, [0, 1].map((p) => ({ type: "endTurn", player: p })));
  assert.equal(s.current, 2);
  s = applyAction(s, { type: "endTurn", player: 2 });
  assert.equal(s.round, 2);
});

test("resigning hands the game to the last player standing", () => {
  let s = game();
  s = applyAction(s, { type: "resign", player: 0 });
  assert.equal(s.result.winner, 1);
});
