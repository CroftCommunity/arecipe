## arecipe for Android

This is **arecipe as an Android app** — the live [arecipe.app](https://arecipe.app)
rendered full-screen by Chrome as a Trusted Web Activity. It is a thin shell
(a few hundred KB): recipes, sign-in, and every feature are the real site on
the real origin, so **the app's content updates continuously with normal web
deploys**. New APK releases like this one only update the shell itself
(icon, name, packaging) and are occasional.

### Install (sideload)

1. On your Android device, download **`arecipe.apk`** from the assets below.
2. Open the downloaded file. Android will warn that the app comes from
   outside Google Play and ask you to allow installs from your browser
   ("Install unknown apps") — allow it for this install.
3. Tap **Install**, then open **arecipe** from your launcher.

The app shares state with Chrome: if you're signed in to arecipe in Chrome,
the app is too.

### Verify the download (optional)

`SHA256SUMS` in the assets holds the checksum of `arecipe.apk`:

```
sha256sum -c SHA256SUMS
```

### Updates

- **Content** (recipes, pages, features): automatic — it's the live site.
- **Shell** (this APK): install a newer release over this one. Updates must
  be signed with the same key, so only official releases from this page
  will install over an existing copy.

If the app ever opens with browser toolbars visible instead of full-screen,
that's the Trusted Web Activity failing to verify against
`https://arecipe.app/.well-known/assetlinks.json` — check
`docs/ANDROID-APP.md` in the repo for the diagnostic.
