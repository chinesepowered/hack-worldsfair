/**
 * Records the demo video from the live system. Playwright drives the stage page; CDP screencast captures every
 * frame with its timestamp; each narration clip is logged at the moment it starts — after the real event it
 * describes (a payment settling, the policy refusing, Claude answering). Nothing on screen is mocked: the
 * terminal runs the commands, the dashboard is the running demo, the explorer is Tempo's.
 *
 *   node record.mjs <outDir>          → <outDir>/frames/*.jpg + <outDir>/timeline.json
 *
 * Before: the demo running from zero (demo.sh reset with WAIT_FOR_START=1, TEMPO_RECIPIENT, ZCASH_*), voice clips
 * from tts.mjs in VOICE_DIR. Env: TEMPO_PK (Tempo testnet key of the Tempo agent), ZEC_SETTLER (payer settler URL),
 * DEMO_DIR (default ~/.sotto-demo), CHROME (Chromium binary), HTTPS_PROXY (if any).
 */
import { chromium } from "playwright-core";
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const OUT = process.argv[2] ?? "out/rec";
const VOICE = process.env.VOICE_DIR ?? "out/voice";
const DEMO = "http://127.0.0.1:4020", AGENT = "http://127.0.0.1:4021", STAGE = "http://127.0.0.1:4090";
const SHOWN = "http://localhost:4020";                       // what the viewer sees typed
const DEMO_DIR = process.env.DEMO_DIR ?? join(homedir(), ".sotto-demo");
const HERE = new URL(".", import.meta.url).pathname;
const BIN = new URL("../../mcp-server/bin", import.meta.url).pathname;
const cfg = JSON.parse(readFileSync(new URL("../demo-solana.json", import.meta.url), "utf8"));
const narration = JSON.parse(readFileSync(new URL("./narration.json", import.meta.url), "utf8"));
const clips = Object.fromEntries(narration.clips.map(c => [c.id, JSON.parse(readFileSync(join(VOICE, `${c.id}.json`), "utf8"))]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const now = () => Date.now() / 1000;

// the CLI agents: same SOTTO_* variables the MCP server reads (the claude entry matches `demo.sh mcp`)
const agentEnv = (id, extra) => ({ PATH: `${BIN}:${process.env.PATH}`, SOTTO_AGENT_ID: id, SOTTO_STATE_DIR: join(DEMO_DIR, "agents", id),
  SOTTO_POLICY: JSON.stringify({ maxPerPaymentUsd: 1, perDayUsd: 5, allowHosts: ["127.0.0.1", "localhost"] }), ...extra });
const claudeEnv = agentEnv("claude", { SOTTO_SOLANA_RPC_URL: cfg.rpcUrl, SOTTO_SOLANA_KEYFILE: join(DEMO_DIR, "agent.json"), SOTTO_SOLANA_NETWORK: cfg.network, SOTTO_SOLANA_MINTS: JSON.stringify([{ mint: cfg.mint, decimals: cfg.decimals }]) });
const tempoEnv = agentEnv("tempo-bot", { SOTTO_TEMPO_PRIVATE_KEY: process.env.TEMPO_PK, NODE_USE_ENV_PROXY: "1" });
const zecEnv = agentEnv("zec-bot", { SOTTO_ZCASH_SETTLER_URL: process.env.ZEC_SETTLER ?? "http://127.0.0.1:8777", SOTTO_ZEC_PRICE_USD: "40" });
if (!process.env.TEMPO_PK) throw new Error("set TEMPO_PK");

// Claude Code gets the sotto MCP server exactly as `demo.sh mcp` prints it
const CLAUDE_DIR = join(OUT, "claude");
mkdirSync(CLAUDE_DIR, { recursive: true });
const mcpText = execFileSync(join(HERE, "..", "demo.sh"), ["mcp"], { encoding: "utf8" });
writeFileSync(join(CLAUDE_DIR, "sotto-mcp.json"), JSON.stringify(JSON.parse(mcpText.slice(0, mcpText.lastIndexOf("}") + 1)), null, 2));
const CLAUDE_CMD = `claude -p "Buy the research report at ${SHOWN}/premium/report and tell me in one sentence what it cost, with the receipt id." --mcp-config sotto-mcp.json --allowedTools mcp__sotto__sotto_fetch`;

// preconditions: Capy waiting at zero
const st = await (await fetch(`${AGENT}/status`)).json();
if (st.started || st.receipts) throw new Error("Capy must be waiting at zero: run demo.sh reset with WAIT_FOR_START=1");

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

// preload: the dashboard and the problem slide, while the title card is up
await ev(u => stage.load("dash", u, { width: 1440, height: 1500 }), DEMO);
const frameBy = async pred => { for (let i = 0; i < 100; i++) { const f = page.frames().find(f => pred(f.url())); if (f) return f; await sleep(100); } throw new Error("frame not found"); };
const dash = await frameBy(u => u.startsWith(DEMO));
await dash.evaluate(() => { window.__fast = setInterval(() => tick(), 1000); });
await ev(() => stage.load("web", "/slides.html#1", { width: 1600, height: 900 }));
const slides = await frameBy(u => u.includes("/slides.html"));
await slides.addStyleTag({ content: "nav{display:none!important}" });
await sleep(2500);                                          // web fonts in both frames

const rect = (frame, sel) => frame.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height }; }, sel);
const camera = (which, r, ms = 1100) => ev(([w, r, ms]) => stage.camera(w, r, ms), [which, r, ms]);
const chapter = (n, t, s) => ev(([n, t, s]) => stage.chapter(n, t, s), [n, t, s]);
const status = t => ev(t => stage.status(t), t);
const show = l => ev(l => stage.show(l), l);
const run = (cmd, opts = {}) => ev(([c, o]) => stage.term.run(c, o), [cmd, opts]);
const T = { clips: [], ff: [], frames: [], start: 0, end: 0 };
async function say(id, { wait = true } = {}) {
  const c = clips[id];
  const t = await ev(ch => stage.captions(ch), c.chunks);
  T.clips.push({ id, t: t / 1000 });
  const done = sleep(c.duration * 1000 + 250);
  if (wait) await done;
  return done;
}
async function click(frame, which, sel) {
  const p = await ev(([w, r]) => stage.toStage(w, r), [which, await rect(frame, sel)]);
  const x = p.x + p.w / 2, y = p.y + p.h / 2;
  await ev(([x, y]) => stage.cursorTo(x, y), [x, y]); await sleep(850);
  await ev(([x, y]) => stage.ring(x, y), [x, y]);
  await frame.locator(sel).first().dispatchEvent("click");
}
async function until(fn, ms = 120_000) { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return; await sleep(250); } throw new Error("timed out waiting"); }
const lastReceipt = id => JSON.parse(readFileSync(join(DEMO_DIR, "agents", id, "receipts.jsonl"), "utf8").trim().split("\n").pop());

