# Ingredient vocabulary — review report

Generated 2026-09-09 by `scripts/build-ingredientkeys.mjs` (min-lines 3).
Census: 4113 records / 35274 lines / 22727 distinct raw lines (snapshot 2026.09.09-20eda6c).

**This is a PROPOSAL until a human has reviewed it** (plan Phase 1, the single quality gate).
Review = read the promotion candidates and the alias merges below; edit
`scripts/ingredient-vocab-seed.json` (taxonomy words, seeded synonyms), re-run, repeat.

| Measure | Value |
|---|---|
| Keys proposed | 1009 |
| Coverage by line weight (resolver over the census) | **82.5%** (29089 / 35274) |
| Tail (heads under the floor) | 5488 heads, 6086 lines (17.3%) |
| Keys carrying aliases | 116 |

## Top keys by line weight

| key | lines | top variants (descriptor forms folded in) |
|---|---:|---|
| salt | 2347 | kosher salt (67) · fine sea salt (23) · sea salt (21) · table salt (14) |
| onion | 1046 | red onion (64) · yellow onion (49) · white onion (30) · sweet onion (9) |
| sugar | 1045 | white granulated sugar (339) · granulated sugar (161) · white sugar (101) · caster sugar (35) |
| butter | 879 | unsalted butter (224) · salted butter (5) · sweet butter (2) · low-fat butter (1) |
| water | 856 | hot water (22) · jasmine water (2) |
| garlic | 833 | granulated garlic (12) · whole garlic (3) · ground garlic (2) · green garlic (1) |
| flour | 780 | all-purpose flour (319) · plain flour (44) · self-raising flour (28) · white flour (11) |
| egg | 764 | whole egg (19) · cooked egg (1) |
| olive oil | 592 | extra-virgin olive oil (72) · extra virgin olive oil (13) · virgin olive oil (6) · greek olive oil (1) |
| black pepper | 584 | ground black pepper (149) · coarse black pepper (2) · heavy black pepper (2) · coarse ground black pepper (1) |
| pepper | 566 | ground pepper (36) · red pepper (22) · green pepper (19) · hot pepper (10) |
| milk | 419 | whole milk (42) · full-fat milk (4) · powdered milk (4) · skim milk (3) |
| tomato | 380 | canned tomato (9) · red tomato (8) · whole tomato (4) · green tomato (2) |
| vegetable oil | 349 |  |
| cinnamon | 313 | ground cinnamon (132) · powdered cinnamon (7) · mexican cinnamon (1) · whole cinnamon (1) |
| paprika | 272 | smoked paprika (52) · ground paprika (43) · sweet paprika (16) · hot paprika (5) |
| carrot | 246 | baby carrot (2) · frozen carrot (2) · whole carrot (2) · cooked carrot (1) |
| bell pepper | 237 | green bell pepper (94) · red bell pepper (70) · capsicum (3) · red capsicum (3) |
| baking powder | 228 | kosher baking powder (1) |
| parsley | 228 | flat-leaf parsley (17) · dried parsley (8) · italian parsley (3) · curly parsley (2) |
| brown sugar | 227 | light brown sugar (37) · dark brown sugar (30) · fine brown sugar (1) |
| cumin | 219 | ground cumin (123) · black cumin (4) · powdered cumin (1) · white cumin (1) |
| lemon juice | 218 |  |
| oil | 218 | hot oil (2) · red oil (2) |
| potato | 216 | white potato (7) · red potato (5) · baby potato (4) · cooked potato (4) |
| rice | 215 | cooked rice (31) · uncooked rice (26) · basmati rice (16) · long-grain rice (15) |
| cayenne pepper | 198 | ground cayenne pepper (39) · powdered cayenne pepper (3) · ground red cayenne pepper (2) · dried ground cayenne pepper (1) |
| ginger | 184 | ground ginger (47) · powdered ginger (9) · dried ginger (2) · pickled ginger (1) |
| vanilla extract | 184 |  |
| soy sauce | 172 | light soy sauce (17) · dark soy sauce (12) · black soy sauce (2) · dark chinese soy sauce (1) |
| bay leaf | 170 | dried bay leaf (2) · whole dried bay leaf (2) |
| thyme | 159 | dried thyme (42) · ground dried thyme (1) |
| nutmeg | 153 | ground nutmeg (57) · powdered nutmeg (2) · dried nutmeg (1) · whole nutmeg (1) |
| tomato paste | 152 | tomato purée (14) · tomato puree (5) · canned tomato paste (2) · unsalted tomato paste (1) |
| baking soda | 144 | bicarbonate of soda (14) · kosher baking soda (1) |
| cilantro | 144 | coriander leaf (37) · fresh coriander (18) · dried cilantro (1) |
| heavy cream | 142 | heavy whipping cream (19) · whipping cream (16) · double cream (6) |
| scallion | 135 | green onion (69) · spring onion (22) · salad onion (1) · whole scallion (1) |
| lemon | 131 | whole lemon (4) |
| celery | 130 | green celery (1) · young celery (1) |

