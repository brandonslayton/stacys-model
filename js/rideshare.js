/**
 * rideshare.js — Gaymo pickup / drop-off at the curb.
 *
 * Tap: one or two guests walk out of the porch, wait on the sidewalk, a Gaymo
 * (Waymo-branded robotaxi, hover edition) pulls up, they board, and it glides off.
 *
 * Double-tap or long-press: a Gaymo arrives, drops one or two people off, they
 * walk into the bar, and it leaves.
 *
 * Separate from life.js on purpose — ambient cars are anonymous and pool-based;
 * this is a named one-shot performance with a unique robotaxi mesh.
 *
 * Visuals lean on the real Jaguar I-PACE Waymo fleet: white body, charcoal
 * rocker, roof "top hat" lidar, perimeter corner sensors, cyan status LEDs —
 * then bent into Stacy's: "Gaymo" wordmark, pride underglow, and a true hover
 * (no wheels, soft thruster pads, road shadow, idle bob).
 */
import * as THREE from "three";
import { box, cyl, canvasTexture, roundRect } from "./kit.js";
import { PED_COLORS, createPedestrian } from "./agents.js";
import { STREET, roadPolyline, sidewalkPoint } from "./street.js";

const WALK = 2.15;
const ROAD = 8.4;
const ROAD_SLOW = 3.6;
/** Spawn just off-camera south of the porch so the car is on-screen quickly. */
const ARRIVE_LEAD = 9.5;
const LEAVE_X = STREET.xMin + 1.5;
/** How high the hull origin sits above the asphalt (clear float gap). */
const HOVER_Y = 0.38;
const HOVER_BOB = 0.05;

const ST = {
  GUESTS_OUT: "guests_out",
  WAIT_CURB: "wait_curb",
  WAYMO_IN: "waymo_in",
  BOARD: "board",
  DEBOARD: "deboard",
  TO_DOOR: "to_door",
  WAYMO_OUT: "waymo_out",
};

const WHITE = {
  roughness: 0.38,
  metalness: 0.12,
  emissive: 0xe8ecf0,
  emissiveIntensity: 0.14,
};
const CHAR = { roughness: 0.48, metalness: 0.22 };
const GLASS = {
  roughness: 0.12,
  metalness: 0.45,
  emissive: 0x081018,
  emissiveIntensity: 0.14,
};

/**
 * Sleek hovering Gaymo — Waymo I-PACE silhouette, no wheels, roof top-hat lidar,
 * corner perimeter sensors, cyan LEDs, "Gaymo" doors, pride thruster glow.
 */
