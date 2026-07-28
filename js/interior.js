/**
 * interior.js — low-poly inside of Stacy's @ Melrose.
 *
 * Same blocky flat-shaded vocabulary as the exterior. Room axes match the
 * building's local space so a visitor who walked through the front door is
 * oriented the same way:
 *
 *         −X  north  (parking exit, rainbow window, DJ, dance floor)
 *          |
 *  +Z west ┼ −Z east   (+Z = street / front door wall)
 *  (front) |           (−Z = patio wall)
 *         +X  south  (bar, bathroom entrance)
 *
 * Wall map (standing in the middle, looking at each wall L→R):
 *   WEST  (+Z): darts · green foliage photo nook · Stacy's neon · party cam · ATM · wood front door
 *   NORTH (−X): glass lot exit · railing · rainbow cathedral window · DJ · jukebox · booths
 *   EAST  (−Z): TV booths · patio door · walk-in · beer taps
 *   SOUTH (+X): walk-in · beer draft · rainbow bar · vape · bathroom door · photobooth
 *
 * References live in refs/inside/ (not shipped). Night always "on" inside —
 * this is a dark bar; neons run full regardless of the outdoor sun.
 */
import * as THREE from "three";
import {
  box,
  cyl,
  neonBox,
  canvasTexture,
  roundRect,
  trackNightMat,
  trackNightMesh,
  installVenueNight,
} from "./kit.js";

// Room shell (slightly inside the exterior 6.4 × 4.6 footprint)
const RW = 6.0; // N–S (X)
const RD = 4.4; // E–W depth (Z)
const RH = 2.7;
const WALL = 0.12;
const halfW = RW * 0.5;
const halfD = RD * 0.5;

const WOOD = 0x4a3428;
const WOOD_DARK = 0x2e2018;
const BRICK = 0xc4b49a;
const BRICK_DARK = 0x9a8a72;
const FLOOR = 0x3a2a1e;
const CEIL = 0x1a1418;
const BLACK = 0x141218;
const METAL = 0x3a3e46;
const PURPLE = 0x5a3a7a;

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

function stacysNeonTex() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 220;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, 512, 220);
  // Script-ish wordmark
  ctx.strokeStyle = "#ff4fa8";
  ctx.fillStyle = "#ff6ec7";
  ctx.lineWidth = 6;
  ctx.font = "italic bold 110px Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "#ff2a8a";
  ctx.shadowBlur = 24;
  ctx.fillText("Stacy's", 256, 100);
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#c8f0ff";
  ctx.font = "bold 28px Arial, sans-serif";
  ctx.fillText("@ MELROSE", 256, 175);
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
  // Wedges
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

function rainbowPanelTex() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 256;
  const ctx = c.getContext("2d");
  const bands = ["#ff3b3b", "#ff9a1a", "#ffe14a", "#3dd68c", "#3ca0ff", "#9b6dff"];
  const bh = 256 / bands.length;
  bands.forEach((col, i) => {
    ctx.fillStyle = col;
    ctx.fillRect(0, i * bh, 64, bh + 1);
  });
  return canvasTexture(c, 1);
}

function tvWallTex() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 192;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#0a0c14";
  ctx.fillRect(0, 0, 512, 192);
  for (let i = 0; i < 4; i++) {
    const x = 12 + i * 126;
    ctx.fillStyle = "#12182a";
    ctx.fillRect(x, 16, 114, 160);
    const g = ctx.createLinearGradient(x, 16, x + 114, 176);
    g.addColorStop(0, "#2a1848");
    g.addColorStop(0.5, "#184868");
    g.addColorStop(1, "#481848");
    ctx.fillStyle = g;
    ctx.fillRect(x + 6, 22, 102, 148);
    ctx.fillStyle = "#ff6ec7";
    ctx.font = "bold 18px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("LIVE", x + 57, 100);
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
  for (let i = 0; i < 80; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const r = 8 + Math.random() * 22;
    ctx.fillStyle = Math.random() > 0.5 ? "#1e5a28" : "#2a7a38";
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.7, Math.random(), 0, Math.PI * 2);
    ctx.fill();
  }
  // Red accent flowers
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = "#c41e3a";
    ctx.beginPath();
    ctx.arc(Math.random() * 256, Math.random() * 256, 4 + Math.random() * 5, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvasTexture(c, 2);
}

