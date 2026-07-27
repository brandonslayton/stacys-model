/**
 * kit.js — shared low-poly primitives + night-lighting system.
 *
 * Extracted verbatim from Melrose Rising's js/builders.js (the exact transitive
 * dependency closure of createStacys, nothing more). Treat this file as
 * READ-ONLY: it is the contract with the parent game. Improvements to the
 * Stacy's model belong in stacys.js so they port back cleanly.
 *
 * Night system contract, for the viewer:
 *   installVenueNight(group, nightMats, opts)  ->  sets up
 *     group.userData.setNight(t)    t in 0..1  (0 = noon, 1 = full night)
 *     group.userData.tickNight(now) call per frame for glimmer/flash animation
 */
import * as THREE from "three";
import { COLORS } from "./colors.js";

export const mat = (color, opts = {}) =>
  new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.85,
    metalness: opts.metalness ?? 0.05,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
    flatShading: true,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
  });

export function box(w, h, d, color, opts = {}) {
  const { castShadow = true, receiveShadow = true, ...matOpts } = opts;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, matOpts));
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  return mesh;
}

export function cyl(rTop, rBot, h, color, opts, segs = 6) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(rTop, rBot, h, segs),
    mat(color, opts)
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function neonBox(w, h, d, color, intensity = 0.45) {
  return box(w, h, d, color, {
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.4,
  });
}

/**
 * Track an emissive material for day/night ramping.
 * Day intensity stays near-off so neons read as unlit until nightT rises.
 */
export function trackNightMat(
  nightMats,
  material,
  nightIntensity,
  dayIntensity = 0.018,
  opts = {}
) {
  if (!material || !nightMats) return material;
  material.emissiveIntensity = dayIntensity;
  nightMats.push({
    mat: material,
    day: dayIntensity,
    night: nightIntensity,
    glimmer: !!opts.glimmer,
    glimmerSpeed: opts.glimmerSpeed ?? 3.2,
    phase: opts.phase ?? Math.random() * 10,
  });
  return material;
}

export function trackNightMesh(
  nightMats,
  mesh,
  nightIntensity,
  dayIntensity = 0.018,
  opts = {}
) {
  if (mesh?.material)
    trackNightMat(nightMats, mesh.material, nightIntensity, dayIntensity, opts);
  return mesh;
}

/**
 * Install setNight(nightT) + tickNight(now) on a venue group.
 * nightT 0 = day (neons off), 1 = deep night (full glow).
 * Optional flashMats / flashLights for dance-floor color pulses (Stacy's).
 * nightMats entries may set glimmer:true for a soft neon shimmer at night.
 */
