# Ingredient vocabulary — review report

Generated 2026-09-14 by `scripts/build-ingredientkeys.mjs` (min-lines 3).
Census: 4113 records / 35274 lines / 22727 distinct raw lines (snapshot 2026.09.09-20eda6c).

**This is a PROPOSAL until a human has reviewed it** (plan Phase 1, the single quality gate).
Review = read the promotion candidates and the alias merges below; edit
`scripts/ingredient-vocab-seed.json` (taxonomy words, seeded synonyms), re-run, repeat.

| Measure | Value |
|---|---|
| Keys proposed | 937 |
| Coverage by line weight (resolver over the census) | **87.9%** (31006 / 35274) |
| Tail (heads under the floor) | 3903 heads, 4532 lines (12.8%) |
| Keys carrying aliases | 136 |

## Top keys by line weight

| key | lines | top variants (descriptor forms folded in) |
|---|---:|---|
| salt | 2437 | kosher salt (74) · fine sea salt (23) · sea salt (23) · table salt (18) |
| onion | 1139 | red onion (67) · yellow onion (59) · white onion (35) · sweet onion (10) |
| sugar | 1100 | white granulated sugar (347) · granulated sugar (167) · white sugar (103) · caster sugar (36) |
| butter | 1022 | unsalted butter (228) · salted butter (5) · sweet butter (2) · low-fat butter (1) |
| water | 970 | hot water (23) · jasmine water (2) |
| flour | 886 | all-purpose flour (334) · plain flour (46) · wheat flour (37) · self-raising flour (28) |
| garlic | 886 | granulated garlic (12) · whole garlic (3) · ground garlic (2) · green garlic (1) |
| egg | 815 | whole egg (19) · cooked egg (1) |
| olive oil | 659 | extra-virgin olive oil (76) · extra virgin olive oil (17) · virgin olive oil (7) · greek olive oil (1) |
| pepper | 618 | ground pepper (40) · red pepper (23) · green pepper (21) · hot pepper (14) |
| black pepper | 616 | ground black pepper (159) · cracked black pepper (7) · coarse black pepper (2) · heavy black pepper (2) |
| milk | 473 | whole milk (50) · powdered milk (5) · full-fat milk (4) · skim milk (3) |
| tomato | 421 | canned tomato (10) · red tomato (8) · whole tomato (4) · green tomato (2) |
| vegetable oil | 402 |  |
| cinnamon | 334 | ground cinnamon (134) · powdered cinnamon (7) · mexican cinnamon (1) · whole cinnamon (1) |
| lemon juice | 281 |  |
| paprika | 277 | smoked paprika (52) · ground paprika (43) · sweet paprika (17) · hot paprika (6) |
| bell pepper | 261 | green bell pepper (101) · red bell pepper (80) · yellow bell pepper (6) · capsicum (3) |
| carrot | 256 | baby carrot (2) · frozen carrot (2) · whole carrot (2) · cooked carrot (1) |
| oil | 255 | hot oil (2) · red oil (2) |
| parsley | 249 | flat-leaf parsley (20) · dried parsley (9) · italian parsley (3) · curly parsley (2) |
| brown sugar | 243 | light brown sugar (41) · dark brown sugar (32) · fine brown sugar (1) |
| rice | 237 | cooked rice (32) · uncooked rice (27) · long-grain rice (18) · basmati rice (17) |
| potato | 236 | white potato (8) · red potato (6) · baby potato (4) · cooked potato (4) |
| ginger | 234 | ground ginger (47) · powdered ginger (9) · dried ginger (2) · pickled ginger (1) |
| vanilla extract | 233 |  |
| baking powder | 231 | kosher baking powder (1) |
| cilantro | 231 | coriander leaf (44) · fresh coriander (20) · dried cilantro (1) |
| cumin | 225 | ground cumin (127) · black cumin (4) · powdered cumin (1) · white cumin (1) |
| cayenne pepper | 206 | ground cayenne pepper (39) · ground red cayenne pepper (3) · powdered cayenne pepper (3) · dried ground cayenne pepper (1) |
| soy sauce | 179 | light soy sauce (18) · dark soy sauce (12) · black soy sauce (2) · dark chinese soy sauce (1) |
| bay leaf | 174 | dried bay leaf (2) · whole dried bay leaf (2) |
| thyme | 172 | dried thyme (46) · ground dried thyme (1) · whole thyme (1) |
| tomato paste | 170 | tomato purée (17) · tomato puree (7) · canned tomato paste (2) · plain canned tomato puree (1) |
| chile | 161 | green chile (39) · green chilly (15) · red chile (7) · red chilly (7) |
| heavy cream | 161 | heavy whipping cream (22) · whipping cream (20) · double cream (9) |
| nutmeg | 158 | ground nutmeg (59) · powdered nutmeg (2) · dried nutmeg (1) · whole nutmeg (1) |
| chicken broth | 152 | chicken stock (43) · canned chicken broth (1) · light chicken stock (1) |
| lemon | 151 | whole lemon (4) · dry ground lemon (1) |
| chili powder | 150 | red chile powder (33) · chile powder (31) · chilli powder (11) · red chilli powder (6) |

