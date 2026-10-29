// Draws the board as SVG from the game state plus what the UI wants highlighted.
// No rules here: everything shown comes from the engine.
import { parseKey, toPixel } from "./hex.js?v=0.1";
import { sphere, terrainOf } from "./engine.js?v=0.1";

export const HEX_SIZE = 50;
const HEX_HEIGHT = Math.sqrt(3) * HEX_SIZE;
const TOKEN_SCALE = 0.72;
const BUILDING_SCALE = 0.86;
const SETTLEMENT_SCALE = 1.0;
const SVG_NS = "http://www.w3.org/2000/svg";

// Seat colours match the token art: blue, red, yellow, teal.
export const SEATS = [
  { colour: "blue", hex: "#3f6fd8", name: "Blue" },
  { colour: "red", hex: "#d9483b", name: "Red" },
  { colour: "yellow", hex: "#e8c531", name: "Yellow" },
  { colour: "teal", hex: "#3fb8a0", name: "Teal" },
];

// Small resource icons, inline so they need no extra files.
export const RESOURCE_ICONS = {
  wheat: `<svg class="res-icon" viewBox="0 0 24 24" aria-hidden="true"><g fill="#e8c75a" stroke="#7a5d22" stroke-width="0.8"><path d="M12 22V8"/><ellipse cx="12" cy="5" rx="2" ry="3.2"/><ellipse cx="8.6" cy="9.5" rx="1.8" ry="3" transform="rotate(-30 8.6 9.5)"/><ellipse cx="15.4" cy="9.5" rx="1.8" ry="3" transform="rotate(30 15.4 9.5)"/><ellipse cx="8.6" cy="14.5" rx="1.8" ry="3" transform="rotate(-30 8.6 14.5)"/><ellipse cx="15.4" cy="14.5" rx="1.8" ry="3" transform="rotate(30 15.4 14.5)"/></g><path d="M12 8v14" stroke="#7a5d22" stroke-width="1.4"/></svg>`,
  wood: `<svg class="res-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="8" width="17" height="8" rx="2" fill="#a5713f" stroke="#5a3a1c" stroke-width="1"/><ellipse cx="19" cy="12" rx="3" ry="4" fill="#e3b77e" stroke="#5a3a1c" stroke-width="1"/><ellipse cx="19" cy="12" rx="1.2" ry="1.7" fill="none" stroke="#a5713f" stroke-width="0.8"/></svg>`,
  votes: `<svg class="res-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10h16l-2 11H6z" fill="#b9a789" stroke="#4a3a26"/><rect x="8" y="2" width="8" height="10" rx="1" fill="#f1e6cf" stroke="#4a3a26"/><path d="M10 7l1.5 1.5L14.5 5" fill="none" stroke="#3f6fd8" stroke-width="1.6"/></svg>`,
};

export function hexCentre(k) {
  const [q, r] = parseKey(k);
  return toPixel(q, r, HEX_SIZE);
}

function corners(k, scale = 1) {
  const [x, y] = hexCentre(k);
  const out = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i;
    out.push([x + HEX_SIZE * scale * Math.cos(a), y + HEX_SIZE * scale * Math.sin(a)]);
  }
  return out;
}

const points = (list) => list.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

// Edge i of a hex (corners i and i+1) faces the neighbour in this axial direction.
const EDGE_NEIGHBOURS = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];

export function boardBounds(map) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const k in map.hexes) {
    const [x, y] = hexCentre(k);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const margin = HEX_SIZE * 1.2;
  return { x: minX - margin, y: minY - margin,
    width: maxX - minX + 2 * margin, height: maxY - minY + 2 * margin };
}

function el(name, attrs = {}, parent = null) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

