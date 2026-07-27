/**
 * pocket.js — the phone view.
 *
 * Deliberately NOT viewer.js. The workbench is a measuring instrument (ref
 * overlays, wireframe, cost panel, view presets); this is an ambient window you
 * pull out of your pocket. Shared code lives in stacys.js / kit.js / life.js.
 *
 * Real local time drives the day-night state, so checking in at 11pm shows the
 * neon lit and a full room. Everything on the stats card is simulated — there is
 * no live feed from the real venue.
 */
import * as THREE from "three";
import { ensureSignFonts } from "./kit.js";
import { createStacys } from "./stacys.js";
import { createStreet } from "./street.js";
import { LifeSystem, crowdFactor, isOpen } from "./life.js";

const $ = (id) => document.getElementById(id);
const canvas = $("c");

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();

// ---------------------------------------------------------------- lighting
// Same rig as viewer.js / the game's scene.js, so day and night read identically.
const ambient = new THREE.AmbientLight(0xfff2e4, 0.62);
scene.add(ambient);
const hemi = new THREE.HemisphereLight(0xc8e0f5, 0xb89868, 0.48);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d0, 1.12);
sun.position.set(24, 48, 18);
sun.castShadow = true;
// 1024 rather than the workbench's 2048 — this has to hold up on a phone
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, {
  near: 1, far: 140, left: -22, right: 22, top: 22, bottom: -22,
});
sun.shadow.bias = -0.0008;
scene.add(sun);
const fill = new THREE.DirectionalLight(0xffa0c0, 0.18);
fill.position.set(-20, 15, -10);
scene.add(fill);
const nightGlow = new THREE.DirectionalLight(0x8866ff, 0);
nightGlow.position.set(10, 20, -15);
scene.add(nightGlow);

const groundMat = new THREE.MeshStandardMaterial({ color: 0x8a7a62, roughness: 1 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.03;
ground.receiveShadow = true;
scene.add(ground);

// At el 42 the top of frame still points ~19° DOWN, so the camera never sees sky —
// the whole upper third is ground plane, which without haze is a flat slab of
// brown. Fog fades it toward the sky color to imply a horizon instead. Near sits
// just past the subject (camera ~42 units out, model radius ~8) so the building
// itself stays completely clear; far is deliberately tight, since a wide range
// left the haze too weak to read.
scene.fog = new THREE.Fog(0x8ec0e0, 58, 115);

// ---------------------------------------------------------------- camera
/**
 * Subject is the building plus its lot and the near half of 7th Ave — roughly
 * x [−9, 4], z [−6, 10], up to the ridge. A portrait phone's *horizontal* FOV is
 * far narrower than its vertical, so distance has to be fit against whichever
 * axis is tighter or the building overflows the sides. zoom is a user multiplier
 * on top of that fit, so pinch behaves the same on any screen.
 */
// A sphere overestimates a flat lot badly — most of it is air — so the radius is
// tuned to the on-screen result, not the geometric bounding sphere. The center
// sits below grade so the building lands in the upper two thirds, clear of the
// stats card.
// az 137 / el 42 is the parent game's map angle, and the angle every detail pass
// in this project was verified at — so it is what the model is tuned to look best
// from. Looking down harder also eats some of the dead sky a portrait phone leaves.
const SUBJECT = { center: new THREE.Vector3(-2.4, -0.8, 1.4), radius: 7.6 };
const view = { az: 137, el: 42, zoom: 1, target: SUBJECT.center.clone() };
const camera = new THREE.PerspectiveCamera(46, 1, 0.5, 400);
let fitDist = 60;

function computeFit() {
  const vHalf = THREE.MathUtils.degToRad(camera.fov) / 2;
  const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
  // 1.06 leaves a little air; the stats card overlays the lower third anyway
  fitDist = (SUBJECT.radius * 1.06) / Math.sin(Math.min(vHalf, hHalf));
}

function applyCamera() {
  const dist = THREE.MathUtils.clamp(fitDist * view.zoom, fitDist * 0.22, fitDist * 1.5);
  const azr = (view.az * Math.PI) / 180;
  const elr = (view.el * Math.PI) / 180;
  camera.position.set(
    view.target.x + Math.cos(azr) * Math.cos(elr) * dist,
    view.target.y + Math.sin(elr) * dist,
    view.target.z + Math.sin(azr) * Math.cos(elr) * dist
  );
  camera.lookAt(view.target);
}

function resize() {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  computeFit();
  applyCamera();
}
addEventListener("resize", resize);

// ---------------------------------------------------------------- touch + mouse
let spin = true;
let idleAt = 0;
const IDLE_RESUME_MS = 4000;

$("spin").onclick = () => {
  spin = !spin;
  $("spin").classList.toggle("on", spin);
  if (spin) idleAt = 0;
};

const pointers = new Map();
let pinchStart = 0;
let zoomStart = 1;

function pinchDist() {
  const [a, b] = [...pointers.values()];
  return Math.hypot(a.x - b.x, a.y - b.y);
}

canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    pinchStart = pinchDist();
    zoomStart = view.zoom;
  }
  idleAt = performance.now();
});

canvas.addEventListener("pointermove", (e) => {
  const prev = pointers.get(e.pointerId);
  if (!prev) return;
  const cur = { x: e.clientX, y: e.clientY };

  if (pointers.size === 2) {
    pointers.set(e.pointerId, cur);
    const d = pinchDist();
    if (pinchStart > 0 && d > 0) {
      view.zoom = THREE.MathUtils.clamp(zoomStart * (pinchStart / d), 0.22, 1.5);
      applyCamera();
    }
  } else {
    view.az -= (cur.x - prev.x) * 0.28;
    view.el = THREE.MathUtils.clamp(view.el + (cur.y - prev.y) * 0.22, 6, 82);
    pointers.set(e.pointerId, cur);
    applyCamera();
  }
  idleAt = performance.now();
});

