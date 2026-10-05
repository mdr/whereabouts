# Scoring whole-country questions

"Paint the whole of Germany" asks for an area, not a point. This note records
how those answers are scored, why, and what was tried and dropped on the way.
The code is `packages/shared/src/regions.ts`; the numbers below come from the
calibration runs and playtests described, and the tests in
`packages/shared/src/regions.test.ts` pin the main ones.

## What a good rule has to do

Point rounds score about right; country rounds were too harsh on near misses
and hedges. These goals came from comparing the two, case by case, on maps
(October 2026), and the rule below was refitted to them (decision 8).

1. **Where matters more than shape.** The question is where the country is.
   Covering all of it, with little paint outside, is what defines its shape;
   the outline is not tested for its own sake.
2. **Paint on the country always earns solid credit.** A confident blob
   inside it beats a confident neighbour clearly.
3. **Missing part of the country costs a little more than spilling past it.**
4. **Paint outside costs less the nearer it is.** A margin hugging the
   border costs less than a neighbour, which costs less than another
   continent.
5. **Emphasis counts, and hedging pays.** How heavily each candidate is
   painted sets how much it counts, and the score bows: a modest hedge on the
   right answer loses little, so painting what you believe is the best
   strategy, as in point rounds.
6. **Only the amount of wrong paint and its distance count**, not its shape
   or how tightly it is packed. Wrong paint spread thinly is still wrong.
7. **Confident misses tail off like point rounds**: about half credit for a
   neighbour, fading to the point rule's floor (about 75) on the far side of
   the world. Like point rounds, a pass (250) beats a wild guess.
8. **Brushing noise is nearly free**, but a clear lean within the country
   (a part painted two or three times over) costs a little.
9. Point questions are unaffected.
10. Scoring 16 players at the end of a round stays well under a second.

### Targets

Indicative scores for "Paint the whole of France", from that discussion.
`calibrate-regions.mjs` checks the same cases over nine countries, with the
neighbour played by the country's own shape moved two radii away.

| Paint                                                                        | Target                                   |
| ---------------------------------------------------------------------------- | ---------------------------------------- |
| France, exactly                                                              | 1000                                     |
| France, 28% / 52% of the paint outside, hugging it                           | 925 / 850                                |
| All inside France, covering 75% / 50% / 10% of it                            | 870 / 750 / 650                          |
| Half on France, half on Germany / 5000 km away                               | 775 / 750                                |
| France and Germany, 80/20 / 20/80                                            | 950 / 600                                |
| Germany, Belgium or another neighbour only                                   | about 500                                |
| Half on France, the Germany half squeezed into its east                      | a little below spreading it over Germany |
| France solid, a 10% / 25% / 50% wash over Western Europe                     | 920 / 860 / 800                          |
| Western Europe evenly / the whole world evenly                               | 700 / 300                                |
| France's shape moved 1400 / 2700 / 4000 km                                   | 400 / 270 / 185                          |
| Brushed once / a second pass over the middle third / two more over the north | 964 / 945 / 920–945                      |

## The rule

The player's paint `p` and the country `q` are both distributions over H3
cells: the paint's mass in each cell, and the country spread evenly by area.
The country's tolerance `r` is a fifth of its equivalent radius,
`R = sqrt(area / π)`: 30 km for Ireland, 65 km for Germany, 330 km for
Brazil. It sets the painting resolution (as for points) and the nearness
kernel's widths.

```
score = 0.4 × shape + 0.6 × nearness
```

A sum, like the point rule's mixture of kernels, so credit for covering the
country and for being near it add up. Paint density is not capped: how
heavily each candidate is painted is how a player hedges.

**Shape** compares the paint with the country cell by cell, at the painting
resolution (cell edge at most `r / 4`), on the country's cells, and charges
paint off the country by its amount `m` alone:

```
shape = 1000 − 500 · ( Σ (p − q)² / a  ÷  Σ q² / a  +  2 m² )        (a = cell area)
```

Where the paint off the country is, and how it is spread, is left to
nearness. Closed forms:

| Paint                                              | Shape                |
| -------------------------------------------------- | -------------------- |
| The country, evenly                                | 1000                 |
| A share P on the country evenly, the rest anywhere | 1000 − 1500 (1 − P)² |
| A fraction c of the country, evenly                | 1000 − 500 (1/c − 1) |
| Half on the country, half anywhere else            | 625                  |

**Nearness** is the point rule's kernel score with the country as the answer
(`scoreRegion`), normalised by the country's self-similarity so a big
country sits on the same scale as a small one, under Gaussians 5, 10, 20 and
40 tolerances wide (one, two, four and eight radii), weighted 1 : 1 : 2 : 2.
Each Gaussian is normalised and clamped at 0 on its own (decision 3). It
gives partial coverage, spill and misses credit by how near they are, fading
like the point rule. It runs one H3 resolution coarser than painting, which
is finer than its narrowest Gaussian.

