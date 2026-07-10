// Spike: assemble an exchange.recipe.recipe draft from a transcribed video.
//
// The transcript (out/transcript.txt) + PeerTube metadata (out/meta.json) become a recipe
// record whose `attribution` is an `attributionShow` union member pointing back at the source
// video — the "link the recipe to the video directly" value-add.
//
// The ingredient/instruction structuring below is drafted from the transcript by hand for the
// spike; in production this is where an extraction step (LLM or parser) would sit. Everything
// derived automatically (name, source url, network, description, transcript) is pulled straight
// from the fetched artifacts so the provenance is real.
import { readFileSync, writeFileSync } from "node:fs";

const here = new URL(".", import.meta.url).pathname;
const meta = JSON.parse(readFileSync(`${here}out/meta.json`, "utf8"));
const transcript = readFileSync(`${here}out/transcript.txt`, "utf8").trim();

const watchUrl = `https://video.infosec.exchange/w/${meta.shortUUID}`;

const recipe = {
  $type: "exchange.recipe.recipe",
  name: meta.name, // "Cooking a Burrito Bowl for 2 for $12"
  text: meta.description || "Burrito bowl for two, drafted from the source video's audio.",
  ingredients: [
    "Seasoned beef taco meat",
    "Cooked rice",
    "1 avocado",
    "1 roma tomato",
    "Fresh cilantro",
    "1 lime",
    "Shallots",
    "Garlic",
    "Queso sauce",
  ],
  instructions: [
    "Cook the rice and season the beef taco meat.",
    "Make guacamole from the avocado, tomato, shallots, garlic, cilantro and lime — no added salt (the queso and seasoned beef bring enough).",
    "Build each bowl over rice with the seasoned beef, guacamole and a spoon of queso sauce.",
    "Serves 2 (about $6 per person at Chicago prices).",
  ],
  recipeYield: "2 servings",
  recipeCategory: "Entree",
  recipeCuisine: "TexMex",
  // Schema-native link back to the source video (exchange.recipe.defs#attributionShow).
  attribution: {
    $type: "exchange.recipe.defs#attributionShow",
    title: meta.name,
    network: meta.channel?.displayName || "PeerTube",
    url: watchUrl,
    notes: "Recipe auto-drafted from the video's audio transcript (whisper.cpp base.en).",
  },
  keywords: ["burrito bowl", "budget", "guacamole"],
  // Provenance for the spike — not a schema field, kept out of the record we'd publish.
};

const artifact = {
  source: { watchUrl, uuid: meta.uuid, durationSec: meta.duration },
  transcript,
  recipe,
};

writeFileSync(`${here}out/recipe.json`, JSON.stringify(artifact, null, 2));
console.log(JSON.stringify(recipe, null, 2));
console.log(`\nlinked to: ${watchUrl}`);
