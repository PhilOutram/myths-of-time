// Balance numbers and rule switches for the digital game and the simulator.
// The engine reads everything tunable from here, so balance changes never touch engine code.
// Values marked "provisional" are not settled with Phil yet; each one is listed in
// docs/rules.md. Starting numbers come from myths-model-v3.xlsx (Catalogue sheet), with its
// single currency split into wheat and wood (Phil, 29 October 2026: two resources to start).

export const RULES = {
  // Resources in play. Terrain that produces anything else (stone, iron) is worked for
  // nothing until that resource is added here.
  resources: ["wheat", "wood"],

  // The game ends after this many rounds; the player with most banked votes wins.
  rounds: 20,

  // "alternate": players take turns in seat order. "concurrent": everyone acts at once and
  // the round ends when all have ended their turn (for play over a local network).
  turnMode: "alternate",
  // "fixed": the same seat starts every round. "rotate": the first seat moves on one each
  // round (provisional; the economy barely interacts, so this may not matter).
  turnOrder: "fixed",

  // produces: the resource a villager on this terrain makes. buildable: buildings allowed.
  // Mountains produce iron and can be entered (Phil, 29 October 2026).
  terrain: {
    farmland: { name: "Farmland", produces: "wheat", buildable: true },
    forest: { name: "Forest", produces: "wood", buildable: true },
    stone: { name: "Stone", produces: "stone", buildable: true },
    mountain: { name: "Mountain", produces: "iron", buildable: true },
    desert: { name: "Desert", produces: null, buildable: false }, // provisional
    settlement: { name: "Settlement", produces: null, buildable: false },
  },

  // What one villager makes on a tile: base, or improved by a Mill or Sawmill.
  yield: { base: 1, improved: 2 },

  // Most of each resource carried from one round to the next, before warehouses. Anything
  // above it is lost at the end of the round (v3: 10).
  storage: 10,

  start: {
    villagers: 2, // placed on one farmland and one forest tile
    // Provisional: enough for a choice in round 1 (a villager, or save for a Mill).
    resources: { wheat: 3, wood: 3 },
    ring: 1,
  },

  // Villager N (counting villagers and Electors) costs coefficient x N wheat (v3: 1).
  villager: { resource: "wheat", coefficient: 1 },

  // Sphere rings. A settlement starts working ring 1 (6 tiles); each upgrade adds the next
  // ring. Ring 3 is the cap. v3 costs 20 and 60, split evenly (provisional).
  ringUpgrades: {
    2: { wheat: 10, wood: 10 },
    3: { wheat: 30, wood: 30 },
  },

  // Buildings take one tile in the sphere. placeOn limits the terrain (the paper test puts a
  // Mill on a wheat tile, so building it costs you the tile it improves). improves: the first
  // "count" worked tiles of that resource in the settlement yield the improved amount.
  // Costs: v3 values in wood (provisional: people cost wheat, buildings cost wood).
  buildings: {
    mill: {
      name: "Mill", cost: { wood: 4 }, placeOn: ["farmland"],
      improves: { resource: "wheat", count: 3 },
    },
    sawmill: {
      name: "Sawmill", cost: { wood: 4 }, placeOn: ["forest"],
      improves: { resource: "wood", count: 3 },
    },
    warehouse: {
      name: "Warehouse", cost: { wood: 6 }, storage: 10,
    },
    assembly: {
      name: "Assembly", cost: { wheat: 4, wood: 4 }, seats: 3,
    },
  },

  // Each Elector banks this many votes at the end of every round, including the round it was
  // seated in. Electors never come back (endgame-bear-off.md, Version A).
  electors: { votesPerRound: 1 },

  // A tile inside two players' spheres: the first to put something on it keeps it
  // (provisional; the paper test's alternative is "nobody may use it").
  contested: "firstCome",
};
