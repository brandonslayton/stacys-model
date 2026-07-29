/**
 * taco.js — festival taco stand by the diamond pole sign.
 *
 * Button toggle:
 *   OFF → white SUV rolls up, unloads, pops a square vendor tent + flattop +
 *         tables + A-frame "TACOS $" sign, two vendors open for business.
 *         SUV parks on the far (north) side of the tent — away from the building.
 *   OPEN → sidewalk customers eat; some linger, some get drawn into Stacy's.
 *   ON → pack up, load the SUV, drive off.
 *
 * Camera: pocket.js holds focus while `busy` (arrival → build → park).
 */
import * as THREE from "three";
import { box, cyl, canvasTexture, roundRect } from "./kit.js";
import { createCar, createPedestrian, tickCarLights, setCarLightsOff } from "./agents.js?v=20260728m6";
import {
  STREET,
  roadPolyline,
  sidewalkPoint,
  sidewalkPolyline,
  lanePoint,
} from "./street.js";

const ROAD = 7.2;
const LOT = 3.4;
const WALK = 1.7;

const ST = {
  OFF: "off",
  SUV_IN: "suv_in",
  UNLOAD: "unload",
  BUILD: "build",
  OPEN: "open",
  PACK: "pack",
  SUV_OUT: "suv_out",
};

const VENDOR_COLORS = [0xc45c2a, 0x2a5a3a]; // burnt orange + deep green polos
const EATER_COLORS = [0xffb6c1, 0x7ec8e3, 0xc5a3ff, 0xffd580, 0x98d8aa, 0xe8c4a8];

function aFrameSignTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 320;
  const ctx = c.getContext("2d");
  // White board
  ctx.fillStyle = "#f4f2ec";
  ctx.fillRect(0, 0, 256, 320);
  ctx.strokeStyle = "#2a2a30";
  ctx.lineWidth = 10;
  roundRect(ctx, 10, 10, 236, 300, 8);
  ctx.stroke();
  // Red TACOS $
  ctx.fillStyle = "#e01820";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 64px Arial, sans-serif";
  ctx.fillText("TACOS", 128, 120);
  ctx.font = "bold 92px Arial, sans-serif";
  ctx.fillText("$", 128, 210);
  // Little chili accents
  ctx.font = "28px Arial, sans-serif";
  ctx.fillText("·  ·  ·", 128, 270);
  return canvasTexture(c, 4);
}

/**
 * Square white festival vendor tent — four poles + peaked canopy.
 * Local origin at ground centre; +Z is the serving face.
 */
function buildTent() {
  const g = new THREE.Group();
  g.name = "tacoTent";
  const half = 1.15;
  const poleH = 2.05;
  const peakH = 2.55;
  const white = { roughness: 0.72, metalness: 0.05 };
  const steel = { roughness: 0.45, metalness: 0.35 };

  for (const [x, z] of [
    [-half, -half],
    [half, -half],
    [-half, half],
    [half, half],
  ]) {
    const p = cyl(0.035, 0.04, poleH, 0xd8d4cc, steel, 6);
    p.position.set(x, poleH * 0.5, z);
    g.add(p);
  }
  // Cross beams
  for (const z of [-half, half]) {
    const beam = box(half * 2 + 0.08, 0.05, 0.05, 0xc8c4bc, steel);
    beam.position.set(0, poleH - 0.02, z);
    g.add(beam);
  }
  for (const x of [-half, half]) {
    const beam = box(0.05, 0.05, half * 2 + 0.08, 0xc8c4bc, steel);
    beam.position.set(x, poleH - 0.02, 0);
    g.add(beam);
  }
  // Peaked canopy — four sloped panels meeting at centre
  const peak = new THREE.Object3D();
  peak.position.y = peakH;
  g.add(peak);
  // Simple flat roof + slight peak block (reads festival without custom geo)
  const roof = box(half * 2.15, 0.06, half * 2.15, 0xf7f5f0, white);
  roof.position.y = poleH + 0.02;
  g.add(roof);
  const peakCap = box(0.55, 0.12, 0.55, 0xf0ece4, white);
  peakCap.position.y = poleH + 0.18;
  g.add(peakCap);
  // Valance skirt on three sides (open serving face +Z)
  for (const [dx, dz, w, d] of [
    [0, -half, half * 2.1, 0.06],
    [-half, 0, 0.06, half * 2.1],
    [half, 0, 0.06, half * 2.1],
  ]) {
    const val = box(w, 0.22, d, 0xf2f0ea, white);
    val.position.set(dx, poleH - 0.12, dz);
    g.add(val);
  }
  // Red accent stripe on valance front corners
  for (const x of [-half * 0.85, half * 0.85]) {
    const stripe = box(0.12, 0.22, 0.05, 0xc41e3a, {
      roughness: 0.5,
      emissive: 0x801018,
      emissiveIntensity: 0.08,
    });
    stripe.position.set(x, poleH - 0.12, half);
    g.add(stripe);
  }
  return g;
}

