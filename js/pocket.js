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
import {
  WX_ICONS,
  ROTATE_ICON,
  moonPhase,
  moonName,
  moonIllumination,
  moonIcon,
} from "./icons.js";
import { createStacys } from "./stacys.js";
import { createStreet } from "./street.js";
import { LifeSystem, crowdFactor } from "./life.js";
import {
  venueNow,
  loadEvents,
  currentEvent,
  venueState,
  isOpenNow,
  fetchWeather,
} from "./venue.js";

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

$("spin").innerHTML = ROTATE_ICON;
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
/**
 * Night mix 0..1 from the venue's REAL sunrise and sunset.
 *
 * Neon starts coming on 20 minutes before sunset and reaches full night 80 minutes
 * after it; mornings mirror that around sunrise. Falls back to the fixed clock ramp
 * if the sun times are unavailable.
 *
 * @param {number} sunriseMin minutes past midnight, venue-local
 * @param {number} sunsetMin
 */
function nightFromSun(now, sunriseMin, sunsetMin) {
  if (sunriseMin == null || sunsetMin == null) return nightFromHour(now.hourFloat);
  const mins = now.hour * 60 + now.minute;
  const clamp = (v) => Math.min(1, Math.max(0, v));

  if (mins <= sunriseMin + 15) {
    // Full night until ~70 min before sunrise, full day 15 min after
    return clamp((sunriseMin + 15 - mins) / 85);
  }
  if (mins >= sunsetMin - 20) {
    return clamp((mins - (sunsetMin - 20)) / 100);
  }
  return 0;
}

/** Fallback ramp: the same curve as builders.js nightFactorFromHour. */
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

// ---------------------------------------------------------------- header + card
// No crowd numbers here on purpose. The sim is invented, so reporting "41 inside"
// dressed it up as data; the agents walking in and parking convey the same thing
// without asserting a figure. Everything shown below is real.
let weather = null;
let events = [];
/** Current night mix 0..1, from real sun times. Drives the lighting and the
 *  day/night choice of weather icon, so the two can never disagree. */
let nightMix = 0;
/** Developer instrumentation, kept off-screen; read by pocket-shot.mjs. */
const perf = { fps: 0, meshes: 0 };

function paintHeader(now) {
  $("weekday").textContent = now.weekday;
  $("date").textContent = `${now.month} ${now.day}`;
  $("clock").textContent = now.clock;
  $("temp").textContent = weather ? `${weather.tempF}°` : "";

  // After dark, clear skies drop the weather icon — the moon row carries it, so
  // there is no sun beside "9:20 PM" and no crescent duplicating the real phase.
  //
  // Keyed off our own computed night mix rather than the API's `is_day`: that flips
  // on the API's own schedule and can disagree with the model's lighting, which
  // would put a sun on screen while the neon is already lit.
  const dark = nightMix >= 0.5;
  const key = weather?.icon && !(dark && weather.icon === "sun") ? weather.icon : null;
  $("wx-icon").innerHTML = key ? WX_ICONS[key] || "" : "";
  $("wx-icon").title = weather?.label || "";

  const p = moonPhase(new Date());
  $("moon-icon").innerHTML = moonIcon(p);
  $("moon-name").textContent = moonName(p);
  $("moon-icon").title = `${moonName(p)} · ${Math.round(
    moonIllumination(p) * 100
  )}% lit`;

  const state = venueState(now);
  $("state").textContent = state.label;
  $("state").className = `pill ${state.tone}`;
}

/**
 * Crowd size for the sim, zeroed while the doors are shut so the visuals agree
 * with the pill — otherwise people stroll in at noon on a Monday under a
 * "Opens 4:00 PM" badge.
 */
function crowdFor(now) {
  if (!isOpenNow(now)) return 0;
  return crowdFactor(now.hourFloat, now.weekday);
}

function paintEvent(ev) {
  if (!ev) {
    $("ev-when").textContent = "TODAY";
    $("ev-name").textContent = "No event listed";
    $("ev-time").textContent = "";
    $("ev-tags").replaceChildren();
    return;
  }
  $("ev-when").textContent = ev.when;
  $("ev-name").textContent = ev.name;

  const bits = [];
  if (ev.startLabel) {
    bits.push(ev.endLabel ? `${ev.startLabel} – ${ev.endLabel}` : ev.startLabel);
  }
  if (ev.ageRestriction) bits.push(ev.ageRestriction);
  if (ev.coverAmount) bits.push(`$${ev.coverAmount} cover`);
  $("ev-time").textContent = bits.join(" · ");

  const tags = ev.tags.map((t) => {
    const el = document.createElement("i");
    el.textContent = t;
    return el;
  });
  if (ev.started) {
    const live = document.createElement("i");
    live.className = "live";
    live.textContent = "On now";
    tags.unshift(live);
  }
  $("ev-tags").replaceChildren(...tags);
}

// ---------------------------------------------------------------- boot
async function boot() {
  await ensureSignFonts();

  scene.add(createStreet());

  model = createStacys(null);
  scene.add(model);

  const life = new LifeSystem(scene, model);
  const boot = venueNow();
  life.setCrowd(crowdFor(boot));
  life.seed();

  // Real data. Both are optional garnish — a failure must not stop the render, so
  // neither is awaited before the first frame.
  paintHeader(boot);
  loadEvents()
    .then((list) => {
      events = list;
      paintEvent(currentEvent(events, venueNow()));
    })
    .catch(() => paintEvent(null));
  const refreshWeather = () =>
    fetchWeather().then((w) => {
      if (w) {
        weather = w;
        paintHeader(venueNow());
      }
    });
  refreshWeather();
  setInterval(refreshWeather, 15 * 60 * 1000);

  resize();
  $("card").hidden = false;
  $("boot").classList.add("gone");
  setTimeout(() => $("boot").remove(), 600);

  // Handles for headless capture (pocket-shot.mjs) and console debugging
  window.__pocket = {
    life,
    view,
    perf,
    get nightMix() {
      return nightMix;
    },
    applyCamera,
    applyNight,
    setSpin: (v) => {
      spin = v;
      $("spin").classList.toggle("on", spin);
    },
  };

  let last = performance.now();
  let cardAcc = 1e9;
  let eventAcc = 0;
  let frames = 0;
  let fpsAcc = 0;
  let meshCount = 0;
  model.traverse((o) => {
    if (o.isMesh) meshCount++;
  });
  // Kept off-screen: real, but it is developer instrumentation, not something to
  // put on an ambient view. pocket-shot.mjs reads it off window.__pocket.
  perf.meshes = meshCount;

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    const vnow = venueNow();
    nightMix = nightFromSun(vnow, weather?.sunriseMin, weather?.sunsetMin);
    applyNight(nightMix);
    model.userData.tickNight?.(now);

    life.setCrowd(crowdFor(vnow));
    life.update(dt);

    // Auto-rotate, resuming a few seconds after the last touch
    if (spin && now - idleAt > IDLE_RESUME_MS) {
      view.az += dt * 3.2;
      applyCamera();
    }

    cardAcc += dt;
    if (cardAcc >= 1) {
      cardAcc = 0;
      paintHeader(vnow);
      perf.fps = Math.round(frames / Math.max(0.001, fpsAcc));
      frames = 0;
      fpsAcc = 0;
    }

    // Re-evaluate which event is current every minute, so it rolls over at
    // midnight and flips to "On now" when the show starts
    eventAcc += dt;
    if (eventAcc >= 60) {
      eventAcc = 0;
      paintEvent(currentEvent(events, vnow));
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