A pass scores 250, as for points.

### What it scores

From `pnpm calibrate` (averages over Germany, Italy, Chile, Egypt,
Indonesia, the UK, Brazil, Australia and South Africa, with synthetic paints
built from the Natural Earth outlines; the shape moved 2R stands in for a
neighbour):

| Paint                                                             | Score                |
| ----------------------------------------------------------------- | -------------------- |
| Exact shape                                                       | ~999                 |
| About 28% / half of the paint spilt round it                      | 931 / 838            |
| 75% / half / a tenth covered                                      | 929 / 803 / 590      |
| Half on it, half on a neighbour / far away                        | 828 / 742            |
| 80/20 / 20/80 with a neighbour                                    | 969 / 574            |
| A neighbour only                                                  | 457                  |
| Solid, with a 10% / 25% / 50% wash over 4× the area               | 961 / 880 / 774      |
| 4× the area evenly / the whole world evenly                       | 656 / 342            |
| Moved 3.4R / 6.5R / 9.6R / to the antipode                        | 352 / 243 / 177 / 57 |
| Brushed once / a second pass over the middle / two over the north | 975 / 960 / 927      |

Six of the 23 targets are missed, none by more than 15 points: a neighbour
hedge, the faintest wash and plain brushing score a little high, and a tenth
covered a little low.

Real wrong countries, against Germany: Poland 444, France 431, Iran 135,
Japan 82. For France: Belgium 505, Germany 455; half France and half Germany
816, half France and half a copy of Germany 5000 km away 713. Neighbours beat
far countries of similar size in all seven calibration questions.

## Decisions, in the order they were made

### 1. Generalise the point rule; normalise by the country's self-similarity

The point rule is `score = 1000 − 500 ‖p − y‖²` in a Gaussian kernel's norm
(`500 (1 + 2A − B)` in `scoring.ts`), which is proper. Replacing the point `y`
with the country `q` gives `1000 − 500 ‖p − q‖²`, still proper. But
`‖p − q‖²` shrinks when both are spread wide against the kernel, so an even
paint of the whole world would score near 1000 against Russia. Dividing by
`Q = ⟨q, q⟩`, a fixed rescale per question, keeps a large country on the
point rule's scale (the world evenly scores about 500) and is still proper.
For a point, `Q = 1`, so this is exactly the point rule.

This survives as the nearness score.

### 2. Kernel: the game's mixture was far too lenient for shapes

The game's point kernel is an equal mixture of Gaussians at `r`, `4r` and
`16r`. Against a whole country the wide components see one blob: at `r = R/5`
a sloppy border scored within 15 points of perfect and Germany's shape moved
onto Poland scored 814. A `0.7 / 0.2 / 0.1` mixture was chosen first.

### 3. Normalise each kernel component by its own Q

Playtest: two thirds of Brazil scored 929. Cause: dividing the total squared
distance by the total `Q` let a wide component (which has `Q` near 1) swamp
the narrow one (`Q` about 0.15 for Brazil), so the weights did not mean what
they said. Normalising each component by its own `Q` and weighting the scores
fixed that, and stays proper. Two thirds of a country then scored about 870.

The same round of calibration showed a single narrow Gaussian cannot work on
its own: a paint that misses the country then scores only by how spread out it
is, whatever the distance, and Poland (11) scored below Japan (159) as an
answer for Germany. Real wrong countries were added to the calibration from
then on, since shifted copies of the country (same spread) had hidden this.

### 4. A coverage factor (later dropped)

Playtest: 65% of Australia scored 879. A factor of
`1 − precision (1 − sqrt(coverage))` brought partial paints down (65% to about 707) without touching misses or hedges. It was dropped in decision 5, which
made it unnecessary.

### 5. Shape cell by cell, nearness only as a floor (later a sum)

Playtest: South Africa with 98% covered but only 53% of the paint on it scored
883; the target was about 750. The narrow Gaussian itself was the cause: it
blurs the country's edge, and paint spilling outside fills exactly that blur.
Narrowing the tolerance only helped slowly (R/10 still gave about 820), since
the effect scales with the width.

Taking the width to zero gives the cell-by-cell score, with the closed forms
above: 53% on the country gives 765, 65% coverage 731. The wide component was
kept only for misses, as `max(shape, λ × nearness)`; `λ = 0.55` kept
neighbours above far countries in all seven questions. The maximum of two
proper scores is not proper, but it only lifts misses towards their nearness.
The coverage factor from decision 4 was no longer needed and was removed.

The cost: slightly-off paints lose more than under a kernel, since nothing
blurs the border (a border 0.1 R too big scores about 850 to 907 rather than
about 980).

