/**
 * Records a short, deterministic demo of the staff shell.
 *
 * Screencasts the real page over CDP while a script performs the interactions,
 * so the clip shows the shipped build rather than a hand-driven session, and
 * comes out the same length every time.
 */
import { spawn, spawnSync } from "child_process";
import fs from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const token = process.env.COOKIE_TOKEN;
const base = process.env.BASE || "http://127.0.0.1:3000";
const out = "/opt/cursor/artifacts/staff-shell";
const frames = fs.mkdtempSync("/tmp/shell-frames-");
fs.mkdirSync(out, { recursive: true });

const dir = fs.mkdtempSync("/tmp/qa-demo-");
const port = 9401;
const chrome = spawn("google-chrome", [
  "--headless=new", "--disable-gpu", "--no-sandbox", `--user-data-dir=${dir}`,
  `--remote-debugging-port=${port}`, "--window-size=1440,900", "about:blank",
], { stdio: ["ignore", "pipe", "pipe"] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await sleep(1600);
  const puppeteer = require("puppeteer-core");
  const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${port}` });
  const page = await browser.newPage();
  await page.setCookie({ name: "ledger_session", value: token, domain: "127.0.0.1", path: "/", httpOnly: true });
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${base}/today`, { waitUntil: "networkidle0" });
  await sleep(900);

  let n = 0;
  const client = await page.createCDPSession();
  client.on("Page.screencastFrame", async ({ data, sessionId }) => {
    fs.writeFileSync(`${frames}/f${String(n++).padStart(5, "0")}.jpg`, Buffer.from(data, "base64"));
    try { await client.send("Page.screencastFrameAck", { sessionId }); } catch {}
  });
  await client.send("Page.startScreencast", { format: "jpeg", quality: 80, everyNthFrame: 1 });

  const hover = async (label) => {
    const el = await page.$(`xpath///span[contains(@class,"staff-rail-text") and text()="${label}"]/..`);
    if (el) { await el.hover(); }
    await sleep(700);
  };

  await sleep(1200);
  for (const label of ["Attention", "Clients", "Upload", "Planning"]) await hover(label);

  // Scroll: the bar compresses, the gold line advances.
  await page.evaluate(() => window.scrollTo({ top: 520, behavior: "smooth" }));
  await sleep(1600);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await sleep(1400);

  // Jump-to on "/".
  await page.keyboard.press("Slash");
  await sleep(900);
  await page.keyboard.type("rec", { delay: 180 });
  await sleep(900);
  await page.keyboard.press("Enter");
  await page.waitForNavigation({ waitUntil: "networkidle0" }).catch(() => {});
  await sleep(1400);

  // Collapse, then expand.
  await page.goto(`${base}/today`, { waitUntil: "networkidle0" });
  await sleep(1000);
  console.log("at", page.url(), "rail:", await page.$(".staff-rail") ? "yes" : "no");
  await page.waitForSelector(".staff-rail-collapse", { timeout: 8000 });
  await page.click(".staff-rail-collapse");
  await sleep(1800);
  await page.click(".staff-rail-collapse");
  await sleep(1400);

  // Attention keeps its client column clear of the rail.
  await page.goto(`${base}/portfolio`, { waitUntil: "networkidle0" });
  await sleep(2000);

  await client.send("Page.stopScreencast");
  await page.setViewport({ width: 430, height: 860 });
  await page.goto(`${base}/today`, { waitUntil: "networkidle0" });
  await sleep(800);
  await client.send("Page.startScreencast", { format: "jpeg", quality: 80, everyNthFrame: 1 });
  await sleep(1200);
  await page.click(".staff-rail-burger");
  await sleep(1800);
  await page.click(".staff-rail-burger");
  await sleep(1400);
  await client.send("Page.stopScreencast");

  await browser.disconnect();
  chrome.kill();

  // Frames arrive only when the page paints, so pace them at a steady rate.
  const list = fs.readdirSync(frames).filter((f) => f.endsWith(".jpg")).sort();
  console.log("frames:", list.length);
  const file = `${out}/staff-shell-demo.mp4`;
  const r = spawnSync("ffmpeg", [
    "-y", "-framerate", "10", "-pattern_type", "glob", "-i", `${frames}/*.jpg`,
    "-vf", "scale=1280:-2:flags=lanczos,format=yuv420p", "-c:v", "libx264",
    "-preset", "slow", "-crf", "30", "-movflags", "+faststart", file,
  ], { encoding: "utf8" });
  if (r.status !== 0) console.error(r.stderr.slice(-800));
  const size = fs.statSync(file).size;
  console.log("wrote", file, (size / 1e6).toFixed(1), "MB");
})().catch((e) => { console.error("FAIL", e); chrome.kill(); process.exit(1); });
