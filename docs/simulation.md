# What the simulator says about the rules

29 October 2026, rules as in `rules-config.js` at v0.2 (unchanged from v0.1). Every number
here comes from a command you can repeat.

The simulator exists to answer one question: **is the conversion decision a real decision?**
A player grows a settlement, then retires villagers into the Assembly as Electors who bank a
vote every round. Retire early and each Elector votes for longer, but the economy stops
growing. If the best answer is "retire at once" or "retire at the very end", the mechanic is
a sum, not a choice.

## The headline

The decision is real, but the last third of the game is not.

1. **Converting has an interior optimum, at round 11 of 20.** Doing it at once scores 40, at
   the end 15, and at the peak 99.
2. **Getting it wrong early is cheap; getting it wrong late is not.** Four rounds early costs
   18% of the peak. Four rounds late costs 29%, and seven rounds late costs 67%.
3. **Under best play the last seven rounds contain no decision at all.** The board is empty by
   round 13 and rounds 14 to 20 are 11 Electors banking 11 votes a round. The cause is the
   *rate* of retirement, not the length of the game or the timing of the first Elector:
   nothing stops a player emptying the whole board in one round, and that is what good play
   does. Shortening the game was measured at 12, 14 and 16 rounds and makes it worse.
4. **Ring 1 gridlocks the game from round 3 unless you rush ring 2.** The hand-tuned AI sits
   at zero free tiles for six straight rounds. Buying ring 2 in round 6 instead of round 9
   is worth more than any other single change in these runs.
5. **Three independent searches put good play at about 100 votes.** A useful anchor for the
   dial experiments: a rules change that does not move this number has not changed what good
   play is worth.

## The conversion curve

For each round r, the most votes a player can bank if their first villager is retired in
round r. Every other gene is searched, so this is what good play achieves at that timing,
not what one fixed AI does.

```
node tools/conversion-curve.mjs --tries 500 --seed 1
```

| First retirement in round | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Best votes | 40 | 38 | 54 | 81 | 85 | 87 | 81 | 85 | 98 | 90 |

| First retirement in round | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 |
|---|---|---|---|---|---|---|---|---|---|---|
| Best votes | **99** | 96 | 90 | 80 | 70 | 57 | 44 | 33 | 19 | 15 |

The peak is at round 11 with 99 votes. This reproduces the earlier 500-try run in
`docs/HANDOVER.md`, which put the peak at 9 to 11 with 98 to 100, so the result is stable
across search seeds.

Two things about the shape matter more than the peak itself.

**The plateau is wide.** Rounds 9 to 13 all score 90 to 99. Within that five-round window the
whole decision is worth about 9% of a score. A player who converts in round 9 and a player
who converts in round 13 have made the same decision as far as the result is concerned.

**The fall-off is asymmetric, and the asymmetry widens with distance.** Four rounds early
(round 7, 81 votes) costs 18%; four rounds late (round 15, 70 votes) costs 29%, so the late
error is about 1.6 times the early one. Six rounds out it is round 5 at 85 against round 17 at
44, which is 14% against 56%: nearly four times. In play that pushes everyone towards the
early edge of the plateau, which narrows an already soft decision.

**Rounds 1 to 3 collapse** to 38 to 54. There is no Assembly to seat anyone in yet, so those
runs are really "build an Assembly immediately, then convert", and they pay for it.

## What the economy does

Sixty games, both seats playing the same personality, rules unchanged.

| Round | 1 | 3 | 5 | 6 | 8 | 10 | 11 | 12 | 13 | 14-20 |
|---|---|---|---|---|---|---|---|---|---|---|
| Income, hand-tuned AI | 5 | 7 | 6 | 6 | 4 | 8 | 4 | 0 | 0 | 0 |
| Income, curve's peak player | 5 | 7 | 8 | 10 | 14 | 18 | 10 | 10 | 0 | 0 |
| Free tiles, hand-tuned AI | 2 | 0 | 0 | 0 | 0 | 10 | 11 | 12 | 12 | 12 |
| Free tiles, peak player | 2 | 0 | 0 | 11 | 8 | 6 | 8 | 8 | 11 | 11 |

