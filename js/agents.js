/**
 * Cars and pedestrians.
 *
 * Low-poly agents for the lot sim. Cars share a common vocabulary (hood/grille
 * toward local +Z, taillights toward −Z) so the front is always readable, with
 * a handful of body styles plus a signature black Ram that can roll up.
 */
import * as THREE from "three";
import { box, cyl, canvasTexture, roundRect } from "./kit.js";

/** Ambient paint colours — expanded beyond the original six. */
export const CAR_COLORS = [
  0xe85d5d, // red
  0x5d8fe8, // blue
  0xf0c14d, // gold
  0xf5f5f5, // white
  0x3dd68c, // green
  0x9b6dff, // purple
  0x2a2a2e, // charcoal
  0xc8ccd0, // silver
  0xe8a060, // copper
  0x1a3a5c, // navy
  0xb84848, // deep red
  0x4a7a4a, // forest
];

/** Body styles cycled through the ambient pool. */
export const CAR_STYLES = ["sedan", "hatch", "coupe", "suv", "compact"];

/**
 * Typical Phoenix lot paint — pearl white, silver, desert sand, charcoal.
 * Heat + sun mean light colours dominate the freeways out here.
 */
export const PHX_SUV_COLORS = [
  0xf4f1ea, // pearl white
  0xe8ecf0, // cool white
  0xc8ced4, // silver
  0xb8a890, // desert sand
  0x3a3c42, // charcoal
  0x5c6a78, // blue-grey
  0xd4c4a8, // beige
];

/** COLORS.ped from the game's config.js. */
export const PED_COLORS = [0xffb6c1, 0x7ec8e3, 0xc5a3ff, 0xffd580, 0x98d8aa];

const GLASS = {
  roughness: 0.14,
  metalness: 0.35,
  emissive: 0x081018,
  emissiveIntensity: 0.12,
};
const DARK = { roughness: 0.55, metalness: 0.18 };
const CHROME = { roughness: 0.28, metalness: 0.72 };
const RUBBER = { roughness: 0.92, metalness: 0.05 };

function paintOpts(color, extras = {}) {
  return {
    roughness: 0.42,
    metalness: 0.22,
    ...extras,
    // keep color as the mesh color arg to box/cyl
  };
}

/** Per-car light bookkeeping for neon glow + occasional flash. */
function ensureLights(g, opts = {}) {
  if (!g.userData.lights) {
    g.userData.lights = {
      head: [],
      tail: [],
      neon: [],
      marker: [],
      baseHead: opts.baseHead ?? 0.9,
      baseTail: opts.baseTail ?? 0.72,
      baseNeon: opts.baseNeon ?? 1.05,
      baseMarker: opts.baseMarker ?? 0.42,
      /** Heavier cyan DRL package (Phoenix SUVs). */
      neonHeavy: !!opts.neonHeavy,
      phase: Math.random() * Math.PI * 2,
      nextFlashAt: 2 + Math.random() * 8,
      flashUntil: 0,
      flashKind: "strobe",
    };
  }
  return g.userData.lights;
}

function pushLight(g, mesh, channel) {
  if (!mesh?.material) return;
  const L = ensureLights(g);
  if (!L[channel]) L[channel] = [];
  L[channel].push(mesh.material);
}

/**
 * Drive neon + flash on a car mesh. Call once per frame for visible cars.
 * Occasional strobe / pulse bursts so the lot reads alive at night.
 */
export function tickCarLights(g, now) {
  const L = g?.userData?.lights;
  if (!L || !g.visible) return;

  if (now >= L.nextFlashAt) {
    L.flashKind = Math.random() < 0.55 ? "strobe" : "pulse";
    L.flashUntil = now + (L.flashKind === "strobe" ? 0.45 + Math.random() * 0.55 : 0.7 + Math.random() * 0.6);
    L.nextFlashAt = L.flashUntil + 3.5 + Math.random() * 10;
  }

  let headMul = 1;
  let tailMul = 1;
  let neonMul = 1;
  // Idle neon breathing so DRLs always feel a little alive
  const breathe = 0.92 + 0.08 * Math.sin(now * 2.1 + L.phase);
  neonMul *= breathe;

  if (now < L.flashUntil) {
    const u = now * (L.flashKind === "strobe" ? 14 : 6) + L.phase;
    const wave = L.flashKind === "strobe"
      ? (Math.sin(u * Math.PI * 2) > 0.15 ? 1 : 0.15)
      : 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(u * Math.PI * 2));
    headMul = 0.7 + wave * (L.neonHeavy ? 2.8 : 2.0);
    neonMul = 0.5 + wave * (L.neonHeavy ? 3.2 : 2.4);
    tailMul = 0.85 + wave * 1.6;
  } else if (L.neonHeavy) {
    // Phoenix SUVs keep a stronger idle neon
    neonMul *= 1.25;
    headMul *= 1.08;
  }

  const h = L.baseHead * headMul;
  const t = L.baseTail * tailMul;
  const n = L.baseNeon * neonMul;
  const m = L.baseMarker * (0.85 + 0.15 * breathe);
  for (const mat of L.head) mat.emissiveIntensity = h;
  for (const mat of L.tail) mat.emissiveIntensity = t;
  for (const mat of L.neon) mat.emissiveIntensity = n;
  for (const mat of L.marker) mat.emissiveIntensity = m;
}

