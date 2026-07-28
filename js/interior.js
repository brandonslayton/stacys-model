/**
 * interior.js — walkable low-poly inside of Stacy's @ Melrose.
 *
 * Deliberately LARGER than the exterior footprint so the room is usable as a
 * first-person walkaround rather than a squished diorama. Same blocky vocabulary
 * as the lot, axes still match the building:
 *
 *         −X  north  (parking exit, cathedral window, DJ, dance floor)
 *          |
 *  +Z west ┼ −Z east
 *  (front) |           (−Z = patio)
 *         +X  south  (rainbow bar + back bar / liquor)
 *
 * Camera: pocket.js puts the player inside with free look + WASD / virtual stick.
 */
import * as THREE from "three";
import {
  box,
  cyl,
  neonBox,
  canvasTexture,
  trackNightMat,
  trackNightMesh,
  installVenueNight,
} from "./kit.js";
import { makeStacysDiamondLogoTexture } from "./stacys.js";

// Room shell — bigger than exterior (6.4×4.6) for walkaround comfort
const RW = 11.5; // N–S (X)
const RD = 9.0; // E–W depth (Z)
const RH = 3.35;
const WALL = 0.14;
const halfW = RW * 0.5;
const halfD = RD * 0.5;

// Walk bounds (inset from walls so the camera never clips furniture hard)
export const WALK = {
  xMin: -halfW + 0.55,
  xMax: halfW - 1.35, // leave room for bar depth
  zMin: -halfD + 0.55,
  zMax: halfD - 0.55,
  eyeY: 1.55,
};

const WOOD = 0x4a3428;
const WOOD_DARK = 0x2e2018;
const BRICK = 0xb8a888;
const BRICK_DARK = 0x8a7a62;
const FLOOR = 0x3a2a1e;
const CEIL = 0x121018;
const BLACK = 0x121018;
const METAL = 0x3a3e46;

