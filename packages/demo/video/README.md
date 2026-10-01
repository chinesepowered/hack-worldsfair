# The demo video, recorded from the live system

`sotto-demo.mp4` is not edited footage. A script drives the real demo and films it:

1. **`tts.mjs`** turns `narration.json` into speech with ElevenLabs (voice *Sapphire*, Multilingual v2), using the
   timestamped endpoint, so every caption phrase gets an exact start and end.
2. **`record.mjs`** opens `stage/index.html` in Chromium and captures it frame by frame (CDP screencast). The stage
   holds the running dashboard, a terminal whose commands really execute (`stage-server.mjs` runs them), Tempo's
   public explorer, and the caption band. Each narration clip is logged when it starts, after the event it
   describes: Capy's payments settle, the policy refuses the seventh, Claude Code answers, the Zcash block lands.
3. **`assemble.mjs`** turns the frames and the log into a 1080p H.264 video, places each clip at its logged
   moment, and writes `.srt` subtitles. The only time compression is the wait for a Zcash block, marked on screen
   as fast-forward while the terminal's timer keeps the real elapsed time.

What is live in the recording: Solana confidential transfers on a local validator (Token-2022 + the ZK ElGamal
proof program), a Tempo payment over MPP on the Moderato testnet, a shielded Zcash payment on testnet, and
Claude Code (headless) paying through `sotto-mcp-server`.

## Rebuild it

```bash
ELEVENLABS_API_KEY=… TEMPO_PK=0x… TEMPO_RECIPIENT=0x… ZCASH_ADDRESS=utest1… NODE_USE_ENV_PROXY=1 \
  FFMPEG=$(command -v ffmpeg) packages/demo/video/make-video.sh          # → packages/demo/video/out/sotto-demo.mp4
```

Prerequisites: the Solana CLI, `zcash-settler serve` for the payer (funded, `:8777`) and the payee (viewing key,
`:8778`), Chromium (`CHROME=…`), ffmpeg, and Claude Code signed in. `PREVIEW=1 node record.mjs out/preview` renders
one still per stage layer without recording. Keys are read from the environment, never from files in the repo.
