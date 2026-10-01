/**
 * Narration → speech. For each clip in narration.json, ElevenLabs text-to-speech *with timestamps*, so every caption
 * phrase gets an exact start/end. Neighbouring clips are passed as previous_text/next_text for even prosody.
 *   ELEVENLABS_API_KEY=… node tts.mjs <outDir> [clipId…]      (behind a proxy: NODE_USE_ENV_PROXY=1)
 * Writes <outDir>/<id>.mp3 and <outDir>/<id>.json ({ duration, chunks: [{ text, start, end }] }).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const key = process.env.ELEVENLABS_API_KEY;
if (!key) throw new Error("set ELEVENLABS_API_KEY");
const [outDir = "out/voice", ...only] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const n = JSON.parse(readFileSync(new URL("./narration.json", import.meta.url), "utf8"));
const spoken = clip => clip.chunks.map(c => c.say ?? c.text).join(" ");

for (const [i, clip] of n.clips.entries()) {
  if (only.length && !only.includes(clip.id)) continue;
  const text = spoken(clip);
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${n.voice}/with-timestamps?output_format=mp3_44100_192`, {
    method: "POST",
    headers: { "xi-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({
      text, model_id: n.model, voice_settings: n.settings,
      previous_text: i > 0 ? spoken(n.clips[i - 1]) : undefined,
      next_text: i < n.clips.length - 1 ? spoken(n.clips[i + 1]) : undefined,
    }),
  });
  if (!res.ok) throw new Error(`${clip.id}: ${res.status} ${await res.text()}`);
  const { audio_base64, alignment } = await res.json();
  writeFileSync(join(outDir, `${clip.id}.mp3`), Buffer.from(audio_base64, "base64"));
  // map each caption chunk to the time span of its spoken characters
  const starts = alignment.character_start_times_seconds, ends = alignment.character_end_times_seconds;
  let offset = 0;
  const chunks = clip.chunks.map(c => {
    const s = c.say ?? c.text;
    let a = offset, b = offset + s.length - 1;
    while (a < b && /\s/.test(text[a])) a++;
    const t = { text: c.text, start: starts[a] ?? 0, end: ends[b] ?? ends[ends.length - 1] };
    offset += s.length + 1;
    return t;
  });
  const duration = ends[ends.length - 1];
  writeFileSync(join(outDir, `${clip.id}.json`), JSON.stringify({ id: clip.id, duration, chunks }, null, 2));
  console.log(`${clip.id.padEnd(12)} ${duration.toFixed(2)}s  ${chunks.map(c => c.start.toFixed(1)).join(" ")}`);
}
