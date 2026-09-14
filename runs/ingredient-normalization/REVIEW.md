# Ingredient vocabulary — review report

Generated 2026-09-14 by `scripts/build-ingredientkeys.mjs` (min-lines 3).
Census: 4113 records / 35274 lines / 22727 distinct raw lines (snapshot 2026.09.09-20eda6c).

**This is a PROPOSAL until a human has reviewed it** (plan Phase 1, the single quality gate).
Review = read the promotion candidates and the alias merges below; edit
`scripts/ingredient-vocab-seed.json` (taxonomy words, seeded synonyms), re-run, repeat.

| Measure | Value |
|---|---|
| Keys proposed | 1021 |
| Coverage by line weight (resolver over the census) | **86.7%** (30585 / 35274) |
| Tail (heads under the floor) | 4253 heads, 4780 lines (13.6%) |
| Keys carrying aliases | 140 |

## Top keys by line weight

| key | lines | top variants (descriptor forms folded in) |
|---|---:|---|
| 189 | 4 |  |
| salt | 2431 | kosher salt (74) · fine sea salt (23) · sea salt (23) · table salt (17) |
| onion | 1132 | red onion (68) · yellow onion (59) · white onion (35) · sweet onion (10) |
| sugar | 1094 | white granulated sugar (343) · granulated sugar (167) · white sugar (103) · caster sugar (36) |
| butter | 1026 | unsalted butter (229) · salted butter (5) · sweet butter (2) · low-fat butter (1) |
| water | 971 | hot water (23) · jasmine water (2) |
| garlic | 852 | granulated garlic (12) · whole garlic (3) · ground garlic (2) · green garlic (1) |
| flour | 824 | all-purpose flour (333) · plain flour (45) · self-raising flour (28) · white flour (11) |
| egg | 816 | whole egg (19) · cooked egg (1) |
| olive oil | 656 | extra-virgin olive oil (76) · extra virgin olive oil (13) · virgin olive oil (8) · greek olive oil (1) |
| pepper | 617 | ground pepper (39) · red pepper (24) · green pepper (20) · hot pepper (13) |
| black pepper | 607 | ground black pepper (159) · coarse black pepper (2) · heavy black pepper (2) · coarse ground black pepper (1) |
| milk | 472 | whole milk (52) · powdered milk (5) · full-fat milk (4) · skim milk (3) |
| tomato | 417 | canned tomato (10) · red tomato (8) · whole tomato (4) · green tomato (2) |
| vegetable oil | 396 |  |
| cinnamon | 325 | ground cinnamon (134) · powdered cinnamon (7) · mexican cinnamon (1) · whole cinnamon (1) |
| lemon juice | 283 |  |
| parsley | 283 | flat-leaf parsley (20) · dried parsley (10) · italian parsley (3) · curly parsley (2) |
| paprika | 276 | smoked paprika (52) · ground paprika (43) · sweet paprika (16) · hot paprika (6) |
| bell pepper | 258 | green bell pepper (101) · red bell pepper (78) · yellow bell pepper (6) · capsicum (3) |
| carrot | 255 | baby carrot (2) · frozen carrot (2) · whole carrot (2) · cooked carrot (1) |
| oil | 250 | hot oil (2) · red oil (2) |
| brown sugar | 241 | light brown sugar (41) · dark brown sugar (32) · fine brown sugar (1) |
| potato | 237 | white potato (8) · red potato (6) · baby potato (4) · cooked potato (4) |
| rice | 234 | cooked rice (32) · uncooked rice (27) · long-grain rice (18) · basmati rice (17) |
| baking powder | 230 | kosher baking powder (1) |
| cumin | 224 | ground cumin (127) · black cumin (4) · powdered cumin (1) · white cumin (1) |
| cilantro | 222 | coriander leaf (42) · fresh coriander (19) · dried cilantro (1) |
| ginger | 221 | ground ginger (47) · powdered ginger (9) · dried ginger (2) · pickled ginger (1) |
| cayenne pepper | 202 | ground cayenne pepper (39) · ground red cayenne pepper (3) · powdered cayenne pepper (3) · dried ground cayenne pepper (1) |
| vanilla extract | 190 |  |
| soy sauce | 178 | light soy sauce (18) · dark soy sauce (12) · black soy sauce (2) · dark chinese soy sauce (1) |
| bay leaf | 174 | dried bay leaf (2) · whole dried bay leaf (2) |
| thyme | 168 | dried thyme (45) · ground dried thyme (1) |
| tomato paste | 163 | tomato purée (17) · tomato puree (7) · canned tomato paste (2) · plain canned tomato puree (1) |
| heavy cream | 162 | heavy whipping cream (22) · whipping cream (20) · double cream (9) |
| nutmeg | 158 | ground nutmeg (59) · powdered nutmeg (2) · dried nutmeg (1) · whole nutmeg (1) |
| chicken broth | 150 | chicken stock (41) · canned chicken broth (1) · light chicken stock (1) |
| lemon | 150 | whole lemon (4) · dry ground lemon (1) |
| baking soda | 145 | bicarbonate of soda (14) · kosher baking soda (1) |

