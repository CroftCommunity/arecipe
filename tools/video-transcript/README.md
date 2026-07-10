# video → transcript → recipe (linked to the source video)

Tooling to pull a video, transcribe its audio locally, draft an `exchange.recipe.recipe`
from the transcript, and publish it linked back to the source video. Lives in
`tools/video-transcript/`. Ops tooling, not part of the app build.

**Problem.** Cooking videos carry a recipe in the audio, not in text. If we can transcribe
the audio we can (a) draft a recipe record from it and (b) link that recipe back to the
source video as a value-add for the viewer.

**Proof.** Ran end-to-end against a real PeerTube video —
`https://video.infosec.exchange/w/5uxXvy3MtAnPGUT2cMH6LX` ("Cooking a Burrito Bowl for 2 for
$12", 69s). PeerTube exposed **no captions** (`/api/v1/videos/<id>/captions` → `total: 0`), so
we transcribe.

## Pipeline

```
PeerTube watch URL
      │  GET /api/v1/videos/<shortUUID>            (metadata + HLS media URL)
      ▼
   video.mp4  ──ffmpeg──▶  audio.wav (16kHz mono)
      │
      ▼
 whisper-cli (whisper.cpp base.en, local)  ──▶  transcript.txt
      │
      ▼
 build-recipe.mjs  ──▶  exchange.recipe.recipe draft
                        with attribution = exchange.recipe.defs#attributionShow
                        { title, network, url → the video }
```

## Playbook — recipe from a new video

The scripts are hardcoded per-video; each new video means editing them, not just re-running.

1. **Transcribe.** `cd tools/video-transcript && ./transcribe.sh "<peertube-watch-url>"`
   — fetches metadata (`out/meta.json`), downloads the media, extracts 16kHz wav, runs whisper.
   - Gotcha: `models/ggml-base.en.bin` is gitignored and **not** auto-downloaded. If whisper-cli
     dies with `failed to initialize whisper context`:
     `curl -sL -o models/ggml-base.en.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin`
     then rerun just the whisper step: `whisper-cli -m models/ggml-base.en.bin -f out/audio.wav -otxt -of out/transcript -np -nt`
2. **Draft.** Read `out/transcript.txt` and hand-draft the recipe — the transcript→structure
   step is the human/LLM. Edit the hardcoded record in **both** `build-recipe.mjs` and
   `publish-video-recipe.mjs` (name, text, ingredients, instructions, cuisine, keywords,
   `WATCH_URL`). Conventions: lowercase cuisine/category tokens (`chinese`, `dinner`); only
   claims the transcript supports; expect speech-to-text garbles for proper nouns ("99 Ray" ≈
   99 Ranch) and prices ("index runs at 1383" ≈ $13.83).
3. **Frame.** `transcribe.sh` does *not* produce `out/frame.png` — extract the title card:
   `ffmpeg -y -ss 1.0 -i out/video.mp4 -frames:v 1 -vf "scale=540:-1,crop=540:540:0:170" out/frame.png`
   (vertical 1080×1920 shorts → 540×540 crop; must stay under the 1MB blob cap). Update
   `RECIPE_NAME`, `WATCH_URL`, `alt`, and `aspectRatio` in `attach-video-image.mjs`.
4. **Publish.** `node build-recipe.mjs` (provenance artifact) →
   `node publish-video-recipe.mjs --dry-run` → review → drop `--dry-run` (idempotent by name) →
   `node attach-video-image.mjs --dry-run` → drop `--dry-run`.
5. **Verify + log.** `getRecord` the new URI, confirm attribution url + embed round-trip, and
   append the run (URI, blob, transcript) to the Run log below.

Credentials come from the gitignored repo-root `.env` (`BSKY_ARECIPE_HANDLE` / `_PASSWORD`).
`models/` and `out/` are gitignored (regenerable).

## The link (value-add)

`exchange.recipe.recipe` already has a purpose-built union member for this —
`exchange.recipe.defs#attributionShow`, described as *"Recipe from a TV show, streaming
content, or video."* with `title` / `network` / `url` / `notes`. No new lexicon or extension
field needed; the recipe points straight at the video it was drafted from.

## What's real vs. drafted

- **Real (pulled from artifacts):** video name, channel, duration, watch URL, full transcript.
- **Drafted by hand for the spike:** the structured `ingredients` / `instructions`. In
  production this extraction step (transcript → structured recipe) is where an LLM or parser
  sits. The transcript is faithful; the structuring is the reviewable part.

### Transcript (whisper.cpp base.en, verbatim)

> The Chicago land beef-breedable index is about $12. With the ingredients being seasoned beef
> taco meat, cilantro, lime, avocado, roma tomato, shallots, some queso sauce, and some rice.
> Oh, don't forget the garlic. This recipe feeds about two people for dinner that makes it out
> to be $6 a person. In Chicago, we're pretty fortunate to have a couple grocery stores like
> Ceramac Fresh and Pizza. This is a small market where you can pretty much just walk in and
> find a ripe avocado just to make guacamole that day. When making guacamole or salsa, I don't
> even bother adding salt to it anymore. Especially in this dish with the queso and the seasoned
> beef taco meat, there's already plenty of salt to go around. Are there any unsalted chips that
> people like? Let me know in the comments. You can just get a freshly baked sesame seed roll and
> make yourself a pretty awesome tortilla.

(Speech-to-text artifacts left as-is: "beef-breedable index" ≈ "beef bureau/price index";
"Ceramac Fresh and Pizza" ≈ local grocery names.)

## Run log

### 2026-07-10 — Lamb and Cilantro Stir Fry

- Source: `https://video.infosec.exchange/w/b11bTRP1w2zptLaEPDggzJ` ("Lamb and Cilantro Stir
  Fry", I Live to Eat, 124s). No captions on PeerTube; transcribed with whisper.cpp base.en.
- URI: `at://did:plc:spfl4xaktvvchr2cqp2r2xvp/exchange.recipe.recipe/3mqd2gfuupy2k`
- Image: title-card frame, 540×540 PNG 386KB, blob
  `bafkreifanhbrqeh7umkyor7q22vfndt3mnywsh3rysbw3q6tcr4wdom7au`, credit `{artist: "I Live to
  Eat", license: "video still", source: <watch url>}`. Round-tripped via `getRecord`.
- Transcript garbles decoded while drafting: "Lamas cilantro index runs at 1383" ≈ lamb-and-
  cilantro ingredients cost ~$13.83; "99 Ray" ≈ 99 Ranch; "Junbu" ≈ Joong Boo; "Park the shop"
  ≈ Park To Shop; "take the sauce" ≈ make the sauce.

<details><summary>Transcript (whisper.cpp base.en, verbatim)</summary>

> The Chicagoland Lamas cilantro index runs at 1383. And in this video we're going to talk
> about buying hot pot meat for stir-fry and wok cooking on a stove that's not that hot. 40
> degrees we've got cilantro, garlic, arbal chilies, and lamb. You can find hot pot meat at
> just about any Asian grocery store. The most popular being H Mart or 99 Ray. in Chicagoland
> specifically there's also Junbu and Mitsuwa and Park the shop and in this particular case
> it's 88 market. It's actually super convenient and pretty reasonably priced. Or you can just
> buy a box and let it defrost in your fridge and cook it the next day. If you're like me and
> have a stove that's pretty weak here's my general approach to stir-fry which is pretty much
> spread the meat, let it brown, and then start flipping. Let it sit for another 30 seconds
> and repeat the process until everything is nice and browned out. Because it's just cilantro
> just adding it straight into the meat and heating it up and folding it up is all you need.
> And at this point you can add some rice wine or some water to deglaze the pan and create a
> little bit of a sauce where the meat and the corn starch will help take the sauce for you.
> And that's about it. From start to finish you have a meal within about 15 minutes. You can
> effectively apply this method to various different meats and veggie combinations like beef
> and peppers, pork and leeks, whatever your strike should fancy. If you don't have a walk and
> would rather see me do stir-fry on a plain skillet. Let me know.

</details>

### 2026-07-10 — Burrito Bowl (first run)

Live on `arecipe.bsky.social` (a `STARTER_AUTHORS` account, so it surfaces in Browse):

- URI: `at://did:plc:spfl4xaktvvchr2cqp2r2xvp/exchange.recipe.recipe/3mqcfw37mzx2h`
- Publisher: `tools/video-transcript/publish-video-recipe.mjs` (idempotent by name; `--dry-run` to preview).
- Attribution: `exchange.recipe.defs#attributionShow` (`title`/`network`/`url`) plus a `name`
  field so the currently-deployed `view.ts` renderer draws the "credit:" link straight to the
  video watch page. Round-tripped byte-intact via `getRecord`.
- Image: the video's own title-card frame, attached via
  `tools/video-transcript/attach-video-image.mjs` (uploadBlob + putRecord embed, idempotent).
  Blob `bafkreif6rpepgbbvt3s5f2m5w4zt5unarzjquezxzykaikg23oqdpjkbm4` (PNG, 555KB, 534×528),
  served via cdn.bsky.app. Credit `{artist: "I Live to Eat", license: "video still", source:
  <watch url>}` — so the image credit also links to the video. Unlike the other 40 live records
  (Wikimedia Commons / CC / public-domain), this is a video still used with attribution, not a
  free-licensed image.

Follow-up cleanup: teach `view.ts` to render `attributionShow` from `title`/`network` natively,
then the extra `name` field is no longer needed.

## Open questions for productionizing

- Transcript → structured recipe: LLM extraction vs. rules. Needs a review/edit gate — the
  transcript names ingredients but not quantities.
- Model size: `base.en` was accurate here; longer/noisier videos may want `small.en`.
- Where the pipeline lives: reuse `spike/import/` batch tooling, or a dedicated importer.
- Licensing/attribution norms for drafting a recipe from someone else's video.