export function installVenueNight(g, nightMats, opts = {}) {
  const lights = opts.lights || [];
  const flashMats = opts.flashMats || [];
  const flashLights = opts.flashLights || [];
  g.userData.venueNight = {
    mats: nightMats,
    lights,
    flashMats,
    flashLights,
    nightT: 0,
    flashPhase: Math.random() * 12,
  };
  g.userData.setNight = (nightT) => {
    const t = Math.max(0, Math.min(1, nightT));
    g.userData.venueNight.nightT = t;
    for (const e of nightMats) {
      if (!e?.mat) continue;
      // Base level; glimmer mats get animated in tickNight
      e.mat.emissiveIntensity = e.day + (e.night - e.day) * t;
    }
    for (const e of lights) {
      if (!e?.light) continue;
      const day = e.day ?? 0;
      const night = e.night ?? 1.2;
      e.light.intensity = day + (night - day) * t;
    }
    if (t < 0.12) {
      for (const e of flashMats) {
        if (e?.mat) e.mat.emissiveIntensity = e.day ?? 0.02;
      }
      for (const e of flashLights) {
        if (e?.light) e.light.intensity = 0;
      }
    }
  };
  g.userData.tickNight = (now) => {
    const vn = g.userData.venueNight;
    if (!vn || vn.nightT < 0.12) return;
    const t = vn.nightT;
    const s = now * 0.001 + vn.flashPhase;

    // Soft neon glimmer / shine on marked mats (patio bulbs, LED rails)
    nightMats.forEach((e, i) => {
      if (!e?.mat || !e.glimmer) return;
      const base = e.day + (e.night - e.day) * t;
      const sp = e.glimmerSpeed || 3.2;
      const ph = e.phase ?? i;
      // Layered sines = living neon flicker / shimmer
      const shimmer =
        0.82 +
        0.12 * Math.sin(s * sp + ph) +
        0.06 * Math.sin(s * sp * 2.35 + ph * 1.7) +
        0.04 * Math.sin(s * sp * 5.1 + ph * 0.4);
      e.mat.emissiveIntensity = base * shimmer;
    });

    flashMats.forEach((e, i) => {
      if (!e?.mat) return;
      const pulse =
        0.45 + 0.55 * Math.sin(s * (e.speed || 4.2) + i * 1.7);
      const beat = Math.sin(s * (e.beat || 2.4) + i * 0.9) > 0.5 ? 1 : 0.32;
      const mix = pulse * 0.5 + beat * 0.5;
      const day = e.day ?? 0.03;
      const night = e.night ?? 1.0;
      e.mat.emissiveIntensity = day + (night - day) * t * mix;
      if (e.colors?.length && e.mat.emissive) {
        const ci =
          Math.floor(s * (e.colorSpeed || 2.1) + i * 1.3) % e.colors.length;
        e.mat.emissive.setHex(
          e.colors[((ci % e.colors.length) + e.colors.length) % e.colors.length]
        );
      }
    });
    flashLights.forEach((e, i) => {
      if (!e?.light) return;
      const pulse =
        0.35 + 0.65 * Math.max(0, Math.sin(s * (e.speed || 5.2) + i * 2.0));
      e.light.intensity = (e.night ?? 1.1) * t * pulse;
      if (e.colors?.length) {
        const ci = Math.floor(s * 2.6 + i * 0.8) % e.colors.length;
        e.light.color.setHex(
          e.colors[((ci % e.colors.length) + e.colors.length) % e.colors.length]
        );
      }
    });
  };
  g.userData.setNight(0);
}

/**
 * Patio string-light bulbs along a polyline of [x,z] posts at height y.
 * opts.glimmer — soft neon shimmer at night; opts.night — peak emissive.
 */
export function addPatioStringLights(g, nightMats, posts, y, colors, scale = 1, opts = {}) {
  const bulbs = [];
  const nightI = opts.night ?? 1.15;
  const segs = opts.segs ?? 6;
  const glimmer = opts.glimmer !== false;
  for (let i = 0; i < posts.length; i++) {
    const [x0, z0] = posts[i];
    const [x1, z1] = posts[(i + 1) % posts.length];
    for (let s = 0; s < segs; s++) {
      const t = (s + 0.5) / segs;
      const sag = Math.sin(t * Math.PI) * 0.14 * scale;
      const bx = x0 + (x1 - x0) * t;
      const bz = z0 + (z1 - z0) * t;
      const col = colors[(i * segs + s) % colors.length];
      // Larger “glass” bulb + bright core for neon read
      const bulb = box(0.1 * scale, 0.12 * scale, 0.1 * scale, col, {
        emissive: col,
        emissiveIntensity: 0.02,
        roughness: 0.28,
        metalness: 0.08,
      });
      bulb.position.set(bx, y - sag, bz);
      g.add(bulb);
      trackNightMesh(nightMats, bulb, nightI, 0.015, {
        glimmer,
        glimmerSpeed: 2.6 + (s % 3) * 0.45,
        phase: i * 1.1 + s * 0.55,
      });
      // Tiny hot core
      const core = box(0.05 * scale, 0.06 * scale, 0.05 * scale, 0xffffff, {
        emissive: 0xffffff,
        emissiveIntensity: 0.02,
        roughness: 0.25,
      });
      core.position.set(bx, y - sag, bz);
      g.add(core);
      trackNightMesh(nightMats, core, nightI * 1.15, 0.01, {
        glimmer,
        glimmerSpeed: 3.4 + (s % 4) * 0.3,
        phase: i * 0.8 + s * 0.9,
      });
      bulbs.push(bulb);
    }
  }
  return bulbs;
}

