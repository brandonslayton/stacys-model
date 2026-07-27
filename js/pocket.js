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
  TRASH_ICON,
  MIST_ICON,
  SICK_ICON,
  LIQUOR_ICON,
  TACO_ICON,
  RIDESHARE_ICON,
  CREATIVE_ICON,
  UFO_ICON,
  BIRD_ICON,
  moonPhase,
  moonName,
  moonIllumination,
  moonIcon,
} from "./icons.js";
import { createStacys } from "./stacys.js";
import { createStreet, SIDEWALK_INNER_Z } from "./street.js";
import { LifeSystem, crowdFactor } from "./life.js";
import { ChoreSystem } from "./chores.js";
import { MistSystem } from "./mist.js";
import { IncidentSystem } from "./incident.js";
import { RideshareSystem } from "./rideshare.js";
import { UfoSystem } from "./ufo.js";
import { BirdSystem } from "./bird.js";
import { TacoSystem } from "./taco.js";
import { FlickerSystem } from "./flicker.js";
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
 * Framing is fitted to a sphere per orientation. A bounding sphere wildly
 * overestimates a flat lot — most of it is air — so both radii below are tuned to
 * the on-screen result rather than computed from the geometry. Distance is fitted
 * against whichever half-angle is tighter, because a portrait phone's HORIZONTAL
 * FOV is far narrower than its vertical and the building otherwise overflows the
 * sides. `zoom` is a user multiplier on top of the fit, so pinch feels the same on
 * any screen.
 *
 * Portrait: the tall-and-narrow case.
 */
const SUBJECT_PORTRAIT = {
  // center.y sits ABOVE grade to push the composition down, clear of the header and
  // event card. It used to be below grade to lift the building over a card pinned to
  // the bottom of the screen — when that card moved up under the venue name, this
  // bias was left pointing the wrong way.
  center: new THREE.Vector3(-2.4, 1.6, 1.4),
  radius: 7.6,
};

/**
 * Landscape / desktop needs its own framing, not a reused portrait one.
 *
 * Two reasons. The vertical half-angle becomes the tighter constraint, which pulls
 * the camera in close enough that the lot and the far side of 7th Ave fall outside
 * the fit radius and get cropped off the bottom — hence the larger radius. And the
 * portrait center's below-grade lift, which exists to clear the header stack on a
 * tall screen, just reads as off-centre on a wide one.
 */
const SUBJECT_LANDSCAPE = {
  center: new THREE.Vector3(-1.1, 0.5, 1.0),
  radius: 8.5,
};

let SUBJECT = SUBJECT_PORTRAIT;

/**
 * Default framing: az 58 / el 26, matched to a screenshot Brandon picked.
 *
 * This deliberately departs from the parent game's map angle (az 137 / el 42),
 * which every detail pass was verified at. That one looks down on the roof and the
 * mural gable; this one looks along the street facade, which is where most of the
 * work actually went — the carved double doors, corbels, iron railing, slat screen,
 * wall sign, and the Converse shoe are all in frame. The mural gable is not.
 */
const view = { az: 58, el: 26, zoom: 1, target: SUBJECT.center.clone() };
const camera = new THREE.PerspectiveCamera(46, 1, 0.5, 400);
let fitDist = 60;
/** Set once the mist system exists, so resize() can keep its point scale right. */
let mistRef = null;

function computeFit() {
  SUBJECT = camera.aspect >= 1 ? SUBJECT_LANDSCAPE : SUBJECT_PORTRAIT;
  view.target.copy(SUBJECT.center);
  const vHalf = THREE.MathUtils.degToRad(camera.fov) / 2;
  const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
  // 1.06 leaves a little air around the fitted sphere
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
  mistRef?.setProjection(camera.fov, renderer.domElement.height);
}
addEventListener("resize", resize);