// preview: one still per layer, to check the layout before a full take
if (process.env.PREVIEW) {
  const shot = async name => { await sleep(1300); await page.screenshot({ path: join(OUT, `preview-${name}.png`) }); };
  await shot("title");
  await camera("web", null, 0); await show("web"); await chapter("01", "the problem", "today’s x402 payments are public"); await ev(() => stage.captions([{ text: "Today, every x402 payment an agent makes is public:", start: 0, end: 5 }])); await shot("problem");
  await ev(() => stage.term.clear()); await ev(() => stage.term.label("payee: the demo API on :4020")); await show("term"); await status("live · this machine");
  await run(`curl -si localhost:4020/premium/quote | cut -c1-100`, { cps: 400 }); await ev(() => stage.term.highlight("^(HTTP/1.1 402|WWW-Authenticate|PAYMENT-REQUIRED)"));
  await run(`curl -si localhost:4020/premium/quote | grep -o 'method="[a-z-]*"'`, { cps: 400 });
  await run(`curl -si localhost:4020/premium/quote | grep -i ^payment-required | cut -d' ' -f2 | base64 -di | jq -c '.accepts[]|{scheme,network,amount}'`, { cps: 400 });
  await shot("terminal");
  await camera("dash", await rect(dash, ".wrap"), 0); await show("dash"); await chapter("03", "Capy pays", "Solana confidential transfers"); await shot("dash-overview");
  await camera("dash", await rect(dash, ".policy"), 0); await shot("dash-policy");
  await camera("dash", await rect(dash, ".panes .pane:nth-child(3)"), 0); await shot("dash-auditor");
  await show("close"); await chapter("", ""); await status(""); await shot("close");
  await browser.close(); stageServer.kill(); process.exit(0);
}