function labelTex(text, {
  w = 256,
  h = 96,
  bg = "#1a1020",
  fg = "#ff6ec7",
  size = 42,
} = {}) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = fg;
  ctx.font = `bold ${size}px Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, h / 2);
  return canvasTexture(c, 2);
}

function dartboardTex() {
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d");
  const cx = S / 2;
  const cy = S / 2;
  const colors = ["#1a1a1e", "#c41e3a", "#1a1a1e", "#2a8a3a"];
  for (let r = 5; r >= 1; r--) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * 22, 0, Math.PI * 2);
    ctx.fillStyle = colors[r % colors.length];
    ctx.fill();
  }
  ctx.fillStyle = "#f0c14d";
  ctx.beginPath();
  ctx.arc(cx, cy, 10, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 20; i++) {
    const a0 = (i / 20) * Math.PI * 2;
    const a1 = ((i + 1) / 20) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, 110, a0, a1);
    ctx.closePath();
    ctx.fillStyle = i % 2 ? "rgba(200,30,50,0.35)" : "rgba(40,40,48,0.35)";
    ctx.fill();
  }
  return canvasTexture(c, 2);
}

function foliageTex() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#0e2814";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const r = 8 + Math.random() * 22;
    ctx.fillStyle = Math.random() > 0.5 ? "#1e5a28" : "#2a7a38";
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.7, Math.random(), 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = "#c41e3a";
    ctx.beginPath();
    ctx.arc(Math.random() * 256, Math.random() * 256, 4 + Math.random() * 5, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvasTexture(c, 2);
}

/** Single TV screen — dark frame + colorful “show” content. */
function tvScreenTex(seed = 0) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 160;
  const ctx = c.getContext("2d");
  const hues = [
    ["#2a1040", "#ff4fa8", "#80c0ff"],
    ["#102848", "#40e0ff", "#ffe14a"],
    ["#301018", "#ff6a3a", "#9b6dff"],
    ["#102818", "#3dd68c", "#ff4fa8"],
  ][seed % 4];
  const g = ctx.createLinearGradient(0, 0, 256, 160);
  g.addColorStop(0, hues[0]);
  g.addColorStop(0.55, hues[1]);
  g.addColorStop(1, hues[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 160);
  // Fake performer silhouette
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(128, 130, 48, 55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(128, 70, 28, 0, Math.PI * 2);
  ctx.fill();
  // Title bar
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(0, 0, 256, 28);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 16px Arial, sans-serif";
  ctx.textAlign = "center";
  const titles = ["STARSTRUCK", "RISING STAR", "KARAOKE", "COMMUNION", "MILKSHAKE", "TNT"];
  ctx.fillText(titles[seed % titles.length], 128, 20);
  // QR-ish corner
  ctx.fillStyle = "#fff";
  ctx.fillRect(210, 120, 32, 28);
  ctx.fillStyle = "#111";
  for (let i = 0; i < 16; i++) {
    if ((i + seed) % 3) ctx.fillRect(212 + (i % 4) * 7, 122 + ((i / 4) | 0) * 6, 5, 5);
  }
  return canvasTexture(c, 2);
}

/**
 * Tall Gothic / cathedral arched window — matches the photo: pointed arch,
 * vertical mullion bars, glowing panes (hue cycles at runtime).
 */
function buildCathedralWindow(nightMats, lit) {
  const g = new THREE.Group();
  g.name = "cathedralWindow";

  const W = 1.35;
  const H = 2.55;
  const D = 0.18;
  // Outer frame
  const frameCol = 0x2a2a32;
  // Sill + jambs
  g.add(box(W + 0.2, 0.12, D + 0.08, frameCol)).position.set(0, 0.06, 0);
  g.add(box(0.1, H, D, frameCol)).position.set(-W * 0.5, H * 0.5, 0);
  g.add(box(0.1, H, D, frameCol)).position.set(W * 0.5, H * 0.5, 0);
  // Flat top bar under the arch
  g.add(box(W + 0.2, 0.1, D, frameCol)).position.set(0, H - 0.05, 0);

  // Pointed arch crown — stepped blocks (low-poly Gothic)
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const ww = W * (1 - t * 0.92);
    const arch = box(ww + 0.12, 0.12, D, frameCol);
    arch.position.set(0, H + 0.08 + i * 0.11, 0);
    g.add(arch);
  }
  // Finial tip
  const tip = box(0.18, 0.22, D, frameCol);
  tip.position.set(0, H + 0.72, 0);
  g.add(tip);

  // Glowing panes behind bars
  const paneMat = new THREE.MeshStandardMaterial({
    color: 0x40c8ff,
    emissive: 0x40c8ff,
    emissiveIntensity: 1.15,
    roughness: 0.25,
    flatShading: true,
  });
  trackNightMat(nightMats, paneMat, 1.4, 0.95, { glimmer: true, glimmerSpeed: 1.6 });
  // Main rectangular glass
  const glass = new THREE.Mesh(new THREE.BoxGeometry(W * 0.88, H * 0.92, 0.06), paneMat);
  glass.position.set(0, H * 0.48, -0.02);
  g.add(glass);
  // Arch fill panes
  for (let i = 0; i < 4; i++) {
    const t = i / 3;
    const ww = W * 0.88 * (1 - t * 0.85);
    const pg = new THREE.Mesh(new THREE.BoxGeometry(ww, 0.1, 0.05), paneMat);
    pg.position.set(0, H + 0.1 + i * 0.12, -0.02);
    g.add(pg);
  }

  // Vertical mullions (the bar look from the photo)
  const nBars = 7;
  for (let i = 0; i < nBars; i++) {
    const u = (i / (nBars - 1)) * 2 - 1;
    const bar = box(0.05, H * 0.9, 0.07, 0x1a1a22);
    bar.position.set(u * W * 0.4, H * 0.48, 0.04);
    g.add(bar);
  }
  // Horizontal rails
  for (const y of [0.45, 1.15, 1.85]) {
    const rail = box(W * 0.88, 0.05, 0.07, 0x1a1a22);
    rail.position.set(0, y, 0.04);
    g.add(rail);
  }

  g.userData.paneMat = paneMat;
  return g;
}

/**
 * Simplified neon diamond — same silhouette as the outdoor pole sign,
 * scaled for the foliage wall (pink edge + logo face).
 */
function buildDiamondNeon(nightMats) {
  const g = new THREE.Group();
  g.name = "diamondNeon";
  const faceW = 1.15;
  const faceH = 0.78;
  const baseDiag = Math.min(faceW, faceH);
  const side = baseDiag / Math.SQRT2;
  const stretchX = faceW / baseDiag;
  const stretchY = faceH / baseDiag;
  const logoMap = makeStacysDiamondLogoTexture();

  const body = new THREE.Group();
  const cabinet = box(side * 0.9, side * 0.9, 0.1, 0x1a1020, {
    roughness: 0.5,
    emissive: 0x5a3a7a,
    emissiveIntensity: 0.25,
  });
  cabinet.rotation.z = Math.PI / 4;
  body.add(cabinet);

  const edge = neonBox(side * 1.02, side * 1.02, 0.06, 0xff4fa8, 1.0);
  edge.rotation.z = Math.PI / 4;
  trackNightMesh(nightMats, edge, 1.35, 0.9, { glimmer: true, glimmerSpeed: 2.4 });
  body.add(edge);
  body.scale.set(stretchX, stretchY, 1);
  g.add(body);

  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(faceW * 1.05, faceH * 1.05),
    new THREE.MeshStandardMaterial({
      map: logoMap,
      transparent: true,
      roughness: 0.3,
      emissive: 0xffffff,
      emissiveIntensity: 0.85,
      emissiveMap: logoMap,
      flatShading: true,
    })
  );
  face.position.z = 0.07;
  trackNightMesh(nightMats, face, 1.2, 0.8, { glimmer: true, glimmerSpeed: 2.0 });
  g.add(face);

  // Tip bulbs
  for (const [ox, oy] of [
    [0, faceH * 0.48],
    [0, -faceH * 0.48],
    [faceW * 0.48, 0],
    [-faceW * 0.48, 0],
  ]) {
    const bulb = cyl(0.04, 0.04, 0.05, 0xffe8a0, {
      emissive: 0xffd060,
      emissiveIntensity: 0.95,
    }, 6);
    bulb.position.set(ox, oy, 0.08);
    trackNightMesh(nightMats, bulb, 1.1, 0.75, { glimmer: true });
    g.add(bulb);
  }
  return g;
}

function buildBottle(col, h = 0.28) {
  const g = new THREE.Group();
  const body = cyl(0.04, 0.045, h * 0.7, col, { roughness: 0.35, metalness: 0.1 }, 6);
  body.position.y = h * 0.35;
  g.add(body);
  const neck = cyl(0.018, 0.028, h * 0.28, col, { roughness: 0.35 }, 6);
  neck.position.y = h * 0.78;
  g.add(neck);
  const cap = cyl(0.02, 0.02, 0.04, 0xc8a040, { metalness: 0.4, roughness: 0.4 }, 6);
  cap.position.y = h * 0.95;
  g.add(cap);
  return g;
}

/**
 * Back bar: multi-tier liquor shelves, mirror, well, POS — bartender workspace.
 */
function buildBackBar(nightMats, lit, add) {
  const x = halfW - 0.12; // along south wall
  // Mirror backsplash
  const mirror = box(0.04, 1.6, 5.2, 0x2a3540, {
    metalness: 0.55,
    roughness: 0.2,
    emissive: 0x102028,
    emissiveIntensity: 0.15,
  });
  mirror.position.set(x - 0.08, 2.0, 0.1);
  add(mirror);

  // Three shelf tiers
  const shelfCols = [
    0xc41e3a, 0x2a5a3a, 0xf0e8d0, 0x3a3a8a, 0xe8a040, 0x1a1a1e,
    0x8b0000, 0x4a7040, 0xd4af37, 0x5a2a6a, 0xc0c0c0, 0x402010,
  ];
  for (let tier = 0; tier < 3; tier++) {
    const sy = 1.35 + tier * 0.42;
    const shelf = box(0.28, 0.06, 5.0, WOOD_DARK, { roughness: 0.7 });
    shelf.position.set(x - 0.22, sy, 0.1);
    add(shelf);
    // Bottles along the shelf
    for (let i = 0; i < 16; i++) {
      const b = buildBottle(shelfCols[(i + tier * 3) % shelfCols.length], 0.22 + (i % 4) * 0.04);
      b.position.set(x - 0.22, sy + 0.03, -2.1 + i * 0.28);
      add(b);
    }
    // Under-shelf LED strip
    const led = neonBox(0.04, 0.03, 4.8, [0xff4fa8, 0x40e0ff, 0x9b6dff][tier], 0.75);
    led.position.set(x - 0.35, sy - 0.05, 0.1);
    lit(led, 1.1, 0.7, { glimmerSpeed: 2.2 + tier * 0.3 });
    add(led);
  }

  // Top neon “Stacy's” strip behind bottles
  const topNeon = neonBox(0.08, 0.28, 2.2, 0x40a0ff, 0.95);
  topNeon.position.set(x - 0.18, 2.75, 0.15);
  lit(topNeon, 1.25, 0.85, { glimmerSpeed: 2.5 });
  add(topNeon);
  const topLabel = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 0.22),
    new THREE.MeshStandardMaterial({
      map: labelTex("Stacy's", { w: 320, h: 64, bg: "#0a2040", fg: "#80d0ff", size: 40 }),
      emissive: 0x3060ff,
      emissiveIntensity: 0.5,
      roughness: 0.4,
      flatShading: true,
    })
  );
  topLabel.position.set(x - 0.28, 2.75, 0.15);
  topLabel.rotation.y = -Math.PI / 2;
  add(topLabel);

  // Speed rail / well (bartender side of bar)
  const well = box(0.55, 0.35, 2.4, 0x2a2a30, { metalness: 0.3, roughness: 0.4 });
  well.position.set(x - 0.85, 1.0, 0.2);
  add(well);
  // Speed rail bottles (open pours)
  for (let i = 0; i < 8; i++) {
    const b = buildBottle(shelfCols[i % shelfCols.length], 0.2);
    b.position.set(x - 0.85, 1.2, -0.7 + i * 0.22);
    add(b);
  }

  // Ice bin
  const ice = box(0.4, 0.28, 0.5, 0xc8d0d8, {
    metalness: 0.35,
    roughness: 0.3,
    emissive: 0x80a0b0,
    emissiveIntensity: 0.12,
  });
  ice.position.set(x - 0.85, 1.0, 1.45);
  add(ice);

  // POS terminal
  const pos = box(0.28, 0.35, 0.22, BLACK);
  pos.position.set(x - 0.7, 1.35, -1.5);
  add(pos);
  const posScreen = box(0.24, 0.18, 0.03, 0x1a3048, {
    emissive: 0x3080c0,
    emissiveIntensity: 0.55,
  });
  posScreen.position.set(x - 0.85, 1.45, -1.5);
  lit(posScreen, 0.8, 0.5);
  add(posScreen);

  // Draft tower
  const draft = box(0.4, 0.6, 0.4, METAL, { metalness: 0.45, roughness: 0.4 });
  draft.position.set(x - 0.7, 1.45, 1.9);
  add(draft);
  for (const dz of [-0.1, 0, 0.1]) {
    const spout = cyl(0.025, 0.02, 0.22, 0xc8ccd0, { metalness: 0.5 }, 6);
    spout.rotation.x = Math.PI / 2;
    spout.position.set(x - 0.9, 1.5, 1.9 + dz);
    add(spout);
    const handle = box(0.04, 0.14, 0.04, [0xc41e3a, 0xf0c14d, 0x2a5a3a][(dz + 0.1) * 10 | 0] || 0xc41e3a);
    handle.position.set(x - 0.7, 1.75, 1.9 + dz);
    add(handle);
  }

  // Glass rack hanging
  for (let i = 0; i < 10; i++) {
    const glass = cyl(0.04, 0.03, 0.12, 0xc0d0e0, {
      transparent: true,
      opacity: 0.45,
      roughness: 0.15,
      metalness: 0.2,
    }, 6);
    glass.position.set(x - 0.55, 2.55, -1.6 + i * 0.22);
    add(glass);
  }
}

/**
 * Build the full interior group.
 */
export function createInterior() {
  const g = new THREE.Group();
  g.name = "stacysInterior";

  const nightMats = [];
  const flashMats = [];
  const flashLights = [];
  const nightLights = [];

  const add = (mesh) => {
    g.add(mesh);
    return mesh;
  };
  const lit = (mesh, nightI = 0.85, dayI = 0.55, opts = {}) => {
    trackNightMesh(nightMats, mesh, nightI, dayI, { glimmer: true, ...opts });
    return mesh;
  };

  // ── Shell ──────────────────────────────────────────────────────────
  const floor = box(RW, 0.08, RD, FLOOR, { roughness: 0.9 });
  floor.position.y = 0.04;
  add(floor);
  for (let i = 0; i < 22; i++) {
    const plank = box(RW * 0.98, 0.01, 0.18, i % 2 ? 0x4a3428 : 0x3a2a1e, {
      roughness: 0.92,
      castShadow: false,
    });
    plank.position.set(0, 0.085, -halfD + 0.3 + i * 0.4);
    add(plank);
  }

  const ceil = box(RW, 0.12, RD, CEIL, { roughness: 0.95 });
  ceil.position.y = RH;
  add(ceil);

  // Walls
  add(box(RW + WALL * 2, RH, WALL, BRICK)).position.set(0, RH * 0.5, halfD);
  add(box(RW + WALL * 2, RH, WALL, BRICK_DARK)).position.set(0, RH * 0.5, -halfD);
  add(box(WALL, RH, RD, BRICK)).position.set(-halfW, RH * 0.5, 0);
  add(box(WALL, RH, RD, WOOD_DARK)).position.set(halfW, RH * 0.5, 0);

  // Ceiling beams + truss ring over dance floor
  for (const z of [-2.5, -0.8, 0.9, 2.5]) {
    const beam = box(RW * 0.96, 0.14, 0.18, BLACK, { roughness: 0.8 });
    beam.position.set(0, RH - 0.2, z);
    add(beam);
  }
  // Disco truss circle (blocky ring)
  {
    const ring = new THREE.Group();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const seg = box(0.5, 0.1, 0.1, METAL, { metalness: 0.4, roughness: 0.45 });
      seg.position.set(Math.cos(a) * 1.4, 0, Math.sin(a) * 1.4);
      seg.rotation.y = -a;
      ring.add(seg);
    }
    ring.position.set(-1.6, RH - 0.35, -0.8);
    add(ring);
    for (const [dx, dz] of [
      [0, 0],
      [0.5, 0.3],
      [-0.4, 0.35],
    ]) {
      const ball = cyl(0.12, 0.12, 0.12, 0xd0d8e0, {
        metalness: 0.7,
        roughness: 0.2,
        emissive: 0xa0b0c0,
        emissiveIntensity: 0.4,
      }, 10);
      ball.position.set(-1.6 + dx, RH - 0.7, -0.8 + dz);
      lit(ball, 0.65, 0.4, { glimmerSpeed: 5 });
      add(ball);
    }
  }

  // Columns
  for (const [x, z] of [
    [-2.2, 1.6],
    [-2.2, -1.2],
    [1.2, 1.4],
    [1.2, -1.5],
  ]) {
    const col = new THREE.Group();
    for (let i = 0; i < 10; i++) {
      const seg = box(0.18, 0.28, 0.18, 0xb8a890, { roughness: 0.7 });
      seg.position.y = 0.2 + i * 0.28;
      seg.rotation.y = i * 0.35;
      col.add(seg);
    }
    col.position.set(x, 0, z);
    add(col);
  }

  // ══════════════════════════════════════════════════════════════════
  // WEST (+Z) — darts · foliage · diamond neon · cam · ATM · wood door
  // ══════════════════════════════════════════════════════════════════
  {
    const z = halfD - 0.1;
    const dartTex = dartboardTex();
    for (const [x, s] of [
      [-4.0, 1],
      [-3.2, 0.95],
    ]) {
      const cabinet = box(0.6 * s, 1.45 * s, 0.3, BLACK);
      cabinet.position.set(x, 0.9 * s, z - 0.15);
      add(cabinet);
      const board = new THREE.Mesh(
        new THREE.CircleGeometry(0.24 * s, 16),
        new THREE.MeshStandardMaterial({
          map: dartTex,
          roughness: 0.55,
          flatShading: true,
        })
      );
      board.position.set(x, 1.1 * s, z - 0.3);
      add(board);
    }

    // Foliage wall
    const foliage = new THREE.Mesh(
      new THREE.PlaneGeometry(2.0, 2.2),
      new THREE.MeshStandardMaterial({
        map: foliageTex(),
        roughness: 0.85,
        flatShading: true,
      })
    );
    foliage.position.set(-1.2, 1.55, z - 0.02);
    foliage.rotation.y = Math.PI;
    add(foliage);

    // Diamond neon (matches outdoor pole sign, simplified)
    const diamond = buildDiamondNeon(nightMats);
    diamond.position.set(-1.2, 1.75, z - 0.12);
    diamond.rotation.y = Math.PI;
    add(diamond);
    const neonWash = new THREE.PointLight(0xff4fa8, 1.2, 6, 2);
    neonWash.position.set(-1.2, 1.75, z - 1.0);
    add(neonWash);
    nightLights.push({ light: neonWash, day: 0.7, night: 1.35 });

    // Ring light camera
    const camStand = box(0.12, 1.2, 0.12, METAL);
    camStand.position.set(0.5, 0.6, z - 0.3);
    add(camStand);
    const ring = cyl(0.26, 0.26, 0.05, 0xf0f0f0, {
      emissive: 0xffffff,
      emissiveIntensity: 0.7,
      roughness: 0.3,
    }, 16);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0.5, 1.4, z - 0.42);
    lit(ring, 1.0, 0.65);
    add(ring);

    // ATM
    const atm = box(0.5, 1.3, 0.32, 0x2a2a32);
    atm.position.set(1.3, 0.75, z - 0.2);
    add(atm);
    const atmScreen = box(0.36, 0.3, 0.04, 0x1a3040, {
      emissive: 0x2a6080,
      emissiveIntensity: 0.5,
    });
    atmScreen.position.set(1.3, 1.15, z - 0.36);
    lit(atmScreen, 0.75, 0.45);
    add(atmScreen);

    // Wood front door
    const doorFrame = box(1.15, 2.35, 0.16, WOOD_DARK);
    doorFrame.position.set(3.4, 1.2, z - 0.04);
    add(doorFrame);
    const doorLeaf = box(0.98, 2.15, 0.09, WOOD);
    doorLeaf.position.set(3.4, 1.15, z - 0.14);
    doorLeaf.name = "interiorFrontDoor";
    add(doorLeaf);
    for (const dir of [-1, 1]) {
      const arm = box(0.09, 1.0, 0.04, WOOD_DARK);
      arm.rotation.z = dir * 0.55;
      arm.position.set(3.4, 1.25, z - 0.2);
      add(arm);
    }
    const pull = cyl(0.045, 0.045, 0.09, 0xc8a040, { metalness: 0.5, roughness: 0.4 }, 8);
    pull.rotation.z = Math.PI / 2;
    pull.position.set(3.75, 1.15, z - 0.22);
    add(pull);
  }

  // ══════════════════════════════════════════════════════════════════
  // NORTH (−X) — glass exit · rail · cathedral window · DJ · jukebox · booths
  // ══════════════════════════════════════════════════════════════════
  {
    const x = -halfW + 0.1;

    // Glass parking exit
    const gFrame = box(0.1, 2.3, 1.15, METAL);
    gFrame.position.set(x, 1.15, 3.0);
    add(gFrame);
    const glassDoor = box(0.08, 2.15, 1.0, 0x6ab0d0, {
      transparent: true,
      opacity: 0.32,
      roughness: 0.15,
      metalness: 0.2,
      emissive: 0x204060,
      emissiveIntensity: 0.2,
    });
    glassDoor.position.set(x + 0.06, 1.15, 3.0);
    add(glassDoor);

    // Railing
    for (let i = 0; i < 8; i++) {
      const picket = box(0.04, 0.75, 0.04, 0x2a2a30);
      picket.position.set(x + 0.25, 0.5, 2.2 - i * 0.22);
      add(picket);
    }
    const rail = box(0.05, 0.05, 1.7, 0x3a3a42);
    rail.position.set(x + 0.25, 0.88, 1.45);
    add(rail);

    // Cathedral rainbow window
    const cathed = buildCathedralWindow(nightMats, lit);
    cathed.position.set(x + 0.05, 0.15, -0.3);
    cathed.rotation.y = Math.PI / 2; // face into room (+X)
    add(cathed);
    g.userData.cathedralPaneMat = cathed.userData.paneMat;
    const winLight = new THREE.PointLight(0x40e0ff, 1.8, 10, 2);
    winLight.position.set(x + 1.4, 1.8, -0.3);
    winLight.name = "cathedralLight";
    add(winLight);
    nightLights.push({ light: winLight, day: 1.1, night: 2.0 });
    g.userData.cathedralLight = winLight;
    // Floor wash from window
    const winSpot = new THREE.SpotLight(0x40e0ff, 1.4, 12, 0.55, 0.4, 1.5);
    winSpot.position.set(x + 0.3, 2.4, -0.3);
    winSpot.target.position.set(x + 2.5, 0, -0.3);
    add(winSpot);
    add(winSpot.target);
    nightLights.push({ light: winSpot, day: 0.8, night: 1.5 });
    g.userData.cathedralSpot = winSpot;

    // DJ booth
    const stage = box(1.8, 0.4, 2.0, 0x1a1a22);
    stage.position.set(x + 1.1, 0.22, -2.4);
    add(stage);
    const djDesk = box(1.5, 0.6, 0.65, BLACK);
    djDesk.position.set(x + 1.0, 0.8, -2.4);
    add(djDesk);
    for (let i = 0; i < 6; i++) {
      const knob = box(0.14, 0.05, 0.14, 0x2a2a30, {
        emissive: [0xff4fa8, 0x40e0ff, 0x9b6dff, 0x3dd68c, 0xffe14a, 0xff6a3a][i],
        emissiveIntensity: 0.6,
      });
      knob.position.set(x + 0.5 + i * 0.2, 1.12, -2.2);
      lit(knob, 0.9, 0.55);
      add(knob);
    }
    const ledBar = neonBox(1.6, 0.28, 0.1, 0x3060ff, 0.9);
    ledBar.position.set(x + 0.25, 2.1, -2.4);
    lit(ledBar, 1.25, 0.8, { glimmerSpeed: 3.5 });
    add(ledBar);

    // Jukebox
    const juke = box(0.65, 1.5, 0.45, 0x1a1020);
    juke.position.set(x + 0.55, 0.8, 0.9);
    add(juke);
    const jukeGlow = box(0.48, 0.65, 0.1, 0xff4fa8, {
      emissive: 0xff2a80,
      emissiveIntensity: 0.75,
    });
    jukeGlow.position.set(x + 0.78, 1.05, 0.9);
    lit(jukeGlow, 1.05, 0.65, { glimmerSpeed: 2.2 });
    add(jukeGlow);

    // Booths
    for (const z of [-3.5, -2.85]) {
      const booth = box(1.1, 0.6, 0.55, 0x3a2030);
      booth.position.set(x + 1.4, 0.38, z);
      add(booth);
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // EAST (−Z) — TV video wall · booths · patio · walk-in · taps
  // ══════════════════════════════════════════════════════════════════
  {
    const z = -halfD + 0.1;

    // Video wall — 2×4 screens
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 4; col++) {
        const frame = box(1.05, 0.7, 0.08, BLACK);
        frame.position.set(-3.2 + col * 1.15, 1.55 + row * 0.85, z + 0.05);
        add(frame);
        const screen = new THREE.Mesh(
          new THREE.PlaneGeometry(0.95, 0.6),
          new THREE.MeshStandardMaterial({
            map: tvScreenTex(row * 4 + col),
            emissive: 0x204060,
            emissiveIntensity: 0.45,
            roughness: 0.4,
            flatShading: true,
          })
        );
        screen.position.set(-3.2 + col * 1.15, 1.55 + row * 0.85, z + 0.1);
        lit(screen, 0.65, 0.4);
        add(screen);
        g.userData.tvScreens = g.userData.tvScreens || [];
        g.userData.tvScreens.push(screen);
      }
    }
    // LED edge around video wall
    const wallLed = neonBox(4.6, 0.06, 0.05, 0x9b6dff, 0.7);
    wallLed.position.set(-1.5, 2.5, z + 0.12);
    lit(wallLed, 1.0, 0.65, { glimmerSpeed: 2.8 });
    add(wallLed);

    // Booth tables under TVs
    for (const x of [-3.2, -2.0, -0.8, 0.4]) {
      const booth = box(0.85, 0.75, 0.85, 0x3a2830);
      booth.position.set(x, 0.42, z + 0.6);
      add(booth);
      const table = box(0.6, 0.08, 0.6, WOOD);
      table.position.set(x, 0.78, z + 0.7);
      add(table);
    }

    // Patio door
    const patioDoor = box(1.0, 2.15, 0.12, 0x2a3a2a);
    patioDoor.position.set(1.6, 1.15, z + 0.08);
    add(patioDoor);
    const patioGlass = box(0.65, 1.3, 0.05, 0x80c0a0, {
      transparent: true,
      opacity: 0.4,
      emissive: 0x204030,
      emissiveIntensity: 0.15,
    });
    patioGlass.position.set(1.6, 1.3, z + 0.14);
    add(patioGlass);
    const exit = neonBox(0.4, 0.14, 0.05, 0x3dd68c, 0.75);
    exit.position.set(1.6, 2.4, z + 0.12);
    lit(exit, 1.05, 0.7);
    add(exit);

    // Walk-in
    const walkIn = box(0.85, 2.0, 0.14, 0x3a4048, { metalness: 0.35, roughness: 0.45 });
    walkIn.position.set(2.8, 1.05, z + 0.08);
    add(walkIn);
    const wiHandle = box(0.09, 0.4, 0.07, 0xc8ccd0, { metalness: 0.5, roughness: 0.35 });
    wiHandle.position.set(3.05, 1.1, z + 0.16);
    add(wiHandle);

    // Beer taps
    const tapRail = box(1.1, 0.14, 0.22, METAL, { metalness: 0.4, roughness: 0.4 });
    tapRail.position.set(4.0, 1.25, z + 0.25);
    add(tapRail);
    for (let i = 0; i < 6; i++) {
      const tap = cyl(0.03, 0.025, 0.3, 0xc8ccd0, { metalness: 0.5, roughness: 0.35 }, 6);
      tap.position.set(3.6 + i * 0.15, 1.48, z + 0.28);
      add(tap);
      const handle = box(0.04, 0.14, 0.04, [0xc41e3a, 0xf0c14d, 0x2a5a3a, 0x3a3a8a, 0xe8a040, 0xffffff][i]);
      handle.position.set(3.6 + i * 0.15, 1.68, z + 0.28);
      add(handle);
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // SOUTH (+X) — bar front + back bar + vape + bathroom + photobooth
  // ══════════════════════════════════════════════════════════════════
  {
    const x = halfW - 0.1;

    // Bar body (customer side)
    const barLong = box(1.05, 1.1, 5.6, BLACK);
    barLong.position.set(x - 0.7, 0.58, 0.15);
    add(barLong);
    // Rainbow LED front
    const bands = [0xff3b3b, 0xff9a1a, 0xffe14a, 0x3dd68c, 0x3ca0ff, 0x9b6dff];
    const panelW = 5.2;
    const segW = panelW / bands.length;
    for (let i = 0; i < bands.length; i++) {
      const seg = box(0.1, 0.75, segW * 0.94, bands[i], {
        emissive: bands[i],
        emissiveIntensity: 0.8,
        roughness: 0.35,
      });
      seg.position.set(x - 1.2, 0.48, -2.2 + segW * 0.5 + i * segW);
      lit(seg, 1.2, 0.75, { glimmerSpeed: 2.0 + i * 0.15, phase: i });
      add(seg);
      flashMats.push({ mat: seg.material, day: 0.5, night: 1.25 });
    }
    // Bar top
    const top = box(1.15, 0.09, 5.7, 0x2a2a30, { roughness: 0.35, metalness: 0.25 });
    top.position.set(x - 0.7, 1.18, 0.15);
    add(top);
    // Stools
    for (let i = 0; i < 9; i++) {
      const stool = new THREE.Group();
      const seat = cyl(0.15, 0.15, 0.06, BLACK, {}, 8);
      seat.position.y = 0.75;
      stool.add(seat);
      const leg = cyl(0.035, 0.045, 0.75, METAL, { metalness: 0.4, roughness: 0.5 }, 6);
      leg.position.y = 0.38;
      stool.add(leg);
      stool.position.set(x - 1.65, 0, -2.0 + i * 0.55);
      add(stool);
    }

    buildBackBar(nightMats, lit, add);

    // Vape
    const vape = box(0.55, 1.6, 0.35, 0x1a1a22);
    vape.position.set(x - 0.4, 0.85, -3.2);
    add(vape);
    const vapeScreen = box(0.42, 0.6, 0.05, 0x102018, {
      emissive: 0x20a040,
      emissiveIntensity: 0.55,
    });
    vapeScreen.position.set(x - 0.58, 1.25, -3.2);
    lit(vapeScreen, 0.8, 0.5);
    add(vapeScreen);

    // Bathroom
    const bathDoor = box(0.85, 2.15, 0.12, WOOD_DARK);
    bathDoor.position.set(x - 0.25, 1.15, -3.9);
    add(bathDoor);
    const bathSign = neonBox(0.22, 0.22, 0.05, 0x9b6dff, 0.65);
    bathSign.position.set(x - 0.3, 2.35, -3.9);
    lit(bathSign, 0.95, 0.6);
    add(bathSign);

    // Photobooth
    const booth = box(1.0, 2.25, 1.0, BLACK);
    booth.position.set(x - 0.65, 1.15, 3.4);
    add(booth);
    const curtain = box(0.8, 1.6, 0.1, 0x5a1a40, {
      emissive: 0x401028,
      emissiveIntensity: 0.22,
    });
    curtain.position.set(x - 1.15, 1.05, 3.4);
    add(curtain);
    const photosNeon = neonBox(0.55, 0.16, 0.06, 0x80d0ff, 0.85);
    photosNeon.position.set(x - 1.15, 2.35, 3.4);
    lit(photosNeon, 1.15, 0.75);
    add(photosNeon);
  }

  // ── Dance floor ───────────────────────────────────────────────────
  {
    const dance = box(3.2, 0.05, 2.6, 0x1a1220, { roughness: 0.32, metalness: 0.18 });
    dance.position.set(-1.6, 0.1, -0.8);
    add(dance);
    // Tile glow accents
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 3; j++) {
        const tile = box(0.7, 0.02, 0.7, 0x201828, {
          emissive: [0xff4fa8, 0x40e0ff, 0x9b6dff, 0x3dd68c][(i + j) % 4],
          emissiveIntensity: 0.15,
        });
        tile.position.set(-2.6 + i * 0.85, 0.12, -1.7 + j * 0.85);
        lit(tile, 0.35, 0.18, { glimmerSpeed: 1.5 + i * 0.2 });
        add(tile);
      }
    }
    const danceLight = new THREE.PointLight(0xff80c0, 0.9, 7, 2);
    danceLight.position.set(-1.6, 2.4, -0.8);
    add(danceLight);
    flashLights.push({ light: danceLight });
    nightLights.push({ light: danceLight, day: 0.5, night: 1.1 });
  }

  // High-tops
  for (const [x, z] of [
    [-0.4, 1.8],
    [0.6, 1.2],
    [-0.5, -2.8],
    [0.8, -2.2],
    [-3.5, 1.0],
  ]) {
    const t = new THREE.Group();
    const top = cyl(0.28, 0.28, 0.06, WOOD_DARK, {}, 8);
    top.position.y = 1.0;
    t.add(top);
    const leg = cyl(0.045, 0.055, 1.0, METAL, { metalness: 0.4 }, 6);
    leg.position.y = 0.5;
    t.add(leg);
    t.position.set(x, 0, z);
    add(t);
  }

  // ── Ambient club lighting ─────────────────────────────────────────
  const amb = new THREE.AmbientLight(0x281828, 0.38);
  add(amb);
  const hemi = new THREE.HemisphereLight(0x406080, 0x180c14, 0.32);
  add(hemi);

  const barKey = new THREE.PointLight(0xffa060, 1.0, 12, 2);
  barKey.position.set(2.2, 2.4, 0.2);
  add(barKey);
  nightLights.push({ light: barKey, day: 0.65, night: 1.15 });

  const cool = new THREE.PointLight(0x60a0ff, 0.75, 11, 2);
  cool.position.set(-2.8, 2.5, -0.5);
  add(cool);
  nightLights.push({ light: cool, day: 0.45, night: 0.9 });

  // Pink wash near front door / darts
  const pinkWash = new THREE.PointLight(0xff60a8, 0.55, 8, 2);
  pinkWash.position.set(-2.5, 2.2, 3.0);
  add(pinkWash);
  nightLights.push({ light: pinkWash, day: 0.35, night: 0.7 });

  // Ceiling cans (small warm spots)
  for (const [x, z] of [
    [-3, 2],
    [0, 2.5],
    [2, -1],
    [-2, -2.5],
    [1.5, 3],
  ]) {
    const can = new THREE.PointLight(0xffe0c0, 0.35, 5, 2);
    can.position.set(x, RH - 0.3, z);
    add(can);
    nightLights.push({ light: can, day: 0.25, night: 0.4 });
  }

  installVenueNight(g, nightMats, {
    lights: nightLights,
    flashMats,
    flashLights,
  });
  g.userData.setNight?.(1);

  // Rainbow cathedral + subtle TV flicker
  g.userData.tickInterior = (nowSec) => {
    g.userData.tickNight?.(nowSec * 1000);
    const hue = (nowSec * 0.1) % 1;
    const col = new THREE.Color().setHSL(hue, 0.88, 0.55);
    const pane = g.userData.cathedralPaneMat;
    if (pane) {
      pane.emissive.copy(col);
      pane.color.copy(col);
    }
    const pl = g.userData.cathedralLight;
    if (pl) pl.color.copy(col);
    const sp = g.userData.cathedralSpot;
    if (sp) sp.color.copy(col);

    // Soft TV emissive pulse
    const tvs = g.userData.tvScreens;
    if (tvs) {
      const pulse = 0.35 + 0.15 * Math.sin(nowSec * 2.4);
      for (let i = 0; i < tvs.length; i++) {
        const m = tvs[i].material;
        if (m) m.emissiveIntensity = pulse + 0.05 * Math.sin(nowSec * 3 + i);
      }
    }
  };

  // Spawn: facing into the room from near the front door
  g.userData.spawn = {
    x: 2.2,
    y: WALK.eyeY,
    z: halfD - 1.4,
    yaw: 200, // look toward dance floor / north-east
    pitch: -4,
  };
  g.userData.walk = { ...WALK };
  g.userData.subject = {
    center: new THREE.Vector3(0, 1.4, 0),
    radius: 6.5,
  };

  return g;
}