// ---------------------------------------------------------------- camera focus
/**
 * Where to swing the camera to watch a chore.
 *
 * The dumpster is at the NE property corner — north end, rear side — which the
 * default az 58 puts squarely behind the building. Without this you only see the
 * heart pop above the roofline and miss the entire toss. From here the dumpster, the
 * worker, and the mural gable are all in frame.
 */
const CHORE_VIEW = { az: 228, el: 26, zoom: 0.85, target: [-6.2, 0.8, -3.6] };

/**
 * Where to swing to see the patio, for the misters.
 *
 * Same problem as the dumpster: the patio is the building's rear (-Z) side, so the
 * default az 58 hides it completely and switching the misters on would appear to do
 * nothing. Unlike a chore this is a persistent toggle, so the swing does NOT return
 * on its own — see the `hold` option.
 */
const PATIO_VIEW = { az: 268, el: 30, zoom: 0.86, target: [0, 0.9, -3.9] };

/**
 * Where to watch the sick-patron scene: the north side door and the open lot.
 *
 * Framing this took several passes. From the north-west the pole sign sits squarely
 * in front of the action; from a low angle the parked cars do. Due north at 30 degrees
 * is clear of both: the scene plays on the building face of the aisle, south of the
 * last bay. The chore view will not do either — it is tuned on the dumpster at the
 * far rear corner, which puts this spot at the frame edge.
 */
const INCIDENT_VIEW = { az: 186, el: 30, zoom: 0.5, target: [-3.7, 0.6, 4.0] };

/**
 * Boarding-side view of the aisle stop. Guests enter from the building (+X) side
 * of the Gaymo; az ~52 sits on that side of the lot so both passengers and the
 * doors stay in frame (the old NW angle put the car between you and the board).
 */
const RIDESHARE_VIEW = { az: 52, el: 20, zoom: 0.46, target: [-3.4, 0.4, 4.0] };

/** Sidewalk abduction — overridden per-run from UfoSystem.focusTarget when possible. */
const UFO_VIEW = { az: 48, el: 24, zoom: 0.5, target: [-6, 1.4, 6.4] };

/** Eased-to view, or null when the user is in control. */
let focusTarget = null;
/** Where to return once the chore finishes. */
let savedView = null;

/** Shortest signed angular distance, so a swing never takes the long way round. */
function angleDelta(from, to) {
  return (((to - from) % 360) + 540) % 360 - 180;
}

function beginFocus(target, { hold = false } = {}) {
  // hold = stay put once arrived (a persistent toggle), rather than returning to
  // where the camera was (a one-shot chore)
  savedView = hold ? null : { az: view.az, el: view.el, zoom: view.zoom };
  focusTarget = target;
}

/**
 * Keep the camera locked on a moving subject (e.g. UFO patron on mobile).
 * `getTarget` returns {x,y,z} or [x,y,z] each frame.
 */
function beginFollow(getTarget, opts = {}) {
  savedView = { az: view.az, el: view.el, zoom: view.zoom };
  focusTarget = {
    az: opts.az ?? 55,
    el: opts.el ?? 22,
    zoom: opts.zoom ?? 0.4,
    getTarget,
    follow: true,
  };
}

/** Any manual input hands control straight back. */
function cancelFocus() {
  focusTarget = null;
  savedView = null;
}

const focusPoint = new THREE.Vector3();