## Promotion candidates — variants with ≥ 20 lines

A variant is a descriptor-bearing form the resolver reads as key + variety. If it
is really its own ingredient (`bread crumb` is not a crumb variety), give it a
key: add it to the seed as a key with itself as alias, or remove the descriptor
word from the taxonomy if it never modifies.

| variant | folded under | lines |
|---|---|---:|
| white granulated sugar | sugar | 339 |
| all-purpose flour | flour | 319 |
| unsalted butter | butter | 224 |
| granulated sugar | sugar | 161 |
| ground black pepper | black pepper | 149 |
| ground cinnamon | cinnamon | 132 |
| ground cumin | cumin | 123 |
| white sugar | sugar | 101 |
| parmesan cheese | parmesan | 96 |
| green bell pepper | bell pepper | 94 |
| extra-virgin olive oil | olive oil | 72 |
| powdered sugar | confectioners sugar | 72 |
| ground coriander | coriander | 71 |
| red bell pepper | bell pepper | 70 |
| green onion | scallion | 69 |
| kosher salt | salt | 67 |
| red onion | onion | 64 |
| ground nutmeg | nutmeg | 57 |
| smoked paprika | paprika | 52 |
| yellow onion | onion | 49 |
| dried oregano | oregano | 49 |
| ground ginger | ginger | 47 |
| ground crayfish | crayfish | 47 |
| cheddar cheese | cheddar | 46 |
| plain flour | flour | 44 |
| mozzarella cheese | mozzarella | 44 |
| ground paprika | paprika | 43 |
| whole milk | milk | 42 |
| dried thyme | thyme | 42 |
| black peppercorn | peppercorn | 40 |
| ground cayenne pepper | cayenne pepper | 39 |
| red pepper flake | pepper flake | 39 |
| light brown sugar | brown sugar | 37 |
| coriander leaf | cilantro | 37 |
| green chile | chile | 37 |
| ground pepper | pepper | 36 |
| dried rosemary | rosemary | 36 |
| caster sugar | sugar | 35 |
| ground turmeric | turmeric | 33 |
| red chile powder | chile powder | 32 |
| rolled oats | oats | 32 |
| cooked rice | rice | 31 |
| sweetened condensed milk | condensed milk | 31 |
| white onion | onion | 30 |
| dark brown sugar | brown sugar | 30 |
| icing sugar | confectioners sugar | 30 |
| boneless skinless chicken breast | chicken breast | 30 |
| superfine sugar | sugar | 29 |
| self-raising flour | flour | 28 |
| chicken stock | chicken broth | 28 |
| dry white wine | white wine | 28 |
| uncooked rice | rice | 26 |
| unsweetened cocoa powder | cocoa powder | 25 |
| fine sea salt | salt | 23 |
| beef stock | beef broth | 23 |
| black olive | olive | 23 |
| hot water | water | 22 |
| red pepper | pepper | 22 |
| spring onion | scallion | 22 |
| sea salt | salt | 21 |
| cooked chicken | chicken | 20 |

## Alias merges (seeded synonyms + hyphen/space near-misses)

