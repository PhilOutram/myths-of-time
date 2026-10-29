# Evolution run

`node evolve.js --generations 60 --population 48 --seed 1 --fitness votes --curve 60`

## Best personalities

| Gene | Default | Archon | Bailiff | Chancellor | Doge | Elder |
|---|---|---|---|---|---|---|
| convertFrom | 10 | 4 | 4 | 1 | 2 | 5 |
| convertPerRound | 2 | 5 | 5 | 5 | 5 | 5 |
| stopRecruitAfter | 15 | 13 | 13 | 13 | 15 | 12 |
| assemblyFrom | 8 | 10 | 10 | 10 | 10 | 10 |
| wheatShare | 0.5 | 0.605 | 0.605 | 0.605 | 0.604 | 0.605 |
| patience | 0.5 | 0.5 | 0.605 | 0.75 | 0.605 | 0.5 |
| villager | 1 | 0.845 | 0.845 | 0.943 | 0.943 | 0.943 |
| mill | 0.8 | 0.775 | 0.89 | 1 | 0.885 | 0.885 |
| sawmill | 0.8 | 0.885 | 0.82 | 0.694 | 0.568 | 0.8 |
| warehouse | 0.5 | 0.324 | 0.212 | 0.46 | 0.324 | 0.175 |
| assembly | 0.9 | 0.815 | 0.815 | 0.729 | 0.815 | 0.86 |
| ring2 | 0.7 | 0.7 | 0.599 | 0.768 | 0.599 | 0.7 |
| ring3 | 0.3 | 0.153 | 0.264 | 0.233 | 0.264 | 0.127 |
| fitness | | 100 | 100 | 100 | 100 | 100 |

Champion: convert from round 4, up to 5 a round; recruit until round 13; Assembly from round 10; patience 0.5. Beats the hand-tuned AI in 20 of 20 games.

## The champion playing itself

```
20 games, 2 players
Votes: mean 100.0, median 100.0, range 100–100
First player wins 0.0%, draws 100.0%
First villager retired: median round 10.0 (100.0% of players retire any)
Peak income 16.0 a round; round-1 income 5.0
Turns with no purchase 40.0%; rounds ending with no free tile 15.0%; idle villagers 0.1 on average
Lost to storage limits 0.0 resources a game
Ring 2 reached by 100.0% (median round 6.0); ring 3 by 0.0% (median round –)
Leader / trailer income: round 5 1.0x, round 10 1.0x, round 15 –x
Built per player: mill 2.0, sawmill 1.0, assembly 4.0

Round  Income  Purchases  Retired
    1     5.0        2.0      0.0
    2     6.0        1.0      0.0
    3     7.0        1.0      0.0
    4     8.0        1.0      0.0
    5     8.0        0.0      0.0
    6    10.0        1.0      0.0
    7    11.0        1.0      0.0
    8    14.0        2.0      0.0
    9    16.0        1.0      0.0
   10    12.0        2.0      3.0
   11    14.0        1.0      0.0
   12    10.0        2.0      3.0
   13     0.0        2.0      5.0
   14     0.0        0.0      0.0
   15     0.0        0.0      0.0
   16     0.0        0.0      0.0
   17     0.0        0.0      0.0
   18     0.0        0.0      0.0
   19     0.0        0.0      0.0
   20     0.0        0.0      0.0
```

## The champion (seat 1) against the hand-tuned AI (seat 2)

```
20 games, 2 players
Votes: mean 80.0, median 80.0, range 60–100
First player wins 50.0%, draws 0.0%
First villager retired: median round 10.0 (100.0% of players retire any)
Peak income 13.0 a round; round-1 income 5.0
Turns with no purchase 45.0%; rounds ending with no free tile 22.5%; idle villagers 0.3 on average
Lost to storage limits 0.0 resources a game
Ring 2 reached by 100.0% (median round 7.5); ring 3 by 0.0% (median round –)
Leader / trailer income: round 5 1.3x, round 10 1.5x, round 15 –x
Built per player: mill 1.5, sawmill 1.0, assembly 3.5, warehouse 0.5

Round  Income  Purchases  Retired
    1     5.0        2.0      0.0
    2     6.0        1.0      0.0
    3     7.0        1.0      0.0
    4     8.0        1.0      0.0
    5     7.0        0.5      0.0
    6     8.0        0.5      0.0
    7     8.5        0.5      0.0
    8     9.0        1.5      0.0
    9    13.0        1.0      0.0
   10    10.0        1.5      2.5
   11     9.0        1.0      1.0
   12     5.0        1.5      2.5
   13     0.0        1.0      2.5
   14     0.0        0.0      0.0
   15     0.0        0.0      0.0
   16     0.0        0.0      0.0
   17     0.0        0.0      0.0
   18     0.0        0.0      0.0
   19     0.0        0.0      0.0
   20     0.0        0.0      0.0
```
