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

## Run

```bash
brew install whisper-cpp                          # provides whisper-cli
cd tools/video-transcript
# base.en model (~148MB) lands in models/ on first run of transcribe.sh
./transcribe.sh "https://video.infosec.exchange/w/5uxXvy3MtAnPGUT2cMH6LX"
node build-recipe.mjs                             # -> out/recipe.json
node publish-video-recipe.mjs --dry-run           # preview the record; drop --dry-run to publish
node attach-video-image.mjs --dry-run             # attach out/frame.png as the recipe image
```

`models/` and `out/` are gitignored (regenerable). The transcript this produced is captured
below for provenance.

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

## Published (2026-07-10)

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