### 6. Cap paint density (later dropped)

Playtest: a near-perfect Mexico scored 892. Simulated brush strokes
(`PaintLayer.stamp`, a stamp every quarter brush as in the paint controller)
reproduced it: a second pass down the country's spine doubled the density
there and cost 72 to 98 points against an even coat. A country is uniform, so
repainting part of it says nothing.

Tried: comparing one resolution coarser (no help: the ridge is wider than a
cell), `sqrt(intensity)` and a soft saturation at one brush coat (both made
evenly brushed paints worse, by giving the faint brush edges that spill past
the border more relative weight), and a cap at 1.5 times the median painted
density. The cap brought ridged paints to 939 to 952 and left even paints
unchanged (961). Lighter paint, such as a hedge on a second country, stays
under the cap.

Trade-off: repainting can no longer express much confidence between two
candidate countries; when the lighter candidate is the larger one, the median
follows it and the heavier one is capped to 1.5 times its level.

### 7. A floor for paint off the country (later replaced)

Playtest: a big soft blob over North America scored 444 for Madagascar. With
no paint on the country, shape is `500 (1 − P² A / A_paint)`: spreading wrong
paint thinly earned the credit the score gives vagueness (the whole world
painted evenly scored about 500). Counting off-country paint as no thinner
than half an even coat of the country (`α = 0.5`) brought that blob to about
274 and the whole world to about 297, just above a pass. Paint on the country,
and off-country paint that is already concentrated (bloated borders, 50/50
hedges, confident misses) are unaffected. It also fixed the one fragile
near-versus-far case: Iran for Germany fell from 401 to 274, below Poland
(435). `α = 0.35` was the softer alternative (blob about 342).

### 8. A sum of shape and nearness, fitted to new targets

Comparing the same paints as point and country answers (`scripts/compare-modes.mjs`)
and then case by case on maps gave the goals and targets above. The rule then
fell short of them in five ways:

- **Nearness was a maximum, not a sum.** A paint scored its shape or 0.55 of
  its nearness, so near misses and partial coverage never added up.
  Everything from half the country to a neighbour landed between 500 and 550,
  and half on Germany (696) scored no better than half 5000 km away (698).
- **Shape ignored distance**, and charged packed wrong paint more than spread.
- **The density cap erased emphasis.** When the lighter candidate covered
  more area, the heavier one was trimmed to 1.5 times it: Germany 90% with
  France 10% scored exactly as 50/50 (784; 987 without the cap), and France
  solid with any wash over Western Europe scored 663 however faint the wash.
- **Partial coverage fell off a cliff**: half covered scored about 550.
- **Confident misses fell too fast**: one Gaussian 16 tolerances wide at 0.55
  gave 71 at 2700 km from France, against about 270 from the point rule at
  the tolerance it would give France as a point.

The fix follows the point rule: a weighted sum of proper parts. The scores of
each part (shape, and kernel scores under single Gaussians from a quarter of
a radius to sixteen) were computed once per calibration case, and weights
searched to fit the targets. The best fits put 0.4 on shape and the rest on
Gaussians one to eight radii wide, and charged off-country paint as if at
least twice an even coat's density, which in practice is by amount alone;
the rule takes that form outright. Without the cap, plain brushing still
scores 975 and a heavy lean over a third of the country 927.

Scoring 16 brushed paints, compacted as the client sends them, takes 57 to
184 ms (Brazil, Canada, Germany, France, Indonesia), a little faster than
before: the cap's sort cost more than three more Gaussians.

## Known limits

- **Not strictly proper.** Charging off-country paint by its amount alone,
  and clamping each part at 0, bend the rule. Both push the way the question
  asks: put paint on the country, and the rest near it.
- **Partial coverage is still steep in shape.** Shape reaches 0 at a third of
  the country covered, so a blob inside the country (about 590) beats a
  neighbour (about 450 to 500) by less than the targets ask.
- **Hedges with a neighbour are a little generous**, since every Gaussian is
  at least a radius wide: half on Germany and half on Poland scores 813.
- **Map projection.** The brush is a fixed size on screen, so painting evenly
  on screen puts more paint per km² towards the poles: an estimated 40% more at
  Germany's northern edge than its southern, and two to three times more across
  Norway or Finland. Not measured in play.
- **Different from points in one place.** The whole world painted evenly
  scores about 300 here and about 500 for a point question.

## Flag rounds

A flag round shows a country's flag instead of its name. A country is painted
whole, by the rule above, unless no outline would be fair to paint, in which
case it is asked as a point and scored by the point rule, like a place:

- under 10,000 km² (Luxembourg, Singapore, the Caribbean and Pacific island
  states): too small to paint the shape of;
- a disputed border (China, India, Pakistan, Israel, Morocco, Serbia, Somalia,
  Ukraine, Cyprus);