// Draws the whole board into the <g> root.
// view: { seat (the human), selected (tile key), targets (Set of keys), recent (Set of keys) }
export function drawBoard(svg, root, state, view = {}) {
  const { map } = state;
  const b = boardBounds(map);
  svg.setAttribute("viewBox", `${b.x} ${b.y} ${b.width} ${b.height}`);
  root.replaceChildren();

  const spheres = state.players.map((_, p) => new Set(sphere(state, p)));
  const inAny = (k) => spheres.some((s) => s.has(k));
  const seat = view.seat ?? 0;
  // Tiles the human's next ring upgrade would add, drawn a little brighter than the wild.
  const nextRing = new Set();
  const me = state.players[seat];
  if (me && me.ring < 3) {
    const grown = { ...state, players: state.players.map((p, i) =>
      (i === seat ? { ...p, ring: p.ring + 1 } : p)) };
    for (const k of sphere(grown, seat)) if (!spheres[seat].has(k)) nextRing.add(k);
  }

  const tiles = el("g", {}, root);
  const shades = el("g", { "pointer-events": "none" }, root);
  const borders = el("g", { "pointer-events": "none" }, root);
  const pieces = el("g", { "pointer-events": "none" }, root);
  const marks = el("g", { "pointer-events": "none" }, root);

  for (const k of Object.keys(map.hexes)) {
    const terrain = terrainOf(state, k);
    const [x, y] = hexCentre(k);
    const g = el("g", { class: "hex", "data-k": k }, tiles);
    if (terrain === "settlement") {
      el("polygon", { points: points(corners(k)), fill: "#cdb88a" }, g);
    } else {
      el("image", {
        href: `art/tiles/${terrain}.png`,
        x: x - HEX_SIZE, y: y - HEX_HEIGHT / 2, width: 2 * HEX_SIZE, height: HEX_HEIGHT,
        preserveAspectRatio: "none",
      }, g);
    }
    el("polygon", { points: points(corners(k)), fill: "transparent",
      stroke: "#3a2c1a", "stroke-width": 2 }, g);
    const title = el("title", {}, g);
    title.textContent = state.rules.terrain[terrain]?.name ?? terrain;

    if (!inAny(k) && terrain !== "settlement") {
      el("polygon", { points: points(corners(k)),
        fill: nextRing.has(k) ? "rgba(10,7,4,0.35)" : "rgba(10,7,4,0.6)" }, shades);
    }
    const owners = spheres.map((s, p) => (s.has(k) ? p : -1)).filter((p) => p >= 0);
    if (owners.length > 1) {
      el("polygon", { points: points(corners(k, 0.8)), fill: "none", stroke: "#f1e6cf",
        "stroke-width": 2, "stroke-dasharray": "5 5", opacity: 0.8 }, shades);
    }
  }

  // Sphere borders: edges between a sphere tile and a tile outside it.
  state.players.forEach((player, p) => {
    const set = new Set([...spheres[p], player.settlement]);
    for (const k of set) {
      const [q, r] = parseKey(k);
      const c = corners(k, 0.94);
      EDGE_NEIGHBOURS.forEach(([dq, dr], i) => {
        if (set.has(`${q + dq},${r + dr}`)) return;
        const [a, b2] = [c[i], c[(i + 1) % 6]];
        el("line", { x1: a[0], y1: a[1], x2: b2[0], y2: b2[1], stroke: SEATS[p].hex,
          "stroke-width": 5, "stroke-linecap": "round" }, borders);
      });
    }
  });

  // Settlements.
  state.players.forEach((player, p) => {
    const [x, y] = hexCentre(player.settlement);
    el("circle", { cx: x, cy: y + HEX_HEIGHT * 0.28, r: HEX_SIZE * 0.42, fill: SEATS[p].hex,
      opacity: 0.85 }, pieces);
    const h = HEX_HEIGHT * SETTLEMENT_SCALE;
    el("image", { href: "art/buildings/settlement.png", x: x - h * 0.34, y: y - h * 0.55,
      width: h * 0.68, height: h }, pieces);
  });

  // Villagers and buildings.
  for (const [k, t] of Object.entries(state.tiles)) {
    const [x, y] = hexCentre(k);
    const colour = SEATS[t.owner];
    if (t.kind === "villager") {
      const s = HEX_HEIGHT * TOKEN_SCALE;
      el("image", { href: `art/tokens/villager-${colour.colour}.png`, x: x - s / 2,
        y: y - s / 2, width: s, height: s }, pieces);
    } else {
      const s = HEX_HEIGHT * BUILDING_SCALE;
      el("ellipse", { cx: x, cy: y + s * 0.3, rx: s * 0.42, ry: s * 0.16, fill: colour.hex,
        opacity: 0.9 }, pieces);
      drawBuilding(pieces, t.building, x, y, s);
    }
  }

  for (const k of view.recent || []) {
    if (!map.hexes[k]) continue;
    el("polygon", { points: points(corners(k, 0.86)), fill: "rgba(226,180,79,0.18)",
      stroke: "#f1e6cf", "stroke-width": 2 }, marks);
  }
  for (const k of view.targets || []) {
    el("polygon", { points: points(corners(k, 0.84)), fill: "rgba(226,180,79,0.12)",
      stroke: "#e2b44f", "stroke-width": 3, "stroke-dasharray": "7 5" }, marks);
  }
  if (view.selected && map.hexes[view.selected]) {
    el("polygon", { points: points(corners(view.selected, 0.9)), fill: "none",
      stroke: "#e2b44f", "stroke-width": 5 }, marks);
  }
}

const BUILDING_ART = { mill: "mill", sawmill: "sawmill", assembly: "assembly" };

function drawBuilding(parent, type, x, y, s) {
  if (BUILDING_ART[type]) {
    el("image", { href: `art/buildings/${BUILDING_ART[type]}.png`, x: x - s / 2, y: y - s / 2,
      width: s, height: s }, parent);
    return;
  }
  // Warehouse: no art yet, so a simple drawn barn of crates.
  const g = el("g", { transform: `translate(${x} ${y}) scale(${s / 100})` }, parent);
  el("path", { d: "M-34 10 L-34 -12 L0 -34 L34 -12 L34 10 Z", fill: "#8a5a2e",
    stroke: "#3a2410", "stroke-width": 3 }, g);
  el("path", { d: "M-40 -10 L0 -38 L40 -10", fill: "none", stroke: "#5a2f18",
    "stroke-width": 7, "stroke-linecap": "round" }, g);
  el("rect", { x: -12, y: -8, width: 24, height: 18, fill: "#5a3a1c", stroke: "#3a2410",
    "stroke-width": 2 }, g);
  for (const [cx, cy] of [[-26, 14], [-8, 18], [12, 16], [28, 12]]) {
    el("rect", { x: cx - 8, y: cy - 8, width: 16, height: 14, fill: "#c79a5a",
      stroke: "#5a3a1c", "stroke-width": 2 }, g);
  }
}

// The hex key under a click/tap, or null.
export function hexFromEvent(event) {
  const g = event.target.closest?.(".hex");
  return g ? g.dataset.k : null;
}