export function createWaymo() {
  const g = new THREE.Group();
  g.name = "gaymo";

  // ── Hull (sleeker than a boxy sedan: long nose, set-back cabin, tapered rear)
  // Smooth underbelly — the hover reads because nothing touches the road
  const belly = box(1.05, 0.08, 2.12, 0x1c1c22, { ...CHAR, roughness: 0.55 });
  belly.position.y = 0.1;
  g.add(belly);

  // Charcoal rocker / side cladding (Waymo I-PACE lower body)
  const rocker = box(1.16, 0.16, 2.18, 0x1a1a1e, CHAR);
  rocker.position.y = 0.22;
  g.add(rocker);

  // Main white body, slightly longer and lower than ambient cars
  const body = box(1.08, 0.32, 2.1, 0xf4f5f7, WHITE);
  body.position.y = 0.46;
  g.add(body);

  // Nose taper (bumper volume, a hair narrower)
  const nose = box(0.98, 0.22, 0.32, 0xf0f1f3, WHITE);
  nose.position.set(0, 0.4, 1.12);
  g.add(nose);

  // Rear haunch
  const haunch = box(1.02, 0.24, 0.28, 0xf0f1f3, WHITE);
  haunch.position.set(0, 0.42, -1.08);
  g.add(haunch);

  // Thin charcoal belt (window sill line)
  const belt = box(1.1, 0.04, 2.0, 0x2a2a32, CHAR);
  belt.position.y = 0.64;
  g.add(belt);

  // Pride accent pin-stripe on the belt — fun without drowning the Waymo read
  const pride = _prideStripeMesh(1.06, 0.018, 1.95);
  pride.position.y = 0.655;
  g.add(pride);

  // Greenhouse — deep tint, empty cabin (no driver)
  const cabin = box(0.94, 0.34, 1.05, 0x121c24, GLASS);
  cabin.position.set(0, 0.84, -0.02);
  g.add(cabin);

  // Sloped A-pillar / windshield volume
  const windshield = box(0.9, 0.28, 0.38, 0x101820, GLASS);
  windshield.position.set(0, 0.82, 0.58);
  windshield.rotation.x = -0.22;
  g.add(windshield);

  // Rear glass
  const rearGlass = box(0.88, 0.26, 0.3, 0x101820, GLASS);
  rearGlass.position.set(0, 0.8, -0.62);
  rearGlass.rotation.x = 0.18;
  g.add(rearGlass);

  // Roof skin
  const roof = box(0.9, 0.05, 1.0, 0xf2f3f5, WHITE);
  roof.position.set(0, 1.04, -0.02);
  g.add(roof);

  // Front fascia + cyan status bar (Waymo signature)
  const fascia = box(0.92, 0.1, 0.07, 0x16161a, CHAR);
  fascia.position.set(0, 0.34, 1.26);
  g.add(fascia);
  const led = box(0.68, 0.035, 0.045, 0x3ec8ff, {
    roughness: 0.22,
    emissive: 0x3ec8ff,
    emissiveIntensity: 0.95,
  });
  led.position.set(0, 0.38, 1.28);
  led.name = "waymoLed";
  g.add(led);

  // Slim headlight blades
  for (const side of [-1, 1]) {
    const hl = box(0.22, 0.03, 0.04, 0xe8f4ff, {
      roughness: 0.2,
      emissive: 0xc8e8ff,
      emissiveIntensity: 0.55,
    });
    hl.position.set(side * 0.38, 0.42, 1.25);
    g.add(hl);
  }

  // Rear light bar
  const rear = box(0.78, 0.04, 0.04, 0xff2a44, {
    roughness: 0.28,
    emissive: 0xff2240,
    emissiveIntensity: 0.6,
  });
  rear.position.set(0, 0.4, -1.22);
  g.add(rear);

  // ── Hover thrusters (four soft pads under the belly — no wheels) ──
  const thrusters = [];
  for (const [tx, tz] of [
    [-0.32, 0.55],
    [0.32, 0.55],
    [-0.32, -0.55],
    [0.32, -0.55],
  ]) {
    const pad = cyl(0.12, 0.14, 0.04, 0x22222a, { ...CHAR, roughness: 0.4 }, 12);
    pad.position.set(tx, 0.04, tz);
    g.add(pad);
    const glow = cyl(0.1, 0.11, 0.02, 0xff88cc, {
      roughness: 0.3,
      emissive: 0xff66bb,
      emissiveIntensity: 0.9,
      transparent: true,
      opacity: 0.95,
    }, 12);
    glow.position.set(tx, 0.015, tz);
    g.add(glow);
    thrusters.push(glow);
  }

  // Road shadow disc — makes the float gap legible against asphalt
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.85, 20),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
    })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.025;
  shadow.name = "hoverShadow";
  g.add(shadow);

  // Soft under-glow wash (pride-tinted, sits in world under the car)
  const wash = cyl(0.55, 0.75, 0.02, 0xff66bb, {
    roughness: 1,
    emissive: 0xff55aa,
    emissiveIntensity: 0.55,
    transparent: true,
    opacity: 0.45,
  }, 16);
  wash.position.y = 0.03;
  wash.name = "hoverWash";
  g.add(wash);

  // ── Roof "top hat" sensor suite (Waymo fifth-gen read) ─────────────
  const suite = new THREE.Group();
  suite.name = "sensorSuite";
  suite.position.set(0, 1.07, 0.02);
  g.add(suite);

  const base = box(0.38, 0.04, 0.48, 0x1a1a20, CHAR);
  base.position.y = 0.02;
  suite.add(base);

  // Slightly flared pedestal
  const pedestal = cyl(0.12, 0.16, 0.08, 0x222228, CHAR, 12);
  pedestal.position.y = 0.08;
  suite.add(pedestal);

  // Spinning lidar dome — white cylinder, dark mid band, cyan ring
  const dome = new THREE.Group();
  dome.name = "lidarDome";
  dome.position.set(0, 0.24, 0);
  suite.add(dome);

  const domeBody = cyl(0.12, 0.13, 0.2, 0xf6f6f8, {
    roughness: 0.32,
    metalness: 0.15,
  }, 16);
  dome.add(domeBody);

  const domeBand = cyl(0.135, 0.135, 0.035, 0x1e1e24, CHAR, 16);
  domeBand.position.y = 0.02;
  dome.add(domeBand);

  const blueRing = cyl(0.14, 0.14, 0.022, 0x3ec8ff, {
    roughness: 0.22,
    emissive: 0x3ec8ff,
    emissiveIntensity: 1.0,
  }, 18);
  blueRing.position.y = -0.055;
  blueRing.name = "lidarRing";
  dome.add(blueRing);

  const cap = cyl(0.07, 0.11, 0.045, 0xececf0, { roughness: 0.35 }, 14);
  cap.position.y = 0.12;
  dome.add(cap);

  // Camera / mid-range pods around the hat
  for (const [sx, sz] of [
    [0.14, 0.16],
    [-0.14, 0.16],
    [0.14, -0.14],
    [-0.14, -0.14],
  ]) {
    const pod = box(0.07, 0.06, 0.08, 0x18181e, CHAR);
    pod.position.set(sx, 0.08, sz);
    suite.add(pod);
    const lens = box(0.04, 0.035, 0.018, 0x0c141c, {
      roughness: 0.12,
      metalness: 0.55,
      emissive: 0x1a3040,
      emissiveIntensity: 0.25,
    });
    lens.position.set(sx, 0.08, sz + (sz >= 0 ? 0.045 : -0.045));
    suite.add(lens);
  }

  // Perimeter corner lidars (real Waymo I-PACE has these at the four corners)
  for (const [sx, sz] of [
    [0.52, 0.95],
    [-0.52, 0.95],
    [0.52, -0.9],
    [-0.52, -0.9],
  ]) {
    const corner = box(0.1, 0.1, 0.12, 0x1a1a20, CHAR);
    corner.position.set(sx, 0.52, sz);
    g.add(corner);
    const eye = box(0.055, 0.055, 0.03, 0x0a1218, {
      roughness: 0.15,
      metalness: 0.5,
      emissive: 0x1a4058,
      emissiveIntensity: 0.3,
    });
    eye.position.set(sx * 1.08, 0.52, sz);
    g.add(eye);
  }

  // Fender camera pods
  for (const side of [-1, 1]) {
    const fender = box(0.07, 0.07, 0.11, 0x1a1a20, CHAR);
    fender.position.set(side * 0.56, 0.58, 0.5);
    g.add(fender);
  }

  // Door wordmarks — "Gaymo" in Waymo cyan on charcoal, with a tiny pride bar
  for (const side of [1, -1]) {
    const badge = _gaymoBadge();
    badge.position.set(side * 0.545, 0.5, 0.05);
    badge.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    g.add(badge);
  }

  // Hood / rear mini mark (compact W-style monogram, Waymo brand cue)
  const mono = _waymoMonogram();
  mono.position.set(0, 0.62, 1.18);
  mono.rotation.x = -Math.PI / 2;
  g.add(mono);

  g.scale.setScalar(1.1);

  // Shadow + wash live on the group; hover bob only lifts the hull parts so the
  // shadow stays glued to the road. Hull is everything except those two.
  const hull = new THREE.Group();
  hull.name = "hull";
  // Reparent current children into hull, then re-add shadow/wash on g
  const keep = new Set([shadow, wash]);
  const move = [...g.children].filter((c) => !keep.has(c));
  for (const c of move) hull.add(c);
  g.add(hull);
  // Ensure shadow/wash render under the hull
  g.add(shadow);
  g.add(wash);

  g.userData.hull = hull;
  g.userData.shadow = shadow;
  g.userData.wash = wash;
  g.userData.thrusters = thrusters;
  g.userData.hoverY = HOVER_Y;

  g.userData.spinLidar = (dt) => {
    dome.rotation.y += dt * 3.2;
  };

  g.userData.tickHover = (t) => {
    const bob = Math.sin(t * 2.6) * HOVER_BOB;
    const bob2 = Math.sin(t * 1.7 + 1.1) * 0.012;
    hull.position.y = HOVER_Y + bob;
    // Tiny pitch/roll so it feels free-floating, not on rails
    hull.rotation.x = Math.sin(t * 1.9) * 0.018;
    hull.rotation.z = Math.sin(t * 2.3 + 0.4) * 0.014;
    // Shadow breathes with height
    const lift = (bob + HOVER_BOB) / (HOVER_BOB * 2);
    shadow.scale.setScalar(0.92 + lift * 0.12);
    shadow.material.opacity = 0.38 - lift * 0.1;
    // Thrusters + wash pulse
    const pulse = 0.65 + 0.35 * (0.5 + 0.5 * Math.sin(t * 5.5));
    for (const thr of thrusters) {
      thr.material.emissiveIntensity = pulse;
      thr.scale.setScalar(0.92 + pulse * 0.12);
    }
    wash.material.emissiveIntensity = 0.4 + pulse * 0.35;
    wash.material.opacity = 0.35 + pulse * 0.15;
    // Cycle wash through a soft pride palette
    const hue = (t * 0.12) % 1;
    wash.material.emissive.setHSL(hue, 0.7, 0.55);
    wash.material.color.setHSL(hue, 0.55, 0.5);
  };

  g.userData.pulseLed = (t) => {
    const pulse = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 4.2));
    led.material.emissiveIntensity = pulse;
    blueRing.material.emissiveIntensity = 0.75 + 0.3 * (0.5 + 0.5 * Math.sin(t * 3.1));
  };

  return g;
}