### The economy does compound, but only if you buy ring 2 early

The handover recorded income peaking at 7 to 10 and concluded the economy compounds weakly.
That was the hand-tuned AI's ceiling, not the game's. Played well, income reaches **18 by
round 10**, which is 3.6 times the round-1 income.

The whole difference is one purchase. The hand-tuned AI reaches zero free tiles in round 3
and stays there until round 9, because its `ring2` gene only fires hard when it is already
crowded, by which time it has spent its wheat on villagers it cannot place. Six rounds of a
twenty-round game with nothing to buy and nowhere to put anyone. The peak player buys ring 2
in round 6 and never gridlocks.

Spreadsheet v3 targeted about 11 times growth. 3.6 times is well short of that even under
best play, so the engine is flatter than the paper model intended. The squeeze is ring 1's
six tiles minus the two a Mill and a Sawmill stand on.

### The last seven rounds are empty

Counting rounds in which nothing is bought and nobody is retired:

- Hand-tuned AI: **10 of 20** (rounds 6 and 7, then 13 to 20).
- Curve's peak player: **8 of 20** (round 5, then 14 to 20).

Under the best line found, the board is empty of villagers from round 13. Rounds 14 to 20 are
seven consecutive rounds in which the only thing that happens is 11 Electors banking 11 votes.
Thirty-five per cent of the game has no decision in it, and it is the end of the game.

This is a consequence of the rules, not of the AI. Once a villager is worth more as a vote
than as a worker, there is no reason to keep an economy, and once the economy is gone there is
nothing to spend on. The curve says the crossover is round 11, so the last nine rounds are
always going to be thin.

### Shortening the game makes it worse, not better

The obvious answer is to end the game before the dead stretch starts. It was the first thing
tried and it fails. The curve at four lengths, with the peak player of each then played
against itself to count the rounds in which nothing is bought and nobody is retired:

| Game length | Peak at | How far through | Plateau | Dead rounds | Trailing dead | Board empty from |
|---|---|---|---|---|---|---|
| 12 | round 4 | 33% | 4-6 | 7 (58%) | 6 | round 6 |
| 14 | round 4 | 29% | 4-6 | 9 (64%) | 8 | round 6 |
| 16 | round 6 | 38% | 4-10 | 10 (63%) | 9 | round 7 |
| 20 | round 10 | 50% | 9-13 | 8 (40%) | 7 | round 13 |

**Of the four, the 20-round game is the one with the most to do.** Shortening moves the peak
earlier faster than it shortens the game, so the dead tail grows as a share of play: 40% of a
20-round game, 64% of a 14-round one.

Worse, it destroys the decision. An Assembly costs 4 wheat and 4 wood, which cannot be
afforded before about round 4. At 12 and 14 rounds the peak sits exactly on that floor, so
the best line is "convert the moment you physically can". The interior optimum that makes the
mechanic interesting at 20 rounds becomes a corner solution in all but name. A 14-round game
reads: play three rounds, retire three villagers in round 4, retire the rest in round 6, then
watch for eight rounds.

### It is the rate of conversion, not the length or the timing

Every peak player found, at every length, retires as fast as the rules let it. Nothing caps
the rate: free seats limit the total, but a player with twelve seats may fill all twelve in
one round. That is what empties the board in two rounds and creates the dead stretch.

Varying only how many villagers a player may retire per round, at 20 rounds, in self-play:

| Retirements allowed per round | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| Final votes | 66 | **96** | 90 | 90 | 90 | 90 |
| Dead rounds | **1** | 6 | 9 | 9 | 9 | 9 |
| Trailing dead rounds | **0** | 5 | 8 | 8 | 8 | 8 |
| Board empty from | round 20 | round 15 | never empties | | | |

