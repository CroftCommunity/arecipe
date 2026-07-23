#!/usr/bin/env bash
# EXP-IMPORT-EXTRACTION · Phase 0 fetch/CORS probe.
#
# For each real recipe URL, records what a browser at the arecipe.app origin would
# face on a direct cross-origin fetch(url, {mode:'cors'}):
#   - the real HTTP status,
#   - whether the DOCUMENT response advertises a permissive Access-Control-Allow-
#     Origin (absence ⇒ the browser blocks the read — dispositive, per the repo's
#     own docs/GITHUB-CORS-PROBE.md house rule),
#   - the content-type.
#
# CORS is browser-enforced, so a server-side curl cannot *exercise* it — but it CAN
# read the advertised headers, and an absent/negative ACAO on the document is a
# guaranteed browser block regardless. A bot-block (403/402) is a SEPARATE obstacle
# that also stops any automated fetch; both cap the URL rung. Output is TSV to
# stdout; redirect into corpus/cors-probe.tsv.
#
# Direct egress (--noproxy '*') is required: the session's agent proxy intercepts
# and would return the proxy's own status, not the site's (same reason the GitHub
# CORS probe used direct egress).
set -u
UA='Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
ORIGIN='https://arecipe.app'

printf 'category\tstatus\tacao\tctype\turl\n'
while IFS=$'\t' read -r category url; do
  [ -z "${category:-}" ] && continue
  case "$category" in \#*) continue;; esac
  hdr=$(curl -sS -m 25 --noproxy '*' -A "$UA" -H "Origin: $ORIGIN" -D - -o /dev/null "$url" 2>/dev/null)
  status=$(printf '%s' "$hdr" | grep -iE '^HTTP/' | tail -1 | awk '{print $2}')
  acao=$(printf '%s' "$hdr" | grep -iE '^access-control-allow-origin:' | head -1 | sed 's/^[^:]*: *//' | tr -d '\r')
  ctype=$(printf '%s' "$hdr" | grep -iE '^content-type:' | head -1 | sed 's/^[^:]*: *//' | tr -d '\r' | cut -d';' -f1)
  printf '%s\t%s\t%s\t%s\t%s\n' "$category" "${status:-ERR}" "${acao:-none}" "${ctype:-?}" "$url"
done < "$(dirname "$0")/corpus/urls.tsv"