function buildFlattop() {
  const g = new THREE.Group();
  // Cart body
  const cart = box(1.1, 0.55, 0.65, 0x3a3a42, { roughness: 0.55, metalness: 0.25 });
  cart.position.y = 0.45;
  g.add(cart);
  // Steel griddle top (hot)
  const top = box(1.05, 0.06, 0.6, 0x5a5a62, {
    roughness: 0.35,
    metalness: 0.55,
    emissive: 0x3a2010,
    emissiveIntensity: 0.35,
  });
  top.position.y = 0.76;
  g.add(top);
  // Heat shimmer proxy — bright strip
  const heat = box(0.9, 0.02, 0.08, 0xff6020, {
    roughness: 0.3,
    emissive: 0xff4010,
    emissiveIntensity: 0.55,
  });
  heat.position.set(0, 0.8, 0.2);
  g.add(heat);
  // Wheels
  for (const [x, z] of [
    [-0.4, 0.28],
    [0.4, 0.28],
    [-0.4, -0.28],
    [0.4, -0.28],
  ]) {
    const w = cyl(0.09, 0.09, 0.06, 0x1a1a1e, {}, 8);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.09, z);
    g.add(w);
  }
  // Propane tank
  const tank = cyl(0.1, 0.1, 0.35, 0xc8ccd0, { metalness: 0.4, roughness: 0.4 }, 8);
  tank.position.set(-0.55, 0.28, 0);
  g.add(tank);
  return g;
}

function buildServingTable() {
  const g = new THREE.Group();
  const top = box(1.4, 0.06, 0.55, 0xc4a882, { roughness: 0.7 });
  top.position.y = 0.78;
  g.add(top);
  for (const x of [-0.6, 0.6]) {
    for (const z of [-0.2, 0.2]) {
      const leg = box(0.06, 0.78, 0.06, 0x4a4038, { roughness: 0.8 });
      leg.position.set(x, 0.39, z);
      g.add(leg);
    }
  }
  // Salsa / salsa cups on table
  for (const [x, col] of [
    [-0.35, 0xc41e3a],
    [-0.15, 0x2a8a3a],
    [0.1, 0xe8a040],
  ]) {
    const cup = cyl(0.05, 0.045, 0.08, col, { roughness: 0.5 }, 6);
    cup.position.set(x, 0.86, 0.05);
    g.add(cup);
  }
  // Stack of tortillas
  const tort = cyl(0.12, 0.12, 0.06, 0xe8d4a8, { roughness: 0.85 }, 10);
  tort.position.set(0.4, 0.85, 0);
  g.add(tort);
  return g;
}

function buildPicnicTable() {
  const g = new THREE.Group();
  const top = box(1.2, 0.05, 0.55, 0xb89868, { roughness: 0.75 });
  top.position.y = 0.72;
  g.add(top);
  for (const z of [-0.38, 0.38]) {
    const bench = box(1.15, 0.05, 0.22, 0xa88858, { roughness: 0.75 });
    bench.position.set(0, 0.42, z);
    g.add(bench);
  }
  for (const x of [-0.5, 0.5]) {
    const leg = box(0.08, 0.7, 0.5, 0x6a5840, { roughness: 0.8 });
    leg.position.set(x, 0.35, 0);
    g.add(leg);
  }
  return g;
}

