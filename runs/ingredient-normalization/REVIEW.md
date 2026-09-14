# Ingredient vocabulary — review report

Generated 2026-09-14 by `scripts/build-ingredientkeys.mjs` (min-lines 3).
Census: 4113 records / 35274 lines / 22727 distinct raw lines (snapshot 2026.09.09-20eda6c).

**This is a PROPOSAL until a human has reviewed it** (plan Phase 1, the single quality gate).
Review = read the promotion candidates and the alias merges below; edit
`scripts/ingredient-vocab-seed.json` (taxonomy words, seeded synonyms), re-run, repeat.

| Measure | Value |
|---|---|
| Keys proposed | 1062 |
| Coverage by line weight (resolver over the census) | **85.9%** (30286 / 35274) |
| Tail (heads under the floor) | 4834 heads, 5396 lines (15.3%) |
| Keys carrying aliases | 123 |

## Top keys by line weight

| key | lines | top variants (descriptor forms folded in) |
|---|---:|---|
| salt | 2413 | kosher salt (73) · fine sea salt (23) · sea salt (23) · table salt (16) |
| onion | 1080 | red onion (65) · yellow onion (56) · white onion (35) · sweet onion (10) |
| sugar | 1080 | white granulated sugar (342) · granulated sugar (166) · white sugar (101) · caster sugar (36) |
| butter | 1019 | unsalted butter (227) · salted butter (5) · sweet butter (2) · low-fat butter (1) |
| water | 910 | hot water (22) · jasmine water (2) |
| garlic | 848 | granulated garlic (12) · whole garlic (3) · ground garlic (2) · green garlic (1) |
| flour | 799 | all-purpose flour (324) · plain flour (45) · self-raising flour (28) · white flour (11) |
| egg | 767 | whole egg (19) · cooked egg (1) |
| olive oil | 646 | extra-virgin olive oil (75) · extra virgin olive oil (13) · virgin olive oil (8) · greek olive oil (1) |
| pepper | 611 | ground pepper (39) · red pepper (22) · green pepper (19) · hot pepper (13) |
| black pepper | 605 | ground black pepper (158) · coarse black pepper (2) · heavy black pepper (2) · coarse ground black pepper (1) |
| milk | 448 | whole milk (49) · powdered milk (5) · full-fat milk (4) · skim milk (3) |
| tomato | 393 | canned tomato (10) · red tomato (8) · whole tomato (4) · green tomato (2) |
| vegetable oil | 391 |  |
| cinnamon | 319 | ground cinnamon (134) · powdered cinnamon (7) · mexican cinnamon (1) · whole cinnamon (1) |
| lemon juice | 280 |  |
| parsley | 278 | flat-leaf parsley (19) · dried parsley (10) · italian parsley (3) · curly parsley (2) |
| paprika | 276 | smoked paprika (52) · ground paprika (43) · sweet paprika (16) · hot paprika (6) |
| bell pepper | 255 | green bell pepper (101) · red bell pepper (76) · yellow bell pepper (5) · capsicum (3) |
| oil | 249 | hot oil (2) · red oil (2) |
| carrot | 248 | baby carrot (2) · frozen carrot (2) · whole carrot (2) · cooked carrot (1) |
| brown sugar | 236 | light brown sugar (38) · dark brown sugar (31) · fine brown sugar (1) |
| rice | 232 | cooked rice (32) · uncooked rice (27) · long-grain rice (18) · basmati rice (17) |
| baking powder | 229 | kosher baking powder (1) |
| potato | 225 | white potato (8) · red potato (5) · baby potato (4) · cooked potato (4) |
| cumin | 224 | ground cumin (127) · black cumin (4) · powdered cumin (1) · white cumin (1) |
| cilantro | 218 | coriander leaf (39) · fresh coriander (19) · dried cilantro (1) |
| cayenne pepper | 201 | ground cayenne pepper (39) · ground red cayenne pepper (3) · powdered cayenne pepper (3) · dried ground cayenne pepper (1) |
| ginger | 192 | ground ginger (47) · powdered ginger (9) · dried ginger (2) · pickled ginger (1) |
| vanilla extract | 188 |  |
| soy sauce | 178 | light soy sauce (18) · dark soy sauce (12) · black soy sauce (2) · dark chinese soy sauce (1) |
| bay leaf | 173 | dried bay leaf (2) · whole dried bay leaf (2) |
| thyme | 165 | dried thyme (43) · ground dried thyme (1) |
| tomato paste | 159 | tomato purée (17) · tomato puree (5) · canned tomato paste (2) · plain canned tomato puree (1) |
| nutmeg | 155 | ground nutmeg (57) · powdered nutmeg (2) · dried nutmeg (1) · whole nutmeg (1) |
| heavy cream | 154 | heavy whipping cream (20) · whipping cream (17) · double cream (7) |
| chicken broth | 148 | chicken stock (40) · canned chicken broth (1) · light chicken stock (1) |
| baking soda | 145 | bicarbonate of soda (14) · kosher baking soda (1) |
| scallion | 143 | green onion (74) · spring onion (23) · salad onion (1) · whole scallion (1) |
| lemon | 142 | whole lemon (4) · dry ground lemon (1) |