- crossing the antimeridian (Russia), or with Alaska and Hawaii (the United
  States);
- a scattered archipelago, whose kept islands hold less than 75% of its land
  (the Bahamas, Vanuatu).

The question says which, with a badge ("Paint the whole country" or "Paint
where it is"), since the two are painted so differently. That gives a clue
for a few look-alike pairs (Indonesia is painted, Monaco is a point), which
was accepted for the clarity.

Practice has a Flags mode. In a game the host sets how many flag rounds to
ask, alongside landmarks, place names and whole countries (the question mix),
and no country is asked twice, whether by name, whole or by flag. Players are
sent the flag's code, never the name, until the reveal.

The reveal shows the flag and name of the country under the pointer (on a
phone, the one tapped, until the next tap or a drag), and under each player
the country with the largest share of their paint, if it has at least a fifth
("Peru 62%", green when it is the answer), so a wrong guess shows whose flag
it was taken for. Each paint cell counts where its centre is. Within a small
or scattered country's tolerance of its answer, the point counts as that
country, even on a neighbour's land (paint on San Marino, or near Tuvalu,
which is far smaller than a cell); for the pointer, so does within 12 pixels
of it. Where Natural Earth marks an area indeterminate (part of Western
Sahara, Palestine, the Siachen Glacier), in the rest of Western Sahara (its
Morocco includes the part Morocco controls) and in Crimea, no country is
named. Elsewhere Natural Earth's lines of control stand (Kashmir, the Golan
Heights).

A point's answer is Natural Earth's label point for small countries and the
area centroid for large ones. Its tolerance is half the country's equivalent
radius, at least 15 km; for small and scattered island states, at least a
quarter of the greatest distance from the answer to any of their land
(Kiribati 925 km, the Bahamas 180 km). At half the radius, painting the
country evenly scores about 890, a tight blob at its centre about 990, and a
neighbour's area two radii away about 640 (India, Pakistan, Serbia, Somalia,
Ukraine). A full radius scored the country about 950 and the neighbour about
725, too generous next to the region rule's 435 for Poland against Germany.

## Data

`packages/shared/regions.json` holds 150 countries from Natural Earth's 1:50m
admin-0 outlines (public domain), built by
`packages/shared/scripts/build-regions.mjs`: every sovereign country but
those asked only as a point in flag rounds (above), with the contiguous
United States in place of the whole. Each keeps its largest landmass and
islands of at least 1,500 km² within 500 km of what is kept, chained (so
Sicily and Crete stay; the Canaries, Svalbard and Alaska go; Malaysia chains
to 800 km to keep Borneo), simplified to about 1.5 km. The tolerance is set
in the build script. `flags.json`, built alongside, has one flag round per
country, 194 in all: the region's id, or a point and tolerance. Northern
Cyprus, Somaliland, Taiwan and Kosovo are left out. `borders.json`, also
built alongside, has every flag country's land for the reveal, coarser
(simplified to about 5 km, islands under 50 km² left out) and delta-encoded:
about 65 KB gzipped, fetched when a game with flags starts or a flag round
comes up in practice.

The client fetches both files on demand (their own chunk); the server holds
regions.json and scores multiplayer rounds, which tell clients only the
country's id until the reveal. Flag pictures come from the flag-icons package
(MIT), one small file per flag, fetched when its round comes up.

## Cost

Scoring 16 brushed paints at the end of a round, compacted as the client
sends them, takes 57 to 184 ms (Brazil, Canada, Germany, France, Indonesia),
4 to 12 ms a paint; the whole world painted evenly about 220 ms. Coarse paint
cells off the country are not split to the painting resolution: only their
total mass counts, and a world painted at world zoom would otherwise mean
millions of cells.

## Recalibrating

`packages/shared/scripts/calibrate-regions.mjs` (`pnpm calibrate` from
`packages/shared`, about 10 seconds) scores, with the game's own rule:

- synthetic paints built from each country's outline (partial, bloated,
  hedged, washed, shifted, brushed with overlapping strokes, the whole
  world), averaged over nine countries and reported against the ranges in
  "Targets" above, plus the orderings those imply;
- real wrong countries: neighbours against far countries of similar size;
- every country painted exactly.

A few older cases have no target yet and are only reported. Anything outside
its range is a miss, and the script exits non-zero; the rule misses 6 of the
23 ranges, each by 15 points or less. `-- --detail` adds each
country's own scores; naming countries (`-- Germany Chile`) runs just those.

The constants to tune are `SHAPE_WEIGHT`, `OFF_COUNTRY_COST` and
`NEARNESS_KERNEL` in `regions.ts`, and `TOLERANCE_FRACTION` in the build
script. `regions.test.ts` pins the main
behaviours; update it with the numbers when a change is meant.
