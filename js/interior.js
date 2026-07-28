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
import {
  makeStacysDiamondLogoTexture,
  STACYS_DISPLAY,
  STACYS_UI,
} from "./stacys.js";
import { createInteriorLife } from "./interiorLife.js";

/** Thick modern club UI type (Outfit). Stacy's wordmark uses STACYS_DISPLAY via font:"logo". */
const FUN_FONT = `Outfit, "DM Sans", "Segoe UI", system-ui, sans-serif`;

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
/**
 * Manager lookout above the Stacy's diamond (south / bar wall).
 * Real open aperture through wall + gable — no glass slab (that read as a dead TV).
 * Club-side and office-side openings share these world sizes.
 */
const LOOKOUT_W = 1.55;
const LOOKOUT_H = 1.05;
const LOOKOUT_Y = 3.5; // world center Y of the opening
const LOOKOUT_Z = 0.15; // above the diamond
/** Office-local window center Y (floor → sill/mid of opening). */
const OFFICE_WIN_Y = 1.55;
const RAFTER_WOOD = 0x2a1e16;
const RAFTER_DARK = 0x1a120e;

// Walk bounds (inset from walls so the camera never clips furniture hard).
// xMax stops short of the bartender aisle + back bar.
// Manager office is button-teleport only (see userData.office).
export const WALK = {
  xMin: -halfW + 0.55,
  xMax: halfW - 2.9,
  zMin: -halfD + 0.55,
  zMax: halfD - 0.55,
  eyeY: 1.55,
};

/** Calendar page texture for the office wall. */
function calendarTex() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 288;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#f4f0e8";
  ctx.fillRect(0, 0, 256, 288);
  ctx.fillStyle = "#c41e3a";
  ctx.fillRect(0, 0, 256, 48);
  ctx.fillStyle = "#fff";
  ctx.font = `800 28px ${FUN_FONT}`;
  ctx.textAlign = "center";
  ctx.fillText("JULY 2026", 128, 34);
  ctx.fillStyle = "#1a1020";
  ctx.font = `700 14px ${FUN_FONT}`;
  const days = ["S", "M", "T", "W", "T", "F", "S"];
  for (let i = 0; i < 7; i++) ctx.fillText(days[i], 28 + i * 32, 72);
  ctx.font = `600 13px ${FUN_FONT}`;
  let d = 1;
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 7; col++) {
      if (row === 0 && col < 3) continue;
      if (d > 31) break;
      const x = 28 + col * 32;
      const y = 100 + row * 32;
      if (d === 27) {
        ctx.fillStyle = "#ff4fa8";
        ctx.beginPath();
        ctx.arc(x, y - 4, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
      } else ctx.fillStyle = "#2a2018";
      ctx.fillText(String(d), x, y);
      d++;
    }
  }
  return canvasTexture(c, 2);
}

/**
 * Low-poly bartender — black club kit, white apron, swappable props.
 * Built ~1.8m tall so head/shoulders clear the bar top (~1.18).
 * Local +Z = face direction.
 * Props on right hand: shaker | rag | bottle (visibility toggled by state).
 */
function buildBartender() {
  const g = new THREE.Group();
  g.name = "bartender";

  // Legs (~hip height 0.68)
  const legs = box(0.26, 0.62, 0.18, 0x1a1a22, { roughness: 0.75 });
  legs.position.y = 0.34;
  g.add(legs);
  for (const s of [-1, 1]) {
    const shoe = box(0.11, 0.07, 0.18, 0x0a0a0c, { roughness: 0.6 });
    shoe.position.set(s * 0.08, 0.04, 0.02);
    g.add(shoe);
  }

  const torso = new THREE.Group();
  torso.name = "torso";
  torso.position.y = 0.68;
  g.add(torso);

  const body = cyl(0.15, 0.18, 0.62, 0x12141a, { roughness: 0.7 }, 8);
  body.position.y = 0.34;
  torso.add(body);
  const apron = box(0.3, 0.42, 0.07, 0xf2eee6, { roughness: 0.85 });
  apron.position.set(0, 0.22, 0.13);
  torso.add(apron);
  const strap = box(0.045, 0.32, 0.02, 0xe8e4dc, { roughness: 0.8 });
  strap.position.set(0, 0.48, 0.09);
  torso.add(strap);

  // Left arm (group for wipe / reach anims)
  const armL = new THREE.Group();
  armL.name = "armL";
  armL.position.set(0.18, 0.48, 0.02);
  torso.add(armL);
  const armLMesh = box(0.09, 0.4, 0.09, 0x12141a, { roughness: 0.7 });
  armLMesh.position.y = -0.16;
  armL.add(armLMesh);

  // Right arm + prop socket
  const armR = new THREE.Group();
  armR.name = "armR";
  armR.position.set(-0.18, 0.48, 0.02);
  torso.add(armR);
  const armRMesh = box(0.09, 0.4, 0.09, 0x12141a, { roughness: 0.7 });
  armRMesh.position.y = -0.16;
  armR.add(armRMesh);

  const propRoot = new THREE.Group();
  propRoot.name = "propRoot";
  propRoot.position.set(0, -0.38, 0.06);
  armR.add(propRoot);

  // Cocktail shaker
  const shaker = new THREE.Group();
  shaker.name = "propShaker";
  const shBody = cyl(0.042, 0.048, 0.16, 0xc8ccd0, { metalness: 0.55, roughness: 0.3 }, 8);
  shaker.add(shBody);
  const shakerCap = cyl(0.038, 0.038, 0.045, 0xa8acb0, { metalness: 0.5, roughness: 0.35 }, 6);
  shakerCap.position.y = 0.1;
  shaker.add(shakerCap);
  propRoot.add(shaker);

  // Cleaning rag
  const rag = new THREE.Group();
  rag.name = "propRag";
  const ragMesh = box(0.14, 0.04, 0.12, 0xf0e8d0, { roughness: 0.9 });
  rag.add(ragMesh);
  const ragTip = box(0.1, 0.02, 0.08, 0xe0d8c8, { roughness: 0.92 });
  ragTip.position.set(0.02, -0.02, 0.04);
  rag.add(ragTip);
  rag.visible = false;
  propRoot.add(rag);

  // Restock bottle
  const bottle = new THREE.Group();
  bottle.name = "propBottle";
  const bBody = cyl(0.04, 0.045, 0.18, 0xc41e3a, { roughness: 0.35, metalness: 0.15 }, 8);
  bBody.position.y = 0.02;
  bottle.add(bBody);
  const bNeck = cyl(0.018, 0.028, 0.08, 0xc41e3a, { roughness: 0.35 }, 6);
  bNeck.position.y = 0.14;
  bottle.add(bNeck);
  const bCap = cyl(0.022, 0.022, 0.03, 0xc8a040, { metalness: 0.4, roughness: 0.4 }, 6);
  bCap.position.y = 0.19;
  bottle.add(bCap);
  bottle.visible = false;
  propRoot.add(bottle);

  // Glass being poured (serve)
  const glass = new THREE.Group();
  glass.name = "propGlass";
  const glassBody = cyl(0.035, 0.04, 0.1, 0xc0d8e8, {
    transparent: true,
    opacity: 0.45,
    roughness: 0.15,
    metalness: 0.1,
  }, 8);
  glass.add(glassBody);
  const liquid = cyl(0.03, 0.032, 0.05, 0xff6a3a, {
    emissive: 0xc04020,
    emissiveIntensity: 0.25,
    roughness: 0.4,
  }, 8);
  liquid.position.y = -0.01;
  glass.add(liquid);
  glass.visible = false;
  propRoot.add(glass);

  // Head
  const head = cyl(0.13, 0.13, 0.22, 0xe8c4a8, { roughness: 0.65 }, 8);
  head.position.y = 0.82;
  torso.add(head);
  const hair = cyl(0.135, 0.13, 0.09, 0x1a1210, { roughness: 0.8 }, 8);
  hair.position.y = 0.94;
  torso.add(hair);
  const face = box(0.09, 0.025, 0.012, 0xc09080, { roughness: 0.7 });
  face.position.set(0, 0.78, 0.13);
  torso.add(face);

  g.userData.torso = torso;
  g.userData.armR = armR;
  g.userData.armL = armL;
  g.userData.props = { shaker, rag, bottle, glass };
  g.userData.setProp = (name) => {
    for (const [k, p] of Object.entries(g.userData.props)) {
      p.visible = k === name;
    }
  };
  g.userData.setProp("shaker");
  return g;
}

/** Simple seated bar patron (stool-height figure). Local +Z = face. */
function buildBarPatron(shirt = 0x4a6a9a) {
  const g = new THREE.Group();
  g.name = "barPatron";
  // Seated legs (folded)
  const legs = box(0.28, 0.22, 0.35, 0x2a2a35, { roughness: 0.75 });
  legs.position.set(0, 0.55, 0.05);
  g.add(legs);
  const torso = new THREE.Group();
  torso.position.y = 0.72;
  g.add(torso);
  const body = cyl(0.14, 0.16, 0.42, shirt, { roughness: 0.7 }, 8);
  body.position.y = 0.22;
  torso.add(body);
  const head = cyl(0.12, 0.12, 0.2, 0xe8c4a8, { roughness: 0.65 }, 8);
  head.position.y = 0.55;
  torso.add(head);
  const hair = cyl(0.125, 0.12, 0.07, 0x3a2818, { roughness: 0.8 }, 8);
  hair.position.y = 0.65;
  torso.add(hair);
  // Arms on bar
  for (const s of [-1, 1]) {
    const arm = box(0.08, 0.1, 0.28, shirt, { roughness: 0.7 });
    arm.position.set(s * 0.14, 0.15, 0.18);
    torso.add(arm);
  }
  // Drink on the bar in front of them (world prop parented loosely)
  const drink = cyl(0.035, 0.04, 0.12, 0x80c0e8, {
    transparent: true,
    opacity: 0.5,
    roughness: 0.2,
  }, 8);
  drink.position.set(0.12, 0.95, 0.35);
  g.add(drink);
  const drinkLiq = cyl(0.028, 0.03, 0.06, 0x40e0ff, {
    emissive: 0x2080c0,
    emissiveIntensity: 0.3,
  }, 6);
  drinkLiq.position.set(0.12, 0.93, 0.35);
  g.add(drinkLiq);

  g.userData.torso = torso;
  return g;
}

/**
 * Owner / manager office — sits BEHIND the south wall (outside the vaulted
 * room) so the club ceiling stays open. Enter via UI button, not a stair.
 * Local origin: floor center; +Z length; window faces −X into the club.
 */
function buildManagerOffice(lit) {
  const g = new THREE.Group();
  g.name = "managerOffice";
  const W = 3.2;
  const D = 2.6;
  const H = 2.55;

  // Room shell
  const floor = box(W, 0.08, D, 0x3a3228, { roughness: 0.88 });
  floor.position.y = 0.04;
  g.add(floor);
  const ceil = box(W, 0.06, D, 0x1a1814, { roughness: 0.9 });
  ceil.position.y = H;
  g.add(ceil);
  // Walls: +X back, ±Z sides. −X is mostly open to the club window.
  const back = box(0.1, H, D, 0x2a241c, { roughness: 0.82 });
  back.position.set(W * 0.5 - 0.05, H * 0.5, 0);
  g.add(back);
  for (const side of [-1, 1]) {
    const wall = box(W, H, 0.1, 0x2e261e, { roughness: 0.82 });
    wall.position.set(0, H * 0.5, side * (D * 0.5 - 0.05));
    g.add(wall);
  }
  // Front wall with window opening (−X toward club) — same size as club hole
  const winW = LOOKOUT_W;
  const winH = LOOKOUT_H;
  const winY = OFFICE_WIN_Y;
  const fw = 0.1;
  const sideSpan = (D - winW) * 0.5;
  const frontL = box(fw, H, sideSpan, 0x2a241c, { roughness: 0.82 });
  frontL.position.set(-W * 0.5 + fw * 0.5, H * 0.5, -winW * 0.5 - sideSpan * 0.5);
  g.add(frontL);
  const frontR = box(fw, H, sideSpan, 0x2a241c, { roughness: 0.82 });
  frontR.position.set(-W * 0.5 + fw * 0.5, H * 0.5, winW * 0.5 + sideSpan * 0.5);
  g.add(frontR);
  const botH = winY - winH * 0.5;
  const frontBot = box(fw, botH, winW, 0x2a241c, { roughness: 0.82 });
  frontBot.position.set(-W * 0.5 + fw * 0.5, botH * 0.5, 0);
  g.add(frontBot);
  const topH = H - (winY + winH * 0.5);
  const frontTop = box(fw, topH, winW, 0x2a241c, { roughness: 0.82 });
  frontTop.position.set(-W * 0.5 + fw * 0.5, winY + winH * 0.5 + topH * 0.5, 0);
  g.add(frontTop);

  // Open aperture only — black/dark-purple lip, no center mullions
  const frameCol = 0x1a1020;
  const fr = 0.05;
  const fx = -W * 0.5 + 0.03;
  for (const sz of [-1, 1]) {
    const rail = box(fr, winH + fr * 2, fr, frameCol, { roughness: 0.78 });
    rail.position.set(fx, winY, sz * (winW * 0.5));
    g.add(rail);
  }
  for (const sy of [-1, 1]) {
    const rail = box(fr, fr, winW + fr * 2, frameCol, { roughness: 0.78 });
    rail.position.set(fx, winY + sy * (winH * 0.5), 0);
    g.add(rail);
  }
  // Deep sill to lean on while looking out
  const sill = box(0.28, 0.06, winW + 0.08, 0x140e18, { roughness: 0.8 });
  sill.position.set(-W * 0.5 + 0.16, winY - winH * 0.5 - 0.03, 0);
  g.add(sill);
  // Curtain tie-backs on sides
  for (const sz of [-1, 1]) {
    const drape = box(0.08, winH * 0.85, 0.12, 0x2a1438, { roughness: 0.85 });
    drape.position.set(fx + 0.02, winY - 0.05, sz * (winW * 0.5 + 0.1));
    g.add(drape);
  }

  // Desk against the back wall
  const desk = box(0.7, 0.08, 1.6, 0x3a2a1e, { roughness: 0.55 });
  desk.position.set(0.55, 0.78, 0);
  g.add(desk);
  for (const dz of [-0.7, 0.7]) {
    const leg = box(0.08, 0.74, 0.08, 0x2a1e16, { roughness: 0.7 });
    leg.position.set(0.55, 0.37, dz);
    g.add(leg);
  }
  // Laptop on desk (screen faces into room / −X a bit)
  const lapBase = box(0.32, 0.015, 0.22, 0x1a1a22, { metalness: 0.5, roughness: 0.3 });
  lapBase.position.set(0.4, 0.84, -0.25);
  g.add(lapBase);
  const lapScr = box(0.3, 0.2, 0.012, 0x0a2848, {
    emissive: 0x2080c0,
    emissiveIntensity: 0.7,
    roughness: 0.25,
  });
  lapScr.position.set(0.4, 0.96, -0.35);
  lapScr.rotation.x = -0.35;
  lit(lapScr, 0.95, 0.55);
  g.add(lapScr);
  const lapUi = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.16),
    new THREE.MeshStandardMaterial({
      map: labelTex("EMAILS", {
        w: 200,
        h: 120,
        bg: "#0a2848",
        fg: "#80e8ff",
        size: 28,
        weight: 800,
        font: "fun",
      }),
      emissive: 0x186080,
      emissiveIntensity: 0.45,
      roughness: 0.4,
      flatShading: true,
    })
  );
  lapUi.position.set(0.4, 0.96, -0.36);
  lapUi.rotation.x = -0.35;
  g.add(lapUi);

  // Money counter
  const counter = box(0.28, 0.12, 0.35, 0x2a2a32, { metalness: 0.4, roughness: 0.4 });
  counter.position.set(0.45, 0.9, 0.35);
  g.add(counter);
  const counterScr = box(0.2, 0.06, 0.02, 0x0a2010, {
    emissive: 0x20a040,
    emissiveIntensity: 0.7,
  });
  counterScr.position.set(0.45, 0.98, 0.5);
  lit(counterScr, 0.85, 0.5);
  g.add(counterScr);
  const counterTxt = new THREE.Mesh(
    new THREE.PlaneGeometry(0.18, 0.05),
    new THREE.MeshStandardMaterial({
      map: labelTex("$2,480", {
        w: 160,
        h: 48,
        bg: "#0a2010",
        fg: "#3dd68c",
        size: 26,
        weight: 800,
        font: "fun",
      }),
      emissive: 0x20a040,
      emissiveIntensity: 0.5,
      roughness: 0.4,
      flatShading: true,
    })
  );
  counterTxt.position.set(0.45, 0.98, 0.52);
  g.add(counterTxt);
  // Feed slot
  const feed = box(0.18, 0.02, 0.08, 0x1a1a22);
  feed.position.set(0.45, 0.86, 0.52);
  g.add(feed);

  // Safe (open) with cash bundles
  const safe = box(0.55, 0.7, 0.45, 0x3a3e46, { metalness: 0.45, roughness: 0.4 });
  safe.position.set(0.7, 0.4, -0.85);
  g.add(safe);
  const safeDoor = box(0.08, 0.65, 0.4, 0x2a2e38, { metalness: 0.5, roughness: 0.35 });
  safeDoor.position.set(0.35, 0.4, -0.85);
  safeDoor.rotation.y = 0.9;
  g.add(safeDoor);
  const dial = cyl(0.06, 0.06, 0.04, 0xc8a040, { metalness: 0.6, roughness: 0.3 }, 10);
  dial.rotation.z = Math.PI / 2;
  dial.position.set(0.32, 0.45, -0.85);
  g.add(dial);
  // Cash bundles
  for (let i = 0; i < 6; i++) {
    const bundle = box(0.14, 0.04, 0.07, 0x2a6a3a, { roughness: 0.7 });
    bundle.position.set(
      0.65 + (i % 2) * 0.12,
      0.2 + Math.floor(i / 2) * 0.08,
      -0.75 + (i % 3) * 0.02
    );
    g.add(bundle);
    const band = box(0.15, 0.015, 0.03, 0xc8a040, { roughness: 0.5 });
    band.position.copy(bundle.position);
    band.position.y += 0.005;
    g.add(band);
  }

  // Paperwork stacks
  for (const [dz, h] of [
    [0.55, 0.06],
    [0.7, 0.1],
    [-0.05, 0.04],
  ]) {
    const papers = box(0.2, h, 0.16, 0xf0e8d8, { roughness: 0.9 });
    papers.position.set(0.25, 0.82 + h * 0.5, dz);
    g.add(papers);
  }
  // Loose invoice
  const invoice = box(0.18, 0.005, 0.24, 0xfff8f0, { roughness: 0.92, castShadow: false });
  invoice.position.set(0.35, 0.83, 0.1);
  invoice.rotation.y = 0.2;
  g.add(invoice);
  const invTxt = new THREE.Mesh(
    new THREE.PlaneGeometry(0.16, 0.06),
    new THREE.MeshStandardMaterial({
      map: labelTex("PAYROLL", {
        w: 160,
        h: 48,
        bg: "#fff8f0",
        fg: "#401028",
        size: 22,
        weight: 800,
        font: "fun",
      }),
      roughness: 0.95,
      flatShading: true,
    })
  );
  invTxt.position.set(0.35, 0.835, 0.1);
  invTxt.rotation.x = -Math.PI / 2;
  invTxt.rotation.z = 0.2;
  g.add(invTxt);

  // Calendar on side wall
  const cal = new THREE.Mesh(
    new THREE.PlaneGeometry(0.45, 0.5),
    new THREE.MeshStandardMaterial({
      map: calendarTex(),
      roughness: 0.75,
      flatShading: true,
    })
  );
  cal.position.set(0.2, 1.7, -D * 0.5 + 0.06);
  g.add(cal);

  // Office chair
  const seat = cyl(0.18, 0.18, 0.06, 0x1a1a22, { roughness: 0.6 }, 10);
  seat.position.set(-0.15, 0.55, 0.15);
  g.add(seat);
  const backrest = box(0.08, 0.4, 0.32, 0x1a1a22, { roughness: 0.6 });
  backrest.position.set(-0.28, 0.8, 0.15);
  g.add(backrest);
  const chairPost = cyl(0.04, 0.05, 0.5, METAL, { metalness: 0.5, roughness: 0.4 }, 6);
  chairPost.position.set(-0.15, 0.28, 0.15);
  g.add(chairPost);

  // Filing cabinet
  const file = box(0.45, 1.1, 0.5, 0x4a5060, { metalness: 0.25, roughness: 0.5 });
  file.position.set(0.9, 0.55, 0.9);
  g.add(file);
  for (let i = 0; i < 3; i++) {
    const handle = box(0.12, 0.03, 0.04, 0xc8a040, { metalness: 0.5, roughness: 0.35 });
    handle.position.set(0.68, 0.3 + i * 0.3, 0.9);
    g.add(handle);
  }

  // Warm office light
  const lamp = new THREE.PointLight(0xffe0b0, 0.9, 5, 2);
  lamp.position.set(0, 2.1, 0);
  g.add(lamp);
  const lamp2 = new THREE.PointLight(0x80c0ff, 0.25, 4, 2);
  lamp2.position.set(-0.8, 1.5, 0);
  g.add(lamp2);
  // Desk lamp
  const deskLamp = box(0.06, 0.25, 0.06, 0x2a2a32, { metalness: 0.4, roughness: 0.4 });
  deskLamp.position.set(0.7, 0.95, -0.4);
  g.add(deskLamp);
  const bulb = cyl(0.05, 0.06, 0.04, 0xffe8a0, {
    emissive: 0xffd060,
    emissiveIntensity: 0.8,
  }, 8);
  bulb.position.set(0.7, 1.1, -0.4);
  lit(bulb, 0.9, 0.5);
  g.add(bulb);

  // "MANAGER" door plate vibe
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.12),
    new THREE.MeshStandardMaterial({
      map: labelTex("MANAGER", {
        w: 240,
        h: 64,
        bg: "#1a1020",
        fg: "#ff80c0",
        size: 28,
        weight: 800,
        font: "fun",
      }),
      emissive: 0xff4fa8,
      emissiveIntensity: 0.35,
      roughness: 0.45,
      flatShading: true,
    })
  );
  plate.position.set(-W * 0.5 + 0.12, 2.2, 0.7);
  plate.rotation.y = Math.PI / 2;
  g.add(plate);

  g.userData.bounds = {
    xMin: -W * 0.5 + 0.35,
    xMax: W * 0.5 - 0.35,
    zMin: -D * 0.5 + 0.35,
    zMax: D * 0.5 - 0.35,
    eyeY: 1.55,
    floorY: 0,
  };
  g.userData.size = { w: W, d: D, h: H };
  return g;
}

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
  // kind: "brick" | "wood" | "purple" | "purpleDark"
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
  } else if (kind === "purpleDark") {
    // Deep club purple for the full back-bar wall
    color = 0x2a1840;
    matOpts.roughness = 0.82;
    matOpts.emissive = new THREE.Color(0x1a0c28);
    matOpts.emissiveIntensity = 0.12;
  }
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, ...matOpts })
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Canvas label texture. Default = fun thick Outfit (readable club UI).
 * Pass `font: "logo"` for Stacy's brand face; or a custom CSS font stack.
 * `text` may include `\n` for multi-line.
 */
function labelTex(text, {
  w = 256,
  h = 96,
  bg = "#1a1020",
  fg = "#ff6ec7",
  size = 42,
  weight = 800,
  font = "fun",
  tracking = 0.02,
} = {}) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = fg;
  const family =
    font === "logo"
      ? STACYS_DISPLAY
      : font === "ui"
        ? STACYS_UI
        : font === "fun"
          ? FUN_FONT
          : font;
  ctx.font = `${weight} ${size}px ${family}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (tracking) ctx.letterSpacing = `${Math.round(size * tracking)}px`;
  const lines = String(text).split("\n");
  const lineH = size * 1.15;
  const startY = h / 2 - ((lines.length - 1) * lineH) / 2;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], w / 2, startY + i * lineH);
  }
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

/** Soft milky frost for the north lot glass door (opaque, transmits sky glow). */
function frostedGlassTex() {
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d");
  // Cool milky base
  const g = ctx.createLinearGradient(0, 0, S * 0.3, S);
  g.addColorStop(0, "#e8f0f6");
  g.addColorStop(0.45, "#c8d8e6");
  g.addColorStop(1, "#a8c0d4");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  // Soft grain / etch (reads as frosted privacy glass)
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    const a = 0.04 + Math.random() * 0.1;
    const r = 0.6 + Math.random() * 2.4;
    ctx.fillStyle =
      Math.random() > 0.5
        ? `rgba(255,255,255,${a})`
        : `rgba(140,170,200,${a * 0.8})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Faint horizontal privacy bands
  for (let y = 0; y < S; y += 7) {
    ctx.fillStyle = `rgba(255,255,255,${0.03 + (y % 21 === 0 ? 0.05 : 0)})`;
    ctx.fillRect(0, y, S, 2);
  }
  // Soft vertical highlight edge
  const edge = ctx.createLinearGradient(0, 0, S, 0);
  edge.addColorStop(0, "rgba(255,255,255,0.18)");
  edge.addColorStop(0.15, "rgba(255,255,255,0)");
  edge.addColorStop(0.85, "rgba(255,255,255,0)");
  edge.addColorStop(1, "rgba(200,220,240,0.12)");
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, S, S);
  return canvasTexture(c, 4);
}

