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
/** Eave / side-wall height (where the roof pitch starts). */
const EAVE_H = 3.05;
/** Ridge peak — church-like vault above the dance floor. */
const PEAK_H = 4.7;
/** @deprecated alias — wall tops sit at the eave. */
const RH = EAVE_H;
const WALL = 0.14;
const halfW = RW * 0.5;
const halfD = RD * 0.5;
const RAFTER_WOOD = 0x2a1e16;
const RAFTER_DARK = 0x1a120e;

// Walk bounds (inset from walls so the camera never clips furniture hard).
// xMax stops short of the bartender aisle + back bar.
export const WALK = {
  xMin: -halfW + 0.55,
  xMax: halfW - 2.9,
  zMin: -halfD + 0.55,
  zMax: halfD - 0.55,
  eyeY: 1.55,
};

const WOOD = 0x4a3428;
const WOOD_DARK = 0x2e2018;
const WOOD_PANEL = 0x3a2a1e;
const BRICK = 0xb8a888;
const BRICK_DARK = 0x8a7a62;
const BRICK_MORTAR = 0x9a8a78;
/** Venue purple — same family as exterior patio CMU / sign. */
const PURPLE = 0x5a3a7a;
const PURPLE_DARK = 0x3a2450;
const PURPLE_LITE = 0x6a4a8a;
const FLOOR = 0x3a2a1e;
const CEIL = 0x121018;
const BLACK = 0x121018;
const METAL = 0x3a3e46;

/** Running-bond exposed brick for interior walls. */
function brickTex() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#9a8a78";
  ctx.fillRect(0, 0, 256, 256);
  const bricks = ["#c4b090", "#b8a888", "#a89878", "#c8b498", "#b0a080", "#d0c0a0"];
  const bh = 28;
  const bw = 62;
  let rs = 17;
  const rnd = () => ((rs = (rs * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let row = 0; row < 10; row++) {
    const off = row % 2 ? bw * 0.5 : 0;
    for (let col = -1; col < 6; col++) {
      const x = col * (bw + 4) + off;
      const y = row * (bh + 4) + 3;
      ctx.fillStyle = bricks[(row * 5 + col + 6) % bricks.length];
      ctx.fillRect(x, y, bw - 1, bh - 1);
      // subtle value noise
      ctx.fillStyle = `rgba(0,0,0,${0.04 + rnd() * 0.08})`;
      ctx.fillRect(x + 2, y + 2, bw * 0.4, bh * 0.5);
    }
  }
  const tex = canvasTexture(c, 3);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3.2, 2.4);
  return tex;
}

/** Vertical wood planks for bar / south wall. */
function woodPanelTex() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 256;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#2a1c14";
  ctx.fillRect(0, 0, 128, 256);
  const cols = ["#3a2a1e", "#4a3428", "#2e2018", "#5a4030", "#3a2818"];
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = cols[i % cols.length];
    ctx.fillRect(i * 16, 0, 14, 256);
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.fillRect(i * 16 + 13, 0, 2, 256);
  }
  const tex = canvasTexture(c, 2);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 1.6);
  return tex;
}