function addCarWheels(g, positions, radius = 0.17, width = 0.14) {
  for (const [wx, wz] of positions) {
    const wheel = cyl(radius, radius, width, 0x141414, RUBBER, 10);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, radius, wz);
    g.add(wheel);
    // Simple hub so wheels read as wheels, not black pucks
    const hub = cyl(radius * 0.42, radius * 0.42, width + 0.02, 0x9aa0a8, CHROME, 8);
    hub.rotation.z = Math.PI / 2;
    hub.position.set(wx, radius, wz);
    g.add(hub);
  }
}

/** Shared front/rear lighting — neon-emissive, registered for flash ticks. */
function addCarLights(g, { halfW, noseZ, tailZ, lightY = 0.38, neon = false }) {
  ensureLights(g, {
    neonHeavy: neon,
    baseHead: neon ? 1.05 : 0.85,
    baseNeon: neon ? 1.35 : 0.95,
    baseTail: neon ? 0.9 : 0.7,
  });

  // Headlights — bright, wide, clearly the front
  for (const side of [-1, 1]) {
    const hl = box(0.2, 0.07, 0.06, 0xf0f6ff, {
      roughness: 0.16,
      metalness: 0.4,
      emissive: 0xd8e8ff,
      emissiveIntensity: neon ? 1.05 : 0.85,
    });
    hl.position.set(side * (halfW * 0.72), lightY, noseZ);
    g.add(hl);
    pushLight(g, hl, "head");
    // Amber marker under each headlight
    const am = box(0.08, 0.035, 0.04, 0xffa040, {
      roughness: 0.32,
      emissive: 0xff8020,
      emissiveIntensity: 0.4,
    });
    am.position.set(side * (halfW * 0.78), lightY - 0.06, noseZ - 0.01);
    g.add(am);
    pushLight(g, am, "marker");
  }

  // Slim neon DRL bar across the nose
  const drl = box(halfW * 1.55, 0.03, 0.04, neon ? 0xa8f0ff : 0xe8f4ff, {
    roughness: 0.14,
    metalness: 0.5,
    emissive: neon ? 0x5ef0ff : 0xc8e8ff,
    emissiveIntensity: neon ? 1.4 : 0.95,
  });
  drl.position.set(0, lightY + 0.06, noseZ + 0.01);
  g.add(drl);
  pushLight(g, drl, "neon");

  // Grille block between the lights
  const grille = box(halfW * 0.9, 0.12, 0.05, 0x1a1a1e, DARK);
  grille.position.set(0, lightY - 0.02, noseZ - 0.01);
  g.add(grille);
  // Horizontal grille bars
  for (let i = 0; i < 3; i++) {
    const bar = box(halfW * 0.78, 0.012, 0.03, 0x3a3a42, CHROME);
    bar.position.set(0, lightY - 0.06 + i * 0.035, noseZ + 0.01);
    g.add(bar);
  }

  // Front bumper lip
  const bumper = box(halfW * 2.05, 0.1, 0.12, 0x222226, DARK);
  bumper.position.set(0, 0.18, noseZ - 0.02);
  g.add(bumper);

  // Taillights — red neon, clearly the rear
  for (const side of [-1, 1]) {
    const tl = box(0.18, 0.08, 0.05, 0xff2030, {
      roughness: 0.26,
      metalness: 0.25,
      emissive: 0xff1028,
      emissiveIntensity: neon ? 0.95 : 0.72,
    });
    tl.position.set(side * (halfW * 0.72), lightY, tailZ);
    g.add(tl);
    pushLight(g, tl, "tail");
  }
  // Centre rear neon strip
  const strip = box(halfW * 0.7, 0.035, 0.04, 0xff2040, {
    roughness: 0.28,
    emissive: 0xff1030,
    emissiveIntensity: neon ? 0.85 : 0.45,
  });
  strip.position.set(0, lightY, tailZ);
  g.add(strip);
  pushLight(g, strip, "neon");

  // Rear bumper
  const rearBump = box(halfW * 2.0, 0.09, 0.1, 0x222226, DARK);
  rearBump.position.set(0, 0.17, tailZ + 0.02);
  g.add(rearBump);
}

