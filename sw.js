// Offline-first service worker (same pattern as Mech Attack).
// Bump CACHE on every publish and keep ASSETS in sync with what the app needs offline.
const CACHE = "myths-of-time-v0.1";
const V = "?v=0.1";
const MODULES = [
  "app.js", "version.js", "game.js", "dialog.js", "board.js", "engine.js", "ai.js",
  "ai-personalities.js", "hex.js", "maps.js", "rules-config.js",
];
const TILES = ["farmland", "forest", "stone", "mountain", "desert"];
const COLOURS = ["blue", "red", "yellow", "teal"];
const ASSETS = [
  ".",
  "index.html",
  `styles.css${V}`,
  ...MODULES.map((m) => `${m}${V}`),
  "manifest.webmanifest",
  "icon.png",
  "icon-maskable.png",
  "favicon.png",
  "apple-touch-icon.png",
  ...TILES.map((t) => `art/tiles/${t}.png`),
  ...COLOURS.map((c) => `art/tokens/villager-${c}.png`),
  "art/buildings/settlement.png",
  "art/buildings/mill.png",
  "art/buildings/sawmill.png",
  "art/buildings/assembly.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

// The page comes from the network when online so a new version shows at once; everything
// else is cache-first, since its URLs carry ?v= and change with each version.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request, { cache: "no-cache" })
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put("index.html", copy));
          }
          return response;
        })
        .catch(() => caches.match("index.html")),
    );
    return;
  }
  event.respondWith(caches.match(event.request).then((hit) => hit || fetch(event.request)));
});
