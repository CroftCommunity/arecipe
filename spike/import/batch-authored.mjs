// Authored overlay for the URL batch (NON-PRODUCTION ops tooling). Ingredients,
// times and yield come from the extracted schema.org/Recipe facts
// (extracted-batch.json); the description and instructions here are ORIGINAL
// prose written from those facts — the source's expressive text is not reused.
// The source is credited via attribution in the published record.
// Keyed by the same name used in batch-urls.mjs / extracted-batch.json.
export const AUTHORED = {
  'Guacamole': {
    category: 'Mexican',
    source_url: 'https://www.isabeleats.com/simple-guacamole-recipe/',
    labels: ['appetizer', 'vegetarian', 'vegan', 'gluten-free', 'dairy-free'],
    description:
      'Ripe avocados mashed with lime, cilantro, onion and jalapeño into a fresh, chunky dip you can take from mild to fiery, all in one bowl.',
    instructions: [
      'Halve the avocados, remove the pits, and scoop the flesh into a bowl.',
      'Mash to your preferred consistency.',
      'Stir in the cilantro, tomato, onion, lime juice, jalapeño and salt; taste and adjust.',
    ],
  },
  'Pico de Gallo': {
    category: 'Mexican',
    source_url: 'https://www.isabeleats.com/mexican-pico-de-gallo-recipe/',
    labels: ['appetizer', 'vegetarian', 'vegan', 'gluten-free', 'dairy-free'],
    description:
      'A raw salsa of diced tomato, onion, jalapeño and cilantro brightened with lime — crisp, fresh and endlessly useful as a topping or dip.',
    instructions: [
      'Combine the tomatoes, onion, jalapeños, cilantro, lime juice, garlic and salt in a bowl.',
      'Toss, taste, and add more salt if needed.',
      'Serve immediately or chill until ready.',
    ],
  },
  'Carnitas': {
    category: 'Mexican',
    source_url: 'https://www.isabeleats.com/mexican-slow-cooker-pork-carnitas-tacos/',
    labels: ['dinner', 'lunch', 'gluten-free', 'dairy-free'],
    description:
      'Pork shoulder slow-cooked with citrus and warm spices until fall-apart tender, then broiled so the edges turn crisp and golden — the classic taco filling.',
    instructions: [
      'Season the pork all over with salt, cumin, chili powder, garlic powder, oregano, onion powder and black pepper.',
      'Pour the orange and lime juice into a slow cooker and add the pork.',
      'Cook on low about 8 hours (or high 4-5 hours), until the meat shreds easily.',
      'Shred the pork out on a baking sheet.',
      'Spoon over some cooking liquid and broil 8-10 minutes, stirring once, until crisp.',
      'Finish with cilantro and a squeeze of lime.',
    ],
  },
  'Beef Barbacoa': {
    category: 'Mexican',
    source_url: 'https://www.isabeleats.com/pressure-cooker-barbacoa-beef/',
    labels: ['dinner', 'lunch', 'gluten-free', 'dairy-free'],
    description:
      'Chuck roast braised with chipotle, vinegar and warm spices until it shreds into a smoky, deeply savory filling for tacos, bowls or burritos.',
    instructions: [
      'Cut the beef into large chunks and season generously with salt and pepper.',
      'Brown the beef in oil in batches in a pressure cooker; set aside.',
      'Cook the onion until softened, then add the garlic for a minute.',
      'Add beer or broth, vinegar, lime juice, chipotles, chili powders, cumin, oregano, cloves and bay leaves; stir.',
      'Return the beef, seal, and pressure-cook on high 60 minutes.',
      'Let the pressure release naturally 10 minutes, then shred the meat and season to taste.',
    ],
  },
  'Cheese Enchiladas': {
    category: 'Mexican',
    source_url: 'https://www.isabeleats.com/cheese-enchiladas/',
    labels: ['dinner', 'vegetarian'],
    description:
      'Corn tortillas rolled around plenty of melty cheese, blanketed in red enchilada sauce and baked until bubbling — simple, comforting and fast.',
    instructions: [
      'Heat the oven to 350°F and spread a little enchilada sauce over the bottom of a baking dish.',
      'Warm the tortillas until pliable.',
      'Fill each tortilla with cheese, roll, and place seam-side down in the dish.',
      'Top with the remaining sauce and cheese; bake 15-20 minutes until melted.',
      'Serve with your choice of toppings.',
    ],
  },
  'Chicken Enchiladas': {
    category: 'Mexican',
    source_url: 'https://www.isabeleats.com/red-chicken-enchiladas/',
    labels: ['dinner'],
    description:
      'Shredded chicken and cheese wrapped in corn tortillas, smothered in red sauce and baked until the top is bubbling and golden.',
    instructions: [
      'Heat the oven to 350°F. Mix the shredded chicken with a little enchilada sauce, salt and pepper.',
      'Warm the tortillas until pliable.',
      'Fill each with the chicken and cheese, roll, and place seam-side down in a baking dish.',
      'Top with the remaining sauce and cheese; bake about 20 minutes until bubbly.',
      'Serve with toppings.',
    ],
  },
  'Pozole Rojo': {
    category: 'Mexican',
    source_url: 'https://www.isabeleats.com/red-posole-recipe/',
    labels: ['dinner', 'gluten-free', 'dairy-free'],
    description:
      'A soul-warming stew of pork and hominy in a rich red chile broth, finished at the table with cabbage, radish, lime and oregano.',
    instructions: [
      'Simmer guajillo, ancho and árbol chiles in water until soft, then blend with chili powder, cumin, salt, garlic and Mexican chocolate into a smooth sauce.',
      'Season the pork with salt and pepper and sear in oil in a large pot.',
      'Add the chile sauce, scraping the pot, then stir in the broth, hominy and oregano.',
      'Bring to a boil, cover, and simmer about 2½ hours until the pork is tender.',
      'Shred the pork and season to taste.',
      'Serve with cabbage, cilantro, radish, onion and lime.',
    ],
  },
  'Pork Tamales': {
    category: 'Mexican',
    source_url: 'https://tastesbetterfromscratch.com/mexican-tamales/',
    labels: ['dinner'],
    description:
      'Soft masa spread on corn husks, filled with savory red-chile pork, then wrapped and steamed — a labor-of-love centerpiece worth making in a big batch.',
    instructions: [
      'Soak the corn husks in hot water about 30 minutes until pliable.',
      'Prepare your filling.',
      'Beat the lard with a little broth until fluffy, then mix in the masa harina, baking powder, salt and cumin.',
      'Add broth gradually to form a soft, spreadable dough.',
      'Spread masa over the top half of each husk, add a line of filling, and fold the sides and bottom over.',
      'Stand the tamales upright in a steamer and steam 45 minutes to 1 hour, until the husk peels away cleanly.',
    ],
  },
  'Elote': {
    category: 'Mexican',
    source_url: 'https://www.isabeleats.com/authentic-mexican-street-corn/',
    labels: ['side', 'appetizer', 'vegetarian', 'gluten-free'],
    description:
      'Mexican street corn: boiled ears slathered in a garlicky lime mayo, then rolled in cotija, cilantro and a dusting of chili — messy and irresistible.',
    instructions: [
      'Boil the corn about 5 minutes until tender; set aside.',
      'Mix the mayonnaise, lime juice, garlic and half the cayenne.',
      'Brush the corn with melted butter, then coat with the mayo mixture.',
      'Sprinkle with cotija, the remaining cayenne and cilantro.',
    ],
  },
  'Refried Beans': {
    category: 'Mexican',
    source_url: 'https://www.isabeleats.com/authentic-mexican-refried-beans/',
    labels: ['side', 'vegetarian', 'gluten-free'],
    description:
      'Pinto beans simmered with aromatics until tender, then fried and mashed into a creamy, savory staple for any Mexican plate.',
    instructions: [
      'Pick over and rinse the dried beans.',
      'Simmer with half an onion, garlic, bay leaf, oregano and salt in plenty of water 1½-2 hours until tender; drain, reserving the liquid.',
      'Sauté the diced onion, garlic, jalapeño, oregano and salt in oil until softened.',
      'Add the beans and cook briefly, then stir in some reserved liquid.',
      'Mash to your preferred texture, adding liquid as needed; season to taste.',
    ],
  },
  'Mexican Rice': {
    category: 'Mexican',
    source_url: 'https://www.isabeleats.com/moms-authentic-mexican-rice/',
    labels: ['side', 'vegetarian', 'gluten-free'],
    description:
      'Fluffy long-grain rice toasted in oil then simmered with tomato and garlic — the fragrant red rice that rounds out any Mexican meal.',
    instructions: [
      'Rinse the rice until the water runs clear; drain well.',
      'Toast the rice in oil about 10 minutes until lightly golden.',
      'Add the onion, tomato, garlic and salt; sauté 30 seconds.',
      'Stir in the broth and tomato paste until dissolved.',
      'Boil, then cover and cook on low 20 minutes; rest 5 minutes off the heat.',
      'Fold in the peas and season to taste.',
    ],
  },
  'Chicken Fajitas': {
    category: 'Mexican',
    source_url: 'https://www.isabeleats.com/30-minute-mexican-lime-chicken-fajitas-easy-guacamole/',
    labels: ['dinner', 'lunch', 'gluten-free', 'dairy-free'],
    description:
      'Citrus-and-chili marinated chicken seared with sweet peppers and onions — sizzling, colorful and ready for a stack of warm tortillas.',
    instructions: [
      'Toss the chicken with the oil, citrus juices, cilantro, soy sauce, garlic and spices; marinate while you cook the vegetables.',
      'Sauté the peppers and onion in oil with a little soy sauce and salt about 10 minutes until soft; set aside.',
      'Cook the marinated chicken in the same skillet about 10 minutes, until cooked through.',
      'Rest, then slice the chicken.',
      'Return everything to the skillet, toss, and serve in warm tortillas.',
    ],
  },
  'Ground Beef Tacos': {
    category: 'Mexican',
    source_url: 'https://www.isabeleats.com/easy-ground-beef-tacos/',
    labels: ['dinner', 'lunch'],
    description:
      'A seasoned ground-beef filling in crisp homemade shells — the fast, family-friendly taco-night classic.',
    instructions: [
      'Brown the ground beef, breaking it up, and drain excess fat.',
      'Stir in the tomato paste, water and spices; cook 1 minute.',
      'Off the heat, stir in the lime juice.',
      'For the shells, fry the tortillas in an inch of oil, folding into a U shape, until crisp.',
      'Fill the shells with the beef and top with lettuce, cheese, tomato and sour cream.',
    ],
  },
  'Birria Tacos': {
    category: 'Mexican',
    source_url: 'https://www.isabeleats.com/birria-tacos/',
    labels: ['dinner', 'lunch', 'gluten-free'],
    description:
      'Chuck roast braised in a deep red chile adobo until meltingly tender, then piled with cheese into tortillas crisped in the rich consomé for dipping.',
    instructions: [
      'Season the beef with salt and pepper and sear in oil in a large pot; set aside.',
      'Simmer the guajillo, ancho and árbol chiles with tomatoes, onion, cinnamon, bay and peppercorns in water 10 minutes.',
      'Blend the softened chiles with some soaking liquid, broth, vinegar, garlic, cumin, oregano and cloves until smooth; strain into the pot with the beef.',
      'Boil, then cover and simmer 3-3½ hours until fall-apart tender; shred the meat.',
      'Dip tortillas in the fat atop the broth, fill with cheese and beef, and fry until crisp.',
      'Serve with onion, cilantro, lime and a bowl of consomé for dipping.',
    ],
  },
  'Salsa Verde': {
    category: 'Mexican',
    source_url: 'https://www.isabeleats.com/homemade-tomatillo-salsa-verde/',
    labels: ['appetizer', 'vegetarian', 'vegan', 'gluten-free', 'dairy-free'],
    description:
      'Tangy tomatillos, chiles and cilantro blended into a bright green salsa — roast the tomatillos for smoky depth or boil them for a cleaner, fresher taste.',
    instructions: [
      'Char the tomatillos, jalapeños and garlic under the broiler about 10 minutes (or boil until they turn dull green).',
      'Blend with the onion, cilantro, lime juice and salt until smooth.',
      'Serve immediately or refrigerate up to a week.',
    ],
  },
  'Huevos Rancheros': {
    category: 'Mexican',
    source_url: 'https://www.isabeleats.com/easy-huevos-rancheros-recipe/',
    labels: ['breakfast', 'vegetarian', 'gluten-free'],
    description:
      'Fried eggs over lightly crisped corn tortillas, blanketed in a smoky ranchero salsa — a hearty Mexican breakfast plate.',
    instructions: [
      'Cook the jalapeño, onion, tomatoes, garlic, salt, paprika and oregano in oil about 5 minutes.',
      'Add water and cook 10 more minutes, then blend to your preferred texture.',
      'Stir in the cilantro and lime juice; season and keep warm.',
      'Lightly fry the tortillas about 15 seconds per side until softened with crisp edges.',
      'Fry the eggs until the whites are set and the yolks still runny.',
      'Set an egg on each tortilla and top with the ranchero salsa, cotija, avocado and radish.',
    ],
  },
  'Chilaquiles Rojos': {
    category: 'Mexican',
    source_url: 'https://www.isabeleats.com/easy-red-chilaquiles-recipe/',
    labels: ['breakfast', 'vegetarian', 'gluten-free'],
    description:
      'Crisp tortilla chips simmered briefly in red chile salsa so they soften at the edges but keep their bite — a classic brunch, great with a fried egg on top.',
    instructions: [
      'Soak the guajillo and árbol chiles in boiling water 10 minutes until soft.',
      'Blend with water, tomato, garlic, onion and salt until smooth; strain if needed.',
      'Cut the tortillas into wedges and fry in batches until crisp; drain.',
      'Warm a little oil, add the salsa, and cook 3 minutes.',
      'Off the heat, fold in the chips to coat.',
      'Serve right away with cotija, cilantro, onion, crema and a fried egg if you like.',
    ],
  },
  'Mac and Cheese': {
    category: 'American',
    source_url: 'https://www.seriouseats.com/ingredient-stovetop-mac-and-cheese-recipe',
    labels: ['dinner', 'side', 'vegetarian'],
    description:
      'A fast stovetop mac and cheese where the pasta cooks in just enough water, then evaporated milk and cheese melt into a glossy, creamy sauce — no roux, no baking.',
    instructions: [
      'Cook the macaroni in just enough salted water to cover, stirring, until the water is nearly absorbed and the pasta is just shy of al dente, about 6 minutes.',
      'Add the evaporated milk and bring to a boil.',
      'Stir in the cheese over low heat until melted into a creamy sauce, about 2 minutes; season and serve.',
    ],
  },
  'BBQ Pulled Pork': {
    category: 'American',
    source_url: 'https://www.recipetineats.com/pulled-pork-with-bbq-sauce/',
    labels: ['dinner', 'lunch'],
    description:
      'Pork shoulder rubbed with spices and slow-cooked until it pulls apart, then crisped in the oven and tossed in a tangy homemade barbecue sauce.',
    instructions: [
      'Rub the pork all over with the spice mix.',
      'Slow-cook on low with the beer about 10 hours, until tender enough to shred.',
      'Transfer to a roasting pan (reserve the liquid), drizzle with some fat, and roast at 350°F for 20 minutes.',
      'Trim the fat cap, spoon over more juices, and roast 15 minutes more.',
      'Meanwhile simmer the sauce ingredients about 45 minutes until thickened, loosening with cooking juices.',
      'Shred the pork and toss with the barbecue sauce.',
    ],
  },
  'Southern Fried Chicken': {
    category: 'American',
    source_url: 'https://www.recipetineats.com/fried-chicken/',
    labels: ['dinner'],
    description:
      'Buttermilk-brined chicken in a craggy, well-seasoned crust, fried until deep golden and shatteringly crisp with juicy meat inside.',
    instructions: [
      'Mix the buttermilk marinade and massage it into the chicken; refrigerate 12-24 hours.',
      'Whisk the flour, cornstarch and seasonings, then rub in a few spoons of marinade to form crunchy lumps.',
      'Heat oil to 350°F in a heavy pot.',
      'Dip each piece in marinade, then press firmly into the flour to coat well.',
      'Fry in batches, undisturbed for the first 2 minutes; cook thighs and drumsticks about 8 minutes (breast about 6), until deep golden and cooked through.',
      'Drain and keep warm in a low oven while you fry the rest.',
    ],
  },
  'Cobb Salad': {
    category: 'American',
    source_url: 'https://www.recipetineats.com/cobb-salad/',
    labels: ['lunch', 'dinner', 'gluten-free'],
    description:
      'A composed salad of chicken, bacon, egg, avocado, tomato and blue cheese in tidy rows over crisp lettuce, with a sharp mustard vinaigrette.',
    instructions: [
      'Shake the dressing ingredients together in a jar.',
      'Poach and cube the chicken, then toss with salt, pepper and a little dressing.',
      'Crisp the bacon, drain, and chop.',
      'Spread the lettuce on a platter and arrange the egg, bacon, avocado, tomato and chicken in rows.',
      'Crumble over the blue cheese, scatter with chives, and serve with the dressing.',
    ],
  },
  'Caesar Salad': {
    category: 'American',
    source_url: 'https://www.recipetineats.com/chicken-caesar-salad/',
    labels: ['lunch', 'dinner'],
    description:
      'Crisp romaine tossed in a creamy anchovy-and-parmesan dressing with garlicky croutons — built here into a full meal with chicken, bacon and egg.',
    instructions: [
      'Blend the mayonnaise, garlic, anchovy, lemon juice, mustard, Worcestershire, parmesan, milk, salt and pepper until smooth; rest 20 minutes.',
      'Crisp the bacon, drain, and chop.',
      'Rub toasted bread with cut garlic, cube, toss with oil and salt, and bake until golden.',
      'Boil the eggs to your liking and cook the seasoned chicken in the bacon fat, then slice.',
      'Toss the lettuce with half the dressing, adding more to taste.',
      'Top with chicken, egg, bacon and croutons and finish with parmesan.',
    ],
  },
  'Chili con Carne': {
    category: 'American',
    source_url: 'https://www.recipetineats.com/chilli-con-carne/',
    labels: ['dinner', 'gluten-free'],
    description:
      'A hearty bowl of ground beef and kidney beans simmered with tomatoes and a warm chili-spice blend — quick on a weeknight, even better slow-cooked.',
    instructions: [
      'Cook the garlic and onion in oil, then add the bell pepper and cook until the onion is translucent.',
      'Turn the heat up, add the beef, and brown, breaking it up.',
      'Stir in the chili spice mix and cook briefly.',
      'Add the remaining ingredients with water; bring to a simmer.',
      'Cook uncovered 20-40 minutes (or covered 1½-2 hours for slow-cooked depth).',
      'Season to taste and serve with rice, chips or tortillas and toppings.',
    ],
  },
  'Coleslaw': {
    category: 'American',
    source_url: 'https://www.recipetineats.com/coleslaw/',
    labels: ['side', 'vegetarian', 'gluten-free'],
    description:
      'Finely shredded cabbage and carrot in a creamy, tangy-sweet dressing — let it rest so the slaw softens and the flavors meld.',
    instructions: [
      'Whisk the dressing ingredients together.',
      'Toss the cabbage and carrot with the dressing.',
      'Rest at least 20 minutes (ideally a couple of hours) so the cabbage softens; toss again before serving.',
    ],
  },
  'Sloppy Joes': {
    category: 'American',
    source_url: 'https://www.recipetineats.com/sloppy-joes/',
    labels: ['dinner', 'lunch'],
    description:
      'Ground beef simmered in a sweet-and-tangy tomato sauce until thick, then piled onto soft toasted rolls — a nostalgic, satisfyingly messy sandwich.',
    instructions: [
      'Melt the butter in a pot and cook the garlic and onion until almost translucent.',
      'Add the bell pepper and cook until softened.',
      'Add the beef and cook, breaking it up, until browned.',
      'Stir in the remaining ingredients and simmer, covered, about 30 minutes until thick.',
      'Season to taste, toast the rolls, and pile on the filling; top with cheese if you like.',
    ],
  },
  'Banana Bread': {
    category: 'American',
    source_url: 'https://www.simplyrecipes.com/recipes/banana_bread/',
    labels: ['breakfast', 'dessert', 'vegetarian'],
    description:
      'A moist, one-bowl banana bread made with very ripe bananas and melted butter — no mixer needed, and even better the next day.',
    instructions: [
      'Butter an 8x4-inch loaf pan and heat the oven to 350°F.',
      'Mash the bananas smooth, then stir in the melted butter.',
      'Mix in the baking soda and salt, then the sugar, egg and vanilla, and finally the flour.',
      'Pour into the pan and bake 55-65 minutes, until a pick inserted in the center comes out clean.',
      'Cool in the pan a few minutes, then turn out and cool completely before slicing.',
    ],
  },
};
