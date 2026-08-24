/**
 * Pre-demo check: renders the surfaces a demo actually walks through and reports
 * whether each one has content, on desktop and on a phone.
 *
 *   BASE=https://… STAFF_TOKEN=… CLIENT_TOKEN=… node scripts/qa-demo-check.mjs
 */
import { spawn } from "child_process";
import fs from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const base = process.env.BASE || "http://127.0.0.1:3000";
const staffToken = process.env.STAFF_TOKEN;
const clientToken = process.env.CLIENT_TOKEN;
const out = process.env.OUT || "/opt/cursor/artifacts/demo-check";
fs.mkdirSync(out, { recursive: true });
const dir = fs.mkdtempSync("/tmp/qa-demo-");
const port = 9466;
const chrome = spawn("google-chrome", [
  "--headless=new", "--disable-gpu", "--no-sandbox", `--user-data-dir=${dir}`,
  `--remote-debugging-port=${port}`, "about:blank",
], { stdio: ["ignore", "pipe", "pipe"] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const host = new URL(base).hostname;

const CLIENT_PAGES = [
  ["portal-home", "/portal"],
  ["portal-statement", "/portal/statement"],
  ["portal-insights", "/portal/insights"],
  ["portal-reports", "/portal/reports"],
  ["portal-documents", "/portal/documents"],
];
const STAFF_PAGES = [
  ["today", "/today"],
  ["attention", "/portfolio"],
  ["dashboard", "/dash?client=northbridge"],
  ["preview-as-client", "/portal?client=northbridge&preview=1"],
];

(async () => {
  await sleep(1700);
  const puppeteer = require("puppeteer-core");
  const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${port}` });
  const errors = [];
  let bad = 0;

  const open = async (token, w = 1440, h = 950, mobile = false) => {
    const page = await browser.newPage();
    await page.setCookie({ name: "ledger_session", value: token, domain: host, path: "/", httpOnly: true });
    await page.setViewport({ width: w, height: h, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
    page.on("pageerror", (e) => errors.push(String(e.message)));
    return page;
  };

  const check = async (page, name, path, tag = "") => {
    const res = await page.goto(base + path, { waitUntil: "networkidle0", timeout: 60000 });
    await page.evaluateHandle("document.fonts.ready");
    await sleep(700);
    const m = await page.evaluate(() => {
      const txt = document.body.innerText || "";
      return {
        words: txt.trim().split(/\s+/).length,
        figures: (txt.match(/\$[\d,]+(\.\d+)?K?/g) || []).length,
        heading: (document.querySelector("h1, h2")?.textContent || "").trim().slice(0, 44),
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        empty: /nothing published yet|no published|not been shared/i.test(txt),
      };
    });
    const status = res?.status();
    const ok = status === 200 && m.words > 25 && m.overflow <= 2;
    if (!ok) bad++;
    console.log(
      `  ${ok ? "ok  " : "CHECK"} ${String(status).padEnd(3)} ${(name + tag).padEnd(24)}` +
      ` words ${String(m.words).padStart(4)}  figures ${String(m.figures).padStart(3)}` +
      `  overflow ${String(m.overflow).padStart(3)}  ${m.empty ? "[empty state] " : ""}${m.heading}`,
    );
    await page.screenshot({ path: `${out}/${name}${tag}.png` });
  };

  console.log("== As the client (desktop) ==");
  const client = await open(clientToken);
  for (const [n, p] of CLIENT_PAGES) await check(client, n, p);

  console.log("== As the client (phone) ==");
  const clientM = await open(clientToken, 393, 852, true);
  for (const [n, p] of CLIENT_PAGES.slice(0, 2)) await check(clientM, n, p, "-mobile");

  console.log("== As the advisor ==");
  const staff = await open(staffToken);
  for (const [n, p] of STAFF_PAGES) await check(staff, n, p);

  console.log(errors.length ? `page errors: ${errors.slice(0, 4).join(" | ")}` : "page errors: none");
  console.log(bad === 0 && errors.length === 0 ? "VERDICT: ready to demo" : `VERDICT: ${bad} page(s) need a look`);
  await browser.disconnect();
  chrome.kill();
})().catch((e) => { console.error("FAIL", e); chrome.kill(); process.exit(1); });
