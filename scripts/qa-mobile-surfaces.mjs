/**
 * Mobile sweep across the surfaces someone actually opens on a phone.
 *
 * The drawer was fixed and checked; this widens the question to "is the rest of
 * it usable at 393px" — the staff briefing, the book, a client dashboard, the
 * review screen an advisor publishes from, and the client's own statement.
 * Flags horizontal overflow, which is what makes a phone layout feel broken.
 */
import { spawn } from "child_process";
import fs from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const base = process.env.BASE || "http://127.0.0.1:3000";
const staffToken = process.env.STAFF_TOKEN;
const clientToken = process.env.CLIENT_TOKEN;
const out = "/opt/cursor/artifacts/mobile-check";
fs.mkdirSync(out, { recursive: true });

const dir = fs.mkdtempSync("/tmp/qa-mobsurf-");
const port = 9421;
const chrome = spawn("google-chrome", [
  "--headless=new", "--disable-gpu", "--no-sandbox", `--user-data-dir=${dir}`,
  `--remote-debugging-port=${port}`, "about:blank",
], { stdio: ["ignore", "pipe", "pipe"] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const host = new URL(base).hostname;

const STAFF = [
  ["today", "/today"],
  ["attention", "/portfolio"],
  ["dashboard", "/dash?client=northbridge"],
  ["cash", "/dash/cash?client=northbridge"],
  ["upload", "/upload"],
];

(async () => {
  await sleep(1600);
  const puppeteer = require("puppeteer-core");
  const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${port}` });
  const errors = [];

  const open = async (token) => {
    const page = await browser.newPage();
    await page.setCookie({ name: "ledger_session", value: token, domain: host, path: "/", httpOnly: true });
    await page.setViewport({ width: 393, height: 852, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    page.on("pageerror", (e) => errors.push(String(e.message)));
    return page;
  };

  const check = async (page, name, path) => {
    await page.goto(base + path, { waitUntil: "networkidle0", timeout: 60000 });
    await sleep(900);
    const m = await page.evaluate(() => {
      const doc = document.documentElement;
      // Anything wider than the viewport is what produces a sideways-scrolling phone.
      const wide = [...document.querySelectorAll("body *")]
        .filter((el) => el.getBoundingClientRect().width > window.innerWidth + 2)
        .slice(0, 3)
        .map((el) => `${el.tagName.toLowerCase()}.${(el.className || "").toString().split(" ")[0]}`);
      const tap = [...document.querySelectorAll("a, button")]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && r.height < 28;
        }).length;
      return {
        overflow: doc.scrollWidth - window.innerWidth,
        widest: wide,
        smallTapTargets: tap,
        title: document.querySelector("h1, h2")?.textContent?.trim().slice(0, 40) || null,
      };
    });
    await page.screenshot({ path: `${out}/${name}.png`, fullPage: false });
    const verdict = m.overflow > 2 ? "SCROLLS SIDEWAYS" : "fits";
    console.log(`${name.padEnd(12)} ${verdict.padEnd(17)} overflow ${String(m.overflow).padStart(4)}px  small taps ${String(m.smallTapTargets).padStart(3)}  ${m.widest.join(", ")}`);
    return m;
  };

  const staff = await open(staffToken);
  for (const [name, path] of STAFF) await check(staff, name, path);

  // The review screen: find the period in review and open it as the advisor.
  const reviewPath = process.env.REVIEW_PATH;
  if (reviewPath) await check(staff, "review", reviewPath);

  if (clientToken) {
    const client = await open(clientToken);
    await check(client, "portal", "/portal");
    await check(client, "portal-statement", "/portal/statement");
  }

  console.log("page errors:", errors.length ? errors.slice(0, 4) : "none");
  await browser.disconnect();
  chrome.kill();
})().catch((e) => { console.error("FAIL", e); chrome.kill(); process.exit(1); });
