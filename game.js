// Game screen: shows the state, turns taps into engine actions and plays the AI seats.
// No rules here: what is allowed, and why not, always comes from the engine.
import { RULES } from "./rules-config.js?v=0.1";
import { buildMap } from "./maps.js?v=0.1";
import {
  newGame, applyAction, validate, canUndo, undo, income, sphere, terrainOf, villagerCost,
  ringCost, freeSeats, seats, storageCap, villagerCount, freeTiles, inSphere,
} from "./engine.js?v=0.1";
import { planTurn, DEFAULT_PERSONALITY } from "./ai.js?v=0.1";
import { EVOLVED } from "./ai-personalities.js?v=0.1";
import { drawBoard, hexFromEvent, SEATS, RESOURCE_ICONS } from "./board.js?v=0.1";

const SAVE_KEY = "myths-of-time.game";
const AI_STEP_MS = 260;
const LOG_LENGTH = 10;

const $ = (id) => document.getElementById(id);

let game = null; // { state, seat, personalities, log, settings }
let selected = null;
let moving = null; // tile key of a villager being moved
let recent = new Set();
let busy = false;
let onExit = () => {};

// ---------------------------------------------------------------------------------------
// Saving

export function hasSavedGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return Boolean(raw && !JSON.parse(raw).state.result);
  } catch {
    return false;
  }
}

function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(game));
  } catch {
    // Not saved (private window or storage full); the game still plays.
  }
}

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------
// Starting

export function openGame({ resume = false, settings = null, exit = () => {} }) {
  onExit = exit;
  if (resume) {
    game = load();
    if (!game) return false;
  } else {
    game = startGame(settings);
  }
  selected = null;
  moving = null;
  recent = new Set();
  $("game").hidden = false;
  $("game-over").hidden = true;
  wire();
  render();
  if (game.state.result) showGameOver();
  else continueAI();
  return true;
}

function startGame({ opponents = 1, ai = "evolved", mapNumber = 1 }) {
  const players = [{ name: "You" }];
  const personalities = [null];
  for (let i = 1; i <= opponents; i++) {
    players.push({ name: SEATS[i].name, ai: true });
    const pool = ai === "evolved" && EVOLVED.length ? EVOLVED : [DEFAULT_PERSONALITY];
    personalities.push(pool[(i - 1) % pool.length]);
  }
  const state = newGame({ rules: RULES, map: buildMap(mapNumber, players.length), players });
  const g = { state, seat: 0, personalities, log: [], settings: { opponents, ai, mapNumber } };
  g.log.unshift(`Map ${mapNumber}. Round 1 of ${RULES.rounds}: you start with ${resText(state.players[0].resources)}.`);
  return g;
}

let wired = false;
function wire() {
  if (wired) return;
  wired = true;
  $("board").addEventListener("click", (e) => {
    if (busy || !game) return;
    const k = hexFromEvent(e);
    if (k) tapTile(k);
  });
  $("end-turn").addEventListener("click", () => {
    if (busy || !myTurn()) return;
    act({ type: "endTurn", player: game.seat });
  });
  $("undo").addEventListener("click", () => {
    if (busy || !myTurn() || !canUndo(game.state, game.seat)) return;
    game.state = undo(game.state, game.seat);
    moving = null;
    recent = new Set();
    say("Undone.");
    save();
    render();
  });
  $("game-home").addEventListener("click", () => {
    save();
    $("game").hidden = true;
    onExit();
  });
  $("game-over-menu").addEventListener("click", () => {
    $("game").hidden = true;
    onExit();
  });
  $("game-over-again").addEventListener("click", () => {
    const settings = { ...game.settings, mapNumber: game.settings.mapNumber + 1 };
    openGame({ settings, exit: onExit });
  });
  $("tile-panel").addEventListener("click", onOption);
  $("town-panel").addEventListener("click", onOption);
}

// ---------------------------------------------------------------------------------------
// Acting

function myTurn() {
  const s = game.state;
  return !s.result && s.current === game.seat;
}

const pendingOptions = new Map();
let optionId = 0;

function onOption(e) {
  const button = e.target.closest("button[data-option]");
  if (!button || button.disabled || busy) return;
  const run = pendingOptions.get(button.dataset.option);
  if (run) run();
}

function act(action) {
  const problem = validate(game.state, action);
  if (problem) {
    say(problem, true);
    return;
  }
  const before = game.state;
  game.state = applyAction(game.state, action);
  recent = tilesOf(action);
  logAction(before, action);
  afterEvents(game.state.events);
  moving = null;
  if (action.type !== "assign") selected = action.at && action.type !== "retire" ? action.at : selected;
  save();
  render();
  if (game.state.result) showGameOver();
  else if (action.type === "endTurn") continueAI();
}