function foliageTex() {
  const S = 512;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d");
  // Fun jungle green base (no muddy black)
  const bg = ctx.createLinearGradient(0, 0, S, S);
  bg.addColorStop(0, "#145028");
  bg.addColorStop(0.45, "#1a6830");
  bg.addColorStop(1, "#0e4820");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, S, S);
  let rs = 42;
  const rnd = () => ((rs = (rs * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  // Cartoony chunky leaves — big teardrop / oval shapes only (no flowers)
  const greens = [
    "#2ecc71", "#27ae60", "#3dd68c", "#1e8a40", "#48c774",
    "#20b060", "#6ae08a", "#189848", "#50d070", "#0f7030",
  ];
  for (let i = 0; i < 90; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const r = 18 + rnd() * 36;
    const rot = rnd() * Math.PI;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillStyle = greens[i % greens.length];
    // Fat teardrop leaf
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.45, r, 0, 0, Math.PI * 2);
    ctx.fill();
    // Light midrib highlight
    ctx.strokeStyle = "rgba(200,255,180,0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.85);
    ctx.lineTo(0, r * 0.85);
    ctx.stroke();
    ctx.restore();
  }
  // Playful vine squiggles
  ctx.strokeStyle = "rgba(40,140,60,0.65)";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  for (let i = 0; i < 12; i++) {
    ctx.beginPath();
    let x = rnd() * S;
    let y = rnd() * S * 0.2;
    ctx.moveTo(x, y);
    for (let k = 0; k < 10; k++) {
      x += (rnd() - 0.5) * 50;
      y += S / 11;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // Lime speckles for cartoony pop
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = "rgba(180,255,120,0.35)";
    ctx.beginPath();
    ctx.arc(rnd() * S, rnd() * S, 2 + rnd() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvasTexture(c, 2);
}

/** Layered cartoony foliage panel for the activation wall (leaves only — no flowers). */
function buildFoliageWall(w = 2.4, h = 2.4) {
  const g = new THREE.Group();
  const back = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({
      map: foliageTex(),
      roughness: 0.88,
      flatShading: true,
    })
  );
  g.add(back);
  // Big proud low-poly leaves for depth (chunky, fun, no flowers)
  const leafCols = [0x2ecc71, 0x27ae60, 0x3dd68c, 0x1e8a40, 0x48c774, 0x6ae08a, 0x20b060];
  let rs = 99;
  const rnd = () => ((rs = (rs * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 56; i++) {
    const lx = (rnd() - 0.5) * w * 0.92;
    const ly = (rnd() - 0.5) * h * 0.92;
    const s = 0.16 + rnd() * 0.28;
    // Fat diamond / kite leaf (reads as cartoony foliage, not a brick)
    const leaf = box(s * 0.55, s, 0.07 + rnd() * 0.06, leafCols[i % leafCols.length], {
      roughness: 0.85,
      castShadow: false,
      emissive: leafCols[i % leafCols.length],
      emissiveIntensity: 0.06,
    });
    leaf.position.set(lx, ly, 0.05 + rnd() * 0.1);
    leaf.rotation.z = (rnd() - 0.5) * 1.2;
    leaf.rotation.x = (rnd() - 0.5) * 0.5;
    leaf.rotation.y = (rnd() - 0.5) * 0.35;
    g.add(leaf);
  }
  // A few oversized "hero" leaves for silhouette pop
  for (let i = 0; i < 8; i++) {
    const s = 0.38 + rnd() * 0.18;
    const hero = box(s * 0.4, s, 0.1, leafCols[(i + 3) % leafCols.length], {
      roughness: 0.82,
      castShadow: false,
      emissive: 0x1a6030,
      emissiveIntensity: 0.08,
    });
    hero.position.set(
      (rnd() - 0.5) * w * 0.7,
      (rnd() - 0.5) * h * 0.7,
      0.12 + rnd() * 0.06
    );
    hero.rotation.z = (rnd() - 0.5) * 0.9;
    g.add(hero);
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
 * Stage curtain pair: metal rod + two black drape panels with vertical folds.
 * Local +X along the rod; curtains hang down −Y from y=0.
 */
function buildStageCurtains(rodLen, curtainH = 2.7, {
  openGap = 0.28,
  folds = 7,
} = {}) {
  const g = new THREE.Group();
  g.name = "stageCurtains";
  // Rod + finials
  const rod = cyl(0.035, 0.035, rodLen + 0.2, 0x3a3a42, {
    metalness: 0.55,
    roughness: 0.35,
  }, 8);
  rod.rotation.z = Math.PI / 2;
  rod.position.set(rodLen * 0.5, 0.02, 0);
  g.add(rod);
  for (const x of [-0.02, rodLen + 0.02]) {
    const fin = cyl(0.06, 0.05, 0.08, 0x2a2a30, { metalness: 0.5, roughness: 0.4 }, 8);
    fin.rotation.z = Math.PI / 2;
    fin.position.set(x, 0.02, 0);
    g.add(fin);
  }
  // Mount brackets
  for (const x of [0.15, rodLen * 0.5, rodLen - 0.15]) {
    const br = box(0.08, 0.12, 0.1, 0x2a2a30, { metalness: 0.4, roughness: 0.45 });
    br.position.set(x, 0.1, 0);
    g.add(br);
  }

  const panelW = (rodLen - openGap) * 0.5;
  const foldW = panelW / folds;
  const black = 0x0a0a0c;
  const blackLite = 0x141418;

  for (const side of [-1, 1]) {
    // side -1 = left panel (starts at 0), +1 = right panel
    const baseX = side < 0 ? 0 : panelW + openGap;
    for (let i = 0; i < folds; i++) {
      const deep = i % 2 === 0;
      const strip = box(
        foldW * (deep ? 0.92 : 0.88),
        curtainH,
        deep ? 0.1 : 0.06,
        deep ? black : blackLite,
        { roughness: 0.92, metalness: 0.02 }
      );
      // Slight outward swell for drape volume
      const zOff = deep ? 0.06 : 0.02;
      strip.position.set(
        baseX + (i + 0.5) * foldW,
        -curtainH * 0.5 - 0.04,
        zOff
      );
      g.add(strip);
    }
    // Soft puddle / hem at bottom
    const hem = box(panelW * 0.95, 0.08, 0.14, black, { roughness: 0.95 });
    hem.position.set(baseX + panelW * 0.5, -curtainH - 0.02, 0.05);
    g.add(hem);
    // Tie-back hint mid-height
    const tie = box(0.06, 0.08, 0.12, 0x1a1a1e, { roughness: 0.85 });
    tie.position.set(
      baseX + panelW * (side < 0 ? 0.75 : 0.25),
      -curtainH * 0.45,
      0.12
    );
    g.add(tie);
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

/**
 * Gothic wrought-iron chandelier — chain, crown ring, candle arms.
 * Local origin = ceiling mount; hangs down −Y. Orange/red candle glow with soft flicker.
 */
function buildGothicChandelier(lit, nightLights, flashLights) {
  const g = new THREE.Group();
  g.name = "gothicChandelier";

  const iron = 0x1c1614;
  const ironHi = 0x2e2622;
  const bronze = 0x6a4830;
  const amber = 0xff6a28;
  const ember = 0xff3020;

  // Ceiling rose / mount plate
  const rose = cyl(0.14, 0.16, 0.05, ironHi, { metalness: 0.55, roughness: 0.4 }, 10);
  rose.position.y = 0;
  g.add(rose);
  const roseRing = cyl(0.18, 0.18, 0.03, iron, { metalness: 0.5, roughness: 0.45 }, 12);
  roseRing.position.y = -0.03;
  g.add(roseRing);

  // Drop chain (linked rings)
  const chainLen = 0.95;
  const linkN = 7;
  for (let i = 0; i < linkN; i++) {
    const link = cyl(0.045, 0.045, 0.04, ironHi, { metalness: 0.6, roughness: 0.35 }, 8);
    link.scale.set(1, 1, 0.55);
    link.rotation.x = (i % 2) * (Math.PI / 2);
    link.position.y = -0.08 - (i + 0.5) * (chainLen / linkN);
    g.add(link);
  }
  // Center rod through chain for silhouette
  const rod = cyl(0.012, 0.012, chainLen + 0.15, iron, { metalness: 0.55, roughness: 0.4 }, 6);
  rod.position.y = -chainLen * 0.5 - 0.05;
  g.add(rod);

  // Body hangs at end of chain — halfway down the room
  const bodyY = -chainLen - 0.12;

  // Gothic crown / finial on top of body
  const finial = box(0.08, 0.16, 0.08, bronze, { metalness: 0.55, roughness: 0.35 });
  finial.position.set(0, bodyY + 0.22, 0);
  finial.rotation.y = Math.PI / 4;
  g.add(finial);
  const tip = cyl(0.02, 0.04, 0.1, bronze, { metalness: 0.6, roughness: 0.3 }, 6);
  tip.position.set(0, bodyY + 0.34, 0);
  g.add(tip);

  // Central hub
  const hub = cyl(0.11, 0.14, 0.18, ironHi, { metalness: 0.5, roughness: 0.38 }, 10);
  hub.position.y = bodyY;
  g.add(hub);
  const hubBand = cyl(0.15, 0.15, 0.04, bronze, { metalness: 0.55, roughness: 0.32 }, 10);
  hubBand.position.y = bodyY;
  g.add(hubBand);

  // Lower gothic drop / pointed boss
  const boss = cyl(0.06, 0.02, 0.22, iron, { metalness: 0.5, roughness: 0.4 }, 8);
  boss.position.y = bodyY - 0.2;
  g.add(boss);
  const bossTip = box(0.05, 0.08, 0.05, bronze, { metalness: 0.55, roughness: 0.35 });
  bossTip.position.set(0, bodyY - 0.34, 0);
  bossTip.rotation.y = Math.PI / 4;
  g.add(bossTip);

  // Six gothic arms + candles
  const arms = 6;
  const glowMats = [];
  for (let i = 0; i < arms; i++) {
    const a = (i / arms) * Math.PI * 2;
    const arm = new THREE.Group();

    // Curved arm from hub to candle (two segments)
    const arm1 = box(0.04, 0.05, 0.22, iron, { metalness: 0.5, roughness: 0.4 });
    arm1.position.set(0, 0.02, 0.14);
    arm1.rotation.x = -0.55;
    arm.add(arm1);
    const arm2 = box(0.035, 0.04, 0.2, ironHi, { metalness: 0.5, roughness: 0.38 });
    arm2.position.set(0, -0.06, 0.3);
    arm2.rotation.x = 0.35;
    arm.add(arm2);

    // Scroll / leaf flourish at elbow
    const scroll = box(0.06, 0.08, 0.04, bronze, { metalness: 0.45, roughness: 0.4 });
    scroll.position.set(0, 0.0, 0.22);
    scroll.rotation.x = -0.4;
    arm.add(scroll);

    // Candle cup
    const cup = cyl(0.055, 0.04, 0.07, bronze, { metalness: 0.5, roughness: 0.35 }, 8);
    cup.position.set(0, -0.02, 0.42);
    arm.add(cup);
    // Drip pan
    const pan = cyl(0.07, 0.07, 0.02, ironHi, { metalness: 0.45, roughness: 0.4 }, 8);
    pan.position.set(0, -0.06, 0.42);
    arm.add(pan);

    // Candle
    const candle = cyl(0.028, 0.03, 0.14, 0xf0e8d0, { roughness: 0.75 }, 8);
    candle.position.set(0, 0.08, 0.42);
    arm.add(candle);

    // Flame (soft orange/red emissive)
    const flameCol = i % 2 === 0 ? amber : ember;
    const flame = cyl(0.018, 0.006, 0.08, flameCol, {
      emissive: flameCol,
      emissiveIntensity: 1.1,
      roughness: 0.35,
      metalness: 0.05,
    }, 6);
    flame.position.set(0, 0.18, 0.42);
    lit(flame, 1.35, 0.85, { glimmer: true, glimmerSpeed: 2.2 + i * 0.15, phase: i * 1.3 });
    arm.add(flame);
    glowMats.push(flame.material);

    // Tiny flame tip
    const tipF = cyl(0.01, 0.003, 0.04, 0xffe080, {
      emissive: 0xffc040,
      emissiveIntensity: 1.2,
      roughness: 0.3,
    }, 5);
    tipF.position.set(0, 0.24, 0.42);
    lit(tipF, 1.2, 0.75, { glimmer: true, glimmerSpeed: 3.1 + i * 0.2, phase: i * 0.7 });
    arm.add(tipF);
    glowMats.push(tipF.material);

    // Crystal drop under cup
    const drop = box(0.03, 0.1, 0.03, 0xc8a060, {
      metalness: 0.35,
      roughness: 0.25,
      emissive: 0x402010,
      emissiveIntensity: 0.25,
      transparent: true,
      opacity: 0.85,
    });
    drop.position.set(0, -0.14, 0.42);
    drop.rotation.y = Math.PI / 4;
    arm.add(drop);

    arm.rotation.y = a;
    arm.position.y = bodyY;
    g.add(arm);
  }

  // Inner ring of smaller candles for density
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    const ix = Math.cos(a) * 0.22;
    const iz = Math.sin(a) * 0.22;
    const cup = cyl(0.04, 0.032, 0.05, bronze, { metalness: 0.5, roughness: 0.35 }, 7);
    cup.position.set(ix, bodyY + 0.08, iz);
    g.add(cup);
    const candle = cyl(0.022, 0.024, 0.1, 0xf0e8d0, { roughness: 0.75 }, 6);
    candle.position.set(ix, bodyY + 0.16, iz);
    g.add(candle);
    const flame = cyl(0.014, 0.005, 0.06, amber, {
      emissive: amber,
      emissiveIntensity: 1.0,
      roughness: 0.35,
    }, 5);
    flame.position.set(ix, bodyY + 0.24, iz);
    lit(flame, 1.2, 0.75, { glimmer: true, glimmerSpeed: 2.6 + i * 0.3, phase: i * 2.1 });
    g.add(flame);
    glowMats.push(flame.material);
  }

  // Warm fill lights — soft orange/red, gently flicker via flashLights
  const mainGlow = new THREE.PointLight(0xff5520, 0.95, 5.5, 2);
  mainGlow.position.set(0, bodyY + 0.15, 0);
  g.add(mainGlow);
  nightLights.push({ light: mainGlow, day: 0.55, night: 1.05 });
  if (flashLights) {
    flashLights.push({
      light: mainGlow,
      night: 1.05,
      speed: 2.4,
    });
  }
  const emberGlow = new THREE.PointLight(0xff2030, 0.4, 3.8, 2);
  emberGlow.position.set(0, bodyY - 0.1, 0.15);
  g.add(emberGlow);
  nightLights.push({ light: emberGlow, day: 0.22, night: 0.5 });
  if (flashLights) {
    flashLights.push({
      light: emberGlow,
      night: 0.48,
      speed: 1.7,
    });
  }

  // Soft bloom halo (reads as heat haze)
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(1.35, 1.0),
    new THREE.MeshBasicMaterial({
      color: 0xff4018,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  halo.position.set(0, bodyY + 0.1, 0);
  halo.rotation.x = -0.2;
  g.add(halo);

  g.userData.glowMats = glowMats;
  g.userData.bodyY = bodyY;
  // Total hang length for placement (~ chain + body)
  g.userData.hangLen = chainLen + 0.55;
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
  ctx.font = `800 16px ${FUN_FONT}`;
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
 * Synced party vibe graphics for the east video wall (5 flush screens).
 * `slot` 0..4, `frame` advances over time, center slot gets the logo.
 */
function vibeWallTex(slot = 0, frame = 0, isCenter = false) {
  const c = document.createElement("canvas");
  c.width = 320;
  c.height = 240;
  const ctx = c.getContext("2d");
  const palettes = [
    ["#120820", "#ff2a80", "#40e0ff", "#ffe14a"],
    ["#081828", "#9b6dff", "#3dd68c", "#ff80c0"],
    ["#1a0820", "#ff6a3a", "#60e8ff", "#c080ff"],
    ["#0a1028", "#40e0ff", "#ff4fa8", "#80ffb0"],
  ];
  const pal = palettes[frame % palettes.length];
  // Shared background wash so all 5 feel synced
  const g = ctx.createLinearGradient(0, 0, 320, 240);
  g.addColorStop(0, pal[0]);
  g.addColorStop(0.5, pal[1]);
  g.addColorStop(1, pal[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 320, 240);

  // Diagonal stripe band shared across the bank (offset by slot for pan)
  const pan = (frame * 40 + slot * 28) % 360;
  ctx.save();
  ctx.translate(pan - 40, 0);
  for (let i = -2; i < 8; i++) {
    ctx.fillStyle = i % 2 ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.12)";
    ctx.beginPath();
    ctx.moveTo(i * 50, 0);
    ctx.lineTo(i * 50 + 30, 0);
    ctx.lineTo(i * 50 + 90, 240);
    ctx.lineTo(i * 50 + 60, 240);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // EQ bars (same beat phase for all slots)
  const beat = frame % 6;
  for (let i = 0; i < 10; i++) {
    const h = 24 + ((i + beat + slot) % 5) * 18 + (i % 2) * 12;
    ctx.fillStyle = i % 2 ? pal[2] : pal[3];
    ctx.globalAlpha = 0.65;
    ctx.fillRect(16 + i * 30, 200 - h, 18, h);
  }
  ctx.globalAlpha = 1;

  // Notes / shapes
  ctx.font = `800 42px ${FUN_FONT}`;
  ctx.textAlign = "center";
  ctx.fillStyle = pal[3];
  const glyphs = ["♪", "♫", "♬", "★", "✦"];
  ctx.fillText(glyphs[(slot + frame) % glyphs.length], 50 + (slot % 3) * 20, 70);
  ctx.fillText(glyphs[(slot + frame + 2) % glyphs.length], 260, 90);

  if (isCenter) {
    // Logo plate in the middle TV
    ctx.fillStyle = "rgba(10,8,20,0.55)";
    ctx.beginPath();
    // Diamond
    ctx.moveTo(160, 40);
    ctx.lineTo(230, 110);
    ctx.lineTo(160, 180);
    ctx.lineTo(90, 110);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = pal[1];
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.strokeStyle = pal[2];
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = `800 28px ${FUN_FONT}`;
    ctx.fillText("Stacy's", 160, 105);
    ctx.font = `700 14px ${FUN_FONT}`;
    ctx.fillStyle = pal[3];
    ctx.fillText("@ MELROSE", 160, 128);
  } else {
    // Side panels: bold vibe words, same set rotating in sync
    const words = ["DANCE", "VIBES", "PARTY", "LOVE", "NIGHT", "BASS"];
    const word = words[(frame + slot) % words.length];
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(40, 90, 240, 70);
    ctx.fillStyle = "#fff";
    ctx.font = `800 40px ${FUN_FONT}`;
    ctx.fillText(word, 160, 138);
  }

  // Shared footer ticker
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(0, 210, 320, 30);
  ctx.fillStyle = pal[3];
  ctx.font = `800 14px ${FUN_FONT}`;
  ctx.fillText("STACY'S  ·  LIVE VISUALS  ·  OPEN", 160, 230);

  return canvasTexture(c, 2);
}

/** Music-video / dance-party graphics for the jukebox TV (landscape). */
function musicVideoTex(seed = 0) {
  const c = document.createElement("canvas");
  c.width = 384;
  c.height = 216;
  const ctx = c.getContext("2d");
  const palettes = [
    ["#120820", "#ff2a80", "#40e0ff", "#ffe14a"],
    ["#081828", "#9b6dff", "#3dd68c", "#ff80c0"],
    ["#1a0820", "#ff6a3a", "#60e8ff", "#c080ff"],
    ["#0a1028", "#40e0ff", "#ff4fa8", "#80ffb0"],
  ][seed % 4];
  const g = ctx.createLinearGradient(0, 0, 384, 216);
  g.addColorStop(0, palettes[0]);
  g.addColorStop(0.45, palettes[1]);
  g.addColorStop(1, palettes[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 384, 216);
  // EQ bars
  for (let i = 0; i < 18; i++) {
    const h = 20 + ((i * 17 + seed * 9) % 90);
    ctx.fillStyle = i % 2 ? palettes[2] : palettes[3];
    ctx.globalAlpha = 0.55;
    ctx.fillRect(24 + i * 19, 180 - h, 12, h);
  }
  ctx.globalAlpha = 1;
  // Performer blob
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(192, 150, 55, 60, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(192, 85, 32, 0, Math.PI * 2);
  ctx.fill();
  // Notes
  ctx.fillStyle = palettes[3];
  ctx.font = `800 36px ${FUN_FONT}`;
  ctx.textAlign = "center";
  ctx.fillText("♪  ♫  ♬", 192, 55);
  // Banner
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(0, 0, 384, 32);
  ctx.fillStyle = "#fff";
  ctx.font = `800 18px ${FUN_FONT}`;
  const vids = ["MUSIC VIDEO", "DANCE MIX", "CLUB VISUALS", "NOW SPINNING", "PARTY MODE", "BASS DROP"];
  ctx.fillText(vids[seed % vids.length], 192, 22);
  return canvasTexture(c, 2);
}

/** Vertical bar advertisement (portrait). */
function barAdTex(seed = 0) {
  const c = document.createElement("canvas");
  c.width = 200;
  c.height = 360;
  const ctx = c.getContext("2d");
  const ads = [
    { bg: ["#1a0828", "#ff2a80"], title: "KARAOKE", sub: "MONDAYS", tag: "8PM · NO COVER" },
    { bg: ["#081828", "#40e0ff"], title: "HAPPY\nHOUR", sub: "DAILY 4–7", tag: "$5 WELLS" },
    { bg: ["#201018", "#ff6a3a"], title: "DRAG\nNIGHT", sub: "FRIDAYS", tag: "DOORS 9PM" },
    { bg: ["#102818", "#3dd68c"], title: "DANCE\nPARTY", sub: "SATURDAYS", tag: "DJ SETS" },
    { bg: ["#180828", "#9b6dff"], title: "STACY'S", sub: "@ MELROSE", tag: "COME THRU" },
    { bg: ["#101020", "#ffe14a"], title: "BOTTLE\nSERVICE", sub: "VIP BOOTHS", tag: "ASK THE BAR" },
  ];
  const ad = ads[seed % ads.length];
  const g = ctx.createLinearGradient(0, 0, 0, 360);
  g.addColorStop(0, ad.bg[0]);
  g.addColorStop(1, ad.bg[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 200, 360);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  for (let i = 0; i < 8; i++) ctx.fillRect(0, i * 48, 200, 2);
  ctx.fillStyle = "#fff";
  ctx.font = `800 36px ${FUN_FONT}`;
  ctx.textAlign = "center";
  const lines = ad.title.split("\n");
  lines.forEach((ln, i) => ctx.fillText(ln, 100, 120 + i * 42));
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = `700 22px ${FUN_FONT}`;
  ctx.fillText(ad.sub, 100, 240);
  ctx.fillStyle = ad.bg[0];
  ctx.fillRect(20, 280, 160, 48);
  ctx.fillStyle = ad.bg[1];
  ctx.font = `800 16px ${FUN_FONT}`;
  ctx.fillText(ad.tag, 100, 310);
  return canvasTexture(c, 2);
}

/**
 * Cute cartoony banquette + table (under video wall).
 * Local +Z = open side toward the room.
 * @param {number} [opts.w] full width along the wall (default ~1.0)
 */
function buildLoungeBooth(lit, accent = 0xff4fa8, opts = {}) {
  const g = new THREE.Group();
  g.name = "loungeBooth";
  const w = opts.w ?? 1.0;
  const seat = 0x4a2840;
  const seatHi = 0x5a3450;
  // Taller club banquette proportions
  const backH = 0.78;
  const seatY = 0.36;
  const backY = seatY + 0.14 + backH * 0.5 - 0.02;

  // Base plinth
  const base = box(w * 0.98, 0.16, 0.62, 0x2a1830, { roughness: 0.85 });
  base.position.set(0, 0.08, 0.02);
  g.add(base);

  // Backrest against wall (taller)
  const back = box(w * 0.96, backH, 0.2, seat, { roughness: 0.8 });
  back.position.set(0, backY, -0.32);
  g.add(back);
  // Soft top cap on the backrest
  const cap = box(w * 0.98, 0.08, 0.22, seatHi, { roughness: 0.75 });
  cap.position.set(0, backY + backH * 0.5 + 0.02, -0.3);
  g.add(cap);

  // Seat cushion
  const cushion = box(w * 0.92, 0.16, 0.62, seatHi, { roughness: 0.75 });
  cushion.position.set(0, seatY, 0.02);
  g.add(cushion);

  // Side wings (reads as a full booth bay)
  for (const sx of [-1, 1]) {
    const wing = box(0.1, backH * 0.85, 0.7, seat, { roughness: 0.8 });
    wing.position.set(sx * (w * 0.5 - 0.05), seatY + backH * 0.35, -0.05);
    g.add(wing);
  }

  // Two cute pillows
  for (const sx of [-0.28, 0.22]) {
    const pillow = box(Math.min(0.28, w * 0.18), 0.2, 0.12, accent, {
      roughness: 0.7,
      emissive: accent,
      emissiveIntensity: 0.1,
    });
    pillow.position.set(sx * (w * 0.35), seatY + 0.22, -0.2);
    pillow.rotation.z = sx > 0 ? -0.18 : 0.18;
    g.add(pillow);
  }

  // Round table (scaled a bit with booth width)
  const tableR = Math.min(0.28, 0.18 + w * 0.05);
  const top = cyl(tableR, tableR, 0.05, 0x2a1e18, { roughness: 0.5 }, 10);
  top.position.set(0, 0.78, 0.38);
  g.add(top);
  const leg = cyl(0.05, 0.06, 0.42, METAL, { metalness: 0.4, roughness: 0.45 }, 6);
  leg.position.set(0, 0.52, 0.38);
  g.add(leg);

  // Toe neon under the front edge
  const kick = box(w * 0.88, 0.035, 0.045, accent, {
    emissive: accent,
    emissiveIntensity: 0.5,
  });
  kick.position.set(0, 0.1, 0.34);
  lit(kick, 0.6, 0.3, { glimmerSpeed: 2.0 });
  g.add(kick);

  g.userData.width = w;
  return g;
}

/**
 * Sleek modern square POS terminal (Toast / Clover vibe).
 * Local +Z = screen faces staff. Sit on the bar top.
 */
function buildBarPos(lit) {
  const g = new THREE.Group();
  g.name = "barPos";

  // Weighted square base
  const base = box(0.28, 0.04, 0.28, 0x1a1a22, { metalness: 0.45, roughness: 0.35 });
  base.position.y = 0.02;
  g.add(base);
  // Slim chrome stem
  const stem = cyl(0.03, 0.035, 0.14, 0xc8ccd0, { metalness: 0.65, roughness: 0.22 }, 8);
  stem.position.y = 0.11;
  g.add(stem);
  // Pivot hinge
  const hinge = box(0.1, 0.05, 0.08, 0x2a2a32, { metalness: 0.5, roughness: 0.3 });
  hinge.position.set(0, 0.2, 0.02);
  g.add(hinge);

  // Square tablet body (slightly tilted toward staff)
  const tab = new THREE.Group();
  tab.position.set(0, 0.34, 0.04);
  tab.rotation.x = -0.28;
  g.add(tab);

  const bezel = box(0.38, 0.38, 0.04, 0x0c0c10, { metalness: 0.35, roughness: 0.35 });
  tab.add(bezel);
  // Glass screen — square UI
  const screen = box(0.33, 0.33, 0.015, 0x0a1828, {
    emissive: 0x186080,
    emissiveIntensity: 0.75,
    roughness: 0.2,
    metalness: 0.15,
  });
  screen.position.z = 0.025;
  lit(screen, 1.05, 0.6, { glimmerSpeed: 1.4 });
  tab.add(screen);
  // Soft UI chrome (order grid)
  const ui = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.3),
    new THREE.MeshStandardMaterial({
      map: labelTex("POS", {
        w: 256,
        h: 256,
        bg: "#0a1830",
        fg: "#60e0ff",
        size: 42,
        weight: 800,
        font: "fun",
      }),
      emissive: 0x104060,
      emissiveIntensity: 0.55,
      roughness: 0.35,
      flatShading: true,
    })
  );
  ui.position.z = 0.034;
  tab.add(ui);
  // Status LED strip on top edge
  const led = box(0.2, 0.015, 0.012, 0x3dd68c, {
    emissive: 0x20c060,
    emissiveIntensity: 0.7,
  });
  led.position.set(0, 0.175, 0.02);
  lit(led, 0.7, 0.4);
  tab.add(led);

  // Card reader rail under the tablet
  const reader = box(0.32, 0.06, 0.08, 0x1a1a22, { metalness: 0.4, roughness: 0.35 });
  reader.position.set(0, 0.18, 0.12);
  g.add(reader);
  const slot = box(0.26, 0.02, 0.02, 0x0a0a0c, { roughness: 0.5 });
  slot.position.set(0, 0.18, 0.16);
  g.add(slot);
  // Contactless pad glow
  const nfc = cyl(0.04, 0.04, 0.01, 0x2060a0, {
    emissive: 0x40a0ff,
    emissiveIntensity: 0.55,
  }, 10);
  nfc.rotation.x = Math.PI / 2;
  nfc.position.set(0.1, 0.2, 0.14);
  lit(nfc, 0.55, 0.3);
  g.add(nfc);

  // Soft screen throw
  const glow = new THREE.PointLight(0x50c0ff, 0.35, 1.8, 2);
  glow.position.set(0, 0.4, 0.25);
  g.add(glow);

  return g;
}

/**
 * Six-tap draft tower (standalone). Local +Z = pour face.
 */
function buildDraftTower(_lit) {
  const g = new THREE.Group();
  g.name = "draftTower";
  const cab = box(0.95, 0.95, 0.62, 0xb8bcc4, { metalness: 0.55, roughness: 0.28 });
  cab.position.set(0, 0.48, 0);
  g.add(cab);
  const kick = box(0.92, 0.1, 0.58, 0x2a2e36, { roughness: 0.65 });
  kick.position.set(0, 0.05, 0.02);
  g.add(kick);
  for (const dy of [0.35, 0.62]) {
    const seam = box(0.78, 0.015, 0.02, 0x8a8e96, { metalness: 0.4, roughness: 0.4 });
    seam.position.set(0, dy, 0.32);
    g.add(seam);
  }
  const top = box(1.05, 0.07, 0.7, 0xd0d4dc, { metalness: 0.5, roughness: 0.22 });
  top.position.set(0, 0.98, 0.04);
  g.add(top);
  const tray = box(0.88, 0.04, 0.28, 0x1a1c22, { metalness: 0.35, roughness: 0.4 });
  tray.position.set(0, 1.03, 0.28);
  g.add(tray);
  for (let i = 0; i < 7; i++) {
    const bar = box(0.82, 0.015, 0.02, 0x6a7078, { metalness: 0.55, roughness: 0.3 });
    bar.position.set(0, 1.06, 0.16 + i * 0.035);
    g.add(bar);
  }
  const tower = box(0.82, 0.42, 0.28, 0xc8ccd4, { metalness: 0.65, roughness: 0.22 });
  tower.position.set(0, 1.28, 0.02);
  g.add(tower);
  const rail = box(0.78, 0.08, 0.22, 0xd8dce4, { metalness: 0.7, roughness: 0.18 });
  rail.position.set(0, 1.52, 0.02);
  g.add(rail);
  const tapColors = [0xc41e3a, 0xf0c14d, 0x2a5a3a, 0x3a3a8a, 0xe8a040, 0xf0f0f4];
  for (let i = 0; i < 6; i++) {
    const tx = -0.32 + i * 0.13;
    const spout = cyl(0.018, 0.022, 0.16, 0xb0b4bc, { metalness: 0.7, roughness: 0.22 }, 6);
    spout.rotation.x = Math.PI / 2;
    spout.position.set(tx, 1.22, 0.2);
    g.add(spout);
    const stem = box(0.028, 0.28, 0.028, 0xa8acb4, { metalness: 0.6, roughness: 0.25 });
    stem.position.set(tx, 1.48, 0.1);
    stem.rotation.x = -0.45;
    g.add(stem);
    const knob = cyl(0.045, 0.04, 0.07, tapColors[i], {
      metalness: 0.15,
      roughness: 0.4,
      emissive: tapColors[i],
      emissiveIntensity: 0.12,
    }, 8);
    knob.position.set(tx, 1.62, 0.04);
    g.add(knob);
  }
  const badge = new THREE.Mesh(
    new THREE.PlaneGeometry(0.42, 0.1),
    new THREE.MeshStandardMaterial({
      map: labelTex("DRAFT", {
        w: 180,
        h: 48,
        bg: "#1a1a22",
        fg: "#e8ecf0",
        size: 28,
        weight: 800,
        font: "fun",
      }),
      emissive: 0x303840,
      emissiveIntensity: 0.3,
      roughness: 0.45,
      flatShading: true,
    })
  );
  badge.position.set(0, 1.72, 0.17);
  g.add(badge);
  return g;
}

/**
 * One classic wall-mount beer tap: flange on the wall, chrome faucet + spout,
 * long brand handle sticking up (reads as beer, not a soda fountain knob).
 * Local +Z = pour face.
 */
function buildBeerTap(handleCol) {
  const t = new THREE.Group();
  const chrome = { metalness: 0.72, roughness: 0.22 };
  // Round wall flange
  const flange = cyl(0.055, 0.055, 0.03, 0xd0d4dc, chrome, 10);
  flange.rotation.x = Math.PI / 2;
  flange.position.set(0, 0, 0.02);
  t.add(flange);
  // Faucet body (short chrome stub out of wall)
  const body = cyl(0.028, 0.032, 0.1, 0xc0c4cc, chrome, 8);
  body.rotation.x = Math.PI / 2;
  body.position.set(0, 0, 0.08);
  t.add(body);
  // Collar where the handle seats
  const collar = cyl(0.035, 0.03, 0.04, 0xb8bcc4, chrome, 8);
  collar.position.set(0, 0.04, 0.1);
  t.add(collar);
  // Spout — curves down/forward so beer pours into a glass
  const spout = cyl(0.014, 0.018, 0.14, 0xb0b4bc, chrome, 6);
  spout.rotation.x = Math.PI / 2 + 0.55;
  spout.position.set(0, -0.05, 0.16);
  t.add(spout);
  // Spout tip (slightly wider nozzle)
  const nozzle = cyl(0.016, 0.012, 0.035, 0xa8acb4, chrome, 6);
  nozzle.rotation.x = Math.PI / 2 + 0.55;
  nozzle.position.set(0, -0.1, 0.2);
  t.add(nozzle);
  // Long handle shaft — wood/plastic stick (the "beer handle" silhouette)
  const shaft = cyl(0.016, 0.014, 0.38, 0x2a2218, { roughness: 0.65, metalness: 0.05 }, 6);
  // Pivot at collar, lean toward pourer
  shaft.position.set(0, 0.22, 0.06);
  shaft.rotation.x = -0.55;
  t.add(shaft);
  // Tall brand topper (ceramic / plastic beer handle head)
  const topper = cyl(0.042, 0.038, 0.16, handleCol, {
    metalness: 0.08,
    roughness: 0.42,
    emissive: handleCol,
    emissiveIntensity: 0.1,
  }, 8);
  topper.position.set(0, 0.4, -0.02);
  topper.rotation.x = -0.55;
  t.add(topper);
  // Small metal cap on topper tip
  const tip = cyl(0.03, 0.028, 0.025, 0xd8dce4, chrome, 8);
  tip.position.set(0, 0.49, -0.07);
  tip.rotation.x = -0.55;
  t.add(tip);
  return t;
}

/**
 * Wall draft row + low ice bin on the cooler face.
 * Taps stick out of the wall (no chrome machine housing) so it reads as beer.
 * Local +Z = service face (into the room).
 */
function buildIceAndTapBay(lit) {
  const g = new THREE.Group();
  g.name = "iceAndTapBay";
  const bayW = 1.2;

  // Dark wood plaque on the cooler face — taps mount into this, not a soda bank
  const plaque = box(bayW + 0.06, 0.72, 0.05, 0x3a2a1e, { roughness: 0.78, metalness: 0.05 });
  plaque.position.set(0, 1.42, 0.01);
  g.add(plaque);
  // Thin brass/chrome rail under the handles (classic bar detail)
  const rail = box(bayW * 0.92, 0.04, 0.06, 0xc8a060, { metalness: 0.55, roughness: 0.3 });
  rail.position.set(0, 1.12, 0.06);
  g.add(rail);

  // ── Six wall taps ──
  const tapColors = [0xc41e3a, 0xf0c14d, 0x1e5a2e, 0x2a3a8a, 0xd47820, 0xe8e4dc];
  const tapY = 1.38;
  const n = 6;
  const span = bayW * 0.78;
  for (let i = 0; i < n; i++) {
    const tx = -span * 0.5 + (i / (n - 1)) * span;
    const tap = buildBeerTap(tapColors[i]);
    tap.position.set(tx, tapY, 0.04);
    g.add(tap);
  }

  // Drip tray shelf under the spouts (not a machine counter)
  const trayY = 0.98;
  const tray = box(bayW * 0.95, 0.05, 0.38, 0x2a2e34, { metalness: 0.35, roughness: 0.4 });
  tray.position.set(0, trayY, 0.22);
  g.add(tray);
  // Grate bars
  for (let i = 0; i < 5; i++) {
    const bar = box(bayW * 0.88, 0.012, 0.02, 0x6a7078, { metalness: 0.5, roughness: 0.3 });
    bar.position.set(0, trayY + 0.03, 0.1 + i * 0.055);
    g.add(bar);
  }
  // Tray lip
  const lip = box(bayW * 0.95, 0.03, 0.02, 0x1a1c22, { metalness: 0.3, roughness: 0.45 });
  lip.position.set(0, trayY + 0.03, 0.4);
  g.add(lip);

  // ── Low ice bin under the tray (simple chest, not a commercial machine) ──
  const iceH = 0.88;
  const iceBody = box(bayW * 0.92, iceH, 0.62, 0xb8bcc4, { metalness: 0.45, roughness: 0.32 });
  iceBody.position.set(0, iceH * 0.5, 0.24);
  g.add(iceBody);
  const toe = box(bayW * 0.9, 0.08, 0.58, 0x2a2e38, { roughness: 0.65 });
  toe.position.set(0, 0.04, 0.24);
  g.add(toe);
  // Sliding lid on top (under drip tray)
  const lid = box(bayW * 0.88, 0.04, 0.58, 0xa8acb4, { metalness: 0.4, roughness: 0.35 });
  lid.position.set(0, iceH + 0.02, 0.24);
  g.add(lid);
  // Cool ice glow window (subtle — stainless nearby blooms easily)
  const bin = box(bayW * 0.62, 0.32, 0.03, 0x7ab0c8, {
    emissive: 0x3a88a8,
    emissiveIntensity: 0.22,
    roughness: 0.35,
    metalness: 0.08,
  });
  bin.position.set(0, 0.48, 0.55);
  lit(bin, 0.35, 0.18, { glimmerSpeed: 1.4 });
  g.add(bin);
  for (let i = 0; i < 4; i++) {
    const cube = box(0.07, 0.07, 0.07, 0xe0f4ff, {
      transparent: true,
      opacity: 0.75,
      emissive: 0x80c0d8,
      emissiveIntensity: 0.12,
      roughness: 0.2,
    });
    cube.position.set(-0.18 + i * 0.12, 0.42 + (i % 2) * 0.08, 0.58);
    cube.rotation.y = i * 0.35;
    g.add(cube);
  }
  // Scoop handle resting on lid edge
  const scoop = box(0.08, 0.025, 0.16, 0xe8ecf0, { metalness: 0.4, roughness: 0.35 });
  scoop.position.set(0.28, iceH + 0.05, 0.42);
  scoop.rotation.z = -0.2;
  g.add(scoop);

  // Soft service lights — low so stainless doesn't bloom white
  const iceGlow = new THREE.PointLight(0xa0d8e8, 0.14, 1.6, 2);
  iceGlow.position.set(0, 0.5, 0.55);
  g.add(iceGlow);
  const tapGlow = new THREE.PointLight(0xffe0c8, 0.16, 1.8, 2);
  tapGlow.position.set(0, 1.45, 0.4);
  g.add(tapGlow);

  g.userData.bayW = bayW;
  return g;
}

/**
 * Big cartoony commercial ice machine — stainless body, lit bin, ICE badge.
 * Local +Z = front face. Pass `scale` to squeeze into a tight service bay.
 */
function buildIceMachine(lit, opts = {}) {
  const g = new THREE.Group();
  g.name = "iceMachine";
  const s = opts.scale ?? 1;
  // Main chassis
  const body = box(0.95, 1.55, 0.78, 0xc8ccd4, {
    metalness: 0.55,
    roughness: 0.3,
  });
  body.position.y = 0.82;
  g.add(body);
  // Side panels
  for (const sx of [-1, 1]) {
    const side = box(0.04, 1.45, 0.72, 0xb0b4bc, { metalness: 0.5, roughness: 0.32 });
    side.position.set(sx * 0.48, 0.82, 0);
    g.add(side);
  }
  // Top unit / condenser hump
  const top = box(0.9, 0.24, 0.72, 0xa8acb4, { metalness: 0.5, roughness: 0.34 });
  top.position.set(0, 1.72, 0);
  g.add(top);
  // Vent slots on top
  for (let i = 0; i < 5; i++) {
    const vent = box(0.75, 0.025, 0.05, 0x3a3e46, { roughness: 0.6 });
    vent.position.set(0, 1.84, -0.22 + i * 0.1);
    g.add(vent);
  }
  // Front door / panel
  const door = box(0.85, 0.95, 0.05, 0xd0d4dc, { metalness: 0.5, roughness: 0.32 });
  door.position.set(0, 0.95, 0.38);
  g.add(door);
  // Ice bin window (soft cool glow)
  const bin = box(0.62, 0.38, 0.04, 0x90d0e8, {
    emissive: 0x50a8c8,
    emissiveIntensity: 0.35,
    roughness: 0.3,
    metalness: 0.12,
  });
  bin.position.set(0, 0.78, 0.42);
  lit(bin, 0.55, 0.3, { glimmerSpeed: 1.6 });
  g.add(bin);
  // Chunks of ice
  for (let i = 0; i < 6; i++) {
    const cube = box(0.09, 0.09, 0.09, 0xe0f4ff, {
      transparent: true,
      opacity: 0.8,
      roughness: 0.2,
      metalness: 0.08,
      emissive: 0x80c0d8,
      emissiveIntensity: 0.15,
    });
    cube.position.set(-0.18 + (i % 3) * 0.14, 0.68 + Math.floor(i / 3) * 0.12, 0.46);
    cube.rotation.y = i * 0.35;
    g.add(cube);
  }
  // Scoop on lip
  const scoop = box(0.11, 0.035, 0.2, 0xe8ecf0, { metalness: 0.45, roughness: 0.35 });
  scoop.position.set(0.26, 1.05, 0.44);
  scoop.rotation.z = -0.2;
  g.add(scoop);
  // Control panel
  const panel = box(0.32, 0.18, 0.035, 0x1a1a22, { roughness: 0.5 });
  panel.position.set(0, 1.28, 0.42);
  g.add(panel);
  for (let i = 0; i < 3; i++) {
    const btn = cyl(0.025, 0.025, 0.025, [0x3dd68c, 0xffe14a, 0xff4fa8][i], {
      emissive: [0x20a050, 0xd0a020, 0xff2a80][i],
      emissiveIntensity: 0.4,
    }, 8);
    btn.rotation.x = Math.PI / 2;
    btn.position.set(-0.08 + i * 0.08, 1.28, 0.45);
    lit(btn, 0.45, 0.28, { glimmerSpeed: 2.2 + i });
    g.add(btn);
  }
  // ICE badge
  const badge = new THREE.Mesh(
    new THREE.PlaneGeometry(0.48, 0.14),
    new THREE.MeshStandardMaterial({
      map: labelTex("ICE", {
        w: 256,
        h: 80,
        bg: "#1a4a8a",
        fg: "#80e8ff",
        size: 48,
        weight: 800,
        font: "fun",
      }),
      emissive: 0x2060a0,
      emissiveIntensity: 0.4,
      roughness: 0.4,
      flatShading: true,
    })
  );
  badge.position.set(0, 1.5, 0.44);
  g.add(badge);
  // Drain pan
  const pan = box(0.7, 0.04, 0.22, 0x2a2e38, { metalness: 0.3, roughness: 0.5 });
  pan.position.set(0, 0.14, 0.42);
  g.add(pan);
  // Toe kick
  const kick = box(0.92, 0.1, 0.74, 0x2a2e38, { roughness: 0.6 });
  kick.position.y = 0.05;
  g.add(kick);
  // Soft cold glow
  const glow = new THREE.PointLight(0xa0d8e8, 0.28, 2.8, 2);
  glow.position.set(0, 0.9, 0.65);
  g.add(glow);
  if (s !== 1) g.scale.set(s, s, s);
  return g;
}

/**
 * Slim wall-mounted flat screen. Local +Z = screen faces into the room.
 * `opts.vertical` for portrait ads; `opts.tilt` radians (pitch toward floor).
 */
function buildFlatScreen(lit, opts = {}) {
  const {
    w = 1.0,
    h = 0.56,
    vertical = false,
    tilt = 0,
    map = null,
    emissive = 0x204060,
  } = opts;
  const g = new THREE.Group();
  g.name = vertical ? "adScreen" : "partyScreen";
  const sw = vertical ? Math.min(w, h) : w;
  const sh = vertical ? Math.max(w, h) : h;
  // Bezel
  const frame = box(sw + 0.06, sh + 0.06, 0.05, 0x0a0c10, {
    metalness: 0.45,
    roughness: 0.35,
  });
  frame.position.z = -0.01;
  g.add(frame);
  // Screen slab
  const slab = box(sw, sh, 0.02, 0x061018, {
    emissive,
    emissiveIntensity: 0.55,
    roughness: 0.22,
    metalness: 0.15,
  });
  slab.position.z = 0.01;
  lit(slab, 0.85, 0.5);
  g.add(slab);
  // Content plane
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(sw * 0.94, sh * 0.94),
    new THREE.MeshStandardMaterial({
      map: map,
      emissive,
      emissiveIntensity: 0.5,
      roughness: 0.35,
      flatShading: true,
    })
  );
  screen.position.z = 0.025;
  g.add(screen);
  // Thin LED edge under bezel
  const led = box(sw * 0.9, 0.02, 0.015, 0x40e0ff, {
    emissive: 0x20c0ff,
    emissiveIntensity: 0.55,
  });
  led.position.set(0, -sh * 0.5 - 0.02, 0.02);
  lit(led, 0.7, 0.35, { glimmerSpeed: 2.4 });
  g.add(led);
  if (tilt) g.rotation.x = tilt;
  g.userData.screen = screen;
  g.userData.slab = slab;
  return g;
}

/**
 * Iconic Stacy's cathedral window — Gothic pointed arch that rainbow-cycles.
 * Body + peak (pyramid tip) + neon silhouette all light up as one epic unit.
 * Local +Z faces into the room.
 */
function buildCathedralWindow(nightMats) {
  const g = new THREE.Group();
  g.name = "cathedralWindow";

  const W = 1.65;
  const H = 2.75;
  const D = 0.32;
  const peakH = 1.15; // pointed crown height above spring line
  const frameCol = 0x16161e;
  const frameLite = 0x282832;
  const totalH = H + peakH;

  // Materials that rainbow-cycle in tickInterior
  const makeGlowMat = (intensity = 1.4) => {
    const m = new THREE.MeshStandardMaterial({
      color: 0x40d0ff,
      emissive: 0x40d0ff,
      emissiveIntensity: intensity,
      roughness: 0.18,
      metalness: 0.08,
      flatShading: true,
    });
    trackNightMat(nightMats, m, intensity, intensity * 0.7, {
      glimmer: true,
      glimmerSpeed: 1.5,
    });
    return m;
  };
  const paneMat = makeGlowMat(1.5);
  const peakMat = makeGlowMat(1.65); // peak a touch brighter
  const neonMat = makeGlowMat(1.85); // outline tubes
  const glowMats = [paneMat, peakMat, neonMat];

  // Deep brick reveal behind the window
  const reveal = box(W + 0.42, totalH + 0.25, 0.14, frameCol);
  reveal.position.set(0, totalH * 0.48, -0.12);
  g.add(reveal);

  // Stone sill
  const sill = box(W + 0.32, 0.16, D + 0.14, frameLite, { roughness: 0.7 });
  sill.position.set(0, 0.09, 0.04);
  g.add(sill);
  // Jambs
  const jambL = box(0.14, H, D, frameCol);
  jambL.position.set(-W * 0.52, H * 0.5, 0);
  g.add(jambL);
  const jambR = box(0.14, H, D, frameCol);
  jambR.position.set(W * 0.52, H * 0.5, 0);
  g.add(jambR);
  // Spring line under the pointed crown
  const spring = box(W + 0.3, 0.12, D + 0.04, frameLite);
  spring.position.set(0, H - 0.02, 0.02);
  g.add(spring);

  // ── Pointed arch frame (dark stone steps) + glowing glass fill ──
  const peakSteps = 12;
  for (let i = 0; i < peakSteps; i++) {
    const t = i / (peakSteps - 1);
    // Pointed Gothic: linear taper to tip
    const ww = W * (1 - t * 0.97);
    const y = H + 0.04 + t * (peakH - 0.2);
    // Frame step
    const arch = box(Math.max(0.12, ww + 0.16), 0.1, D, frameCol);
    arch.position.set(0, y, 0);
    g.add(arch);
    // Glowing glass fill in the peak (THIS lights up with the body)
    const gw = Math.max(0.07, ww * 0.88);
    const pg = new THREE.Mesh(new THREE.BoxGeometry(gw, 0.1, 0.08), peakMat);
    pg.position.set(0, y, 0.02);
    g.add(pg);
  }
  // Glowing finial / tip of the pyramid — pure neon
  const tipY = H + peakH - 0.05;
  const tip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.22, 0.14), neonMat);
  tip.position.set(0, tipY, 0.02);
  g.add(tip);
  const tipBall = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 10),
    neonMat.clone()
  );
  tipBall.material.emissiveIntensity = 2.0;
  trackNightMat(nightMats, tipBall.material, 2.0, 1.3, {
    glimmer: true,
    glimmerSpeed: 2.8,
  });
  tipBall.position.set(0, tipY + 0.18, 0.02);
  g.add(tipBall);
  glowMats.push(tipBall.material);

  // ── Main glowing pane body ──
  const glass = new THREE.Mesh(new THREE.BoxGeometry(W * 0.88, H * 0.9, 0.09), paneMat);
  glass.position.set(0, H * 0.48, 0.0);
  g.add(glass);

  // Stained-glass vertical strips (subtle rainbow phase offsets in tick)
  const stripMats = [];
  const nStrips = 7;
  for (let i = 0; i < nStrips; i++) {
    const u = (i / (nStrips - 1)) * 2 - 1;
    const sm = makeGlowMat(0.55);
    stripMats.push(sm);
    glowMats.push(sm);
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(W * 0.1, H * 0.86, 0.04),
      sm
    );
    strip.position.set(u * W * 0.36, H * 0.48, 0.06);
    g.add(strip);
  }

  // Dense vertical mullions (iconic bars)
  const nBars = 9;
  for (let i = 0; i < nBars; i++) {
    const u = (i / (nBars - 1)) * 2 - 1;
    const bar = box(0.04, H * 0.88, 0.07, 0x0c0c12, { roughness: 0.55, metalness: 0.2 });
    bar.position.set(u * W * 0.38, H * 0.48, 0.08);
    g.add(bar);
    // Rise into the peak
    if (Math.abs(u) < 0.75) {
      const rise = peakH * (1 - Math.abs(u) * 0.85) * 0.75;
      const bar2 = box(0.035, rise, 0.06, 0x0c0c12, { roughness: 0.55 });
      bar2.position.set(u * W * 0.28 * (1 - 0.15), H + rise * 0.45, 0.08);
      g.add(bar2);
    }
  }
  // Horizontal rails
  for (const y of [0.5, 1.15, 1.8, 2.45]) {
    const rail = box(W * 0.88, 0.045, 0.07, 0x0c0c12, { roughness: 0.55, metalness: 0.2 });
    rail.position.set(0, y, 0.08);
    g.add(rail);
  }

  // ── Neon outline tracing the full silhouette (body + peak) ──
  // Sides of body
  for (const side of [-1, 1]) {
    const tube = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, H * 0.95, 0.06),
      neonMat
    );
    tube.position.set(side * W * 0.5, H * 0.48, 0.14);
    g.add(tube);
  }
  // Sill neon
  const sillNeon = new THREE.Mesh(
    new THREE.BoxGeometry(W + 0.12, 0.05, 0.06),
    neonMat
  );
  sillNeon.position.set(0, 0.18, 0.14);
  g.add(sillNeon);
  // Spring-line neon under peak
  const springNeon = new THREE.Mesh(
    new THREE.BoxGeometry(W + 0.1, 0.05, 0.06),
    neonMat
  );
  springNeon.position.set(0, H - 0.02, 0.14);
  g.add(springNeon);
  // Pointed peak neon edges (stepped to follow the pyramid)
  for (let i = 0; i < peakSteps; i++) {
    const t = i / (peakSteps - 1);
    const ww = W * (1 - t * 0.97);
    const y = H + 0.04 + t * (peakH - 0.2);
    for (const side of [-1, 1]) {
      const edge = new THREE.Mesh(
        new THREE.BoxGeometry(0.055, 0.1, 0.055),
        neonMat
      );
      edge.position.set(side * Math.max(0.04, ww * 0.5), y, 0.14);
      g.add(edge);
    }
  }
  // Tip neon ring
  const tipRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.11, 0.028, 8, 16),
    neonMat
  );
  tipRing.position.set(0, tipY + 0.18, 0.14);
  g.add(tipRing);

  // Soft bloom halos — body + tall peak
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(W * 1.35, H * 1.2),
    new THREE.MeshBasicMaterial({
      color: 0x40c8ff,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  halo.position.set(0, H * 0.5, 0.2);
  g.add(halo);
  const peakHalo = new THREE.Mesh(
    new THREE.PlaneGeometry(W * 0.95, peakH * 1.35),
    new THREE.MeshBasicMaterial({
      color: 0x80e0ff,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  peakHalo.position.set(0, H + peakH * 0.45, 0.2);
  g.add(peakHalo);

  // Local fill lights — body + peak tip throw
  const bodyLite = new THREE.PointLight(0x40d0ff, 1.4, 8, 2);
  bodyLite.position.set(0, H * 0.55, 0.9);
  g.add(bodyLite);
  const peakLite = new THREE.PointLight(0x80e8ff, 1.1, 6, 2);
  peakLite.position.set(0, H + peakH * 0.6, 0.7);
  g.add(peakLite);

  g.userData.paneMat = paneMat;
  g.userData.peakMat = peakMat;
  g.userData.neonMat = neonMat;
  g.userData.glowMats = glowMats;
  g.userData.stripMats = stripMats;
  g.userData.haloMat = halo.material;
  g.userData.peakHaloMat = peakHalo.material;
  g.userData.bodyLite = bodyLite;
  g.userData.peakLite = peakLite;
  g.userData.totalH = totalH;
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

/**
 * Round cartoony liquor bottle (low-poly spheres + fat cylinders).
 * `kind`: 0 squat whiskey · 1 classic wine · 2 tall spirit · 3 round flask
 */
function buildBottle(col, h = 0.28, r = 0.05, kind = 0) {
  const g = new THREE.Group();
  g.name = "bottle";
  const segs = 12;
  const glassMat = {
    roughness: 0.22,
    metalness: 0.18,
    transparent: true,
    opacity: 0.92,
  };
  // Soft liquid glow so bottles read as glass, not plastic bricks
  const emissive = new THREE.Color(col).multiplyScalar(0.22);

  if (kind === 3) {
    // Round flask — fat sphere body
    const belly = new THREE.Mesh(
      new THREE.SphereGeometry(r * 1.35, segs, segs),
      new THREE.MeshStandardMaterial({
        color: col,
        emissive,
        emissiveIntensity: 0.35,
        ...glassMat,
        flatShading: false,
      })
    );
    belly.position.y = r * 1.2;
    belly.castShadow = true;
    g.add(belly);
    const neck = cyl(r * 0.32, r * 0.42, h * 0.28, col, { ...glassMat }, segs);
    neck.position.y = r * 2.15;
    g.add(neck);
    const cork = cyl(r * 0.38, r * 0.4, 0.04, 0xc8a060, { roughness: 0.7 }, 8);
    cork.position.y = r * 2.35;
    g.add(cork);
    return g;
  }

  // Body: slightly bulged cylinder (cartoony soda-bottle read)
  const bodyR = kind === 0 ? r * 1.25 : kind === 2 ? r * 0.95 : r * 1.1;
  const bodyH = h * (kind === 0 ? 0.55 : kind === 2 ? 0.62 : 0.58);
  const body = cyl(bodyR * 0.92, bodyR, bodyH, col, {
    ...glassMat,
    emissive: col,
    emissiveIntensity: 0.12,
  }, segs);
  body.position.y = bodyH * 0.5 + 0.01;
  g.add(body);

  // Round shoulder blob so the silhouette isn't a hard cylinder edge
  const shoulder = new THREE.Mesh(
    new THREE.SphereGeometry(bodyR * 0.95, segs, Math.max(6, (segs / 2) | 0)),
    new THREE.MeshStandardMaterial({
      color: col,
      emissive,
      emissiveIntensity: 0.3,
      ...glassMat,
      flatShading: false,
    })
  );
  shoulder.scale.set(1, 0.55, 1);
  shoulder.position.y = bodyH * 0.92;
  shoulder.castShadow = true;
  g.add(shoulder);

  // Fat neck
  const neckH = h * (kind === 2 ? 0.28 : 0.22);
  const neck = cyl(bodyR * 0.32, bodyR * 0.48, neckH, col, { ...glassMat }, segs);
  neck.position.y = bodyH + neckH * 0.35;
  g.add(neck);

  // Chunky cork / gold cap
  const capCol = kind === 1 ? 0xc41e3a : kind === 0 ? 0xc8a040 : 0xe8dcc0;
  const cap = cyl(bodyR * 0.4, bodyR * 0.42, 0.04, capCol, {
    metalness: kind === 0 ? 0.55 : 0.15,
    roughness: kind === 0 ? 0.35 : 0.65,
  }, 8);
  cap.position.y = bodyH + neckH * 0.7;
  g.add(cap);
  // Little sphere pom on top of cork
  const pom = new THREE.Mesh(
    new THREE.SphereGeometry(bodyR * 0.22, 8, 8),
    new THREE.MeshStandardMaterial({
      color: capCol,
      roughness: 0.55,
      metalness: 0.2,
      flatShading: false,
    })
  );
  pom.position.y = bodyH + neckH * 0.7 + 0.03;
  g.add(pom);

  // Soft oval label sticker (not a hard box band)
  const label = new THREE.Mesh(
    new THREE.SphereGeometry(bodyR * 0.55, 8, 8),
    new THREE.MeshStandardMaterial({
      color: 0xf5efe0,
      roughness: 0.75,
      flatShading: false,
    })
  );
  label.scale.set(0.35, 0.7, 0.15);
  label.position.set(0, bodyH * 0.45, bodyR * 0.85);
  g.add(label);

  return g;
}

/**
 * Cartoony bar glassware. Local +Y up; sits on a shelf.
 * `kind`: 0 wine · 1 rocks · 2 flute · 3 coupe · 4 pint
 */
function buildGlass(kind = 0) {
  const g = new THREE.Group();
  g.name = "glassware";
  const segs = 12;
  const glass = {
    color: 0xd8e8f0,
    roughness: 0.12,
    metalness: 0.15,
    transparent: true,
    opacity: 0.42,
    emissive: 0xa0c8e0,
    emissiveIntensity: 0.12,
  };

  if (kind === 1) {
    // Rocks / tumbler — short fat cup
    const cup = cyl(0.045, 0.04, 0.09, glass.color, glass, segs);
    cup.position.y = 0.05;
    g.add(cup);
    const rim = cyl(0.048, 0.048, 0.012, 0xe8f4ff, { ...glass, opacity: 0.55 }, segs);
    rim.position.y = 0.1;
    g.add(rim);
    return g;
  }
  if (kind === 2) {
    // Champagne flute
    const foot = cyl(0.035, 0.035, 0.012, glass.color, glass, segs);
    foot.position.y = 0.008;
    g.add(foot);
    const stem = cyl(0.008, 0.01, 0.1, glass.color, glass, 8);
    stem.position.y = 0.06;
    g.add(stem);
    const bowl = cyl(0.018, 0.032, 0.12, glass.color, glass, segs);
    bowl.position.y = 0.16;
    g.add(bowl);
    return g;
  }
  if (kind === 3) {
    // Coupe — wide shallow bowl
    const foot = cyl(0.04, 0.04, 0.012, glass.color, glass, segs);
    foot.position.y = 0.008;
    g.add(foot);
    const stem = cyl(0.01, 0.012, 0.07, glass.color, glass, 8);
    stem.position.y = 0.05;
    g.add(stem);
    const bowl = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, segs, segs),
      new THREE.MeshStandardMaterial({ ...glass, flatShading: false })
    );
    bowl.scale.set(1, 0.45, 1);
    bowl.position.y = 0.12;
    g.add(bowl);
    return g;
  }
  if (kind === 4) {
    // Pint — tall taper
    const cup = cyl(0.04, 0.05, 0.16, glass.color, glass, segs);
    cup.position.y = 0.09;
    g.add(cup);
    const rim = cyl(0.052, 0.052, 0.012, 0xe8f4ff, { ...glass, opacity: 0.5 }, segs);
    rim.position.y = 0.17;
    g.add(rim);
    return g;
  }

  // Wine glass (default)
  const foot = cyl(0.042, 0.042, 0.012, glass.color, glass, segs);
  foot.position.y = 0.008;
  g.add(foot);
  const stem = cyl(0.009, 0.011, 0.09, glass.color, glass, 8);
  stem.position.y = 0.055;
  g.add(stem);
  const bowl = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, segs, segs),
    new THREE.MeshStandardMaterial({ ...glass, flatShading: false })
  );
  bowl.scale.set(1, 1.15, 1);
  bowl.position.y = 0.14;
  g.add(bowl);
  // Rim ring
  const rim = cyl(0.048, 0.048, 0.01, 0xe8f4ff, { ...glass, opacity: 0.5 }, segs);
  rim.position.y = 0.19;
  g.add(rim);
  return g;
}

/** CDJ-style deck (platter + screen + pads). Local +Z = front of deck. */
function buildDjDeck(lit, accent = 0x40e0ff) {
  const g = new THREE.Group();
  // Chassis
  const body = box(0.55, 0.08, 0.42, 0x12141a, { roughness: 0.4, metalness: 0.35 });
  body.position.y = 0.04;
  g.add(body);
  // Platter
  const platter = cyl(0.14, 0.14, 0.025, 0x1a1a22, { metalness: 0.45, roughness: 0.35 }, 16);
  platter.position.set(-0.08, 0.1, 0.02);
  g.add(platter);
  const hub = cyl(0.04, 0.04, 0.03, 0xc0c8d0, { metalness: 0.6, roughness: 0.3 }, 10);
  hub.position.set(-0.08, 0.12, 0.02);
  g.add(hub);
  // Jog ring glow
  const ring = cyl(0.15, 0.15, 0.012, accent, {
    emissive: accent,
    emissiveIntensity: 0.7,
    roughness: 0.3,
  }, 16);
  ring.position.set(-0.08, 0.085, 0.02);
  lit(ring, 0.95, 0.55, { glimmerSpeed: 3.5 });
  g.add(ring);
  // Screen
  const screen = box(0.2, 0.12, 0.02, 0x0a2030, {
    emissive: 0x1860a0,
    emissiveIntensity: 0.65,
    roughness: 0.25,
  });
  screen.position.set(0.16, 0.12, -0.08);
  lit(screen, 0.9, 0.5);
  g.add(screen);
  // Performance pads
  for (let i = 0; i < 4; i++) {
    const pad = box(0.07, 0.02, 0.07, 0x2a2a35, {
      emissive: accent,
      emissiveIntensity: 0.35,
      roughness: 0.4,
    });
    pad.position.set(0.08 + (i % 2) * 0.09, 0.09, 0.08 + Math.floor(i / 2) * 0.09);
    lit(pad, 0.6, 0.3, { glimmerSpeed: 4 + i * 0.3 });
    g.add(pad);
  }
  // Tempo fader slot
  const fader = box(0.04, 0.015, 0.16, 0x40a0ff, {
    emissive: 0x2080d0,
    emissiveIntensity: 0.4,
  });
  fader.position.set(0.22, 0.09, 0.05);
  g.add(fader);
  return g;
}

/** Slim mixer between the decks. */
function buildDjMixer(lit) {
  const g = new THREE.Group();
  const body = box(0.38, 0.07, 0.42, 0x0e1016, { roughness: 0.35, metalness: 0.4 });
  body.position.y = 0.04;
  g.add(body);
  // Channel faders
  for (let i = 0; i < 4; i++) {
    const slot = box(0.025, 0.01, 0.14, 0x1a1a22);
    slot.position.set(-0.12 + i * 0.08, 0.085, 0.06);
    g.add(slot);
    const knob = box(0.03, 0.02, 0.04, 0xc8ccd0, { metalness: 0.5, roughness: 0.3 });
    knob.position.set(-0.12 + i * 0.08, 0.095, 0.02 + (i % 2) * 0.04);
    g.add(knob);
  }
  // EQ knobs
  for (let i = 0; i < 8; i++) {
    const k = cyl(0.018, 0.018, 0.02, 0x2a2a32, {
      metalness: 0.4,
      roughness: 0.35,
      emissive: [0xff4fa8, 0x40e0ff, 0x9b6dff, 0x3dd68c][i % 4],
      emissiveIntensity: 0.45,
    }, 8);
    k.position.set(-0.12 + (i % 4) * 0.08, 0.1, -0.1 + Math.floor(i / 4) * 0.08);
    lit(k, 0.7, 0.4, { glimmerSpeed: 2.5 + i * 0.2 });
    g.add(k);
  }
  // Crossfader
  const xf = box(0.16, 0.015, 0.035, 0xff4fa8, {
    emissive: 0xff2a80,
    emissiveIntensity: 0.5,
  });
  xf.position.set(0, 0.09, 0.16);
  lit(xf, 0.8, 0.45);
  g.add(xf);
  return g;
}

/** Fun jukebox face art — music notes, $, song title chrome. */
function jukeScreenTex(kind = "main") {
  const w = kind === "main" ? 360 : 320;
  const h = kind === "main" ? 320 : 140;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  // Club gradient
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, "#0a1838");
  grad.addColorStop(0.5, "#1a0a30");
  grad.addColorStop(1, "#081828");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  // Scattered music notes + dollar signs
  ctx.font = `800 28px ${FUN_FONT}`;
  ctx.textAlign = "center";
  const glyphs = ["♪", "♫", "♬", "$", "♪", "$", "♫", "♩"];
  const cols = ["#60e8ff", "#ff80c0", "#ffe14a", "#80ffb0", "#c080ff"];
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = cols[i % cols.length];
    ctx.globalAlpha = 0.35 + (i % 3) * 0.15;
    const gx = 24 + (i * 47) % (w - 48);
    const gy = 28 + ((i * 37) % (h - 40));
    ctx.font = `800 ${18 + (i % 4) * 8}px ${FUN_FONT}`;
    ctx.fillText(glyphs[i % glyphs.length], gx, gy);
  }
  ctx.globalAlpha = 1;
  if (kind === "main") {
    // Title block
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(24, h * 0.28, w - 48, h * 0.44);
    ctx.fillStyle = "#80f0ff";
    ctx.font = `800 36px ${FUN_FONT}`;
    ctx.fillText("♪  NOW PLAYING  ♫", w / 2, h * 0.42);
    ctx.fillStyle = "#ff80c0";
    ctx.font = `800 28px ${FUN_FONT}`;
    ctx.fillText("PICK A BOP", w / 2, h * 0.56);
    ctx.fillStyle = "#ffe14a";
    ctx.font = `800 22px ${FUN_FONT}`;
    ctx.fillText("$1  ·  3 SONGS", w / 2, h * 0.68);
  } else {
    ctx.fillStyle = "#ff80c0";
    ctx.font = `800 30px ${FUN_FONT}`;
    ctx.fillText("♪ TOUCH TO BROWSE ♫", w / 2, h * 0.45);
    ctx.fillStyle = "#80e8ff";
    ctx.font = `800 20px ${FUN_FONT}`;
    ctx.fillText("INSERT $  ·  TAP SONG", w / 2, h * 0.72);
  }
  return canvasTexture(c, 2);
}

/**
 * Chunkier AMI-style digital jukebox — thicker body, shorter height (~half),
 * music notes + dollar signs so it reads as a real jukebox.
 * Local +Z faces into the room.
 */
function buildAmiJukebox(nightMats, lit) {
  const g = new THREE.Group();
  g.name = "amiJukebox";

  // Chunky chassis (~half prior height, real depth off the wall)
  const bodyW = 0.78;
  const bodyH = 0.95; // was ~1.85 — about half
  const bodyD = 0.36; // thick, not a flat panel
  const bodyY = 0.95; // mid-wall sit (on a short plinth)

  // Plinth / kick
  const plinth = box(bodyW + 0.08, 0.12, bodyD + 0.06, 0x12141a, {
    roughness: 0.55,
    metalness: 0.25,
  });
  plinth.position.set(0, 0.4, bodyD * 0.35);
  g.add(plinth);
  const kickLed = box(bodyW + 0.02, 0.03, 0.04, 0xff4fa8, {
    emissive: 0xff2a80,
    emissiveIntensity: 0.75,
  });
  kickLed.position.set(0, 0.47, bodyD * 0.7);
  lit(kickLed, 1.0, 0.55, { glimmerSpeed: 2.6 });
  g.add(kickLed);

  // Main body
  const body = box(bodyW, bodyH, bodyD, 0x0c0e16, { roughness: 0.35, metalness: 0.4 });
  body.position.set(0, bodyY, bodyD * 0.45);
  g.add(body);
  // Side wings (AMI Curve silhouette)
  for (const side of [-1, 1]) {
    const wing = box(0.1, bodyH * 0.92, bodyD * 0.85, 0x141820, {
      roughness: 0.4,
      metalness: 0.35,
    });
    wing.position.set(side * (bodyW * 0.5 + 0.02), bodyY, bodyD * 0.4);
    g.add(wing);
  }

  // Neon edge frame (front face)
  const frameCol = 0x40e0ff;
  const fz = bodyD * 0.85;
  for (const [w, h, y] of [
    [bodyW + 0.08, 0.045, bodyY + bodyH * 0.5],
    [bodyW + 0.08, 0.045, bodyY - bodyH * 0.5],
  ]) {
    const f = box(w, h, 0.05, frameCol, {
      emissive: frameCol,
      emissiveIntensity: 0.95,
      roughness: 0.25,
    });
    f.position.set(0, y, fz);
    lit(f, 1.2, 0.75, { glimmerSpeed: 2.8 });
    g.add(f);
  }
  for (const side of [-1, 1]) {
    const f = box(0.045, bodyH + 0.04, 0.05, frameCol, {
      emissive: frameCol,
      emissiveIntensity: 0.9,
      roughness: 0.25,
    });
    f.position.set(side * (bodyW * 0.5 + 0.02), bodyY, fz);
    lit(f, 1.15, 0.7, { glimmerSpeed: 3.0 });
    g.add(f);
  }
  // Magenta accent bar
  const accent = box(bodyW * 0.92, 0.035, 0.04, 0xff4fa8, {
    emissive: 0xff2a80,
    emissiveIntensity: 0.9,
  });
  accent.position.set(0, bodyY + 0.08, fz + 0.01);
  lit(accent, 1.15, 0.7, { glimmerSpeed: 3.4 });
  g.add(accent);

  // Main touchscreen (upper half of short body)
  const main = box(0.58, 0.42, 0.04, 0x061018, {
    emissive: 0x0a2848,
    emissiveIntensity: 0.8,
    roughness: 0.15,
    metalness: 0.2,
  });
  main.position.set(0, bodyY + 0.18, fz + 0.02);
  lit(main, 1.2, 0.75);
  g.add(main);
  const mainUi = new THREE.Mesh(
    new THREE.PlaneGeometry(0.54, 0.38),
    new THREE.MeshStandardMaterial({
      map: jukeScreenTex("main"),
      emissive: 0x2060a0,
      emissiveIntensity: 0.7,
      roughness: 0.3,
      flatShading: true,
    })
  );
  mainUi.position.set(0, bodyY + 0.18, fz + 0.05);
  g.add(mainUi);

  // Lower browse strip
  const strip = box(0.58, 0.2, 0.035, 0x0a1020, {
    emissive: 0x201030,
    emissiveIntensity: 0.75,
    roughness: 0.2,
  });
  strip.position.set(0, bodyY - 0.18, fz + 0.02);
  lit(strip, 1.05, 0.65);
  g.add(strip);
  const stripUi = new THREE.Mesh(
    new THREE.PlaneGeometry(0.54, 0.17),
    new THREE.MeshStandardMaterial({
      map: jukeScreenTex("strip"),
      emissive: 0x602040,
      emissiveIntensity: 0.55,
      roughness: 0.35,
      flatShading: true,
    })
  );
  stripUi.position.set(0, bodyY - 0.18, fz + 0.05);
  g.add(stripUi);

  // Bill acceptor with glowing $
  const bill = box(0.22, 0.1, 0.08, 0x1a1a22, { metalness: 0.35, roughness: 0.4 });
  bill.position.set(-0.18, bodyY - 0.36, fz + 0.02);
  g.add(bill);
  const billSlot = box(0.16, 0.025, 0.03, 0x050508);
  billSlot.position.set(-0.18, bodyY - 0.36, fz + 0.06);
  g.add(billSlot);
  const dollar = new THREE.Mesh(
    new THREE.PlaneGeometry(0.1, 0.08),
    new THREE.MeshStandardMaterial({
      map: labelTex("$", {
        w: 96,
        h: 80,
        bg: "#1a1a22",
        fg: "#3dd68c",
        size: 52,
        weight: 800,
        font: "fun",
      }),
      emissive: 0x20a050,
      emissiveIntensity: 0.65,
      roughness: 0.4,
      flatShading: true,
    })
  );
  dollar.position.set(-0.18, bodyY - 0.36, fz + 0.08);
  g.add(dollar);

  // Coin cup / change return
  const coin = box(0.14, 0.08, 0.06, 0x2a2a32, { metalness: 0.4, roughness: 0.4 });
  coin.position.set(0.2, bodyY - 0.36, fz + 0.02);
  g.add(coin);
  const coinHole = box(0.1, 0.03, 0.02, 0x050508);
  coinHole.position.set(0.2, bodyY - 0.36, fz + 0.055);
  g.add(coinHole);

  // Floating neon music notes on the side wings
  for (const [side, glyph, col, oy] of [
    [-1, "♪", 0x40e0ff, 0.22],
    [-1, "♫", 0xff4fa8, -0.12],
    [1, "♬", 0xffe14a, 0.18],
    [1, "$", 0x3dd68c, -0.15],
  ]) {
    const note = new THREE.Mesh(
      new THREE.PlaneGeometry(0.12, 0.14),
      new THREE.MeshStandardMaterial({
        map: labelTex(glyph, {
          w: 96,
          h: 96,
          bg: "#0c0e16",
          fg: col === 0x40e0ff ? "#40e0ff" : col === 0xff4fa8 ? "#ff4fa8" : col === 0xffe14a ? "#ffe14a" : "#3dd68c",
          size: 56,
          weight: 800,
          font: "fun",
        }),
        emissive: col,
        emissiveIntensity: 0.75,
        roughness: 0.4,
        flatShading: true,
        transparent: true,
      })
    );
    note.position.set(side * (bodyW * 0.5 + 0.06), bodyY + oy, fz + 0.02);
    note.rotation.y = side > 0 ? -0.35 : 0.35;
    lit(note, 1.0, 0.55, { glimmerSpeed: 2.8 + oy });
    g.add(note);
  }

  // EQ bars (beat-reactive look)
  for (let i = 0; i < 8; i++) {
    const h = 0.05 + (i % 4) * 0.035;
    const bar = box(0.04, h, 0.03, i % 2 ? 0x40e0ff : 0xff4fa8, {
      emissive: i % 2 ? 0x20c0ff : 0xff2a80,
      emissiveIntensity: 0.85,
    });
    bar.position.set(-0.16 + i * 0.045, bodyY - 0.48 + h * 0.5, fz + 0.01);
    lit(bar, 1.1, 0.65, { glimmerSpeed: 4 + i * 0.4, phase: i });
    g.add(bar);
  }

  // Brand marquee
  const brand = box(0.5, 0.1, 0.04, 0x1a1020, {
    emissive: 0xff4fa8,
    emissiveIntensity: 0.55,
  });
  brand.position.set(0, bodyY + bodyH * 0.42, fz + 0.02);
  lit(brand, 0.95, 0.55, { glimmerSpeed: 2.5 });
  g.add(brand);
  const brandTxt = new THREE.Mesh(
    new THREE.PlaneGeometry(0.46, 0.08),
    new THREE.MeshStandardMaterial({
      map: labelTex("♪ AMI JUKE $", {
        w: 320,
        h: 64,
        bg: "#1a1020",
        fg: "#ff80c0",
        size: 26,
        weight: 800,
        font: "fun",
      }),
      emissive: 0xff4fa8,
      emissiveIntensity: 0.5,
      roughness: 0.4,
      flatShading: true,
    })
  );
  brandTxt.position.set(0, bodyY + bodyH * 0.42, fz + 0.05);
  g.add(brandTxt);

  // Soft wash into the room
  const wash = new THREE.PointLight(0x40e0ff, 0.6, 3.8, 2);
  wash.position.set(0, bodyY + 0.1, bodyD + 0.35);
  g.add(wash);
  const wash2 = new THREE.PointLight(0xff4fa8, 0.35, 3.2, 2);
  wash2.position.set(0, bodyY - 0.2, bodyD + 0.25);
  g.add(wash2);
  return g;
}

/**
 * Simple club DJ booth (reference-style): dark riser, desk, decks + mixer,
 * laptop facing the DJ. Local +Z = audience; local −Z = stand space.
 */
function buildDjBooth(nightMats, lit, nightLights) {
  const g = new THREE.Group();
  g.name = "djBooth";

  // Compact platform
  const platform = box(1.7, 0.12, 1.35, 0x121018, { roughness: 0.6 });
  platform.position.set(0, 0.06, 0);
  g.add(platform);
  // Front kick glow
  const kick = box(1.65, 0.035, 0.04, 0x3060ff, {
    emissive: 0x2040c0,
    emissiveIntensity: 0.65,
  });
  kick.position.set(0, 0.05, 0.66);
  lit(kick, 0.9, 0.5, { glimmerSpeed: 2.2 });
  g.add(kick);

  // Front facade (solid booth face like the real dark console)
  const facade = box(1.65, 0.85, 0.1, 0x0e1016, { roughness: 0.5 });
  facade.position.set(0, 0.52, 0.62);
  g.add(facade);

  // Desk top
  const desk = box(1.55, 0.07, 0.7, 0x1a1a22, { roughness: 0.4, metalness: 0.25 });
  desk.position.set(0, 0.98, 0.15);
  g.add(desk);

  // Simple dual decks + mixer (keep readable, not overbuilt)
  const deckL = buildDjDeck(lit, 0x40e0ff);
  deckL.scale.setScalar(0.85);
  deckL.position.set(-0.45, 1.02, 0.18);
  g.add(deckL);
  const deckR = buildDjDeck(lit, 0xff4fa8);
  deckR.scale.setScalar(0.85);
  deckR.position.set(0.45, 1.02, 0.18);
  g.add(deckR);
  const mixer = buildDjMixer(lit);
  mixer.scale.setScalar(0.85);
  mixer.position.set(0, 1.02, 0.18);
  g.add(mixer);

  // Flat laptop on the desk facing the DJ (−Z)
  const lapBase = box(0.28, 0.015, 0.2, 0x1a1a22, { metalness: 0.45, roughness: 0.35 });
  lapBase.position.set(0, 1.08, -0.12);
  g.add(lapBase);
  const lapScr = box(0.28, 0.18, 0.012, 0x0a2848, {
    emissive: 0x186080,
    emissiveIntensity: 0.7,
    roughness: 0.25,
  });
  lapScr.position.set(0, 1.18, -0.2);
  lapScr.rotation.x = -0.4;
  lit(lapScr, 0.95, 0.55);
  g.add(lapScr);

  // Soft work light — cool but dim so decks read without a white bloom
  const boothLight = new THREE.PointLight(0x80c0ff, 0.28, 2.6, 2);
  boothLight.position.set(0, 1.7, 0.05);
  g.add(boothLight);
  if (nightLights) {
    nightLights.push({ light: boothLight, day: 0.14, night: 0.32 });
  }

  return g;
}

/**
 * Freestanding party cam / ring-light stand.
 * Local +Z = lens faces the subject (point at activation wall).
 */
function buildPartyCam(lit) {
  const g = new THREE.Group();
  g.name = "partyCam";

  // Weighted round base (won't tip when drunk)
  const base = cyl(0.22, 0.26, 0.06, 0x1a1a22, { roughness: 0.7, metalness: 0.25 }, 14);
  base.position.y = 0.03;
  g.add(base);
  const baseRing = cyl(0.18, 0.2, 0.03, 0x2a2a32, { metalness: 0.4, roughness: 0.45 }, 12);
  baseRing.position.y = 0.07;
  g.add(baseRing);

  // Telescoping pole
  const poleLow = cyl(0.035, 0.035, 0.85, 0x3a3e46, { metalness: 0.5, roughness: 0.4 }, 8);
  poleLow.position.y = 0.5;
  g.add(poleLow);
  const collar = cyl(0.05, 0.05, 0.06, 0x1a1a22, { metalness: 0.45, roughness: 0.4 }, 8);
  collar.position.y = 0.95;
  g.add(collar);
  const poleUp = cyl(0.028, 0.028, 0.55, 0x4a5060, { metalness: 0.55, roughness: 0.35 }, 8);
  poleUp.position.y = 1.25;
  g.add(poleUp);

  // Articulating head
  const head = box(0.12, 0.1, 0.1, 0x2a2a32, { metalness: 0.4, roughness: 0.4 });
  head.position.set(0, 1.58, 0.02);
  g.add(head);

  // Ring light as a true torus (not a solid white disc that washes the view)
  const ringY = 1.58;
  const ringZ = 0.14;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.22, 0.032, 10, 28),
    new THREE.MeshStandardMaterial({
      color: 0xe8eef4,
      emissive: 0xffe8d0,
      emissiveIntensity: 0.55,
      roughness: 0.35,
      metalness: 0.25,
      flatShading: false,
    })
  );
  // Torus lies in XY → hole faces ±Z (subject)
  ring.position.set(0, ringY, ringZ);
  lit(ring, 0.75, 0.4, { glimmerSpeed: 1.6 });
  g.add(ring);
  // Soft fill toward subject (kept mild so spawn never blows out white)
  const ringGlow = new THREE.PointLight(0xfff0e8, 0.28, 2.4, 2);
  ringGlow.position.set(0, ringY, 0.4);
  g.add(ringGlow);

  // iPad in the center — mirror-like live screen faces subjects (+Z)
  {
    const padW = 0.2;
    const padH = 0.28;
    // Dark chassis / back (faces pole, −Z)
    const chassis = box(padW, padH, 0.014, 0x0e0e12, { metalness: 0.55, roughness: 0.28 });
    chassis.position.set(0, ringY, ringZ - 0.012);
    g.add(chassis);
    // Bezel frame (thin)
    const bezel = box(padW * 0.98, padH * 0.98, 0.01, 0x1a1a1e, {
      metalness: 0.5,
      roughness: 0.3,
    });
    bezel.position.set(0, ringY, ringZ - 0.002);
    g.add(bezel);
    // Mirror-like glass — high metalness, dark tint (reads as a selfie mirror)
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(padW * 0.86, padH * 0.88),
      new THREE.MeshStandardMaterial({
        color: 0x1a2838,
        metalness: 0.92,
        roughness: 0.08,
        emissive: 0x0a1828,
        emissiveIntensity: 0.35,
        flatShading: false,
        side: THREE.FrontSide,
      })
    );
    glass.position.set(0, ringY, ringZ + 0.005);
    g.add(glass);
    // Live camera chrome overlay (faces +Z / subject — not the white back)
    const camUi = new THREE.Mesh(
      new THREE.PlaneGeometry(padW * 0.86, padH * 0.88),
      new THREE.MeshStandardMaterial({
        map: labelTex("● LIVE", {
          w: 256,
          h: 360,
          bg: "#0a1520",
          fg: "#60e8ff",
          size: 36,
          weight: 800,
          font: "fun",
        }),
        transparent: true,
        opacity: 0.72,
        emissive: 0x184868,
        emissiveIntensity: 0.4,
        roughness: 0.45,
        metalness: 0.15,
        flatShading: true,
        side: THREE.FrontSide,
        depthWrite: false,
      })
    );
    camUi.position.set(0, ringY, ringZ + 0.007);
    g.add(camUi);
    // Front-camera notch on the subject-facing bezel
    const notch = box(0.045, 0.012, 0.006, 0x0a0a0c, { metalness: 0.4, roughness: 0.35 });
    notch.position.set(0, ringY + padH * 0.4, ringZ + 0.006);
    g.add(notch);
    const frontCam = cyl(0.006, 0.006, 0.008, 0x111118, { metalness: 0.6, roughness: 0.25 }, 8);
    frontCam.rotation.x = Math.PI / 2;
    frontCam.position.set(0.012, ringY + padH * 0.4, ringZ + 0.01);
    g.add(frontCam);
    // Home indicator
    const home = box(0.06, 0.008, 0.004, 0x608090, { roughness: 0.4 });
    home.position.set(0, ringY - padH * 0.4, ringZ + 0.007);
    g.add(home);
  }

  // Clamp arms holding the iPad in the ring
  for (const side of [-1, 1]) {
    const arm = box(0.035, 0.08, 0.1, 0x2a2a32, { metalness: 0.4, roughness: 0.4 });
    arm.position.set(side * 0.12, ringY, 0.04);
    g.add(arm);
    const pad = box(0.04, 0.05, 0.03, 0x1a1a22, { metalness: 0.35, roughness: 0.45 });
    pad.position.set(side * 0.11, ringY, 0.1);
    g.add(pad);
  }

  // "SMILE" tag hanging off the pole
  const tag = box(0.16, 0.06, 0.02, 0xff4fa8, {
    emissive: 0xff2a80,
    emissiveIntensity: 0.65,
  });
  tag.position.set(0.14, 1.15, 0.02);
  lit(tag, 0.9, 0.55, { glimmerSpeed: 2.4 });
  g.add(tag);
  const smile = new THREE.Mesh(
    new THREE.PlaneGeometry(0.14, 0.05),
    new THREE.MeshStandardMaterial({
      map: labelTex("SMILE", { w: 160, h: 64, bg: "#ff2a80", fg: "#ffffff", size: 36 }),
      emissive: 0xff4fa8,
      emissiveIntensity: 0.4,
      roughness: 0.45,
      flatShading: true,
    })
  );
  smile.position.set(0.14, 1.15, 0.04);
  g.add(smile);

  // Status LED on head
  const led = cyl(0.02, 0.02, 0.02, 0x3dd68c, {
    emissive: 0x20c060,
    emissiveIntensity: 0.9,
  }, 6);
  led.position.set(0.05, 1.68, 0.06);
  lit(led, 0.7, 0.4, { glimmerSpeed: 5 });
  g.add(led);

  // Cable drape down the pole
  const cable = cyl(0.012, 0.012, 0.7, 0x1a1a1e, { roughness: 0.9 }, 6);
  cable.position.set(0.04, 0.7, -0.02);
  cable.rotation.z = 0.08;
  g.add(cable);

  return g;
}