/** Agave / century plant — radial blue-green leaves. */
export function createAgave(x = 0, z = 0, scale = 1) {
  const g = new THREE.Group();
  const leaves = 8;
  const col = Math.random() > 0.5 ? COLORS.agave : COLORS.agaveBlue;
  for (let i = 0; i < leaves; i++) {
    const a = (i / leaves) * Math.PI * 2;
    const leaf = box(0.14 * scale, 0.05 * scale, 0.85 * scale, col);
    leaf.position.set(
      Math.sin(a) * 0.2 * scale,
      0.2 * scale + (i % 2) * 0.06 * scale,
      Math.cos(a) * 0.2 * scale
    );
    leaf.rotation.y = a;
    leaf.rotation.x = 0.55 + (i % 3) * 0.1;
    g.add(leaf);
  }
  // Center bud
  const bud = cyl(0.06 * scale, 0.12 * scale, 0.25 * scale, col, {}, 5);
  bud.position.y = 0.2 * scale;
  g.add(bud);
  g.position.set(x, 0, z);
  g.rotation.y = Math.random() * Math.PI;
  return g;
}

/**
 * Small Sonoran scrub bush (creosote / desert broom vibe) — low, rounded, dusty green.
 */
export function createDesertBush(x = 0, z = 0, scale = 1) {
  const g = new THREE.Group();
  const greens = [0x4a6a3a, 0x3d5c32, 0x5a7a45, 0x455e38, 0x6a8a4e];
  // Woody stem base
  const stem = cyl(0.04 * scale, 0.07 * scale, 0.28 * scale, 0x5a4838, { roughness: 0.95 }, 5);
  stem.position.y = 0.14 * scale;
  g.add(stem);
  // Overlapping foliage puffs
  const puffs = [
    [0, 0.42, 0, 0.42, 0.32, 0.4],
    [-0.22, 0.38, 0.08, 0.28, 0.24, 0.26],
    [0.2, 0.36, -0.1, 0.3, 0.22, 0.28],
    [0.05, 0.52, 0.12, 0.24, 0.2, 0.22],
    [-0.12, 0.48, -0.14, 0.22, 0.18, 0.24],
    [0.18, 0.44, 0.18, 0.2, 0.16, 0.2],
  ];
  puffs.forEach((p, i) => {
    const [ox, oy, oz, sx, sy, sz] = p;
    const puff = new THREE.Mesh(
      new THREE.SphereGeometry(1, 6, 5),
      mat(greens[i % greens.length], { roughness: 0.95 })
    );
    puff.position.set(ox * scale, oy * scale, oz * scale);
    puff.scale.set(sx * scale, sy * scale, sz * scale);
    puff.castShadow = i < 3;
    puff.receiveShadow = false;
    g.add(puff);
  });
  // Tiny twig tips
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const tw = box(0.03 * scale, 0.12 * scale, 0.03 * scale, 0x4a3a28);
    tw.position.set(Math.cos(a) * 0.22 * scale, 0.55 * scale, Math.sin(a) * 0.2 * scale);
    tw.rotation.z = Math.cos(a) * 0.4;
    tw.rotation.x = Math.sin(a) * 0.35;
    g.add(tw);
  }
  g.position.set(x, 0, z);
  g.rotation.y = (x * 1.7 + z) * 0.3;
  return g;
}

/**
 * Organic shade tree (Bunkhouse style) — irregular canopy, leaf frizz, real shade.
 *
 * @param {number} x
 * @param {number} z
 * @param {object} [opts]
 * @param {"short"|"medium"|"tall"|"patio"} [opts.variant="medium"]
 * @param {number} [opts.leanX=0]  trunk lean (rad) toward +Z
 * @param {number} [opts.yaw=0]    whole-tree rotation about Y
 * @param {number} [opts.seed=0]   integer seed for slight limb/canopy variety
 */
