/**
 * Dump a canvas texture from stacys.js straight to a PNG, flat and undistorted.
 * Far easier to compare against a reference photo than a 3D render.
 *
 *   python serve.py &
 *   node tex.mjs mural        -> shots/tex-mural.png
 *   node tex.mjs sign cmu diamond
 */
import { chromium } from "/Users/brand/node_modules/playwright/index.mjs";
import fs from "node:fs";

const FNS = {
  mural: "makeStacysWingsMuralTexture",
  sign: "makeStacysSignTexture",
  diamond: "makeStacysDiamondLogoTexture",
  cmu: "makeCmuBlockTexture",
};

const wanted = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const list = wanted.length ? wanted : ["mural"];
const PORT = process.env.PORT || 8090;

fs.mkdirSync("shots", { recursive: true });
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.error("PAGEERROR:", e.message));

await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: "load" });
await page.waitForFunction("window.__ready === true", { timeout: 45000 });
await page.waitForTimeout(800); // fonts

for (const key of list) {
  const fn = FNS[key];
  if (!fn) { console.log("unknown texture:", key); continue; }
  const res = await page.evaluate(async ({ fn }) => {
    const mod = await import("./js/stacys.js");
    if (typeof mod[fn] !== "function") return { err: `${fn} is not exported` };
    // makeCmuBlockTexture needs colors; the rest take none
    const tex =
      fn === "makeCmuBlockTexture"
        ? mod[fn](0xa89a5c, 0x8e8148, 0xb8a860)
        : mod[fn]();
    const img = tex.image || tex.source?.data;
    if (!img?.toDataURL) return { err: "texture has no canvas" };
    return { url: img.toDataURL("image/png"), w: img.width, h: img.height };
  }, { fn });
  if (res.err) { console.log(key, "->", res.err); continue; }
  const out = `shots/tex-${key}.png`;
  fs.writeFileSync(out, Buffer.from(res.url.split(",")[1], "base64"));
  console.log(`wrote ${out}  (${res.w}x${res.h})`);
}

await browser.close();
