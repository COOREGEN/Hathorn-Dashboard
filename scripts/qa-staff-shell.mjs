/**
 * Visual QA for the staff shell.
 *
 * Screens the rail (expanded, collapsed, mobile drawer), the top bar before and
 * after scroll, and the jump-to palette. Run against a live server; the shell is
 * chrome, so the only honest check is looking at it.
 */
import { spawn } from "child_process";
import fs from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const token = process.env.COOKIE_TOKEN;
const base = process.env.BASE || "http://127.0.0.1:3000";
const out = process.env.OUT || "/opt/cursor/artifacts/staff-shell";
fs.mkdirSync(out, { recursive: true });

const dir = fs.mkdtempSync("/tmp/qa-shell-");
const port = 9366;
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
  await page.setCookie({
    name: "ledger_session", value: token, domain: "127.0.0.1", path: "/", httpOnly: true,
  });

  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

  const goto = async (url, w = 1440, h = 950) => {
    await page.setViewport({ width: w, height: h });
    await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });
    await sleep(900);
  };

  const shot = async (name) => {
    await page.screenshot({ path: `${out}/${name}.png` });
    console.log("shot", name);
  };

  await goto(`${base}/today`);
  const probe = await page.evaluate(() => ({
    rail: !!document.querySelector(".staff-rail"),
    glyphs: document.querySelectorAll(".staff-rail-glyph").length,
    activeLabel: document.querySelector(".staff-rail-link.is-active .staff-rail-text")?.textContent,
    railBg: getComputedStyle(document.querySelector(".staff-rail")).backgroundImage.slice(0, 40),
    topbar: !!document.querySelector(".staff-topbar"),
    crumbs: [...document.querySelectorAll(".topbar-crumb")].map((c) => c.textContent.trim()),
    avatar: document.querySelector(".topbar-avatar")?.textContent,
    glance: [...document.querySelectorAll(".today-glance-cell")].map((c) => ({
      label: c.querySelector("dt")?.textContent,
      value: c.querySelector("dd")?.textContent,
    })),
    greetFont: getComputedStyle(document.querySelector(".today-greeting")).fontFamily,
    greetSize: getComputedStyle(document.querySelector(".today-greeting")).fontSize,
    scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
  }));
  console.log(JSON.stringify(probe, null, 2));
  await shot("01-today-desktop");

  // Scrolled: the bar should compress and the progress line advance.
  await page.evaluate(() => window.scrollTo({ top: 420, behavior: "instant" }));
  await sleep(700);
  const scrolled = await page.evaluate(() => ({
    scrolled: document.documentElement.dataset.scrolled,
    progress: getComputedStyle(document.documentElement).getPropertyValue("--scroll-p").trim(),
    toTop: document.querySelector(".to-top")?.dataset.show,
    barPad: getComputedStyle(document.querySelector(".staff-topbar-inner")).paddingTop,
  }));
  console.log("scrolled:", JSON.stringify(scrolled));
  await shot("02-today-scrolled");

  // Jump-to palette.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.keyboard.down("Control");
  await page.keyboard.press("KeyK");
  await page.keyboard.up("Control");
  await sleep(500);
  await page.keyboard.type("rec");
  await sleep(400);
  const palette = await page.evaluate(() => ({
    open: !!document.querySelector(".cmdk-panel"),
    rows: [...document.querySelectorAll(".cmdk-row-label")].map((r) => r.textContent),
  }));
  console.log("palette:", JSON.stringify(palette));
  await shot("03-jump-to");
  await page.keyboard.press("Escape");
  await sleep(300);

  // Collapsed rail.
  await page.click(".staff-rail-collapse");
  await sleep(600);
  const collapsed = await page.evaluate(() => ({
    attr: document.documentElement.dataset.rail,
    width: getComputedStyle(document.querySelector(".staff-rail")).width,
    labelsHidden: getComputedStyle(document.querySelector(".staff-rail-text")).display,
  }));
  console.log("collapsed:", JSON.stringify(collapsed));
  await shot("04-rail-collapsed");
  await page.click(".staff-rail-collapse");
  await sleep(500);

  // Another dense page, to be sure the chrome holds where content is heavy.
  await goto(`${base}/portfolio`);
  await shot("05-portfolio");
  await goto(`${base}/clients`);
  await shot("06-clients");

  // Mobile drawer.
  await goto(`${base}/today`, 430, 900);
  await shot("07-mobile-closed");
  await page.click(".staff-rail-burger");
  await sleep(700);
  const drawer = await page.evaluate(() => ({
    state: document.documentElement.dataset.railDrawer,
    transform: getComputedStyle(document.querySelector(".staff-rail")).transform,
    scrim: getComputedStyle(document.querySelector(".staff-rail-scrim")).display,
  }));
  console.log("drawer:", JSON.stringify(drawer));
  await shot("08-mobile-drawer");

  console.log("page errors:", errors.length ? errors : "none");
  await browser.disconnect();
  chrome.kill();
})().catch((e) => { console.error("FAIL", e); chrome.kill(); process.exit(1); });