/** Freestanding ATM — club-worn cash machine with fun Stacy's details. */
function buildAtm(nightMats, lit) {
  const g = new THREE.Group();
  g.name = "atm";
  // Pedestal base
  const base = box(0.72, 0.12, 0.5, 0x1a1a22, { roughness: 0.7 });
  base.position.y = 0.06;
  g.add(base);
  // Main chassis
  const body = box(0.68, 1.55, 0.42, 0x3a3e48, { roughness: 0.5, metalness: 0.18 });
  body.position.y = 0.9;
  g.add(body);
  // Upper hood / sun shield
  const hood = box(0.72, 0.14, 0.48, 0x1e222a, { roughness: 0.55, metalness: 0.2 });
  hood.position.set(0, 1.72, 0.02);
  g.add(hood);
  // Mini security dome on hood
  const dome = cyl(0.06, 0.07, 0.05, 0x1a1a22, { metalness: 0.5, roughness: 0.3 }, 10);
  dome.position.set(0.22, 1.82, 0.05);
  g.add(dome);
  const domeLens = cyl(0.035, 0.035, 0.02, 0x0a1020, {
    emissive: 0xff2020,
    emissiveIntensity: 0.55,
    roughness: 0.3,
  }, 8);
  domeLens.position.set(0.22, 1.85, 0.08);
  lit(domeLens, 0.6, 0.35, { glimmerSpeed: 6 });
  g.add(domeLens);

  // Brand header — Metro Financial
  const brand = box(0.66, 0.14, 0.06, 0x1a4a8a, {
    emissive: 0x1850a0,
    emissiveIntensity: 0.55,
    roughness: 0.4,
  });
  brand.position.set(0, 1.62, 0.22);
  lit(brand, 0.9, 0.5, { glimmerSpeed: 2.0 });
  g.add(brand);
  const brandLabel = new THREE.Mesh(
    new THREE.PlaneGeometry(0.6, 0.12),
    new THREE.MeshStandardMaterial({
      map: labelTex("METRO\nFINANCIAL", {
        w: 360,
        h: 120,
        bg: "#1a4a8a",
        fg: "#ffffff",
        size: 30,
        weight: 800,
        font: "fun",
        tracking: 0.04,
      }),
      emissive: 0x2060b0,
      emissiveIntensity: 0.4,
      roughness: 0.45,
      flatShading: true,
    })
  );
  brandLabel.position.set(0, 1.62, 0.26);
  g.add(brandLabel);

  // Screen bezel + glass
  const bezel = box(0.52, 0.42, 0.05, 0x12151a, { roughness: 0.4 });
  bezel.position.set(0, 1.28, 0.22);
  g.add(bezel);
  const screen = box(0.46, 0.36, 0.04, 0x0a2840, {
    emissive: 0x1a90d0,
    emissiveIntensity: 0.85,
    roughness: 0.22,
  });
  screen.position.set(0, 1.28, 0.25);
  lit(screen, 1.05, 0.65);
  g.add(screen);
  const ui = new THREE.Mesh(
    new THREE.PlaneGeometry(0.4, 0.3),
    new THREE.MeshStandardMaterial({
      map: labelTex("BUY A ROUND?", {
        w: 320,
        h: 200,
        bg: "#0a3860",
        fg: "#a0e8ff",
        size: 26,
      }),
      emissive: 0x2080c0,
      emissiveIntensity: 0.45,
      roughness: 0.4,
      flatShading: true,
    })
  );
  ui.position.set(0, 1.28, 0.28);
  g.add(ui);
  // Fee badge on screen corner
  const fee = new THREE.Mesh(
    new THREE.PlaneGeometry(0.16, 0.06),
    new THREE.MeshStandardMaterial({
      map: labelTex("$3.99", { w: 128, h: 48, bg: "#401028", fg: "#ff80c0", size: 28 }),
      emissive: 0xff4fa8,
      emissiveIntensity: 0.35,
      roughness: 0.5,
      flatShading: true,
    })
  );
  fee.position.set(0.14, 1.4, 0.29);
  g.add(fee);

  // Card slot + half-ejected card (someone mid-withdraw)
  const slotHousing = box(0.36, 0.1, 0.08, 0x1a1a22, { metalness: 0.25, roughness: 0.45 });
  slotHousing.position.set(0, 0.98, 0.24);
  g.add(slotHousing);
  const slot = box(0.3, 0.035, 0.04, 0x050508);
  slot.position.set(0, 0.98, 0.28);
  g.add(slot);
  const card = box(0.14, 0.02, 0.09, 0x9b6dff, {
    emissive: 0x6040a0,
    emissiveIntensity: 0.25,
    roughness: 0.4,
  });
  card.position.set(0.04, 0.98, 0.34);
  card.rotation.y = 0.12;
  g.add(card);
  // NFC / contactless pad glow
  const nfc = cyl(0.05, 0.05, 0.015, 0x40e0ff, {
    emissive: 0x20c0ff,
    emissiveIntensity: 0.7,
    roughness: 0.3,
  }, 10);
  nfc.rotation.x = Math.PI / 2;
  nfc.position.set(-0.18, 0.98, 0.29);
  lit(nfc, 0.85, 0.5, { glimmerSpeed: 3.5 });
  g.add(nfc);

  // Keypad nest with glowing keys
  const pad = box(0.36, 0.42, 0.06, 0x252830, { roughness: 0.55 });
  pad.position.set(0, 0.62, 0.23);
  g.add(pad);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 3; c++) {
      const isOk = r === 3 && c === 1;
      const key = box(0.08, 0.07, 0.025, isOk ? 0x3dd68c : 0x4a5060, {
        roughness: 0.45,
        metalness: 0.15,
        emissive: isOk ? 0x20a050 : 0x1a2030,
        emissiveIntensity: isOk ? 0.55 : 0.15,
      });
      key.position.set(-0.1 + c * 0.1, 0.78 - r * 0.1, 0.27);
      if (isOk) lit(key, 0.65, 0.35, { glimmerSpeed: 2.8 });
      g.add(key);
    }
  }
  // Worn "ENTER PIN" strip
  const pinStrip = new THREE.Mesh(
    new THREE.PlaneGeometry(0.28, 0.04),
    new THREE.MeshStandardMaterial({
      map: labelTex("ENTER PIN", { w: 200, h: 40, bg: "#1a1a22", fg: "#80c0ff", size: 22 }),
      emissive: 0x2060a0,
      emissiveIntensity: 0.25,
      roughness: 0.55,
      flatShading: true,
    })
  );
  pinStrip.position.set(0, 0.88, 0.27);
  g.add(pinStrip);

  // Receipt slot + long receipt hanging out
  const receipt = box(0.26, 0.04, 0.05, 0x1a1a22);
  receipt.position.set(0, 0.32, 0.24);
  g.add(receipt);
  const paper = box(0.18, 0.22, 0.01, 0xf4f0e4, { roughness: 0.92, castShadow: false });
  paper.position.set(0.02, 0.2, 0.28);
  paper.rotation.x = 0.15;
  paper.rotation.z = 0.08;
  g.add(paper);
  const receiptTxt = new THREE.Mesh(
    new THREE.PlaneGeometry(0.14, 0.08),
    new THREE.MeshStandardMaterial({
      map: labelTex("TIP THE DJ", { w: 160, h: 64, bg: "#f4f0e4", fg: "#401028", size: 20 }),
      roughness: 0.95,
      flatShading: true,
    })
  );
  receiptTxt.position.set(0.02, 0.22, 0.29);
  receiptTxt.rotation.x = 0.15;
  receiptTxt.rotation.z = 0.08;
  g.add(receiptTxt);

  // Side accent LEDs (cyan + pink club vibe)
  for (const side of [-1, 1]) {
    const col = side < 0 ? 0x40e0ff : 0xff4fa8;
    const stripe = box(0.04, 1.35, 0.03, col, {
      emissive: col,
      emissiveIntensity: 0.6,
    });
    stripe.position.set(side * 0.35, 0.9, 0.05);
    lit(stripe, 0.85, 0.5, { glimmerSpeed: 2.5 + side * 0.2 });
    g.add(stripe);
  }

  // Cash door + "OUT OF $1s" sticky note
  const cashDoor = box(0.4, 0.18, 0.04, 0x2a2e38, { metalness: 0.2, roughness: 0.5 });
  cashDoor.position.set(0, 0.22, 0.22);
  g.add(cashDoor);
  const sticky = box(0.16, 0.12, 0.015, 0xffe14a, { roughness: 0.85 });
  sticky.position.set(0.14, 0.55, 0.25);
  sticky.rotation.z = -0.12;
  g.add(sticky);
  const stickyTxt = new THREE.Mesh(
    new THREE.PlaneGeometry(0.14, 0.1),
    new THREE.MeshStandardMaterial({
      map: labelTex("OUT OF $1s", { w: 160, h: 96, bg: "#ffe14a", fg: "#1a1020", size: 22 }),
      roughness: 0.9,
      flatShading: true,
    })
  );
  stickyTxt.position.set(0.14, 0.55, 0.26);
  stickyTxt.rotation.z = -0.12;
  g.add(stickyTxt);

  // Pride heart sticker on the side
  const pride = box(0.08, 0.1, 0.02, 0xff4fa8, {
    emissive: 0xff2a80,
    emissiveIntensity: 0.4,
  });
  pride.position.set(0.36, 1.15, 0.05);
  lit(pride, 0.6, 0.35);
  g.add(pride);
  // "CASH 4 BASS" side decal
  const sideDecal = new THREE.Mesh(
    new THREE.PlaneGeometry(0.35, 0.08),
    new THREE.MeshStandardMaterial({
      map: labelTex("CASH 4 BASS", { w: 256, h: 64, bg: "#2a2e38", fg: "#40e0ff", size: 26 }),
      emissive: 0x2080a0,
      emissiveIntensity: 0.3,
      roughness: 0.5,
      flatShading: true,
    })
  );
  sideDecal.position.set(-0.35, 1.2, 0.05);
  sideDecal.rotation.y = -Math.PI / 2;
  g.add(sideDecal);

  // Soft screen wash
  const glow = new THREE.PointLight(0x50b0ff, 0.5, 2.8, 2);
  glow.position.set(0, 1.25, 0.55);
  g.add(glow);
  const pinkGlow = new THREE.PointLight(0xff4fa8, 0.25, 2.2, 2);
  pinkGlow.position.set(0, 1.55, 0.4);
  g.add(pinkGlow);
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

  // Four shelf tiers. Top shelf is intentionally empty of bottles.
  // Facing the back bar: RIGHT = −Z (east / patio). Glassware lives there.
  const shelfCols = [
    0xc41e3a, 0x2a5a3a, 0xf0e8d0, 0x3a3a8a, 0xe8a040, 0x1a1a1e,
    0x8b0000, 0x4a7040, 0xd4af37, 0x5a2a6a, 0xc0c0c0, 0x402010,
    0xff6a3a, 0x80c0ff, 0x2a8a5a, 0x6a2a8a,
  ];
  const shelfZ0 = -2.45; // east / right end
  const shelfZ1 = 2.55; // west / left end
  const shelfSpan = shelfZ1 - shelfZ0;
  // Glassware occupies the right ~30% of each stocked shelf
  const glassZoneEnd = shelfZ0 + shelfSpan * 0.32;

  for (let tier = 0; tier < 4; tier++) {
    const sy = 1.22 + tier * 0.38;
    const shelf = box(0.32, 0.055, 5.2, WOOD_DARK, { roughness: 0.65 });
    shelf.position.set(shelfX, sy, 0.1);
    add(shelf);
    const led = neonBox(0.035, 0.028, 5.0, [0xff4fa8, 0x40e0ff, 0x9b6dff, 0x3dd68c][tier], 0.85);
    led.position.set(shelfX - 0.18, sy - 0.04, 0.1);
    lit(led, 1.2, 0.8, { glimmerSpeed: 2.0 + tier * 0.25 });
    add(led);

    // Top shelf (tier 3): no bottles — open space under the neon diamond
    if (tier === 3) continue;

    // Right side — cartoony glassware (wine, rocks, flutes, coupes, pints)
    const glassCount = 9;
    for (let i = 0; i < glassCount; i++) {
      const kind = [0, 1, 2, 3, 4, 0, 1, 2, 3][i];
      const gl = buildGlass(kind);
      const z = shelfZ0 + 0.12 + i * ((glassZoneEnd - shelfZ0 - 0.2) / (glassCount - 1));
      // Slight stagger front/back row
      const row = i % 2;
      gl.position.set(shelfX + 0.02 - row * 0.08, sy + 0.03, z);
      gl.scale.setScalar(0.95 + (i % 3) * 0.05);
      add(gl);
    }

    // Left + center — round cartoony bottles (two staggered rows)
    for (let row = 0; row < 2; row++) {
      const count = 14;
      for (let i = 0; i < count; i++) {
        const h = 0.2 + ((i + tier + row) % 5) * 0.03;
        const r = 0.032 + ((i + row) % 3) * 0.007;
        const kind = (i + tier + row) % 4;
        const b = buildBottle(
          shelfCols[(i + tier * 5 + row * 3) % shelfCols.length],
          h,
          r,
          kind
        );
        const z =
          glassZoneEnd + 0.12 + i * ((shelfZ1 - glassZoneEnd - 0.2) / (count - 1));
        b.position.set(shelfX + 0.04 - row * 0.1, sy + 0.02, z);
        add(b);
      }
    }
  }

  // Stacy's diamond neon — smaller, resting ON the empty top shelf (not behind it)
  {
    const topShelfY = 1.22 + 3 * 0.38; // tier 3 surface
    const dScale = 0.68;
    const faceH = 0.72;
    const barDiamond = buildDiamondNeon(nightMats);
    barDiamond.rotation.y = -Math.PI / 2;
    barDiamond.scale.setScalar(dScale);
    // Sit on top shelf, proud toward the aisle so bottles don't hide it
    barDiamond.position.set(
      shelfX - 0.05,
      topShelfY + 0.04 + (faceH * 0.5) * dScale,
      0.15
    );
    add(barDiamond);
    const barNeonWash = new THREE.PointLight(0xff4fa8, 0.95, 4.5, 2);
    barNeonWash.position.set(shelfX - 0.35, topShelfY + 0.35, 0.15);
    add(barNeonWash);
    nightLights.push({ light: barNeonWash, day: 0.55, night: 1.1 });
  }

  // Speed rail / well — bartender side of the aisle
  const well = box(0.5, 0.35, 2.6, 0x2a2a30, { metalness: 0.3, roughness: 0.4 });
  well.position.set(railX, 1.0, 0.2);
  add(well);
  for (let i = 0; i < 12; i++) {
    const b = buildBottle(
      shelfCols[i % shelfCols.length],
      0.2 + (i % 3) * 0.025,
      0.038,
      i % 4
    );
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

  // (Beer drafts live at the EAST end of the bar / walk-in corner — not here.)

  // Hanging stem rack above the glassware end (right / east side of bar)
  for (let i = 0; i < 8; i++) {
    const hang = buildGlass(i % 2 === 0 ? 0 : 2); // wine + flutes upside-ish
    hang.rotation.x = Math.PI; // hang stems-up from the rack
    hang.position.set(shelfX - 0.18, 2.72, shelfZ0 + 0.2 + i * 0.16);
    hang.scale.setScalar(0.9);
    add(hang);
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
  /** Floor-plan solids for first-person collision (AABB in world XZ). */
  const colliders = [];
  /** Register a solid rectangle the player cannot walk through. */
  const solid = (xMin, xMax, zMin, zMax) => {
    if (!(xMax > xMin) || !(zMax > zMin)) return;
    colliders.push({ xMin, xMax, zMin, zMax });
  };
  /** Centered solid footprint. */
  const solidAt = (cx, cz, halfX, halfZ) =>
    solid(cx - halfX, cx + halfX, cz - halfZ, cz + halfZ);

  const add = (mesh) => {
    g.add(mesh);
    return mesh;
  };
  const lit = (mesh, nightI = 0.85, dayI = 0.55, opts = {}) => {
    trackNightMesh(nightMats, mesh, nightI, dayI, { glimmer: true, ...opts });
    return mesh;
  };

  // ── Layout anchors (stage / pit) — computed early so the main floor can
  // leave a real hole for The Pit (otherwise a "sunken" slab is just under
  // solid floor and only the raised curbs read).
  // railZ is west of room center (+Z). Facing the north wall, +Z is LEFT.
  const railZ = 2.58; // nudged further left (was 2.42)
  const railNearWallX = -halfW + 0.35 + 0.3;
  const railColXs = [railNearWallX, -2.4, -0.35];
  const curtainZ = railZ - 0.38;
  const stageH = 0.3;
  const stageDepth = 1.05;
  const rodX0 = railColXs[0] - 0.1;
  const rodX1 = railColXs[2] + 0.15;
  const stageLen = rodX1 - rodX0;
  const stageZ = curtainZ - 0.22 - stageDepth * 0.5;
  const stageX = rodX0 + stageLen * 0.5;
  // The Pit — true step-down in front of the stage
  // Smaller gap = pit sits closer to the stage apron
  const pitGap = 0.1;
  const pitDepth = 0.34; // ~13" drop — clearly a step, not a curb
  const pitLen = stageLen;
  const pitSpan = 2.35;
  const pitXMin = -halfW + WALL * 0.5 + 0.02;
  const pitXMax = pitXMin + pitLen;
  const pitX = pitXMin + pitLen * 0.5;
  const stageEastFace = stageZ - stageDepth * 0.5;
  const pitWestFace = stageEastFace - pitGap; // pit edge nearest stage
  const pitEastFace = pitWestFace - pitSpan;
  const pitZ = (pitWestFace + pitEastFace) * 0.5;
  const FLOOR_THICK = 0.08;
  const FLOOR_TOP = 0.08; // top of main floor slab
  const PIT_FLOOR_Y = FLOOR_TOP - pitDepth; // top surface of sunken dance floor

  // ── Shell: main floor with a HOLE for The Pit ─────────────────────
  const addFloorSlab = (x0, x1, z0, z1) => {
    const w = x1 - x0;
    const d = z1 - z0;
    if (w < 0.04 || d < 0.04) return;
    const slab = box(w, FLOOR_THICK, d, FLOOR, { roughness: 0.9 });
    slab.position.set((x0 + x1) * 0.5, FLOOR_TOP - FLOOR_THICK * 0.5, (z0 + z1) * 0.5);
    add(slab);
  };
  // Room extents
  const fx0 = -halfW;
  const fx1 = halfW;
  const fz0 = -halfD;
  const fz1 = halfD;
  // Four slabs around the pit rectangle [pitXMin..pitXMax] × [pitEastFace..pitWestFace]
  addFloorSlab(fx0, fx1, pitWestFace, fz1); // west of pit (toward street / rail)
  addFloorSlab(fx0, fx1, fz0, pitEastFace); // east of pit (toward patio)
  addFloorSlab(fx0, pitXMin, pitEastFace, pitWestFace); // north strip (usually tiny / wall)
  addFloorSlab(pitXMax, fx1, pitEastFace, pitWestFace); // south of pit (into the room)

  // Wood planks — skip any that fall inside the pit hole
  for (let i = 0; i < 22; i++) {
    const pz = -halfD + 0.3 + i * 0.4;
    const plankHalf = 0.09;
    const overlapsPitZ = pz + plankHalf > pitEastFace && pz - plankHalf < pitWestFace;
    if (overlapsPitZ) {
      // Two planks flanking the pit in X
      const leftW = pitXMin - fx0;
      if (leftW > 0.15) {
        const plank = box(leftW * 0.98, 0.01, 0.18, i % 2 ? 0x4a3428 : 0x3a2a1e, {
          roughness: 0.92,
          castShadow: false,
        });
        plank.position.set((fx0 + pitXMin) * 0.5, FLOOR_TOP + 0.005, pz);
        add(plank);
      }
      const rightW = fx1 - pitXMax;
      if (rightW > 0.15) {
        const plank = box(rightW * 0.98, 0.01, 0.18, i % 2 ? 0x4a3428 : 0x3a2a1e, {
          roughness: 0.92,
          castShadow: false,
        });
        plank.position.set((pitXMax + fx1) * 0.5, FLOOR_TOP + 0.005, pz);
        add(plank);
      }
    } else {
      const plank = box(RW * 0.98, 0.01, 0.18, i % 2 ? 0x4a3428 : 0x3a2a1e, {
        roughness: 0.92,
        castShadow: false,
      });
      plank.position.set(0, FLOOR_TOP + 0.005, pz);
      add(plank);
    }
  }

  // Interior wall finishes (photo-matched materials):
  //   WEST  (+Z, front)  — exposed brick
  //   EAST  (−Z, patio)  — purple paint
  //   NORTH (−X, lot)    — exposed brick
  //   SOUTH (+X, bar)    — dark purple (full wall behind bar shelves)
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
    // Full dark-purple wall behind the bar / liquor shelves —
    // leave a real HOLE for the elevated manager lookout (no solid fill).
    {
      const winBot = LOOKOUT_Y - LOOKOUT_H * 0.5;
      const winL = LOOKOUT_Z - LOOKOUT_W * 0.5;
      const winR = LOOKOUT_Z + LOOKOUT_W * 0.5;
      const botH = Math.min(EAVE_H, Math.max(0.2, winBot));
      // Solid band under the lookout sill (full wall width)
      const southBot = wallMesh(WALL, botH, RD, "purpleDark");
      southBot.position.set(halfW, botH * 0.5, 0);
      add(southBot);
      // Flanks above the sill up to the eave (window sits mostly in the gable)
      if (EAVE_H > botH + 0.04) {
        const topH = EAVE_H - botH;
        const leftLen = winL - (-halfD);
        if (leftLen > 0.08) {
          const left = wallMesh(WALL, topH, leftLen, "purpleDark");
          left.position.set(halfW, botH + topH * 0.5, -halfD + leftLen * 0.5);
          add(left);
        }
        const rightLen = halfD - winR;
        if (rightLen > 0.08) {
          const right = wallMesh(WALL, topH, rightLen, "purpleDark");
          right.position.set(halfW, botH + topH * 0.5, winR + rightLen * 0.5);
          add(right);
        }
      }
    }
    const barWallWash = new THREE.PointLight(0x7040a0, 0.4, 9, 2);
    barWallWash.position.set(halfW - 1.5, 2.3, 0.15);
    add(barWallWash);
    nightLights.push({ light: barWallWash, day: 0.25, night: 0.5 });
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

    // Exposed common rafters — pairs from ridge down each slope (vault only;
    // no east–west collar ties / horizontal cross-beams)
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
    }

    // Gable triangles — brick N, dark purple S (matches bar wall).
    // South gable is cut open for the manager lookout so the hole is real, not a dark TV slab.
    const lookBot = LOOKOUT_Y - LOOKOUT_H * 0.5;
    const lookTop = LOOKOUT_Y + LOOKOUT_H * 0.5;
    const lookL = LOOKOUT_Z - LOOKOUT_W * 0.5;
    const lookR = LOOKOUT_Z + LOOKOUT_W * 0.5;
    for (const x of [-halfW, halfW]) {
      const gableKind = x < 0 ? "brick" : "purpleDark";
      const cutLookout = x > 0; // south only
      const steps = 10;
      for (let i = 0; i < steps; i++) {
        const t0 = i / steps;
        const t1 = (i + 1) / steps;
        const y0 = EAVE_H + rise * t0;
        const y1 = EAVE_H + rise * t1;
        const midY = (y0 + y1) * 0.5;
        const bandH = Math.max(0.08, y1 - y0 + 0.02);
        const zW = RD * (1 - (t0 + t1) * 0.5) + 0.15;
        const placeBand = (depth, zCenter, yCenter, h) => {
          if (depth < 0.06 || h < 0.04) return;
          const slab = wallMesh(WALL + 0.02, h, depth, gableKind);
          if (slab.material?.map) {
            slab.material.map = slab.material.map.clone();
            slab.material.map.repeat.set(gableKind === "brick" ? 2.2 : 3, 0.35);
          }
          slab.position.set(x, yCenter, zCenter);
          add(slab);
        };
        // North gable (or south bands that miss the lookout) stay solid
        if (!cutLookout || y1 <= lookBot + 0.02 || y0 >= lookTop - 0.02) {
          placeBand(zW, 0, midY, bandH);
          continue;
        }
        // South band overlaps lookout — flanks + strips above/below the hole
        const halfZW = zW * 0.5;
        const leftDepth = lookL - (-halfZW);
        if (leftDepth > 0.08) placeBand(leftDepth, -halfZW + leftDepth * 0.5, midY, bandH);
        const rightDepth = halfZW - lookR;
        if (rightDepth > 0.08) placeBand(rightDepth, lookR + rightDepth * 0.5, midY, bandH);
        // Fill below the sill inside the window Z column
        const belowTop = Math.min(y1, lookBot);
        if (belowTop > y0 + 0.03) {
          const h = belowTop - y0;
          placeBand(LOOKOUT_W + 0.04, LOOKOUT_Z, y0 + h * 0.5, h);
        }
        // Fill above the head inside the window Z column
        const aboveBot = Math.max(y0, lookTop);
        if (y1 > aboveBot + 0.03) {
          const h = y1 - aboveBot;
          placeBand(LOOKOUT_W + 0.04, LOOKOUT_Z, aboveBot + h * 0.5, h);
        }
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

    // (No king posts under the ridge — they hung empty with nothing on them.)
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
  // Three on the railing line. One free column further into the room.
  // (Removed the free column that sat in front of the cathedral window.)
  for (const [x, z] of [
    [railColXs[0], railZ],
    [railColXs[1], railZ],
    [railColXs[2], railZ],
    [0.35, 1.55],
  ]) {
    const topY = roofYAt(z) - 0.12;
    const col = buildTwistedColumn(topY);
    col.position.set(x, 0, z);
    add(col);
    solidAt(x, z, 0.16, 0.16);
  }

  // Stage curtain rod just EAST (−Z) of the three railing columns — black
  // drape pair like a proscenium. Performance stage sits east of the curtains.
  {
    const rodY = roofYAt(curtainZ) - 0.22;
    const curtainH = rodY - 0.15;
    const openGap = 0.32;
    const curtains = buildStageCurtains(stageLen, curtainH, {
      openGap,
      folds: 8,
    });
    curtains.position.set(rodX0, rodY, curtainZ);
    add(curtains);
    // Two drape panels with a walkable center gap
    {
      const panelW = (stageLen - openGap) * 0.5;
      solid(rodX0, rodX0 + panelW, curtainZ - 0.08, curtainZ + 0.1);
      solid(rodX0 + panelW + openGap, rodX0 + stageLen, curtainZ - 0.08, curtainZ + 0.1);
    }

    // Performance platform (drag / karaoke) — ~1 ft high, as long as the
    // curtains, not too deep (narrow apron east of the drape line).
    // Stage sits on the MAIN floor (not in the pit).
    const riser = box(stageLen, stageH, stageDepth, 0x1a1218, { roughness: 0.75 });
    riser.position.set(stageX, FLOOR_TOP + stageH * 0.5, stageZ);
    add(riser);
    solidAt(stageX, stageZ, stageLen * 0.5, stageDepth * 0.5);
    const deck = box(stageLen + 0.04, 0.04, stageDepth + 0.04, 0x2a1e28, {
      roughness: 0.55,
      metalness: 0.08,
    });
    deck.position.set(stageX, FLOOR_TOP + stageH + 0.02, stageZ);
    add(deck);
    const lip = box(stageLen + 0.06, 0.06, 0.06, 0x3a2a38, { roughness: 0.6 });
    lip.position.set(stageX, FLOOR_TOP + stageH + 0.03, stageEastFace - 0.02);
    add(lip);
    const stageWash = new THREE.PointLight(0xff80c0, 0.55, 5, 2);
    stageWash.position.set(stageX, FLOOR_TOP + stageH + 0.8, stageZ);
    add(stageWash);
    nightLights.push({ light: stageWash, day: 0.35, night: 0.7 });
    g.userData.performanceStage = {
      x: stageX,
      y: FLOOR_TOP + stageH,
      z: stageZ,
      len: stageLen,
      depth: stageDepth,
    };

    // ── The Pit ────────────────────────────────────────────────────
    // TRUE sunken dance floor: hole already cut in the main floor above.
    // Floor surface at PIT_FLOOR_Y; vertical risers up to FLOOR_TOP only
    // (no curb sticking above the main floor — that read as a ledge).
    {
      const pitFloorThick = 0.07;
      // Sunken dance floor surface
      const pitFloor = box(pitLen, pitFloorThick, pitSpan, 0x141018, {
        roughness: 0.38,
        metalness: 0.14,
      });
      pitFloor.position.set(pitX, PIT_FLOOR_Y - pitFloorThick * 0.5, pitZ);
      add(pitFloor);

      // Vertical step faces — tops flush with main floor, bottoms at pit floor.
      // Inset slightly so the floor nosing reads as a step lip, not a wall.
      const riserH = pitDepth;
      const riserY = PIT_FLOOR_Y + riserH * 0.5;
      const faceCol = 0x241820;
      // South face (+X) — open step into the room
      const faceS = box(0.08, riserH, pitSpan, faceCol, { roughness: 0.78 });
      faceS.position.set(pitXMax - 0.04, riserY, pitZ);
      add(faceS);
      // East face (−Z, far from stage)
      const faceE = box(pitLen, riserH, 0.08, faceCol, { roughness: 0.78 });
      faceE.position.set(pitX, riserY, pitEastFace + 0.04);
      add(faceE);
      // West face (+Z, toward stage) — 10" gap of main floor beyond this
      const faceW = box(pitLen, riserH, 0.08, faceCol, { roughness: 0.78 });
      faceW.position.set(pitX, riserY, pitWestFace - 0.04);
      add(faceW);
      // North: flush with cathedral wall — exposed wall acts as the step

      // Thin metal nosing on the main-floor edge (flush, not a raised curb)
      const noseH = 0.03;
      const noseY = FLOOR_TOP - noseH * 0.5 + 0.005;
      const noseCol = 0x3a2a38;
      const noseS = box(0.07, noseH, pitSpan + 0.04, noseCol, {
        roughness: 0.45,
        metalness: 0.25,
      });
      noseS.position.set(pitXMax, noseY, pitZ);
      add(noseS);
      const noseE = box(pitLen + 0.06, noseH, 0.07, noseCol, {
        roughness: 0.45,
        metalness: 0.25,
      });
      noseE.position.set(pitX, noseY, pitEastFace);
      add(noseE);
      const noseW = box(pitLen + 0.06, noseH, 0.07, noseCol, {
        roughness: 0.45,
        metalness: 0.25,
      });
      noseW.position.set(pitX, noseY, pitWestFace);
      add(noseW);

      // Soft shadow strip at the base of each riser (reads as depth)
      for (const [px, pz, pw, pd] of [
        [pitXMax - 0.06, pitZ, 0.1, pitSpan * 0.92],
        [pitX, pitEastFace + 0.06, pitLen * 0.92, 0.1],
        [pitX, pitWestFace - 0.06, pitLen * 0.92, 0.1],
      ]) {
        const shadow = box(pw, 0.015, pd, 0x08060a, {
          roughness: 0.95,
          castShadow: false,
        });
        shadow.position.set(px, PIT_FLOOR_Y + 0.01, pz);
        add(shadow);
      }

      // Glow tiles on the pit floor (on top of sunken surface)
      const tileCols = [0xff4fa8, 0x40e0ff, 0x9b6dff, 0x3dd68c, 0xffe14a];
      const cols = 5;
      const rows = 3;
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const tw = (pitLen - 0.25) / cols;
          const td = (pitSpan - 0.25) / rows;
          const tile = box(tw * 0.86, 0.025, td * 0.86, 0x1a1420, {
            emissive: tileCols[(i + j) % tileCols.length],
            emissiveIntensity: 0.32,
          });
          tile.position.set(
            pitXMin + 0.14 + (i + 0.5) * tw,
            PIT_FLOOR_Y + 0.015,
            pitEastFace + 0.14 + (j + 0.5) * td
          );
          lit(tile, 0.55, 0.28, { glimmerSpeed: 1.4 + i * 0.15, phase: i + j });
          add(tile);
        }
      }

      // Ambient dance lights over The Pit
      const danceLights = [];
      for (let i = 0; i < 4; i++) {
        const col = [0xff4fa8, 0x40e0ff, 0x9b6dff, 0x3dd68c][i];
        const dl = new THREE.PointLight(col, 0.75, 6, 2);
        dl.position.set(pitX, 2.5, pitZ);
        add(dl);
        danceLights.push(dl);
        flashLights.push({ light: dl });
        nightLights.push({ light: dl, day: 0.4, night: 0.9 });
      }
      g.userData.danceLights = danceLights;
      g.userData.danceCenter = { x: pitX, z: pitZ };
      g.userData.thePit = {
        x: pitX,
        z: pitZ,
        xMin: pitXMin,
        xMax: pitXMax,
        zMin: pitEastFace,
        zMax: pitWestFace,
        len: pitLen,
        span: pitSpan,
        depth: pitDepth,
        floorY: PIT_FLOOR_Y,
        gap: pitGap,
      };

      const danceKey = new THREE.PointLight(0xff80c0, 1.05, 8, 2);
      danceKey.position.set(pitX, 2.55, pitZ);
      add(danceKey);
      nightLights.push({ light: danceKey, day: 0.55, night: 1.15 });

      // Under-lip LEDs along the step (read depth from the room)
      const stepLed = box(pitLen * 0.92, 0.025, 0.04, 0xff4fa8, {
        emissive: 0xff2a80,
        emissiveIntensity: 0.55,
      });
      stepLed.position.set(pitX, FLOOR_TOP - 0.04, pitWestFace - 0.02);
      lit(stepLed, 0.7, 0.35, { glimmerSpeed: 2.2 });
      add(stepLed);
      const stepLedS = box(0.04, 0.025, pitSpan * 0.9, 0x40e0ff, {
        emissive: 0x20c0ff,
        emissiveIntensity: 0.5,
      });
      stepLedS.position.set(pitXMax - 0.02, FLOOR_TOP - 0.04, pitZ);
      lit(stepLedS, 0.65, 0.32, { glimmerSpeed: 2.4 });
      add(stepLedS);
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // WEST (+Z) wall — face the wall (look toward +Z / street).
  // When facing +Z: screen LEFT = +X (south / bar), screen RIGHT = −X (north).
  //
  // LEFT → RIGHT as you look at the wall:
  //   1) activation wall (green + neon)
  //   2) ATM
  //   3) wooden double doors
  // (World X decreases left→right: activation south, doors more north.)
  // ══════════════════════════════════════════════════════════════════
  {
    const z = halfD - 0.1;
    const dartTex = dartboardTex();
    // Far RIGHT when facing the wall (north end) — dart cabinets
    for (const [x, s] of [
      [-4.4, 1],
      [-3.55, 0.95],
    ]) {
      const cabinet = box(0.6 * s, 1.45 * s, 0.3, BLACK);
      cabinet.position.set(x, 0.9 * s, z - 0.15);
      add(cabinet);
      solidAt(x, z - 0.15, 0.28 * s, 0.16);
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

    // --- L→R facing west wall: Activation → ATM → Wooden doors ---
    // Screen left = +X, so place activation highest X, doors lowest X.
    const foliageW = 2.15;
    const leafW = 0.95;
    const leafH = 2.25;
    const totalW = leafW * 2 + 0.12; // ~2.02
    const atmHalfW = 0.38;

    // Doors on the RIGHT (more −X / north of the trio)
    const doorCx = -0.85;
    const doorLeft = doorCx - totalW * 0.5;
    const doorRight = doorCx + totalW * 0.5;

    // ATM in the middle (between doors and activation)
    const atmX = doorRight + 0.12 + atmHalfW; // just south of doors

    // Activation wall on the LEFT (more +X / south of ATM)
    const foliageX = atmX + atmHalfW + 0.14 + foliageW * 0.5;

    // 1) Activation wall (LEFT when facing wall)
    const foliage = buildFoliageWall(foliageW, 2.45);
    foliage.position.set(foliageX, 1.55, z - 0.04);
    foliage.rotation.y = Math.PI;
    add(foliage);
    // Thin solid so you can't walk into the green wall
    solidAt(foliageX, z - 0.1, foliageW * 0.46, 0.14);

    const diamond = buildDiamondNeon(nightMats);
    diamond.position.set(foliageX, 1.85, z - 0.22);
    diamond.rotation.y = Math.PI;
    add(diamond);
    g.userData.diamondNeon = diamond;
    const neonWash = new THREE.PointLight(0xff4fa8, 1.85, 7.5, 2);
    neonWash.position.set(foliageX, 1.85, z - 1.15);
    add(neonWash);
    nightLights.push({ light: neonWash, day: 1.1, night: 2.0 });
    g.userData.diamondLight = neonWash;
    const neonBounce = new THREE.PointLight(0xff80c0, 0.7, 5, 2);
    neonBounce.position.set(foliageX, 0.9, z - 0.9);
    add(neonBounce);
    nightLights.push({ light: neonBounce, day: 0.4, night: 0.85 });
    g.userData.diamondBounce = neonBounce;

    // Vertical ad TV — LEFT of activation wall (further +X / south when facing wall)
    {
      const adMaps = [0, 1, 2, 3, 4, 5].map((i) => barAdTex(i));
      const adTv = buildFlatScreen(lit, {
        w: 0.55,
        h: 1.05,
        vertical: true,
        map: adMaps[0],
        emissive: 0x302050,
      });
      // Face into room (−Z)
      adTv.rotation.y = Math.PI;
      const adX = foliageX + foliageW * 0.5 + 0.42;
      adTv.position.set(adX, 1.7, z - 0.14);
      add(adTv);
      g.userData.tvScreens = g.userData.tvScreens || [];
      g.userData.tvScreens.push(adTv.userData.screen, adTv.userData.slab);
      g.userData.adScreens = g.userData.adScreens || [];
      g.userData.adScreens.push({ screen: adTv.userData.screen, maps: adMaps, idx: 0 });
      // Soft wash from the ad panel
      const adLite = new THREE.PointLight(0x9b6dff, 0.35, 3.5, 2);
      adLite.position.set(adX, 1.7, z - 0.7);
      add(adLite);
      nightLights.push({ light: adLite, day: 0.2, night: 0.45 });
    }

    // 2) ATM between activation wall and wooden doors (face into room = −Z)
    const atm = buildAtm(nightMats, lit);
    atm.rotation.y = Math.PI;
    atm.position.set(atmX, 0, z - 0.28);
    add(atm);
    solidAt(atmX, z - 0.28, 0.36, 0.26);

    // 3) Wooden double doors (RIGHT when facing wall)
    const doorFrame = box(totalW + 0.22, 2.55, 0.18, WOOD_DARK);
    doorFrame.position.set(doorCx, 1.3, z - 0.04);
    add(doorFrame);
    // Doors stay walkable at spawn (they're the entrance) — no solid on leaves.
    const header = box(totalW + 0.28, 0.16, 0.2, WOOD_COL, { roughness: 0.8 });
    header.position.set(doorCx, 2.48, z - 0.08);
    add(header);
    for (const side of [-1, 1]) {
      const jamb = box(0.12, leafH + 0.15, 0.14, WOOD_COL, { roughness: 0.82 });
      jamb.position.set(doorCx + side * (totalW * 0.5 + 0.02), 1.2, z - 0.1);
      add(jamb);
    }
    // Door leaves: entry leaf toward the ATM (south / +X side of frame)
    const leftLeaf = box(leafW, leafH, 0.1, WOOD);
    leftLeaf.position.set(doorCx + leafW * 0.5 + 0.03, 1.18, z - 0.15);
    leftLeaf.name = "interiorFrontDoor";
    add(leftLeaf);
    const rightLeaf = box(leafW, leafH, 0.1, WOOD_DARK);
    rightLeaf.position.set(doorCx - leafW * 0.5 - 0.03, 1.18, z - 0.15);
    rightLeaf.name = "interiorFrontDoorRight";
    add(rightLeaf);
    for (const lx of [doorCx - leafW * 0.5 - 0.03, doorCx + leafW * 0.5 + 0.03]) {
      for (const dir of [-1, 1]) {
        const arm = box(0.08, 1.05, 0.04, WOOD_COL_DARK);
        arm.rotation.z = dir * 0.55;
        arm.position.set(lx, 1.45, z - 0.22);
        add(arm);
      }
      const rail = box(leafW * 0.85, 0.08, 0.04, WOOD_COL_DARK);
      rail.position.set(lx, 0.55, z - 0.2);
      add(rail);
      const rail2 = box(leafW * 0.85, 0.08, 0.04, WOOD_COL_DARK);
      rail2.position.set(lx, 1.0, z - 0.2);
      add(rail2);
    }
    const mullion = box(0.1, leafH + 0.08, 0.12, WOOD_COL, { roughness: 0.75 });
    mullion.position.set(doorCx, 1.18, z - 0.13);
    add(mullion);
    const pull = cyl(0.045, 0.045, 0.1, 0xc8a040, { metalness: 0.5, roughness: 0.4 }, 8);
    pull.rotation.z = Math.PI / 2;
    pull.position.set(doorCx + 0.12, 1.2, z - 0.24);
    add(pull);
    const doorRing = cyl(0.07, 0.07, 0.03, 0x2a2a30, { metalness: 0.4, roughness: 0.5 }, 10);
    doorRing.rotation.x = Math.PI / 2;
    doorRing.position.set(doorCx + 0.12, 1.2, z - 0.26);
    add(doorRing);
  }

  // ══════════════════════════════════════════════════════════════════
  // NORTH (−X) — glass lot exit · wood rail through columns · cathedral · DJ
  // ══════════════════════════════════════════════════════════════════
  {
    const x = -halfW + 0.1;
    // Glass door on the west end of the north wall (NW corner → parking).
    // Facing north: left = +Z — nudge further left toward the west corner.
    const doorZ = 3.78;

    // Frosted glass lot door — opaque frost that transmits outdoor daylight.
    // Soft local spill only (not room-wide white floods). Driven by
    // setDayAmbient(nightT), not club neon setNight.
    {
      const dw = 1.15;
      const dh = 2.25;
      const frostMap = frostedGlassTex();

      const frame = box(0.12, dh + 0.12, dw + 0.12, 0x5a6068, {
        metalness: 0.5,
        roughness: 0.32,
      });
      frame.position.set(x, dh * 0.5 + 0.06, doorZ);
      add(frame);
      // Outer aluminum face trim (storefront)
      const face = box(0.04, dh + 0.04, dw + 0.04, 0x8a9098, {
        metalness: 0.55,
        roughness: 0.28,
      });
      face.position.set(x + 0.07, dh * 0.5 + 0.02, doorZ);
      add(face);

      // Two frosted leaves — milky, rough; gentle sky emissive (not white-hot)
      const dayMats = [];
      for (const side of [-1, 1]) {
        const paneMat = new THREE.MeshStandardMaterial({
          color: 0xb8c8d4,
          map: frostMap,
          emissive: 0x8aacc8,
          emissiveMap: frostMap,
          emissiveIntensity: 0.28,
          roughness: 0.88,
          metalness: 0.02,
          transparent: true,
          opacity: 0.94,
          flatShading: true,
        });
        const pane = new THREE.Mesh(
          new THREE.BoxGeometry(0.06, dh - 0.18, dw * 0.42),
          paneMat
        );
        pane.position.set(x + 0.08, dh * 0.5 + 0.02, doorZ + side * dw * 0.24);
        pane.castShadow = false;
        pane.receiveShadow = true;
        add(pane);
        // day intensity kept modest so frost glows, not blooms
        dayMats.push({ mat: paneMat, day: 0.32, night: 0.02 });
      }

      // Mid stile + push bar
      const stile = box(0.06, dh - 0.12, 0.09, 0x4a5058, { metalness: 0.45, roughness: 0.38 });
      stile.position.set(x + 0.06, dh * 0.5, doorZ);
      add(stile);
      const push = box(0.05, 0.05, dw * 0.7, 0xc8ccd0, { metalness: 0.55, roughness: 0.35 });
      push.position.set(x + 0.14, 1.05, doorZ);
      add(push);
      // Bottom kick plate
      const kick = box(0.07, 0.22, dw * 0.92, 0x3a4048, { metalness: 0.4, roughness: 0.42 });
      kick.position.set(x + 0.08, 0.18, doorZ);
      add(kick);
      // EXIT glow above (club neon — stays on setNight)
      const exitLite = neonBox(0.08, 0.12, 0.45, 0x3dd68c, 0.85);
      exitLite.position.set(x + 0.1, dh + 0.18, doorZ);
      lit(exitLite, 1.1, 0.7);
      add(exitLite);

      // One soft daylight spill — short range so it only warms the door pocket,
      // not the DJ booth (NE) or walk-in (SE) as white hotspots.
      const doorSpill = new THREE.PointLight(0xd8e4f0, 0.42, 3.2, 2);
      doorSpill.position.set(x + 0.85, 1.45, doorZ);
      add(doorSpill);
      // Tiny warm floor kiss just inside the threshold
      const doorPool = new THREE.PointLight(0xf0e4d0, 0.18, 2.0, 2);
      doorPool.position.set(x + 0.7, 0.28, doorZ);
      add(doorPool);

      const dayLights = [
        { light: doorSpill, day: 0.48, night: 0.0 },
        { light: doorPool, day: 0.2, night: 0.0 },
      ];
      // Publish for setDayAmbient (real outdoor sun time)
      g.userData.dayAmbient = g.userData.dayAmbient || { mats: [], lights: [] };
      g.userData.dayAmbient.mats.push(...dayMats);
      g.userData.dayAmbient.lights.push(...dayLights);
      g.userData.lotDoor = { z: doorZ, x, mats: dayMats, lights: dayLights };
    }

    // Dark wood railing to the right of the glass door, running SOUTH (+X)
    // through all three railing-line columns (near wall, mid, end).
    // Uses shared railZ (columns / curtains / stage) so everything stays aligned.
    {
      const railStartX = -halfW + 0.35; // at the north wall
      const railEndX = 0.35; // past the third column
      const railLen = railEndX - railStartX;
      const railing = buildWoodRailing(railLen, { picketH: 0.95, spacing: 0.13 });
      railing.position.set(railStartX, 0, railZ);
      add(railing);
      // Thin rail solid — walk around ends, not through pickets
      solid(railStartX, railEndX, railZ - 0.06, railZ + 0.06);
      // Short return at the north wall tying into the door frame
      const returnRail = buildWoodRailing(0.55, { picketH: 0.95, spacing: 0.12 });
      returnRail.rotation.y = Math.PI / 2;
      returnRail.position.set(railStartX + 0.08, 0, railZ);
      add(returnRail);
      solid(railStartX - 0.04, railStartX + 0.14, railZ - 0.5, railZ + 0.06);
    }

    // Lot glass door frame (stand at it, not walk through the wall mass)
    solidAt(x + 0.06, doorZ, 0.12, 0.55);

    // Cathedral rainbow window (east of the railing / door) — full peak lights up
    const cathed = buildCathedralWindow(nightMats);
    cathed.position.set(x + 0.08, 0.1, -0.25);
    cathed.rotation.y = Math.PI / 2; // face into room (+X)
    add(cathed);
    g.userData.cathedral = cathed;
    g.userData.cathedralPaneMat = cathed.userData.paneMat;
    g.userData.cathedralHalo = cathed.userData.haloMat;
    g.userData.cathedralPeakHalo = cathed.userData.peakHaloMat;
    g.userData.cathedralGlowMats = cathed.userData.glowMats;
    g.userData.cathedralStripMats = cathed.userData.stripMats;
    // Room throw from body + peak
    const winLight = cathed.userData.bodyLite;
    if (winLight) {
      winLight.name = "cathedralLight";
      nightLights.push({ light: winLight, day: 1.2, night: 2.5 });
      g.userData.cathedralLight = winLight;
    }
    const peakLite = cathed.userData.peakLite;
    if (peakLite) {
      nightLights.push({ light: peakLite, day: 0.9, night: 2.0 });
      g.userData.cathedralPeakLight = peakLite;
    }
    const winSpot = new THREE.SpotLight(0x40e0ff, 2.2, 16, 0.65, 0.4, 1.3);
    winSpot.position.set(x + 0.4, 2.6, -0.25);
    winSpot.target.position.set(x + 3.2, 0.2, -0.25);
    add(winSpot);
    add(winSpot.target);
    nightLights.push({ light: winSpot, day: 1.1, night: 2.2 });
    g.userData.cathedralSpot = winSpot;
    // Extra peak spot aiming down into the dance floor
    const peakSpot = new THREE.SpotLight(0x80e8ff, 1.4, 12, 0.55, 0.45, 1.4);
    peakSpot.position.set(x + 0.5, 3.6, -0.25);
    peakSpot.target.position.set(x + 2.5, 0.1, -0.5);
    add(peakSpot);
    add(peakSpot.target);
    nightLights.push({ light: peakSpot, day: 0.7, night: 1.6 });
    g.userData.cathedralPeakSpot = peakSpot;

    // Sleek modern DJ booth — NE corner on solid floor east of The Pit.
    // Local +Z = audience → rot Y π/2 so +Z faces into the room (+X).
    // Deeper platform gives a real stand zone between desk and north wall.
    const djZ = -3.4;
    const djX = x + 1.05; // off the wall enough for the DJ pad behind the decks
    const dj = buildDjBooth(nightMats, lit, nightLights);
    dj.rotation.y = Math.PI / 2;
    dj.position.set(djX, 0, djZ);
    add(dj);
    // Front facade faces +X into the room (local +Z after rot) — lounge booths start here
    g.userData.djFrontX = djX + 0.68;
    g.userData.djZ = djZ;
    // Booth footprint after Y=π/2: local Z→world X, local X→world −Z
    solidAt(djX, djZ, 0.62, 0.78);

    // Slim wall jukebox BESIDE the booth (toward cathedral / neon window),
    // not directly behind the DJ — leaves the stand pad clear.
    // Booth world-Z span ≈ djZ ± 1.0; place jukebox just west of that edge.
    const jukeZ = djZ + 1.45; // ~−1.95, next to booth, closer to the neon window
    const juke = buildAmiJukebox(nightMats, lit);
    juke.rotation.y = Math.PI / 2;
    juke.position.set(x + 0.12, 0, jukeZ);
    add(juke);
    solidAt(x + 0.28, jukeZ, 0.3, 0.36);
    const jukeWash = new THREE.PointLight(0x40e0ff, 0.5, 4.5, 2);
    jukeWash.position.set(x + 0.7, 1.4, jukeZ);
    add(jukeWash);
    nightLights.push({ light: jukeWash, day: 0.3, night: 0.65 });
    const jukePink = new THREE.PointLight(0xff4fa8, 0.3, 3.5, 2);
    jukePink.position.set(x + 0.65, 0.9, jukeZ);
    add(jukePink);
    nightLights.push({ light: jukePink, day: 0.18, night: 0.4 });

    // Horizontal music-video TV above the jukebox — tilted down toward the room
    {
      const mvMaps = [0, 1, 2, 3, 4, 5].map((i) => musicVideoTex(i));
      const mvTv = buildFlatScreen(lit, {
        w: 1.15,
        h: 0.62,
        map: mvMaps[0],
        emissive: 0x184060,
      });
      // Face into the room (+X) like the jukebox, then tilt down
      mvTv.rotation.order = "YXZ";
      mvTv.rotation.y = Math.PI / 2;
      mvTv.rotation.x = -0.32;
      mvTv.position.set(x + 0.22, 2.45, jukeZ);
      add(mvTv);
      g.userData.tvScreens = g.userData.tvScreens || [];
      g.userData.tvScreens.push(mvTv.userData.screen, mvTv.userData.slab);
      g.userData.musicScreens = g.userData.musicScreens || [];
      g.userData.musicScreens.push({ screen: mvTv.userData.screen, maps: mvMaps, idx: 0 });
      const mvLite = new THREE.PointLight(0x60c0ff, 0.4, 4, 2);
      mvLite.position.set(x + 0.9, 2.3, jukeZ);
      add(mvLite);
      nightLights.push({ light: mvLite, day: 0.22, night: 0.5 });
    }

    // (No extra lounge blocks near DJ — east-wall booths stay clear of this corner)
  }

  // ══════════════════════════════════════════════════════════════════
  // EAST (−Z) — TV video wall · booths · patio · walk-in · taps
  // ══════════════════════════════════════════════════════════════════
  {
    const z = -halfD + 0.1;

    // Single row of 5 thick cartoony TVs — flush, full wall span (leave patio door)
    {
      const count = 5;
      const wallStartX = -halfW + 0.3;
      const wallEndX = 0.85; // patio door sits further +X
      const totalW = wallEndX - wallStartX;
      const tvW = totalW / count; // flush edge-to-edge
      const tvH = 1.05;
      const tvD = 0.28; // thick / cartoony depth
      const tvY = 1.85;
      const mid = (count / 2) | 0; // center screen = 2

      // Continuous back plate
      const backplate = box(totalW + 0.08, tvH + 0.2, 0.08, 0x0a0c12, {
        roughness: 0.55,
        metalness: 0.2,
      });
      backplate.position.set((wallStartX + wallEndX) * 0.5, tvY, z + 0.02);
      add(backplate);

      // Neon strip above the bank
      const wallLed = neonBox(totalW + 0.12, 0.07, 0.05, 0x9b6dff, 0.75);
      wallLed.position.set((wallStartX + wallEndX) * 0.5, tvY + tvH * 0.5 + 0.12, z + 0.14);
      lit(wallLed, 1.05, 0.65, { glimmerSpeed: 2.8 });
      add(wallLed);
      const wallLedBot = neonBox(totalW + 0.12, 0.05, 0.04, 0xff4fa8, 0.65);
      wallLedBot.position.set((wallStartX + wallEndX) * 0.5, tvY - tvH * 0.5 - 0.1, z + 0.14);
      lit(wallLedBot, 0.95, 0.55, { glimmerSpeed: 2.5 });
      add(wallLedBot);

      g.userData.vibeWall = [];
      g.userData.tvScreens = g.userData.tvScreens || [];

      for (let i = 0; i < count; i++) {
        const cx = wallStartX + (i + 0.5) * tvW;
        const isCenter = i === mid;
        // Fat cartoony chassis
        const chassis = box(tvW * 0.98, tvH, tvD, 0x12141a, {
          roughness: 0.45,
          metalness: 0.25,
        });
        chassis.position.set(cx, tvY, z + tvD * 0.5 + 0.04);
        add(chassis);
        // Chunky bezel lip
        const bezel = box(tvW * 0.96, tvH * 0.96, 0.06, 0x1a1a22, {
          roughness: 0.4,
          metalness: 0.3,
        });
        bezel.position.set(cx, tvY, z + tvD + 0.05);
        add(bezel);
        // Glowing screen face
        const map = vibeWallTex(i, 0, isCenter);
        const screen = new THREE.Mesh(
          new THREE.PlaneGeometry(tvW * 0.88, tvH * 0.88),
          new THREE.MeshStandardMaterial({
            map,
            emissive: isCenter ? 0x402060 : 0x204060,
            emissiveIntensity: 0.65,
            roughness: 0.3,
            flatShading: true,
          })
        );
        screen.position.set(cx, tvY, z + tvD + 0.09);
        lit(screen, 1.0, 0.6);
        add(screen);
        g.userData.tvScreens.push(screen);
        g.userData.vibeWall.push({ screen, slot: i, isCenter });
        // Corner pips (cartoon TV vibe)
        for (const [sx, sy] of [
          [-1, -1],
          [-1, 1],
          [1, -1],
          [1, 1],
        ]) {
          const pip = box(0.06, 0.06, 0.04, 0x40e0ff, {
            emissive: 0x20c0ff,
            emissiveIntensity: 0.5,
          });
          pip.position.set(
            cx + sx * tvW * 0.42,
            tvY + sy * tvH * 0.42,
            z + tvD + 0.08
          );
          lit(pip, 0.55, 0.3, { glimmerSpeed: 3 + i * 0.2 });
          add(pip);
        }
      }
      // Soft wash from the bank
      const bankLite = new THREE.PointLight(0x80a0ff, 0.55, 7, 2);
      bankLite.position.set((wallStartX + wallEndX) * 0.5, tvY, z + 1.2);
      add(bankLite);
      nightLights.push({ light: bankLite, day: 0.3, night: 0.7 });
    }

    // Patio door (end of the flat east wall / video-wall run)
    const patioX = 1.55;

    // Taller / wider banquettes under the video wall — one continuous row from
    // the front of the DJ stand to the patio door (3 bays, almost edge-to-edge).
    {
      const accents = [0xff4fa8, 0x40e0ff, 0x9b6dff];
      const count = 3;
      const patioHalf = 0.52; // leave clear of patio door leaf
      const spanStart = (g.userData.djFrontX ?? -3.9) + 0.1;
      const spanEnd = patioX - patioHalf - 0.06;
      const gap = 0.05;
      const totalW = Math.max(1.5, spanEnd - spanStart);
      const boothW = (totalW - gap * (count - 1)) / count;
      for (let i = 0; i < count; i++) {
        const bx = spanStart + boothW * 0.5 + i * (boothW + gap);
        const booth = buildLoungeBooth(lit, accents[i % accents.length], { w: boothW });
        // Open side faces into the room (+Z); wall is at −Z
        booth.position.set(bx, 0, z + 0.72);
        add(booth);
        // Seat + back + table footprint (table sticks out a bit)
        solidAt(bx, z + 0.48, boothW * 0.46, 0.4);
      }
    }
    g.userData.patioDoor = { x: patioX, z: z + 0.35 };
    g.userData.patioSpot = { x: patioX, z: z + 0.85 }; // just inside, hanging by the door
    const patioDoor = box(1.0, 2.15, 0.12, 0x2a3a2a);
    patioDoor.position.set(patioX, 1.15, z + 0.08);
    add(patioDoor);
    solidAt(patioX, z + 0.1, 0.55, 0.14);
    const patioGlass = box(0.65, 1.3, 0.05, 0x80c0a0, {
      transparent: true,
      opacity: 0.4,
      emissive: 0x204030,
      emissiveIntensity: 0.15,
    });
    patioGlass.position.set(patioX, 1.3, z + 0.14);
    add(patioGlass);
    const exit = neonBox(0.4, 0.14, 0.05, 0x3dd68c, 0.75);
    exit.position.set(patioX, 2.4, z + 0.12);
    lit(exit, 1.05, 0.7);
    add(exit);

    // ── Full-run walk-in cooler along east wall → south wall ──
    // Same cooler width the whole length; thinner door on the patio end;
    // ice (low) + draft taps (above) stacked on the room face of the cooler.
    {
      const wallH = EAVE_H;
      // Cooler footprint: X from past patio to south wall; Z = fixed width from east wall
      const coolerW = 1.15; // depth into room (+Z) — the walk-in "width"
      const coolerX0 = patioX + 0.48;
      const coolerX1 = halfW - 0.1; // past the bar, flush to south wall
      const coolerLen = coolerX1 - coolerX0;
      const coolerXc = (coolerX0 + coolerX1) * 0.5;
      const coolerZ0 = z; // east wall
      const coolerZ1 = z + coolerW;
      const coolerZc = (coolerZ0 + coolerZ1) * 0.5;

      // Main cooler mass
      const cooler = box(coolerLen, wallH, coolerW, 0x2a2234, { roughness: 0.82 });
      cooler.position.set(coolerXc, wallH * 0.5, coolerZc);
      add(cooler);
      // Full cooler bulk (tight to geometry so aisle stays walkable)
      solid(coolerX0 - 0.06, coolerX1 + 0.04, coolerZ0 - 0.02, coolerZ1 + 0.02);
      // Horizontal insulation score lines
      for (let i = 0; i < 4; i++) {
        const score = box(coolerLen * 0.98, 0.02, 0.02, 0x1e1828, { roughness: 0.75 });
        score.position.set(coolerXc, 0.55 + i * 0.55, coolerZ1 - 0.01);
        add(score);
      }
      // Ceiling bulkhead
      const bulkhead = box(coolerLen + 0.12, 0.12, coolerW + 0.12, 0x1c1624, { roughness: 0.85 });
      bulkhead.position.set(coolerXc, wallH - 0.05, coolerZc);
      add(bulkhead);
      // South wall cap (meets building south)
      const southCap = box(0.1, wallH, coolerW + 0.08, 0x241c30, { roughness: 0.8 });
      southCap.position.set(coolerX1 + 0.02, wallH * 0.5, coolerZc);
      add(southCap);

      // ── Thinner walk-in door on the patio-end face (−X into the room) ──
      const wiDoorH = 2.05;
      const wiDoorD = coolerW * 0.62; // thinner than the cooler face
      const wiFaceX = coolerX0 - 0.02;
      const wiZ = coolerZc;
      const wiFrame = box(0.08, wiDoorH + 0.1, wiDoorD + 0.1, 0x3a4048, {
        metalness: 0.35,
        roughness: 0.45,
      });
      wiFrame.position.set(wiFaceX + 0.02, 1.1, wiZ);
      add(wiFrame);
      const walkIn = box(0.1, wiDoorH, wiDoorD, 0x5a6270, {
        metalness: 0.45,
        roughness: 0.38,
      });
      walkIn.position.set(wiFaceX, 1.08, wiZ);
      add(walkIn);
      for (let i = 0; i < 5; i++) {
        const rib = box(0.035, 0.03, wiDoorD * 0.88, 0x4a525c, {
          metalness: 0.4,
          roughness: 0.42,
        });
        rib.position.set(wiFaceX - 0.05, 0.4 + i * 0.38, wiZ);
        add(rib);
      }
      const wiHandle = box(0.09, 0.48, 0.08, 0xd0d4dc, { metalness: 0.6, roughness: 0.25 });
      wiHandle.position.set(wiFaceX - 0.1, 1.15, wiZ + wiDoorD * 0.22);
      add(wiHandle);
      const wiGrip = box(0.12, 0.07, 0.07, 0xa8acb4, { metalness: 0.55, roughness: 0.3 });
      wiGrip.position.set(wiFaceX - 0.16, 1.32, wiZ + wiDoorD * 0.22);
      add(wiGrip);
      const thermo = cyl(0.055, 0.055, 0.035, 0x1a1a22, { roughness: 0.4 }, 10);
      thermo.rotation.z = Math.PI / 2;
      thermo.position.set(wiFaceX - 0.07, 1.85, wiZ - wiDoorD * 0.15);
      add(thermo);
      const wiBadge = new THREE.Mesh(
        new THREE.PlaneGeometry(0.5, 0.12),
        new THREE.MeshStandardMaterial({
          map: labelTex("WALK-IN", {
            w: 220,
            h: 52,
            bg: "#2a3040",
            fg: "#80c0ff",
            size: 24,
            weight: 800,
            font: "fun",
          }),
          emissive: 0x2060a0,
          emissiveIntensity: 0.4,
          roughness: 0.45,
          flatShading: true,
        })
      );
      wiBadge.position.set(wiFaceX - 0.07, 2.2, wiZ);
      wiBadge.rotation.y = -Math.PI / 2;
      add(wiBadge);
      const wiGlow = new THREE.PointLight(0x90b8d0, 0.22, 2.4, 2);
      wiGlow.position.set(wiFaceX - 0.4, 1.25, wiZ);
      add(wiGlow);
      nightLights.push({ light: wiGlow, day: 0.1, night: 0.24 });

      // ── Ice (low) + draft taps (above) on the room face of the cooler ──
      // Flush to the south wall end of the cooler run (no text labels).
      const bay = buildIceAndTapBay(lit);
      const bayW = bay.userData.bayW || 1.15;
      // Face into the room (+Z); center so the unit kisses the south cap
      const bayX = coolerX1 - bayW * 0.5 - 0.04;
      bay.position.set(bayX, 0, coolerZ1 + 0.02);
      add(bay);
      // Ice chest + taps stick into the aisle
      solidAt(bayX, coolerZ1 + 0.28, bayW * 0.48, 0.34);
      // Rubber mat under the bay
      const bayMat = box(1.25, 0.025, 0.85, 0x141418, { roughness: 0.95 });
      bayMat.position.set(bayX, 0.05, coolerZ1 + 0.4);
      add(bayMat);
      // Soft aisle fill — short range, low intensity (no white bloom on stainless)
      const bayFill = new THREE.PointLight(0xffe0c8, 0.22, 2.2, 2);
      bayFill.position.set(bayX, 1.45, coolerZ1 + 0.5);
      add(bayFill);
      nightLights.push({ light: bayFill, day: 0.1, night: 0.26 });

      // Runner along the cooler face (stop short of the bay at the south end)
      const runner = box(Math.max(0.8, coolerLen * 0.55), 0.02, 0.55, 0x121218, {
        roughness: 0.95,
      });
      runner.position.set(coolerX0 + coolerLen * 0.32, 0.04, coolerZ1 + 0.3);
      add(runner);
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
    // Solid bar body only — stools stay walkable so you can sidle up smoothly
    solidAt(barX, 0.15, barDepth * 0.5 + 0.02, 5.6 * 0.5 + 0.04);
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

    // Gothic chandelier — RIGHT side when facing the bar (east / −Z),
    // hanging from the vault about halfway down over the customer stools.
    {
      const chand = buildGothicChandelier(lit, nightLights, flashLights);
      // Ceiling height near bar (south of ridge) sits around eave
      const ceilY = roofYAt(-1.8) - 0.08;
      // Over customer edge of bar, east/right end
      const chX = barX - barDepth * 0.5 - 0.55;
      const chZ = 0.15 - 1.85; // right when facing +X at the bar
      chand.position.set(chX, ceilY, chZ);
      add(chand);
      g.userData.barChandelier = chand;
    }

    // Sleek square POS on the LEFT end of the bar (east / −Z when facing bar)
    // Staff side of the top — ring in drinks next to drafts / walk-in.
    {
      const pos = buildBarPos(lit);
      // Sit on bar top; face bartender aisle (+X)
      pos.rotation.y = Math.PI / 2;
      pos.position.set(barX + 0.12, 1.22, 0.15 - 5.7 * 0.5 + 0.55);
      add(pos);
    }

    // Party cam — west end of the bar top (customer corner), aimed at activation wall.
    // Sits just off the bar edge so stools stay clear; ~1.2+ walk gap to the west wall.
    {
      const barFrontX = barX - barDepth * 0.5;
      const barWestZ = 0.15 + 5.7 * 0.5; // west tip of bar top (~3.0)
      const westWallZ = halfD - 0.1; // ~4.4
      const partyCam = buildPartyCam(lit);
      // Beside bar-top west edge, slightly into the room from the customer face
      const camX = barFrontX - 0.38;
      const camZ = barWestZ - 0.28; // still at the bar end, not out in the walkway
      partyCam.position.set(camX, 0, camZ);
      // Face activation wall (+Z). Nudge yaw so the ring looks at the green wall center
      // (activation sits around x≈2.2 on the west wall).
      const actX = 2.2;
      const actZ = westWallZ - 0.2;
      partyCam.rotation.y = Math.atan2(actX - camX, actZ - camZ);
      add(partyCam);
      solidAt(camX, camZ, 0.2, 0.2);
      // Soft spill so the shot looks intentional
      const camFill = new THREE.PointLight(0xfff5ee, 0.35, 3.2, 2);
      camFill.position.set(camX, 1.5, camZ + 0.55);
      add(camFill);
      nightLights.push({ light: camFill, day: 0.2, night: 0.45 });
    }
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

    // Bartender + ambient tasks (lot-style guests arrive via interiorLife)
    {
      const btX = barX + barDepth * 0.5 + 0.38; // service aisle
      const btZ0 = 0.15;
      const barFrontX = barX - barDepth * 0.5;
      // Patron stool / order spots (match customer stools)
      const stoolZs = [];
      for (let i = 0; i < 9; i++) stoolZs.push(-2.0 + i * 0.55);

      const bt = buildBartender();
      bt.position.set(btX, 0, btZ0);
      // Face customers (−X): local +Z → −X
      bt.rotation.y = -Math.PI / 2;
      add(bt);

      g.userData.barFrontX = barFrontX;
      g.userData.stoolZs = stoolZs;
      g.userData.bartender = {
        mesh: bt,
        homeX: btX,
        homeZ: btZ0,
        zMin: -1.35,
        zMax: 1.5,
        restockX: btX + 0.25, // step toward back bar
        // State machine
        state: "idle", // clean | restock | serve | idle
        stateT: 0,
        stateDur: 4,
        patronPresent: false,
        orderGuest: null,
        // Zones along the bar for tasks
        cleanZ: 0.6,
        restockZ: -0.8,
        serveZ: stoolZs[4],
      };
    }

    // Bathroom (SE corner — vape cabinet removed so ice/draft bay can sit flush)
    const bathDoor = box(0.85, 2.15, 0.12, WOOD_DARK);
    bathDoor.position.set(wallX - 0.2, 1.15, -3.9);
    add(bathDoor);
    solidAt(wallX - 0.2, -3.9, 0.48, 0.14);
    const bathSign = neonBox(0.22, 0.22, 0.05, 0x9b6dff, 0.65);
    bathSign.position.set(wallX - 0.25, 2.35, -3.9);
    lit(bathSign, 0.95, 0.6);
    add(bathSign);

    // ── Side doorway (west end of bar run) — replaces the photobooth.
    // Opening faces into the club (−X). A short hall turns LEFT (+Z) into
    // an undeveloped red-glow room (placeholder for later build-out).
    {
      const doorZ = 3.4;
      const doorW = 1.05;
      const doorH = 2.2;
      const jambD = 0.16;
      // Opening sits in the south wall face; hall digs +X behind it
      const faceX = wallX - 0.02;
      const hallDepth = 1.35;
      const hallEndX = faceX + hallDepth;
      const frameCol = 0x1a1218;
      const hallCol = 0x100c12;
      const red = 0xff2040;

      // Outer jambs (left / right when facing the door)
      for (const sz of [-1, 1]) {
        const jamb = box(jambD, doorH + 0.12, 0.12, frameCol, { roughness: 0.82 });
        jamb.position.set(faceX, doorH * 0.5 + 0.02, doorZ + sz * (doorW * 0.5));
        add(jamb);
      }
      // Header / lintel
      const head = box(jambD + 0.04, 0.12, doorW + 0.18, frameCol, { roughness: 0.8 });
      head.position.set(faceX, doorH + 0.08, doorZ);
      add(head);
      // Threshold
      const sill = box(0.22, 0.06, doorW + 0.08, 0x141018, { roughness: 0.88 });
      sill.position.set(faceX - 0.02, 0.03, doorZ);
      add(sill);

      // Hall floor
      const hallFloor = box(hallDepth, 0.05, doorW + 0.2, 0x0c0a0e, { roughness: 0.95 });
      hallFloor.position.set(faceX + hallDepth * 0.5, 0.02, doorZ);
      add(hallFloor);
      // Hall ceiling
      const hallCeil = box(hallDepth, 0.08, doorW + 0.2, hallCol, { roughness: 0.9 });
      hallCeil.position.set(faceX + hallDepth * 0.5, doorH + 0.02, doorZ);
      add(hallCeil);
      // Right wall of short hall (solid — no turn that way)
      const hallRight = box(hallDepth, doorH, 0.1, hallCol, { roughness: 0.88 });
      hallRight.position.set(faceX + hallDepth * 0.5, doorH * 0.5, doorZ - doorW * 0.5 - 0.02);
      add(hallRight);
      // Left wall only on the first half — opens into the side room
      const hallLeftFront = box(hallDepth * 0.42, doorH, 0.1, hallCol, { roughness: 0.88 });
      hallLeftFront.position.set(
        faceX + hallDepth * 0.21,
        doorH * 0.5,
        doorZ + doorW * 0.5 + 0.02
      );
      add(hallLeftFront);

      // Back wall of the short hall (dead end straight ahead)
      const hallBack = box(0.1, doorH, doorW + 0.22, hallCol, { roughness: 0.9 });
      hallBack.position.set(hallEndX, doorH * 0.5, doorZ);
      add(hallBack);

      // Left turn: side room stub extending +Z (west), dark with red wash
      const sideLen = 1.4;
      const sideZc = doorZ + doorW * 0.5 + sideLen * 0.5;
      const sideFloor = box(hallDepth * 0.55, 0.05, sideLen, 0x0c0a0e, { roughness: 0.95 });
      sideFloor.position.set(faceX + hallDepth * 0.72, 0.02, sideZc);
      add(sideFloor);
      const sideCeil = box(hallDepth * 0.55, 0.08, sideLen, hallCol, { roughness: 0.9 });
      sideCeil.position.set(faceX + hallDepth * 0.72, doorH + 0.02, sideZc);
      add(sideCeil);
      // Far wall of side room (tease of more space)
      const sideFar = box(hallDepth * 0.55, doorH, 0.1, 0x0a080c, { roughness: 0.92 });
      sideFar.position.set(faceX + hallDepth * 0.72, doorH * 0.5, sideZc + sideLen * 0.5);
      add(sideFar);
      // Back of side room (closes the L)
      const sideBack = box(0.1, doorH, sideLen + 0.1, 0x0a080c, { roughness: 0.92 });
      sideBack.position.set(faceX + hallDepth * 0.72 + hallDepth * 0.28, doorH * 0.5, sideZc);
      add(sideBack);

      // Red door-frame lip (reads as backlit exit / VIP)
      const redLip = box(0.04, doorH + 0.06, doorW + 0.1, red, {
        emissive: red,
        emissiveIntensity: 0.85,
        roughness: 0.35,
      });
      redLip.position.set(faceX - 0.06, doorH * 0.5, doorZ);
      lit(redLip, 1.15, 0.7, { glimmerSpeed: 1.6 });
      add(redLip);
      // Thin red edge on header
      const redHead = neonBox(0.05, 0.06, doorW * 0.92, red, 0.95);
      redHead.position.set(faceX - 0.08, doorH + 0.14, doorZ);
      lit(redHead, 1.2, 0.75, { glimmerSpeed: 2.0 });
      add(redHead);

      // Soft red glow from the side room + hall
      const redHall = new THREE.PointLight(0xff1838, 0.85, 4.5, 2);
      redHall.position.set(faceX + 0.85, 1.35, doorZ + 0.55);
      add(redHall);
      nightLights.push({ light: redHall, day: 0.45, night: 1.0 });
      const redSpill = new THREE.PointLight(0xff4060, 0.45, 3.8, 2);
      redSpill.position.set(faceX - 0.55, 1.2, doorZ);
      add(redSpill);
      nightLights.push({ light: redSpill, day: 0.22, night: 0.55 });
      // Floor wash so the L-turn reads as lit space
      const redFloor = new THREE.PointLight(0xff1028, 0.35, 2.8, 2);
      redFloor.position.set(faceX + 0.9, 0.25, sideZc);
      add(redFloor);
      nightLights.push({ light: redFloor, day: 0.15, night: 0.42 });

      // Block walking deep into undeveloped space; leave a shallow threshold
      solid(faceX + 0.35, hallEndX + 0.2, doorZ - doorW * 0.55, doorZ + doorW * 0.55 + sideLen);
      // Frame posts still solid at the sides
      solidAt(faceX, doorZ - doorW * 0.5, 0.12, 0.1);
      solidAt(faceX, doorZ + doorW * 0.5, 0.12, 0.1);

      g.userData.sideDoor = {
        x: faceX,
        z: doorZ,
        // Future: build out the left room from this anchor
        roomHint: "left-turn red hall (undeveloped)",
      };
    }

    // ══════════════════════════════════════════════════════════════
    // Elevated lookout ABOVE the Stacy's diamond — real open aperture
    // (shell south wall + gable are cut to match LOOKOUT_*). Office sits
    // BEHIND the wall; hollow wood frame only — no glass / no solid slab.
    // ══════════════════════════════════════════════════════════════
    {
      const winW = LOOKOUT_W;
      const winH = LOOKOUT_H;
      const winY = LOOKOUT_Y;
      const winZ = LOOKOUT_Z;
      const winBot = winY - winH * 0.5;
      const winTop = winY + winH * 0.5;
      const tallH = PEAK_H - 0.15;
      const wallSpan = 5.6; // Z span of tall purple wall
      const wallZ0 = 0.1 - wallSpan * 0.5;
      const wallZ1 = 0.1 + wallSpan * 0.5;
      const sideL = winZ - winW * 0.5 - wallZ0; // z length left of window
      const sideR = wallZ1 - (winZ + winW * 0.5);

      // Inset purple reveal around the hole (reads as wall thickness, not a screen)
      const revealX = wallX + 0.02;
      if (winBot > 0.1) {
        const bot = wallMesh(WALL, winBot, wallSpan, "purpleDark");
        bot.position.set(revealX, winBot * 0.5, 0.1);
        add(bot);
      }
      if (sideL > 0.08) {
        const left = wallMesh(WALL, winH, sideL, "purpleDark");
        left.position.set(revealX, winY, wallZ0 + sideL * 0.5);
        add(left);
      }
      if (sideR > 0.08) {
        const right = wallMesh(WALL, winH, sideR, "purpleDark");
        right.position.set(revealX, winY, wallZ1 - sideR * 0.5);
        add(right);
      }
      const topH = tallH - winTop;
      if (topH > 0.08) {
        const top = wallMesh(WALL, topH, wallSpan, "purpleDark");
        top.position.set(revealX, winTop + topH * 0.5, 0.1);
        add(top);
      }
      // Open hole — black / dark-purple lip only (no center cross / mullions)
      const frameCol = 0x120c18; // near-black purple
      const lipCol = 0x1a1024;
      const jambDepth = 0.16;
      const jambX = wallX - 0.01;
      for (const sz of [-1, 1]) {
        const jamb = box(jambDepth, winH, 0.05, frameCol, { roughness: 0.85 });
        jamb.position.set(jambX, winY, winZ + sz * (winW * 0.5 - 0.02));
        add(jamb);
      }
      const head = box(jambDepth, 0.05, winW, frameCol, { roughness: 0.85 });
      head.position.set(jambX, winTop - 0.02, winZ);
      add(head);

      // Outer trim around the hole (posts + rails only — fully open middle)
      const fr = 0.06;
      const fx = wallX - 0.06;
      for (const sz of [-1, 1]) {
        const post = box(0.1, winH + fr * 2, fr, lipCol, {
          roughness: 0.82,
          metalness: 0.02,
        });
        post.position.set(fx, winY, winZ + sz * (winW * 0.5));
        add(post);
      }
      for (const sy of [-1, 1]) {
        const rail = box(0.1, fr, winW + fr * 2, lipCol, {
          roughness: 0.82,
          metalness: 0.02,
        });
        rail.position.set(fx, winY + sy * (winH * 0.5), winZ);
        add(rail);
      }
      // Deep sill / ledge (same dark purple family)
      const sill = box(0.22, 0.07, winW + 0.14, 0x100c14, { roughness: 0.82 });
      sill.position.set(wallX - 0.14, winBot - 0.04, winZ);
      add(sill);
      // Warm office light THROUGH the open hole (occupied loft, not black void)
      const winGlow = new THREE.PointLight(0xffe0b0, 1.25, 7.5, 2);
      winGlow.position.set(wallX + 0.55, winY, winZ);
      add(winGlow);
      nightLights.push({ light: winGlow, day: 0.6, night: 1.35 });
      // Spill into the club so the hole glows warm from below
      const spill = new THREE.PointLight(0xffd0a0, 0.55, 5.5, 2);
      spill.position.set(wallX - 0.85, winY - 0.2, winZ);
      add(spill);
      nightLights.push({ light: spill, day: 0.3, night: 0.65 });

      // Elevated manager office behind the wall (floor aligns with window)
      const office = buildManagerOffice(lit);
      const officeW = office.userData.size.w;
      const officeFloorY = winY - OFFICE_WIN_Y;
      office.position.set(wallX + officeW * 0.5 + 0.08, officeFloorY, winZ);
      add(office);
      // Desk lamp spill so the loft looks lived-in from the bar floor
      const loftLamp = new THREE.PointLight(0xffc080, 0.85, 4.5, 2);
      loftLamp.position.set(wallX + 0.9, officeFloorY + 1.2, winZ + 0.3);
      add(loftLamp);
      nightLights.push({ light: loftLamp, day: 0.45, night: 0.95 });

      const ob = office.userData.bounds;
      g.userData.office = {
        xMin: office.position.x + ob.xMin,
        xMax: office.position.x + ob.xMax,
        zMin: office.position.z + ob.zMin,
        zMax: office.position.z + ob.zMax,
        eyeY: ob.eyeY,
        floorY: officeFloorY,
        // Stand near the window, look out and slightly down at the bar
        spawn: {
          x: office.position.x + ob.xMin + 0.25,
          y: officeFloorY + ob.eyeY,
          z: office.position.z,
          yaw: 270, // −X into the club
          pitch: -18, // look down onto the bar
        },
        returnSpawn: {
          x: barX - barDepth * 0.5 - 0.9,
          y: WALK.eyeY,
          z: 0.2,
          yaw: 90,
          pitch: -4,
        },
      };
    }
  }

  // (No free-standing high-tops near the dance floor — keep the floor open.)

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

  // Outdoor daylight channel (inverse of club neon): gentle at noon, off at night.
  // Local to the lot door only — never a room-wide white wash.
  g.userData.setDayAmbient = (nightT) => {
    const t = Math.max(0, Math.min(1, nightT));
    // Soft sunset curve
    const sun = Math.pow(1 - t, 1.2);
    const da = g.userData.dayAmbient;
    if (!da) return;
    for (const e of da.mats || []) {
      if (!e?.mat) continue;
      e.mat.emissiveIntensity = e.night + (e.day - e.night) * sun;
      if (e.mat.color) {
        // Dimmer base colors so frost never reads as a white panel
        const dayCol = 0xb0c0ce;
        const nightCol = 0x2a323c;
        e.mat.color.setHex(dayCol).lerp(new THREE.Color(nightCol), t * 0.9);
      }
    }
    for (const e of da.lights || []) {
      if (!e?.light) continue;
      e.light.intensity = e.night + (e.day - e.night) * sun;
    }
    g.userData._dayNightT = t;
  };
  // Default: full day until pocket drives real sun time
  g.userData.setDayAmbient?.(0);

  // Rainbow cathedral (body + peak + neon), diamond, disco, TVs
  g.userData.tickInterior = (nowSec) => {
    g.userData.tickNight?.(nowSec * 1000);
    const hue = (nowSec * 0.12) % 1;
    const col = new THREE.Color().setHSL(hue, 0.92, 0.58);
    const colHot = new THREE.Color().setHSL((hue + 0.08) % 1, 0.95, 0.62);
    const catPulse = 0.88 + 0.12 * Math.sin(nowSec * 2.2);

    // All cathedral glow mats (pane, peak glass, neon outline, tip)
    const glowMats = g.userData.cathedralGlowMats;
    if (glowMats) {
      for (let i = 0; i < glowMats.length; i++) {
        const m = glowMats[i];
        if (!m) continue;
        const c = new THREE.Color().setHSL((hue + i * 0.025) % 1, 0.92, 0.58);
        m.emissive.copy(c);
        m.color.copy(c);
      }
    } else {
      const pane = g.userData.cathedralPaneMat;
      if (pane) {
        pane.emissive.copy(col);
        pane.color.copy(col);
      }
    }
    // Stained-glass strip cascade
    const strips = g.userData.cathedralStripMats;
    if (strips) {
      for (let i = 0; i < strips.length; i++) {
        const m = strips[i];
        if (!m) continue;
        const c = new THREE.Color().setHSL((hue + i * 0.07) % 1, 0.9, 0.55);
        m.emissive.copy(c);
        m.color.copy(c);
        m.emissiveIntensity = 0.5 + 0.4 * Math.sin(nowSec * 2.5 + i * 0.6);
      }
    }
    const halo = g.userData.cathedralHalo;
    if (halo) {
      halo.color.copy(col);
      halo.opacity = 0.18 + 0.1 * Math.sin(nowSec * 1.8);
    }
    const peakHalo = g.userData.cathedralPeakHalo;
    if (peakHalo) {
      peakHalo.color.copy(colHot);
      peakHalo.opacity = 0.16 + 0.12 * Math.sin(nowSec * 2.4 + 1);
    }
    const pl = g.userData.cathedralLight;
    if (pl) {
      pl.color.copy(col);
      pl.intensity = 1.6 + 0.55 * Math.sin(nowSec * 1.6);
    }
    const peakL = g.userData.cathedralPeakLight;
    if (peakL) {
      peakL.color.copy(colHot);
      peakL.intensity = 1.15 + 0.55 * Math.sin(nowSec * 2.1 + 0.5);
    }
    const sp = g.userData.cathedralSpot;
    if (sp) sp.color.copy(col);
    const psp = g.userData.cathedralPeakSpot;
    if (psp) psp.color.copy(colHot);

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

    // Bartender ambient AI: clean · restock · serve (when guests order) · idle
    // Guests are lot-style peds driven by interiorLife (enter → bar → mingle…).
    // No bartender when the doors are closed — empty club, no staff on shift.
    const bt = g.userData.bartender;
    const venueOpen = g.userData._lifeOpts?.open !== false;
    if (bt?.mesh) {
      const m = bt.mesh;
      if (!venueOpen) {
        m.visible = false;
        bt.patronPresent = false;
        bt.orderGuest = null;
        bt.state = "idle";
      } else {
      m.visible = true;
      const dt = Math.min(0.05, (nowSec - (bt._lastT || nowSec)));
      bt._lastT = nowSec;
      bt.stateT = (bt.stateT || 0) + dt;

      // Pick next task when current ends (serve is short — quick pour for orders)
      if (bt.stateT >= (bt.stateDur || 5)) {
        bt.stateT = 0;
        const roll = Math.random();
        if (bt.patronPresent && roll < 0.55) {
          bt.state = "serve";
          bt.stateDur = 3.0 + Math.random() * 1.5;
        } else if (roll < 0.75) {
          bt.state = "clean";
          bt.stateDur = 4 + Math.random() * 3;
          bt.cleanZ = THREE.MathUtils.lerp(bt.zMin, bt.zMax, Math.random());
        } else if (roll < 0.9) {
          bt.state = "restock";
          bt.stateDur = 3.5 + Math.random() * 2;
          bt.restockZ = THREE.MathUtils.lerp(bt.zMin + 0.2, bt.zMax - 0.2, Math.random());
        } else {
          bt.state = "idle";
          bt.stateDur = 2 + Math.random() * 2;
        }
      }

      const t = bt.stateT;
      const torso = m.userData.torso;
      const armR = m.userData.armR;
      const armL = m.userData.armL;
      const setProp = m.userData.setProp;
      const faceCustomers = -Math.PI / 2; // −X
      const faceBackBar = Math.PI / 2; // +X
      let targetZ = bt.homeZ;
      let targetYaw = faceCustomers;
      let targetX = bt.homeX;

      if (bt.state === "clean") {
        targetZ = bt.cleanZ ?? bt.homeZ;
        targetYaw = faceCustomers;
        if (setProp) setProp("rag");
        // Wipe along the bar
        const wipe = Math.sin(nowSec * 5.5);
        if (armR) {
          armR.rotation.x = -0.9 + wipe * 0.35;
          armR.rotation.z = 0.5 + wipe * 0.45;
          armR.rotation.y = wipe * 0.3;
        }
        if (armL) {
          armL.rotation.x = -0.5;
          armL.rotation.z = -0.15;
        }
        if (torso) {
          torso.rotation.x = -0.12 + Math.sin(nowSec * 5.5) * 0.06;
          torso.rotation.z = wipe * 0.08;
        }
        // Slide a bit while wiping
        targetZ += wipe * 0.12;
      } else if (bt.state === "restock") {
        targetZ = bt.restockZ ?? bt.homeZ;
        targetX = bt.restockX ?? bt.homeX;
        targetYaw = faceBackBar; // turn to shelves
        if (setProp) setProp("bottle");
        if (armR) {
          // Reach up to shelf
          armR.rotation.x = -1.6 + Math.sin(nowSec * 2.2) * 0.15;
          armR.rotation.z = 0.15;
          armR.rotation.y = 0.1;
        }
        if (armL) {
          armL.rotation.x = -1.1;
          armL.rotation.z = -0.25;
        }
        if (torso) {
          torso.rotation.x = -0.2 + Math.sin(nowSec * 2.2) * 0.05;
          torso.rotation.z = 0;
        }
      } else if (bt.state === "serve" && bt.patronPresent) {
        targetZ = bt.serveZ ?? bt.homeZ;
        targetYaw = faceCustomers;
        // Shake then pour
        const phase = t < (bt.stateDur || 7) * 0.55 ? "shake" : "pour";
        if (phase === "shake") {
          if (setProp) setProp("shaker");
          if (armR) {
            armR.rotation.x = -0.5 + Math.sin(nowSec * 9) * 0.65;
            armR.rotation.z = 0.25 + Math.sin(nowSec * 8) * 0.2;
            armR.rotation.y = Math.sin(nowSec * 7) * 0.25;
          }
          if (armL) {
            armL.rotation.x = -0.4 + Math.sin(nowSec * 9 + 1) * 0.2;
            armL.rotation.z = -0.2;
          }
        } else {
          if (setProp) setProp("glass");
          if (armR) {
            armR.rotation.x = -1.15;
            armR.rotation.z = 0.35;
            armR.rotation.y = 0.15;
          }
          if (armL) {
            // Steady the glass
            armL.rotation.x = -0.95;
            armL.rotation.z = -0.4;
          }
        }
        if (torso) {
          torso.rotation.x = -0.1 + Math.sin(nowSec * 3) * 0.04;
          torso.rotation.z = Math.sin(nowSec * 2) * 0.03;
        }
      } else {
        // idle — light pace, shaker ready
        targetZ = bt.homeZ + Math.sin(nowSec * 0.4) * 0.25;
        targetYaw = faceCustomers;
        if (setProp) setProp("shaker");
        if (armR) {
          armR.rotation.x = -0.25 + Math.sin(nowSec * 1.2) * 0.08;
          armR.rotation.z = 0.1;
          armR.rotation.y = 0;
        }
        if (armL) {
          armL.rotation.x = -0.2;
          armL.rotation.z = -0.08;
        }
        if (torso) {
          torso.rotation.x = -0.04;
          torso.rotation.z = Math.sin(nowSec * 0.4) * 0.03;
        }
      }

      // Smooth move / turn toward task target
      const blend = 1 - Math.exp(-dt * 3.2);
      m.position.z += (THREE.MathUtils.clamp(targetZ, bt.zMin, bt.zMax) - m.position.z) * blend;
      m.position.x += (targetX - m.position.x) * blend;
      // Shortest-angle yaw blend
      let dyaw = targetYaw - m.rotation.y;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      m.rotation.y += dyaw * blend;
      } // venueOpen
    }

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

    // East video wall — synced vibe frames (all 5 advance together)
    const vibeWall = g.userData.vibeWall;
    if (vibeWall?.length) {
      const frame = Math.floor(nowSec * 0.55) % 12;
      if (g.userData._vibeFrame !== frame) {
        g.userData._vibeFrame = frame;
        for (const entry of vibeWall) {
          if (!entry.screen?.material) continue;
          const tex = vibeWallTex(entry.slot, frame, entry.isCenter);
          const old = entry.screen.material.map;
          entry.screen.material.map = tex;
          entry.screen.material.needsUpdate = true;
          if (old) old.dispose?.();
        }
      }
    }

    // Rotate music-video + bar-ad graphics every few seconds
    const rotateMaps = (list, period) => {
      if (!list) return;
      for (const entry of list) {
        if (!entry.maps?.length || !entry.screen?.material) continue;
        const next = Math.floor(nowSec / period) % entry.maps.length;
        if (next !== entry.idx) {
          entry.idx = next;
          entry.screen.material.map = entry.maps[next];
          entry.screen.material.needsUpdate = true;
        }
      }
    };
    rotateMaps(g.userData.musicScreens, 4.5);
    rotateMaps(g.userData.adScreens, 6.5);

    // Lot-style crowd: enter, order, mingle, patio, karaoke
    g.userData.interiorLife?.tick?.(nowSec, g.userData._lifeOpts || { karaoke: true, open: true });
  };

  // Default entrance view — hero shot of the rainbow bar (matches the
  // reference screenshot: bar centered, party cam right, rail/column left).
  // Standing mid-room on the customer side looking south at the bar.
  g.userData.spawn = {
    x: 0.55,
    y: WALK.eyeY,
    z: 1.15,
    yaw: 92, // almost due south (+X) at the bar, slight east bias
    pitch: -7,
  };
  g.userData.walk = { ...WALK };
  // First-person solids (bar, rail, ATM, cooler, stage, …)
  g.userData.colliders = colliders;
  // Tight radius so you can pass aisles / curtain gap without sticky walls
  g.userData.playerRadius = 0.22;
  g.userData.subject = {
    center: new THREE.Vector3(0, 1.4, 0),
    radius: 6.5,
  };

  // ── Living room: lot pedestrians + karaoke host ─────────────────
  {
    const stage = g.userData.performanceStage;
    const mingleSpots = [
      { x: -1.2, z: 0.2 }, // dance floor / pit edge
      { x: -0.4, z: -1.0 },
      { x: 0.6, z: 1.2 },
      { x: -2.0, z: 1.6 }, // near stage apron
      { x: -1.5, z: -2.4 }, // DJ side
      { x: 1.2, z: 0.4 },
      { x: -0.2, z: 2.2 }, // west room
      { x: 0.5, z: -1.5 }, // open floor south of pit
    ];
    g.userData.interiorLife = createInteriorLife(g, {
      entrance: { x: g.userData.spawn.x, z: g.userData.spawn.z + 0.35 },
      barFrontX: g.userData.barFrontX ?? halfW - 2.8,
      stoolZs: g.userData.stoolZs || [-2, -1.45, -0.9, -0.35, 0.2, 0.75, 1.3, 1.85, 2.4],
      mingleSpots,
      patioDoor: g.userData.patioDoor || { x: 1.55, z: -halfD + 0.5 },
      patioSpot: g.userData.patioSpot || { x: 1.55, z: -halfD + 0.9 },
      stage,
      walk: WALK,
      bartender: g.userData.bartender,
    });
    g.userData._lifeOpts = { karaoke: true, open: true };
  }

  return g;
}