## Promotion candidates — variants with ≥ 20 lines

A variant is a descriptor-bearing form the resolver reads as key + variety. If it
is really its own ingredient (`bread crumb` is not a crumb variety), give it a
key: add it to the seed as a key with itself as alias, or remove the descriptor
word from the taxonomy if it never modifies.

| variant | folded under | lines |
|---|---|---:|
| white granulated sugar | sugar | 347 |
| all-purpose flour | flour | 334 |
| unsalted butter | butter | 228 |
| granulated sugar | sugar | 167 |
| ground black pepper | black pepper | 159 |
| ground cinnamon | cinnamon | 134 |
| ground cumin | cumin | 127 |
| white sugar | sugar | 103 |
| parmesan cheese | parmesan | 103 |
| green bell pepper | bell pepper | 101 |
| red bell pepper | bell pepper | 80 |
| green onion | scallion | 77 |
| extra-virgin olive oil | olive oil | 76 |
| powdered sugar | confectioners sugar | 75 |
| kosher salt | salt | 74 |
| ground coriander | coriander | 73 |
| red onion | onion | 67 |
| yellow onion | onion | 59 |
| ground nutmeg | nutmeg | 59 |
| dried oregano | oregano | 54 |
| smoked paprika | paprika | 52 |
| whole milk | milk | 50 |
| cheddar cheese | cheddar | 49 |
| ground crayfish | crayfish | 48 |
| ground ginger | ginger | 47 |
| plain flour | flour | 46 |
| dried thyme | thyme | 46 |
| mozzarella cheese | mozzarella | 46 |
| coriander leaf | cilantro | 44 |
| ground paprika | paprika | 43 |
| chicken stock | chicken broth | 43 |
| light brown sugar | brown sugar | 41 |
| ground pepper | pepper | 40 |
| black peppercorn | peppercorn | 40 |
| red pepper flake | pepper flake | 40 |
| ground cayenne pepper | cayenne pepper | 39 |
| green chile | chile | 39 |
| beef stock | beef broth | 39 |
| wheat flour | flour | 37 |
| dried rosemary | rosemary | 37 |
| caster sugar | sugar | 36 |
| ground turmeric | turmeric | 36 |
| cider vinegar | apple cider vinegar | 36 |
| white onion | onion | 35 |
| rolled oats | oats | 35 |
| icing sugar | confectioners sugar | 34 |
| dry white wine | white wine | 34 |
| superfine sugar | sugar | 33 |
| red chile powder | chili powder | 33 |
| dark brown sugar | brown sugar | 32 |
| cooked rice | rice | 32 |
| boneless skinless chicken breast | chicken breast | 32 |
| chile powder | chili powder | 31 |
| sweetened condensed milk | condensed milk | 31 |
| self-raising flour | flour | 28 |
| uncooked rice | rice | 27 |
| unsweetened cocoa powder | cocoa powder | 25 |
| ricotta cheese | ricotta | 25 |
| cooked chicken | chicken | 24 |
| black olive | olive | 24 |
| fine sea salt | salt | 23 |
| sea salt | salt | 23 |
| hot water | water | 23 |
| red pepper | pepper | 23 |
| spring onion | scallion | 23 |
| heavy whipping cream | heavy cream | 22 |
| green pepper | pepper | 21 |
| flat-leaf parsley | parsley | 20 |
| fresh coriander | cilantro | 20 |
| whipping cream | heavy cream | 20 |
| coriander powder | coriander | 20 |
| plain yogurt | yogurt | 20 |
| feta cheese | feta | 20 |