export function createShadeTree(x = 0, z = 0, opts = {}) {
  const variant = opts.variant || "medium";
  const leanX = opts.leanX ?? 0.05;
  const yaw = opts.yaw ?? 0;
  const seed = (opts.seed | 0) || 0;

  // Height + canopy mass by variant (patio ≈ original Bunkhouse tree)
  const profiles = {
    short: { trunkH: 3.15, limbScale: 0.78, puffScale: 0.82, leafN: 100, outerN: 36, ringN: 4 },
    medium: { trunkH: 3.85, limbScale: 0.92, puffScale: 0.95, leafN: 120, outerN: 44, ringN: 4 },
    tall: { trunkH: 5.15, limbScale: 1.12, puffScale: 1.15, leafN: 155, outerN: 55, ringN: 6 },
    patio: { trunkH: 4.4, limbScale: 1.0, puffScale: 1.0, leafN: 140, outerN: 50, ringN: 5 },
  };
  const p = profiles[variant] || profiles.medium;
  const { trunkH, limbScale, puffScale, leafN, outerN, ringN } = p;

  const g = new THREE.Group();
  g.name = `shadeTree_${variant}`;

  const trunk = cyl(0.12 * limbScale, 0.2 * limbScale, trunkH, 0x6a5040, { roughness: 0.93 }, 7);
  trunk.position.set(0, trunkH / 2, 0);
  g.add(trunk);
  trunk.rotation.x = leanX;

  for (let i = 0; i < ringN; i++) {
    const ring = cyl(
      0.13 * limbScale + i * 0.008,
      0.14 * limbScale + i * 0.008,
      0.1,
      0x5a4030,
      {},
      6
    );
    ring.position.set(0, 0.45 + i * (trunkH * 0.16), i * 0.012);
    g.add(ring);
  }

  // Limb recipes — base angles; seed rotates the set
  const limbSpecs = [
    [0.2, 0.55, 1.9, 0.62, 0.9],
    [1.0, 0.4, 1.55, 0.7, 0.5],
    [2.0, 0.5, 1.7, 0.58, 0.35],
    [2.9, 0.35, 1.45, 0.75, 0.2],
    [3.8, 0.55, 1.85, 0.65, 0.85],
    [4.6, 0.42, 1.5, 0.72, 0.55],
    [5.4, 0.48, 1.65, 0.6, 0.7],
    [0.7, 0.65, 1.35, 0.82, 0.95],
    [5.0, 0.7, 1.4, 0.85, 1.0],
  ];
  // Short trees drop a couple high limbs; tall keeps all + denser
  const limbCount =
    variant === "short" ? 7 : variant === "medium" ? 8 : limbSpecs.length;
  const seedRot = seed * 0.37;
  const branchTips = [];

  for (let i = 0; i < limbCount; i++) {
    const [a0, elev, len0, yf, towardBldg] = limbSpecs[i];
    const a = a0 + seedRot;
    const len = len0 * limbScale * (0.92 + ((seed + i) % 3) * 0.05);
    const dirX = Math.cos(a) * (1 - towardBldg * 0.35);
    const dirZ = Math.sin(a) * (1 - towardBldg * 0.2) + towardBldg * 0.55;
    const n = Math.hypot(dirX, dirZ) || 1;
    const dx = (dirX / n) * len;
    const dz = (dirZ / n) * len;
    const by = trunkH * yf;
    const br = cyl(0.035 * limbScale, 0.08 * limbScale, len, 0x5c4838, { roughness: 0.9 }, 5);
    br.position.set(dx * 0.45, by + elev * 0.25, dz * 0.45);
    br.rotation.z = -Math.atan2(dx, len) * 0.85;
    br.rotation.x = Math.atan2(dz, len) * 0.85 + elev * 0.3;
    g.add(br);
    branchTips.push({
      x: dx * 0.95,
      y: by + elev * 0.55 + len * 0.15,
      z: dz * 0.95,
    });
  }

  const twigTips = [];
  const twigsPer = variant === "short" ? 2 : 3;
  for (let i = 0; i < branchTips.length; i++) {
    const tip = branchTips[i];
    for (let j = 0; j < twigsPer; j++) {
      const a = i * 1.9 + j * 2.3 + seed * 0.2;
      const twLen = (0.55 + (j % 2) * 0.2) * limbScale;
      const tw = cyl(0.016, 0.03, twLen, 0x4a3a2c, {}, 4);
      const ox = Math.cos(a) * 0.28 * limbScale;
      const oz = Math.sin(a) * 0.28 * limbScale;
      tw.position.set(tip.x + ox, tip.y + 0.18 + j * 0.08, tip.z + oz);
      tw.rotation.z = Math.cos(a) * 0.5;
      tw.rotation.x = Math.sin(a) * 0.4;
      g.add(tw);
      twigTips.push({
        x: tip.x + ox * 1.4,
        y: tip.y + 0.35 + j * 0.1,
        z: tip.z + oz * 1.4,
      });
    }
  }
  const leafAnchors = branchTips.concat(twigTips);

  const canopyCols = [0x2f6a34, 0x3d8a42, 0x4a9a4e, 0x357a3a, 0x458848, 0x2a5e30];
  // Canopy recipes — offset by seed so variants don't look identical
  const canopyPuffs = [
    [0.1, 0.15, 0.35, 1.55, 1.15, 1.45, 0],
    [-0.5, 0.0, 0.1, 1.2, 1.0, 1.15, 1],
    [0.55, -0.1, 0.2, 1.15, 0.95, 1.1, 2],
    [0.0, 0.45, 0.5, 1.35, 1.05, 1.25, 3],
    [0.35, -0.35, 0.85, 1.25, 0.9, 1.15, 4],
    [-0.25, -0.3, 0.75, 1.1, 0.85, 1.05, 5],
    [0.15, 0.7, 0.25, 1.0, 0.85, 0.95, 1],
    [0.7, 0.2, 0.55, 0.95, 0.8, 0.9, 2],
    [-0.65, 0.15, 0.45, 0.9, 0.75, 0.85, 0],
    [0.2, -0.55, 1.15, 1.15, 0.75, 1.0, 3],
    [-0.15, -0.5, 1.05, 1.05, 0.7, 0.95, 4],
    [0.45, 0.35, 0.0, 0.85, 0.7, 0.8, 5],
  ];
  const puffCount =
    variant === "short" ? 9 : variant === "medium" ? 11 : canopyPuffs.length;
  const crownBaseY = trunkH + 0.15;
  const seedOff = ((seed % 5) - 2) * 0.08;

  for (let i = 0; i < puffCount; i++) {
    const [ox, oy, oz, sx, sy, sz, ci] = canopyPuffs[i];
    const puff = new THREE.Mesh(
      new THREE.SphereGeometry(1, 6, 5),
      mat(canopyCols[(ci + seed) % canopyCols.length], { roughness: 0.95 })
    );
    puff.position.set(
      (ox + seedOff) * puffScale,
      crownBaseY + oy * puffScale,
      (oz + seedOff * 0.5) * puffScale
    );
    puff.scale.set(
      sx * puffScale * (1 + (i % 3) * 0.08),
      sy * puffScale * 0.85,
      sz * puffScale * (1.05 + (i % 2) * 0.1)
    );
    puff.rotation.y = i * 0.7 + seed * 0.2;
    puff.rotation.z = ((i % 4) - 1.5) * 0.12;
    puff.castShadow = true;
    puff.receiveShadow = false;
    g.add(puff);
  }

  const leafCols = [0x3f8a45, 0x4e9a52, 0x357a3c, 0x5aaa58, 0x2f6a34, 0x6ab860, 0x3a7a40];
  const leafGeo = new THREE.BoxGeometry(0.28, 0.04, 0.34);
  for (let i = 0; i < leafN; i++) {
    const tip = leafAnchors[i % leafAnchors.length];
    const a = i * 2.399 + seed * 0.1;
    const r = (0.2 + (i % 8) * 0.1) * limbScale;
    const biasZ = (i % 3 === 0 ? 0.35 : 0.1) * ((i % 5) * 0.08) * limbScale;
    const leaf = new THREE.Mesh(
      leafGeo,
      mat(leafCols[i % leafCols.length], { roughness: 0.88 })
    );
    leaf.position.set(
      tip.x + Math.cos(a) * r + ((i * 17) % 5) * 0.03 - 0.06,
      tip.y + ((i * 13) % 9) * 0.07 - 0.15 + (i % 4) * 0.04,
      tip.z + Math.sin(a) * r + biasZ
    );
    leaf.rotation.set(
      ((i * 7) % 10) * 0.14 - 0.5,
      a + (i % 3) * 0.4,
      ((i * 5) % 8) * 0.12 - 0.35
    );
    leaf.scale.set(0.85 + (i % 4) * 0.2, 1, 0.8 + (i % 3) * 0.22);
    leaf.castShadow = i % 6 === 0;
    g.add(leaf);
  }

  for (let i = 0; i < outerN; i++) {
    const a = (i / outerN) * Math.PI * 2 + (i % 3) * 0.15 + seed * 0.05;
    const elev = ((i * 7) % 10) / 10;
    const rr = (1.05 + (i % 5) * 0.14 + (i % 2) * 0.08) * puffScale;
    const ly = crownBaseY - 0.5 + elev * 1.7 * puffScale;
    const leaf = new THREE.Mesh(
      leafGeo,
      mat(leafCols[i % leafCols.length], { roughness: 0.9 })
    );
    leaf.position.set(
      Math.cos(a) * rr * (0.8 + elev * 0.25),
      ly,
      Math.sin(a) * rr * 0.7 + 0.35 * puffScale
    );
    leaf.rotation.set(0.3 - elev * 0.5, a, (i % 5) * 0.1);
    leaf.scale.set(1.05 + (i % 3) * 0.15, 1, 0.95 + (i % 2) * 0.15);
    leaf.castShadow = false;
    g.add(leaf);
  }

  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  return g;
}