/**
 * Small door crease lines so a four-door cabin reads as four doors.
 * @param {number} z0 front of cabin glass
 * @param {number} z1 rear of cabin glass
 */
function addDoorCreases(g, halfW, y, z0, z1, doors = 4) {
  const span = z0 - z1;
  if (doors < 2) return;
  // Vertical panel gaps on each side
  const n = doors; // gaps between doors + ends ignored; mid splits
  for (let i = 1; i < n; i++) {
    const z = z0 - (span * i) / n;
    for (const side of [-1, 1]) {
      const crease = box(0.02, 0.22, 0.02, 0x101012, DARK);
      crease.position.set(side * (halfW + 0.01), y, z);
      g.add(crease);
    }
  }
}

/**
 * License plate mesh (local +Z face of a thin box). Place with rotation so the
 * painted face points out of the car.
 */
function makePlate(text, { skyBlue = false } = {}) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext("2d");

  if (skyBlue) {
    // Arizona-ish sky plate
    const grad = ctx.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, "#7ec8f0");
    grad.addColorStop(0.55, "#5eb3e8");
    grad.addColorStop(1, "#4a9fd4");
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = "#e8e4d8";
  }
  ctx.fillRect(0, 0, 256, 128);

  // Outer white / chrome border
  ctx.strokeStyle = skyBlue ? "#f2f8ff" : "#ffffff";
  ctx.lineWidth = 10;
  roundRect(ctx, 6, 6, 244, 116, 10);
  ctx.stroke();
  ctx.strokeStyle = skyBlue ? "#2a5080" : "#333338";
  ctx.lineWidth = 3;
  roundRect(ctx, 14, 14, 228, 100, 6);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (skyBlue) {
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 16px Arial, sans-serif";
    ctx.fillText("ARIZONA", 128, 30);
    ctx.fillStyle = "#1a2a48";
    ctx.font = "bold 44px Arial, sans-serif";
    ctx.fillText(text, 128, 78);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 12px Arial, sans-serif";
    ctx.fillText("GRAND CANYON STATE", 128, 108);
  } else {
    ctx.fillStyle = "#222228";
    ctx.font = "bold 40px Arial, sans-serif";
    ctx.fillText(text, 128, 68);
  }

  const tex = canvasTexture(c, 4);
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.55,
    metalness: 0.15,
    flatShading: true,
  });
  // Thin plate; +Z face carries the map on a double-sided plane
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.19), mat);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

function attachRearPlate(g, plate, z, y = 0.32) {
  plate.position.set(0, y, z);
  // Plane faces +Z by default; flip so text faces −Z (rear of car)
  plate.rotation.y = Math.PI;
  g.add(plate);
}

function attachFrontPlate(g, plate, z, y = 0.28) {
  plate.position.set(0, y, z);
  // Front plate faces +Z (travel direction)
  g.add(plate);
}

/**
 * Build an ambient lot car.
 * Local +Z = nose / headlights. Local −Z = tail / taillights.
 *
 * @param {number | { color?: number, style?: string, plate?: string }} colorOrOpts
 */