## Promotion candidates — variants with ≥ 20 lines

A variant is a descriptor-bearing form the resolver reads as key + variety. If it
is really its own ingredient (`bread crumb` is not a crumb variety), give it a
key: add it to the seed as a key with itself as alias, or remove the descriptor
word from the taxonomy if it never modifies.

| variant | folded under | lines |
|---|---|---:|
| white granulated sugar | sugar | 343 |
| all-purpose flour | flour | 333 |
| unsalted butter | butter | 229 |
| granulated sugar | sugar | 167 |
| ground black pepper | black pepper | 159 |
| ground cinnamon | cinnamon | 134 |
| ground cumin | cumin | 127 |
| white sugar | sugar | 103 |
| green bell pepper | bell pepper | 101 |
| parmesan cheese | parmesan | 101 |
| red bell pepper | bell pepper | 78 |
| extra-virgin olive oil | olive oil | 76 |
| green onion | scallion | 75 |
| powdered sugar | confectioners sugar | 75 |
| kosher salt | salt | 74 |
| ground coriander | coriander | 73 |
| red onion | onion | 68 |
| yellow onion | onion | 59 |
| ground nutmeg | nutmeg | 59 |
| whole milk | milk | 52 |
| smoked paprika | paprika | 52 |
| dried oregano | oregano | 51 |
| cheddar cheese | cheddar | 49 |
| ground crayfish | crayfish | 48 |
| ground ginger | ginger | 47 |
| mozzarella cheese | mozzarella | 47 |
| plain flour | flour | 45 |
| dried thyme | thyme | 45 |
| ground paprika | paprika | 43 |
| coriander leaf | cilantro | 42 |
| light brown sugar | brown sugar | 41 |
| chicken stock | chicken broth | 41 |
| black peppercorn | peppercorn | 40 |
| ground pepper | pepper | 39 |
| ground cayenne pepper | cayenne pepper | 39 |
| red pepper flake | pepper flake | 39 |
| green chile | chile | 38 |
| beef stock | beef broth | 38 |
| dried rosemary | rosemary | 37 |
| caster sugar | sugar | 36 |
| ground turmeric | turmeric | 36 |
| white onion | onion | 35 |
| superfine sugar | sugar | 34 |
| dry white wine | white wine | 34 |
| rolled oats | oats | 34 |
| red chile powder | chile powder | 33 |
| dark brown sugar | brown sugar | 32 |
| cooked rice | rice | 32 |
| icing sugar | confectioners sugar | 31 |
| sweetened condensed milk | condensed milk | 31 |
| boneless skinless chicken breast | chicken breast | 30 |
| self-raising flour | flour | 28 |
| uncooked rice | rice | 27 |
| unsweetened cocoa powder | cocoa powder | 25 |
| ricotta cheese | ricotta | 25 |
| red pepper | pepper | 24 |
| cooked chicken | chicken | 24 |
| fine sea salt | salt | 23 |
| sea salt | salt | 23 |
| hot water | water | 23 |
| spring onion | scallion | 23 |
| black olive | olive | 23 |
| heavy whipping cream | heavy cream | 22 |
| green pepper | pepper | 20 |
| flat-leaf parsley | parsley | 20 |
| whipping cream | heavy cream | 20 |
| plain yogurt | yogurt | 20 |