- **onion** ← thinly-sliced onion, small-medium onion, medium-large onion, finely-sliced onion, thinly-julienned onion, finely-diced onion, finely-minced onion, coarsely-chopped onion
- **butter** ← medium-soft butter, room temperature butter
- **garlic** ← finely-minced garlic, freshly-minced garlic
- **flour** ← self rising flour, self raising flour, whole wheat flour, all purpose flour, 1 cup all-purpose flour
- **egg** ← soft-boiled egg
- **olive oil** ← evoo, extra virgin olive oil, 8 oz extra virgin olive oil, ⅓ cup extra virgin olive oil, ½ cup extra virgin olive oil
- **pepper** ← fresh-ground pepper, finely-crushed black pepper, fresh-ground black pepper
- **milk** ← room temperature milk
- **vegetable oil** ← 500 ml vegetable oil for deep frying, vegetable oil for deep frying
- **paprika** ← finely-ground hot paprika
- **carrot** ← thinly-sliced fresh carrot, finely-shredded carrot
- **bell pepper** ← capsicum, sweet pepper
- **parsley** ← freshly-chopped parsley, roughly-chopped parsley
- **oil** ← oil for deep frying
- **potato** ← thinly-sliced potato
- **rice** ← short grain rice, long grain brown rice, long grain rice, long grain white rice
- **ginger** ← fine-ground ginger
- **bay leaf** ← bay leave
- **nutmeg** ← fresh-ground nutmeg
- **tomato paste** ← tomato puree, tomato purée
- **baking soda** ← bicarbonate of soda, bicarb, sodium bicarbonate
- **cilantro** ← coriander leaf, fresh coriander, coriander leaves
- **heavy cream** ← heavy whipping cream, double cream, whipping cream
- **scallion** ← green onion, spring onion, salad onion
- **celery** ← coarsely-chopped celery, finely-diced celery
- **chicken broth** ← chicken stock
- **parmesan** ← parmesan cheese, parmigiano-reggiano, parmigiano reggiano, grated parmesan
- **coriander** ← freshly-chopped green coriander
- **confectioners sugar** ← powdered sugar, icing sugar
- **cornstarch** ← corn starch, cornflour, corn flour
- **bacon** ← thinly-sliced bacon
- **peppercorn** ← black peppercorn, whole peppercorn
- **cheddar** ← cheddar cheese
- **ground beef** ← minced beef, beef mince, hamburger
- **sour cream** ← soured cream
- **banana** ← thinly-sliced banana
- **beef broth** ← beef stock
- **beef** ← thinly-sliced beef, coarse-ground beef
- **apple** ← thinly-sliced apple
- **cream cheese** ← neufchatel
- **margarine** ← lightly-salted soft margarine
- **almond** ← finely-ground almond
- **mozzarella** ← mozzarella cheese
- **walnut** ← coarsely-chopped walnut
- **shrimp** ← prawn
- **hard-boiled egg** ← hard boiled egg
- **cornmeal** ← finely-ground cornmeal
- **meat** ← coarse-ground meat
- **pepper flake** ← hot-pepper flake
- **cooking oil** ← cooking oil for deep frying
- **chocolate** ← extra-dark chocolate
- **eggplant** ← aubergine, medium-large eggplant
- **sesame seed** ← lightly-roasted black sesame seed
- **leek** ← coarsely-chopped leek
- **molasses** ← treacle, black treacle
- **orange** ← medium-large orange
- **wine vinegar** ← white-wine vinegar
- **curry leaf** ← coarsely-chopped curry leaf
- **chive** ← thinly-sliced chive
- **chickpea** ← garbanzo bean, garbanzo
- **lettuce** ← freshly-cut lettuce
- **kidney bean** ← soft-boiled red kidney bean
- **nut** ← finely-ground nut
- **peanut** ← dry-roasted peanut
- **rice flour** ← finely-ground rice flour
- **ricotta** ← ricotta cheese
- **zucchini** ← courgette, thinly-sliced zucchini
- **tofu** ← extra-firm tofu
- **vegetable broth** ← vegetable stock
- **feta** ← feta cheese
- **golden syrup** ← light corn syrup
- **semi-sweet chocolate chip** ← semi sweet chocolate chip
- **pork shoulder** ← 4 ½-pound pork shoulder
- **ginger-garlic paste** ← ginger garlic paste
- **sage** ← thinly-sliced fresh sage
- **monterey jack** ← monterey jack cheese, jack cheese
- **cilantro leaf** ← roughly-chopped fresh cilantro leaf
- **tarragon** ← freshly-chopped tarragon
- **cornbread** ← finely-crumbled cornbread
- **cracked black peppercorn** ← cracked-black peppercorn
- **hazelnut** ← finely-ground hazelnut
- **beet** ← beetroot, thinly-sliced beet
- **rhubarb** ← thinly-sliced raw rhubarb
- **bouquet garni** ← bouquet-garni
- **half-and-half** ← half and half
- **fat** ← fat for deep frying
- **low-sodium chicken broth** ← low sodium chicken broth
- **arugula** ← rocket
- **five-spice powder** ← five spice powder
- **fried onion** ← french-fried onion
- **kale** ← firmly-packed chopped kale
- **mixed herb** ← freshly-chopped mixed herb
- **neutral oil** ← neutral oil for deep frying
- **olive oil or vegetable oil** ← extra-light olive oil or vegetable oil
- **squeezed lime juice** ← fresh-squeezed lime juice
- **suet** ← finely-shredded suet
- **grain rice** ← medium-grain rice, round-grain rice
- **matzo meal** ← fine-ground matzo meal
- **thick coconut milk** ← medium-thick coconut milk
- **cream or half and half** ← cream or half-and-half
- **daikon radish** ← thinly-julienned daikon radish
- **hominy** ← freshly-bleached hominy
- **parmigiano-reggiano cheese** ← parmigiano reggiano cheese
- **thick-cut bacon** ← thick cut bacon
- **thick-cut bone-in pork rib chop** ← thick cut bone-in pork rib chop
- **thick-cut pork rib chop** ← thick cut pork rib chop
- **vermouth** ← extra-dry white vermouth
- **angel hair pasta** ← angel-hair pasta
- **cinnamon sugar** ← cinnamon-sugar
- **dutch-processed cocoa powder** ← dutch processed cocoa powder
- **high-protein flour** ← high protein flour
- **reduced-sodium soy sauce** ← reduced sodium soy sauce
- **size carrot** ← medium-size carrot
- **wheat** ← whole-wheat
- **rutabaga** ← swede
- **snow pea** ← mangetout

