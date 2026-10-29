// Myths of Time - splash menu, new-game setup and the rules page.
import { VERSION } from "./version.js?v=0.1";
import { openGame, hasSavedGame } from "./game.js?v=0.1";
import { confirmDialog } from "./dialog.js?v=0.1";

// Service worker: installable and offline. The relative path works on the Pages subpath.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((err) => {
      console.warn("Service worker registration failed:", err);
    });
  });
}

const $ = (id) => document.getElementById(id);
$("version").textContent = VERSION;

function showSplash() {
  $("splash").hidden = false;
  $("menu-resume").hidden = !hasSavedGame();
}

$("menu-play").addEventListener("click", async () => {
  const replace = !hasSavedGame() || await confirmDialog({
    title: "New game?",
    text: "You have a game in progress. Starting a new one ends it.",
    confirm: "New game",
    cancel: "Keep it",
  });
  if (!replace) return;
  $("setup-map").value = String(1 + Math.floor(Math.random() * 999));
  $("setup").hidden = false;
});

$("setup-cancel").addEventListener("click", () => { $("setup").hidden = true; });
$("setup-form").addEventListener("submit", (e) => {
  e.preventDefault();
  $("setup").hidden = true;
  $("splash").hidden = true;
  openGame({
    settings: {
      opponents: Number($("setup-opponents").value),
      ai: $("setup-ai").value,
      mapNumber: Math.max(1, Number($("setup-map").value) || 1),
    },
    exit: showSplash,
  });
});

$("menu-resume").addEventListener("click", () => {
  $("splash").hidden = true;
  if (!openGame({ resume: true, exit: showSplash })) showSplash();
});

$("menu-rules").addEventListener("click", () => { $("rules").hidden = false; });
$("rules-close").addEventListener("click", () => { $("rules").hidden = true; });
$("rules-body").innerHTML = `
  <p>You run one settlement. Over 20 rounds you grow it, then turn its people into votes.
  Most votes at the end wins.</p>
  <ul>
    <li><b>Collect.</b> At the start of each round every villager on farmland makes 1 wheat;
    on forest, 1 wood.</li>
    <li><b>Spend.</b> Recruit villagers (wheat; each costs more than the last), build a Mill or
    Sawmill (worked tiles of that kind yield 2), a Warehouse (more storage) or an Assembly
    (3 seats). Grow your sphere to ring 2, then ring 3.</li>
    <li><b>One thing per tile.</b> Buildings take the tiles your villagers would work. A Mill
    must stand on farmland, a Sawmill on forest.</li>
    <li><b>Storage.</b> You keep at most 10 of each resource from one round to the next,
    more with Warehouses.</li>
    <li><b>Retire.</b> Send a villager to a seat in your Assembly. It never works again, but as
    an Elector it banks 1 vote at the end of every round from now on.</li>
  </ul>
  <p>Retire early and each Elector votes for longer, but your economy stops growing. That
  timing is the game.</p>
  <p class="muted">Tiles inside two spheres are contested: whoever uses one first keeps it.</p>`;

showSplash();