function endPointer(e) {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinchStart = 0;
  idleAt = performance.now();
}
canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", endPointer);

canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    view.zoom = THREE.MathUtils.clamp(view.zoom * (1 + e.deltaY * 0.0012), 0.22, 1.5);
    applyCamera();
    idleAt = performance.now();
  },
  { passive: false }
);

// ---------------------------------------------------------------- day / night
/** Same curve as builders.js nightFactorFromHour. */
function nightFromHour(hour) {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 17 && h < 20) return ((h - 17) / 3) * 0.55;
  if (h >= 20 || h < 6) return h >= 20 ? Math.min(1, 0.55 + (h - 20) / 3) : 1;
  if (h >= 6 && h < 7.5) return 1 - (h - 6) / 1.5;
  return 0;
}

const skyDay = new THREE.Color(0x8ec0e0);
const skyNight = new THREE.Color(0x14182a);
const groundDay = new THREE.Color(0x8a7a62);
const groundNight = new THREE.Color(0x241f33);

let model = null;

function applyNight(t) {
  ambient.intensity = 0.62 - 0.34 * t;
  hemi.intensity = 0.48 - 0.3 * t;
  sun.intensity = 1.12 * (1 - t) + 0.04;
  fill.intensity = 0.18 + 0.1 * t;
  nightGlow.intensity = 0.55 * t;
  const sky = skyDay.clone().lerp(skyNight, t);
  scene.background = sky;
  scene.fog.color.copy(sky);
  groundMat.color.copy(groundDay).lerp(groundNight, t * 0.85);
  model?.userData?.setNight?.(t);
}

// ---------------------------------------------------------------- stats card
// Kept free of specific claims (patio, parking, queue) — the stat row sits right
// underneath and would contradict them.
const VIBES = [
  [0.02, "Closed. Chairs up, neon off."],
  [0.12, "Dead quiet."],
  [0.28, "A few regulars in. Taking it easy."],
  [0.48, "Filling in nicely."],
  [0.7, "Busy. Steady flow through the door."],
  [0.88, "Packed."],
  [Infinity, "Rammed."],
];

function vibeText(f) {
  for (const [lim, text] of VIBES) if (f < lim) return text;
  return VIBES[VIBES.length - 1][1];
}

function fmtClock(d) {
  let h = d.getHours();
  const ap = h < 12 ? "AM" : "PM";
  h = h % 12 === 0 ? 12 : h % 12;
  return `${h}:${String(d.getMinutes()).padStart(2, "0")} ${ap}`;
}

function paintCard(life, date) {
  const s = life.stats();
  const open = isOpen(date);
  $("clock").textContent = fmtClock(date);
  $("inside").textContent = s.inside;
  $("bar-fill").style.width = `${Math.min(100, (s.inside / s.capacity) * 100)}%`;
  $("vibe").textContent = vibeText(open ? s.inside / s.capacity : 0);

  const state = $("state");
  state.textContent = open ? "Open" : "Closed";
  state.className = `pill ${open ? "open" : "closed"}`;

  $("s-cars").textContent = `${s.carsParked}/${s.stalls}`;
  $("s-patio").textContent = `${s.onPatio}/${s.patioSpots}`;
  $("s-out").textContent = s.outside;
  $("s-arr").textContent = s.arrivals10m;
}

// ---------------------------------------------------------------- boot
async function boot() {
  await ensureSignFonts();

  scene.add(createStreet());

  model = createStacys(null);
  scene.add(model);

  const life = new LifeSystem(scene, model);
  life.setCrowd(crowdFactor(new Date()));
  life.seed();

  resize();
  $("card").hidden = false;
  $("boot").classList.add("gone");
  setTimeout(() => $("boot").remove(), 600);

  // Handles for headless capture (pocket-shot.mjs) and console debugging
  window.__pocket = {
    life,
    view,
    applyCamera,
    applyNight,
    setSpin: (v) => {
      spin = v;
      $("spin").classList.toggle("on", spin);
    },
  };

  let last = performance.now();
  let cardAcc = 1e9;
  let frames = 0;
  let fpsAcc = 0;
  let meshCount = 0;
  model.traverse((o) => {
    if (o.isMesh) meshCount++;
  });

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    const date = new Date();
    const hour = date.getHours() + date.getMinutes() / 60;
    applyNight(nightFromHour(hour));
    model.userData.tickNight?.(now);

    life.setCrowd(crowdFactor(date));
    life.update(dt);

    // Auto-rotate, resuming a few seconds after the last touch
    if (spin && now - idleAt > IDLE_RESUME_MS) {
      view.az += dt * 3.2;
      applyCamera();
    }

    cardAcc += dt;
    if (cardAcc >= 1) {
      cardAcc = 0;
      paintCard(life, date);
      const fps = frames / Math.max(0.001, fpsAcc);
      $("perf").textContent = `${fps.toFixed(0)} fps · ${meshCount} meshes`;
      frames = 0;
      fpsAcc = 0;
    }
    frames++;
    fpsAcc += dt;

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.__ready = true;
}

boot().catch((err) => {
  console.error(err);
  const box = $("err");
  box.hidden = false;
  box.textContent = String(err?.stack || err);
  $("boot").remove();
});
