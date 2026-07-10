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
  name: meta.name, // "Lamb and Cilantro Stir Fry"
  text:
    meta.description ||
    "Thin-sliced hot pot lamb stir-fried in a wok with a big handful of cilantro, garlic, and árbol chilies — a method built for a weak home stove. Drafted from the source video's audio.",
  ingredients: [
    "Thin-sliced hot pot lamb (freezer case at an Asian grocery)",
    "A big bunch of fresh cilantro",
    "Garlic",
    "Dried árbol chilies",
    "Cornstarch (helps the deglazing liquid become a sauce)",
    "Splash of rice wine (or water) to deglaze",
  ],
  instructions: [
    "If the hot pot lamb comes as a frozen box, let it defrost in the fridge and cook it the next day.",
    "Heat the wok. Spread the lamb in a single layer with the garlic and árbol chilies and let it brown undisturbed.",
    "Flip, let it sit another 30 seconds, and repeat — spread, brown, flip — until everything is nicely browned. This is the fix for a stove that isn't that hot.",
    "Add the cilantro straight into the meat and fold it through until it just heats and wilts.",
    "Deglaze with a splash of rice wine or water; the cornstarch and the meat pull it into a light sauce.",
    "Start to finish, about 15 minutes. The same method works for beef and peppers, pork and leeks — whatever you fancy.",
  ],
  recipeCategory: "dinner",
  recipeCuisine: "chinese",
  // Schema-native link back to the source video (exchange.recipe.defs#attributionShow).
  attribution: {
    $type: "exchange.recipe.defs#attributionShow",
    title: meta.name,
    network: meta.channel?.displayName || "PeerTube",
    url: watchUrl,
    notes: "Recipe auto-drafted from the video's audio transcript (whisper.cpp base.en).",
  },
  keywords: ["stir fry", "lamb", "hot pot meat", "wok", "weeknight"],
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