## Community aliases (app.arecipe.ingredientAlias records from trusted accounts)

none pulled — run with `--aliases-from` to refresh the cache

## Alias merges (seeded synonyms + hyphen/space near-misses)

- **onion** ← medium-large yellow onion, small-medium onion, medium-large onion, finely-sliced onion, thinly-julienned onion
- **sugar** ← / 6 cup sugar
- **butter** ← medium-soft butter, half-salted butter, butter room temperature, room temperature butter
- **flour** ← wheat flour, 0g / 1 cup white whole wheat flour, self rising flour, 0g / 1 1/2 cups all-purpose flour, self raising flour, whole wheat flour, all purpose flour
- **garlic** ← clove garlic, cloves garlic, clove of garlic, cloves of garlic, garlic clove, freshly-minced garlic
- **egg** ← hard boiled egg
- **olive oil** ← evoo, extra virgin olive oil, extra-light olive oil
- **pepper** ← fresh-ground pepper, finely-crushed black pepper, fresh-ground black pepper
- **milk** ← 0g / 1 1/2 cups milk, room temperature milk, 1% milk, 2% milk
- **tomato** ← 10–15 small tomato
- **vegetable oil** ← vegetable oil for deep frying
- **paprika** ← finely-ground hot paprika
- **bell pepper** ← capsicum, sweet pepper
- **carrot** ← finely-shredded carrot
- **oil** ← oil for deep frying
- **rice** ← short grain rice, long grain brown rice, long grain rice, long grain white rice
- **ginger** ← fine-ground ginger, ¼ in cubes of ginger
- **cilantro** ← coriander leaf, fresh coriander, coriander leaves
- **bay leaf** ← bay leave
- **tomato paste** ← tomato puree, tomato purée
- **chile** ← chili, chilli, chilly, chily, chilies, chillies, chilis, chillis
- **heavy cream** ← heavy whipping cream, double cream, whipping cream
- **nutmeg** ← fresh-ground nutmeg
- **chicken broth** ← chicken stock
- **chili powder** ← chile powder, chilli powder
- **baking soda** ← bicarbonate of soda, bicarb, sodium bicarbonate
- **scallion** ← green onion, spring onion, salad onion
- **celery** ← 3–4 celery
- **margarine** ← lightly-salted soft margarine
- **chicken** ← broiler, fryer, broiler chicken, fryer chicken, roaster, roasting chicken, stewing chicken, stewing hen, whole chicken
- **coriander** ← coriander powder
- **confectioners sugar** ← powdered sugar, icing sugar, confectioners' sugar, confectioner's sugar
- **parmesan** ← parmesan cheese, parmigiano-reggiano, parmigiano reggiano, grated parmesan
- **cornstarch** ← corn starch, cornflour, corn flour
- **beef** ← coarse-ground beef, / ground beef, 93% lean ground beef
- **bacon** ← thick-cut bacon
- **ground beef** ← minced beef, beef mince, hamburger, hamburger meat
- **peppercorn** ← black peppercorn, whole peppercorn, cracked-black peppercorn
- **beef broth** ← beef stock
- **chile pepper** ← chili pepper, chilli pepper, chilly pepper
- **palm oil** ← palm oil for deep frying
- **apple cider vinegar** ← cider vinegar
- **cheddar** ← cheddar cheese
- **sour cream** ← soured cream
- **yogurt** ← yoghurt, 2% plain yogurt
- **bread** ← thick-cut bread, ½-inch slices white bread
- **cheese** ← 200–300 g cheese, ⅓–½ cups cheese
- **coconut milk** ← medium-thick coconut milk
- **ghee** ← ghee for deep frying
- **shallot** ← 1–2 shallot
- **walnut** ← 0g / 1 cup walnut
- **almond** ← finely-ground almond
- **cream cheese** ← neufchatel
- **mozzarella** ← mozzarella cheese
- **shrimp** ← prawn
- **chocolate** ← extra-dark chocolate
- **meat** ← coarse-ground meat
- **vegetable broth** ← vegetable stock
- **lime** ← 2 lime
- **cornmeal** ← finely-ground cornmeal
- **cooking oil** ← cooking oil for deep frying
- **eggplant** ← aubergine, medium-large eggplant
- **pepper flake** ← hot-pepper flake
- **sesame seed** ← lightly-roasted black sesame seed
- **chocolate chip** ← mini-chocolate chip, semi sweet chocolate chip
- **molasses** ← treacle, black treacle
- **orange** ← medium-large orange
- **peanut** ← dry-roasted peanut
- **wine vinegar** ← white-wine vinegar
- **chickpea** ← garbanzo bean, garbanzo
- **lettuce** ← freshly-cut lettuce
- **ricotta** ← ricotta cheese
- **rice vinegar** ← rice wine vinegar
- **zucchini** ← courgette
- **jalapeño** ← jalapeno
- **nut** ← finely-ground nut
- **feta** ← feta cheese
- **rice flour** ← finely-ground rice flour
- **tofu** ← medium-firm tofu, extra-firm tofu
- **semisweet chocolate** ← semi-sweet chocolate
- **semisweet chocolate chip** ← semi-sweet chocolate chip
- **golden syrup** ← light corn syrup
- **elbow macaroni** ← elbow macaroni pasta, macaroni pasta
- **monterey jack** ← monterey jack cheese, jack cheese, monterrey jack cheese
- **semolina** ← medium-coarse semolina
- **corn kernel** ← kernel corn
- **pistachio** ← pistachio nut
- **gruyère** ← gruyere, gruyere cheese, gruyère cheese
- **pork shoulder** ← 4 ½-pound pork shoulder
- **ginger-garlic paste** ← ginger garlic paste
- **crème fraîche** ← creme fraiche, reduced fat crème fraîche
- **flour tortilla** ← 6-inch round flour tortilla, 10-inch flour tortilla
- **salmon fillet** ← salmon filet
- **graham cracker** ← graham cracker crumb
- **hazelnut** ← finely-ground hazelnut
- **beet** ← beetroot
- **pandan leaf** ← 2 cm pieces of pandan leaf
- **cornbread** ← finely-crumbled cornbread
- **cranberry** ← 0g / 1 cup dried cranberry
- **fat** ← fat for deep frying
- **kale** ← firmly-packed chopped kale
- **steak** ← thick-cut strip steak, 6–8 ounce strip steak
- **chili sauce** ← chilli sauce
- **taco seasoning** ← taco seasoning mix
- **bouquet garni** ← bouquet-garni
- **half-and-half** ← half and half
- **low-sodium chicken broth** ← low sodium chicken broth
- **neutral oil** ← neutral oil for deep frying
- **tea** ← 3–5 tea
- **fried onion** ← french-fried onion
- **pecorino romano** ← pecorino romano cheese
- **suet** ← finely-shredded suet
- **arugula** ← rocket
- **chili garlic sauce** ← garlic chili sauce, chili-garlic sauce
- **five-spice powder** ← five spice powder
- **pork chop** ← 4 cm thick boneless pork chop
- **squeezed lime juice** ← fresh-squeezed lime juice
- **matzo meal** ← fine-ground matzo meal
- **sandwich bread** ← thick-sliced white sandwich bread
- **vermouth** ← extra-dry white vermouth
- **angel hair pasta** ← angel-hair pasta
- **bun** ← 1-inch bun
- **daikon radish** ← thinly-julienned daikon radish
- **hominy** ← freshly-bleached hominy
- **parmigiano-reggiano cheese** ← parmigiano reggiano cheese
- **wheat** ← whole-wheat
- **cannabis** ← finely-ground pure cannabis
- **cinnamon sugar** ← cinnamon-sugar
- **dutch-processed cocoa powder** ← dutch processed cocoa powder
- **high-protein flour** ← high protein flour
- **new york strip steak** ← 1 inch-thick new york strip steak
- **reduced-sodium soy sauce** ← reduced sodium soy sauce
- **ribeye steak** ← thick-cut ribeye steak
- **salmon steak** ← 3-ounce salmon steak
- **rutabaga** ← swede
- **snow pea** ← mangetout