function wallMesh(w, h, d, kind) {
  // kind: "brick" | "wood" | "purple"
  // Built with MeshStandardMaterial directly so map/emissive aren't dropped
  // by kit.mat() (which only forwards a fixed set of fields).
  let color = BRICK;
  const matOpts = {
    roughness: 0.88,
    metalness: 0.04,
    flatShading: true,
  };
  if (kind === "brick") {
    color = BRICK;
    matOpts.roughness = 0.92;
    matOpts.map = brickTex();
  } else if (kind === "wood") {
    color = WOOD_PANEL;
    matOpts.roughness = 0.84;
    matOpts.map = woodPanelTex();
  } else if (kind === "purple") {
    color = PURPLE;
    matOpts.roughness = 0.78;
    matOpts.emissive = new THREE.Color(PURPLE_DARK);
    matOpts.emissiveIntensity = 0.08;
  }
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, ...matOpts })
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

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
  const S = 512;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d");
  // Deep green base
  const bg = ctx.createLinearGradient(0, 0, S, S);
  bg.addColorStop(0, "#0a1e10");
  bg.addColorStop(0.5, "#123018");
  bg.addColorStop(1, "#0c2414");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, S, S);
  // Layered leaf blobs
  let rs = 42;
  const rnd = () => ((rs = (rs * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const greens = ["#1a4a22", "#246030", "#2e7840", "#185028", "#3a8a48", "#0e3818", "#1e5a28"];
  for (let i = 0; i < 220; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const r = 10 + rnd() * 28;
    ctx.fillStyle = greens[i % greens.length];
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.55 + rnd() * 0.5), rnd() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  // Vine stems
  ctx.strokeStyle = "rgba(20,60,28,0.55)";
  ctx.lineWidth = 3;
  for (let i = 0; i < 18; i++) {
    ctx.beginPath();
    let x = rnd() * S;
    let y = 0;
    ctx.moveTo(x, y);
    for (let k = 0; k < 8; k++) {
      x += (rnd() - 0.5) * 40;
      y += S / 8;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // Red / pink accent flowers (photo has tropical blooms)
  for (let i = 0; i < 28; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    ctx.fillStyle = i % 3 ? "#c41e3a" : "#e85a8a";
    ctx.beginPath();
    ctx.arc(x, y, 3 + rnd() * 6, 0, Math.PI * 2);
    ctx.fill();
    // Petal rays
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(a) * 5, y + Math.sin(a) * 5, 4, 2.2, a, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Speckle highlights
  for (let i = 0; i < 80; i++) {
    ctx.fillStyle = "rgba(120,200,100,0.25)";
    ctx.fillRect(rnd() * S, rnd() * S, 2, 2);
  }
  return canvasTexture(c, 2);
}

/** Layered 3D foliage panel for the sign wall. */
function buildFoliageWall(w = 2.4, h = 2.4) {
  const g = new THREE.Group();
  const back = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({
      map: foliageTex(),
      roughness: 0.9,
      flatShading: true,
    })
  );
  g.add(back);
  // Proud leaf clumps for depth
  const leafCols = [0x1e5a28, 0x2a7a38, 0x246030, 0x3a8a48, 0x185028];
  let rs = 99;
  const rnd = () => ((rs = (rs * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 48; i++) {
    const lx = (rnd() - 0.5) * w * 0.9;
    const ly = (rnd() - 0.5) * h * 0.9;
    const s = 0.12 + rnd() * 0.18;
    const leaf = box(s, s * 0.55, 0.06 + rnd() * 0.08, leafCols[i % leafCols.length], {
      roughness: 0.92,
      castShadow: false,
    });
    leaf.position.set(lx, ly, 0.04 + rnd() * 0.08);
    leaf.rotation.z = rnd() * Math.PI;
    leaf.rotation.x = (rnd() - 0.5) * 0.4;
    g.add(leaf);
  }
  // Flower accents
  for (let i = 0; i < 14; i++) {
    const flower = cyl(0.04, 0.04, 0.03, i % 2 ? 0xc41e3a : 0xe85a8a, {
      roughness: 0.7,
      castShadow: false,
    }, 6);
    flower.rotation.x = Math.PI / 2;
    flower.position.set((rnd() - 0.5) * w * 0.8, (rnd() - 0.5) * h * 0.8, 0.1);
    g.add(flower);
  }
  return g;
}

/** Dark brown wood palette for twisted columns + interior railings. */
const WOOD_COL = 0x3a2418;
const WOOD_COL_DARK = 0x24160e;
const WOOD_COL_LITE = 0x4a3020;

/**
 * Twisted Solomonic column — dark wood, floor to ceiling (vault).
 * `height` is the top of the capital; capital sits under the roof plane.
 */
function buildTwistedColumn(height = 2.9) {
  const g = new THREE.Group();
  g.name = "twistedColumn";
  const wood = WOOD_COL;
  const woodDark = WOOD_COL_DARK;
  const baseH = 0.22;
  const capH = 0.2;
  const shaftH = Math.max(0.8, height - baseH - capH);
  const segs = Math.max(24, Math.round(shaftH / 0.1));
  const segH = shaftH / segs;
  for (let i = 0; i < segs; i++) {
    const t = i / segs;
    const r = 0.11 + Math.sin(t * Math.PI) * 0.025;
    const seg = cyl(r, r * 0.98, segH + 0.012, i % 3 ? wood : woodDark, {
      roughness: 0.82,
      metalness: 0.04,
    }, 12);
    seg.material.flatShading = false;
    seg.material.needsUpdate = true;
    seg.position.y = baseH + i * segH + segH * 0.5;
    seg.rotation.y = i * 0.38;
    g.add(seg);
  }
  // Base plinth
  const base = box(0.4, 0.14, 0.4, woodDark, { roughness: 0.88 });
  base.position.y = 0.07;
  g.add(base);
  const baseRing = cyl(0.17, 0.19, 0.1, wood, { roughness: 0.84 }, 12);
  baseRing.material.flatShading = false;
  baseRing.position.y = 0.18;
  g.add(baseRing);
  // Capital tight under the ceiling
  const capY = height - capH * 0.45;
  const cap = box(0.4, 0.12, 0.4, wood, { roughness: 0.8 });
  cap.position.y = capY;
  g.add(cap);
  const capTop = box(0.46, 0.06, 0.46, woodDark, { roughness: 0.85 });
  capTop.position.y = height - 0.03;
  g.add(capTop);
  for (const [ox, oz] of [
    [-0.13, -0.13],
    [0.13, -0.13],
    [-0.13, 0.13],
    [0.13, 0.13],
  ]) {
    const scroll = cyl(0.05, 0.05, 0.08, woodDark, { roughness: 0.78 }, 8);
    scroll.material.flatShading = false;
    scroll.rotation.z = Math.PI / 2;
    scroll.position.set(ox, capY + 0.02, oz);
    g.add(scroll);
  }
  return g;
}

/**
 * Dark wood railing segment along +X (south). Pickets + top/bottom rails.
 * Runs through column posts without replacing them.
 */
function buildWoodRailing(length, {
  picketH = 0.92,
  spacing = 0.14,
} = {}) {
  const g = new THREE.Group();
  g.name = "woodRailing";
  const top = box(length, 0.06, 0.08, WOOD_COL, { roughness: 0.8 });
  top.position.set(length * 0.5, picketH, 0);
  g.add(top);
  const bot = box(length, 0.05, 0.07, WOOD_COL_DARK, { roughness: 0.85 });
  bot.position.set(length * 0.5, 0.28, 0);
  g.add(bot);
  const n = Math.max(2, Math.floor(length / spacing));
  for (let i = 0; i <= n; i++) {
    const px = (i / n) * length;
    const picket = box(0.045, picketH - 0.12, 0.045, i % 2 ? WOOD_COL : WOOD_COL_DARK, {
      roughness: 0.82,
    });
    picket.position.set(px, (picketH - 0.12) * 0.5 + 0.12, 0);
    g.add(picket);
  }
  // Newel-ish end posts
  for (const px of [0.04, length - 0.04]) {
    const post = box(0.09, picketH + 0.08, 0.09, WOOD_COL_DARK, { roughness: 0.8 });
    post.position.set(px, (picketH + 0.08) * 0.5, 0);
    g.add(post);
  }
  return g;
}

/** Trans pride flag brick (light blue / pink / white / pink / light blue). */
function buildTransPrideBrick() {
  const g = new THREE.Group();
  g.name = "transPrideBrick";
  const stripes = [0x5bcefa, 0xf5a9b8, 0xffffff, 0xf5a9b8, 0x5bcefa];
  const bh = 0.1;
  const bw = 0.42;
  const bd = 0.2;
  for (let i = 0; i < 5; i++) {
    const s = box(bw, bh / 5, bd, stripes[i], {
      roughness: i === 2 ? 0.55 : 0.7,
      metalness: 0.05,
      // white stripe slightly brighter
      emissive: stripes[i],
      emissiveIntensity: i === 2 ? 0.08 : 0.04,
    });
    s.position.y = (i - 2) * (bh / 5);
    g.add(s);
  }
  // Mortar lip
  const lip = box(bw + 0.02, 0.02, bd + 0.02, 0x8a8078, { roughness: 0.9 });
  lip.position.y = -bh * 0.5 - 0.01;
  g.add(lip);
  return g;
}

/** Roof underside Y at a given world z (ridge at z=0, eaves at ±halfD). */
function roofYAt(z) {
  const t = Math.min(1, Math.abs(z) / halfD);
  return PEAK_H - (PEAK_H - EAVE_H) * t;
}

/** Multi-facet disco ball that can spin. */
function buildDiscoBall(radius = 0.22) {
  const g = new THREE.Group();
  g.name = "discoBall";
  // Faceted icosahedron-ish via many small mirrors
  const ball = new THREE.Mesh(
    new THREE.IcosahedronGeometry(radius, 1),
    new THREE.MeshStandardMaterial({
      color: 0xd8e0e8,
      metalness: 0.92,
      roughness: 0.12,
      emissive: 0x405060,
      emissiveIntensity: 0.25,
      flatShading: true,
    })
  );
  g.add(ball);
  // Extra bright tile patches
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    const b = ((i * 7) % 10) / 10 * Math.PI - Math.PI / 2;
    const tile = box(0.05, 0.05, 0.01, 0xf0f4ff, {
      metalness: 0.95,
      roughness: 0.08,
      emissive: 0xa0c0e0,
      emissiveIntensity: 0.35,
      castShadow: false,
    });
    tile.position.set(
      Math.cos(a) * Math.cos(b) * radius * 0.98,
      Math.sin(b) * radius * 0.98,
      Math.sin(a) * Math.cos(b) * radius * 0.98
    );
    tile.lookAt(0, 0, 0);
    g.add(tile);
  }
  // Hanger stem
  const stem = cyl(0.012, 0.012, 0.55, 0x3a3a42, { metalness: 0.5, roughness: 0.4 }, 6);
  stem.position.y = radius + 0.28;
  g.add(stem);
  g.userData.spinRoot = g;
  return g;
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
 * Tall Gothic / cathedral arched window — photo: pointed arch, dense vertical
 * bars, deep reveal, strong glow that cycles rainbow at runtime.
 */
function buildCathedralWindow(nightMats) {
  const g = new THREE.Group();
  g.name = "cathedralWindow";

  const W = 1.55;
  const H = 2.7;
  const D = 0.28;
  const frameCol = 0x1e1e26;
  const frameLite = 0x2e2e38;

  // Deep outer reveal (sits proud of brick)
  const reveal = box(W + 0.35, H + 0.55, 0.12, frameCol);
  reveal.position.set(0, H * 0.48, -0.08);
  g.add(reveal);

  // Sill
  const sill = box(W + 0.28, 0.14, D + 0.1, frameLite);
  sill.position.set(0, 0.08, 0.02);
  g.add(sill);
  // Jambs
  g.add(box(0.12, H, D, frameCol)).position.set(-W * 0.52, H * 0.5, 0);
  g.add(box(0.12, H, D, frameCol)).position.set(W * 0.52, H * 0.5, 0);
  // Spring line under arch
  g.add(box(W + 0.28, 0.1, D, frameLite)).position.set(0, H - 0.02, 0);

  // Pointed arch crown — finer steps for a smoother Gothic silhouette
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    // Pointed: linear taper to tip (not circular)
    const ww = W * (1 - t * 0.95);
    const arch = box(Math.max(0.14, ww + 0.14), 0.1, D, frameCol);
    arch.position.set(0, H + 0.06 + i * 0.095, 0);
    g.add(arch);
  }
  // Finial
  const tip = box(0.16, 0.28, D * 0.9, frameLite);
  tip.position.set(0, H + 0.95, 0);
  g.add(tip);
  const tipBall = cyl(0.06, 0.06, 0.08, frameLite, {}, 8);
  tipBall.position.set(0, H + 1.12, 0);
  g.add(tipBall);

  // Glowing panes — main body + pointed arch fill
  const paneMat = new THREE.MeshStandardMaterial({
    color: 0x40d0ff,
    emissive: 0x40d0ff,
    emissiveIntensity: 1.35,
    roughness: 0.2,
    metalness: 0.05,
    flatShading: true,
  });
  trackNightMat(nightMats, paneMat, 1.55, 1.05, { glimmer: true, glimmerSpeed: 1.4 });
  const glass = new THREE.Mesh(new THREE.BoxGeometry(W * 0.86, H * 0.9, 0.07), paneMat);
  glass.position.set(0, H * 0.48, -0.04);
  g.add(glass);
  // Arch glass wedges
  for (let i = 0; i < 8; i++) {
    const t = i / 7;
    const ww = W * 0.86 * (1 - t * 0.92);
    const pg = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.08, ww), 0.095, 0.06), paneMat);
    pg.position.set(0, H + 0.08 + i * 0.095, -0.04);
    g.add(pg);
  }
  // Soft outer halo plane (reads as glow bloom)
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(W * 1.15, H * 1.15),
    new THREE.MeshBasicMaterial({
      color: 0x40c8ff,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  halo.position.set(0, H * 0.5, 0.12);
  g.add(halo);
  g.userData.haloMat = halo.material;

  // Dense vertical mullions (photo has many thin bars)
  const nBars = 9;
  for (let i = 0; i < nBars; i++) {
    const u = (i / (nBars - 1)) * 2 - 1;
    const bar = box(0.035, H * 0.88, 0.06, 0x121218);
    bar.position.set(u * W * 0.38, H * 0.48, 0.05);
    g.add(bar);
    // Extend bars into lower arch
    if (Math.abs(u) < 0.7) {
      const bar2 = box(0.035, 0.55, 0.06, 0x121218);
      bar2.position.set(u * W * 0.28, H + 0.28, 0.05);
      g.add(bar2);
    }
  }
  // Horizontal rails
  for (const y of [0.55, 1.2, 1.85, 2.4]) {
    const rail = box(W * 0.86, 0.04, 0.06, 0x121218);
    rail.position.set(0, y, 0.05);
    g.add(rail);
  }

  g.userData.paneMat = paneMat;
  return g;
}

/**
 * Thin neon diamond — outdoor pole-sign silhouette, slim LED edge,
 * strong emissive pulse + throw light wired in tickInterior.
 */
function buildDiamondNeon(nightMats) {
  const g = new THREE.Group();
  g.name = "diamondNeon";
  const faceW = 1.05;
  const faceH = 0.72;
  const baseDiag = Math.min(faceW, faceH);
  const side = baseDiag / Math.SQRT2;
  const stretchX = faceW / baseDiag;
  const stretchY = faceH / baseDiag;
  const logoMap = makeStacysDiamondLogoTexture();

  const body = new THREE.Group();
  // Slim cabinet (less bulk than outdoor)
  const cabinet = box(side * 0.82, side * 0.82, 0.05, 0x1a1020, {
    roughness: 0.45,
    emissive: 0x5a3a7a,
    emissiveIntensity: 0.2,
  });
  cabinet.rotation.z = Math.PI / 4;
  body.add(cabinet);

  // Thin pink neon tube edge
  const edge = neonBox(side * 0.98, side * 0.98, 0.028, 0xff4fa8, 1.25);
  edge.rotation.z = Math.PI / 4;
  trackNightMesh(nightMats, edge, 1.55, 1.05, { glimmer: true, glimmerSpeed: 3.8 });
  body.add(edge);
  // Inner hairline for tube read
  const edgeInner = neonBox(side * 0.9, side * 0.9, 0.02, 0xff80c0, 0.9);
  edgeInner.rotation.z = Math.PI / 4;
  edgeInner.position.z = 0.01;
  trackNightMesh(nightMats, edgeInner, 1.2, 0.8, { glimmer: true, glimmerSpeed: 4.2 });
  body.add(edgeInner);
  body.scale.set(stretchX, stretchY, 1);
  g.add(body);

  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(faceW * 0.98, faceH * 0.98),
    new THREE.MeshStandardMaterial({
      map: logoMap,
      transparent: true,
      roughness: 0.28,
      emissive: 0xffffff,
      emissiveIntensity: 1.0,
      emissiveMap: logoMap,
      flatShading: true,
    })
  );
  face.position.z = 0.04;
  trackNightMesh(nightMats, face, 1.4, 0.95, { glimmer: true, glimmerSpeed: 3.2 });
  g.add(face);
  g.userData.faceMat = face.material;
  g.userData.edgeMat = edge.material;

  // Small tip LEDs
  for (const [ox, oy] of [
    [0, faceH * 0.46],
    [0, -faceH * 0.46],
    [faceW * 0.46, 0],
    [-faceW * 0.46, 0],
  ]) {
    const bulb = cyl(0.028, 0.028, 0.035, 0xffe8a0, {
      emissive: 0xffd060,
      emissiveIntensity: 1.1,
    }, 8);
    bulb.position.set(ox, oy, 0.05);
    trackNightMesh(nightMats, bulb, 1.25, 0.85, { glimmer: true, glimmerSpeed: 4.5 });
    g.add(bulb);
  }
  return g;
}

function buildBottle(col, h = 0.28, r = 0.04) {
  const g = new THREE.Group();
  const body = cyl(r, r * 1.08, h * 0.7, col, { roughness: 0.32, metalness: 0.12 }, 7);
  body.position.y = h * 0.35;
  g.add(body);
  const neck = cyl(r * 0.42, r * 0.65, h * 0.28, col, { roughness: 0.32 }, 6);
  neck.position.y = h * 0.78;
  g.add(neck);
  const cap = cyl(r * 0.48, r * 0.48, 0.035, 0xc8a040, { metalness: 0.45, roughness: 0.38 }, 6);
  cap.position.y = h * 0.95;
  g.add(cap);
  // Label band
  const label = box(r * 1.9, h * 0.22, 0.01, 0xf0e8d8, { roughness: 0.7, castShadow: false });
  label.position.set(0, h * 0.38, r * 0.95);
  g.add(label);
  return g;
}

/** Better freestanding ATM with screen, keypad, card slot, receipt. */
function buildAtm(nightMats, lit) {
  const g = new THREE.Group();
  g.name = "atm";
  const body = box(0.58, 1.45, 0.38, 0x2a2a34, { roughness: 0.55, metalness: 0.15 });
  body.position.y = 0.78;
  g.add(body);
  // Top bezel
  const bezel = box(0.6, 0.12, 0.4, 0x1a1a22);
  bezel.position.y = 1.55;
  g.add(bezel);
  // Screen
  const screen = box(0.42, 0.36, 0.04, 0x0a2030, {
    emissive: 0x1a80c0,
    emissiveIntensity: 0.7,
    roughness: 0.25,
  });
  screen.position.set(0, 1.22, 0.2);
  lit(screen, 0.95, 0.6);
  g.add(screen);
  // Screen UI plane
  const ui = new THREE.Mesh(
    new THREE.PlaneGeometry(0.36, 0.28),
    new THREE.MeshStandardMaterial({
      map: labelTex("ATM", { w: 256, h: 192, bg: "#0a3048", fg: "#80e0ff", size: 48 }),
      emissive: 0x2080b0,
      emissiveIntensity: 0.4,
      roughness: 0.4,
      flatShading: true,
    })
  );
  ui.position.set(0, 1.22, 0.23);
  g.add(ui);
  // Keypad
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 3; c++) {
      const key = box(0.07, 0.06, 0.02, 0x3a3a48, { roughness: 0.5 });
      key.position.set(-0.1 + c * 0.1, 0.72 - r * 0.09, 0.2);
      g.add(key);
    }
  }
  // Card slot
  const slot = box(0.28, 0.04, 0.03, 0x0a0a10);
  slot.position.set(0, 0.95, 0.21);
  g.add(slot);
  // Receipt mouth
  const receipt = box(0.22, 0.03, 0.02, 0x1a1a22);
  receipt.position.set(0, 0.38, 0.2);
  g.add(receipt);
  const paper = box(0.18, 0.08, 0.01, 0xf0f0e8, { roughness: 0.9, castShadow: false });
  paper.position.set(0, 0.32, 0.22);
  g.add(paper);
  // Side stripe branding
  const stripe = box(0.04, 1.2, 0.02, 0x40a0ff, {
    emissive: 0x2080d0,
    emissiveIntensity: 0.45,
  });
  stripe.position.set(0.3, 0.8, 0.1);
  lit(stripe, 0.7, 0.4);
  g.add(stripe);
  // Soft screen wash
  const glow = new THREE.PointLight(0x40a0ff, 0.35, 2.5, 2);
  glow.position.set(0, 1.2, 0.5);
  g.add(glow);
  return g;
}

/**
 * Back bar: multi-tier liquor shelves, mirror, well, POS — bartender workspace.
 *
 * Layout (south wall at +X):
 *   wall → shelves/mirror → speed rail → **service aisle** → customer bar
 * `wallX` is the south wall face; the rail sits far enough off the wall that a
 * bartender can work the well without clipping the customer bar.
 */
function buildBackBar(nightMats, lit, add, nightLights, wallX) {
  // Shelves hug the wall; rail is the bartender's working edge
  const shelfX = wallX - 0.2;
  const railX = wallX - 0.95;

  // Brighter mirror backsplash
  const mirror = box(0.04, 1.85, 5.4, 0x3a5060, {
    metalness: 0.65,
    roughness: 0.15,
    emissive: 0x183040,
    emissiveIntensity: 0.35,
  });
  mirror.position.set(wallX - 0.06, 2.05, 0.1);
  add(mirror);

  // Warm wash lights along back bar
  for (const z of [-1.8, -0.4, 1.0, 2.2]) {
    const wash = new THREE.PointLight(0xffc090, 0.85, 4.5, 2);
    wash.position.set(shelfX - 0.25, 2.5, z);
    add(wash);
    nightLights.push({ light: wash, day: 0.55, night: 1.0 });
  }
  const backKey = new THREE.PointLight(0xffe0c0, 1.15, 7, 2);
  backKey.position.set(railX, 2.2, 0.1);
  add(backKey);
  nightLights.push({ light: backKey, day: 0.7, night: 1.3 });

  // Four shelf tiers, denser bottles
  const shelfCols = [
    0xc41e3a, 0x2a5a3a, 0xf0e8d0, 0x3a3a8a, 0xe8a040, 0x1a1a1e,
    0x8b0000, 0x4a7040, 0xd4af37, 0x5a2a6a, 0xc0c0c0, 0x402010,
    0xff6a3a, 0x80c0ff, 0x2a8a5a, 0x6a2a8a,
  ];
  for (let tier = 0; tier < 4; tier++) {
    const sy = 1.22 + tier * 0.38;
    const shelf = box(0.32, 0.055, 5.2, WOOD_DARK, { roughness: 0.65 });
    shelf.position.set(shelfX, sy, 0.1);
    add(shelf);
    for (let row = 0; row < 2; row++) {
      const count = 22;
      for (let i = 0; i < count; i++) {
        const h = 0.18 + ((i + tier + row) % 5) * 0.035;
        const r = 0.028 + ((i + row) % 3) * 0.006;
        const b = buildBottle(shelfCols[(i + tier * 5 + row * 3) % shelfCols.length], h, r);
        b.position.set(
          shelfX + 0.04 - row * 0.1,
          sy + 0.02,
          -2.25 + i * (5.0 / (count - 1))
        );
        add(b);
      }
    }
    const led = neonBox(0.035, 0.028, 5.0, [0xff4fa8, 0x40e0ff, 0x9b6dff, 0x3dd68c][tier], 0.85);
    led.position.set(shelfX - 0.18, sy - 0.04, 0.1);
    lit(led, 1.2, 0.8, { glimmerSpeed: 2.0 + tier * 0.25 });
    add(led);
  }

  // Diamond Stacy's neon on the back bar wall
  const barDiamond = buildDiamondNeon(nightMats);
  barDiamond.rotation.y = -Math.PI / 2;
  barDiamond.position.set(wallX - 0.2, 2.75, 0.15);
  barDiamond.scale.setScalar(1.15);
  add(barDiamond);
  const barNeonWash = new THREE.PointLight(0xff4fa8, 1.1, 5, 2);
  barNeonWash.position.set(railX, 2.6, 0.15);
  add(barNeonWash);
  nightLights.push({ light: barNeonWash, day: 0.65, night: 1.25 });

  // Speed rail / well — bartender side of the aisle
  const well = box(0.5, 0.35, 2.6, 0x2a2a30, { metalness: 0.3, roughness: 0.4 });
  well.position.set(railX, 1.0, 0.2);
  add(well);
  for (let i = 0; i < 12; i++) {
    const b = buildBottle(shelfCols[i % shelfCols.length], 0.18 + (i % 3) * 0.03, 0.032);
    b.position.set(railX, 1.18, -0.9 + i * 0.2);
    add(b);
  }

  // Ice bin
  const ice = box(0.42, 0.3, 0.52, 0xc8d0d8, {
    metalness: 0.4,
    roughness: 0.25,
    emissive: 0x90b0c0,
    emissiveIntensity: 0.18,
  });
  ice.position.set(railX, 1.0, 1.55);
  add(ice);

  // POS
  const pos = box(0.28, 0.35, 0.22, BLACK);
  pos.position.set(railX + 0.12, 1.35, -1.5);
  add(pos);
  const posScreen = box(0.24, 0.18, 0.03, 0x1a3048, {
    emissive: 0x3080c0,
    emissiveIntensity: 0.65,
  });
  posScreen.position.set(railX - 0.05, 1.45, -1.5);
  lit(posScreen, 0.9, 0.55);
  add(posScreen);

  // Draft tower
  const draft = box(0.4, 0.6, 0.4, METAL, { metalness: 0.45, roughness: 0.4 });
  draft.position.set(railX + 0.12, 1.45, 2.0);
  add(draft);
  for (const dz of [-0.1, 0, 0.1]) {
    const spout = cyl(0.025, 0.02, 0.22, 0xc8ccd0, { metalness: 0.5 }, 6);
    spout.rotation.x = Math.PI / 2;
    spout.position.set(railX - 0.1, 1.5, 2.0 + dz);
    add(spout);
    const handle = box(0.04, 0.14, 0.04, [0xc41e3a, 0xf0c14d, 0x2a5a3a][Math.round((dz + 0.1) * 10)] || 0xc41e3a);
    handle.position.set(railX + 0.12, 1.75, 2.0 + dz);
    add(handle);
  }

  // Hanging glass rack
  for (let i = 0; i < 14; i++) {
    const glass = cyl(0.04, 0.03, 0.12, 0xc0d0e0, {
      transparent: true,
      opacity: 0.45,
      roughness: 0.15,
      metalness: 0.2,
    }, 6);
    glass.position.set(shelfX - 0.2, 2.65, -1.8 + i * 0.2);
    add(glass);
  }

  // Rubber floor mat strip in the service aisle (bartender work zone)
  // Bar rear is at wallX - 2.55 + 0.525 ≈ wallX - 2.02; rail at wallX - 0.95
  // Aisle center ≈ wallX - 1.5
  const mat = box(1.0, 0.02, 4.8, 0x1a1a1e, { roughness: 0.95 });
  mat.position.set(wallX - 1.5, 0.09, 0.1);
  add(mat);
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

  // Interior wall finishes (photo-matched materials):
  //   WEST  (+Z, front)  — exposed brick
  //   EAST  (−Z, patio)  — purple paint
  //   NORTH (−X, lot)    — exposed brick
  //   SOUTH (+X, bar)    — wood paneling
  {
    const west = wallMesh(RW + WALL * 2, EAVE_H, WALL, "brick");
    west.position.set(0, EAVE_H * 0.5, halfD);
    add(west);
    const east = wallMesh(RW + WALL * 2, EAVE_H, WALL, "purple");
    east.position.set(0, EAVE_H * 0.5, -halfD);
    add(east);
    // Soft purple wash so the paint wall reads in the dark
    const purpleWash = new THREE.PointLight(0x8a5ab0, 0.45, 10, 2);
    purpleWash.position.set(0, 2.2, -halfD + 1.2);
    add(purpleWash);
    nightLights.push({ light: purpleWash, day: 0.3, night: 0.55 });

    const north = wallMesh(WALL, EAVE_H, RD, "brick");
    north.position.set(-halfW, EAVE_H * 0.5, 0);
    add(north);
    const south = wallMesh(WALL, EAVE_H, RD, "wood");
    south.position.set(halfW, EAVE_H * 0.5, 0);
    add(south);
  }

  // ── Church vault: pitched roof + exposed rafters ─────────────────
  // Ridge runs N–S (X). Slopes fall to the east (−Z) and west (+Z) eaves —
  // same read as the real room’s dark vaulted ceiling.
  {
    const rise = PEAK_H - EAVE_H;
    const run = halfD;
    const slopeLen = Math.hypot(run, rise);
    const pitch = Math.atan2(rise, run); // angle from horizontal

    // Dark underside sheathing (two big roof planes)
    for (const side of [-1, 1]) {
      const plane = box(RW + 0.4, 0.1, slopeLen + 0.08, CEIL, { roughness: 0.92 });
      // Sit at ridge, extend toward eave along local +Z, then pitch down
      const grp = new THREE.Group();
      grp.position.set(0, PEAK_H - 0.02, 0);
      grp.rotation.x = side > 0 ? pitch : -pitch;
      plane.position.set(0, -0.02, side * (slopeLen * 0.5));
      grp.add(plane);
      add(grp);
    }

    // Ridge beam (heavy timber along the peak)
    const ridge = box(RW * 0.98, 0.18, 0.2, RAFTER_WOOD, { roughness: 0.85 });
    ridge.position.set(0, PEAK_H - 0.08, 0);
    add(ridge);
    // Ridge cap plate
    const ridgeCap = box(RW * 0.98, 0.08, 0.28, RAFTER_DARK, { roughness: 0.88 });
    ridgeCap.position.set(0, PEAK_H + 0.02, 0);
    add(ridgeCap);

    // Exposed common rafters — pairs from ridge down each slope
    const rafterCount = 14;
    for (let i = 0; i < rafterCount; i++) {
      const x = -halfW + 0.45 + (i / (rafterCount - 1)) * (RW - 0.9);
      for (const side of [-1, 1]) {
        const rafter = box(0.11, 0.16, slopeLen - 0.05, i % 2 ? RAFTER_WOOD : RAFTER_DARK, {
          roughness: 0.88,
        });
        const grp = new THREE.Group();
        grp.position.set(x, PEAK_H - 0.12, 0);
        grp.rotation.x = side > 0 ? pitch : -pitch;
        // Slightly below the sheathing so they read as proud structure
        rafter.position.set(0, -0.12, side * (slopeLen * 0.5));
        grp.add(rafter);
        add(grp);
      }
      // Collar tie (horizontal cross-beam under the ridge — church truss read)
      if (i % 2 === 0) {
        const collar = box(0.1, 0.1, halfD * 0.9, RAFTER_DARK, { roughness: 0.88 });
        collar.position.set(x, EAVE_H + rise * 0.42, 0);
        add(collar);
      }
    }

    // Purlins — long members running along each slope (across the rafters)
    for (const side of [-1, 1]) {
      for (const t of [0.28, 0.55, 0.78]) {
        const y = PEAK_H - rise * t;
        const z = side * run * t;
        const purlin = box(RW * 0.96, 0.09, 0.11, RAFTER_WOOD, { roughness: 0.86 });
        purlin.position.set(0, y - 0.14, z);
        // Align purlin face to the roof pitch a bit
        purlin.rotation.x = side > 0 ? pitch * 0.35 : -pitch * 0.35;
        add(purlin);
      }
    }

    // Gable triangles — same finishes as the walls below (brick N, wood S)
    for (const x of [-halfW, halfW]) {
      const gableKind = x < 0 ? "brick" : "wood";
      const steps = 10;
      for (let i = 0; i < steps; i++) {
        const t0 = i / steps;
        const t1 = (i + 1) / steps;
        const y0 = EAVE_H + rise * t0;
        const y1 = EAVE_H + rise * t1;
        const midY = (y0 + y1) * 0.5;
        const zW = RD * (1 - (t0 + t1) * 0.5) + 0.15;
        const slab = wallMesh(WALL + 0.02, Math.max(0.08, y1 - y0 + 0.02), zW, gableKind);
        // Don't over-repeat brick on thin gable bands
        if (slab.material?.map) {
          slab.material.map = slab.material.map.clone();
          slab.material.map.repeat.set(gableKind === "brick" ? 2.2 : 3, 0.35);
        }
        slab.position.set(x, midY, 0);
        add(slab);
      }
      // Decorative gable rafter outline on the inside face
      for (const side of [-1, 1]) {
        const outline = box(0.08, 0.1, slopeLen * 0.95, RAFTER_WOOD, { roughness: 0.85 });
        const grp = new THREE.Group();
        grp.position.set(x + (x < 0 ? 0.08 : -0.08), PEAK_H - 0.1, 0);
        grp.rotation.x = side > 0 ? pitch : -pitch;
        outline.position.set(0, -0.08, side * (slopeLen * 0.48));
        grp.add(outline);
        add(grp);
      }
    }

    // King post drops under the ridge at a few bays (vertical timber)
    for (const x of [-3.2, 0, 3.2]) {
      const king = box(0.12, rise * 0.55, 0.12, RAFTER_WOOD, { roughness: 0.85 });
      king.position.set(x, EAVE_H + rise * 0.35, 0);
      add(king);
    }
  }

  // Truss ring + disco ball hang from near the ridge (under the vault)
  {
    const hangY = PEAK_H - 0.55;
    const ring = new THREE.Group();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const seg = box(0.42, 0.08, 0.08, METAL, { metalness: 0.45, roughness: 0.4 });
      seg.position.set(Math.cos(a) * 1.55, 0, Math.sin(a) * 1.55);
      seg.rotation.y = -a;
      ring.add(seg);
    }
    ring.position.set(-1.6, hangY, -0.9);
    add(ring);

    // Main disco ball
    const disco = buildDiscoBall(0.28);
    disco.position.set(-1.6, hangY - 0.75, -0.9);
    add(disco);
    g.userData.discoBall = disco;

    for (const [dx, dz] of [
      [0.9, 0.2],
      [-0.75, 0.45],
      [0.2, -0.85],
    ]) {
      const mini = buildDiscoBall(0.12);
      mini.position.set(-1.6 + dx, hangY - 0.5, -0.9 + dz);
      add(mini);
    }
  }

  // Twisted dark-wood columns — full height to the vault.
  // Pair at z≈2.2 is on the north railing. No column in front of the cathedral
  // window (was at −2.4, 0.55 — blocked the neon window).
  for (const [x, z] of [
    [-2.4, 2.2], // railing post (north bay)
    [-0.35, 2.2], // railing post (further south on same rail)
    [1.5, 1.6],
    [1.5, -1.3],
  ]) {
    const topY = roofYAt(z) - 0.12;
    const col = buildTwistedColumn(topY);
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

    // Foliage wall (textured + 3D leaf depth)
    const foliage = buildFoliageWall(2.5, 2.45);
    foliage.position.set(-1.15, 1.55, z - 0.04);
    foliage.rotation.y = Math.PI;
    add(foliage);

    // Thin diamond neon on the green wall — strong pink throw
    const diamond = buildDiamondNeon(nightMats);
    diamond.position.set(-1.15, 1.85, z - 0.22);
    diamond.rotation.y = Math.PI;
    add(diamond);
    g.userData.diamondNeon = diamond;
    const neonWash = new THREE.PointLight(0xff4fa8, 1.85, 7.5, 2);
    neonWash.position.set(-1.15, 1.85, z - 1.15);
    add(neonWash);
    nightLights.push({ light: neonWash, day: 1.1, night: 2.0 });
    g.userData.diamondLight = neonWash;
    // Extra floor/wall bounce
    const neonBounce = new THREE.PointLight(0xff80c0, 0.7, 5, 2);
    neonBounce.position.set(-1.15, 0.9, z - 0.9);
    add(neonBounce);
    nightLights.push({ light: neonBounce, day: 0.4, night: 0.85 });
    g.userData.diamondBounce = neonBounce;

    // Ring light camera
    const camStand = box(0.12, 1.2, 0.12, METAL);
    camStand.position.set(0.55, 0.6, z - 0.3);
    add(camStand);
    const ring = cyl(0.26, 0.26, 0.05, 0xf0f0f0, {
      emissive: 0xffffff,
      emissiveIntensity: 0.7,
      roughness: 0.3,
    }, 16);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0.55, 1.4, z - 0.42);
    lit(ring, 1.0, 0.65);
    add(ring);

    // ATM
    const atm = buildAtm(nightMats, lit);
    atm.position.set(1.45, 0, z - 0.28);
    add(atm);

    // Double front doors — full-width leaves like the exterior porch pair
    // (exterior totalW ≈ 1.34; interior goes wider so they read as real doors
    // in the larger room). Left leaf = entry; right = companion.
    // Looking at the west wall from inside: left = −X (north), right = +X (south).
    const doorCx = 3.2;
    const leafW = 0.95; // each leaf is a full door, not a skinny panel
    const leafH = 2.25;
    const totalW = leafW * 2 + 0.12;
    const doorFrame = box(totalW + 0.22, 2.55, 0.18, WOOD_DARK);
    doorFrame.position.set(doorCx, 1.3, z - 0.04);
    add(doorFrame);
    // Header beam
    const header = box(totalW + 0.28, 0.16, 0.2, WOOD_COL, { roughness: 0.8 });
    header.position.set(doorCx, 2.48, z - 0.08);
    add(header);
    // Side jambs (proud)
    for (const side of [-1, 1]) {
      const jamb = box(0.12, leafH + 0.15, 0.14, WOOD_COL, { roughness: 0.82 });
      jamb.position.set(doorCx + side * (totalW * 0.5 + 0.02), 1.2, z - 0.1);
      add(jamb);
    }
    // Left leaf (active entry — north leaf)
    const leftLeaf = box(leafW, leafH, 0.1, WOOD);
    leftLeaf.position.set(doorCx - leafW * 0.5 - 0.03, 1.18, z - 0.15);
    leftLeaf.name = "interiorFrontDoor";
    add(leftLeaf);
    // Right leaf (companion)
    const rightLeaf = box(leafW, leafH, 0.1, WOOD_DARK);
    rightLeaf.position.set(doorCx + leafW * 0.5 + 0.03, 1.18, z - 0.15);
    rightLeaf.name = "interiorFrontDoorRight";
    add(rightLeaf);
    // Carved X relief + lower panel on each leaf
    for (const lx of [doorCx - leafW * 0.5 - 0.03, doorCx + leafW * 0.5 + 0.03]) {
      for (const dir of [-1, 1]) {
        const arm = box(0.08, 1.05, 0.04, WOOD_COL_DARK);
        arm.rotation.z = dir * 0.55;
        arm.position.set(lx, 1.45, z - 0.22);
        add(arm);
      }
      // Bottom panel rail
      const rail = box(leafW * 0.85, 0.08, 0.04, WOOD_COL_DARK);
      rail.position.set(lx, 0.55, z - 0.2);
      add(rail);
      const rail2 = box(leafW * 0.85, 0.08, 0.04, WOOD_COL_DARK);
      rail2.position.set(lx, 1.0, z - 0.2);
      add(rail2);
    }
    // Center mullion / barley-twist read
    const mullion = box(0.1, leafH + 0.08, 0.12, WOOD_COL, { roughness: 0.75 });
    mullion.position.set(doorCx, 1.18, z - 0.13);
    add(mullion);
    // Pull only on the left (working) leaf
    const pull = cyl(0.045, 0.045, 0.1, 0xc8a040, { metalness: 0.5, roughness: 0.4 }, 8);
    pull.rotation.z = Math.PI / 2;
    pull.position.set(doorCx - 0.12, 1.2, z - 0.24);
    add(pull);
    // Iron ring pull accent
    const ring = cyl(0.07, 0.07, 0.03, 0x2a2a30, { metalness: 0.4, roughness: 0.5 }, 10);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(doorCx - 0.12, 1.2, z - 0.26);
    add(ring);
  }

  // ══════════════════════════════════════════════════════════════════
  // NORTH (−X) — glass lot exit · wood rail through columns · cathedral · DJ
  // ══════════════════════════════════════════════════════════════════
  {
    const x = -halfW + 0.1;
    // Glass door sits on the west end of the north wall (NW corner → parking)
    const doorZ = 3.15;

    // Full glass door to the parking lot — aluminum frame + clear panes
    {
      const dw = 1.15;
      const dh = 2.25;
      const frame = box(0.12, dh + 0.12, dw + 0.12, 0x4a5058, {
        metalness: 0.45,
        roughness: 0.35,
      });
      frame.position.set(x, dh * 0.5 + 0.06, doorZ);
      add(frame);
      // Two vertical panes (double glass door)
      for (const side of [-1, 1]) {
        const pane = box(0.05, dh - 0.15, dw * 0.42, 0x8ec8e8, {
          transparent: true,
          opacity: 0.28,
          roughness: 0.12,
          metalness: 0.25,
          emissive: 0x306080,
          emissiveIntensity: 0.18,
        });
        pane.position.set(x + 0.06, dh * 0.5 + 0.02, doorZ + side * dw * 0.24);
        add(pane);
      }
      // Mid stile + push bar
      const stile = box(0.06, dh - 0.1, 0.08, 0x3a4048, { metalness: 0.4, roughness: 0.4 });
      stile.position.set(x + 0.05, dh * 0.5, doorZ);
      add(stile);
      const push = box(0.05, 0.05, dw * 0.7, 0xc8ccd0, { metalness: 0.55, roughness: 0.35 });
      push.position.set(x + 0.12, 1.05, doorZ);
      add(push);
      // EXIT glow above
      const exitLite = neonBox(0.08, 0.12, 0.45, 0x3dd68c, 0.85);
      exitLite.position.set(x + 0.1, dh + 0.18, doorZ);
      lit(exitLite, 1.1, 0.7);
      add(exitLite);
      // Night lot glow through glass
      const lotGlow = new THREE.PointLight(0x80b0d0, 0.4, 4, 2);
      lotGlow.position.set(x + 0.6, 1.4, doorZ);
      add(lotGlow);
      nightLights.push({ light: lotGlow, day: 0.25, night: 0.5 });
    }

    // Dark wood railing to the right of the glass door, running SOUTH (+X)
    // through the two north-side columns at z ≈ 2.2.
    // Door is at z=3.15; railing sits just into the room at z=2.2 and runs
    // from the north wall south past columns (−2.4 and −0.35).
    {
      const railZ = 2.2;
      const railStartX = -halfW + 0.35; // at the north wall
      const railEndX = 0.35; // past second column
      const railLen = railEndX - railStartX;
      const railing = buildWoodRailing(railLen, { picketH: 0.95, spacing: 0.13 });
      railing.position.set(railStartX, 0, railZ);
      add(railing);
      // Short return at the north wall tying into the door frame
      const returnRail = buildWoodRailing(0.55, { picketH: 0.95, spacing: 0.12 });
      returnRail.rotation.y = Math.PI / 2;
      returnRail.position.set(railStartX + 0.08, 0, railZ);
      add(returnRail);
    }

    // Cathedral rainbow window (east of the railing / door)
    const cathed = buildCathedralWindow(nightMats);
    cathed.position.set(x + 0.08, 0.12, -0.25);
    cathed.rotation.y = Math.PI / 2; // face into room (+X)
    add(cathed);
    g.userData.cathedralPaneMat = cathed.userData.paneMat;
    g.userData.cathedralHalo = cathed.userData.haloMat;
    const winLight = new THREE.PointLight(0x40e0ff, 2.2, 12, 2);
    winLight.position.set(x + 1.6, 1.9, -0.25);
    winLight.name = "cathedralLight";
    add(winLight);
    nightLights.push({ light: winLight, day: 1.3, night: 2.4 });
    g.userData.cathedralLight = winLight;
    const winSpot = new THREE.SpotLight(0x40e0ff, 1.8, 14, 0.6, 0.45, 1.4);
    winSpot.position.set(x + 0.35, 2.5, -0.25);
    winSpot.target.position.set(x + 3.0, 0.1, -0.25);
    add(winSpot);
    add(winSpot.target);
    nightLights.push({ light: winSpot, day: 1.0, night: 1.9 });
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
  // SOUTH (+X) — bar front + service aisle + back bar + vape + bathroom
  // ══════════════════════════════════════════════════════════════════
  {
    const wallX = halfW - 0.08;
    // Customer bar sits well into the room so a bartender aisle (~1.1 units)
    // fits between bar rear and the back-bar rail.
    //   wall ≈ 5.67 → rail ≈ 4.72 → aisle → bar rear ≈ 3.65 → bar front ≈ 2.6
    const barX = wallX - 2.55;
    const barDepth = 1.05;

    // Bar body (customer side)
    const barLong = box(barDepth, 1.1, 5.6, BLACK);
    barLong.position.set(barX, 0.58, 0.15);
    add(barLong);
    // Rainbow LED front (toward the room, −X face)
    const bands = [0xff3b3b, 0xff9a1a, 0xffe14a, 0x3dd68c, 0x3ca0ff, 0x9b6dff];
    const panelW = 5.2;
    const segW = panelW / bands.length;
    for (let i = 0; i < bands.length; i++) {
      const seg = box(0.1, 0.75, segW * 0.94, bands[i], {
        emissive: bands[i],
        emissiveIntensity: 0.8,
        roughness: 0.35,
      });
      seg.position.set(barX - barDepth * 0.5 - 0.02, 0.48, -2.2 + segW * 0.5 + i * segW);
      lit(seg, 1.2, 0.75, { glimmerSpeed: 2.0 + i * 0.15, phase: i });
      add(seg);
      flashMats.push({ mat: seg.material, day: 0.5, night: 1.25 });
    }
    // Bar top
    const top = box(barDepth + 0.12, 0.09, 5.7, 0x2a2a30, { roughness: 0.35, metalness: 0.25 });
    top.position.set(barX, 1.18, 0.15);
    add(top);
    // Trans pride brick sitting on the bar top
    const prideBrick = buildTransPrideBrick();
    prideBrick.position.set(barX - 0.1, 1.28, 0.85);
    prideBrick.rotation.y = 0.15;
    add(prideBrick);
    // Stools on the customer side
    for (let i = 0; i < 9; i++) {
      const stool = new THREE.Group();
      const seat = cyl(0.15, 0.15, 0.06, BLACK, {}, 8);
      seat.position.y = 0.75;
      stool.add(seat);
      const leg = cyl(0.035, 0.045, 0.75, METAL, { metalness: 0.4, roughness: 0.5 }, 6);
      leg.position.y = 0.38;
      stool.add(leg);
      stool.position.set(barX - barDepth * 0.5 - 0.55, 0, -2.0 + i * 0.55);
      add(stool);
    }

    buildBackBar(nightMats, lit, add, nightLights, wallX);

    // Vape (on back-bar wall, end of run)
    const vape = box(0.55, 1.6, 0.35, 0x1a1a22);
    vape.position.set(wallX - 0.35, 0.85, -3.2);
    add(vape);
    const vapeScreen = box(0.42, 0.6, 0.05, 0x102018, {
      emissive: 0x20a040,
      emissiveIntensity: 0.55,
    });
    vapeScreen.position.set(wallX - 0.52, 1.25, -3.2);
    lit(vapeScreen, 0.8, 0.5);
    add(vapeScreen);

    // Bathroom
    const bathDoor = box(0.85, 2.15, 0.12, WOOD_DARK);
    bathDoor.position.set(wallX - 0.2, 1.15, -3.9);
    add(bathDoor);
    const bathSign = neonBox(0.22, 0.22, 0.05, 0x9b6dff, 0.65);
    bathSign.position.set(wallX - 0.25, 2.35, -3.9);
    lit(bathSign, 0.95, 0.6);
    add(bathSign);

    // Photobooth (near west end of bar run)
    const booth = box(1.0, 2.25, 1.0, BLACK);
    booth.position.set(wallX - 0.55, 1.15, 3.4);
    add(booth);
    const curtain = box(0.8, 1.6, 0.1, 0x5a1a40, {
      emissive: 0x401028,
      emissiveIntensity: 0.22,
    });
    curtain.position.set(wallX - 1.0, 1.05, 3.4);
    add(curtain);
    const photosNeon = neonBox(0.55, 0.16, 0.06, 0x80d0ff, 0.85);
    photosNeon.position.set(wallX - 1.0, 2.35, 3.4);
    lit(photosNeon, 1.15, 0.75);
    add(photosNeon);
  }

  // ── Dance floor — slightly sunken pit (photo has indented hardwood) ──
  {
    const pitX = -1.6;
    const pitZ = -0.9;
    const pitW = 3.6;
    const pitD = 3.0;
    const pitDepth = 0.12;

    // Pit floor (indented)
    const dance = box(pitW, 0.06, pitD, 0x18101c, { roughness: 0.35, metalness: 0.2 });
    dance.position.set(pitX, 0.04 - pitDepth, pitZ);
    add(dance);
    // Pit walls / step edge
    for (const [dx, dz, ww, dd] of [
      [0, pitD * 0.5, pitW + 0.12, 0.12],
      [0, -pitD * 0.5, pitW + 0.12, 0.12],
      [pitW * 0.5, 0, 0.12, pitD],
      [-pitW * 0.5, 0, 0.12, pitD],
    ]) {
      const edge = box(ww, pitDepth + 0.04, dd, 0x2a1a28, { roughness: 0.7 });
      edge.position.set(pitX + dx, pitDepth * 0.35, pitZ + dz);
      add(edge);
    }
    // Glow tiles on sunken floor
    const tileCols = [0xff4fa8, 0x40e0ff, 0x9b6dff, 0x3dd68c, 0xffe14a];
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 4; j++) {
        const tile = box(0.58, 0.02, 0.58, 0x201828, {
          emissive: tileCols[(i + j) % tileCols.length],
          emissiveIntensity: 0.22,
        });
        tile.position.set(
          pitX - 1.4 + i * 0.7,
          0.08 - pitDepth,
          pitZ - 1.05 + j * 0.7
        );
        lit(tile, 0.45, 0.22, { glimmerSpeed: 1.4 + i * 0.15, phase: i + j });
        add(tile);
      }
    }
    // Ambient dance lights (colored, animated in tick)
    const danceLights = [];
    for (let i = 0; i < 4; i++) {
      const col = [0xff4fa8, 0x40e0ff, 0x9b6dff, 0x3dd68c][i];
      const dl = new THREE.PointLight(col, 0.7, 6, 2);
      dl.position.set(pitX, 2.5, pitZ);
      add(dl);
      danceLights.push(dl);
      flashLights.push({ light: dl });
      nightLights.push({ light: dl, day: 0.4, night: 0.9 });
    }
    g.userData.danceLights = danceLights;
    g.userData.danceCenter = { x: pitX, z: pitZ };

    // Overhead color wash
    const danceKey = new THREE.PointLight(0xff80c0, 1.0, 8, 2);
    danceKey.position.set(pitX, 2.6, pitZ);
    add(danceKey);
    nightLights.push({ light: danceKey, day: 0.55, night: 1.15 });
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

  const barKey = new THREE.PointLight(0xffb080, 1.25, 13, 2);
  barKey.position.set(2.4, 2.45, 0.2);
  add(barKey);
  nightLights.push({ light: barKey, day: 0.8, night: 1.4 });

  const cool = new THREE.PointLight(0x60a0ff, 0.85, 11, 2);
  cool.position.set(-2.8, 2.5, -0.5);
  add(cool);
  nightLights.push({ light: cool, day: 0.5, night: 1.0 });

  // Pink wash near front door / darts
  const pinkWash = new THREE.PointLight(0xff60a8, 0.7, 8, 2);
  pinkWash.position.set(-2.5, 2.2, 3.0);
  add(pinkWash);
  nightLights.push({ light: pinkWash, day: 0.4, night: 0.85 });

  // Ceiling cans — hung under the vault (between eave and ridge)
  for (const [x, z] of [
    [-3, 2],
    [0, 2.5],
    [2, -1],
    [-2, -2.5],
    [1.5, 3],
    [3.5, 0.5],
    [-4, -1],
    [-1.5, -0.9],
  ]) {
    // Height follows the roof pitch a bit: higher near the ridge (z≈0)
    const t = Math.min(1, Math.abs(z) / halfD);
    const canY = PEAK_H - 0.45 - (PEAK_H - EAVE_H) * t * 0.55;
    const can = new THREE.PointLight(0xffe0c0, 0.42, 5.5, 2);
    can.position.set(x, canY, z);
    add(can);
    nightLights.push({ light: can, day: 0.28, night: 0.5 });
    // Small can housing
    const housing = cyl(0.06, 0.08, 0.1, 0x2a2a30, { roughness: 0.7 }, 6);
    housing.position.set(x, canY + 0.08, z);
    add(housing);
  }

  installVenueNight(g, nightMats, {
    lights: nightLights,
    flashMats,
    flashLights,
  });
  g.userData.setNight?.(1);

  // Rainbow cathedral, diamond pulse, disco spin, dance lights, TV flicker
  g.userData.tickInterior = (nowSec) => {
    g.userData.tickNight?.(nowSec * 1000);
    const hue = (nowSec * 0.1) % 1;
    const col = new THREE.Color().setHSL(hue, 0.88, 0.55);
    const pane = g.userData.cathedralPaneMat;
    if (pane) {
      pane.emissive.copy(col);
      pane.color.copy(col);
    }
    const halo = g.userData.cathedralHalo;
    if (halo) {
      halo.color.copy(col);
      halo.opacity = 0.14 + 0.08 * Math.sin(nowSec * 1.8);
    }
    const pl = g.userData.cathedralLight;
    if (pl) pl.color.copy(col);
    const sp = g.userData.cathedralSpot;
    if (sp) sp.color.copy(col);

    // Diamond neon pulse + throw light
    const pulse = 0.75 + 0.35 * Math.sin(nowSec * 3.2) + 0.12 * Math.sin(nowSec * 7.1);
    const dFace = g.userData.diamondNeon?.userData?.faceMat;
    if (dFace) dFace.emissiveIntensity = 0.85 * pulse;
    const dEdge = g.userData.diamondNeon?.userData?.edgeMat;
    if (dEdge) dEdge.emissiveIntensity = 1.1 * pulse;
    const dL = g.userData.diamondLight;
    if (dL) dL.intensity = 1.4 * pulse;
    const dB = g.userData.diamondBounce;
    if (dB) dB.intensity = 0.55 * pulse;

    // Disco ball spin
    const disco = g.userData.discoBall;
    if (disco) disco.rotation.y = nowSec * 0.7;

    // Orbiting dance-floor color lights
    const dls = g.userData.danceLights;
    const dc = g.userData.danceCenter;
    if (dls && dc) {
      for (let i = 0; i < dls.length; i++) {
        const a = nowSec * 0.9 + (i / dls.length) * Math.PI * 2;
        dls[i].position.set(
          dc.x + Math.cos(a) * 1.4,
          2.2 + 0.3 * Math.sin(nowSec * 2 + i),
          dc.z + Math.sin(a) * 1.2
        );
        dls[i].intensity = 0.55 + 0.35 * Math.sin(nowSec * 3 + i * 1.7);
      }
    }

    // Soft TV emissive pulse
    const tvs = g.userData.tvScreens;
    if (tvs) {
      const tvPulse = 0.4 + 0.18 * Math.sin(nowSec * 2.4);
      for (let i = 0; i < tvs.length; i++) {
        const m = tvs[i].material;
        if (m) m.emissiveIntensity = tvPulse + 0.06 * Math.sin(nowSec * 3 + i);
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