## Promotion candidates — variants with ≥ 20 lines

A variant is a descriptor-bearing form the resolver reads as key + variety. If it
is really its own ingredient (`bread crumb` is not a crumb variety), give it a
key: add it to the seed as a key with itself as alias, or remove the descriptor
word from the taxonomy if it never modifies.

| variant | folded under | lines |
|---|---|---:|
| white granulated sugar | sugar | 342 |
| all-purpose flour | flour | 324 |
| unsalted butter | butter | 227 |
| granulated sugar | sugar | 166 |
| ground black pepper | black pepper | 158 |
| ground cinnamon | cinnamon | 134 |
| ground cumin | cumin | 127 |
| white sugar | sugar | 101 |
| green bell pepper | bell pepper | 101 |
| parmesan cheese | parmesan | 101 |
| red bell pepper | bell pepper | 76 |
| extra-virgin olive oil | olive oil | 75 |
| powdered sugar | confectioners sugar | 75 |
| green onion | scallion | 74 |
| kosher salt | salt | 73 |
| ground coriander | coriander | 73 |
| red onion | onion | 65 |
| ground nutmeg | nutmeg | 57 |
| yellow onion | onion | 56 |
| smoked paprika | paprika | 52 |
| dried oregano | oregano | 50 |
| whole milk | milk | 49 |
| cheddar cheese | cheddar | 49 |
| ground ginger | ginger | 47 |
| ground crayfish | crayfish | 47 |
| mozzarella cheese | mozzarella | 46 |
| plain flour | flour | 45 |
| ground paprika | paprika | 43 |
| dried thyme | thyme | 43 |
| chicken stock | chicken broth | 40 |
| black peppercorn | peppercorn | 40 |
| ground pepper | pepper | 39 |
| coriander leaf | cilantro | 39 |
| ground cayenne pepper | cayenne pepper | 39 |
| red pepper flake | pepper flake | 39 |
| light brown sugar | brown sugar | 38 |
| green chile | chile | 37 |
| caster sugar | sugar | 36 |
| dried rosemary | rosemary | 36 |
| white onion | onion | 35 |
| beef stock | beef broth | 35 |
| superfine sugar | sugar | 34 |
| ground turmeric | turmeric | 34 |
| dry white wine | white wine | 34 |
| rolled oats | oats | 34 |
| cooked rice | rice | 32 |
| red chile powder | chile powder | 32 |
| dark brown sugar | brown sugar | 31 |
| icing sugar | confectioners sugar | 31 |
| sweetened condensed milk | condensed milk | 31 |
| boneless skinless chicken breast | chicken breast | 30 |
| self-raising flour | flour | 28 |
| uncooked rice | rice | 27 |
| unsweetened cocoa powder | cocoa powder | 25 |
| cooked chicken | chicken | 24 |
| ricotta cheese | ricotta | 24 |
| fine sea salt | salt | 23 |
| sea salt | salt | 23 |
| spring onion | scallion | 23 |
| black olive | olive | 23 |
| hot water | water | 22 |
| red pepper | pepper | 22 |
| heavy whipping cream | heavy cream | 20 |

## Alias merges (seeded synonyms + hyphen/space near-misses)

