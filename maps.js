// Map generation. A map is a set of hexes with terrain and one settlement per player.
// Settlements sit 6 hexes apart so their ring-3 spheres share one edge of 4 contested tiles
// (the paper test's "two spheres side by side, sharing one edge"). Every settlement gets the
// same terrain, rotated or mirrored, so no seat has a better start.
import { key, parseKey, disc, ring, rotate, distance } from "./hex.js?v=0.1";

// Settlement centres for 2 and 3 players, and the symmetry that carries seat 0's land to the
// other seats. 2 players: a point reflection through the midpoint. 3 players: a 120 degree
// rotation about the centroid (3, 0).
const LAYOUTS = {
  2: {
    centres: [[0, 0], [6, -3]],
    images: ([q, r]) => [[q, r], [6 - q, -3 - r]],
  },
  3: {
    centres: [[0, 0], [6, -3], [3, 3]],
    images: ([q, r]) => {
      const c = [3, 0];
      const turn = (h, steps) => {
        const [a, b] = rotate([h[0] - c[0], h[1] - c[1]], steps);
        return [a + c[0], b + c[1]];
      };
      return [[q, r], turn([q, r], 2), turn([q, r], 4)];
    },
  },
};

export const PLAYER_COUNTS = Object.keys(LAYOUTS).map(Number);

// Terrain in each ring round a settlement. Ring 1 matches the paper test (3 wheat, 3 wood).
// Provisional: a little stone and mountain from ring 2 (worked for nothing until stone and
// iron are resources, but buildable, so they make good sites for warehouses).
export const RING_TERRAIN = {
  1: { farmland: 3, forest: 3 },
  2: { farmland: 5, forest: 5, stone: 1, mountain: 1 },
  3: { farmland: 7, forest: 7, stone: 1, mountain: 2, desert: 1 },
};
export const MAX_RING = 3;

// Small seeded generator (mulberry32). Returns a function giving numbers in [0, 1).
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(list, random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function bag(counts, random) {
  return shuffle(Object.entries(counts).flatMap(([t, n]) => Array(n).fill(t)), random);
}

// Builds map number `number` for `players` players. The same number and player count always
// give the same map.
export function buildMap(number, players = 2) {
  const layout = LAYOUTS[players];
  if (!layout) throw new Error(`No map layout for ${players} players`);
  const random = seededRandom(number * 7919 + players);
  const hexes = {};
  for (const centre of layout.centres) {
    for (const h of disc(centre, MAX_RING)) hexes[key(...h)] = { terrain: null };
  }
  layout.centres.forEach((c) => {
    hexes[key(...c)].terrain = "settlement";
  });
  const [home] = layout.centres;
  for (let n = 1; n <= MAX_RING; n++) {
    const terrains = bag(RING_TERRAIN[n], random);
    for (const h of shuffle(ring(home, n), random)) {
      if (hexes[key(...h)].terrain) continue; // already set through another seat's symmetry
      const terrain = terrains.pop();
      for (const image of layout.images(h)) hexes[key(...image)].terrain = terrain;
    }
  }
  return {
    id: mapId(number, players),
    name: `Map ${number}`,
    number,
    players,
    hexes,
    settlements: layout.centres.map((c) => key(...c)),
  };
}

export function mapId(number, players) {
  return `map-${number}-${players}p`;
}

// "map-17-2p" -> the map. Returns null for anything else.
export function mapById(id) {
  const match = /^map-(\d+)-(\d)p$/.exec(id);
  if (!match) return null;
  return buildMap(Number(match[1]), Number(match[2]));
}

// Problems with a map, as messages (empty when the map is fine). Used by the tests.
export function mapProblems(map) {
  const problems = [];
  if (Object.values(map.hexes).some((h) => !h.terrain)) problems.push("hex without terrain");
  for (const s of map.settlements) {
    for (const [n, counts] of Object.entries(RING_TERRAIN)) {
      if (Number(n) === MAX_RING) continue; // ring 3 shares tiles with neighbours
      const found = {};
      for (const h of ring(parseKey(s), Number(n))) {
        const t = map.hexes[key(...h)].terrain;
        found[t] = (found[t] || 0) + 1;
      }
      for (const [t, want] of Object.entries(counts)) {
        if ((found[t] || 0) !== want) problems.push(`${s} ring ${n}: ${found[t] || 0} ${t}`);
      }
    }
  }
  for (let i = 0; i < map.settlements.length; i++) {
    for (let j = i + 1; j < map.settlements.length; j++) {
      const d = distance(map.settlements[i], map.settlements[j]);
      if (d !== 2 * MAX_RING) problems.push(`settlements ${i} and ${j} are ${d} apart`);
    }
  }
  return problems;
}