/** Horizontal pride pin-stripe as a multi-box band (cheap, no texture). */
function _prideStripeMesh(w, h, d) {
  const g = new THREE.Group();
  const colors = [0xe40303, 0xff8c00, 0xffed00, 0x008026, 0x24408e, 0x732982];
  const slice = d / colors.length;
  colors.forEach((col, i) => {
    const s = box(w, h, slice * 0.92, col, {
      roughness: 0.4,
      emissive: col,
      emissiveIntensity: 0.25,
    });
    s.position.z = -d / 2 + slice * (i + 0.5);
    g.add(s);
  });
  return g;
}

/** Door badge: charcoal plate, cyan "Gaymo", thin pride underline. */
function _gaymoBadge() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 96;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#14141a";
  roundRect(ctx, 4, 8, 248, 80, 12);
  ctx.fill();
  // Waymo-like cyan wordmark
  ctx.fillStyle = "#3ec8ff";
  ctx.font = "bold 42px system-ui, 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Gaymo", 128, 42);
  // Pride underline
  const bands = ["#e40303", "#ff8c00", "#ffed00", "#008026", "#24408e", "#732982"];
  const bw = 200 / bands.length;
  bands.forEach((col, i) => {
    ctx.fillStyle = col;
    ctx.fillRect(28 + i * bw, 68, bw - 1, 6);
  });
  const tex = canvasTexture(c);
  return new THREE.Mesh(
    new THREE.PlaneGeometry(0.58, 0.22),
    new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.45,
      metalness: 0.08,
      transparent: true,
      emissive: 0x0a2030,
      emissiveIntensity: 0.15,
    })
  );
}

