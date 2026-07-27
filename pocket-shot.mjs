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
    viewport: { width: 402, height: 874 }, // iPhone 16 logical size
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
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

  // Freeze the wall clock at <h>:20 today, before any module runs. performance.now()
  // is untouched, so the frame loop's dt still advances and the sim still runs.
  await page.addInitScript((hour) => {
    const Real = Date;
    const base = new Real();
    base.setHours(hour, 20, 0, 0);
    const fixed = base.getTime();
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

  const s = await page.evaluate(() => ({
    ...window.__pocket.life.stats(),
    perf: document.getElementById("perf").textContent,
    clock: document.getElementById("clock").textContent,
  }));
  console.log(
    `${h}h (${s.clock}) — inside ${s.inside}/${s.target} of ${s.capacity} · ` +
      `parked ${s.carsParked}/${s.stalls} · patio ${s.onPatio}/${s.patioSpots} · ` +
      `outside ${s.outside} · arrivals ${s.arrivals10m} · ${s.perf}`
  );

  const out = `shots/pocket-${h}h.png`;
  await page.screenshot({ path: out });
  console.log("wrote", out);
  await page.close();
}

await browser.close();
console.log(errors.length ? `\n${errors.length} console problem(s)` : "\nno console errors");
