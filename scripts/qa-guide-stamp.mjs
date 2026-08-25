/** Confirms the guide shows a live address and the date it was true on. */
import { spawn } from "child_process";
import fs from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const base = process.env.BASE || "http://127.0.0.1:3000";
const dir = fs.mkdtempSync("/tmp/qa-stamp-");
const chrome = spawn("google-chrome", [
  "--headless=new", "--disable-gpu", "--no-sandbox", `--user-data-dir=${dir}`,
  "--remote-debugging-port=9478", "about:blank",
], { stdio: ["ignore", "pipe", "pipe"] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await sleep(1800);
  const puppeteer = require("puppeteer-core");
  const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9478" });
  const page = await browser.newPage();
  await page.goto(`${base}/guide.html`, { waitUntil: "networkidle0", timeout: 60000 });
  await sleep(900);
  const out = await page.evaluate(() => ({
    linkText: document.getElementById("link")?.textContent,
    linkHref: document.getElementById("link")?.getAttribute("href"),
    stamp: (document.getElementById("hoststamp")?.textContent || "").trim(),
  }));
  console.log(JSON.stringify(out, null, 1));
  const host = new URL(base).host;
  console.log("link points at this host:", out.linkText?.startsWith(host));
  console.log("dated caveat present:", /Address correct on/.test(out.stamp));
  await browser.disconnect();
  chrome.kill();
})().catch((e) => { console.error("FAIL", e.message); chrome.kill(); process.exit(1); });