- **onion** ← thinly-sliced onion, small-medium onion, medium-large onion, finely-sliced onion, thinly-julienned onion, finely-diced onion, finely-minced onion, coarsely-chopped onion
- **butter** ← medium-soft butter, room temperature butter
- **garlic** ← finely-minced garlic, freshly-minced garlic
- **flour** ← self rising flour, self raising flour, whole wheat flour, all purpose flour, 3 cups all-purpose flour, 1 cup all-purpose flour
- **egg** ← soft-boiled egg
- **olive oil** ← evoo, extra virgin olive oil, 8 oz extra virgin olive oil, ⅓ cup extra virgin olive oil, ½ cup extra virgin olive oil, extra-light olive oil
- **pepper** ← fresh-ground pepper, finely-crushed black pepper, fresh-ground black pepper
- **milk** ← room temperature milk
- **vegetable oil** ← 500 ml vegetable oil for deep frying, vegetable oil for deep frying
- **parsley** ← freshly-chopped parsley, roughly-chopped parsley
- **paprika** ← finely-ground hot paprika
- **bell pepper** ← capsicum, sweet pepper
- **oil** ← oil for deep frying
- **carrot** ← thinly-sliced fresh carrot, finely-shredded carrot
- **rice** ← short grain rice, long grain brown rice, long grain rice, long grain white rice
- **potato** ← thinly-sliced potato
- **cilantro** ← coriander leaf, fresh coriander, coriander leaves
- **ginger** ← fine-ground ginger
- **bay leaf** ← bay leave
- **tomato paste** ← tomato puree, tomato purée
- **nutmeg** ← fresh-ground nutmeg
- **heavy cream** ← heavy whipping cream, double cream, whipping cream
- **chicken broth** ← chicken stock
- **baking soda** ← bicarbonate of soda, bicarb, sodium bicarbonate
- **scallion** ← green onion, spring onion, salad onion
- **margarine** ← lightly-salted soft margarine
- **celery** ← coarsely-chopped celery, finely-diced celery
- **parmesan** ← parmesan cheese, parmigiano-reggiano, parmigiano reggiano, grated parmesan
- **egg yolk** ← 4 soft-boiled egg yolk
- **confectioners sugar** ← powdered sugar, icing sugar
- **coriander** ← freshly-chopped green coriander
- **cornstarch** ← corn starch, cornflour, corn flour
- **rosemary** ← 1 1/2 teaspoons dried rosemary
- **beef** ← thinly-sliced beef, coarse-ground beef
- **ground beef** ← minced beef, beef mince, hamburger
- **sour cream** ← soured cream
- **bacon** ← thinly-sliced bacon
- **cheddar** ← cheddar cheese
- **palm oil** ← palm oil for deep frying
- **beef broth** ← beef stock
- **peppercorn** ← black peppercorn, whole peppercorn
- **almond** ← finely-ground almond
- **banana** ← thinly-sliced banana
- **walnut** ← coarsely-chopped walnut
- **cream cheese** ← neufchatel
- **apple** ← thinly-sliced apple
- **mozzarella** ← mozzarella cheese
- **stock** ← 1 ½ tsp powdered stock
- **shrimp** ← prawn
- **vegetable broth** ← vegetable stock
- **meat** ← coarse-ground meat
- **cornmeal** ← finely-ground cornmeal
- **chocolate** ← extra-dark chocolate, roughly-chopped dark chocolate
- **hard-boiled egg** ← hard boiled egg
- **cooking oil** ← cooking oil for deep frying
- **leek** ← coarsely-chopped leek
- **pepper flake** ← hot-pepper flake
- **eggplant** ← aubergine, medium-large eggplant
- **sesame seed** ← lightly-roasted black sesame seed
- **wine vinegar** ← white-wine vinegar
- **molasses** ← treacle, black treacle
- **orange** ← medium-large orange
- **chickpea** ← garbanzo bean, garbanzo
- **chive** ← thinly-sliced chive
- **curry leaf** ← coarsely-chopped curry leaf
- **ricotta** ← ricotta cheese
- **kidney bean** ← soft-boiled red kidney bean
- **lettuce** ← freshly-cut lettuce
- **nut** ← finely-ground nut
- **peanut** ← dry-roasted peanut
- **rice flour** ← finely-ground rice flour
- **zucchini** ← courgette, thinly-sliced zucchini
- **feta** ← feta cheese
- **tofu** ← extra-firm tofu
- **golden syrup** ← light corn syrup
- **semolina** ← medium-coarse semolina
- **semi-sweet chocolate chip** ← semi sweet chocolate chip
- **pork shoulder** ← 4 ½-pound pork shoulder
- **sage** ← thinly-sliced fresh sage
- **cilantro leaf** ← roughly-chopped fresh cilantro leaf
- **ginger-garlic paste** ← ginger garlic paste
- **monterey jack** ← monterey jack cheese, jack cheese
- **tarragon** ← freshly-chopped tarragon
- **hazelnut** ← finely-ground hazelnut
- **beet** ← beetroot, thinly-sliced beet
- **half-and-half** ← half and half
- **cornbread** ← finely-crumbled cornbread
- **cracked black peppercorn** ← cracked-black peppercorn
- **kale** ← firmly-packed chopped kale
- **rhubarb** ← thinly-sliced raw rhubarb
- **bouquet garni** ← bouquet-garni
- **fat** ← fat for deep frying
- **fried onion** ← french-fried onion
- **low-sodium chicken broth** ← low sodium chicken broth
- **neutral oil** ← neutral oil for deep frying
- **suet** ← finely-shredded suet
- **arugula** ← rocket
- **five-spice powder** ← five spice powder
- **mixed herb** ← freshly-chopped mixed herb
- **squeezed lime juice** ← fresh-squeezed lime juice
- **grain rice** ← medium-grain rice, round-grain rice
- **green** ← green-
- **matzo meal** ← fine-ground matzo meal
- **parmigiano-reggiano cheese** ← parmigiano reggiano cheese
- **thick coconut milk** ← medium-thick coconut milk
- **vermouth** ← extra-dry white vermouth
- **angel hair pasta** ← angel-hair pasta
- **daikon radish** ← thinly-julienned daikon radish
- **firm** ← extra-firm
- **hominy** ← freshly-bleached hominy
- **thick-cut bacon** ← thick cut bacon
- **thick-cut bone-in pork rib chop** ← thick cut bone-in pork rib chop
- **thick-cut pork rib chop** ← thick cut pork rib chop
- **chili garlic sauce** ← chili-garlic sauce
- **cinnamon sugar** ← cinnamon-sugar
- **dutch-processed cocoa powder** ← dutch processed cocoa powder
- **high-protein flour** ← high protein flour
- **reduced-sodium soy sauce** ← reduced sodium soy sauce
- **salmon steak** ← 3-ounce salmon steak
- **size carrot** ← medium-size carrot
- **wheat** ← whole-wheat
- **rutabaga** ← swede
- **snow pea** ← mangetout