function stepFocus(dt, choreBusy) {
  // Follow mode tracks a moving subject snappier so they stay on-screen on a phone
  const follow = !!focusTarget?.follow;
  const k = 1 - Math.exp(-dt * (follow ? 4.5 : 2.4));

  // Look-at: live getter, static target array, or subject centre
  let want = SUBJECT.center;
  if (focusTarget?.getTarget) {
    const t = focusTarget.getTarget();
    if (t) {
      if (Array.isArray(t)) focusPoint.set(t[0], t[1], t[2]);
      else focusPoint.set(t.x, t.y ?? 0.8, t.z);
      want = focusPoint;
    }
  } else if (focusTarget?.target) {
    want = focusPoint.set(...focusTarget.target);
  }
  if (view.target.distanceToSquared(want) > 1e-5) {
    view.target.lerp(want, k);
    applyCamera();
  }

  if (!focusTarget) return;
  view.az += angleDelta(view.az, focusTarget.az) * k;
  view.el += (focusTarget.el - view.el) * k;
  view.zoom += (focusTarget.zoom - view.zoom) * k;
  applyCamera();

  const near =
    Math.abs(angleDelta(view.az, focusTarget.az)) < 0.4 &&
    Math.abs(focusTarget.el - view.el) < 0.3;

  if (!savedView) {
    // Held swing, or already on the way home: release once we arrive
    if (near) cancelFocus();
    return;
  }
  // Follow stays locked until the chore ends
  if (follow) {
    if (!choreBusy) {
      focusTarget = savedView;
      savedView = null;
    }
    return;
  }
  if (choreBusy) return;
  focusTarget = savedView;
  savedView = null;
}

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
  cancelFocus();
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
// without asserting a figure. Everything shown below is real — except creative
// mode, which only pretends the doors are open for the sim.
let weather = null;
let events = [];
/** Current night mix 0..1, from real sun times. Drives the lighting and the
 *  day/night choice of weather icon, so the two can never disagree. */
let nightMix = 0;
/** Developer instrumentation, kept off-screen; read by pocket-shot.mjs. */
const perf = { fps: 0, meshes: 0 };

/**
 * Creative mode: when on, the *game* treats the bar as open even if real hours
 * say closed — crowd sim, Gaymo pickup, and the Open pill all follow this.
 * Real clock / weather / events stay real. Persisted so a reload keeps the vibe.
 */
const CREATIVE_KEY = "stacys-pocket-creative";
let creativeMode = (() => {
  try {
    return localStorage.getItem(CREATIVE_KEY) === "1";
  } catch {
    return false;
  }
})();

/** Open for sim purposes: real hours, or creative mode override. */
function isOpenForSim(now) {
  return creativeMode || isOpenNow(now);
}

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

  // Creative mode forces the Open pill so the header agrees with the crowd sim.
  // When creative is off, fall back to real posted hours.
  if (creativeMode) {
    $("state-label").textContent = isOpenNow(now) ? "Open" : "Open · creative";
    $("state").className = "pill open";
    $("state").title = isOpenNow(now)
      ? "Open now"
      : "Creative mode — pretending we're open";
  } else {
    const state = venueState(now);
    $("state-label").textContent = state.label;
    $("state").className = `pill ${state.tone}`;
    $("state").title = "";
  }
}

function wireCreativeButton() {
  const btn = $("creative");
  btn.innerHTML = CREATIVE_ICON;
  const sync = () => {
    btn.classList.toggle("on", creativeMode);
    btn.setAttribute("aria-pressed", String(creativeMode));
    btn.title = creativeMode
      ? "Creative mode on — bar pretends to be open"
      : "Creative mode: pretend we're open (crowd + Gaymo)";
  };
  sync();
  btn.onclick = () => {
    creativeMode = !creativeMode;
    try {
      localStorage.setItem(CREATIVE_KEY, creativeMode ? "1" : "0");
    } catch {
      /* private mode, etc. */
    }
    sync();
    // Refresh pill + crowd immediately so the lot fills/empties without waiting
    // for the next one-second header tick.
    const now = venueNow();
    paintHeader(now);
    if (window.__pocket?.life) {
      window.__pocket.life.setCrowd(crowdFor(now));
    }
  };
}

/**
 * Trash button: disabled for the duration of the chore, so a second tap can't
 * restart the walk halfway through, and briefly tinted on completion.
 */