/** Compact monogram for the hood — reads as Waymo tech branding from afar. */
function _waymoMonogram() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#1a1a1e";
  ctx.beginPath();
  ctx.arc(32, 32, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#3ec8ff";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = "#3ec8ff";
  ctx.font = "bold 30px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("G", 32, 34);
  const tex = canvasTexture(c);
  return new THREE.Mesh(
    new THREE.PlaneGeometry(0.16, 0.16),
    new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.4,
      metalness: 0.15,
      transparent: true,
    })
  );
}

export class RideshareSystem {
  /**
   * @param {THREE.Object3D} parent
   * @param {THREE.Group} venue
   * @param {{streetDoor: THREE.Vector3, aisleX?: number}} anchors from LifeSystem
   */
  constructor(parent, venue, anchors) {
    this.root = new THREE.Group();
    this.root.name = "rideshare";
    parent.add(this.root);

    this.streetDoor = anchors.streetDoor.clone();
    // Curb stop: near-lane right in front of the porch so the default street
    // framing (and RIDESHARE_VIEW) catch both the guests and the robotaxi.
    this.stopX = this.streetDoor.x + 0.35;
    this.arriveX = Math.min(STREET.xMax - 1, this.stopX + ARRIVE_LEAD);
    this.waitPoints = [
      sidewalkPoint(this.streetDoor.x - 0.4),
      sidewalkPoint(this.streetDoor.x + 0.55),
    ];
    // Guests stand on the sidewalk; car stops in the near lane abeam them.
    this.carStop = new THREE.Vector3(this.stopX, 0.02, STREET.nearLaneZ);

    this.waymo = createWaymo();
    this.waymo.visible = false;
    this.root.add(this.waymo);

    this.guests = [this._buildGuest(), this._buildGuest()];
    for (const g of this.guests) {
      g.visible = false;
      this.root.add(g);
    }

    this.job = null;
    this.bob = 0;
    this.clock = 0;
  }

