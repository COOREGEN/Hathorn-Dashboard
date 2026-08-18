/** Sweep the other surfaces so the shell change is not judged on one page. */
import { spawn } from "child_process";
import fs from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const token = process.env.COOKIE_TOKEN;
const base = process.env.BASE || "http://127.0.0.1:3000";
const out = "/opt/cursor/artifacts/staff-shell";
fs.mkdirSync(out, { recursive: true });
const dir = fs.mkdtempSync("/tmp/qa-sweep-");
const port = 9388;
const chrome = spawn("google-chrome", [
  "--headless=new", "--disable-gpu", "--no-sandbox", `--user-data-dir=${dir}`,
  `--remote-debugging-port=${port}`, "about:blank",
], { stdio: ["ignore", "pipe", "pipe"] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const DEFAULT_PAGES = [
  ["dash", "/dash"],
  ["upload", "/upload"],
  ["ask", "/ask"],
  ["exceptions", "/exceptions"],
  ["intelligence", "/intelligence"],
  ["firm", "/firm"],
  ["admin", "/admin"],
];
// PAGES="name=/path,name=/path" to sweep a different set.
const PAGES = process.env.PAGES
  // Split on the first "=" only: query strings carry their own.
  ? process.env.PAGES.split(",").map((p) => [p.slice(0, p.indexOf("=")), p.slice(p.indexOf("=") + 1)])
  : DEFAULT_PAGES;

(async () => {
  await sleep(1600);
  const puppeteer = require("puppeteer-core");
  const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${port}` });
  const page = await browser.newPage();
  await page.setCookie({ name: "ledger_session", value: token, domain: "127.0.0.1", path: "/", httpOnly: true });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message)));

  for (const [name, path] of PAGES) {
    await page.setViewport({ width: 1440, height: 950 });
    await page.goto(base + path, { waitUntil: "networkidle0", timeout: 60000 });
    await sleep(700);
    const m = await page.evaluate(() => {
      const rail = document.querySelector(".staff-rail");
      const first = document.querySelector("main, .sheet");
      const r = first?.getBoundingClientRect();
      return {
        rails: document.querySelectorAll(".staff-rail").length,
        bodyPad: getComputedStyle(document.body).paddingLeft,
        contentX: r ? Math.round(r.x) : null,
        railW: rail ? Math.round(rail.getBoundingClientRect().width) : 0,
        overflow: document.documentElement.scrollWidth - window.innerWidth,
      };
    });
    console.log(name.padEnd(14), JSON.stringify(m));
    await page.screenshot({ path: `${out}/sweep-${name}.png` });
  }

  console.log("errors:", errors.length ? errors : "none");
  await browser.disconnect();
  chrome.kill();
})().catch((e) => { console.error("FAIL", e); chrome.kill(); process.exit(1); });