function wireTrashButton(chores) {
  const btn = $("trash");
  btn.innerHTML = TRASH_ICON;
  btn.onclick = () => {
    if (!chores.takeOutTrash()) return;
    beginFocus(CHORE_VIEW);
    btn.disabled = true;
    const release = () => {
      if (chores.busy) {
        requestAnimationFrame(release);
        return;
      }
      btn.disabled = false;
      btn.classList.add("done");
      setTimeout(() => btn.classList.remove("done"), 900);
    };
    requestAnimationFrame(release);
  };
}

/**
 * Sick-patron scene. One-shot, so the camera swings to the lot and back, and the
 * button locks for the duration — the sequence has two actors handing off to each
 * other and restarting it midway would leave a puddle and no one to mop it.
 */
function wireSickButton(incident) {
  const btn = $("sick");
  btn.innerHTML = SICK_ICON;
  if (!incident.enabled) {
    btn.disabled = true;
    btn.title = "Side door unavailable";
    return;
  }
  btn.onclick = () => {
    if (!incident.start()) return;
    beginFocus(INCIDENT_VIEW);
    btn.disabled = true;
    const release = () => {
      if (incident.busy) {
        requestAnimationFrame(release);
        return;
      }
      btn.disabled = false;
    };
    requestAnimationFrame(release);
  };
}

/**
 * Festival taco stand by the diamond pole sign. Toggle: white SUV unloads and
 * sets up; customers eat; some wander into the bar. Toggle off to pack up.
 */
function wireTacoButton(taco) {
  const btn = $("taco");
  btn.innerHTML = TACO_ICON;
  btn.onclick = () => {
    if (taco.busy) return;
    if (taco.open) {
      if (!taco.stop()) return;
      btn.classList.remove("on");
      btn.setAttribute("aria-pressed", "false");
      btn.disabled = true;
      const release = () => {
        if (taco.busy) {
          requestAnimationFrame(release);
          return;
        }
        btn.disabled = false;
      };
      requestAnimationFrame(release);
      return;
    }
    if (!taco.start()) return;
    beginFocus(taco.focusTarget, { hold: true });
    btn.disabled = true;
    const release = () => {
      if (taco.busy) {
        requestAnimationFrame(release);
        return;
      }
      btn.disabled = false;
      if (taco.open) {
        btn.classList.add("on");
        btn.setAttribute("aria-pressed", "true");
      }
    };
    requestAnimationFrame(release);
  };
}

/**
 * Liquor delivery: one-shot stock drop (box truck or semi). Camera swings to the
 * aisle / curb so the handoff is readable; button locks until the truck leaves.
 */
function wireLiquorButton(life) {
  const btn = $("liquor");
  btn.innerHTML = LIQUOR_ICON;
  btn.onclick = () => {
    if (!life.startLiquorDelivery()) return;
    const view = life.liquorFocusTarget();
    if (view) beginFocus(view);
    btn.disabled = true;
    const release = () => {
      if (life.liquorBusy) {
        requestAnimationFrame(release);
        return;
      }
      btn.disabled = false;
      btn.classList.add("done");
      setTimeout(() => btn.classList.remove("done"), 900);
    };
    requestAnimationFrame(release);
  };
}

/**
 * Misters toggle. Switching them ON swings the camera round to the patio, since it
 * faces away by default and the effect would otherwise be invisible. Switching OFF
 * leaves the camera alone — yanking the view on a "stop doing that" is not what
 * anyone wants.
 */
function wireMistButton(mist) {
  const btn = $("mist");
  btn.innerHTML = MIST_ICON;
  if (!mist.enabled) {
    btn.disabled = true;
    btn.title = "Patio bounds unavailable";
    return;
  }
  btn.onclick = () => {
    const on = mist.toggle();
    btn.classList.toggle("on", on);
    btn.setAttribute("aria-pressed", String(on));
    if (on) beginFocus(PATIO_VIEW, { hold: true });
  };
}

/**
 * iMessage-style toast from Gaymo (used when pickup is requested while closed).
 */