export function createCar(colorOrOpts = 0xe85d5d) {
  const opts =
    typeof colorOrOpts === "number"
      ? { color: colorOrOpts, style: "sedan" }
      : colorOrOpts || {};
  const color = opts.color ?? CAR_COLORS[0];
  const style = opts.style || "sedan";
  const g = new THREE.Group();
  g.name = "car";
  g.userData.carStyle = style;

  const paint = paintOpts(color);

  // Per-style proportions (width, body height, length, cabin height, cabin z-centre, cabin length)
  const specs = {
    sedan: { w: 1.12, bh: 0.34, len: 2.12, ch: 0.3, cz: 0.05, cl: 1.05, wheelR: 0.17, stance: 0.0 },
    hatch: { w: 1.1, bh: 0.36, len: 1.95, ch: 0.34, cz: -0.05, cl: 1.15, wheelR: 0.16, stance: 0.0 },
    coupe: { w: 1.14, bh: 0.3, len: 2.05, ch: 0.26, cz: 0.08, cl: 0.9, wheelR: 0.17, stance: -0.02 },
    suv: { w: 1.2, bh: 0.42, len: 2.2, ch: 0.4, cz: 0.0, cl: 1.2, wheelR: 0.2, stance: 0.06 },
    compact: { w: 1.02, bh: 0.32, len: 1.78, ch: 0.3, cz: 0.02, cl: 0.95, wheelR: 0.15, stance: 0.0 },
  };
  const s = specs[style] || specs.sedan;
  const halfW = s.w * 0.5;
  const bodyY = 0.36 + s.stance;
  const noseZ = s.len * 0.5;
  const tailZ = -s.len * 0.5;

  // Lower rocker
  const rocker = box(s.w + 0.04, 0.12, s.len * 0.96, 0x1a1a1e, DARK);
  rocker.position.y = 0.2 + s.stance;
  g.add(rocker);

  // Main body shell
  const body = box(s.w, s.bh, s.len * 0.92, color, paint);
  body.position.y = bodyY;
  g.add(body);

  // Hood (front deck) — slightly lower, reads as front
  const hoodLen = style === "coupe" ? 0.55 : style === "compact" ? 0.38 : 0.48;
  const hood = box(s.w * 0.92, s.bh * 0.55, hoodLen, color, paint);
  hood.position.set(0, bodyY + s.bh * 0.08, noseZ - hoodLen * 0.55);
  g.add(hood);

  // Trunk / rear deck (not on hatch — glass goes to the back)
  if (style !== "hatch") {
    const trunkLen = style === "coupe" ? 0.42 : 0.38;
    const trunk = box(s.w * 0.9, s.bh * 0.5, trunkLen, color, paint);
    trunk.position.set(0, bodyY + s.bh * 0.05, tailZ + trunkLen * 0.55);
    g.add(trunk);
  }

  // Greenhouse
  const cabin = box(s.w * 0.86, s.ch, s.cl, 0x121c24, GLASS);
  cabin.position.set(0, bodyY + s.bh * 0.5 + s.ch * 0.45, s.cz);
  g.add(cabin);

  // Windshield — sloped, faces +Z
  const wind = box(s.w * 0.82, s.ch * 0.85, 0.32, 0x101820, GLASS);
  wind.position.set(
    0,
    bodyY + s.bh * 0.5 + s.ch * 0.4,
    s.cz + s.cl * 0.5 - 0.05
  );
  wind.rotation.x = style === "coupe" ? -0.32 : -0.22;
  g.add(wind);

  // Rear glass
  const rearG = box(s.w * 0.8, s.ch * 0.75, style === "hatch" ? 0.36 : 0.28, 0x101820, GLASS);
  rearG.position.set(
    0,
    bodyY + s.bh * 0.5 + s.ch * 0.38,
    s.cz - s.cl * 0.5 + (style === "hatch" ? -0.05 : 0.05)
  );
  rearG.rotation.x = style === "hatch" ? 0.28 : 0.16;
  g.add(rearG);

  // Roof skin
  const roof = box(s.w * 0.8, 0.04, s.cl * 0.85, color, paint);
  roof.position.set(0, bodyY + s.bh * 0.5 + s.ch * 0.9, s.cz - (style === "coupe" ? 0.06 : 0));
  g.add(roof);

  // Door creases (4-door on sedan/suv/hatch/compact; 2-door coupe)
  const doors = style === "coupe" ? 2 : 4;
  addDoorCreases(
    g,
    halfW * 0.98,
    bodyY + 0.02,
    s.cz + s.cl * 0.42,
    s.cz - s.cl * 0.42,
    doors
  );

  // Side mirrors
  for (const side of [-1, 1]) {
    const mir = box(0.08, 0.05, 0.1, 0x1a1a1e, DARK);
    mir.position.set(side * (halfW + 0.04), bodyY + s.bh * 0.55, s.cz + s.cl * 0.25);
    g.add(mir);
  }

  addCarLights(g, {
    halfW,
    noseZ: noseZ - 0.02,
    tailZ: tailZ + 0.02,
    lightY: bodyY - 0.02,
    neon: style === "suv",
  });

  // Generic rear plate (random-ish short tag) unless caller supplies one
  if (opts.plate) {
    attachRearPlate(g, makePlate(opts.plate, { skyBlue: !!opts.skyPlate }), tailZ - 0.01, 0.3);
  } else {
    // Subtle blank-ish plate so the rear reads as a rear
    attachRearPlate(g, makePlate("· · ·"), tailZ - 0.01, 0.3);
  }

  // Wheelbase scales with length
  const wb = s.len * 0.28;
  addCarWheels(
    g,
    [
      [-halfW * 0.82, wb],
      [halfW * 0.82, wb],
      [-halfW * 0.82, -wb],
      [halfW * 0.82, -wb],
    ],
    s.wheelR,
    style === "suv" ? 0.16 : 0.13
  );

  return g;
}

/**
 * Typical Phoenix midsize SUV / crossover — the lot staple.
 *
 * Pearl/sand/silver paint, black lower cladding, roof rails, and a full-width
 * cyan-white neon DRL bar (with matching red rear light bar) that breathes and
 * flashes. Local +Z = nose.
 *
 * @param {number} [color]
 */