/**
 * Build the full interior group.
 * @returns {THREE.Group}
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
    // Inside is always "night club" — day intensity is still bright for neons
    trackNightMesh(nightMats, mesh, nightI, dayI, { glimmer: true, ...opts });
    return mesh;
  };

  // ── Shell ──────────────────────────────────────────────────────────
  const floor = box(RW, 0.08, RD, FLOOR, { roughness: 0.9 });
  floor.position.y = 0.04;
  add(floor);
  // Floor planks as stripes (cheap read)
  for (let i = 0; i < 14; i++) {
    const plank = box(RW * 0.98, 0.01, 0.12, i % 2 ? 0x4a3428 : 0x3a2a1e, {
      roughness: 0.92,
      castShadow: false,
    });
    plank.position.set(0, 0.085, -halfD + 0.25 + i * 0.3);
    add(plank);
  }

  const ceil = box(RW, 0.1, RD, CEIL, { roughness: 0.95 });
  ceil.position.y = RH;
  add(ceil);

  // Four walls (inward faces)
  // West (+Z)
  add(box(RW + WALL * 2, RH, WALL, BRICK)).position.set(0, RH * 0.5, halfD);
  // East (−Z)
  add(box(RW + WALL * 2, RH, WALL, BRICK_DARK)).position.set(0, RH * 0.5, -halfD);
  // North (−X)
  add(box(WALL, RH, RD, BRICK)).position.set(-halfW, RH * 0.5, 0);
  // South (+X)
  add(box(WALL, RH, RD, WOOD_DARK)).position.set(halfW, RH * 0.5, 0);

  // Beams / industrial ceiling clutter
  for (const z of [-1.2, 0, 1.2]) {
    const beam = box(RW * 0.96, 0.12, 0.16, BLACK, { roughness: 0.8 });
    beam.position.set(0, RH - 0.18, z);
    add(beam);
  }
  // Columns (twisted-column vibe — stacked rotated boxes)
  for (const [x, z] of [
    [-1.4, 0.9],
    [-1.4, -0.6],
    [0.9, 0.7],
  ]) {
    const col = new THREE.Group();
    for (let i = 0; i < 8; i++) {
      const seg = box(0.16, 0.28, 0.16, 0xb8a890, { roughness: 0.7 });
      seg.position.y = 0.2 + i * 0.28;
      seg.rotation.y = i * 0.35;
      col.add(seg);
    }
    col.position.set(x, 0, z);
    add(col);
  }

  // ══════════════════════════════════════════════════════════════════
  // WEST WALL (+Z) — front: darts · foliage · neon · cam · ATM · door
  // Looking at +Z wall from inside, left is −X (north), right is +X (south)
  // ══════════════════════════════════════════════════════════════════
  {
    const z = halfD - 0.08;
    // Dart section (north end of west wall)
    const dartTex = dartboardTex();
    for (const [x, s] of [
      [-2.2, 1],
      [-1.55, 0.9],
    ]) {
      const cabinet = box(0.55 * s, 1.35 * s, 0.28, BLACK);
      cabinet.position.set(x, 0.85 * s, z - 0.12);
      add(cabinet);
      const board = new THREE.Mesh(
        new THREE.CircleGeometry(0.22 * s, 16),
        new THREE.MeshStandardMaterial({
          map: dartTex,
          roughness: 0.55,
          flatShading: true,
        })
      );
      board.position.set(x, 1.05 * s, z - 0.26);
      add(board);
    }

    // Green foliage photo nook
    const foliage = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 1.5),
      new THREE.MeshStandardMaterial({
        map: foliageTex(),
        roughness: 0.85,
        flatShading: true,
      })
    );
    foliage.position.set(-0.55, 1.35, z - 0.02);
    foliage.rotation.y = Math.PI; // face into room (−Z)
    add(foliage);

    // Stacy's neon sign on foliage
    const neonSign = new THREE.Mesh(
      new THREE.PlaneGeometry(0.85, 0.38),
      new THREE.MeshStandardMaterial({
        map: stacysNeonTex(),
        transparent: true,
        emissive: 0xff4fa8,
        emissiveIntensity: 0.7,
        roughness: 0.4,
        flatShading: true,
      })
    );
    neonSign.position.set(-0.55, 1.55, z - 0.05);
    neonSign.rotation.y = Math.PI;
    lit(neonSign, 1.1, 0.75, { glimmerSpeed: 2.4 });
    add(neonSign);
    const neonWash = new THREE.PointLight(0xff4fa8, 0.9, 4, 2);
    neonWash.position.set(-0.55, 1.55, z - 0.6);
    add(neonWash);
    nightLights.push({ light: neonWash, day: 0.55, night: 1.1 });

    // Ring light party camera
    const camStand = box(0.12, 1.1, 0.12, METAL);
    camStand.position.set(0.35, 0.55, z - 0.25);
    add(camStand);
    const ring = cyl(0.22, 0.22, 0.04, 0xf0f0f0, {
      emissive: 0xffffff,
      emissiveIntensity: 0.6,
      roughness: 0.3,
    }, 16);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0.35, 1.25, z - 0.35);
    lit(ring, 0.9, 0.55);
    add(ring);
    const camBody = box(0.14, 0.1, 0.18, BLACK);
    camBody.position.set(0.35, 1.25, z - 0.28);
    add(camBody);

    // ATM
    const atm = box(0.45, 1.2, 0.28, 0x2a2a32);
    atm.position.set(0.95, 0.7, z - 0.18);
    add(atm);
    const atmScreen = box(0.32, 0.28, 0.04, 0x1a3040, {
      emissive: 0x2a6080,
      emissiveIntensity: 0.45,
    });
    atmScreen.position.set(0.95, 1.05, z - 0.32);
    lit(atmScreen, 0.7, 0.4);
    add(atmScreen);

    // Wooden front entrance (south end of west wall — toward +X)
    const doorFrame = box(1.05, 2.15, 0.14, WOOD_DARK);
    doorFrame.position.set(2.15, 1.1, z - 0.04);
    add(doorFrame);
    const doorLeaf = box(0.9, 1.95, 0.08, WOOD);
    doorLeaf.position.set(2.15, 1.05, z - 0.12);
    doorLeaf.name = "interiorFrontDoor";
    add(doorLeaf);
    // Carved X relief (echo exterior doors)
    for (const dir of [-1, 1]) {
      const arm = box(0.08, 0.9, 0.04, WOOD_DARK);
      arm.rotation.z = dir * 0.55;
      arm.position.set(2.15, 1.15, z - 0.18);
      add(arm);
    }
    const pull = cyl(0.04, 0.04, 0.08, 0xc8a040, { metalness: 0.5, roughness: 0.4 }, 8);
    pull.rotation.z = Math.PI / 2;
    pull.position.set(2.45, 1.05, z - 0.2);
    add(pull);
  }

  // ══════════════════════════════════════════════════════════════════
  // NORTH WALL (−X) — lot exit · rail · rainbow window · DJ · jukebox · booths
  // Looking at −X wall: left is −Z (east/patio), right is +Z (west/street)
  // ══════════════════════════════════════════════════════════════════
  {
    const x = -halfW + 0.08;
    // Glass door to parking (west/north corner — toward +Z)
    const glassDoor = box(0.1, 2.0, 0.85, 0x6ab0d0, {
      transparent: true,
      opacity: 0.35,
      roughness: 0.15,
      metalness: 0.2,
      emissive: 0x204060,
      emissiveIntensity: 0.2,
    });
    glassDoor.position.set(x + 0.05, 1.05, 1.55);
    add(glassDoor);
    const gFrame = box(0.08, 2.1, 0.95, METAL);
    gFrame.position.set(x, 1.05, 1.55);
    add(gFrame);

    // Iron railing (between exit and dance)
    for (let i = 0; i < 6; i++) {
      const picket = box(0.04, 0.7, 0.04, 0x2a2a30);
      picket.position.set(x + 0.2, 0.45, 0.9 - i * 0.18);
      add(picket);
    }
    const rail = box(0.05, 0.05, 1.15, 0x3a3a42);
    rail.position.set(x + 0.2, 0.8, 0.45);
    add(rail);

    // Cathedral rainbow window — glows and cycles
    const winW = 0.12;
    const winH = 1.7;
    const winD = 1.0;
    const rainbowWin = new THREE.Group();
    rainbowWin.name = "rainbowWindow";
    rainbowWin.position.set(x + 0.02, 1.35, -0.15);
    const pane = box(winW, winH, winD, 0x88e0ff, {
      emissive: 0x40c8ff,
      emissiveIntensity: 0.9,
      roughness: 0.25,
    });
    lit(pane, 1.3, 0.9, { glimmerSpeed: 1.8 });
    rainbowWin.add(pane);
    // Vertical mullions
    for (const dz of [-0.35, 0, 0.35]) {
      const mull = box(0.04, winH * 0.98, 0.05, BLACK);
      mull.position.set(0.04, 0, dz);
      rainbowWin.add(mull);
    }
    // Horizontal bars
    for (const dy of [-0.55, 0, 0.55]) {
      const bar = box(0.04, 0.05, winD * 0.95, BLACK);
      bar.position.set(0.04, dy, 0);
      rainbowWin.add(bar);
    }
    add(rainbowWin);
    const winLight = new THREE.PointLight(0x40e0ff, 1.4, 7, 2);
    winLight.position.set(x + 0.8, 1.4, -0.15);
    winLight.name = "rainbowWindowLight";
    add(winLight);
    nightLights.push({ light: winLight, day: 0.9, night: 1.6 });
    g.userData.rainbowWindowLight = winLight;
    g.userData.rainbowWindowPane = pane;

    // DJ booth / stage riser
    const stage = box(1.4, 0.35, 1.6, 0x1a1a22);
    stage.position.set(x + 0.85, 0.2, -1.2);
    add(stage);
    const djDesk = box(1.2, 0.55, 0.55, BLACK);
    djDesk.position.set(x + 0.75, 0.7, -1.2);
    add(djDesk);
    // Mixer glow
    for (let i = 0; i < 5; i++) {
      const knob = box(0.12, 0.04, 0.12, 0x2a2a30, {
        emissive: [0xff4fa8, 0x40e0ff, 0x9b6dff, 0x3dd68c, 0xffe14a][i],
        emissiveIntensity: 0.55,
      });
      knob.position.set(x + 0.4 + i * 0.18, 0.98, -1.05);
      lit(knob, 0.85, 0.5);
      add(knob);
    }
    // Stacy's LED bar behind DJ
    const ledBar = neonBox(1.3, 0.22, 0.08, 0x3060ff, 0.85);
    ledBar.position.set(x + 0.2, 1.85, -1.2);
    lit(ledBar, 1.2, 0.75, { glimmerSpeed: 3.5 });
    add(ledBar);
    const ledLabel = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.16),
      new THREE.MeshStandardMaterial({
        map: labelTex("Stacy's", { w: 256, h: 64, bg: "#102040", fg: "#80c0ff", size: 36 }),
        emissive: 0x4060ff,
        emissiveIntensity: 0.4,
        roughness: 0.4,
        flatShading: true,
      })
    );
    ledLabel.position.set(x + 0.28, 1.85, -1.15);
    ledLabel.rotation.y = Math.PI / 2;
    add(ledLabel);

    // Jukebox
    const juke = box(0.55, 1.35, 0.4, 0x1a1020);
    juke.position.set(x + 0.45, 0.7, 0.55);
    add(juke);
    const jukeGlow = box(0.4, 0.55, 0.08, 0xff4fa8, {
      emissive: 0xff2a80,
      emissiveIntensity: 0.7,
    });
    jukeGlow.position.set(x + 0.65, 0.95, 0.55);
    lit(jukeGlow, 1.0, 0.6, { glimmerSpeed: 2.2 });
    add(jukeGlow);

    // Booth seating (east-north corner)
    for (const z of [-1.7, -1.15]) {
      const booth = box(0.9, 0.55, 0.45, 0x3a2030);
      booth.position.set(x + 1.1, 0.35, z);
      add(booth);
      const seat = box(0.85, 0.1, 0.4, 0x5a3048);
      seat.position.set(x + 1.1, 0.55, z);
      add(seat);
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // EAST WALL (−Z) — TV booths · patio door · walk-in · beer taps
  // Looking at −Z: left is +X (south/bar), right is −X (north/dance)
  // ══════════════════════════════════════════════════════════════════
  {
    const z = -halfD + 0.08;
    // TV wall + booths (north-east)
    const tvs = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 0.75),
      new THREE.MeshStandardMaterial({
        map: tvWallTex(),
        emissive: 0x204060,
        emissiveIntensity: 0.35,
        roughness: 0.45,
        flatShading: true,
      })
    );
    tvs.position.set(-1.0, 1.85, z + 0.02);
    // Face into room (+Z)
    lit(tvs, 0.55, 0.35);
    add(tvs);

    for (const x of [-1.7, -0.95, -0.2]) {
      const booth = box(0.65, 0.7, 0.7, 0x3a2830);
      booth.position.set(x, 0.4, z + 0.45);
      add(booth);
      const table = box(0.5, 0.08, 0.5, WOOD);
      table.position.set(x, 0.72, z + 0.55);
      add(table);
    }

    // Patio door
    const patioDoor = box(0.85, 2.0, 0.1, 0x2a3a2a);
    patioDoor.position.set(0.7, 1.05, z + 0.06);
    add(patioDoor);
    const patioGlass = box(0.55, 1.2, 0.04, 0x80c0a0, {
      transparent: true,
      opacity: 0.4,
      emissive: 0x204030,
      emissiveIntensity: 0.15,
    });
    patioGlass.position.set(0.7, 1.2, z + 0.12);
    add(patioGlass);
    // Exit sign
    const exit = neonBox(0.35, 0.12, 0.04, 0x3dd68c, 0.7);
    exit.position.set(0.7, 2.2, z + 0.1);
    lit(exit, 1.0, 0.65);
    add(exit);

    // Walk-in cooler door
    const walkIn = box(0.7, 1.85, 0.12, 0x3a4048, { metalness: 0.35, roughness: 0.45 });
    walkIn.position.set(1.55, 0.95, z + 0.06);
    add(walkIn);
    const wiHandle = box(0.08, 0.35, 0.06, 0xc8ccd0, { metalness: 0.5, roughness: 0.35 });
    wiHandle.position.set(1.75, 1.0, z + 0.14);
    add(wiHandle);

    // Beer taps strip
    const tapRail = box(0.9, 0.12, 0.2, METAL, { metalness: 0.4, roughness: 0.4 });
    tapRail.position.set(2.25, 1.15, z + 0.2);
    add(tapRail);
    for (let i = 0; i < 5; i++) {
      const tap = cyl(0.03, 0.025, 0.28, 0xc8ccd0, { metalness: 0.5, roughness: 0.35 }, 6);
      tap.position.set(1.95 + i * 0.14, 1.35, z + 0.22);
      add(tap);
      const handle = box(0.04, 0.12, 0.04, [0xc41e3a, 0xf0c14d, 0x2a5a3a, 0x3a3a8a, 0xe8a040][i]);
      handle.position.set(1.95 + i * 0.14, 1.52, z + 0.22);
      add(handle);
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // SOUTH (+X) — walk-in · beer draft · BAR · vape · bathroom · photobooth
  // Looking at +X: left is +Z (west/front), right is −Z (east/patio)
  // ══════════════════════════════════════════════════════════════════
  {
    const x = halfW - 0.08;

    // L-shaped bar: long run along south wall, short leg toward west
    const barLong = box(0.85, 1.05, 3.2, BLACK);
    barLong.position.set(x - 0.55, 0.55, 0.15);
    add(barLong);
    // Rainbow LED front face of bar
    const bands = [0xff3b3b, 0xff9a1a, 0xffe14a, 0x3dd68c, 0x3ca0ff, 0x9b6dff];
    const panelH = 0.7;
    const panelW = 3.0;
    const segW = panelW / bands.length;
    for (let i = 0; i < bands.length; i++) {
      const seg = box(0.08, panelH, segW * 0.95, bands[i], {
        emissive: bands[i],
        emissiveIntensity: 0.75,
        roughness: 0.35,
      });
      seg.position.set(
        x - 0.95,
        0.45,
        -1.2 + segW * 0.5 + i * segW
      );
      lit(seg, 1.15, 0.7, { glimmerSpeed: 2.0 + i * 0.15, phase: i });
      add(seg);
      flashMats.push({
        mat: seg.material,
        day: 0.45,
        night: 1.2,
      });
    }
    // Bar top
    const top = box(0.95, 0.08, 3.3, 0x2a2a30, { roughness: 0.35, metalness: 0.25 });
    top.position.set(x - 0.55, 1.1, 0.15);
    add(top);
    // Bar stools
    for (let i = 0; i < 6; i++) {
      const stool = new THREE.Group();
      const seat = cyl(0.14, 0.14, 0.06, BLACK, {}, 8);
      seat.position.y = 0.72;
      stool.add(seat);
      const leg = cyl(0.03, 0.04, 0.72, METAL, { metalness: 0.4, roughness: 0.5 }, 6);
      leg.position.y = 0.36;
      stool.add(leg);
      stool.position.set(x - 1.35, 0, -1.0 + i * 0.48);
      add(stool);
    }
    // Back bar bottles shelf
    const shelf = box(0.25, 0.9, 2.4, WOOD_DARK);
    shelf.position.set(x - 0.2, 1.55, 0.1);
    add(shelf);
    for (let i = 0; i < 12; i++) {
      const bottle = cyl(
        0.035,
        0.04,
        0.22 + (i % 3) * 0.05,
        [0xc41e3a, 0x2a5a3a, 0xf0e8d0, 0x3a3a8a, 0xe8a040, 0x1a1a1e][i % 6],
        { roughness: 0.35 },
        6
      );
      bottle.position.set(
        x - 0.22,
        1.35 + (i % 2) * 0.35,
        -0.9 + i * 0.18
      );
      add(bottle);
    }
    // Stacy's neon behind bar
    const barNeon = neonBox(0.9, 0.28, 0.06, 0x40a0ff, 0.9);
    barNeon.position.set(x - 0.18, 2.15, 0.2);
    lit(barNeon, 1.2, 0.8, { glimmerSpeed: 2.6 });
    add(barNeon);

    // Draft tower on west end of bar
    const draft = box(0.35, 0.55, 0.35, METAL, { metalness: 0.45, roughness: 0.4 });
    draft.position.set(x - 0.55, 1.4, 1.35);
    add(draft);
    for (const dz of [-0.08, 0.08]) {
      const spout = cyl(0.025, 0.02, 0.2, 0xc8ccd0, { metalness: 0.5 }, 6);
      spout.rotation.x = Math.PI / 2;
      spout.position.set(x - 0.7, 1.45, 1.35 + dz);
      add(spout);
    }

    // Vape machine
    const vape = box(0.5, 1.5, 0.3, 0x1a1a22);
    vape.position.set(x - 0.35, 0.8, -1.55);
    add(vape);
    const vapeScreen = box(0.38, 0.55, 0.04, 0x102018, {
      emissive: 0x20a040,
      emissiveIntensity: 0.5,
    });
    vapeScreen.position.set(x - 0.5, 1.15, -1.55);
    lit(vapeScreen, 0.75, 0.45);
    add(vapeScreen);

    // Bathroom entrance (south-east corner, behind the bar)
    const bathDoor = box(0.75, 2.0, 0.1, WOOD_DARK);
    bathDoor.position.set(x - 0.2, 1.05, -1.95);
    add(bathDoor);
    const bathSign = neonBox(0.2, 0.2, 0.04, 0x9b6dff, 0.6);
    bathSign.position.set(x - 0.25, 2.15, -1.95);
    lit(bathSign, 0.9, 0.55);
    add(bathSign);

    // Photobooth (southwest corner — near front)
    const booth = box(0.85, 2.1, 0.85, BLACK);
    booth.position.set(x - 0.55, 1.1, 1.75);
    add(booth);
    const curtain = box(0.7, 1.5, 0.08, 0x5a1a40, {
      emissive: 0x401028,
      emissiveIntensity: 0.2,
    });
    curtain.position.set(x - 0.95, 1.0, 1.75);
    add(curtain);
    const photosNeon = neonBox(0.5, 0.14, 0.05, 0x80d0ff, 0.8);
    photosNeon.position.set(x - 0.95, 2.15, 1.75);
    lit(photosNeon, 1.1, 0.7);
    add(photosNeon);
  }

  // ── Dance floor center ────────────────────────────────────────────
  {
    const dance = box(2.2, 0.04, 1.8, 0x1a1220, { roughness: 0.35, metalness: 0.15 });
    dance.position.set(-0.9, 0.1, -0.5);
    add(dance);
    // Disco ball
    const ball = cyl(0.14, 0.14, 0.14, 0xd0d8e0, {
      metalness: 0.7,
      roughness: 0.2,
      emissive: 0xa0b0c0,
      emissiveIntensity: 0.35,
    }, 10);
    ball.position.set(-0.9, 2.35, -0.5);
    lit(ball, 0.6, 0.35, { glimmerSpeed: 5 });
    add(ball);
    const danceLight = new THREE.PointLight(0xff80c0, 0.7, 5, 2);
    danceLight.position.set(-0.9, 2.0, -0.5);
    add(danceLight);
    flashLights.push({ light: danceLight });
    nightLights.push({ light: danceLight, day: 0.4, night: 0.9 });
  }

  // ── High-top tables on the floor ──────────────────────────────────
  for (const [x, z] of [
    [-0.2, 0.9],
    [0.5, 0.5],
    [-0.3, -1.5],
  ]) {
    const t = new THREE.Group();
    const top = cyl(0.22, 0.22, 0.05, WOOD_DARK, {}, 8);
    top.position.y = 0.95;
    t.add(top);
    const leg = cyl(0.04, 0.05, 0.95, METAL, { metalness: 0.4 }, 6);
    leg.position.y = 0.48;
    t.add(leg);
    t.position.set(x, 0, z);
    add(t);
  }

  // Ambient interior fill — always a dark club
  const amb = new THREE.AmbientLight(0x302038, 0.45);
  add(amb);
  const hemi = new THREE.HemisphereLight(0x406080, 0x201018, 0.35);
  add(hemi);
  // Warm bar key
  const barKey = new THREE.PointLight(0xffa060, 0.7, 8, 2);
  barKey.position.set(1.2, 2.0, 0.2);
  add(barKey);
  nightLights.push({ light: barKey, day: 0.5, night: 0.85 });
  // Cool dance fill
  const cool = new THREE.PointLight(0x60a0ff, 0.55, 7, 2);
  cool.position.set(-1.5, 2.1, -0.3);
  add(cool);
  nightLights.push({ light: cool, day: 0.35, night: 0.7 });

  installVenueNight(g, nightMats, {
    lights: nightLights,
    flashMats,
    flashLights,
  });
  // Club is always on — full night mix
  g.userData.setNight?.(1);

  // Rainbow window color cycle
  g.userData.tickInterior = (nowSec) => {
    g.userData.tickNight?.(nowSec * 1000);
    const hue = (nowSec * 0.12) % 1;
    const col = new THREE.Color().setHSL(hue, 0.85, 0.55);
    const pane = g.userData.rainbowWindowPane;
    if (pane?.material) {
      pane.material.emissive.copy(col);
      pane.material.color.copy(col);
    }
    const pl = g.userData.rainbowWindowLight;
    if (pl) pl.color.copy(col);
  };

  // Camera subject for pocket framing
  g.userData.subject = {
    center: new THREE.Vector3(0.1, 1.15, 0.1),
    radius: 3.4,
  };
  g.userData.defaultView = { az: 200, el: 12, zoom: 0.95 };

  return g;
}