At one a round there is almost nothing dead in the game: the board stays populated to round
20 and only one round has no decision in it. It costs about a third of the score. At two a
round the score is *higher* than the uncapped game (96 against 90) and the dead rounds fall
from nine to six, because a player who keeps working while converting can afford more.

That last point is the useful one: **capping the rate is not a trade-off against score, at
least not at two a round.** Dumping the whole board at once is what good play currently does,
and it is not even the best line in self-play; it only looks best under the
votes-against-the-hand-tuned-AI measure the curve and evolution both optimise.

A caveat on how this was measured: this varies an AI gene (`convertPerRound`), not a rule.
A rule would bind every player equally, which is the same thing in self-play but has not been
tested as a rule. It is 40 games on one personality, so it is a strong hint and not a settled
result.

### So the options worth putting to the table are

- **Cap retirements per round**, probably at one or two per Assembly. On this evidence it is
  the only change that addresses the actual cause, and at two a round it appears to cost
  nothing. Needs a new rule: there is no rate limit in `rules-config.js` today.
- **Electors cost upkeep.** A seated Elector eats wheat, so the economy cannot be stripped
  entirely and the last rounds still need managing.
- **Votes scale with the settlement that seated them.** An Elector banks more while the
  settlement still works tiles, so emptying the board costs you.
- **Not shortening the game.** Measured above, and it makes both problems worse.

## The AI personalities

v0.2 adds `--curve n` to `evolve.js`: it runs the conversion curve with n tries per round and
seeds up to half the starting pool with its best players, so evolution begins from what good
play looks like at every timing instead of from random players. `--curve 0` is the old
behaviour.

```
node evolve.js --generations 60 --population 48 --curve 60 --seed 1
```

### Seeding was not what was wrong

The handover recorded plain evolution getting stuck on an early-conversion strategy worth 84
votes, against the curve's 99, and proposed three possible fixes: seed from the curve, run
more generations, or use a bigger population. Running the seeded version alone would not have
said which, so the same size was run with seeding off as a control.