export function createPhxSuv(color) {
  const paintColor =
    color ?? PHX_SUV_COLORS[(Math.random() * PHX_SUV_COLORS.length) | 0];
  const g = new THREE.Group();
  g.name = "car";
  g.userData.carStyle = "phxSuv";
  g.userData.kind = "phxSuv";

  const paint = { roughness: 0.38, metalness: 0.28 };
  const cladding = 0x1a1c20;
  const w = 1.28;
  const halfW = w * 0.5;
  const stance = 0.07;
  const len = 2.35;
  const noseZ = len * 0.5;
  const tailZ = -len * 0.5;
  const bodyY = 0.4 + stance;
  const bh = 0.44;
  const ch = 0.42;

  // Black plastic lower body cladding (very "every RAV4 in Scottsdale")
  const clad = box(w + 0.06, 0.2, len * 0.96, cladding, DARK);
  clad.position.y = 0.22 + stance;
  g.add(clad);
  // Wheel-arch bulges
  for (const wz of [len * 0.28, -len * 0.28]) {
    for (const side of [-1, 1]) {
      const arch = box(0.1, 0.22, 0.42, cladding, DARK);
      arch.position.set(side * (halfW + 0.02), 0.28 + stance, wz);
      g.add(arch);
    }
  }

  // Main body
  const body = box(w, bh, len * 0.9, paintColor, paint);
  body.position.y = bodyY;
  g.add(body);

  // Hood
  const hood = box(w * 0.94, bh * 0.5, 0.52, paintColor, paint);
  hood.position.set(0, bodyY + 0.06, noseZ - 0.38);
  g.add(hood);

  // Greenhouse — tall, upright (crossover, not a coupe-SUV)
  const cabin = box(w * 0.9, ch, 1.28, 0x0e1620, {
    ...GLASS,
    emissiveIntensity: 0.08,
  });
  cabin.position.set(0, bodyY + bh * 0.5 + ch * 0.42, -0.02);
  g.add(cabin);

  const wind = box(w * 0.86, ch * 0.88, 0.36, 0x0a1218, GLASS);
  wind.position.set(0, bodyY + bh * 0.5 + ch * 0.4, 0.58);
  wind.rotation.x = -0.18;
  g.add(wind);

  const rearG = box(w * 0.84, ch * 0.8, 0.3, 0x0a1218, GLASS);
  rearG.position.set(0, bodyY + bh * 0.5 + ch * 0.38, -0.62);
  rearG.rotation.x = 0.14;
  g.add(rearG);

  // Roof + rails
  const roof = box(w * 0.86, 0.05, 1.15, paintColor, paint);
  roof.position.set(0, bodyY + bh * 0.5 + ch * 0.88, -0.04);
  g.add(roof);
  for (const side of [-1, 1]) {
    const rail = box(0.04, 0.035, 1.05, 0x2a2c32, DARK);
    rail.position.set(side * (halfW * 0.55), bodyY + bh * 0.5 + ch * 0.98, -0.04);
    g.add(rail);
    // Rail feet
    for (const z of [0.4, -0.4]) {
      const foot = box(0.05, 0.04, 0.08, 0x1a1a1e, DARK);
      foot.position.set(side * (halfW * 0.55), bodyY + bh * 0.5 + ch * 0.92, z);
      g.add(foot);
    }
  }

  // Roof spoiler lip
  const spoiler = box(w * 0.82, 0.04, 0.12, paintColor, paint);
  spoiler.position.set(0, bodyY + bh * 0.5 + ch * 0.85, -0.68);
  g.add(spoiler);

  addDoorCreases(g, halfW, bodyY + 0.02, 0.55, -0.55, 4);

  // Side mirrors
  for (const side of [-1, 1]) {
    const mir = box(0.09, 0.06, 0.12, cladding, DARK);
    mir.position.set(side * (halfW + 0.05), bodyY + bh * 0.55, 0.4);
    g.add(mir);
  }

  // ── Neon light package (the whole point of a Phoenix night lot) ──
  ensureLights(g, {
    neonHeavy: true,
    baseHead: 1.15,
    baseNeon: 1.55,
    baseTail: 0.95,
    baseMarker: 0.5,
  });

  // Full-width neon DRL light bar
  const drlBar = box(w * 0.92, 0.045, 0.055, 0xb8f8ff, {
    roughness: 0.12,
    metalness: 0.55,
    emissive: 0x60f0ff,
    emissiveIntensity: 1.6,
  });
  drlBar.position.set(0, bodyY + 0.08, noseZ - 0.01);
  g.add(drlBar);
  pushLight(g, drlBar, "neon");

  // Twin projector headlights
  for (const side of [-1, 1]) {
    const hl = box(0.24, 0.1, 0.08, 0xf4f8ff, {
      roughness: 0.14,
      metalness: 0.45,
      emissive: 0xe0f0ff,
      emissiveIntensity: 1.15,
    });
    hl.position.set(side * (halfW * 0.62), bodyY - 0.02, noseZ - 0.02);
    g.add(hl);
    pushLight(g, hl, "head");
    // Outer neon accent hook
    const hook = box(0.06, 0.16, 0.05, 0xa0f4ff, {
      roughness: 0.14,
      metalness: 0.5,
      emissive: 0x48e8ff,
      emissiveIntensity: 1.45,
    });
    hook.position.set(side * (halfW * 0.88), bodyY + 0.02, noseZ - 0.02);
    g.add(hook);
    pushLight(g, hook, "neon");
    // Amber marker
    const am = box(0.08, 0.04, 0.04, 0xffa030, {
      roughness: 0.3,
      emissive: 0xff8010,
      emissiveIntensity: 0.5,
    });
    am.position.set(side * (halfW * 0.9), bodyY - 0.1, noseZ - 0.03);
    g.add(am);
    pushLight(g, am, "marker");
  }

  // Dark grille mesh
  const grille = box(w * 0.55, 0.16, 0.06, 0x121418, DARK);
  grille.position.set(0, bodyY - 0.06, noseZ - 0.03);
  g.add(grille);
  for (let i = 0; i < 4; i++) {
    const bar = box(w * 0.48, 0.012, 0.03, 0x3a3e46, CHROME);
    bar.position.set(0, bodyY - 0.12 + i * 0.035, noseZ - 0.01);
    g.add(bar);
  }

  // Front bumper + skid plate
  const fBump = box(w * 1.02, 0.14, 0.16, cladding, DARK);
  fBump.position.set(0, 0.2 + stance, noseZ - 0.04);
  g.add(fBump);
  const skid = box(w * 0.45, 0.04, 0.1, 0x8a9098, CHROME);
  skid.position.set(0, 0.16 + stance, noseZ + 0.02);
  g.add(skid);

  // Vertical neon taillights + spanning red bar
  for (const side of [-1, 1]) {
    const tl = box(0.1, 0.28, 0.07, 0xff1840, {
      roughness: 0.22,
      metalness: 0.3,
      emissive: 0xff1040,
      emissiveIntensity: 1.05,
    });
    tl.position.set(side * (halfW * 0.82), bodyY + 0.06, tailZ + 0.02);
    g.add(tl);
    pushLight(g, tl, "tail");
  }
  const rearBar = box(w * 0.75, 0.04, 0.05, 0xff2850, {
    roughness: 0.2,
    metalness: 0.35,
    emissive: 0xff1848,
    emissiveIntensity: 1.2,
  });
  rearBar.position.set(0, bodyY + 0.12, tailZ + 0.02);
  g.add(rearBar);
  pushLight(g, rearBar, "neon");

  const rBump = box(w * 1.0, 0.12, 0.12, cladding, DARK);
  rBump.position.set(0, 0.2 + stance, tailZ + 0.03);
  g.add(rBump);

  // AZ plate
  attachRearPlate(g, makePlate("· PHX ·", { skyBlue: true }), tailZ - 0.01, 0.32);

  // Slightly larger crossover wheels
  const wb = len * 0.3;
  addCarWheels(
    g,
    [
      [-halfW * 0.84, wb],
      [halfW * 0.84, wb],
      [-halfW * 0.84, -wb],
      [halfW * 0.84, -wb],
    ],
    0.2,
    0.16
  );

  return g;
}

