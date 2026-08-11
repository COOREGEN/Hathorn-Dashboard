import { spawn } from "child_process";
import fs from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const token = process.env.COOKIE_TOKEN;
const NORTH = process.env.NORTH;
const LAKE = process.env.LAKE;
const out = "/opt/cursor/artifacts/client-intel-ux";
const dir = fs.mkdtempSync("/tmp/qa-ov2-");
const port = 9350;
const chrome = spawn("google-chrome", [
  "--headless=new","--disable-gpu","--no-sandbox",`--user-data-dir=${dir}`,
  `--remote-debugging-port=${port}`,"about:blank"
], { stdio: ["ignore","pipe","pipe"] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(page, name) {
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log("shot", name);
}

async function goto(page, url, w = 1440, h = 1100) {
  await page.setViewport({ width: w, height: h });
  await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });
  await sleep(1200);
}

(async () => {
  await sleep(1500);
  const puppeteer = require("puppeteer-core");
  const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${port}` });
  const page = await browser.newPage();
  await page.setCookie({ name: "ledger_session", value: token, domain: "127.0.0.1", path: "/", httpOnly: true });

  const base = `http://127.0.0.1:3000/dash/overview-v2?client=${NORTH}`;

  // 2. redesigned default 1440
  await goto(page, base, 1440, 1100);
  const meta = await page.evaluate(() => ({
    paper: !!document.querySelector(".ov2-paper"),
    vitals: [...document.querySelectorAll(".ov2-vital")].map((el) => ({
      label: el.querySelector(".ov2-eyebrow")?.textContent,
      value: el.querySelector(".ov2-vital-v")?.textContent,
    })),
    answers: [...document.querySelectorAll(".ov2-answer h3")].map((h) => h.textContent),
    rec: document.querySelector(".ov2-recommend h2")?.textContent,
  }));
  console.log(JSON.stringify(meta, null, 2));
  await shot(page, "02-AFTER-1440-default");

  // 3. metric interaction — click vital
  const vital = await page.$(".ov2-vital");
  if (vital) {
    await vital.click();
    await sleep(500);
    await shot(page, "03-metric-inspect");
  }

  // 4. chart hover — move over chart
  const canvas = await page.$(".ov2-chart-canvas, .ov2-hero-chart, canvas");
  if (canvas) {
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.4);
      await sleep(400);
      await shot(page, "04-chart-hover");
    }
  }

  // 5. driver inspection — open depth then click driver
  await page.keyboard.press("Escape");
  await sleep(200);
  const depthBtn = await page.$("button.ov2-depth-toggle, .ov2-depth-toggle");
  if (depthBtn) {
    await depthBtn.click();
    await sleep(400);
  }
  const driver = await page.$(".ov2-driver-btn");
  if (driver) {
    await driver.click();
    await sleep(400);
    await shot(page, "05-driver-inspect");
  }

  // 6. period switch
  await page.keyboard.press("Escape");
  const periodBtn = await page.$(".ov2-scrub button:not(.on)");
  if (periodBtn) {
    await periodBtn.click();
    await sleep(1500);
    await shot(page, "06-period-switch");
  }

  // 7. advisor commentary / recommendation
  await goto(page, base, 1440, 1100);
  await page.evaluate(() => document.querySelector(".ov2-recommend")?.scrollIntoView({ block: "center" }));
  await sleep(300);
  await shot(page, "07-advisor-recommendation");

  // 8. client-ready state — toggle audience
  const clientToggle = await page.$('button[data-audience="client"], .ov2-audience button:nth-child(2)');
  if (clientToggle) {
    await clientToggle.click();
    await sleep(400);
    await shot(page, "08-client-view");
  }

  // 9. alternate client KPI config — Lakeside
  await goto(page, `http://127.0.0.1:3000/dash/overview-v2?client=${LAKE}`, 1440, 1100);
  const lake = await page.evaluate(() => ({
    title: document.querySelector("h1")?.textContent,
    vitals: [...document.querySelectorAll(".ov2-vital")].map((el) => ({
      label: el.querySelector(".ov2-eyebrow")?.textContent,
      value: el.querySelector(".ov2-vital-v")?.textContent,
    })),
    industry: document.querySelector(".ov2-industry")?.textContent,
  }));
  console.log("lakeside", JSON.stringify(lake, null, 2));
  await shot(page, "09-alternate-lakeside");

  // 10–12 breakpoints
  await goto(page, base, 1024, 900);
  await shot(page, "10-1024");
  await goto(page, base, 768, 900);
  await shot(page, "11-768");
  await goto(page, base, 390, 844);
  await shot(page, "12-390");

  await browser.disconnect();
  chrome.kill();
  console.log("done", fs.readdirSync(out));
})().catch((e) => {
  console.error(e);
  chrome.kill();
  process.exit(1);
});