function tilesOf(action) {
  const out = new Set();
  for (const k of [action.at, action.from, action.to]) {
    if (k && k !== "idle") out.add(k);
  }
  return out;
}

// Runs AI seats until it is the human's turn again, showing each action briefly.
async function continueAI() {
  if (busy) return;
  busy = true;
  render();
  try {
    while (!game.state.result && game.state.current !== game.seat) {
      const p = game.state.current;
      const { actions } = planTurn(game.state, p, game.personalities[p] || DEFAULT_PERSONALITY);
      for (const action of actions) {
        const before = game.state;
        game.state = applyAction(game.state, action);
        recent = tilesOf(action);
        logAction(before, action);
        afterEvents(game.state.events);
        render();
        if (action.type !== "endTurn") await sleep(AI_STEP_MS);
      }
    }
  } finally {
    busy = false;
    recent = new Set();
    save();
    render();
    if (game.state.result) showGameOver();
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------------------
// Words

function nameOf(p) {
  return p === game.seat ? "You" : game.state.players[p].name;
}

function resText(cost) {
  return Object.entries(cost).filter(([, n]) => n).map(([r, n]) => `${n} ${r}`).join(" and ") || "nothing";
}

function incomeText(state, p) {
  const inc = income(state, p);
  return resText(Object.fromEntries(state.rules.resources.map((r) => [r, inc[r]])));
}

function logAction(before, action) {
  const s = game.state;
  const who = nameOf(action.player);
  const terrain = (k) => s.rules.terrain[terrainOf(s, k)]?.name.toLowerCase();
  let line = null;
  switch (action.type) {
    case "recruit":
      line = `${who} recruited a villager${action.at ? ` onto ${terrain(action.at)}` : ""}.`;
      break;
    case "build":
      line = `${who} built ${article(s.rules.buildings[action.building].name)}.`;
      break;
    case "upgrade":
      line = `${who} grew to ring ${s.players[action.player].ring}.`;
      break;
    case "retire":
      line = `${who} seated an Elector (${s.players[action.player].electors} now).`;
      break;
    default:
      break;
  }
  if (line && action.player !== game.seat) addLog(line);
}

function afterEvents(events) {
  const s = game.state;
  for (const e of events) {
    if (e.type === "endRound" && e.player === game.seat && Object.keys(e.lost).length) {
      addLog(`Storage full: you lost ${resText(e.lost)}.`);
    }
    if (e.type === "newRound") {
      addLog(`Round ${e.round} of ${s.rules.rounds}: you collected ${resText(s.events.find((x) =>
        x.type === "collect" && x.player === game.seat)?.income || {})}.`);
    }
  }
}

function addLog(line) {
  game.log.unshift(line);
  game.log.length = Math.min(game.log.length, 40);
}

function say(text, warn = false) {
  const m = $("message");
  m.textContent = text;
  m.classList.toggle("warn", warn);
}

// ---------------------------------------------------------------------------------------
// Taps

function tapTile(k) {
  const s = game.state;
  if (moving) {
    if (k === moving) {
      moving = null;
      say("");
    } else if (myTurn() && !validate(s, { type: "assign", player: game.seat, from: moving, to: k })) {
      const from = moving;
      selected = k;
      act({ type: "assign", player: game.seat, from, to: k });
      return;
    } else {
      moving = null;
    }
  }
  selected = k === selected ? null : k;
  say("");
  render();
}

// ---------------------------------------------------------------------------------------
// Rendering

function costHtml(cost) {
  if (!cost) return "";
  return `<span class="cost">${Object.entries(cost).map(([r, n]) =>
    `<span>${RESOURCE_ICONS[r] || ""}${n}</span>`).join("")}</span>`;
}

// An option button. run is called when it is pressed; problem disables it with a reason.
function option(label, run, { cost = null, problem = null, thumb = null } = {}) {
  const id = String(optionId++);
  pendingOptions.set(id, run);
  const disabled = Boolean(problem) || busy || !myTurn();
  const why = problem || (!myTurn() ? "Not your turn." : "");
  return `<button type="button" class="option" data-option="${id}" ${disabled ? "disabled" : ""}
    title="${why.replace(/"/g, "&quot;")}">${thumb ? `<img class="thumb" src="${thumb}" alt="" />` : ""}
    <span>${label}</span>${costHtml(cost)}</button>`;
}

const BUILD_THUMBS = {
  mill: "art/buildings/mill.png",
  sawmill: "art/buildings/sawmill.png",
  assembly: "art/buildings/assembly.png",
  warehouse: null,
};

const article = (word) => (/^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`);

function buildingBlurb(type) {
  const b = game.state.rules.buildings[type];
  if (b.improves) {
    return `${b.name}: the first ${b.improves.count} worked ${b.improves.resource} tiles yield ` +
      `${game.state.rules.yield.improved} each.`;
  }
  if (b.storage) return `${b.name}: holds ${b.storage} more of each resource over a round.`;
  if (b.seats) return `${b.name}: ${b.seats} seats for Electors, who bank votes every round.`;
  return b.name;
}

function render() {
  if (!game) return;
  pendingOptions.clear();
  optionId = 0;
  const s = game.state;
  const p = game.seat;
  const me = s.players[p];

  $("bar-round").textContent = `Round ${Math.min(s.round, s.rules.rounds)}/${s.rules.rounds}`;
  $("bar-turn").textContent = s.result ? "Game over"
    : myTurn() ? "Your turn" : `${s.players[s.current]?.name}'s turn`;
  const cap = storageCap(s, p);
  $("bar-stock").innerHTML = s.rules.resources.map((r) =>
    `<span class="stock" title="${r}">${RESOURCE_ICONS[r]}${me.resources[r]}<small>/${cap}</small></span>`)
    .join("") + `<span class="stock" title="votes">${RESOURCE_ICONS.votes}${me.votes}</span>`;
  $("end-turn").disabled = busy || !myTurn();
  $("undo").disabled = busy || !myTurn() || !canUndo(s, p);

  const targets = moving
    ? new Set(freeTiles(s, p).filter((k) => k !== moving))
    : new Set();
  drawBoard($("board"), $("board-root"), s, { seat: p, selected, targets, recent });

  $("tile-panel").innerHTML = tilePanel();
  $("town-panel").innerHTML = townPanel();
  $("scores").innerHTML = scoresTable();
  $("log").innerHTML = game.log.slice(0, LOG_LENGTH).map((l) => `<li>${l}</li>`).join("");
  if (!$("message").textContent) {
    say(busy ? "The AI is playing…" : myTurn()
      ? (moving ? "Tap a free tile in your sphere to move the villager there." : "Tap a tile in your sphere.")
      : "");
  }
}

function tilePanel() {
  const s = game.state;
  const p = game.seat;
  const k = selected;
  if (!k || !s.map.hexes[k]) return "";
  const terrain = terrainOf(s, k);
  const t = s.rules.terrain[terrain];
  const produces = t.produces
    ? (s.rules.resources.includes(t.produces) ? `produces ${t.produces}` : `${t.produces} (not used yet)`)
    : "produces nothing";
  let html = `<h3>${t.name} <span class="muted">· ${produces}</span></h3>`;
  const here = s.tiles[k];
  if (terrain === "settlement") {
    const owner = s.players.findIndex((pl) => pl.settlement === k);
    return `${html}<p class="muted">${owner === p ? "Your settlement." : `${s.players[owner].name}'s settlement.`}</p>`;
  }
  if (here && here.owner !== p) {
    const what = here.kind === "villager" ? "villager" : s.rules.buildings[here.building].name;
    return `${html}<p class="muted">${s.players[here.owner].name}'s ${what}.</p>`;
  }
  if (!inSphere(s, p, k)) {
    const near = me().ring < 3 && sphere({ ...s, players: s.players.map((pl, i) =>
      (i === p ? { ...pl, ring: pl.ring + 1 } : pl)) }, p).includes(k);
    return `${html}<p class="muted">Outside your sphere.${near ? ` Growing to ring ${me().ring + 1} takes it in.` : ""}</p>`;
  }
  if (here?.kind === "villager") {
    const seatsLeft = freeSeats(s, p);
    html += `<div class="options">
      ${option("Move", () => { moving = k; say(""); render(); })}
      ${option("Stand idle", () => act({ type: "assign", player: p, from: k, to: "idle" }))}
      ${option("Retire to the Assembly", () => act({ type: "retire", player: p, from: k }),
        { problem: seatsLeft < 1 ? "Build an Assembly first: no free seat." : null, thumb: "art/buildings/assembly.png" })}
    </div>`;
    return html;
  }
  if (here?.kind === "building") {
    return `${html}<p class="muted">${buildingBlurb(here.building)}</p>`;
  }
  // Free tile.
  const opts = [];
  opts.push(option("Recruit a villager here", () => act({ type: "recruit", player: p, at: k }),
    { cost: villagerCost(s, p), problem: validate(s, { type: "recruit", player: p, at: k }),
      thumb: "art/tokens/villager-blue.png" }));
  if (s.players[p].idle > 0) {
    opts.push(option("Put an idle villager here", () =>
      act({ type: "assign", player: p, from: "idle", to: k }),
    { problem: validate(s, { type: "assign", player: p, from: "idle", to: k }) }));
  }
  for (const type of Object.keys(s.rules.buildings)) {
    const b = s.rules.buildings[type];
    const action = { type: "build", player: p, building: type, at: k };
    opts.push(option(`Build ${article(b.name)}`, () => act(action),
      { cost: b.cost, problem: validate(s, action), thumb: BUILD_THUMBS[type] }));
  }
  return `${html}<div class="options">${opts.join("")}</div>`;
}

function me() {
  return game.state.players[game.seat];
}

function townPanel() {
  const s = game.state;
  const p = game.seat;
  const pl = s.players[p];
  const inc = income(s, p);
  const ring = ringCost(s, p);
  const opts = [];
  if (ring) {
    opts.push(option(`Grow to ring ${pl.ring + 1}`, () => act({ type: "upgrade", player: p }),
      { cost: ring, problem: validate(s, { type: "upgrade", player: p }) }));
  }
  opts.push(option("Recruit an idle villager", () => act({ type: "recruit", player: p, at: null }),
    { cost: villagerCost(s, p), problem: validate(s, { type: "recruit", player: p, at: null }) }));
  if (pl.idle > 0) {
    opts.push(option("Retire an idle villager", () => act({ type: "retire", player: p, from: "idle" }),
      { problem: validate(s, { type: "retire", player: p, from: "idle" }) }));
  }
  const incomeLine = s.rules.resources.map((r) => `+${inc[r]} ${r}`).join(", ");
  return `<h3>Your settlement</h3>
    <ul class="facts">
      <li>Villagers <b>${villagerCount(s, p)}</b>${pl.idle ? ` (${pl.idle} idle)` : ""}</li>
      <li>Electors <b>${pl.electors}</b> / ${seats(s, p)} seats</li>
      <li>Votes <b>${pl.votes}</b> (+${pl.electors * s.rules.electors.votesPerRound} a round)</li>
      <li>Next round <b>${incomeLine}</b></li>
      <li>Storage <b>${storageCap(s, p)}</b> each</li>
      <li>Free tiles <b>${freeTiles(s, p).length}</b> of ${sphere(s, p).length}</li>
    </ul>
    <div class="options">${opts.join("")}</div>`;
}

function scoresTable() {
  const s = game.state;
  const rows = s.players.map((pl, i) => `<tr class="${s.current === i ? "current-row" : ""}">
    <td><span class="swatch" style="background:${SEATS[i].hex}"></span>${i === game.seat ? "You" : pl.name}</td>
    <td>${pl.votes}</td><td>${pl.electors}</td><td>${villagerCount(s, i)}</td><td>${pl.ring}</td></tr>`);
  return `<table class="scores"><thead><tr><th>Empire</th><th>Votes</th><th>Electors</th>
    <th>Villagers</th><th>Ring</th></tr></thead><tbody>${rows.join("")}</tbody></table>`;
}

function showGameOver() {
  const s = game.state;
  const { result } = s;
  const title = result.winner === null
    ? "A tie"
    : result.winner === game.seat ? "You are elected" : `${s.players[result.winner].name} is elected`;
  $("game-over-title").textContent = title;
  const order = s.players.map((pl, i) => i).sort((a, b) => s.players[b].votes - s.players[a].votes);
  $("game-over-body").innerHTML = `<table class="scores"><thead><tr><th>Empire</th><th>Votes</th>
    <th>Electors</th></tr></thead><tbody>${order.map((i) => `<tr><td><span class="swatch"
    style="background:${SEATS[i].hex}"></span>${i === game.seat ? "You" : s.players[i].name}</td>
    <td>${s.players[i].votes}</td><td>${s.players[i].electors}</td></tr>`).join("")}</tbody></table>
    <p class="muted">Your first Elector: round ${firstElectorRound(game.seat) ?? "never"}.
    ${s.players.map((pl, i) => (i === game.seat ? "" : `${pl.name}'s: round ${firstElectorRound(i) ?? "never"}.`)).join(" ")}</p>`;
  $("game-over").hidden = false;
}

function firstElectorRound(p) {
  const h = game.state.history[p];
  const i = h.findIndex((x) => x.electors > 0);
  return i === -1 ? null : h[i].round;
}
