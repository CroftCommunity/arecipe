#!/usr/bin/env bash
# Spike: pull a PeerTube video, extract audio, transcribe locally with whisper.cpp.
#
# Problem: cooking videos have no written recipe. If we can transcribe the audio we can
# draft a recipe from it AND link the recipe back to the source video as a value-add.
#
# Usage: ./transcribe.sh <peertube-watch-url>
# Deps:  ffmpeg, whisper-cli (brew install whisper-cpp), curl, python3
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
MODEL="$HERE/models/ggml-base.en.bin"
OUT="$HERE/out"
mkdir -p "$OUT"

URL="${1:?usage: transcribe.sh <peertube-watch-url>}"
# PeerTube short id is the last /w/<id> path segment.
SHORT="${URL##*/}"
API="${URL%%/w/*}/api/v1/videos/$SHORT"

echo "== 1. metadata =="
curl -sL "$API" -o "$OUT/meta.json"
python3 - "$OUT/meta.json" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
files=d.get("files") or []
if not files:
    for sp in d.get("streamingPlaylists",[]): files+=sp.get("files",[])
best=max(files,key=lambda f:(f.get("resolution",{}).get("id") or 0))
url=best.get("fileDownloadUrl") or best.get("fileUrl")
open(sys.argv[1]+".dl","w").write(url)
print("  name    :",d.get("name"))
print("  channel :",d.get("channel",{}).get("displayName"))
print("  duration:",d.get("duration"),"s")
print("  media   :",url)
PY
DL="$(cat "$OUT/meta.json.dl")"

echo "== 2. download media =="
curl -sL "$DL" -o "$OUT/video.mp4"
echo "  $(wc -c < "$OUT/video.mp4") bytes"

echo "== 3. extract 16kHz mono wav =="
ffmpeg -y -loglevel error -i "$OUT/video.mp4" -ar 16000 -ac 1 -c:a pcm_s16le "$OUT/audio.wav"

echo "== 4. transcribe (whisper.cpp base.en) =="
whisper-cli -m "$MODEL" -f "$OUT/audio.wav" -otxt -of "$OUT/transcript" -np -nt
echo "  --- transcript ---"
cat "$OUT/transcript.txt"
