export const VERSION = "v0.1";

// Newest first. Bump VERSION and prepend an entry on EVERY publish, so the live
// app always shows exactly what shipped. Dates are YYYY-MM-DD.
export const CHANGELOG = [
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
