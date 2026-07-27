/**
 * Headless capture of pocket.html at phone size, for checking the ambient view
 * without a device.
 *
 *   python serve.py &
 *   node pocket-shot.mjs                 # 2pm + 10pm
 *   node pocket-shot.mjs --hour=3
 *   node pocket-shot.mjs --settle=40     # let the sim run N seconds per hour
 *   node pocket-shot.mjs --url=https://brandonslayton.github.io/stacys-model/pocket.html
 *
 * Writes shots/pocket-<hour>h.png
 *
 * The clock is patched via addInitScript BEFORE the page boots, so seed() fills
 * the room to that hour's target. Patching after boot leaves the occupancy stuck
 * at whatever the real hour produced.
 */
import { chromium } from "/Users/brand/node_modules/playwright/index.mjs";
import fs from "node:fs";

const args = process.argv.slice(2);
const arg = (k, d) => {
  const hit = args.find((a) => a.startsWith(`--${k}=`));
  return hit ? Number(hit.slice(k.length + 3)) : d;
};
const settle = arg("settle", 20);
const hours = args.some((a) => a.startsWith("--hour=")) ? [arg("hour", 22)] : [14, 22];
// Default is iPhone 16 logical size; --w/--h check desktop and landscape layouts
const W = arg("w", 402);
const H = arg("h", 874);
const MOBILE = W < 600;
const PORT = process.env.PORT || 8090;
const urlArg = args.find((a) => a.startsWith("--url="));
const TARGET = urlArg ? urlArg.slice(6) : `http://localhost:${PORT}/pocket.html`;

fs.mkdirSync("shots", { recursive: true });

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

const errors = [];

for (const h of hours) {
  const page = await browser.newPage({
    viewport: { width: W, height: H },
    deviceScaleFactor: MOBILE ? 2 : 1,
    isMobile: MOBILE,
    hasTouch: MOBILE,
  });
  page.on("pageerror", (e) => {
    errors.push(`PAGEERROR: ${e.message}`);
    console.error("PAGEERROR:", e.message);
  });
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") {
      errors.push(`${m.type()}: ${m.text()}`);
      console.error(`CONSOLE ${m.type()}:`, m.text());
    }
  });

  // Freeze the wall clock at <h>:20 PHOENIX time today, before any module runs.
  // The page renders the venue's clock via Intl/America/Phoenix, so the instant has
  // to be built in UTC (Arizona is UTC-7 year-round, no DST) rather than in this
  // machine's local zone — otherwise --hour=22 shows some other hour on the card.
  // performance.now() is untouched, so dt still advances and the sim still runs.
  await page.addInitScript((hour) => {
    const Real = Date;
    // Shift back 7h so the UTC getters read out Phoenix's calendar date. Reading
    // getUTCDate() directly is wrong: after 5pm Phoenix it has already rolled to
    // tomorrow in UTC, which lands the shot on the wrong day and event.
    const phx = new Real(Real.now() - 7 * 3600 * 1000);
    const fixed = Real.UTC(
      phx.getUTCFullYear(),
      phx.getUTCMonth(),
      phx.getUTCDate(),
      hour + 7,
      20,
      0,
      0
    );
    const Patched = new Proxy(Real, {
      construct(target, a) {
        return a.length ? new target(...a) : new target(fixed);
      },
    });
    Patched.now = () => fixed;
    window.Date = Patched;
  }, h);

  await page.goto(TARGET, { waitUntil: "load" });
  await page.waitForFunction("window.__ready === true", { timeout: 60000 });
  await page.waitForTimeout(1500); // fonts + canvas textures
  await page.evaluate(() => window.__pocket.setSpin(false));

  console.log(`${h}h — running sim ${settle}s...`);
  await page.waitForTimeout(settle * 1000);

  const s = await page.evaluate(() => {
    const t = (id) => document.getElementById(id).textContent;
    return {
      ...window.__pocket.life.stats(),
      header: `${t("weekday")} ${t("date")} ${t("clock")} ${t("temp")} [${t("state")}]`,
      wx: document.getElementById("wx-icon").title || "(none)",
      moon: document.getElementById("moon-icon").title,
      event: `${t("ev-when")}: ${t("ev-name")} — ${t("ev-time")}`,
      night: window.__pocket.nightMix?.toFixed?.(2) ?? "?",
      perf: `${window.__pocket.perf.fps} fps · ${window.__pocket.perf.meshes} meshes`,
    };
  });
  console.log(`  header: ${s.header}`);
  console.log(`  wx:     ${s.wx} | moon: ${s.moon} | night mix ${s.night}`);
  console.log(`  event:  ${s.event}`);
  console.log(
    `  sim:    inside ${s.inside}/${s.target} · parked ${s.carsParked}/${s.stalls} · ` +
      `patio ${s.onPatio}/${s.patioSpots} · outside ${s.outside} · ${s.perf}`
  );

  const out = `shots/pocket-${h}h${MOBILE ? "" : `-${W}x${H}`}.png`;
  await page.screenshot({ path: out });
  console.log("wrote", out);
  await page.close();
}

await browser.close();
console.log(errors.length ? `\n${errors.length} console problem(s)` : "\nno console errors");
