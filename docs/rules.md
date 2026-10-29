# Myths of Time rules for the digital game (v0.1)

What the engine plays by. Numbers live in `rules-config.js`. Starting numbers come from `myths-model-v3.xlsx` (Catalogue sheet) with its single currency split into wheat and wood. **Provisional** means picked to keep development moving; it still needs Phil's decision.

## Settled with Phil (29 October 2026)
- Two resources: wheat (farmland) and wood (forest).
- Players take turns. The engine also has a concurrent mode for network play later.
- Mountains produce iron and can be entered. Iron is not a resource yet, so a villager on a mountain makes nothing for now.

## The round
1. **Collect.** Every player's villagers produce: 1 per worked tile, or 2 on a tile improved by a Mill (wheat) or Sawmill (wood).
2. **Act.** Players take turns in seat order (seat 0 first every round). Actions: recruit a villager, move a villager, build, grow the sphere, retire a villager. Any number per turn.
3. **End of round.** Each resource above the storage limit is lost. Every Elector banks 1 vote, including Electors seated this round.

After round 20 the most votes wins. Tie: most resources left wins; still tied, a draw.

## Settlement and sphere
- A settlement works the tiles within its ring: ring 1 = 6 tiles, ring 2 = 18, ring 3 = 36.
- Ring 1 always has 3 farmland and 3 forest (the paper test). Ring 2 adds 5 farmland, 5 forest, 1 stone, 1 mountain. Ring 3 adds 7 farmland, 7 forest, 1 stone, 2 mountains, 1 desert (fewer where it overlaps a neighbour). **Provisional.**
- A tile holds one thing: a villager or a building.
- Two villagers to start, one on farmland and one on forest. Starting stock 3 wheat and 3 wood (**provisional**), plus the round-1 collection.

## Costs

| Item | Cost | Effect | Status |
|---|---|---|---|
| Villager N | N wheat (counting villagers and Electors) | Works one tile | v3 coefficient 1 |
| Mill | 4 wood | On farmland. First 3 worked farmland tiles yield 2 | provisional split |
| Sawmill | 4 wood | On forest. First 3 worked forest tiles yield 2 | provisional split |
| Warehouse | 6 wood | +10 storage of each resource | provisional split |
| Assembly | 4 wheat + 4 wood | 3 Elector seats | provisional split |
| Ring 2 | 10 wheat + 10 wood | +12 tiles | provisional split |
| Ring 3 | 30 wheat + 30 wood | +18 tiles | provisional split |

"People cost wheat, buildings cost wood" is a provisional rule of thumb for splitting v3's single currency.

## Other provisional rules

| Rule | Setting | Config |
|---|---|---|
| Storage | 10 of each resource carried over a round | `storage` |
| Mill improvement | Counts tiles, not adjacency: the first 3 worked farmland tiles anywhere in the sphere | `buildings.mill.improves` |
| Desert | Produces nothing, cannot be built on | `terrain.desert` |
| Stone, mountain | Buildable, produce nothing until stone and iron are resources | `terrain` |
| Contested tiles | First to use the tile keeps it (option: `"blocked"`, nobody may use it) | `contested` |
| Turn order | Same seat starts every round (option: `"rotate"`) | `turnOrder` |
| Moving villagers | Free, any number of times in your turn | |
| Undo | Your own actions this turn, any number | |

## Known consequences
- Maps differ only in where terrain sits, and nothing yet depends on adjacency, so every map plays the same economically. Map variety starts to matter once something is spatial (adjacency bonuses, roads, the contested edge at ring 3).
- Interaction between empires is almost nil in v0.1: only the 4 contested tiles at ring 3.