/**
 * Signature four-door black Ram pickup — crew cab + bed, chrome crosshair grille,
 * sky-blue AZ plate BGCPHX on the rear (and a matching front plate).
 */
export function createRamTruck() {
  const g = new THREE.Group();
  g.name = "car";
  g.userData.carStyle = "ram";
  g.userData.kind = "ram";

  const color = 0x0a0a0c; // near-black
  const paint = { roughness: 0.32, metalness: 0.38 };
  const w = 1.28;
  const halfW = w * 0.5;
  const stance = 0.08;
  const bodyY = 0.42 + stance;

  // Overall length: crew cab + short bed
  const cabLen = 1.35;
  const bedLen = 0.95;
  const noseLen = 0.55;
  const totalLen = noseLen + cabLen + bedLen; // ~2.85
  const noseZ = totalLen * 0.5;
  const tailZ = -totalLen * 0.5;

  // Rocker / side steps
  const rocker = box(w + 0.06, 0.14, totalLen * 0.96, 0x121214, DARK);
  rocker.position.y = 0.22 + stance;
  g.add(rocker);
  for (const side of [-1, 1]) {
    const step = box(0.08, 0.04, cabLen * 0.85, 0x2a2a30, CHROME);
    step.position.set(side * (halfW + 0.02), 0.16 + stance, noseZ - noseLen - cabLen * 0.5);
    g.add(step);
  }

  // Hood / front clip
  const hood = box(w * 0.96, 0.28, noseLen, color, paint);
  hood.position.set(0, bodyY + 0.02, noseZ - noseLen * 0.5);
  g.add(hood);
  // Power-bulge centre
  const bulge = box(w * 0.45, 0.06, noseLen * 0.7, color, paint);
  bulge.position.set(0, bodyY + 0.18, noseZ - noseLen * 0.5);
  g.add(bulge);

  // Crew cab body
  const cabBody = box(w, 0.4, cabLen, color, paint);
  cabBody.position.set(0, bodyY + 0.04, noseZ - noseLen - cabLen * 0.5);
  g.add(cabBody);

  // Cab greenhouse (taller — truck)
  const cabGlass = box(w * 0.9, 0.42, cabLen * 0.88, 0x0c141c, GLASS);
  const cabZ = noseZ - noseLen - cabLen * 0.5;
  cabGlass.position.set(0, bodyY + 0.42, cabZ);
  g.add(cabGlass);

  // Windshield
  const wind = box(w * 0.86, 0.38, 0.34, 0x0a1218, GLASS);
  wind.position.set(0, bodyY + 0.4, cabZ + cabLen * 0.38);
  wind.rotation.x = -0.2;
  g.add(wind);

  // Rear cab glass (backlight)
  const backlite = box(w * 0.84, 0.34, 0.12, 0x0a1218, GLASS);
  backlite.position.set(0, bodyY + 0.4, cabZ - cabLen * 0.42);
  g.add(backlite);

  // Roof
  const roof = box(w * 0.88, 0.05, cabLen * 0.82, color, paint);
  roof.position.set(0, bodyY + 0.64, cabZ);
  g.add(roof);

  // Four-door creases on the cab
  addDoorCreases(g, halfW, bodyY + 0.05, cabZ + cabLen * 0.38, cabZ - cabLen * 0.38, 4);
  // Beltline chrome strip
  const belt = box(w + 0.02, 0.025, cabLen * 0.9, 0xc0c4c8, CHROME);
  belt.position.set(0, bodyY + 0.22, cabZ);
  g.add(belt);

  // Bed
  const bedZ = tailZ + bedLen * 0.5;
  const bedFloor = box(w * 0.92, 0.08, bedLen * 0.95, 0x1a1a1e, DARK);
  bedFloor.position.set(0, bodyY - 0.02, bedZ);
  g.add(bedFloor);
  // Bed walls
  for (const side of [-1, 1]) {
    const wall = box(0.06, 0.28, bedLen * 0.92, color, paint);
    wall.position.set(side * (halfW * 0.9), bodyY + 0.12, bedZ);
    g.add(wall);
  }
  // Tailgate
  const gate = box(w * 0.9, 0.28, 0.08, color, paint);
  gate.position.set(0, bodyY + 0.1, tailZ + 0.06);
  g.add(gate);
  // Bed rails
  for (const side of [-1, 1]) {
    const rail = box(0.04, 0.04, bedLen * 0.85, 0xb0b4b8, CHROME);
    rail.position.set(side * (halfW * 0.88), bodyY + 0.28, bedZ);
    g.add(rail);
  }

  // ── Signature Ram crosshair grille (reads immediately as the front) ──
  const grilleZ = noseZ - 0.02;
  const grilleSurround = box(w * 0.88, 0.28, 0.08, 0x1c1c20, DARK);
  grilleSurround.position.set(0, bodyY - 0.02, grilleZ);
  g.add(grilleSurround);
  // Outer chrome ring
  const grilleChrome = box(w * 0.82, 0.24, 0.05, 0xd0d4d8, CHROME);
  grilleChrome.position.set(0, bodyY - 0.02, grilleZ + 0.02);
  g.add(grilleChrome);
  // Black mesh face
  const meshFace = box(w * 0.72, 0.18, 0.04, 0x0e0e10, DARK);
  meshFace.position.set(0, bodyY - 0.02, grilleZ + 0.04);
  g.add(meshFace);
  // Crosshair — vertical
  const crossV = box(0.06, 0.2, 0.05, 0xe0e4e8, CHROME);
  crossV.position.set(0, bodyY - 0.02, grilleZ + 0.055);
  g.add(crossV);
  // Crosshair — horizontal
  const crossH = box(w * 0.7, 0.05, 0.05, 0xe0e4e8, CHROME);
  crossH.position.set(0, bodyY - 0.02, grilleZ + 0.055);
  g.add(crossH);
  // Ram badge puck
  const badge = cyl(0.05, 0.05, 0.03, 0xc8ccd0, CHROME, 10);
  badge.rotation.x = Math.PI / 2;
  badge.position.set(0, bodyY - 0.02, grilleZ + 0.07);
  g.add(badge);

  // Quad headlights (C-shaped blocks simplified to stacked pairs)
  ensureLights(g, { neonHeavy: true, baseHead: 1.1, baseNeon: 1.2, baseTail: 0.9 });
  for (const side of [-1, 1]) {
    for (const row of [0.07, -0.05]) {
      const hl = box(0.16, 0.09, 0.07, 0xf2f6ff, {
        roughness: 0.16,
        metalness: 0.4,
        emissive: 0xd0e4ff,
        emissiveIntensity: 0.95,
      });
      hl.position.set(side * (halfW * 0.72), bodyY + row, grilleZ + 0.02);
      g.add(hl);
      pushLight(g, hl, "head");
    }
    // Amber marker
    const am = box(0.07, 0.05, 0.04, 0xff9020, {
      roughness: 0.3,
      emissive: 0xff7010,
      emissiveIntensity: 0.45,
    });
    am.position.set(side * (halfW * 0.88), bodyY - 0.1, grilleZ);
    g.add(am);
    pushLight(g, am, "marker");
  }
  // Thin neon DRL under the crosshair
  const ramDrl = box(w * 0.7, 0.03, 0.04, 0xb0f0ff, {
    roughness: 0.14,
    metalness: 0.5,
    emissive: 0x50e8ff,
    emissiveIntensity: 1.2,
  });
  ramDrl.position.set(0, bodyY - 0.14, grilleZ + 0.05);
  g.add(ramDrl);
  pushLight(g, ramDrl, "neon");

  // Front bumper / chin
  const fBump = box(w * 1.02, 0.14, 0.18, 0x1a1a1e, DARK);
  fBump.position.set(0, 0.2 + stance, noseZ - 0.04);
  g.add(fBump);
  const fBar = box(w * 0.7, 0.04, 0.06, 0xc8ccd0, CHROME);
  fBar.position.set(0, 0.22 + stance, noseZ + 0.02);
  g.add(fBar);

  // Rear taillights (vertical truck style)
  for (const side of [-1, 1]) {
    const tl = box(0.1, 0.22, 0.06, 0xff1828, {
      roughness: 0.28,
      metalness: 0.2,
      emissive: 0xff1020,
      emissiveIntensity: 0.85,
    });
    tl.position.set(side * (halfW * 0.85), bodyY + 0.08, tailZ + 0.04);
    g.add(tl);
    pushLight(g, tl, "tail");
  }
  const rBump = box(w * 0.98, 0.12, 0.12, 0x1a1a1e, DARK);
  rBump.position.set(0, 0.2 + stance, tailZ + 0.04);
  g.add(rBump);

  // Mirrors
  for (const side of [-1, 1]) {
    const arm = box(0.12, 0.04, 0.04, 0x1a1a1e, DARK);
    arm.position.set(side * (halfW + 0.06), bodyY + 0.28, cabZ + cabLen * 0.3);
    g.add(arm);
    const mir = box(0.1, 0.1, 0.06, 0x1a1a1e, DARK);
    mir.position.set(side * (halfW + 0.14), bodyY + 0.28, cabZ + cabLen * 0.3);
    g.add(mir);
  }

  // Sky-blue plates — BGCPHX
  attachRearPlate(g, makePlate("BGCPHX", { skyBlue: true }), tailZ - 0.02, 0.34);
  attachFrontPlate(g, makePlate("BGCPHX", { skyBlue: true }), noseZ + 0.01, 0.28);

  // Bigger off-road-ish wheels
  const wheelR = 0.22;
  const wbFront = noseZ - noseLen * 0.55;
  const wbRear = tailZ + bedLen * 0.35;
  addCarWheels(
    g,
    [
      [-halfW * 0.85, wbFront],
      [halfW * 0.85, wbFront],
      [-halfW * 0.85, wbRear],
      [halfW * 0.85, wbRear],
    ],
    wheelR,
    0.18
  );

  return g;
}

export function createPedestrian(color) {
  const g = new THREE.Group();
  const body = cyl(0.12, 0.15, 0.55, color, {}, 5);
  body.position.y = 0.55;
  g.add(body);
  const head = cyl(0.12, 0.12, 0.22, 0xe8c4a8, {}, 5);
  head.position.y = 0.95;
  g.add(head);
  return g;
}
