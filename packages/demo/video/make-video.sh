#!/usr/bin/env bash
# Rebuild the demo video from the live system: narration → reset the demo to zero → record → assemble.
#
#   ELEVENLABS_API_KEY=… TEMPO_PK=0x… TEMPO_RECIPIENT=0x… ZCASH_ADDRESS=utest1… packages/demo/video/make-video.sh [outDir]
#
# Needs: the Solana CLI (demo.sh), two zcash-settler instances (payer with testnet funds on :8777, payee viewing-key
# wallet on :8778), ffmpeg (FFMPEG=… if not on PATH), Chromium (CHROME=…), and NODE_USE_ENV_PROXY=1 behind a proxy.
# Voice clips are reused if present — delete <outDir>/voice to regenerate them.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="${1:-$HERE/out}"
: "${TEMPO_PK:?Tempo testnet key for the Tempo agent}" "${TEMPO_RECIPIENT:?payee address on Tempo}" "${ZCASH_ADDRESS:?payee shielded address}"
mkdir -p "$OUT"
[ -f "$OUT/voice/close.json" ] || node "$HERE/tts.mjs" "$OUT/voice"
WAIT_FOR_START=1 INTERVAL_MS=1200 BUDGET_USD=1.5 ZCASH_SETTLER_URL="${ZCASH_SETTLER_URL:-http://127.0.0.1:8778}" ZCASH_WAIT_MS=300000 \
  "$HERE/../demo.sh" reset
sleep 3
VOICE_DIR="$OUT/voice" ZEC_SETTLER="${ZEC_SETTLER:-http://127.0.0.1:8777}" node "$HERE/record.mjs" "$OUT/rec"
node "$HERE/assemble.mjs" "$OUT/rec" "$OUT/voice" "$OUT/sotto-demo.mp4"
echo "→ $OUT/sotto-demo.mp4 (+ .srt)"
