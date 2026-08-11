/** Keyboard checks: "/" opens the palette, and never while you are typing. */
import { spawn } from "child_process";
import fs from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const token = process.env.COOKIE_TOKEN;
const base = process.env.BASE || "http://127.0.0.1:3000";
const dir = fs.mkdtempSync("/tmp/qa-keys-");
const port = 9399;
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
  await page.setViewport({ width: 1440, height: 950 });

  await page.goto(`${base}/today`, { waitUntil: "networkidle0" });
  await sleep(600);
  await page.keyboard.press("Slash");
  await sleep(400);
  console.log("slash opens palette:", await page.evaluate(() => !!document.querySelector(".cmdk-panel")));
  await page.keyboard.press("Escape");
  await sleep(300);

  // In a text field, "/" must be a slash and nothing more.
  await page.goto(`${base}/ask`, { waitUntil: "networkidle0" });
  await sleep(600);
  await page.click("textarea");
  await page.keyboard.type("labor/hours");
  await sleep(400);
  console.log("typing keeps palette shut:", await page.evaluate(() => !document.querySelector(".cmdk-panel")));
  console.log("field kept the slash:", await page.evaluate(() => document.querySelector("textarea")?.value));

  await browser.disconnect();
  chrome.kill();
})().catch((e) => { console.error("FAIL", e); chrome.kill(); process.exit(1); });
