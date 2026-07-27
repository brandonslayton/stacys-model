/**
 * viewer.js — model workbench for the Stacy's @ Melrose build.
 *
 * Deliberately mirrors the parent game's presentation so what you see here is
 * what lands on the map:
 *   - orthographic camera, default azimuth 137 / elevation 42
 *     (Melrose Rising scene.js uses camOffset (-26, 32, 24) -> the same angles)
 *   - same three-light rig: hemisphere + warm directional sun + pink fill
 *   - same night driver: group.userData.setNight(t) / tickNight(now)
 *
 * Nothing in here belongs in the game. Model changes go in stacys.js.
 */
import * as THREE from "three";
import { ensureSignFonts } from "./kit.js";

const $ = (id) => document.getElementById(id);
const canvas = $("stage");
const errBox = $("err");

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  preserveDrawingBuffer: true, // needed for Save PNG
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();

// ---------------------------------------------------------------- lighting
// Matches Melrose Rising scene.js _setupLights so night/day reads identically.
const ambient = new THREE.AmbientLight(0xfff2e4, 0.62);
scene.add(ambient);
const hemi = new THREE.HemisphereLight(0xc8e0f5, 0xb89868, 0.48);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d0, 1.12);
sun.position.set(24, 48, 18);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, {
  near: 1, far: 140, left: -24, right: 24, top: 24, bottom: -24,
});
sun.shadow.bias = -0.0008;
scene.add(sun);
const fill = new THREE.DirectionalLight(0xffa0c0, 0.18);
fill.position.set(-20, 15, -10);
scene.add(fill);
const nightGlow = new THREE.DirectionalLight(0x8866ff, 0);
nightGlow.position.set(10, 20, -15);
scene.add(nightGlow);

// ---------------------------------------------------------------- ground
const groundMat = new THREE.MeshStandardMaterial({ color: 0x8a7a62, roughness: 1 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.03;
ground.receiveShadow = true;
scene.add(ground);

const helpers = new THREE.Group();
helpers.visible = false;
helpers.add(new THREE.GridHelper(40, 40, 0x5a4a7a, 0x2e2740));
helpers.add(new THREE.AxesHelper(6));
scene.add(helpers);

// ---------------------------------------------------------------- camera
const view = { az: 137, el: 42, zoom: 1, span: 20, target: new THREE.Vector3() };
let ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, -400, 800);
let persp = new THREE.PerspectiveCamera(32, 1, 0.5, 900);
let camera = ortho;

function applyCamera() {
  const aspect = innerWidth / innerHeight;
  const span = view.span / view.zoom;
  const azr = (view.az * Math.PI) / 180;
  const elr = (view.el * Math.PI) / 180;
  const dist = camera === ortho ? 120 : span * 1.7;
  const off = new THREE.Vector3(
    Math.cos(azr) * Math.cos(elr),
    Math.sin(elr),
    Math.sin(azr) * Math.cos(elr)
  ).multiplyScalar(dist);

  ortho.left = (-span * aspect) / 2;
  ortho.right = (span * aspect) / 2;
  ortho.top = span / 2;
  ortho.bottom = -span / 2;
  ortho.updateProjectionMatrix();
  persp.aspect = aspect;
  persp.updateProjectionMatrix();

  camera.position.copy(view.target).add(off);
  camera.lookAt(view.target);

  // keep the shadow frustum centred on the model
  sun.position.set(view.target.x + 24, 48, view.target.z + 18);
  sun.target.position.copy(view.target);
  sun.target.updateMatrixWorld();
  scene.add(sun.target);
}

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  applyCamera();
}
addEventListener("resize", resize);

// ---------------------------------------------------------------- model
let model = null;
let buildCount = 0;

async function build() {
  errBox.hidden = true;
  try {
    await ensureSignFonts();
    // cache-bust so edits to stacys.js land without a page reload
    const mod = await import(`./stacys.js?v=${Date.now()}`);
    if (model) {
      scene.remove(model);
      model.traverse((o) => {
        if (!o.isMesh) return;
        o.geometry?.dispose();
        const m = o.material;
        (Array.isArray(m) ? m : [m]).forEach((x) => {
          x?.map?.dispose?.();
          x?.emissiveMap?.dispose?.();
          x?.dispose?.();
        });
      });
    }
    model = mod.createStacys({ id: "stacys" });
    scene.add(model);

    // Frame it: recentre on the model's own bounds, size the ortho span
    const bb = new THREE.Box3().setFromObject(model);
    const size = bb.getSize(new THREE.Vector3());
    const c = bb.getCenter(new THREE.Vector3());
    view.target.set(c.x, size.y * 0.32, c.z);
    view.span = Math.max(size.x, size.z, size.y) * 1.15;

    applyGameScale();
    applyWire();
    applyShadows();
    applyNight();
    measure();
    buildCount++;
    applyCamera();
  } catch (e) {
    errBox.hidden = false;
    errBox.textContent = `Build failed (${e.name})\n\n${e.message}\n\n${e.stack || ""}`;
    console.error(e);
  }
}

