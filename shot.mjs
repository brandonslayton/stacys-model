/**
 * Headless screenshots of the model, for reviewing changes without a browser.
 *
 *   python serve.py &          # must be running on :8090
 *   node shot.mjs              # all presets, day
 *   node shot.mjs --night      # all presets at night mix 1.0
 *   node shot.mjs --view=game --view=street
 *
 * Writes shots/<view>[-night].png
 */
import { chromium } from "/Users/brand/node_modules/playwright/index.mjs";
import fs from "node:fs";

// Azimuth = which side the camera sits on, so which face you see:
//   90 = +Z street face · 180 = -X mural gable · 270 = -Z patio · 0 = +X south
const VIEWS = {
  game:   { az: 137, el: 42, zoom: 1 },
  street: { az: 90,  el: 12, zoom: 1.25 },
  nw:     { az: 137, el: 18, zoom: 1.1 },
  mural:  { az: 180, el: 12, zoom: 1.3 },
  patio:  { az: 270, el: 30, zoom: 1.15 },
  south:  { az: 20,  el: 20, zoom: 1.15 },
  hip:    { az: 58,  el: 26, zoom: 1.3 },
  top:    { az: 137, el: 78, zoom: 1 },
  // Close-ups on the front-yard Converse landmark. target is world-space; the
  // shoe sits at (shoeX 0.95, yardSurfY 0.2, shoeZ frontZ + 2.0 = 4.15).
  shoe:      { az: 137, el: 42, zoom: 5.2, target: [0.95, 0.75, 4.15] },
  shoeface:  { az: 105, el: 10, zoom: 5.2, target: [0.95, 0.75, 4.15] },
};

const args = process.argv.slice(2);
const night = args.includes("--night");
const picked = args.filter((a) => a.startsWith("--view=")).map((a) => a.slice(7));
const wanted = picked.length ? picked : Object.keys(VIEWS);
const PORT = process.env.PORT || 8090;

fs.mkdirSync("shots", { recursive: true });

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({
  viewport: { width: 1700, height: 1100 },
  deviceScaleFactor: 1,
});
page.on("pageerror", (e) => console.error("PAGEERROR:", e.message));
page.on("console", (m) => m.type() === "error" && console.error("CONSOLE:", m.text()));

await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: "load" });
await page.waitForFunction("window.__ready === true", { timeout: 45000 });
// let fonts + canvas textures settle
await page.waitForTimeout(1200);

// hide the side panel so shots are pure model
await page.addStyleTag({ content: "#panel{display:none!important}" });

if (night) {
  await page.evaluate(() => {
    const n = document.getElementById("night");
    n.value = "1";
    n.dispatchEvent(new Event("input"));
  });
  await page.waitForTimeout(400);
}

// remember the auto model-centre build() picked, so per-view targets can reset
await page.evaluate(() => {
  const t = window.__viewer.view.target;
  window.__autoTarget = [t.x, t.y, t.z];
});

const stats = await page.evaluate(() => ({
  meshes: document.getElementById("s-meshes").textContent,
  tris: document.getElementById("s-tris").textContent,
  mats: document.getElementById("s-mats").textContent,
}));
console.log(`model: ${stats.meshes} meshes · ${stats.tris} tris · ${stats.mats} materials`);

for (const name of wanted) {
  const v = VIEWS[name];
  if (!v) { console.log(`unknown view: ${name}`); continue; }
  await page.evaluate((v) => {
    const view = window.__viewer.view;
    Object.assign(view, v, { target: view.target });
    // views without an explicit target keep the auto model-centre from build()
    const t = v.target || window.__autoTarget;
    view.target.set(t[0], t[1], t[2]);
    window.__viewer.applyCamera();
  }, v);
  await page.waitForTimeout(250);
  const out = `shots/${name}${night ? "-night" : ""}.png`;
  await page.screenshot({ path: out });
  console.log("wrote", out);
}

await browser.close();
