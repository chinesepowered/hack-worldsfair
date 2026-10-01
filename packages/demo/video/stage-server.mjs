/**
 * Serves the video stage and runs the terminal's commands for real: POST /run {cmd, env?, cwd?} streams the
 * command's stdout/stderr back as JSON lines. Also serves the repo's slides.html (the problem slide).
 * Binds 127.0.0.1 only — it executes commands; it is a recording tool, not a server to expose.
 *   node stage-server.mjs            (STAGE_PORT, default 4090)
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const STAGE = new URL("./stage/", import.meta.url).pathname;
const REPO = new URL("../../../", import.meta.url).pathname;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json" };
const body = req => new Promise(r => { let s = ""; req.on("data", d => (s += d)); req.on("end", () => r(s)); });

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (req.method === "POST" && url.pathname === "/run") {
    const { cmd, env = {}, cwd } = JSON.parse(await body(req));
    // stdin is closed, as in a non-interactive shell: nothing waits on it (Claude Code would pause 3 s and warn)
    const child = spawn("bash", ["-c", cmd], { cwd: cwd ?? REPO, env: { ...process.env, NODE_NO_WARNINGS: "1", ...env }, stdio: ["ignore", "pipe", "pipe"] });
    res.writeHead(200, { "content-type": "application/x-ndjson", "cache-control": "no-store" });
    const send = o => res.write(JSON.stringify(o) + "\n");
    child.stdout.on("data", d => send({ out: d.toString() }));
    child.stderr.on("data", d => send({ err: d.toString() }));
    child.on("close", code => { send({ exit: code }); res.end(); });
    return;
  }
  const rel = url.pathname === "/" ? "index.html" : normalize(url.pathname).replace(/^\/+/, "");
  const file = rel === "slides.html" ? join(REPO, "slides.html") : join(STAGE, rel);
  if (!file.startsWith(STAGE) && rel !== "slides.html") { res.writeHead(403); res.end(); return; }
  let data;
  try { data = readFileSync(file); } catch { res.writeHead(404); res.end("not found"); return; }
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  res.end(data);
}).listen(Number(process.env.STAGE_PORT ?? 4090), "127.0.0.1", () => console.log(`stage on http://127.0.0.1:${process.env.STAGE_PORT ?? 4090}`));
