/**
 * Recording → video. Frames keep their real timestamps (screencast frames arrive only when the page changes): for
 * every output frame at 30 fps we pick the capture that was on screen at that instant. Each narration clip starts
 * exactly when the recorder logged it, and fast-forward segments (waiting for a Zcash block)
 * are compressed to FF_SECONDS — the terminal's running timer shows the real wait. Captions are already in the
 * frames; demo.srt carries them for players and uploads.
 *   FFMPEG=… node assemble.mjs <recDir> <voiceDir> <out.mp4>
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [REC = "out/rec", VOICE = "out/voice", OUT = "out/demo.mp4"] = process.argv.slice(2);
const FF = process.env.FFMPEG ?? "ffmpeg";
const FF_SECONDS = Number(process.env.FF_SECONDS ?? 3.5);
const T = JSON.parse(readFileSync(join(REC, "timeline.json"), "utf8"));
const t0 = Math.min(T.start, T.frames[0].ts);

// the output clock: real time, minus what fast-forward removes
const segs = T.ff.map(s => ({ a: s.a - t0, b: s.b - t0 })).map(s => ({ ...s, len: Math.min(s.b - s.a, FF_SECONDS) }));
const v = t => {
  let out = t;
  for (const s of segs) {
    if (t >= s.b) out -= (s.b - s.a) - s.len;
    else if (t > s.a) out -= (t - s.a) - (t - s.a) * s.len / (s.b - s.a);
  }
  return out;
};
const end = v(T.end - t0);

// video: a constant 30 fps sequence; output frame k shows the last capture taken at or before k/30 s
const FPS = 30, N = Math.ceil(end * FPS), seq = join(REC, "seq");
rmSync(seq, { recursive: true, force: true }); mkdirSync(seq);
const at = T.frames.map(fr => v(fr.ts - t0));
for (let k = 0, j = 0; k < N; k++) {
  while (j + 1 < at.length && at[j + 1] <= k / FPS) j++;
  symlinkSync(join("..", "frames", T.frames[j].f), join(seq, `${String(k).padStart(6, "0")}.jpg`));
}

// audio: each clip delayed to its logged start
const inputs = [], filters = [];
T.clips.forEach((c, i) => {
  inputs.push("-i", join(VOICE, `${c.id}.mp3`));
  filters.push(`[${i + 1}:a]adelay=delays=${Math.round(v(c.t - t0) * 1000)}:all=1[a${i}]`);
});
const mix = `${T.clips.map((_, i) => `[a${i}]`).join("")}amix=inputs=${T.clips.length}:normalize=0:dropout_transition=0,apad,atrim=0:${end.toFixed(3)},loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[aout]`;
const vf = `[0:v]scale=1920:1080:flags=lanczos,format=yuv420p[vout]`;
execFileSync(FF, ["-hide_banner", "-loglevel", "error", "-y",
  "-framerate", String(FPS), "-i", join(seq, "%06d.jpg"), ...inputs,
  "-filter_complex", [vf, ...filters, mix].join(";"),
  "-map", "[vout]", "-map", "[aout]",
  "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-profile:v", "high", "-r", "30",
  "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", OUT], { stdio: "inherit" });

// captions
const stamp = s => { const ms = Math.max(0, Math.round(s * 1000)); const h = Math.floor(ms / 3.6e6), m = Math.floor(ms / 6e4) % 60, sec = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`; };
const cues = [];
for (const c of T.clips) {
  const clip = JSON.parse(readFileSync(join(VOICE, `${c.id}.json`), "utf8"));
  clip.chunks.forEach((ch, i) => {
    const nextStart = i + 1 < clip.chunks.length ? clip.chunks[i + 1].start : Infinity;
    cues.push({ a: v(c.t - t0 + ch.start), b: v(c.t - t0 + Math.min(ch.end + 0.3, nextStart - 0.02)), text: ch.text });
  });
}
writeFileSync(OUT.replace(/\.mp4$/, ".srt"), cues.map((q, i) => `${i + 1}\n${stamp(q.a)} --> ${stamp(q.b)}\n${q.text}\n`).join("\n"));
console.log(`${OUT}: ${end.toFixed(1)}s, ${T.frames.length} frames, ${T.clips.length} clips, ${segs.length} fast-forward (${segs.map(s => `${(s.b - s.a).toFixed(0)}s→${s.len}s`).join(", ")})`);
