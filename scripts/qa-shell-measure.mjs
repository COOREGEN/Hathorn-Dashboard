/** Geometry probe — where the canvas actually starts on dense staff pages. */
import { spawn } from "child_process";
import fs from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const token = process.env.COOKIE_TOKEN;
const base = process.env.BASE || "http://127.0.0.1:3000";
const dir = fs.mkdtempSync("/tmp/qa-measure-");
const port = 9377;
const chrome = spawn("google-chrome", [
  "--headless=new", "--disable-gpu", "--no-sandbox", `--user-data-dir=${dir}`,
  `--remote-debugging-port=${port}`, "about:blank",
], { stdio: ["ignore", "pipe", "pipe"] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await sleep(1600);
  const puppeteer = require("puppeteer-core");
  const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${port}` });
  const page = await browser.newPage();
  await page.setCookie({ name: "ledger_session", value: token, domain: "127.0.0.1", path: "/", httpOnly: true });

  for (const path of ["/portfolio", "/clients", "/today", "/exceptions"]) {
    await page.setViewport({ width: 1440, height: 950 });
    await page.goto(base + path, { waitUntil: "networkidle0", timeout: 60000 });
    await sleep(500);
    const m = await page.evaluate(() => {
      const main = document.querySelector("main");
      const rail = document.querySelector(".staff-rail");
      const bar = document.querySelector(".staff-topbar-inner");
      const firstCell = document.querySelector(".book-row > *, table td, .today-greeting");
      const r = (el) => el ? (({ x, width }) => ({ x: Math.round(x), width: Math.round(width) }))(el.getBoundingClientRect()) : null;
      return {
        docScrollWidth: document.documentElement.scrollWidth,
        viewport: window.innerWidth,
        railWidth: rail ? Math.round(rail.getBoundingClientRect().width) : null,
        mainOwner: main?.parentElement?.className || main?.parentElement?.tagName,
        mainMarginLeft: main ? getComputedStyle(main).marginLeft : null,
        main: r(main),
        topbar: r(bar),
        firstCell: r(firstCell),
      };
    });
    console.log(path, JSON.stringify(m));
  }

  await browser.disconnect();
  chrome.kill();
})().catch((e) => { console.error("FAIL", e); chrome.kill(); process.exit(1); });