  get busy() {
    return this.job !== null;
  }

  _buildGuest() {
    const color = PED_COLORS[(Math.random() * PED_COLORS.length) | 0];
    return createPedestrian(color);
  }

  _partySize() {
    return Math.random() < 0.55 ? 2 : 1;
  }

  /**
   * Guests leave the bar and get picked up.
   * @returns {boolean}
   */
  startPickup() {
    if (this.job) return false;
    const n = this._partySize();
    this._resetGuests(n);
    for (let i = 0; i < n; i++) {
      const g = this.guests[i];
      g.visible = true;
      g.position.copy(this.streetDoor);
      g.position.y = 0;
    }
    this.waymo.visible = false;
    this.job = {
      mode: "pickup",
      state: ST.GUESTS_OUT,
      n,
      pathI: new Array(n).fill(0),
      paths: this._pathsDoorToCurb(n),
      wait: 0,
      carPath: null,
      carI: 0,
    };
    return true;
  }

  /**
   * Waymo drops guests at the curb; they walk in.
   * @returns {boolean}
   */
  startDropoff() {
    if (this.job) return false;
    const n = this._partySize();
    this._resetGuests(n);
    for (const g of this.guests) g.visible = false;

    const path = this._arrivePath();
    this.waymo.visible = true;
    this.waymo.position.copy(path[0]);
    this.waymo.rotation.y = Math.atan2(
      path[1].x - path[0].x,
      path[1].z - path[0].z
    );

    this.job = {
      mode: "dropoff",
      state: ST.WAYMO_IN,
      n,
      pathI: new Array(n).fill(0),
      paths: null,
      wait: 0,
      carPath: path,
      carI: 0,
    };
    return true;
  }

  _arrivePath() {
    return this._clean([
      ...roadPolyline(this.arriveX, this.stopX, -1),
      this.carStop.clone(),
    ]);
  }

  _leavePath() {
    return this._clean([
      this.carStop.clone(),
      ...roadPolyline(this.stopX, LEAVE_X, -1),
    ]);
  }

