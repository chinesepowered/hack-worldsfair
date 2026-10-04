/**
 * Records the founder video (who, what, why me, why now, the ask) on the same stage as the demo video:
 * on-brand cards, the pitch deck's slides, and the live dashboard screenshot, with narration-intro.json's clips
 * logged as they start so assemble.mjs can lay the voice and captions on exactly.
 *   VOICE_DIR=… node record-intro.mjs <outDir>          → <outDir>/frames + <outDir>/timeline.json
 */
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = process.argv[2] ?? "out/intro";
const VOICE = process.env.VOICE_DIR ?? "out/voice-intro";
const STAGE = "http://127.0.0.1:4090";
const HERE = new URL(".", import.meta.url).pathname;
const narration = JSON.parse(readFileSync(new URL("./narration-intro.json", import.meta.url), "utf8"));
const clips = Object.fromEntries(narration.clips.map(c => [c.id, JSON.parse(readFileSync(join(VOICE, `${c.id}.json`), "utf8"))]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const now = () => Date.now() / 1000;

const capy = w => `<svg viewBox="0 0 140 92" width="${w}" height="${Math.round(w * 92 / 140)}" aria-hidden="true"><rect x="8" y="74" width="124" height="12" rx="2" fill="var(--accent)"/><ellipse cx="60" cy="52" rx="42" ry="24" fill="var(--ink)"/><rect x="82" y="20" width="46" height="42" rx="15" fill="var(--ink)"/><rect x="104" y="36" width="28" height="26" rx="11" fill="var(--ink)"/><circle cx="95" cy="22" r="6.5" fill="var(--ink)"/><path d="M104 35 q4.5 3.5 9 0" stroke="var(--paper)" stroke-width="2.2" fill="none" stroke-linecap="round"/><circle cx="125" cy="46" r="1.9" fill="var(--paper)"/><rect x="30" y="64" width="16" height="12" rx="5" fill="var(--ink)"/><rect x="68" y="64" width="16" height="12" rx="5" fill="var(--ink)"/></svg>`;
const CARDS = {
  hello: `<div class="ic center">${capy(250)}<div class="big" style="font-size:150px">sotto</div><div class="sub">a solo builder · San Francisco · Crypto World's Fair 2026</div></div>`,
  record: `<div class="ic"><div class="kicker">before sotto</div><div class="big">2,000,000</div><div class="line">mainnet transactions a month at peak, from web3 games that grew out of a hackathon project</div></div>`,
  built: `<div class="ic center" style="gap:24px"><div class="kicker">built in three weeks · running end to end</div><img class="shot" src="/img/dashboard.png" style="max-width:860px" alt=""><div class="chips"><span>Solana · confidential transfers</span><span>Tempo · MPP</span><span>Zcash · NU7 testnet</span><span>x402 · MCP · Agent Skill</span></div></div>`,
  whyme: `<div class="ic"><div class="kicker">why me</div><div class="rows">
      <div><b>shipped</b><span>A hackathon project that became web3 games with up to 2M mainnet transactions a month</span></div>
      <div><b>fast</b><span>sotto in three weeks, solo with Claude Code: SDK, MCP server, Agent Skill, Rust Zcash service</span></div>
      <div><b>live</b><span>Working end to end on Solana, Tempo and Zcash, already on the NU7 testnet</span></div></div></div>`,
  whynow: `<div class="ic"><div class="kicker">why now</div><div class="rows">
      <div><b>June 2026</b><span>Solana's confidential transfers are back on mainnet, and almost unused</span></div>
      <div><b>agents pay</b><span>x402, the Machine Payments Protocol and MCP are how agents are starting to pay</span></div>
      <div><b>the gap</b><span>The rails are ready. Nobody has laid them for agents.</span></div></div></div>`,
  ask: `<div class="ic center" style="gap:18px">${capy(190)}<div class="big" style="font-size:124px">sotto</div><div class="line">Confidential, not anonymous.</div>
      <div class="rows" style="max-width:940px;text-align:left;margin-top:8px"><div><b>the ask</b><span>The accelerator, and a first design partner whose agents buy data</span></div></div>
      <div class="sub" style="margin-top:10px">github.com/chinesepowered/hack-worldsfair · demo: youtube.com/watch?v=4qkV0ExM-Z8</div></div>`,
};

rmSync(join(OUT, "frames"), { recursive: true, force: true });
mkdirSync(join(OUT, "frames"), { recursive: true });
const stageServer = spawn("node", [join(HERE, "stage-server.mjs")], { stdio: "inherit" });
await sleep(800);
const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  ...(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: "127.0.0.1,localhost" } } : {}),
  args: ["--ignore-certificate-errors", "--hide-scrollbars", "--font-render-hinting=none"],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 4 / 3, colorScheme: "light" });