export function addPick(g, w, h, d, extraZ = 1.6) {
  const pick = new THREE.Mesh(
    new THREE.BoxGeometry(w * 1.05, h + 0.6, d + extraZ),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  pick.position.set(0, (h + 0.6) / 2, extraZ * 0.15);
  pick.name = "pick";
  g.add(pick);
}

/**
 * Canonical Melrose parking stalls — white lane lines + concrete wheel stops.
 * Use everywhere so lots match (Stacy’s / Bunkhouse / Rock / Royale / free lots).
 *
 * Cars face along `depthAxis`. `span` is total bay width across the row of stalls.
 * `stopAt` is which end of the depth axis gets the concrete bumper bars.
 *
 * @param {THREE.Group} g
 * @param {{
 *   count: number,
 *   cx: number,
 *   cz: number,
 *   depth: number,
 *   span: number,
 *   depthAxis?: "x" | "z",
 *   stopAt?: "min" | "max",
 *   markY?: number,
 * }} opts
 */
export function addParkingStalls(g, opts) {
  const count = Math.max(1, opts.count | 0);
  const cx = opts.cx;
  const cz = opts.cz;
  const depth = opts.depth;
  const span = opts.span;
  const depthAxis = opts.depthAxis === "z" ? "z" : "x";
  const stopAt = opts.stopAt === "max" ? "max" : "min";
  const markY = opts.markY ?? 0.09;

  // Shared geometry (same numbers as Stacy’s / Bunkhouse lots)
  const lineLen = depth * 0.92;
  const lineThick = 0.08;
  const lineH = 0.03;
  const stopLong = 0.78;
  const stopDeep = 0.14;
  const stopH = 0.12;
  const stopCol = 0xb8b4a8;
  const stopAlong = (stopAt === "max" ? 1 : -1) * (depth * 0.45 - 0.08);

  for (let i = 0; i <= count; i++) {
    const across = -span * 0.45 + (i * (span * 0.9)) / count;
    let line;
    if (depthAxis === "x") {
      line = box(lineLen, lineH, lineThick, COLORS.laneMark, {
        castShadow: false,
      });
      line.position.set(cx, markY, cz + across);
    } else {
      line = box(lineThick, lineH, lineLen, COLORS.laneMark, {
        castShadow: false,
      });
      line.position.set(cx + across, markY, cz);
    }
    g.add(line);
  }

  for (let i = 0; i < count; i++) {
    const across =
      -span * 0.38 +
      (i * (span * 0.85)) / Math.max(1, count - 1);
    let stop;
    if (depthAxis === "x") {
      stop = box(stopDeep, stopH, stopLong, stopCol);
      stop.position.set(cx + stopAlong, markY + 0.05, cz + across);
    } else {
      stop = box(stopLong, stopH, stopDeep, stopCol);
      stop.position.set(cx + across, markY + 0.05, cz + stopAlong);
    }
    g.add(stop);
  }
}

export function addDoor(g, x, z, w = 0.75, h = 1.45, color = 0x1a1520) {
  const door = box(w, h, 0.08, color);
  door.position.set(x, h / 2, z);
  g.add(door);
  const handle = box(0.06, 0.12, 0.06, 0xc0a060, { metalness: 0.4, roughness: 0.4 });
  handle.position.set(x + w * 0.28, h * 0.5, z + 0.06);
  g.add(handle);
}

/** Canvas → Three texture helper (sRGB, no mips needed for signs/murals). */
export function canvasTexture(canvas, anisotropy = 8) {
  const tex = new THREE.CanvasTexture(canvas);
  if ("colorSpace" in tex) tex.colorSpace = THREE.SRGBColorSpace;
  else if ("encoding" in tex) tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

/** Ensure brand faces are ready before painting canvas sign textures. */
export async function ensureSignFonts() {
  if (!document.fonts?.load) return;
  try {
    await Promise.all([
      document.fonts.load(`700 200px ${STACYS_DISPLAY}`),
      document.fonts.load(`800 200px ${STACYS_DISPLAY}`),
      document.fonts.load(`600 48px ${STACYS_UI}`),
      document.fonts.load(`700 48px ${STACYS_UI}`),
    ]);
    await document.fonts.ready;
  } catch {
    /* fall back to system faces */
  }
}

export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Lighten/darken a #rrggbb color by factor (1 = same). */
export function shadeHex(hex, factor) {
  const n = parseInt(hex.slice(1), 16);
  let r = ((n >> 16) & 255) * factor;
  let g = ((n >> 8) & 255) * factor;
  let b = (n & 255) * factor;
  r = Math.max(0, Math.min(255, Math.round(r)));
  g = Math.max(0, Math.min(255, Math.round(g)));
  b = Math.max(0, Math.min(255, Math.round(b)));
  return `rgb(${r},${g},${b})`;
}

/**
 * Hanging pride flag from a wall bracket (vertical drape).
 * @param yArm  world Y of the horizontal arm (flag hangs down from here)
 * Arm extends along local +X; use yaw to aim it (π → hang out from north wall).
 */
export function addHangingPrideFlag(g, x, yArm, z, scale = 1, yaw = 0) {
  const s = scale;
  const root = new THREE.Group();
  root.name = "hangingPrideFlag";
  // Bracket plate at arm height (mounted at top of door / under awning)
  const plate = box(0.08 * s, 0.2 * s, 0.2 * s, 0x4a5058, {
    metalness: 0.35,
    roughness: 0.5,
  });
  plate.position.set(0, yArm, 0);
  root.add(plate);
  // Short vertical stem under the arm (reads as a mount, not a tall pole)
  const stem = cyl(0.028 * s, 0.032 * s, 0.28 * s, 0x6a7078, {
    metalness: 0.4,
    roughness: 0.45,
  }, 6);
  stem.position.set(0, yArm - 0.12 * s, 0);
  root.add(stem);
  // Horizontal arm — flag hangs from this
  const arm = box(0.7 * s, 0.04 * s, 0.04 * s, 0x5a6068, {
    metalness: 0.35,
    roughness: 0.5,
  });
  arm.position.set(0.32 * s, yArm, 0);
  root.add(arm);
  // Finial ball
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.045 * s, 8, 6),
    mat(0x8a9098, { metalness: 0.4, roughness: 0.4 })
  );
  ball.position.set(0.66 * s, yArm, 0);
  root.add(ball);
  // Rainbow strips hang down from the arm
  const colors = [0xe53935, 0xfb8c00, 0xfdd835, 0x43a047, 0x1e88e5, 0x8e24aa];
  colors.forEach((c, i) => {
    const strip = box(0.6 * s, 0.16 * s, 0.04 * s, c, {
      roughness: 0.55,
      emissive: c,
      emissiveIntensity: 0.2,
    });
    strip.position.set(
      0.36 * s,
      yArm - 0.1 * s - i * 0.16 * s,
      0.03 * s
    );
    strip.rotation.z = 0.04 * ((i % 3) - 1);
    root.add(strip);
  });
  root.position.set(x, 0, z);
  root.rotation.y = yaw;
  g.add(root);
}

