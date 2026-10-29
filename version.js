export const VERSION = "v0.2";

// Newest first. Bump VERSION and prepend an entry on EVERY publish, so the live
// app always shows exactly what shipped. Dates are YYYY-MM-DD.
export const CHANGELOG = [
  {
    version: "v0.2",
    date: "2026-10-29",
    notes: [
      "Pinch, drag or use the buttons to zoom and pan the board.",
      "The board opens on your settlement, big enough to tap on a phone.",
      "Fixed: on a phone the top bar hid your wood and votes behind the Undo button.",
      "The board now redraws only the pieces that moved, not the whole map.",
      "AI empires play the personalities bred by the simulator.",
    ],
  },
  {
    version: "v0.1",
    date: "2026-10-29",
    notes: [
      "First playable version: the core loop against one or two AI empires.",
      "Wheat and wood, villagers, Mill, Sawmill, Warehouse, Assembly, rings 2 and 3.",
      "Retire villagers to the Assembly as Electors; most votes after 20 rounds wins.",
      "Undo your moves this turn. Games save as you play.",
    ],
  },
];