let smsHideTimer = null;
function showGaymoSms(body) {
  const el = $("sms");
  const text = $("sms-body");
  const meta = $("sms-meta");
  if (!el || !text) return;
  text.textContent = body;
  if (meta) meta.textContent = "now";
  el.hidden = false;
  // Next frame so the transition plays
  requestAnimationFrame(() => el.classList.add("show"));
  if (smsHideTimer) clearTimeout(smsHideTimer);
  smsHideTimer = setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => {
      el.hidden = true;
    }, 400);
    smsHideTimer = null;
  }, 4800);
}

const _floatSmsWorld = new THREE.Vector3();

/**
 * iPhone-style banner over the waiting guest (single HTML notification — no
 * 3D duplicate). Projected from the rideshare wait-SMS anchor each frame.
 */
function paintFloatSms(rideshare) {
  const el = $("float-sms");
  if (!el) return;
  const anchor = rideshare?.waitSmsAnchor;
  if (!anchor || (rideshare.waitSmsT ?? 0) <= 0) {
    el.classList.remove("show");
    el.style.opacity = "";
    if (!el.hidden) {
      setTimeout(() => {
        if (!el.classList.contains("show")) el.hidden = true;
      }, 300);
    }
    return;
  }
  _floatSmsWorld.set(anchor.x, anchor.y, anchor.z);
  _floatSmsWorld.project(camera);
  if (_floatSmsWorld.z > 1) {
    el.classList.remove("show");
    return;
  }
  const body = $("float-sms-body");
  const from = $("float-sms-from");
  if (body && anchor.text) body.textContent = anchor.text;
  if (from && anchor.from) from.textContent = anchor.from;
  const x = (_floatSmsWorld.x * 0.5 + 0.5) * innerWidth;
  const y = (-_floatSmsWorld.y * 0.5 + 0.5) * innerHeight;
  el.hidden = false;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  const fade = rideshare.waitSmsT < 0.9 ? Math.max(0.2, rideshare.waitSmsT / 0.9) : 1;
  el.style.opacity = String(fade);
  el.classList.add("show");
}

/**
 * Gaymo button (Waymo-branded hover robotaxi).
 *
 *   tap (open)     → guests leave the bar, wait, get picked up
 *   tap (closed)   → Gaymo texts: no passenger available
 *   double-tap / hold (open)   → drop-off, walk in
 *   double-tap / hold (closed) → drop-off, knock, confused, rescue Gaymo
 *
 * A short delay on the single-tap lets a second tap cancel it and run dropoff
 * instead, so double-tap is not racing a pickup start.
 */
