# Scoring whole-country questions

"Paint the whole of Germany" asks for an area, not a point. This note records
how those answers are scored, why, and what was tried and dropped on the way.
The code is `packages/shared/src/regions.ts`; the numbers below come from the
calibration runs and playtests described, and the tests in
`packages/shared/src/regions.test.ts` pin the main ones.

## What a good rule has to do

These came from the first design discussion and from playtesting:

1. Painting the country's shape scores about 1000.
2. Hedging earns partial credit: honest uncertainty should pay, as it does for
   point questions (where a 50/50 split between two far places scores 750).
3. A confident wrong answer scores low, and lower the further away it is: a
   neighbour beats another continent.
4. Leaving part of the country out costs points.
5. Spilling well past the border costs points, symmetrically with (4).
6. Wrong paint spread thinly is still wrong, not "vague".
7. Uneven brushing (overlapping strokes) costs little: the question is where
   the country is, not how evenly you painted.
8. Point questions are unaffected.
9. Scoring 16 players at the end of a round stays well under a second.

## The rule

The player's paint `p` and the country `q` are both distributions over H3
cells: the paint's mass in each cell, and the country spread evenly by area.
The country's tolerance `r` is a fifth of its equivalent radius,
`R = sqrt(area / π)`: 30 km for Ireland, 65 km for Germany, 330 km for
Brazil. It sets the painting resolution (as for points) and the nearness
kernel's width.

```
score = max(shape, 0.55 × nearness)
```

**Shape** compares the paint with the country cell by cell, at the painting
resolution (cell edge at most `r / 4`):

```
shape = 1000 − 500 · Σ (p − q)² / a  ÷  Σ q² / a        (a = cell area)
```

This is the kernel score of the point rule in the limit of a vanishing kernel
width, so on its own it is proper. It has simple closed forms, which is much
of why it was chosen:

| Paint                                                | Shape                          |
| ---------------------------------------------------- | ------------------------------ |
| The country, evenly                                  | 1000                           |
| A share P on the country, the rest bloated round it  | 500 + 500 P                    |
| A fraction c of the country, evenly                  | 1000 − 500 (1/c − 1)           |
| Half on the country, half on a far place of its size | 750, like a 50/50 point answer |

Before comparing, two adjustments:

- **Density cap** (`DENSITY_CAP = 1.5`): each cell's density is capped at
  1.5 times the median painted density (area-weighted). See decision 6.
- **Off-country floor** (`OFF_COUNTRY_FLOOR = 0.5`): the off-country term,
  `Σ p² / a` over cells outside the country, is at least `0.5 × (off mass)² / A`,
  as if that paint were no thinner than half an even coat of the country. See
  decision 7.

**Nearness** is the point rule's kernel score with the country as the answer
(`scoreRegion`), under one Gaussian 16 tolerances wide (about 3.2 R),
normalised by the country's self-similarity so a big country sits on the same
scale as a small one. It sees the whole country as one blob, so it knows
nothing of shape; it is there so that a paint that misses the country, whose
shape score is near 0 wherever it is, still scores by how near it is. It runs
one H3 resolution coarser than painting, which is far finer than its width.

A pass scores 250, as for points.

### What it scores

From the final calibration (averages over Germany, Italy, Chile, Egypt,
Indonesia, the UK, Brazil, Australia and South Africa, with synthetic paints
built from the Natural Earth outlines):

| Paint                                             | Score    |
| ------------------------------------------------- | -------- |
| Exact shape                                       | ~999     |
| 80% of the country covered                        | ~886     |
| 65% covered                                       | ~757     |
| Half covered                                      | ~550     |
| Bloated so about half the paint is off            | 741–764  |
| Half on the country, half on a far place          | ~760     |
| Bright middle fading to half density at the edges | ~945–970 |
| Big faint blob far away (8× the area)             | ~274     |
| The whole world painted evenly                    | ~297     |

Real wrong countries, against Germany: Poland 435, France 402, Iran 274,
Japan 76. Neighbours beat far countries of similar size in all seven
calibration questions (Germany, Brazil, Chile, Egypt, UK, Spain, Poland).

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

### 5. Shape cell by cell, nearness only as a floor

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

### 6. Cap paint density

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

### 7. A floor for paint off the country

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

## Known limits

- **Not strictly proper.** The maximum, the density cap and the off-country
  floor each bend the rule. Each was chosen because its only incentive points
  the way the question asks (cover the whole country, and nothing else).
- **A floor near the country.** Any paint touching the right country gets at
  least about 0.55 of its nearness, about 545, so a tiny blob inside the
  country scores about as well as covering half of it. Lowering `λ` lowers it,
  and neighbours with it.
- **Big thin paints of big countries.** A much larger country painted thinly
  as the answer (Brazil for Germany) still scores in the 400s, above a
  neighbour.
- **Map projection.** The brush is a fixed size on screen, so painting evenly
  on screen puts more paint per km² towards the poles: an estimated 40% more at
  Germany's northern edge than its southern, and two to three times more across
  Norway or Finland. Not measured in play; the density cap softens it.
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

Typical paints score in 3 to 16 ms, a 31,000-cell paint in about 80 ms.
Scoring 16 players at the end of a round took 170 to 270 ms (Brazil, Germany,
Indonesia, with compacted paint as the client sends it). Coarse paint cells
off the country are not split to the painting resolution: every term sums
`p² / a` over them, which an even split leaves unchanged, and a world painted
at world zoom would otherwise mean millions of cells.

## Recalibrating

`packages/shared/scripts/calibrate-regions.mjs` (`pnpm calibrate` from
`packages/shared`, about 5 seconds) scores, with the game's own rule:

- synthetic paints built from each country's outline (partial, bloated,
  shifted, hedged, uneven, brushed with overlapping strokes, a big faint blob
  far away, the whole world), averaged over nine countries and reported
  against the target ranges they were tuned to;
- real wrong countries: neighbours against far countries of similar size;
- every country painted exactly.

Cases that fall outside their range by a trade-off made on purpose are marked
as accepted, with the reason: slightly-off paints (decision 5) and misses near
the country, lifted by the nearness safety net. Anything else outside its
range is a miss, and the script exits non-zero. `-- --detail` adds each
country's own scores; naming countries (`-- Germany Chile`) runs just those.

The constants to tune are `DENSITY_CAP`, `OFF_COUNTRY_FLOOR`,
`NEARNESS_WEIGHT` and `NEARNESS_KERNEL` in `regions.ts`, and
`TOLERANCE_FRACTION` in the build script. `regions.test.ts` pins the main
behaviours; update it with the numbers when a change is meant.