function buildAFrame() {
  const g = new THREE.Group();
  const tex = aFrameSignTexture();
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.55,
    metalness: 0.05,
    flatShading: true,
  });
  // Two boards leaning as an A
  for (const side of [-1, 1]) {
    const board = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.9), mat);
    board.position.set(0, 0.55, side * 0.18);
    board.rotation.x = side * 0.35;
    g.add(board);
  }
  // Base feet
  const foot = box(0.75, 0.04, 0.45, 0x2a2a30, { roughness: 0.7 });
  foot.position.y = 0.02;
  g.add(foot);
  return g;
}

function buildCooler() {
  const g = new THREE.Group();
  const body = box(0.55, 0.4, 0.4, 0xc41e3a, { roughness: 0.5 });
  body.position.y = 0.22;
  g.add(body);
  const lid = box(0.58, 0.06, 0.43, 0xffffff, { roughness: 0.4 });
  lid.position.y = 0.45;
  g.add(lid);
  return g;
}

function buildVendor(shirt) {
  const g = createPedestrian(shirt);
  // Apron
  const apron = box(0.22, 0.28, 0.06, 0xf0ece4, { roughness: 0.8 });
  apron.position.set(0, 0.48, 0.1);
  g.add(apron);
  // Cap
  const cap = cyl(0.12, 0.11, 0.07, 0xc41e3a, { roughness: 0.6 }, 8);
  cap.position.y = 1.08;
  g.add(cap);
  return g;
}

export class TacoSystem {
  /**
   * @param {THREE.Object3D} parent
   * @param {THREE.Group} venue
   * @param {import('./life.js').LifeSystem} life
   */
  constructor(parent, venue, life) {
    this.root = new THREE.Group();
    this.root.name = "taco";
    parent.add(this.root);

    this.life = life;
    this.venue = venue;
    venue.updateWorldMatrix(true, true);
    const m = venue.matrixWorld;

    const ud = venue.userData.tacoStand;
    if (ud) {
      this.spot = new THREE.Vector3(ud.x, 0, ud.z).applyMatrix4(m);
      this.unload = new THREE.Vector3(ud.unloadX, 0.02, ud.unloadZ).applyMatrix4(m);
      this.park = new THREE.Vector3(ud.parkX, 0.02, ud.parkZ).applyMatrix4(m);
      this.faceY = venue.rotation.y + (ud.faceY || 0);
      // Park parallel to 7th so the SUV sits beside the tent, not through it
      this.parkFaceY = venue.rotation.y + (ud.parkFaceY ?? 0);
    } else {
      // Fallback near NW if metadata missing
      this.spot = new THREE.Vector3(-7.5, 0, 6.2);
      this.unload = this.spot.clone().add(new THREE.Vector3(1.8, 0.02, 0.8));
      this.park = this.spot.clone().add(new THREE.Vector3(2.4, 0.02, 0.3));
      this.faceY = Math.PI / 2;
      this.parkFaceY = 0;
    }

    // Stand kit (hidden until built)
    this.stand = new THREE.Group();
    this.stand.name = "tacoStand";
    this.stand.position.copy(this.spot);
    this.stand.rotation.y = this.faceY;
    this.stand.visible = false;
    this.root.add(this.stand);

    this.tent = buildTent();
    this.stand.add(this.tent);

    // Layout is local: +Z = serving face (world +X / toward lot & sign).
    // Keep props under/near the tent footprint (half ≈ 1.15). SUV parks on
    // the far north side of the tent, so props can use the street-side apron.
    //
    // Flattop sits mid-rear of the tent; the cook stands BEHIND it (−Z), never
    // on the griddle. Server stands at the serving table on +Z.
    this.flattop = buildFlattop();
    this.flattop.position.set(-0.2, 0, -0.2);
    this.stand.add(this.flattop);

    this.table = buildServingTable();
    this.table.position.set(0.2, 0, 0.55);
    this.stand.add(this.table);

    this.cooler = buildCooler();
    this.cooler.position.set(-0.85, 0, 0.15);
    this.stand.add(this.cooler);

    this.aframe = buildAFrame();
    this.aframe.position.set(0.55, 0, 1.2);
    this.stand.add(this.aframe);

    this.picnic = [buildPicnicTable(), buildPicnicTable()];
    // One table in front of the tent, one slightly aside — clear of the north SUV bay
    this.picnic[0].position.set(-0.15, 0, 1.55);
    this.picnic[1].position.set(0.85, 0, 1.55);
    this.stand.add(this.picnic[0], this.picnic[1]);

    // Build pieces animate in order
    this.buildPieces = [
      this.tent,
      this.flattop,
      this.table,
      this.cooler,
      this.aframe,
      this.picnic[0],
      this.picnic[1],
    ];
    for (const p of this.buildPieces) {
      p.scale.setScalar(0.01);
      p.visible = false;
    }

    // Home poses in local stand space (used for work animation).
    // Cook is fully behind the flattop cart (rear edge ~−0.52, body r≈0.15).
    this._cookHome = new THREE.Vector3(-0.2, 0, -0.78);
    this._serverHome = new THREE.Vector3(0.48, 0, 0.38);

    this.vendors = [
      buildVendor(VENDOR_COLORS[0]),
      buildVendor(VENDOR_COLORS[1]),
    ];
    this.vendors[0].position.copy(this._cookHome);
    this.vendors[1].position.copy(this._serverHome);
    for (const v of this.vendors) {
      v.visible = false;
      this.stand.add(v);
    }

    // White SUV
    this.suv = createCar({ color: 0xf4f2ec, style: "suv" });
    this.suv.visible = false;
    this.root.add(this.suv);

    this.customers = [];
    this.state = ST.OFF;
    this.t = 0;
    this.buildI = 0;
    this.path = null;
    this.pathI = 0;
    this._spawnAcc = 0;
    this.clock = 0;
    this._parking = false;
    this._leaving = false;

    // Eat slots at picnic tables (world-updated when open)
    this.eatSlots = [];
  }