  _resetGuests(n) {
    // Rebuild colors so each run feels like different people
    for (let i = 0; i < this.guests.length; i++) {
      this.root.remove(this.guests[i]);
    }
    this.guests = [];
    for (let i = 0; i < 2; i++) {
      const g = this._buildGuest();
      g.visible = false;
      this.root.add(g);
      this.guests.push(g);
    }
    // silence unused when n < 2 — guests[1] just stays hidden
    void n;
  }

  _pathsDoorToCurb(n) {
    const paths = [];
    for (let i = 0; i < n; i++) {
      const wait = this.waitPoints[i] || this.waitPoints[0];
      paths.push(
        this._clean([
          this.streetDoor.clone(),
          sidewalkPoint(this.streetDoor.x),
          wait.clone(),
        ])
      );
    }
    return paths;
  }

  _pathsCurbToCar(n) {
    const paths = [];
    const car = this.waymo.position;
    for (let i = 0; i < n; i++) {
      // Approach the sidewalk-side door of the northbound car
      const door = new THREE.Vector3(
        car.x + (i === 0 ? -0.25 : 0.3),
        0,
        STREET.sidewalkZ + 0.4
      );
      const wait = this.waitPoints[i] || this.waitPoints[0];
      paths.push(this._clean([wait.clone(), door]));
    }
    return paths;
  }

  _pathsCarToDoor(n) {
    const paths = [];
    const car = this.waymo.position;
    for (let i = 0; i < n; i++) {
      const start = new THREE.Vector3(
        car.x + (i === 0 ? -0.2 : 0.25),
        0,
        STREET.sidewalkZ + 0.15
      );
      paths.push(
        this._clean([
          start,
          sidewalkPoint(this.streetDoor.x + (i === 0 ? -0.2 : 0.25)),
          this.streetDoor.clone(),
        ])
      );
    }
    return paths;
  }

  _clean(pts) {
    const out = [];
    for (const p of pts) {
      if (!p) continue;
      const last = out[out.length - 1];
      if (!last || Math.hypot(p.x - last.x, p.z - last.z) >= 0.15) {
        out.push(p.clone ? p.clone() : new THREE.Vector3(p.x, p.y ?? 0, p.z));
      }
    }
    return out;
  }

