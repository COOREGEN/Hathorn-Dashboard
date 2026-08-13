/**
 * Mobile drawer checks, at the sizes a phone actually gives you.
 *
 * The reported fault was the drawer running under Safari's toolbar so the last
 * destinations could not be reached, plus the page showing through the panel.
 * Chrome cannot reproduce Safari's compositor, but it can prove the drawer is
 * bounded by the visible viewport, scrolls to its last item, paints opaque, and
 * does not let the page scroll underneath.
 */
import { spawn } from "child_process";
import fs from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const token = process.env.COOKIE_TOKEN;
const base = process.env.BASE || "http://127.0.0.1:3000";
const out = "/opt/cursor/artifacts/staff-shell";
fs.mkdirSync(out, { recursive: true });
const dir = fs.mkdtempSync("/tmp/qa-mob-");
const port = 9412;
const chrome = spawn("google-chrome", [
  "--headless=new", "--disable-gpu", "--no-sandbox", `--user-data-dir=${dir}`,
  `--remote-debugging-port=${port}`, "about:blank",
], { stdio: ["ignore", "pipe", "pipe"] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// iPhone 15 portrait, and a short viewport standing in for Safari with both bars.
const SIZES = [["iphone-tall", 393, 852], ["iphone-short", 393, 620], ["small", 360, 560]];

(async () => {
  await sleep(1600);
  const puppeteer = require("puppeteer-core");
  const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${port}` });
  const page = await browser.newPage();
  await page.setCookie({
    name: "ledger_session", value: token, path: "/", httpOnly: true,
    domain: new URL(base).hostname,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message)));

  for (const [name, w, h] of SIZES) {
    await page.setViewport({ width: w, height: h, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await page.goto(`${base}/today`, { waitUntil: "networkidle0" });
    await sleep(600);
    await page.click(".staff-rail-burger");
    await sleep(700);

    const m = await page.evaluate(() => {
      const rail = document.querySelector(".staff-rail");
      const r = rail.getBoundingClientRect();
      const links = [...document.querySelectorAll(".staff-rail-link")];
      const last = links[links.length - 1];
      const cs = getComputedStyle(rail);
      return {
        railBottom: Math.round(r.bottom),
        viewport: window.innerHeight,
        opaqueColour: cs.backgroundColor,
        scrollable: rail.scrollHeight > rail.clientHeight,
        hiddenBelowFold: Math.max(0, Math.round(rail.scrollHeight - rail.clientHeight)),
        lastLabel: last?.textContent?.trim(),
        pageScrollLocked: getComputedStyle(document.body).overflow,
      };
    });

    await page.screenshot({ path: `${out}/mobile-${name}-top.png` });

    // Scroll the drawer to its end and confirm the final destination is on screen.
    const lastVisible = await page.evaluate(() => {
      const rail = document.querySelector(".staff-rail");
      rail.scrollTop = rail.scrollHeight;
      const links = [...document.querySelectorAll(".staff-rail-link")];
      const last = links[links.length - 1].getBoundingClientRect();
      // Scrolled to the end, whatever sits under the close control must be the
      // header rather than a destination whose tap it would swallow.
      const burger = document.querySelector(".staff-rail-burger").getBoundingClientRect();
      const under = document.elementFromPoint(burger.left - 6, burger.top + burger.height / 2);
      return {
        label: links[links.length - 1].textContent.trim(),
        bottom: Math.round(last.bottom),
        viewport: window.innerHeight,
        besideClose: under?.closest(".staff-rail-brand") ? "header" : (under?.className || "?"),
      };
    });
    await sleep(400);
    await page.screenshot({ path: `${out}/mobile-${name}.png` });

    console.log(name.padEnd(14), JSON.stringify({ ...m, lastVisible }));
    console.log("  last item on screen:", lastVisible.bottom <= lastVisible.viewport);
  }

  console.log("errors:", errors.length ? errors : "none");
  await browser.disconnect();
  chrome.kill();
})().catch((e) => { console.error("FAIL", e); chrome.kill(); process.exit(1); });