  get busy() {
    // Include post-build parking so the camera stays through the full setup
    return (
      this.state === ST.SUV_IN ||
      this.state === ST.UNLOAD ||
      this.state === ST.BUILD ||
      this.state === ST.PACK ||
      this.state === ST.SUV_OUT ||
      !!this._parking
    );
  }

  get open() {
    return this.state === ST.OPEN;
  }

  get isOn() {
    return this.state !== ST.OFF && this.state !== ST.SUV_OUT;
  }

  /** Focus framing for the camera. */
  get focusTarget() {
    return {
      az: 155,
      el: 24,
      zoom: 0.4,
      target: [this.spot.x + 0.6, 0.65, this.spot.z],
    };
  }

  /** Start setup. Returns false if already running/open. */
  start() {
    if (this.state !== ST.OFF) return false;
    // Approach on 7th, pull to the curb abeam the sign, then nose into the
    // off-road pad next to the property line (never set up in the travel lane).
    const curbX = this.unload.x + 1.2;
    const spawnX = curbX + 11 + Math.random() * 4;
    this.path = this._clean([
      ...roadPolyline(spawnX, curbX, -1),
      lanePoint(curbX, -1),
      new THREE.Vector3(curbX, 0.02, STREET.curbZ),
      this.unload.clone(),
    ]);
    if (this.path.length < 2) return false;

    this.suv.visible = true;
    this.suv.position.copy(this.path[0]);
    this.suv.rotation.y = Math.atan2(
      this.path[1].x - this.path[0].x,
      this.path[1].z - this.path[0].z
    );
    this.pathI = 0;
    this.t = 0;
    this.buildI = 0;
    this._parking = false;
    this._leaving = false;
    for (const p of this.buildPieces) {
      p.scale.setScalar(0.01);
      p.visible = false;
    }
    for (const v of this.vendors) {
      v.visible = false;
      v.rotation.set(0, 0, 0);
    }
    this.vendors[0].position.copy(this._cookHome);
    this.vendors[1].position.copy(this._serverHome);
    this.stand.visible = true;
    this.state = ST.SUV_IN;
    if (this.life) this.life.tacoOpen = false;
    return true;
  }

  /** Pack up and leave. Returns false if not open. */
  stop() {
    if (this.state !== ST.OPEN) return false;
    this._clearCustomers();
    if (this.life) this.life.tacoOpen = false;
    this.t = 0;
    this.buildI = this.buildPieces.length - 1;
    this.state = ST.PACK;
    return true;
  }

  /** Toggle open/closed. */
  toggle() {
    if (this.state === ST.OFF) return this.start();
    if (this.state === ST.OPEN) return this.stop();
    return false;
  }