// ---------------------------------------------------------------- stats
function measure() {
  if (!model) return;
  let meshes = 0, tris = 0;
  const mats = new Set(), geos = new Set();
  model.traverse((o) => {
    if (!o.isMesh) return;
    meshes++;
    const g = o.geometry;
    geos.add(g.uuid);
    (Array.isArray(o.material) ? o.material : [o.material]).forEach(
      (m) => m && mats.add(m.uuid)
    );
    tris += g.index ? g.index.count / 3 : (g.attributes.position?.count ?? 0) / 3;
  });
  const fmt = (n) => n.toLocaleString("en-US");
  $("s-meshes").textContent = fmt(meshes);
  $("s-tris").textContent = fmt(Math.round(tris));
  $("s-mats").textContent = fmt(mats.size);
  $("s-geos").textContent = fmt(geos.size);

  const calls = renderer.info.render.calls;
  $("s-calls").textContent = fmt(calls);
  for (const [id, bad] of [["s-meshes", meshes > 400], ["s-mats", mats.size > 200]]) {
    $(id).className = bad ? "warn" : "good";
  }
  $("cost-note").textContent =
    `${fmt(Math.round(tris))} triangles is trivial for any GPU; ` +
    `${fmt(meshes)} draw calls is the real cost. ` +
    `Merging static opaque geometry by color would cut this to roughly ` +
    `${Math.max(8, mats.size > 40 ? 25 : 12)}.`;
}

// ---------------------------------------------------------------- controls
let drag = null;
canvas.addEventListener("pointerdown", (e) => {
  drag = { x: e.clientX, y: e.clientY, pan: e.shiftKey || e.button === 1 };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x;
  const dy = e.clientY - drag.y;
  drag.x = e.clientX;
  drag.y = e.clientY;
  if (drag.pan) {
    const s = view.span / view.zoom / innerHeight;
    const azr = (view.az * Math.PI) / 180;
    // screen-right and screen-forward in world XZ
    view.target.x += (-dx * Math.sin(azr) * -1 - dy * Math.cos(azr)) * s;
    view.target.z += (dx * Math.cos(azr) * -1 - dy * Math.sin(azr)) * s;
  } else {
    view.az = (view.az - dx * 0.4 + 360) % 360;
    view.el = Math.max(2, Math.min(89, view.el + dy * 0.3));
    syncInputs();
  }
  applyCamera();
});
addEventListener("pointerup", () => (drag = null));
canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    view.zoom = Math.max(0.3, Math.min(4, view.zoom * (e.deltaY > 0 ? 0.92 : 1.087)));
    syncInputs();
    applyCamera();
  },
  { passive: false }
);

// ---------------------------------------------------------------- presets
// Camera offset is (cos az * cos el, sin el, sin az * cos el), so the azimuth
// says which side the camera sits on — and therefore which face you see:
//   az 90  -> +Z, the 7th Ave street face      az 180 -> -X, the north mural gable
//   az 270 -> -Z, the rear patio               az 0   -> +X, the south flank
// The game itself uses camOffset (-26, 32, 24) = az 137 / el 42.
const PRESETS = [
  { label: "Game", az: 137, el: 42, zoom: 1 },
  { label: "Street", az: 90, el: 12, zoom: 1.25 },
  { label: "NW corner", az: 137, el: 18, zoom: 1.1 },
  { label: "Mural", az: 180, el: 12, zoom: 1.3 },
  { label: "Patio", az: 270, el: 30, zoom: 1.15 },
  { label: "South", az: 20, el: 20, zoom: 1.15 },
  { label: "Top", az: 137, el: 78, zoom: 1 },
];
const presetBox = $("presets");
PRESETS.forEach((p) => {
  const b = document.createElement("button");
  b.textContent = p.label;
  b.onclick = () => {
    Object.assign(view, { az: p.az, el: p.el, zoom: p.zoom });
    syncInputs();
    applyCamera();
    [...presetBox.children].forEach((c) => c.classList.toggle("on", c === b));
  };
  presetBox.appendChild(b);
});
presetBox.firstChild.classList.add("on");

// ---------------------------------------------------------------- reference
const REFS = [
  { label: "Off", src: "" },
  { label: "Street", src: "refs/IMG_0628.jpeg" },
  { label: "NW", src: "refs/IMG_0632.jpeg" },
  { label: "Mural", src: "refs/IMG_0633.jpeg" },
  { label: "Porch", src: "refs/IMG_0634.jpeg" },
  { label: "Roof", src: "refs/Screenshot-2026-07-25-roof.png" },
];
const refImg = $("ref-img");
const refBox = $("refs");
REFS.forEach((r, i) => {
  const b = document.createElement("button");
  b.textContent = r.label;
  b.onclick = () => {
    if (!r.src) refImg.hidden = true;
    else {
      refImg.src = r.src;
      refImg.hidden = false;
      refImg.style.opacity = $("ref-op").value;
    }
    [...refBox.children].forEach((c) => c.classList.toggle("on", c === b));
  };
  refBox.appendChild(b);
  if (i === 0) b.classList.add("on");
});
$("ref-op").oninput = (e) => {
  refImg.style.opacity = e.target.value;
  $("ref-op-out").textContent = (+e.target.value).toFixed(2);
};
$("ref-front").onchange = (e) => refImg.classList.toggle("front", e.target.checked);

