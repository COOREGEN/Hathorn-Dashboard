/**
 * Renders the platform guide to PDF and screens it at three widths.
 *
 * The PDF is the artefact that gets emailed, so it is generated from the same
 * HTML rather than maintained separately — the print stylesheet is the design.
 */
import { spawn, spawnSync } from "child_process";
import fs from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const base = process.env.BASE || "http://127.0.0.1:3000";
const out = process.env.OUT || "/opt/cursor/artifacts/guide";
fs.mkdirSync(out, { recursive: true });
const dir = fs.mkdtempSync("/tmp/qa-guide-");
const port = 9445;
const chrome = spawn("google-chrome", [
  "--headless=new", "--disable-gpu", "--no-sandbox", `--user-data-dir=${dir}`,
  `--remote-debugging-port=${port}`, "about:blank",
], { stdio: ["ignore", "pipe", "pipe"] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await sleep(1700);
  const puppeteer = require("puppeteer-core");
  const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${port}` });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message)));
  page.on("requestfailed", (r) => errors.push(`asset failed: ${r.url().slice(0, 70)}`));

  await page.setViewport({ width: 1280, height: 1000 });
  await page.goto(`${base}/guide.html`, { waitUntil: "networkidle0", timeout: 60000 });
  await page.evaluateHandle("document.fonts.ready");
  await sleep(900);

  const probe = await page.evaluate(() => ({
    title: document.title,
    sections: document.querySelectorAll("main section").length,
    tocEntries: document.querySelectorAll("#toc a").length,
    fontDisplay: getComputedStyle(document.querySelector("h1")).fontFamily,
    fontBody: getComputedStyle(document.querySelector("p")).fontFamily,
    tabularFigures: getComputedStyle(document.querySelector(".fig")).fontVariantNumeric,
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    // Every section referenced by the contents list must exist.
    brokenLinks: [...document.querySelectorAll("#toc a")]
      .filter((a) => !document.querySelector(a.getAttribute("href")))
      .map((a) => a.getAttribute("href")),
    words: document.body.innerText.trim().split(/\s+/).length,
  }));
  console.log(JSON.stringify(probe, null, 1));

  await page.screenshot({ path: `${out}/guide-top.png` });
  await page.evaluate(() => document.querySelector("#workflow").scrollIntoView());
  await sleep(700);
  await page.screenshot({ path: `${out}/guide-workflow.png` });
  await page.evaluate(() => document.querySelector("#briefing").scrollIntoView());
  await sleep(700);
  await page.screenshot({ path: `${out}/guide-screens.png` });

  // Interaction: the copy buttons and the expand-all switch.
  await page.evaluate(() => window.scrollTo(0, 0));
  const opened = await page.evaluate(() => {
    document.getElementById("expand").click();
    return [...document.querySelectorAll("details")].filter((d) => d.open).length;
  });
  console.log("details opened by the switch:", opened);

  await page.setViewport({ width: 420, height: 900, isMobile: true, hasTouch: true });
  await page.goto(`${base}/guide.html`, { waitUntil: "networkidle0" });
  await sleep(700);
  const mob = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  console.log("mobile overflow:", mob);
  await page.screenshot({ path: `${out}/guide-mobile.png` });

  // The PDF.
  await page.setViewport({ width: 1280, height: 1000 });
  await page.goto(`${base}/guide.html`, { waitUntil: "networkidle0" });
  await page.evaluateHandle("document.fonts.ready");
  await page.evaluate(() => {
    document.querySelectorAll("details").forEach((d) => { d.open = true; });
  });
  await sleep(600);
  const pdf = `${out}/Hathorn-Dashboard-Guide.pdf`;
  await page.pdf({
    path: pdf, format: "A4", printBackground: true, preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: `<div></div>`,
    footerTemplate: `<div style="width:100%;font-family:'Libre Franklin',sans-serif;font-size:7pt;
      letter-spacing:.14em;text-transform:uppercase;color:#6E675B;padding:0 15mm;
      display:flex;justify-content:space-between;">
      <span>Hathorn Dashboard · Platform Guide</span><span class="pageNumber"></span></div>`,
    margin: { top: "16mm", bottom: "18mm", left: "15mm", right: "15mm" },
  });
  const size = fs.statSync(pdf).size;
  console.log("pdf:", pdf, (size / 1024).toFixed(0), "KB");
  console.log("errors:", errors.length ? errors.slice(0, 5) : "none");

  await browser.disconnect();
  chrome.kill();
})().catch((e) => { console.error("FAIL", e); chrome.kill(); process.exit(1); });