// capture
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
const mark = label => console.log(`${(now() - T.start).toFixed(1).padStart(6)}s  ${label}`);

try {
  // ── title
  mark("title");
  await sleep(900); await say("title"); await sleep(400);

  // ── 01 the problem (slide 1 of the deck)
  mark("problem");
  await camera("web", null, 0); await show("web"); await chapter("01", "the problem", "today’s x402 payments are public");
  await sleep(500); await say("problem"); await sleep(300);

  // ── 02 one 402, two protocols
  mark("402");
  await ev(() => stage.term.clear()); await ev(() => stage.term.label("payee: the demo API on :4020"));
  await show("term"); await chapter("02", "one 402, two protocols", "x402 + Machine Payments Protocol");
  await status("live · this machine");
  await sleep(500);
  const c1 = run(`curl -si localhost:4020/premium/quote | cut -c1-100`, { cps: 36 });
  await sleep(700); const sChallenge = say("challenge", { wait: false });
  await c1; await ev(() => stage.term.highlight("^(HTTP/1.1 402|WWW-Authenticate|PAYMENT-REQUIRED)"));
  await sleep(900);
  await run(`curl -si localhost:4020/premium/quote | grep -o 'method="[a-z-]*"'`, { cps: 46 });
  await run(`curl -si localhost:4020/premium/quote | grep -i ^payment-required | cut -d' ' -f2 | base64 -di | jq -c '.accepts[]|{scheme,network,amount}'`, { cps: 58 });
  await sChallenge; await sleep(500);

  // ── 03 Capy pays
  mark("capy");
  await camera("dash", await rect(dash, ".wrap"), 0); await show("dash");
  await chapter("03", "Capy pays", "Solana confidential transfers");
  await status("live · Solana local validator");
  await sleep(700);
  await fetch(`${AGENT}/start`, { method: "POST" });
  const sCapy = say("capy", { wait: false });
  await sleep(3800); await camera("dash", await rect(dash, ".policy"));
  await sCapy;
  await until(async () => (await (await fetch(`${AGENT}/status`)).json()).events.some(e => e.kind === "denied"));
  await dash.evaluate(() => tick()); await sleep(500);
  await say("denied"); await sleep(300);

  // ── 04 three viewpoints
  mark("viewpoints");
  await chapter("04", "three viewpoints", "the same six payments");
  await camera("dash", await rect(dash, ".panes .pane:nth-child(1)")); await sleep(1200);
  await say("public");
  await camera("dash", await rect(dash, ".panes .pane:nth-child(2)")); await sleep(1100);
  await say("owner");
  await camera("dash", await rect(dash, ".panes .pane:nth-child(3)")); await sleep(1100);
  const sAud = say("auditor", { wait: false });
  await sleep(2400); await click(dash, "dash", "#aud button");
  await sleep(2200); await click(dash, "dash", "#aud button");
  await sAud; await ev(() => stage.cursorHide()); await sleep(400);

  // ── 05 Claude Code + MCP
  mark("claude");
  await ev(() => stage.term.clear()); await ev(() => stage.term.label("agent: Claude Code with sotto-mcp-server"));
  await show("term"); await chapter("05", "any agent", "Claude Code + the sotto MCP server");
  await status("live · Claude Code, headless");
  await sleep(500);
  const cc = run(CLAUDE_CMD, { cwd: CLAUDE_DIR, cps: 70 });
  await sleep(900); await say("claude");
  await cc; await sleep(300);
  await say("claude-paid"); await sleep(300);

  // ── 06 one kill switch
  mark("kill");
  await chapter("06", "one kill switch", "CLI + Agent Skill, same policy");
  const k1 = run("sotto pause", { env: claudeEnv, cps: 26 });
  await sleep(300); const sKill = say("kill", { wait: false });
  await k1; await sleep(500);
  await run(`sotto fetch ${SHOWN}/premium/report`, { env: claudeEnv, cps: 44 });
  await sKill; await sleep(600);

  // ── 07 Tempo
  mark("tempo");
  await ev(() => stage.term.clear()); await ev(() => stage.term.label("agent: tempo-bot"));
  await chapter("07", "Tempo", "MPP on the Moderato testnet");
  await status("live · Tempo Moderato testnet");
  await ev(() => stage.term.comment("tempo-bot: the same policy engine, paying on Tempo over MPP"));
  const tp = run(`sotto fetch ${SHOWN}/premium/quote`, { env: tempoEnv, cps: 44 });
  await sleep(300); const sTempo = say("tempo", { wait: false });
  await tp;
  const tx = lastReceipt("tempo-bot").transactions[0];
  await ev(u => stage.load("web", u, { width: 1440, height: 900 }), `https://explore.testnet.tempo.xyz/tx/${tx}`);
  const explorer = await frameBy(u => u.includes("explore."));
  await until(async () => (await explorer.evaluate(() => document.body.innerText)).includes("Token Transferred"), 30_000);
  await sleep(600); await camera("web", { x: 185, y: 150, w: 1060, h: 470 }, 0);
  await sTempo;
  await show("web"); await sleep(500);
  await say("tempo-explorer"); await sleep(900);

  // ── 08 Zcash
  mark("zcash");
  await ev(() => stage.term.clear()); await ev(() => stage.term.label("agent: zec-bot"));
  await show("term"); await chapter("08", "Zcash", "shielded · testnet");
  await status("live · Zcash testnet");
  await ev(() => stage.term.comment("zec-bot: paying on Zcash testnet, shielded — the API checks it with a viewing key"));
  const zp = run(`sotto fetch ${SHOWN}/premium/quote`, { env: zecEnv, cps: 44 });
  await sleep(300); await say("zcash");
  let zdone = false; zp.then(() => (zdone = true));
  await sleep(600);
  if (!zdone) {
    await ev(() => stage.badge("⏩ fast-forward · waiting for the next Zcash block"));
    T.ff.push({ a: now(), b: 0 });
    await zp;
    T.ff[T.ff.length - 1].b = now();
    await ev(() => stage.badge(null));
  }
  await sleep(1400);

  // ── 09 one owner, one ledger → close
  mark("close");
  await dash.evaluate(() => tick()); await sleep(400);
  await camera("dash", await rect(dash, ".panes .pane:nth-child(2)"), 0);
  await show("dash"); await chapter("09", "one owner, one ledger", "Solana · Tempo · Zcash");
  await status("live · three chains");
  await sleep(900);
  const sClose = say("close", { wait: false });
  await sleep((clips.close.chunks[1].start - 0.15) * 1000);
  await show("close"); await chapter("", ""); await status("");
  await sClose; await sleep(1800);
  mark("end");
} finally {
  T.end = now();
  await cdp.send("Page.stopScreencast").catch(() => {});
  await sleep(300);
  writeFileSync(join(OUT, "timeline.json"), JSON.stringify(T, null, 1));
  console.log(`frames: ${T.frames.length}, clips: ${T.clips.length}, fast-forward: ${T.ff.length}, length ${(T.end - T.start).toFixed(1)}s`);
  execFileSync(join(BIN, "sotto"), ["resume"], { env: { ...process.env, ...claudeEnv }, stdio: "ignore" });
  await browser.close();
  stageServer.kill();
}