// ---------------------------------------------------------------- night
function hourLabel(h) {
  const hh = Math.floor(h) % 24;
  const mm = Math.floor((h % 1) * 60);
  const ap = hh < 12 ? "AM" : "PM";
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${String(mm).padStart(2, "0")} ${ap}`;
}
// Same curve as builders.js nightFactorFromHour, kept local so the slider can
// drive the model without importing game state.
function nightFromHour(hour) {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 17 && h < 20) return ((h - 17) / 3) * 0.55;
  if (h >= 20 || h < 6) return h >= 20 ? Math.min(1, 0.55 + (h - 20) / 3) : 1;
  if (h >= 6 && h < 7.5) return 1 - (h - 6) / 1.5;
  return 0;
}

function applyNight() {
  const t = +$("night").value;
  // Scene lighting follows the same ramp the game uses
  ambient.intensity = 0.62 - 0.34 * t;
  hemi.intensity = 0.48 - 0.3 * t;
  sun.intensity = 1.12 * (1 - t) + 0.04;
  fill.intensity = 0.18 + 0.1 * t;
  nightGlow.intensity = 0.55 * t;
  const sky = new THREE.Color(0x8ec0e0).lerp(new THREE.Color(0x14182a), t);
  scene.background = sky;
  groundMat.color.setHex(0x8a7a62).lerp(new THREE.Color(0x241f33), t * 0.85);
  model?.userData?.setNight?.(t);
  $("night-out").textContent = t.toFixed(2);
}

$("hour").oninput = (e) => {
  const h = +e.target.value;
  $("hour-out").textContent = hourLabel(h);
  $("night").value = nightFromHour(h).toFixed(2);
  applyNight();
};
$("night").oninput = applyNight;

// ---------------------------------------------------------------- toggles
function applyWire() {
  const on = $("wire").checked;
  model?.traverse((o) => {
    if (o.isMesh) {
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
        if (m) m.wireframe = on;
      });
    }
  });
}
function applyShadows() {
  renderer.shadowMap.enabled = $("shadows").checked;
  model?.traverse((o) => {
    if (o.isMesh) o.material.needsUpdate = true;
  });
}
function applyGameScale() {
  // createBuilding() in the parent game multiplies Stacy's by 1.22 for map read
  model?.scale.setScalar($("gamescale").checked ? 1.22 : 1);
}
$("wire").onchange = applyWire;
$("shadows").onchange = applyShadows;
$("grid").onchange = (e) => (helpers.visible = e.target.checked);
$("gamescale").onchange = applyGameScale;
$("ortho").onchange = (e) => {
  camera = e.target.checked ? ortho : persp;
  applyCamera();
};

// ---------------------------------------------------------------- sliders
function syncInputs() {
  $("az").value = Math.round(view.az);
  $("el").value = Math.round(view.el);
  $("zoom").value = view.zoom.toFixed(2);
  $("az-out").textContent = `${Math.round(view.az)}°`;
  $("el-out").textContent = `${Math.round(view.el)}°`;
  $("zoom-out").textContent = `${view.zoom.toFixed(2)}×`;
}
$("az").oninput = (e) => { view.az = +e.target.value; syncInputs(); applyCamera(); };
$("el").oninput = (e) => { view.el = +e.target.value; syncInputs(); applyCamera(); };
$("zoom").oninput = (e) => { view.zoom = +e.target.value; syncInputs(); applyCamera(); };

// ---------------------------------------------------------------- actions
$("rebuild").onclick = build;
$("snap").onclick = () => {
  renderer.render(scene, camera);
  const a = document.createElement("a");
  a.download = `stacys-${Math.round(view.az)}-${Math.round(view.el)}.png`;
  a.href = canvas.toDataURL("image/png");
  a.click();
};
addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") return;
  if (e.key === "r" || e.key === "R") build();
  if (e.key === "s" || e.key === "S") $("snap").click();
});

// ---------------------------------------------------------------- loop
let last = performance.now();
let fpsAcc = 0, fpsN = 0;
function frame(now) {
  if ($("animate").checked) model?.userData?.tickNight?.(now);
  renderer.render(scene, camera);

  const dt = now - last;
  last = now;
  fpsAcc += dt;
  fpsN++;
  if (fpsAcc > 500) {
    $("s-fps").textContent = Math.round(1000 / (fpsAcc / fpsN));
    $("s-calls").textContent = renderer.info.render.calls.toLocaleString("en-US");
    fpsAcc = 0;
    fpsN = 0;
  }
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- boot
window.addEventListener("error", (e) => {
  errBox.hidden = false;
  errBox.textContent = String(e.message || e.error);
});
resize();
syncInputs();
applyNight();
await build();
requestAnimationFrame(frame);

// expose for the headless screenshot tool
window.__viewer = { scene, renderer, view, applyCamera, get camera() { return camera; }, build };
window.__ready = true;