## Alias merges (seeded synonyms + hyphen/space near-misses)

- **salt** ← 1 teaspoon salt
- **onion** ← small-medium onion, medium-large onion, finely-sliced onion, 3 big onion, thinly-julienned onion
- **sugar** ← / 6 cup sugar, 2 cups icing sugar
- **butter** ← medium-soft butter, butter room temperature, room temperature butter, 1 tablespoon butter, 2 teaspoons butter
- **water** ← 2 l water, 2 cups water, 2 tbsp water, 3.5 l water, 8 ounces water, ¼ cup water, 1 cup water
- **garlic** ← freshly-minced garlic
- **flour** ← self rising flour, 0g / 1 1/2 cups all-purpose flour, 1.6 kg flour, ½ cups flour, 1 cup all-purpose flour, ¼ cup flour, self raising flour, cup self-raising flour, whole wheat flour, all purpose flour
- **egg** ← hard boiled egg
- **olive oil** ← evoo, extra virgin olive oil, 8 oz extra virgin olive oil, ⅓ cup extra virgin olive oil, ¼ pint olive oil, ½ cup extra virgin olive oil, extra-light olive oil
- **pepper** ← pinch of freshly ground pepper, fresh-ground pepper, finely-crushed black pepper, fresh-ground black pepper
- **milk** ← 1% milk, 0g / 1 1/2 cups milk, 1 cup milk, ¼ cup milk, room temperature milk, 2% milk
- **tomato** ← 10–15 small tomato
- **vegetable oil** ← vegetable oil for deep frying, 500 ml vegetable oil for deep frying
- **paprika** ← finely-ground hot paprika
- **bell pepper** ← capsicum, sweet pepper
- **carrot** ← finely-shredded carrot
- **oil** ← 1 liter oil, oil for deep frying
- **rice** ← short grain rice, long grain brown rice, long grain rice, long grain white rice
- **cilantro** ← coriander leaf, fresh coriander, coriander leaves, 4 tablespoons chopped cilantro
- **ginger** ← fine-ground ginger, ¼ in cubes of ginger
- **bay leaf** ← bay leave
- **tomato paste** ← tomato puree, tomato purée
- **heavy cream** ← heavy whipping cream, double cream, whipping cream
- **nutmeg** ← fresh-ground nutmeg
- **chicken broth** ← chicken stock
- **lemon** ← 6 medium lemon
- **baking soda** ← bicarbonate of soda, bicarb, sodium bicarbonate
- **scallion** ← green onion, spring onion, salad onion
- **margarine** ← lightly-salted soft margarine
- **celery** ← 3–4 celery
- **oregano** ← ½ tablespoon dried oregano
- **parmesan** ← parmesan cheese, parmigiano-reggiano, parmigiano reggiano, grated parmesan
- **confectioners sugar** ← powdered sugar, icing sugar
- **cornstarch** ← corn starch, cornflour, corn flour
- **beef** ← coarse-ground beef, / ground beef, 7 cups beef, 93% lean ground beef
- **ground beef** ← minced beef, beef mince, hamburger
- **beef broth** ← beef stock
- **sour cream** ← soured cream
- **palm oil** ← palm oil for deep frying
- **cheddar** ← cheddar cheese
- **peppercorn** ← black peppercorn, whole peppercorn
- **chicken breast** ← 2 lbs chicken breast
- **bread** ← ½-inch slices white bread
- **shallot** ← 1–2 shallot
- **almond** ← finely-ground almond
- **basil** ← ½ tablespoon dried basil
- **walnut** ← 0g / 1 cup walnut, 5 walnut
- **cheese** ← 200–300 g cheese, ⅓–½ cups cheese
- **stock** ← 1 litre of stock
- **cream cheese** ← neufchatel
- **mozzarella** ← mozzarella cheese
- **yogurt** ← 2% plain yogurt
- **shrimp** ← prawn
- **lime** ← 2 lime
- **vegetable broth** ← vegetable stock
- **meat** ← coarse-ground meat
- **cornmeal** ← finely-ground cornmeal
- **tomato sauce** ← ½ litre tomato sauce
- **wheat flour** ← 0g / 1 cup white whole wheat flour
- **chocolate** ← extra-dark chocolate
- **cooking oil** ← cooking oil for deep frying
- **eggplant** ← aubergine, medium-large eggplant
- **olive** ← 50 large pitted green olive
- **pepper flake** ← hot-pepper flake
- **ice** ← 2 cups ice
- **sesame seed** ← lightly-roasted black sesame seed
- **orange** ← medium-large orange
- **wine vinegar** ← white-wine vinegar
- **molasses** ← treacle, black treacle
- **vegetable** ← ¼ cup + 2 tbsp vegetable
- **bread crumb** ← 1 cup bread crumb
- **chickpea** ← garbanzo bean, garbanzo
- **peanut** ← dry-roasted peanut
- **ricotta** ← ricotta cheese
- **lettuce** ← freshly-cut lettuce
- **zucchini** ← courgette
- **nut** ← finely-ground nut
- **rice flour** ← finely-ground rice flour
- **feta** ← feta cheese
- **habanero pepper** ← 10 habanero pepper
- **tofu** ← medium-firm tofu, extra-firm tofu
- **golden syrup** ← light corn syrup
- **lukewarm water** ← 2 cups lukewarm water
- **semolina** ← medium-coarse semolina
- **semi-sweet chocolate chip** ← semi sweet chocolate chip
- **lamb** ← 500 g lamb
- **pork shoulder** ← 4 ½-pound pork shoulder
- **ginger-garlic paste** ← ginger garlic paste
- **monterey jack** ← monterey jack cheese, jack cheese
- **chicken meat** ← 1 kilogram cooked boneless chicken meat
- **hazelnut** ← finely-ground hazelnut
- **beet** ← beetroot
- **flour tortilla** ← 6-inch round flour tortilla, 10-inch flour tortilla
- **half-and-half** ← half and half
- **pandan leaf** ← 2 cm pieces of pandan leaf
- **confectioners' sugar** ← 1 cup confectioners' sugar, 2 cups confectioners' sugar
- **cornbread** ← finely-crumbled cornbread
- **cracked black peppercorn** ← cracked-black peppercorn
- **cranberry** ← 0g / 1 cup dried cranberry
- **crème fraîche** ← reduced fat crème fraîche
- **kale** ← firmly-packed chopped kale
- **cherry** ← ¼ cup cherry
- **bouquet garni** ← bouquet-garni
- **fat** ← fat for deep frying
- **linguine** ← 500 g linguine
- **low-sodium chicken broth** ← low sodium chicken broth
- **neutral oil** ← neutral oil for deep frying
- **fried onion** ← french-fried onion
- **suet** ← finely-shredded suet
- **tea** ← 3–5 tea
- **arugula** ← rocket
- **five-spice powder** ← five spice powder
- **pork tenderloin** ← ½ lb pork tenderloin
- **squeezed lime juice** ← fresh-squeezed lime juice
- **steak** ← 6–8 ounce strip steak
- **grain rice** ← medium-grain rice, round-grain rice
- **matzo meal** ← fine-ground matzo meal
- **parmigiano-reggiano cheese** ← parmigiano reggiano cheese
- **seasoned bread crumb** ← 2 tablespoons seasoned bread crumb
- **thick coconut milk** ← medium-thick coconut milk
- **vermouth** ← extra-dry white vermouth
- **angel hair pasta** ← angel-hair pasta
- **bun** ← 1-inch bun
- **daikon radish** ← thinly-julienned daikon radish
- **hominy** ← freshly-bleached hominy
- **jelly** ← 2½ cups jelly
- **teriyaki sauce** ← ¼ cup teriyaki sauce
- **thick-cut bacon** ← thick cut bacon
- **thick-cut bone-in pork rib chop** ← thick cut bone-in pork rib chop
- **thick-cut pork rib chop** ← thick cut pork rib chop
- **chili garlic sauce** ← chili-garlic sauce
- **cinnamon sugar** ← cinnamon-sugar
- **dutch-processed cocoa powder** ← dutch processed cocoa powder
- **glacé cherry** ← 6 glacé cherry
- **high-protein flour** ← high protein flour
- **reduced-sodium soy sauce** ← reduced sodium soy sauce
- **salmon steak** ← 3-ounce salmon steak
- **wheat** ← whole-wheat
- **rutabaga** ← swede
- **snow pea** ← mangetout