  _advance(mesh, path, pathI, speed, dt) {
    if (pathI >= path.length) return { done: true, pathI };
    const target = path[pathI];
    const pos = mesh.position;
    const dx = target.x - pos.x;
    const dz = target.z - pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.14) {
      pos.x = target.x;
      pos.z = target.z;
      const next = pathI + 1;
      if (next >= path.length) return { done: true, pathI: next };
      return { done: false, pathI: next };
    }
    const step = Math.min(dist, speed * dt);
    pos.x += (dx / dist) * step;
    pos.z += (dz / dist) * step;
    mesh.rotation.y = Math.atan2(dx, dz);
    return { done: false, pathI };
  }

  _allGuestsDone(job) {
    for (let i = 0; i < job.n; i++) {
      if (job.pathI[i] < (job.paths[i]?.length ?? 0)) return false;
    }
    return true;
  }

  _tickGuests(job, dt, speed = WALK) {
    this.bob += dt * 9;
    let allDone = true;
    for (let i = 0; i < job.n; i++) {
      const g = this.guests[i];
      if (!g.visible) continue;
      const path = job.paths[i];
      if (!path || job.pathI[i] >= path.length) {
        g.position.y = 0;
        continue;
      }
      const r = this._advance(g, path, job.pathI[i], speed, dt);
      job.pathI[i] = r.pathI;
      if (!r.done) {
        allDone = false;
        g.position.y = Math.abs(Math.sin(this.bob + i)) * 0.04;
      } else {
        g.position.y = 0;
      }
    }
    return allDone;
  }

  _carSpeed(job) {
    // Ease down in the last ~4m of the approach
    const path = job.carPath;
    if (!path || job.carI >= path.length) return ROAD_SLOW;
    const remaining = path.length - job.carI;
    if (remaining <= 3) return ROAD_SLOW;
    return ROAD;
  }

  update(dt) {
    const t = Math.min(dt, 0.05);
    this.clock += t;

    if (this.waymo.visible) {
      this.waymo.userData.spinLidar?.(t);
      this.waymo.userData.pulseLed?.(this.clock);
      this.waymo.userData.tickHover?.(this.clock);
    }

    const job = this.job;
    if (!job) return;

    switch (job.state) {
      case ST.GUESTS_OUT: {
        if (!this._tickGuests(job, t)) break;
        // Face the street while waiting
        for (let i = 0; i < job.n; i++) {
          this.guests[i].rotation.y = 0; // look roughly +Z toward road
        }
        job.state = ST.WAIT_CURB;
        job.wait = 0.55 + Math.random() * 0.35;
        break;
      }

      case ST.WAIT_CURB: {
        job.wait -= t;
        // Idle sway
        for (let i = 0; i < job.n; i++) {
          this.guests[i].position.y = Math.sin(this.clock * 2.2 + i) * 0.012;
        }
        if (job.wait > 0) break;

        const path = this._arrivePath();
        this.waymo.visible = true;
        this.waymo.position.copy(path[0]);
        this.waymo.rotation.y = Math.atan2(
          path[1].x - path[0].x,
          path[1].z - path[0].z
        );
        job.carPath = path;
        job.carI = 0;
        job.state = ST.WAYMO_IN;
        break;
      }

      case ST.WAYMO_IN: {
        const r = this._advance(
          this.waymo,
          job.carPath,
          job.carI,
          this._carSpeed(job),
          t
        );
        job.carI = r.pathI;
        if (!r.done) break;

        // Park parallel to the curb, facing northbound (−X)
        this.waymo.rotation.y = -Math.PI / 2;
        this.waymo.position.copy(this.carStop);

        if (job.mode === "pickup") {
          job.paths = this._pathsCurbToCar(job.n);
          job.pathI = new Array(job.n).fill(0);
          job.state = ST.BOARD;
          job.wait = 0.35;
        } else {
          // Spawn guests at the curb side of the car
          job.paths = this._pathsCarToDoor(job.n);
          job.pathI = new Array(job.n).fill(0);
          for (let i = 0; i < job.n; i++) {
            const g = this.guests[i];
            g.visible = true;
            g.position.copy(job.paths[i][0]);
          }
          job.state = ST.DEBOARD;
          job.wait = 0.4;
        }
        break;
      }

      case ST.BOARD: {
        if (job.wait > 0) {
          job.wait -= t;
          break;
        }
        if (!this._tickGuests(job, t, WALK * 1.05)) break;
        // Guests vanish into the cabin
        for (let i = 0; i < job.n; i++) this.guests[i].visible = false;
        job.wait = 0.4;
        job.state = ST.WAYMO_OUT;
        job.carPath = this._leavePath();
        job.carI = 0;
        break;
      }

      case ST.DEBOARD: {
        if (job.wait > 0) {
          job.wait -= t;
          break;
        }
        job.state = ST.TO_DOOR;
        break;
      }

      case ST.TO_DOOR: {
        if (!this._tickGuests(job, t)) break;
        for (let i = 0; i < job.n; i++) this.guests[i].visible = false;
        job.wait = 0.3;
        job.state = ST.WAYMO_OUT;
        job.carPath = this._leavePath();
        job.carI = 0;
        break;
      }

      case ST.WAYMO_OUT: {
        if (job.wait > 0) {
          job.wait -= t;
          // Face north before rolling
          if (job.wait <= 0) {
            this.waymo.rotation.y = -Math.PI / 2;
          }
          break;
        }
        const r = this._advance(this.waymo, job.carPath, job.carI, ROAD, t);
        job.carI = r.pathI;
        if (!r.done) break;
        this._finish();
        break;
      }

      default:
        this._finish();
    }
  }

  _finish() {
    this.waymo.visible = false;
    for (const g of this.guests) g.visible = false;
    this.job = null;
  }
}