| Run | Best |
|---|---|
| Hand-tuned Steward, self-play | 60 |
| Unseeded, population 32, 40 generations (the handover's run) | 84 |
| Unseeded, population 48, 60 generations | 99 |
| Seeded from the curve, population 48, 60 generations | **100** |
| Conversion-curve search, 500 tries a round | 99 |

**It was the budget, not the seeding.** Unseeded at the larger size, evolution reaches 99 by
generation 15 and then sits there for the remaining 45. Seeding is worth one vote on top of
that, and gets there sooner. The handover's 84 was a population-32 result, not evidence that
evolution needed help finding the shape of good play.

Seeding is kept on by default anyway: it costs about 30 seconds, it removes the dependence on
getting lucky with the starting pool, and it makes a run reproducible from the curve rather
than from the random seed alone. But it is not the thing that fixed the number.

### Three searches agree on the ceiling

The curve search, seeded evolution and unseeded evolution are three independent searches with
different starting points and different search methods. They land on 99, 100 and 99. Under
these rules, good play is worth about 100 votes and no amount of searching has found more.
That is a useful anchor: a rules change that does not move this number has not changed what
good play is worth.

### The champions

```
node evolve.js --generations 60 --population 48 --curve 60 --seed 1
```

Written to `ai-personalities.js` and reported in full in `docs/evolution.md`. The champion
beats the hand-tuned AI in 20 games of 20. Playing itself: 100 votes, first villager retired
in round 10, peak income 16, ring 2 by round 6, four Assemblies built.

The two runs reached the same score by visibly different routes:

| | Seeded champion | Unseeded champion |
|---|---|---|
| `assemblyFrom` | 10 | 2 |
| `convertFrom` | 4 | 5 |
| `convertPerRound` | 5 | 3 |
| `stopRecruitAfter` | 13 | 16 |
| First retirement, measured | round 10 | round 9 |
| Votes | 100 | 99 |

Both raise `ring2` above the hand-tuned 0.7 (to 0.70 and 0.87 respectively), which is the
third independent confirmation that buying ring 2 early is the main thing the hand-tuned AI
gets wrong.

### Two of the genes do almost nothing

`assemblyFrom` 2 and `assemblyFrom` 10 produce first retirements one round apart, because the
AI cannot build an Assembly it cannot afford and cannot retire into a seat it does not have.
The engine's own constraints mask the genes. Varying one gene at a time on the champion, 20
games against the hand-tuned AI:

| `convertFrom` (with `assemblyFrom` 10) | 1 | 4 | 8 | 10 | 11 | 12 | 14 |
|---|---|---|---|---|---|---|---|
| Votes | 100 | 100 | 100 | 100 | 97 | 94 | 75 |
| First retirement | 10 | 10 | 10 | 10 | 11 | 12 | 14 |

| `assemblyFrom` (with `convertFrom` 4) | 1 | 4 | 6 | 8 | 10 | 12 | 14 | 16 |
|---|---|---|---|---|---|---|---|---|
| Votes | 78 | 78 | 87 | 97 | **100** | 92 | 75 | 18 |
| First retirement | 5 | 5 | 6 | 9 | 10 | 12 | 14 | 17 |

**`convertFrom` has no effect at all at any value up to and including `assemblyFrom`.** Ten of
its twenty settings are identical, and above the Assembly date it can only delay and lose. It
is a dominated gene: evolution correctly drives it below the Assembly date, where it stops
mattering, which is why it scatters across the five champions (1, 2, 4, 4, 5) while
`assemblyFrom` converges on exactly 10 in all five.

`assemblyFrom` is the real conversion-timing gene, and it is clamped at the bottom too:
settings of 1 and 4 both give a first retirement in round 5, because that is when an Assembly
first becomes affordable.

So the genome is smaller than it looks, which is part of why both evolution runs plateau.
Worth doing before the next breeding run: drop `convertFrom`, rename `assemblyFrom` to what it
actually controls, and let the search spend its budget on genes that do something. Not done
here, because changing the genome invalidates the personalities just bred.

## Repeating any of this

```powershell
node --test                                     # 18 engine and map tests
node sim.js --games 200                         # summary of AI self-play
node tools/conversion-curve.mjs --tries 500     # the curve above (about 4 minutes)
node evolve.js --generations 60 --population 48 --curve 60
```

Any rule can be overridden for one run without editing `rules-config.js`:

```powershell
node tools/conversion-curve.mjs --tries 200 --set ringUpgrades.2.wheat=6 --set ringUpgrades.2.wood=6
```

## Next experiments

Not yet run. One change at a time, with the conversion curve after each, asking two questions:
does the peak move, and does the plateau get narrower?

1. `--set ringUpgrades.2.wheat=6 --set ringUpgrades.2.wood=6`. Ring 2 is the gate on the whole
   economy, so this is the first dial to turn.
2. `--set yield.improved=3`. A steeper engine should push the peak later and punish early
   conversion harder.
3. `--set villager.coefficient=2`. Makes population expensive, which should pull the peak
   earlier.
4. `--set buildings.assembly.seats=2`. Caps the total number of Electors, though not the rate.

Game length has already been swept at 12, 14, 16 and 20 rounds: see the dead-rounds section.
Shortening the game is not worth pursuing further.

The change the evidence actually points at is a rate cap on retirement, which needs a new rule
rather than a dial. It is not in `rules-config.js` yet, so it cannot be swept with `--set`.

Before the next breeding run, and separately from the dials: drop `convertFrom` and rename
`assemblyFrom`, so the search budget goes on genes that change the outcome.

## A note on speed

A game takes about 23 ms. The curve at 500 tries a round is about 4 minutes; the two 48 by 60
evolution runs above took 611 s seeded and 571 s unseeded. Almost all of it is
`structuredClone` in the engine's `cloneState`,
once per action. History entries, round actions and events are append-only and never changed
after they are pushed, so they could be shallow-copied instead of deep-cloned, which would
roughly halve the time. It is not done: it would add a "never change the past" invariant to
the one file where correctness matters most, to speed up a job that runs rarely.