## Tail — first 100 heads under the floor

4–5 larger tomato (2) · 9-inch unbaked pie shell (2) · a mixture of ½ tsp gum arabic with ½ tsp water (2) · achiote seed (2) · additional spice (2) · adobo (2) · adzuki bean (2) · alayyahu (2) · alcaparrado (2) · alfalfa sprout (2) · allspice berry (2) · amaretto (2) · american (2) · anchovy paste (2) · and chopped apple (2) · and green bell pepper (2) · and sliced apple (2) · andouille sausage (2) · annatto (2) · annatto seed (2) · apple stuffing (2) · apple wood (2) · assorted bell pepper (2) · average-size tomato (2) · avocado oil (2) · bag semi-sweet chocolate chip (2) · baking apple (2) · baking cocoa (2) · baking cocoa powder (2) · banana ketchup (2) · banga spice mix (2) · barbeque sauce (2) · barberry (2) · barley flour (2) · basil chiffonade (2) · béchamel sauce (2) · beef dripping (2) · beef round steak (2) · beef shortrib (2) · beef sirloin (2) · beef steak (2) · beef tenderloin roast (2) · biscuit (2) · biscuit dough (2) · biscuit mix (2) · bison meat (2) · bit of sugar (2) · bitter leaf (2) · blade of mace (2) · blue cheese dressing (2) · boiling apple cider vinegar (2) · boiling potato (2) · bonito flake (2) · branches lemongrass (2) · branches of fresh rosemary (2) · breast (2) · brewed black coffee (2) · brick cream cheese (2) · brick-style cream cheese (2) · brussels sprout (2) · bunch of cilantro (2) · bunch of fresh cilantro (2) · burgundy wine (2) · burnt sugar (2) · butter bean (2) · butter for cooking (2) · butter-flavored salt (2) · caffeine (2) · can crushed tomato (2) · can of tomato paste (2) · can tomato paste (2) · candied cherry (2) · cannabis (2) · caramel sauce (2) · cassia oil (2) · cayenne pepper sauce (2) · champagne vinegar (2) · chana dhal (2) · channa dhal (2) · chanterelle mushroom (2) · cheddar cheese soup (2) · cheese of your choice (2) · cherry juice (2) · chicken bouillon powder (2) · chicken drumstick (2) · chicken fat (2) · chicken flavour bouillon (2) · chicken gizzard (2) · chicken leg quarter (2) · chicken thighs and drumstick (2) · chihuahua cheese (2) · chile paste (2) · chile-tomato purée (2) · chili flake (2) · chipotle bbq sauce (2) · chipotle purée (2) · chipotles in adobo sauce (2) · chocolate heart (2) · chocolate shaving (2) · chorizo sausage (2)
