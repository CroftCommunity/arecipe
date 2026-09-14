# Fuzzy tier — corpus evaluation

Generated 2026-09-14 by `scripts/eval-fuzzy.mjs` against the census (35274 lines from the
arecipe account's recipes), vocabulary of 1021 keys, threshold **0.75**.

| Measure | Value |
|---|---|
| Coverage, deterministic paths only | **86.7%** |
| Coverage with the fuzzy tier | **89.1%** (+830 lines) |
| Still unmatched | 3859 lines |

## Precision by score band (judged sample, re-scored today)

The judged sample is `tests/fixtures/ingredients/fuzzy-judged.json` (160 real unmatched names, a
semantic right/wrong each). The threshold sits where the band below it falls off a cliff.

| band | judged | right | precision |
|---|---:|---:|---:|
| 0.85–1.00 | 39 | 35 | 89.7% |
| 0.75–0.85 | 39 | 33 | 84.6% |
| 0.65–0.75 | 38 | 21 | 55.3% |
| 0.55–0.65 | 42 | 23 | 54.8% |

## The tier's picks, by line weight (review these)

| unmatched name | fuzzy pick | lines |
|---|---|---:|
| smooth peanut butter | peanut butter | 3 |
| pork shoulder roast | pork shoulder | 2 |
| creamy commercial peanut butter | creamy peanut butter | 2 |
| puffed cereal | puffed rice cereal | 2 |
| hamburger bun per burger | hamburger bun | 2 |
| pack vanilla sugar | vanilla sugar | 2 |
| can of tomato paste | tomato paste | 2 |
| lemon zest + 1 tbsp lemon juice | lemon juice | 2 |
| creamy peanut | creamy peanut butter | 2 |
| boiling apple cider vinegar | apple cider vinegar | 2 |
| haas avocado | avocado | 2 |
| vanilla bean gelato | vanilla bean | 2 |
| dutch-process cocoa powder | dutch-processed cocoa powder | 2 |
| brick cream cheese | cream cheese | 2 |
| double pie crust | pie crust | 2 |
| non-stick cooking spray | cooking spray | 2 |
| reserved cremini mushroom | cremini mushroom | 2 |
| tomato pasta sauce | pasta sauce | 2 |
| frac13 | frac12 | 2 |
| caffeine | mg caffeine | 2 |
| gelatine | gelatin | 2 |
| ribeye steak | beef ribeye steak | 2 |
| cheddar cheese soup | cheddar | 2 |
| whole wheat pastry flour | flour | 2 |
| ritz cracker | cracker | 2 |
| brewed black coffee | brewed coffee | 2 |
| cream or half and half | half-and-half | 2 |
| flaked coconut | coconut flake | 2 |
| mung bean sprout | bean sprout | 2 |
| plantain flour | plantain | 2 |
| 9-inch unbaked pie shell | unbaked 9-inch pie shell | 2 |
| fryer chicken | broiler/fryer chicken | 2 |
| habanero chile pepper | habanero chile | 2 |
| spaghetti sauce | spaghetti | 2 |
| marshmallow creme | marshmallow | 2 |
| minced/ground beef | beef | 2 |
| strong bread flour | bread flour | 2 |
| can tomato paste | tomato paste | 2 |
| pinch of cayenne pepper | cayenne pepper | 2 |
| lump crab meat | crab meat | 2 |

## Still unmatched, by line weight (vocabulary candidates)

ground (35) · whole (21) · boneless (14) · fresh (13) · large (12) · white (10) · red (10) · peeled (7) · cooked (7) · chopped (6) · dried (5) · skinless (5) · firm (3) · green (3) · fire-roasted diced tomato (2) · dark chocolate heart (2) · blade of mace (2) · refrigerated pizza crust (2) · banana ketchup (2) · natural greek yogurt (2) · your favorite bbq sauce (2) · glass of dry white wine (2) · pinch kosher salt (2) · can crushed tomato (2) · white house honey (2) · meaty ham bone (2) · dark chocolate shaving (2) · pomegranate (2) · smoke-dried catfish (2) · amaretto or frangelico liqueur (2)

## Generic single-word keys the vocabulary carries

A reviewer should consider whether these name an ingredient or a category: sugar, water, flour, oil, cheese, seasoning, stock, fish, cream, meat, vegetable, nut, spice, broth, fat, powder, filling, fruit, wine, juice.