## Tail — first 100 heads under the floor

-inch cinnamon (2) · -inch piece cinnamon (2) · -inch piece of fresh ginger (2) · / 2 tablespoons maple syrup (2) · &frac13 (2) · + 1 tsp packed light brown sugar (2) · 1 cup water (2) · 1-inch bun (2) · 1.5 lbs diced ham (2) · ½-inch slices white bread (2) · 10-inch flour tortilla (2) · 10–15 small tomato (2) · 2 small onion (2) · 2% milk (2) · 4–5 larger tomato (2) · 500 g linguine (2) · 9-inch unbaked pie shell (2) · a mixture of ½ tsp gum arabic with ½ tsp water (2) · achiote seed (2) · additional spice (2) · adobo (2) · adzuki bean (2) · alayyahu (2) · alcaparrado (2) · alfalfa sprout (2) · allspice berry (2) · amaretto (2) · american (2) · anchovy paste (2) · and chopped apple (2) · and green bell pepper (2) · and sliced apple (2) · annatto (2) · annatto seed (2) · apple stuffing (2) · arborio (2) · average-size tomato (2) · avocado oil (2) · bag semi-sweet chocolate chip (2) · baking apple (2) · baking cocoa (2) · baking cocoa powder (2) · banana ketchup (2) · banga spice mix (2) · barbeque sauce (2) · barberry (2) · barley flour (2) · basil chiffonade (2) · beef dripping (2) · beef round steak (2) · beef shortrib (2) · beef sirloin (2) · beef steak (2) · biscuit dough (2) · biscuit mix (2) · bison meat (2) · bit of sugar (2) · bitter leaf (2) · blade of mace (2) · blue cheese dressing (2) · boiling apple cider vinegar (2) · boiling potato (2) · bone-in (2) · bonito flake (2) · branches lemongrass (2) · branches of fresh rosemary (2) · breakfast sausage (2) · breast (2) · brewed black coffee (2) · brick cream cheese (2) · brick-style cream cheese (2) · brown (2) · brussels sprout (2) · bun (2) · bunch of cilantro (2) · bunch of fresh cilantro (2) · burgundy wine (2) · butter bean (2) · butter for cooking (2) · butter-flavored salt (2) · butternut squash (2) · caffeine (2) · can (2) · can crushed tomato (2) · can of tomato paste (2) · can tomato paste (2) · candied cherry (2) · cannabis (2) · canned (2) · caramel sauce (2) · cassia oil (2) · cayenne pepper sauce (2) · celeriac (2) · center-cut beef tenderloin roast (2) · champagne vinegar (2) · chana dhal (2) · channa dhal (2) · chanterelle mushroom (2) · cheese of your choice (2) · cherry juice (2)