function wireRideButton(rideshare) {
  const btn = $("ride");
  btn.innerHTML = RIDESHARE_ICON;

  const LONG_MS = 480;
  const CLICK_GAP_MS = 280;
  let holdTimer = null;
  let clickTimer = null;
  let holdFired = false;
  let pointerDownAt = 0;

  const lockUntilDone = () => {
    btn.disabled = true;
    const release = () => {
      if (rideshare.busy) {
        requestAnimationFrame(release);
        return;
      }
      btn.disabled = false;
      btn.classList.add("done");
      setTimeout(() => btn.classList.remove("done"), 900);
    };
    requestAnimationFrame(release);
  };

  const runPickup = () => {
    // Closed (and not creative): nobody inside to pick up — Gaymo texts instead
    if (!isOpenForSim(venueNow())) {
      showGaymoSms(
        "No passengers available for pickup right now. Try again when Stacy's is open ✨"
      );
      return;
    }
    if (!rideshare.startPickup()) return;
    beginFocus(RIDESHARE_VIEW);
    lockUntilDone();
  };

  const runDropoff = () => {
    // Closed drop-off bit only when we're *really* shut and not in creative mode
    const closed = !isOpenForSim(venueNow());
    if (!rideshare.startDropoff({ closed })) return;
    beginFocus(RIDESHARE_VIEW);
    lockUntilDone();
  };

  const clearHold = () => {
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
  };

  const clearClick = () => {
    if (clickTimer) {
      clearTimeout(clickTimer);
      clickTimer = null;
    }
  };

  btn.addEventListener("pointerdown", (e) => {
    if (btn.disabled || rideshare.busy) return;
    // Only primary button / finger
    if (e.button != null && e.button !== 0) return;
    holdFired = false;
    pointerDownAt = performance.now();
    clearHold();
    holdTimer = setTimeout(() => {
      holdFired = true;
      clearClick();
      runDropoff();
    }, LONG_MS);
  });

  btn.addEventListener("pointerup", (e) => {
    clearHold();
    if (btn.disabled || rideshare.busy || holdFired) return;
    if (e.button != null && e.button !== 0) return;
    // Ignore if this was a very long press that almost-but-not-quite hit the timer
    if (performance.now() - pointerDownAt >= LONG_MS) return;

    if (clickTimer) {
      // Second tap inside the gap → dropoff
      clearClick();
      runDropoff();
      return;
    }
    clickTimer = setTimeout(() => {
      clickTimer = null;
      runPickup();
    }, CLICK_GAP_MS);
  });

  btn.addEventListener("pointerleave", () => {
    clearHold();
  });

  btn.addEventListener("pointercancel", () => {
    clearHold();
    clearClick();
  });

  // Prevent the 300ms synthetic click / text selection quirks on long-press
  btn.addEventListener("contextmenu", (e) => e.preventDefault());
}

/**
 * UFO abduction. Side-door exit, saucer follows while they walk, then beam-up.
 * Camera *tracks* the patron the whole time so mobile doesn't lose them.
 */
function wireUfoButton(ufo) {
  const btn = $("ufo");
  btn.innerHTML = UFO_ICON;
  btn.onclick = () => {
    if (!ufo.start()) return;
    beginFollow(() => ufo.followPoint?.() || ufo.focusTarget?.target, {
      az: 62,
      el: 20,
      zoom: 0.38,
    });
    btn.disabled = true;
    const release = () => {
      if (ufo.busy) {
        requestAnimationFrame(release);
        return;
      }
      btn.disabled = false;
      btn.classList.add("done");
      setTimeout(() => btn.classList.remove("done"), 900);
    };
    requestAnimationFrame(release);
  };
}

/**
 * Pigeon flyby — one-shot arc over the property to tune model + flight.
 * Soft camera follow so it stays readable on a phone.
 */
function wireBirdButton(bird) {
  const btn = $("bird");
  btn.innerHTML = BIRD_ICON;
  btn.onclick = () => {
    if (!bird.start()) return;
    beginFollow(() => bird.followPoint?.(), {
      az: 48,
      el: 28,
      zoom: 0.55,
    });
    btn.disabled = true;
    const release = () => {
      if (bird.busy) {
        requestAnimationFrame(release);
        return;
      }
      btn.disabled = false;
      btn.classList.add("done");
      setTimeout(() => btn.classList.remove("done"), 900);
    };
    requestAnimationFrame(release);
  };
}

/**
 * Crowd size for the sim, zeroed while the doors are shut so the visuals agree
 * with the pill — otherwise people stroll in at noon on a Monday under a
 * "Opens 4:00 PM" badge. Creative mode pretends the doors are open.
 */