  _clean(pts) {
    const out = [];
    for (const p of pts) {
      if (!p) continue;
      const last = out[out.length - 1];
      if (!last || Math.hypot(p.x - last.x, p.z - last.z) >= 0.15) out.push(p.clone());
      else out[out.length - 1] = p.clone();
    }
    return out;
  }

  _advance(mesh, path, pathI, speed, dt, finalY = null) {
    if (pathI >= path.length - 1) {
      if (finalY != null) mesh.rotation.y = finalY;
      return { done: true, pathI };
    }
    const target = path[pathI + 1];
    const pos = mesh.position;
    const dx = target.x - pos.x;
    const dz = target.z - pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.12) {
      const next = pathI + 1;
      if (next >= path.length - 1) {
        if (finalY != null) mesh.rotation.y = finalY;
        return { done: true, pathI: next };
      }
      return { done: false, pathI: next };
    }
    const step = Math.min(dist, speed * dt);
    pos.x += (dx / dist) * step;
    pos.z += (dz / dist) * step;
    mesh.rotation.y = Math.atan2(dx, dz);
    return { done: false, pathI };
  }

  _refreshEatSlots() {
    // Picnic table seat positions in world space
    this.eatSlots = [];
    this.stand.updateWorldMatrix(true, true);
    for (const table of this.picnic) {
      for (const local of [
        new THREE.Vector3(-0.3, 0, 0.38),
        new THREE.Vector3(0.3, 0, 0.38),
        new THREE.Vector3(-0.3, 0, -0.38),
        new THREE.Vector3(0.3, 0, -0.38),
      ]) {
        const w = local.clone().applyMatrix4(table.matrixWorld);
        this.eatSlots.push({ pos: w, free: true });
      }
    }
  }

  _clearCustomers() {
    for (const c of this.customers) {
      this.root.remove(c.mesh);
    }
    this.customers = [];
  }

  /**
   * Cook works the flattop from behind (−Z of the cart); server works the
   * counter on the +Z face. Both stay clear of prop volumes — no standing
   * through the griddle or table.
   */
  _animateVendors() {
    const cook = this.vendors[0];
    const server = this.vendors[1];
    const t = this.clock;

    if (cook.visible) {
      // Side-to-side scrape along the griddle. Lean is small so the body never
      // crosses into the cart volume (home.z keeps ≥0.15 clear of the rear face).
      const side = Math.sin(t * 2.1) * 0.12;
      const reach = Math.abs(Math.sin(t * 2.1)) * 0.04;
      cook.position.set(
        this._cookHome.x + side,
        Math.abs(Math.sin(t * 4.2)) * 0.025,
        this._cookHome.z + reach
      );
      // Face the flattop centre (toward +Z from behind)
      cook.rotation.y = Math.atan2(
        this.flattop.position.x - cook.position.x,
        this.flattop.position.z - cook.position.z
      );
      // Tiny torso nod (group tilt) sells the scrape without mesh bones
      cook.rotation.x = -0.08 - Math.abs(Math.sin(t * 2.1)) * 0.05;
      cook.rotation.z = Math.sin(t * 2.1) * 0.06;
    }

    if (server.visible) {
      // Small step between salsa cups and the customer side
      const sway = Math.sin(t * 1.4 + 1.2) * 0.08;
      server.position.set(
        this._serverHome.x + sway,
        Math.abs(Math.sin(t * 3.2 + 0.5)) * 0.02,
        this._serverHome.z + Math.sin(t * 1.4) * 0.03
      );
      // Face customers on the serving face (+Z local)
      server.rotation.y = 0.15 + Math.sin(t * 0.7) * 0.12;
      server.rotation.x = 0;
      server.rotation.z = 0;
    }
  }

  _spawnCustomer() {
    if (this.customers.length >= 8) return;
    const free = this.eatSlots.filter((s) => s.free);
    if (!free.length) return;
    const slot = free[(Math.random() * free.length) | 0];
    slot.free = false;

    const mesh = createPedestrian(
      EATER_COLORS[(Math.random() * EATER_COLORS.length) | 0]
    );
    const dir = Math.random() > 0.5 ? 1 : -1;
    const spawnX = this.spot.x + dir * (8 + Math.random() * 6);
    const path = this._clean([
      sidewalkPoint(spawnX),
      ...sidewalkPolyline(spawnX, slot.pos.x),
      new THREE.Vector3(slot.pos.x, 0, slot.pos.z),
    ]);
    mesh.position.copy(path[0]);
    this.root.add(mesh);
    this.customers.push({
      mesh,
      path,
      pathI: 0,
      slot,
      state: "to_table",
      dwell: 14 + Math.random() * 28,
      speed: WALK + Math.random() * 0.35,
      bob: Math.random() * 10,
    });
  }

  _tickCustomers(dt) {
    for (let i = this.customers.length - 1; i >= 0; i--) {
      const c = this.customers[i];
      c.bob += dt * 9;

      if (c.state === "to_table") {
        const r = this._advance(c.mesh, c.path, c.pathI, c.speed, dt);
        c.pathI = r.pathI;
        c.mesh.position.y = Math.abs(Math.sin(c.bob)) * 0.04;
        if (!r.done) continue;
        c.mesh.position.y = 0;
        c.mesh.position.copy(c.slot.pos);
        // Face roughly toward tent
        c.mesh.rotation.y = Math.atan2(
          this.spot.x - c.slot.pos.x,
          this.spot.z - c.slot.pos.z
        );
        c.state = "eat";
        continue;
      }

      if (c.state === "eat") {
        c.dwell -= dt;
        // Small idle sway
        c.mesh.position.y = Math.abs(Math.sin(c.bob * 0.4)) * 0.015;
        if (c.dwell > 0) continue;
        c.mesh.position.y = 0;
        c.slot.free = true;
        // ~45% get drawn into the bar; rest leave along the sidewalk
        if (Math.random() < 0.45 && this.life?.attractFrom) {
          const from = c.mesh.position.clone();
          this.root.remove(c.mesh);
          this.customers.splice(i, 1);
          this.life.attractFrom(from);
          continue;
        }
        const dir = Math.random() > 0.5 ? 1 : -1;
        const exitX = c.mesh.position.x + dir * (9 + Math.random() * 5);
        c.path = this._clean([
          c.mesh.position.clone(),
          sidewalkPoint(c.mesh.position.x),
          ...sidewalkPolyline(c.mesh.position.x, exitX),
        ]);
        c.pathI = 0;
        c.state = "leave";
        continue;
      }

      if (c.state === "leave") {
        const r = this._advance(c.mesh, c.path, c.pathI, c.speed * 1.05, dt);
        c.pathI = r.pathI;
        c.mesh.position.y = Math.abs(Math.sin(c.bob)) * 0.04;
        if (!r.done) continue;
        this.root.remove(c.mesh);
        this.customers.splice(i, 1);
      }
    }
  }

  update(dt) {
    if (this.state === ST.OFF) return;
    const t = Math.min(dt, 0.05);
    this.clock += t;

    // Vendor work animation when the stand is up
    if (this.state === ST.OPEN || this.state === ST.BUILD) {
      this._animateVendors();
      // Flattop heat pulse
      this.flattop.traverse((o) => {
        if (o.material?.emissiveIntensity != null && o.material.emissive) {
          if (o.material.emissive.r > 0.5) {
            o.material.emissiveIntensity = 0.4 + Math.sin(this.clock * 5) * 0.2;
          }
        }
      });
    }

    switch (this.state) {
      case ST.SUV_IN: {
        const scale = this.life?.frontSpeedScale?.(this.suv) ?? 1;
        const r = this._advance(
          this.suv,
          this.path,
          this.pathI,
          ROAD * 0.85 * scale,
          t,
          this.faceY + Math.PI // rear toward stand for unload
        );
        this.pathI = r.pathI;
        tickCarLights(this.suv, this.clock, { engineOn: true });
        if (!r.done) break;
        // Rear toward the tent for unload
        this.suv.rotation.y = this.faceY + Math.PI;
        setCarLightsOff(this.suv);
        this.t = 0;
        this.state = ST.UNLOAD;
        break;
      }
      case ST.UNLOAD: {
        // Brief pause — doors / tailgate
        this.t += t;
        if (this.t < 0.8) break;
        this.t = 0;
        this.buildI = 0;
        this.state = ST.BUILD;
        break;
      }
      case ST.BUILD: {
        this.t += t;
        // Pop pieces in every ~0.45s
        const interval = 0.42;
        while (
          this.buildI < this.buildPieces.length &&
          this.t >= interval * (this.buildI + 1)
        ) {
          const piece = this.buildPieces[this.buildI];
          piece.visible = true;
          piece.scale.setScalar(0.01);
          this.buildI++;
        }
        // Scale up visible pieces toward 1
        for (let i = 0; i < this.buildI; i++) {
          const p = this.buildPieces[i];
          const s = p.scale.x;
          if (s < 1) p.scale.setScalar(Math.min(1, s + t * 3.2));
        }
        // Vendors appear near end
        if (this.buildI >= this.buildPieces.length - 1) {
          for (const v of this.vendors) v.visible = true;
        }
        if (this.buildI < this.buildPieces.length) break;
        if (this.buildPieces.some((p) => p.scale.x < 0.99)) break;

        // Park SUV on the far (north) side of the tent — swing around the
        // street-side apron first so the path never cuts through the canopy.
        const around = new THREE.Vector3(
          this.park.x,
          0.02,
          Math.max(this.suv.position.z, this.park.z) + 1.1
        );
        this.path = this._clean([
          this.suv.position.clone(),
          around,
          this.park.clone(),
        ]);
        this.pathI = 0;
        this.state = ST.OPEN;
        this._parking = true;
        this._refreshEatSlots();
        if (this.life) this.life.tacoOpen = true;
        this._spawnAcc = 2; // first customer soon
        break;
      }
      case ST.OPEN: {
        if (this._parking) {
          const r = this._advance(
            this.suv,
            this.path,
            this.pathI,
            LOT,
            t,
            this.parkFaceY
          );
          this.pathI = r.pathI;
          tickCarLights(this.suv, this.clock, { engineOn: true });
          if (!r.done) break;
          this.suv.rotation.y = this.parkFaceY;
          setCarLightsOff(this.suv);
          this._parking = false;
        }
        // Attract customers
        this._spawnAcc += t;
        if (this._spawnAcc >= 3.5 + Math.random() * 2.5) {
          this._spawnAcc = 0;
          if (Math.random() < 0.72) this._spawnCustomer();
        }
        this._tickCustomers(t);
        break;
      }
      case ST.PACK: {
        this.t += t;
        // Reverse build — hide pieces
        const interval = 0.28;
        while (this.buildI >= 0 && this.t >= interval * (this.buildPieces.length - this.buildI)) {
          const piece = this.buildPieces[this.buildI];
          piece.visible = false;
          piece.scale.setScalar(0.01);
          this.buildI--;
        }
        for (const v of this.vendors) v.visible = false;
        if (this.buildI >= 0) break;

        // SUV pulls to unload, then leaves
        this.path = this._clean([
          this.suv.position.clone(),
          this.unload.clone(),
        ]);
        this.pathI = 0;
        this.t = 0;
        this.state = ST.SUV_OUT;
        this._leaving = false;
        break;
      }
      case ST.SUV_OUT: {
        if (!this._leaving) {
          const r = this._advance(this.suv, this.path, this.pathI, LOT, t);
          this.pathI = r.pathI;
          tickCarLights(this.suv, this.clock, { engineOn: true });
          if (!r.done) break;
          // Out onto 7th northbound
          const x = this.suv.position.x;
          this.path = this._clean([
            this.suv.position.clone(),
            new THREE.Vector3(x, 0.02, STREET.curbZ),
            lanePoint(x, -1),
            ...roadPolyline(x, STREET.xMin + 1, -1),
          ]);
          this.pathI = 0;
          this._leaving = true;
          break;
        }
        const scale = this.life?.frontSpeedScale?.(this.suv) ?? 1;
        const r = this._advance(
          this.suv,
          this.path,
          this.pathI,
          ROAD * scale,
          t
        );
        this.pathI = r.pathI;
        tickCarLights(this.suv, this.clock, { engineOn: true });
        if (!r.done) break;
        this.suv.visible = false;
        setCarLightsOff(this.suv);
        this.stand.visible = false;
        this.state = ST.OFF;
        this._leaving = false;
        break;
      }
      default:
        break;
    }
  }
}