const page = await ctx.newPage();
const ev = (fn, arg) => page.evaluate(fn, arg);
await page.goto(STAGE, { waitUntil: "load" });
await ev(() => document.fonts.ready.then(() => true));
await ev(() => stage.load("web", "/slides.html#1", { width: 1600, height: 900 }));
let slides; for (let i = 0; i < 100 && !slides; i++) { slides = page.frames().find(f => f.url().includes("/slides.html")); if (!slides) await sleep(100); }
await slides.addStyleTag({ content: "nav{display:none!important}" });
await ev(() => stage.card(""));                                          // warm the card layer
await ev(() => { const i = new Image(); i.src = "/img/dashboard.png"; return i.decode(); });
await ev(() => stage.show("title"));
await sleep(2000);

const T = { clips: [], ff: [], frames: [], start: 0, end: 0 };
const chapter = (n, t, s) => ev(([n, t, s]) => stage.chapter(n, t, s), [n, t, s]);
const card = id => ev(h => stage.card(h), CARDS[id]);
async function say(id) {
  const c = clips[id];
  const t = await ev(ch => stage.captions(ch), c.chunks);
  T.clips.push({ id, t: t / 1000 });
  await sleep(c.duration * 1000 + 250);
}

const cdp = await ctx.newCDPSession(page);
let n = 0;
cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
  const f = `f${String(++n).padStart(6, "0")}.jpg`;
  writeFileSync(join(OUT, "frames", f), Buffer.from(data, "base64"));
  T.frames.push({ f, ts: metadata.timestamp });
  cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
});
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
T.start = now();

try {
  await card("hello"); await chapter("01", "who", "the builder behind sotto");
  await sleep(900); await say("hello"); await sleep(300);
  await card("record"); await sleep(700); await say("record"); await sleep(400);

  await ev(() => stage.camera("web", null, 0)); await ev(() => stage.show("web"));
  await chapter("02", "what I'm building", "payments for AI agents");
  await sleep(600); await say("problem"); await sleep(300);
  await slides.evaluate(() => show(1)); await sleep(700);
  await say("product"); await sleep(300);
  await card("built"); await sleep(700); await say("built"); await sleep(400);

  await card("whyme"); await chapter("03", "why me", ""); await sleep(700); await say("whyme"); await sleep(150); await say("whyme-built"); await sleep(400);
  await card("whynow"); await chapter("04", "why now", ""); await sleep(700); await say("whynow"); await sleep(400);
  await card("ask"); await chapter("05", "the ask", ""); await sleep(700); await say("ask"); await sleep(1800);
} finally {
  T.end = now();
  await cdp.send("Page.stopScreencast").catch(() => {});
  await sleep(300);
  writeFileSync(join(OUT, "timeline.json"), JSON.stringify(T, null, 1));
  console.log(`frames: ${T.frames.length}, clips: ${T.clips.length}, length ${(T.end - T.start).toFixed(1)}s`);
  await browser.close();
  stageServer.kill();
}