function crowdFor(now) {
  if (!isOpenForSim(now)) return 0;
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
  // Seat the lot flush against the sidewalk rather than overlapping it. The pad's
  // west edge sat ~0.18 past the sidewalk's inner edge, so the paving read as running
  // underneath the property. Computed from published extents, not hardcoded, so it
  // stays correct if the pad changes.
  const pad = model.userData.pad;
  if (pad) model.position.z = SIDEWALK_INNER_Z - pad.zMax;
  scene.add(model);

  const life = new LifeSystem(scene, model);
  // Reuses LifeSystem's already-resolved world-space anchors rather than
  // recomputing the door and aisle positions from userData a second time.
  const chores = new ChoreSystem(scene, model, {
    streetDoor: life.streetDoor,
    aisleX: life.aisle ? life.aisle.x : life.streetDoor.x,
  });
  // Must run after tickNight each frame — it multiplies what that leaves behind
  const flicker = new FlickerSystem(model);
  const incident = new IncidentSystem(scene, model, life);
  const rideshare = new RideshareSystem(
    scene,
    model,
    {
      streetDoor: life.streetDoor,
      mouth: life.mouth,
      aisle: life.aisle,
      yardCorner: life.yardCorner,
    },
    life
  );
  // Gaymo participates in traffic when visible; corridor rules keep a stopped
  // aisle pickup from locking the whole street queue.
  life.getExtraVehicles = () =>
    rideshare.waymo?.visible ? [rideshare.waymo] : [];
  const ufo = new UfoSystem(scene, model, {
    streetDoor: life.streetDoor,
  });
  const bird = new BirdSystem(scene, model);
  const mist = new MistSystem(scene, model);
  mistRef = mist;
  mist.setProjection(camera.fov, renderer.domElement.height);
  wireCreativeButton();
  wireTrashButton(chores);
  wireMistButton(mist);
  wireSickButton(incident);
  wireLiquorButton(life);
  const taco = new TacoSystem(scene, model, life);
  wireTacoButton(taco);
  wireRideButton(rideshare);
  wireUfoButton(ufo);
  wireBirdButton(bird);
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
    THREE,
    camera,
    scene,
    life,
    view,
    perf,
    chores,
    mist,
    flicker,
    incident,
    rideshare,
    ufo,
    bird,
    get nightMix() {
      return nightMix;
    },
    get creativeMode() {
      return creativeMode;
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
  /**
   * Wall-clock seconds, NOT the clamped sim dt.
   *
   * Accumulating the clamped value inflates the figure whenever a frame exceeds
   * 50ms: at ~6 real fps it reported 21, because each 160ms frame only added 50ms
   * to the denominator. Since the whole point of this number is to answer whether
   * the merge pass is needed, an over-report by 3x is worse than no number.
   */
  let fpsAcc = 0;
  let meshCount = 0;
  model.traverse((o) => {
    if (o.isMesh) meshCount++;
  });
  // Kept off-screen: real, but it is developer instrumentation, not something to
  // put on an ambient view. pocket-shot.mjs reads it off window.__pocket.
  perf.meshes = meshCount;

  function frame(now) {
    const elapsed = (now - last) / 1000;
    // Clamped for simulation so a stall cannot teleport agents across the lot
    const dt = Math.min(0.05, elapsed);
    last = now;

    const vnow = venueNow();
    nightMix = nightFromSun(vnow, weather?.sunriseMin, weather?.sunsetMin);
    applyNight(nightMix);
    model.userData.tickNight?.(now);
    flicker.update(now / 1000, nightMix);

    life.setCrowd(crowdFor(vnow));
    life.update(dt);
    chores.update(dt);
    incident.update(dt);
    rideshare.update(dt);
    ufo.update(dt);
    bird.update(dt);
    taco.update(dt);
    mist.update(dt);
    paintFloatSms(rideshare);

    stepFocus(
      dt,
      chores.busy ||
        incident.busy ||
        rideshare.busy ||
        ufo.busy ||
        bird.busy ||
        life.liquorBusy ||
        taco.busy
    );

    // Auto-rotate, resuming a few seconds after the last touch. Held off during a
    // focus swing, which would otherwise fight it for the azimuth.
    if (!focusTarget && spin && now - idleAt > IDLE_RESUME_MS) {
      view.az += dt * 3.2;
      applyCamera();
    }

    cardAcc += elapsed;
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
    fpsAcc += elapsed;

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