## Tail — first 100 heads under the floor

clove (59) · vegetable (33) · topping (6) · filling (5) · powder (5) · rub (5) · can (3) · dressing (3) · juice (3) · 4–5 larger tomato (2) · 9-inch unbaked pie shell (2) · a mixture of ½ tsp gum arabic with ½ tsp water (2) · achiote (2) · achiote seed (2) · additional spice (2) · adobo (2) · adzuki bean (2) · agar-agar powder (2) · alayyahu (2) · alcaparrado (2) · alfalfa sprout (2) · allspice berry (2) · amaretto (2) · ancho chili powder (2) · anchovy paste (2) · and chopped apple (2) · and green bell pepper (2) · and half cream (2) · and sliced apple (2) · andouille sausage (2) · annatto (2) · annatto paste (2) · annatto seed (2) · apple stuffing (2) · apple wood (2) · arrowroot starch (2) · asparagus spear (2) · assorted bell pepper (2) · average-size tomato (2) · back pork (2) · baking apple (2) · baking cocoa (2) · baking cocoa powder (2) · banana ketchup (2) · banga spice mix (2) · barbeque sauce (2) · barberry (2) · barley flour (2) · basil chiffonade (2) · béchamel sauce (2) · beef dripping (2) · beef round steak (2) · beef short (2) · beef shortrib (2) · beef sirloin (2) · beef steak (2) · beef tenderloin roast (2) · biscuit (2) · biscuit dough (2) · biscuit mix (2) · bison meat (2) · bit of sugar (2) · bitter leaf (2) · blade of mace (2) · blue cheese dressing (2) · boiling apple cider vinegar (2) · boiling potato (2) · bonito flake (2) · branches lemongrass (2) · branches of fresh rosemary (2) · breast (2) · brewed black coffee (2) · brewed tea (2) · brick cream cheese (2) · brick-style cream cheese (2) · broad bean (2) · brownie mix (2) · brussels sprout (2) · burgundy wine (2) · burnt sugar (2) · butter for cooking (2) · butter-flavored salt (2) · caffeine (2) · candied cherry (2) · caramel sauce (2) · cassia oil (2) · cayenne pepper sauce (2) · champagne vinegar (2) · chana dhal (2) · channa dhal (2) · chanterelle mushroom (2) · cheddar cheese curd (2) · cheddar cheese soup (2) · cheese of your choice (2) · cherry juice (2) · chervil (2) · chicken bouillon powder (2) · chicken drumstick (2) · chicken fat (2) · chicken flavour bouillon (2)
