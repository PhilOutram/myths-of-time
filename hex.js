// Hex grid maths for flat-topped hexes in axial coordinates (q, r).
// Pure functions only: shared by the engine, the AI, the simulator and the UI.
// Copied from Mech Attack, with ring, disc and rotation helpers added.
// Screen y points down, so r increases towards the bottom of the map.

// Neighbour offsets, clockwise from north: N, NE, SE, S, SW, NW.
export const DIRECTIONS = [[0, -1], [1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0]];
export const DIRECTION_NAMES = ["N", "NE", "SE", "S", "SW", "NW"];

// Seven-hex clusters (a centre plus its ring) tile the plane. Every cluster centre is
// i * CLUSTER_U + j * CLUSTER_V for whole numbers i and j.
export const CLUSTER_U = [2, 1];
export const CLUSTER_V = [-1, 3];

// Nudge used to keep a line between hex centres off the exact edge between two hexes.
const LINE_NUDGE = 1e-6;

export function key(q, r) {
  return `${q},${r}`;
}

export function parseKey(k) {
  const [q, r] = k.split(",").map(Number);
  return [q, r];
}

export function neighbours(q, r) {
  return DIRECTIONS.map(([dq, dr]) => [q + dq, r + dr]);
}

export function neighbourKeys(k) {
  const [q, r] = parseKey(k);
  return neighbours(q, r).map(([nq, nr]) => key(nq, nr));
}

export function distance(a, b) {
  const [aq, ar] = Array.isArray(a) ? a : parseKey(a);
  const [bq, br] = Array.isArray(b) ? b : parseKey(b);
  const dq = aq - bq;
  const dr = ar - br;
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
}

function roundHex(fq, fr) {
  const fs = -fq - fr;
  let q = Math.round(fq);
  let r = Math.round(fr);
  const s = Math.round(fs);
  const dq = Math.abs(q - fq);
  const dr = Math.abs(r - fr);
  const ds = Math.abs(s - fs);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return [q, r];
}

// Hexes crossed by a straight line between two hex centres, both ends included.
// nudge shifts the line slightly so it never runs exactly along a hex edge.
export function line(a, b, nudge = LINE_NUDGE) {
  const [aq, ar] = Array.isArray(a) ? a : parseKey(a);
  const [bq, br] = Array.isArray(b) ? b : parseKey(b);
  const n = distance([aq, ar], [bq, br]);
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = n === 0 ? 0 : i / n;
    const fq = aq + nudge + (bq - aq) * t;
    const fr = ar + nudge + (br - ar) * t;
    out.push(roundHex(fq, fr));
  }
  return out;
}

// True when nothing between a and b blocks sight. blocks(key) says whether a hex blocks.
// A line that runs exactly along an edge is checked both ways and counts as clear if
// either side is clear.
export function lineOfSight(a, b, blocks) {
  const clear = (nudge) =>
    line(a, b, nudge)
      .slice(1, -1)
      .every(([q, r]) => !blocks(key(q, r)));
  return clear(LINE_NUDGE) || clear(-LINE_NUDGE);
}

// Cheapest movement costs from start. costOf(key) returns the cost to enter a hex, or null
// when the hex cannot be entered. Hexes costing more than maxCost are left out.
// Returns { key: { cost, prev } }, with prev = null for the start hex.
export function cheapestPaths(start, costOf, maxCost = Infinity) {
  const result = { [start]: { cost: 0, prev: null } };
  const open = [start];
  while (open.length) {
    let best = 0;
    for (let i = 1; i < open.length; i++) {
      if (result[open[i]].cost < result[open[best]].cost) best = i;
    }
    const current = open.splice(best, 1)[0];
    const base = result[current].cost;
    for (const next of neighbourKeys(current)) {
      const step = costOf(next);
      if (step === null || step === undefined) continue;
      const cost = base + step;
      if (cost > maxCost) continue;
      const known = result[next];
      if (known && known.cost <= cost) continue;
      if (!known) open.push(next);
      result[next] = { cost, prev: current };
    }
  }
  return result;
}

// Hex keys from the start of a cheapestPaths result to target, start excluded.
export function pathTo(paths, target) {
  const out = [];
  for (let k = target; paths[k] && paths[k].prev !== null; k = paths[k].prev) out.unshift(k);
  return out;
}

export function clusterCentre(i, j) {
  return [i * CLUSTER_U[0] + j * CLUSTER_V[0], i * CLUSTER_U[1] + j * CLUSTER_V[1]];
}

// The centre hex followed by its ring, in DIRECTIONS order.
export function clusterHexes([q, r]) {
  return [[q, r], ...neighbours(q, r)];
}

// Centre of a hex in pixels for a hex whose corner-to-centre radius is size.
export function toPixel(q, r, size) {
  return [size * 1.5 * q, size * Math.sqrt(3) * (r + q / 2)];
}

// Every hex at exactly distance n from centre (n >= 1), clockwise. n = 0 gives the centre.
export function ring([q, r], n) {
  if (n === 0) return [[q, r]];
  const out = [];
  // Start n steps in direction 4 (SW), then walk n steps in each direction in turn.
  let cq = q + DIRECTIONS[4][0] * n;
  let cr = r + DIRECTIONS[4][1] * n;
  for (let side = 0; side < 6; side++) {
    for (let step = 0; step < n; step++) {
      out.push([cq, cr]);
      cq += DIRECTIONS[side][0];
      cr += DIRECTIONS[side][1];
    }
  }
  return out;
}

// Every hex within distance n of centre, centre first, then ring by ring.
export function disc(centre, n) {
  const out = [];
  for (let i = 0; i <= n; i++) out.push(...ring(centre, i));
  return out;
}

// Rotates (q, r) by 60 degrees clockwise, steps times, about the origin.
export function rotate([q, r], steps = 1) {
  let [a, b] = [q, r];
  for (let i = 0; i < ((steps % 6) + 6) % 6; i++) [a, b] = [-b, a + b];
  return [a, b];
}
