/**
 * Capture green-wall workbench for critic loops.
 *   node green-wall-shot.mjs
 * Requires: python serve.py on :8090, playwright at ~/node_modules
 */
import { chromium } from "file:///C:/Users/brand/node_modules/playwright/index.mjs";
import fs from "node:fs";

const PORT = process.env.PORT || 8090;
const outDir = "shots/green-wall-loops";
fs.mkdirSync(outDir, { recursive: true });

const LOOPS = [1, 2, 3, 4];
const VIEWS = ["hero", "close", "angle"];

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 960 },
  deviceScaleFactor: 1,
});
page.on("pageerror", (e) => console.error("PAGEERROR:", e.message));
page.on("console", (m) => {
  if (m.type() === "error") console.error("CONSOLE:", m.text());
});

for (const loop of LOOPS) {
  const url = `http://localhost:${PORT}/green-wall.html?loop=${loop}`;
  console.log("→", url);
  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForFunction("window.__greenWallReady === true", { timeout: 60000 });
  await page.waitForTimeout(1500);
  // hide UI chrome
  await page.addStyleTag({ content: "#panel,#stats{display:none!important}" });

  for (const view of VIEWS) {
    await page.evaluate((v) => window.__setView?.(v), view);
    await page.waitForTimeout(400);
    const path = `${outDir}/loop${loop}-${view}.png`;
    await page.screenshot({ path, type: "png" });
    console.log("  wrote", path);
  }
  // also one with panel for notes
  await page.addStyleTag({ content: "#panel,#stats{display:block!important}" });
  await page.evaluate(() => window.__setView?.("hero"));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${outDir}/loop${loop}-panel.png`, type: "png" });
}

await browser.close();
console.log("done →", outDir);