/**
 * Low-poly dumpster for the back of venues (Leslie).
 * A few ribs / rails / hinges only — still reads as the same character.
 */
export function createDumpster(x = 0, z = 0) {
  const g = new THREE.Group();
  g.userData.isLeslie = true;
  const metal = { metalness: 0.28, roughness: 0.62 };
  const dark = { metalness: 0.32, roughness: 0.55 };

  // Main body
  const body = box(1.15, 0.95, 0.75, 0x3d5c42, metal);
  body.position.y = 0.55;
  g.add(body);

  // Top rim (lip around the open mouth)
  const rim = box(1.22, 0.06, 0.82, 0x324a38, dark);
  rim.position.y = 1.0;
  g.add(rim);

  // Horizontal body ribs — just two, enough to read as stamped steel
  for (const dy of [-0.18, 0.12]) {
    const rib = box(1.18, 0.04, 0.78, 0x354f3a, metal);
    rib.position.set(0, 0.55 + dy, 0);
    g.add(rib);
  }

  // Lid (slightly ajar)
  const lid = box(1.2, 0.1, 0.8, 0x2a4030, dark);
  lid.position.set(0, 1.08, -0.05);
  lid.rotation.x = -0.12;
  lid.name = "leslieLid";
  g.add(lid);
  // Hinge bar at the back edge
  const hinge = box(1.15, 0.05, 0.06, 0x1e2e22, dark);
  hinge.position.set(0, 1.04, -0.4);
  g.add(hinge);
  // Front lid handle
  const handle = box(0.28, 0.04, 0.06, 0x1a1a1e, { metalness: 0.45, roughness: 0.4 });
  handle.position.set(0, 1.14, 0.32);
  g.add(handle);

  // Side lift pockets / rails (both sides — garbage truck grabs these)
  for (const side of [-1, 1]) {
    const rail = box(0.08, 0.35, 0.7, 0x2a4030, dark);
    rail.position.set(side * 0.58, 0.7, 0);
    g.add(rail);
    // Pocket lip
    const pocket = box(0.1, 0.12, 0.28, 0x243628, dark);
    pocket.position.set(side * 0.62, 0.72, 0.05);
    g.add(pocket);
  }

  // Front latch plate (no text — just a darker pad)
  const latch = box(0.22, 0.16, 0.04, 0x2a3a2e, dark);
  latch.position.set(0, 0.55, 0.39);
  g.add(latch);
  const latchBar = box(0.14, 0.03, 0.05, 0x4a5048, { metalness: 0.5, roughness: 0.4 });
  latchBar.position.set(0, 0.55, 0.42);
  g.add(latchBar);

  // Wheels with simple hubs
  for (const [wx, wz] of [
    [-0.4, 0.28],
    [0.4, 0.28],
    [-0.4, -0.28],
    [0.4, -0.28],
  ]) {
    const wh = cyl(0.1, 0.1, 0.08, 0x1a1a1a, {}, 6);
    wh.rotation.z = Math.PI / 2;
    wh.position.set(wx, 0.12, wz);
    g.add(wh);
    const hub = cyl(0.04, 0.04, 0.09, 0x5a5a58, { metalness: 0.4, roughness: 0.5 }, 6);
    hub.rotation.z = Math.PI / 2;
    hub.position.set(wx, 0.12, wz);
    g.add(hub);
  }

  g.position.set(x, 0, z);
  // Rest pose for garbage-truck lift / tip animation
  g.userData.homeY = 0;
  g.userData.homeRotX = 0;
  return g;
}