## Tail — first 100 heads under the floor

-inch cinnamon (2) · -inch piece cinnamon (2) · -inch piece of fresh ginger (2) · / 2 tablespoons maple syrup (2) · &frac13 (2) · + 1 tsp packed light brown sugar (2) · 1 cup water (2) · 1-inch bun (2) · ½-inch slices white bread (2) · 10-inch flour tortilla (2) · 10–15 small tomatoes or 4–5 larger tomato (2) · 150+ proof unflavored spirit or a mixture of ½ tsp gum arabic with ½ tsp water (2) · 500 g linguine (2) · 9-inch unbaked pie shell (2) · achiote seed (2) · additional spice (2) · adobo (2) · adzuki bean (2) · agave syrup (2) · alayyahu (2) · alcaparrado (2) · alfalfa sprout (2) · allspice berry (2) · almond milk (2) · amaretto or frangelico liqueur (2) · and chopped apple (2) · and sliced apple (2) · and sour sauce (2) · annatto seed (2) · apple stuffing (2) · apricot jam (2) · arrowroot starch (2) · average-size tomato (2) · bacon dripping (2) · bag semi-sweet chocolate chip (2) · baguette (2) · baking apple (2) · baking cocoa (2) · baking cocoa powder (2) · banana ketchup (2) · banana leaf or plantain leaf (2) · banga spice mix (2) · barbeque sauce (2) · barley flour (2) · basil chiffonade (2) · bay leaves or avocado leaf (2) · beef or chicken broth (2) · beef or chicken stock (2) · beef or turkey (2) · beef round steak (2) · beef shortrib (2) · beef steak (2) · beef stock or water (2) · berbere spice (2) · biscuit dough (2) · bison meat (2) · bit of sugar (2) · blade of mace (2) · blue cheese dressing (2) · boiling apple cider vinegar (2) · bone-in (2) · bonito flake (2) · bouillon (2) · bouillon powder or (2) · branches lemongrass (2) · branches of fresh rosemary (2) · breakfast sausage (2) · brewed coffee (2) · brick cream cheese (2) · brick-style cream cheese (2) · broad bean (2) · broth or water (2) · brussels sprout (2) · bunch of cilantro (2) · bunch of fresh cilantro (2) · burgundy wine (2) · butter and flour (2) · butter-flavored salt (2) · buttercream (2) · butternut squash (2) · caffeine (2) · can crushed tomato (2) · can of tomato paste (2) · can tomato paste (2) · candied cherry (2) · cannabis (2) · caramel sauce (2) · caraway (2) · cashew or almond milk (2) · cassia oil (2) · cayenne pepper sauce (2) · celeriac (2) · celery root (2) · center-cut beef tenderloin roast (2) · champagne vinegar (2) · chana dhal (2) · channa dhal (2) · chanterelle mushroom (2) · cheddar cheese curd (2) · cheddar or monterey jack cheese (2)
