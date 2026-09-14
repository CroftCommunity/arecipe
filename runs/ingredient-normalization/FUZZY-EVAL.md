# Fuzzy tier — corpus evaluation

Generated 2026-09-14 by `scripts/eval-fuzzy.mjs` against the census (35274 lines from the
arecipe account's recipes), vocabulary of 937 keys, threshold **0.75**.

| Measure | Value |
|---|---|
| Coverage, deterministic paths only | **87.9%** |
| Coverage with the fuzzy tier | **89.9%** (+702 lines) |
| Still unmatched | 3566 lines |

## Precision by score band (judged sample, re-scored today)

The judged sample is `tests/fixtures/ingredients/fuzzy-judged.json` (160 real unmatched names, a
semantic right/wrong each). The threshold sits where the band below it falls off a cliff.

| band | judged | right | precision |
|---|---:|---:|---:|
| 0.85–1.00 | 39 | 35 | 89.7% |
| 0.75–0.85 | 37 | 32 | 86.5% |
| 0.65–0.75 | 38 | 23 | 60.5% |
| 0.55–0.65 | 42 | 26 | 61.9% |

## The tier's picks, by line weight (review these)

| unmatched name | fuzzy pick | lines |
|---|---|---:|
| vegetable | vegetable oil | 18 |
| pork shoulder roast | pork shoulder | 2 |
| puffed cereal | puffed rice cereal | 2 |
| hamburger bun per burger | hamburger bun | 2 |
| pack vanilla sugar | vanilla sugar | 2 |
| lemon zest + 1 tbsp lemon juice | lemon juice | 2 |
| culantro | cilantro | 2 |
| boiling apple cider vinegar | apple cider vinegar | 2 |
| cheddar cheese curd | cheddar | 2 |
| haas avocado | avocado | 2 |
| dutch-process cocoa powder | dutch-processed cocoa powder | 2 |
| brick cream cheese | cream cheese | 2 |
| double pie crust | pie crust | 2 |
| non-stick cooking spray | cooking spray | 2 |
| reserved cremini mushroom | cremini mushroom | 2 |
| tomato pasta sauce | pasta sauce | 2 |
| caffeine | mg caffeine | 2 |
| gelatine | gelatin | 2 |
| cheddar cheese soup | cheddar | 2 |
| pureed tomato | puréed tomato | 2 |
| whole wheat pastry flour | flour | 2 |
| ritz cracker | cracker | 2 |
| brewed black coffee | brewed coffee | 2 |
| flaked coconut | coconut flake | 2 |
| mung bean sprout | bean sprout | 2 |
| plantain flour | plantain | 2 |
| strip steak | new york strip steak | 2 |
| 9-inch unbaked pie shell | unbaked 9-inch pie shell | 2 |
| habanero chile pepper | habanero chile | 2 |
| spaghetti sauce | spaghetti | 2 |
| marshmallow creme | marshmallow | 2 |
| lump crab meat | crab meat | 2 |
| morel mushroom | mushroom | 2 |
| romaine lettuce leaf | romaine lettuce | 2 |
| chipotle chiles in adobo sauce | chipotle chiles in adobo | 2 |
| rosemary leaf | rosemary | 2 |
| standard | standard egg | 2 |
| grapeseed oil | rapeseed oil | 2 |
| ancho chili powder | ancho chile powder | 2 |
| chile-tomato purée | tomato paste | 2 |

## Still unmatched, by line weight (vocabulary candidates)

clove (59) · ground (35) · whole (20) · boneless (14) · large (12) · fresh (11) · peeled (7) · cooked (6) · rub (5) · skinless (5) · filling (5) · topping (5) · white (4) · dried (4) · chopped (4) · frozen vegetable (3) · fire-roasted diced tomato (2) · dark chocolate heart (2) · blade of mace (2) · refrigerated pizza crust (2) · banana ketchup (2) · creamy commercial peanut butter (2) · natural greek yogurt (2) · your favorite bbq sauce (2) · glass of dry white wine (2) · white house honey (2) · dark chocolate shaving (2) · pomegranate (2) · smoke-dried catfish (2) · amaretto or frangelico liqueur (2)

## Generic single-word keys the vocabulary carries

A reviewer should consider whether these name an ingredient or a category: sugar, water, flour, oil, cheese, seasoning, stock, cream, fish, meat, nut, broth, spice, fat, fruit, wine, sauce.
