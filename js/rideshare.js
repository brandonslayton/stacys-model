/**
 * rideshare.js — Gaymo pickup / drop-off in the lot.
 *
 * Tap (open): guests leave the porch, wait in the aisle, a Gaymo pulls in, they
 * board, it exits past the dumpster.
 *
 * Tap (closed): no scene — the UI shows a Gaymo text that no passenger is free.
 *
 * Hold / double-tap (open): drop-off, walk in, Gaymo leaves.
 *
 * Hold / double-tap (closed): drop-off, Gaymo drives off, the guest knocks on the
 * locked door, gets confused, calls another Gaymo, and gets rescued.
 *
 * Separate from life.js on purpose — ambient cars are anonymous and pool-based;
 * this is a named one-shot performance with a unique robotaxi mesh.
 */
import * as THREE from "three";
import { box, cyl, canvasTexture, roundRect } from "./kit.js";
import { PED_COLORS, createPedestrian } from "./agents.js";
import { STREET, roadPolyline, sidewalkPoint, lanePoint } from "./street.js";

const WALK = 2.15;
const ROAD = 8.4;
const ROAD_SLOW = 3.6;
/** Spawn just off-camera south of the porch so the car is on-screen quickly. */
const ARRIVE_LEAD = 9.5;
const LEAVE_X = STREET.xMin + 0.8;
/** How high the hull origin sits above the asphalt (clear but lower float). */
const HOVER_Y = 0.2;
const HOVER_BOB = 0.028;
/** Ped personal space (match life.js). */
const PED_MIN = 0.48;

const ST = {
  GUESTS_OUT: "guests_out",
  WAIT_CURB: "wait_curb",
  WAYMO_IN: "waymo_in",
  BOARD: "board",
  DEBOARD: "deboard",
  TO_DOOR: "to_door",
  WAYMO_OUT: "waymo_out",
  /** Closed drop-off: guest walks to door while the first Gaymo leaves. */
  CLOSED_WALK: "closed_walk",
  KNOCK: "knock",
  CONFUSED: "confused",
  CALL: "call",
  RESCUE_IN: "rescue_in",
  RESCUE_BOARD: "rescue_board",
  RESCUE_OUT: "rescue_out",
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
  const thrusterHues = [0.0, 0.12, 0.33, 0.58]; // red / gold / green / blue
  for (let ti = 0; ti < 4; ti++) {
    const [tx, tz] = [
      [-0.3, 0.52],
      [0.3, 0.52],
      [-0.3, -0.52],
      [0.3, -0.52],
    ][ti];
    const pad = cyl(0.11, 0.13, 0.035, 0x1a1a22, { ...CHAR, roughness: 0.4 }, 12);
    pad.position.set(tx, 0.04, tz);
    g.add(pad);
    const glow = cyl(0.09, 0.1, 0.02, 0xffffff, {
      roughness: 0.25,
      emissive: 0xffffff,
      emissiveIntensity: 1.0,
      transparent: true,
      opacity: 0.95,
    }, 12);
    glow.position.set(tx, 0.012, tz);
    glow.userData.hue = thrusterHues[ti];
    g.add(glow);
    thrusters.push(glow);
  }

  // Thin cyan skirting line under the rocker — high-tech trim
  const skirt = box(1.12, 0.025, 2.12, 0x3ec8ff, {
    roughness: 0.25,
    emissive: 0x3ec8ff,
    emissiveIntensity: 0.55,
  });
  skirt.position.y = 0.14;
  g.add(skirt);

  // Ground FX above asphalt. depthTest ON so the glow is hidden behind the
  // building when the Gaymo is on the far side of the lot.
  const GLOW_Y = 0.12;
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.72, 24),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.26,
      depthWrite: false,
      depthTest: true,
    })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = GLOW_Y - 0.015;
  shadow.name = "hoverShadow";
  g.add(shadow);

  const rainbowMap = _rainbowGlowTexture();
  const rainbow = new THREE.Mesh(
    new THREE.CircleGeometry(0.95, 48),
    new THREE.MeshBasicMaterial({
      map: rainbowMap,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    })
  );
  rainbow.rotation.x = -Math.PI / 2;
  rainbow.position.y = GLOW_Y;
  rainbow.name = "rainbowGlow";
  g.add(rainbow);

  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(1.35, 48),
    new THREE.MeshBasicMaterial({
      map: rainbowMap,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    })
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = GLOW_Y - 0.008;
  halo.name = "rainbowHalo";
  g.add(halo);

  // Small bloom only — large bloom was reading through walls
  const bloom = new THREE.Mesh(
    new THREE.CircleGeometry(1.65, 40),
    new THREE.MeshBasicMaterial({
      map: rainbowMap,
      transparent: true,
      opacity: 0.05,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    })
  );
  bloom.rotation.x = -Math.PI / 2;
  bloom.position.y = GLOW_Y - 0.012;
  bloom.name = "rainbowBloom";
  g.add(bloom);

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

  // ~10% smaller than the previous 1.1 scale so it sits better next to life.js cars
  g.scale.setScalar(0.99);

  // Ground FX stay put; hull bobs above them
  const hull = new THREE.Group();
  hull.name = "hull";
  const keep = new Set([shadow, rainbow, halo, bloom]);
  const move = [...g.children].filter((c) => !keep.has(c));
  for (const c of move) hull.add(c);
  g.add(hull);
  g.add(shadow);
  g.add(rainbow);
  g.add(halo);
  g.add(bloom);

  g.userData.hull = hull;
  g.userData.shadow = shadow;
  g.userData.rainbow = rainbow;
  g.userData.halo = halo;
  g.userData.bloom = bloom;
  g.userData.thrusters = thrusters;
  g.userData.hoverY = HOVER_Y;

  g.userData.spinLidar = (dt) => {
    dome.rotation.y += dt * 3.2;
  };

  /** When true (stopped for boarding), hover gets a more obvious wave/shake. */
  g.userData.idleHover = false;

  g.userData.tickHover = (t) => {
    const idle = !!g.userData.idleHover;
    const bobAmp = idle ? HOVER_BOB * 2.4 : HOVER_BOB;
    const bob = Math.sin(t * (idle ? 4.2 : 2.6)) * bobAmp;
    // Side-to-side sway + nose rock when idling at the curb
    const sway = idle ? Math.sin(t * 5.1) * 0.04 : 0;
    const rock = idle ? Math.sin(t * 3.4 + 0.8) * 0.035 : Math.sin(t * 1.9) * 0.012;
    const roll = idle ? Math.sin(t * 4.6) * 0.03 : Math.sin(t * 2.3 + 0.4) * 0.01;
    hull.position.y = HOVER_Y + bob;
    hull.position.x = sway;
    hull.rotation.x = rock;
    hull.rotation.z = roll;
    const lift = (bob + bobAmp) / (bobAmp * 2 || 1);
    shadow.scale.setScalar(0.88 + lift * 0.12);
    shadow.material.opacity = 0.3 - lift * 0.08;
    rainbow.rotation.z = t * 0.55;
    halo.rotation.z = -t * 0.28;
    bloom.rotation.z = t * 0.14;
    // Soft pulse — kept dim so it reads as a wash, not a spotlight
    const pulse = 0.55 + 0.2 * (0.5 + 0.5 * Math.sin(t * 3.2));
    rainbow.material.opacity = 0.28 + pulse * 0.14;
    halo.material.opacity = 0.12 + pulse * 0.08;
    bloom.material.opacity = 0.05 + pulse * 0.04;
    const breath = 0.96 + pulse * 0.05;
    rainbow.scale.setScalar(breath);
    halo.scale.setScalar(breath * 1.02);
    bloom.scale.setScalar(breath * 1.03);
    for (const thr of thrusters) {
      const h = (thr.userData.hue + t * 0.15) % 1;
      thr.material.emissive.setHSL(h, 0.75, 0.5);
      thr.material.color.setHSL(h, 0.6, 0.55);
      thr.material.emissiveIntensity = 0.35 + pulse * 0.25;
      thr.scale.setScalar(0.9 + pulse * 0.1);
    }
  };

  g.userData.pulseLed = (t) => {
    const pulse = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 4.2));
    led.material.emissiveIntensity = pulse;
    blueRing.material.emissiveIntensity = 0.75 + 0.3 * (0.5 + 0.5 * Math.sin(t * 3.1));
  };

  return g;
}

/**
 * Soft rainbow disc: many narrow angular bands + heavy radial falloff so it
 * reads as a diffused glow rather than a hard pie chart.
 */
function _rainbowGlowTexture() {
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d");
  const cx = S / 2;
  const cy = S / 2;
  // More bands = smoother rainbow
  const n = 24;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    const hue = (i / n) * 360;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, S * 0.5, a0, a1);
    ctx.closePath();
    ctx.fillStyle = `hsl(${hue}, 95%, 58%)`;
    ctx.fill();
  }
  // Soft white core
  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, S * 0.22);
  core.addColorStop(0, "rgba(255,255,255,0.55)");
  core.addColorStop(1, "rgba(255,255,255,0)");
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(cx, cy, S * 0.22, 0, Math.PI * 2);
  ctx.fill();
  // Heavy edge fade for diffusion
  ctx.globalCompositeOperation = "destination-in";
  const mask = ctx.createRadialGradient(cx, cy, 0, cx, cy, S * 0.5);
  mask.addColorStop(0, "rgba(255,255,255,1)");
  mask.addColorStop(0.25, "rgba(255,255,255,0.95)");
  mask.addColorStop(0.55, "rgba(255,255,255,0.55)");
  mask.addColorStop(0.8, "rgba(255,255,255,0.18)");
  mask.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = mask;
  ctx.fillRect(0, 0, S, S);
  ctx.globalCompositeOperation = "source-over";
  return canvasTexture(c);
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
   * @param {{
   *   streetDoor: THREE.Vector3,
   *   mouth?: THREE.Vector3,
   *   aisle?: THREE.Vector3,
   *   yardCorner?: THREE.Vector3,
   * }} anchors from LifeSystem (world space)
   * @param {import('./life.js').LifeSystem|null} [life] for traffic / ped separation
   */
  constructor(parent, venue, anchors, life = null) {
    this.root = new THREE.Group();
    this.root.name = "rideshare";
    parent.add(this.root);

    this.life = life;
    this.streetDoor = anchors.streetDoor.clone();
    this.mouth = anchors.mouth ? anchors.mouth.clone() : null;
    this.aisle = anchors.aisle ? anchors.aisle.clone() : null;
    this.yardCorner = anchors.yardCorner
      ? anchors.yardCorner.clone()
      : new THREE.Vector3(
          this.aisle ? this.aisle.x : this.streetDoor.x,
          0,
          this.streetDoor.z + 0.5
        );

    // Dumpster in world space — exit continues past it, then left, then off-map
    venue.updateWorldMatrix(true, true);
    const m = venue.matrixWorld;
    const dumpUd = venue.userData.dumpster;
    this.dump = dumpUd
      ? {
          pos: new THREE.Vector3(dumpUd.x, 0.02, dumpUd.z).applyMatrix4(m),
          approach: new THREE.Vector3(
            dumpUd.approachX,
            0.02,
            dumpUd.approachZ
          ).applyMatrix4(m),
        }
      : null;

    this._setupStop();

    this.waymo = createWaymo();
    this.waymo.visible = false;
    this.root.add(this.waymo);

    this.guests = [this._buildGuest(), this._buildGuest()];
    for (const g of this.guests) {
      g.visible = false;
      this.root.add(g);
    }

    // Floating reaction sprites for the closed-hours bit
    this.qMark = this._makeBillboard(_questionTexture(), 0.55);
    this.knockFx = this._makeBillboard(_knockTexture(), 0.7);
    this.phone = this._buildPhone();
    this.phone.visible = false;
    this.root.add(this.phone);

    this.job = null;
    this.bob = 0;
    this.clock = 0;
    /**
     * Wait-for-Gaymo notification (HTML only — no 3D sprite, so it never
     * doubles up). Pocket projects this to an iPhone-style banner.
     */
    this.waitSmsT = 0;
    this.waitSmsAnchor = null;
  }

  _makeBillboard(map, size) {
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map,
        transparent: true,
        depthWrite: false,
        depthTest: false, // always on top of the model for UI readability
      })
    );
    s.scale.setScalar(size);
    s.renderOrder = 20;
    s.visible = false;
    this.root.add(s);
    return s;
  }

  _buildPhone() {
    const g = new THREE.Group();
    const body = box(0.08, 0.14, 0.02, 0x1a1a22, { roughness: 0.4, metalness: 0.3 });
    body.position.y = 0.07;
    g.add(body);
    const screen = box(0.06, 0.1, 0.005, 0x3ec8ff, {
      roughness: 0.2,
      emissive: 0x3ec8ff,
      emissiveIntensity: 0.7,
    });
    screen.position.set(0, 0.07, 0.014);
    g.add(screen);
    return g;
  }

  /**
   * Loading zone in the parking aisle (not the street curb). Guests walk out of
   * the porch across the front yard; the Gaymo pulls in from 7th via the driveway.
   * Falls back to a curb stop if driveway anchors are missing.
   */
  _setupStop() {
    if (this.mouth && this.aisle) {
      // Abeam the porch, on the aisle centreline — clear of stalls and the mouth
      const zLo = Math.min(this.mouth.z, this.aisle.z) + 0.6;
      const zHi = Math.max(this.mouth.z, this.aisle.z) - 0.8;
      const stopZ = THREE.MathUtils.clamp(this.streetDoor.z + 0.55, zLo, zHi);
      this.carStop = new THREE.Vector3(this.aisle.x, 0.02, stopZ);
      // Enter from the south on 7th, same as life.js cars
      this.arriveX = Math.min(STREET.xMax - 1, this.mouth.x + ARRIVE_LEAD);
      // Guests wait on the building side of the aisle (+X), spaced well apart
      // so a two-person party never stands on top of each other.
      this.waitPoints = [
        new THREE.Vector3(this.aisle.x + 0.95, 0, stopZ + 0.7),
        new THREE.Vector3(this.aisle.x + 0.95, 0, stopZ - 0.7),
      ];
      // Face along the aisle toward the rear after pulling in
      this.stopFaceY = Math.atan2(
        this.aisle.x - this.mouth.x,
        this.aisle.z - this.mouth.z
      );
      this.inLot = true;
      return;
    }

    // Fallback: curb on 7th Ave
    this.carStop = new THREE.Vector3(
      this.streetDoor.x + 0.35,
      0.02,
      STREET.nearLaneZ
    );
    this.arriveX = Math.min(STREET.xMax - 1, this.carStop.x + ARRIVE_LEAD);
    this.waitPoints = [
      sidewalkPoint(this.streetDoor.x - 0.7),
      sidewalkPoint(this.streetDoor.x + 0.75),
    ];
    this.stopFaceY = -Math.PI / 2;
    this.inLot = false;
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
   * Guests leave the bar and get picked up. Only valid while the venue is open —
   * callers should show the "no passenger" SMS when closed instead.
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
    this._hideFx();
    this.job = {
      mode: "pickup",
      closed: false,
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
   * Gaymo drops guests in the lot.
   * @param {{closed?: boolean}} [opts] when closed, after drop-off the guest
   *   knocks, panics, and calls a second Gaymo for rescue (party of one).
   * @returns {boolean}
   */
  startDropoff(opts = {}) {
    if (this.job) return false;
    const closed = !!opts.closed;
    const n = closed ? 1 : this._partySize();
    this._resetGuests(n);
    for (const g of this.guests) g.visible = false;

    const path = this._arrivePath();
    this.waymo.visible = true;
    this.waymo.position.copy(path[0]);
    this.waymo.rotation.y = Math.atan2(
      path[1].x - path[0].x,
      path[1].z - path[0].z
    );
    this._hideFx();

    this.job = {
      mode: "dropoff",
      closed,
      state: ST.WAYMO_IN,
      n,
      pathI: new Array(n).fill(0),
      paths: null,
      wait: 0,
      carPath: path,
      carI: 0,
      lotFrom: this.inLot ? 3 : path.length,
      knocks: 0,
      knockPhase: 0,
    };
    return true;
  }

  _hideFx() {
    this.qMark.visible = false;
    this.knockFx.visible = false;
    this.phone.visible = false;
    this.waitSmsT = 0;
    this.waitSmsAnchor = null;
    if (this.waymo?.userData) this.waymo.userData.idleHover = false;
  }

  _setIdleHover(on) {
    if (this.waymo?.userData) this.waymo.userData.idleHover = !!on;
  }

  /**
   * Soft personal space among guest party (+ life peds if available).
   */
  _separateGuests() {
    const party = this.guests.filter((g) => g.visible);
    const others = this.life?.pedMeshes?.() || [];
    const all = [...party, ...others];
    for (const g of party) {
      if (this.life?.separatePed) this.life.separatePed(g, all, PED_MIN);
      else {
        // Fallback if no life system
        for (const o of party) {
          if (o === g) continue;
          const dx = g.position.x - o.position.x;
          const dz = g.position.z - o.position.z;
          const d = Math.hypot(dx, dz);
          if (d < 1e-4 || d >= PED_MIN) continue;
          const push = (PED_MIN - d) * 0.55;
          g.position.x += (dx / d) * push;
          g.position.z += (dz / d) * push;
        }
      }
    }
  }

  /** iPhone-style "Messages" banner above the waiting guest (HTML in pocket). */
  _showWaitSms() {
    const g = this.guests.find((x) => x.visible) || this.guests[0];
    if (!g) return;
    this.waitSmsT = 5.5;
    this.waitSmsAnchor = {
      x: g.position.x,
      y: 2.0,
      z: g.position.z,
      text: "Your Gaymo will arrive shortly!",
      from: "Gaymo",
    };
  }

  _tickWaitSms(dt) {
    if (this.waitSmsT <= 0) {
      this.waitSmsAnchor = null;
      return;
    }
    this.waitSmsT -= dt;
    const g = this.guests.find((x) => x.visible);
    if (g) {
      this.waitSmsAnchor = {
        x: g.position.x,
        y: 2.0,
        z: g.position.z,
        text: "Your Gaymo will arrive shortly!",
        from: "Gaymo",
      };
    }
    if (this.waitSmsT <= 0) this.waitSmsAnchor = null;
  }

  _faceDoor(guest) {
    // Porch faces roughly +Z; aim at the door from just outside
    guest.rotation.y = Math.atan2(
      this.streetDoor.x - guest.position.x,
      this.streetDoor.z - guest.position.z
    );
  }

  _placePhone(guest) {
    const yaw = guest.rotation.y;
    this.phone.visible = true;
    this.phone.position.set(
      guest.position.x + Math.cos(yaw) * 0.22,
      0.7,
      guest.position.z - Math.sin(yaw) * 0.22
    );
    this.phone.rotation.y = yaw;
  }

  /**
   * Into the lot: south on 7th → right into the driveway mouth → up the aisle
   * to the loading zone. Mirrors life.js `_pathIntoLot` without a stall.
   */
  _arrivePath() {
    if (this.inLot && this.mouth && this.aisle) {
      return this._clean([
        ...roadPolyline(this.arriveX, this.mouth.x, -1),
        new THREE.Vector3(this.mouth.x, 0.02, STREET.curbZ),
        this.mouth.clone(),
        // Mid-aisle waypoint so the turn into the stop isn't a hard corner
        new THREE.Vector3(this.aisle.x, 0.02, (this.mouth.z + this.carStop.z) * 0.5),
        this.carStop.clone(),
      ]);
    }
    return this._clean([
      ...roadPolyline(this.arriveX, this.carStop.x, -1),
      this.carStop.clone(),
    ]);
  }

  /**
   * Out via the driveway mouth onto 7th (same as life.js cars) — never routes
   * through the dumpster corner. Northbound on the near lane to the road end.
   */
  _leavePath() {
    if (this.inLot && this.aisle && this.mouth) {
      return this._clean([
        this.carStop.clone(),
        // Back toward the street end of the aisle (away from the dumpster NE corner)
        new THREE.Vector3(this.aisle.x, 0.02, (this.carStop.z + this.mouth.z) * 0.5),
        this.mouth.clone(),
        new THREE.Vector3(this.mouth.x, 0.02, STREET.curbZ),
        lanePoint(this.mouth.x, -1),
        // Northbound on 7th to the end of the stub, despawn
        ...roadPolyline(this.mouth.x, STREET.xMin + 0.8, -1),
      ]);
    }
    return this._clean([
      this.carStop.clone(),
      ...roadPolyline(this.carStop.x, STREET.xMin + 0.8, -1),
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

  /**
   * Along-car offset for passenger i — front vs rear door so two people never
   * share a door handle. ~0.55 units apart (body radius ~0.15 each).
   */
  _doorOffset(i) {
    return i === 0 ? 0.55 : -0.55;
  }

  /** Porch → front yard → wait spots on the aisle (building side). */
  _pathsDoorToCurb(n) {
    const paths = [];
    for (let i = 0; i < n; i++) {
      const wait = this.waitPoints[i] || this.waitPoints[0];
      if (this.inLot) {
        // Stagger yard waypoints so two guests don't merge on the same line
        const yard = this.yardCorner.clone();
        yard.z += this._doorOffset(i) * 0.35;
        paths.push(
          this._clean([
            this.streetDoor.clone(),
            yard,
            wait.clone(),
          ])
        );
      } else {
        paths.push(
          this._clean([
            this.streetDoor.clone(),
            sidewalkPoint(this.streetDoor.x + this._doorOffset(i) * 0.3),
            wait.clone(),
          ])
        );
      }
    }
    return paths;
  }

  /** Wait spots → passenger doors on the building side of the Gaymo. */
  _pathsCurbToCar(n) {
    const paths = [];
    const car = this.waymo.position;
    for (let i = 0; i < n; i++) {
      const wait = this.waitPoints[i] || this.waitPoints[0];
      const off = this._doorOffset(i);
      const door = this.inLot
        ? new THREE.Vector3(car.x + 0.78, 0, car.z + off)
        : new THREE.Vector3(car.x + off * 0.5, 0, STREET.sidewalkZ + 0.4);
      // Mid-point keeps them from clipping through each other on the approach
      const mid = this.inLot
        ? new THREE.Vector3(car.x + 1.05, 0, car.z + off)
        : wait.clone().lerp(door, 0.5);
      paths.push(this._clean([wait.clone(), mid, door]));
    }
    return paths;
  }

  /** Step out of the Gaymo and walk porch-ward into the bar. */
  _pathsCarToDoor(n) {
    const paths = [];
    const car = this.waymo.position;
    for (let i = 0; i < n; i++) {
      const off = this._doorOffset(i);
      const start = this.inLot
        ? new THREE.Vector3(car.x + 0.78, 0, car.z + off)
        : new THREE.Vector3(car.x + off * 0.45, 0, STREET.sidewalkZ + 0.15);
      if (this.inLot) {
        const yard = this.yardCorner.clone();
        yard.z += off * 0.35;
        const doorSide = this.streetDoor.clone();
        // Fan out slightly at the porch so they don't stack on the mat
        doorSide.z += off * 0.22;
        paths.push(this._clean([start, yard, doorSide]));
      } else {
        paths.push(
          this._clean([
            start,
            sidewalkPoint(this.streetDoor.x + off * 0.35),
            this.streetDoor.clone(),
          ])
        );
      }
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
      // Slightly different paces so a pair never walks in perfect lockstep
      const pace = speed * (i === 0 ? 1.0 : 0.9);
      const r = this._advance(g, path, job.pathI[i], pace, dt);
      job.pathI[i] = r.pathI;
      if (!r.done) {
        allDone = false;
        g.position.y = Math.abs(Math.sin(this.bob + i * 1.7)) * 0.04;
      } else {
        g.position.y = 0;
      }
    }
    this._separateGuests();
    return allDone;
  }

  _carSpeed(job) {
    const path = job.carPath;
    if (!path || job.carI >= path.length) return ROAD_SLOW;
    const remaining = path.length - job.carI;
    // Crawl the last few waypoints (into the stop, or the dumpster left-turn)
    if (remaining <= 3) return ROAD_SLOW;
    const leaving =
      job.state === ST.WAYMO_OUT ||
      job.state === ST.RESCUE_OUT ||
      job.state === ST.CLOSED_WALK;
    if (leaving) return this.inLot ? 5.2 : ROAD;
    if (this.inLot && job.carI >= (job.lotFrom ?? 2)) return 4.6;
    return ROAD;
  }

  _tickCar(job, t) {
    if (!job.carPath || !this.waymo.visible) return true;
    this._setIdleHover(false);
    // Front-only soft slow (same rule as life.js cars)
    const scale = this.life?.frontSpeedScale?.(this.waymo) ?? 1;
    const r = this._advance(
      this.waymo,
      job.carPath,
      job.carI,
      this._carSpeed(job) * scale,
      t
    );
    job.carI = r.pathI;
    this.life?.separateVehicles?.();
    return r.done;
  }

  _spawnArrive() {
    const path = this._arrivePath();
    this.waymo.visible = true;
    this.waymo.position.copy(path[0]);
    this.waymo.rotation.y = Math.atan2(
      path[1].x - path[0].x,
      path[1].z - path[0].z
    );
    return path;
  }

  update(dt) {
    const t = Math.min(dt, 0.05);
    this.clock += t;

    if (this.waymo.visible) {
      this.waymo.userData.spinLidar?.(t);
      this.waymo.userData.pulseLed?.(this.clock);
      this.waymo.userData.tickHover?.(this.clock);
    }
    this._tickWaitSms(t);

    const job = this.job;
    if (!job) return;

    switch (job.state) {
      case ST.GUESTS_OUT: {
        if (!this._tickGuests(job, t)) break;
        // Face toward the aisle / arriving car while waiting
        for (let i = 0; i < job.n; i++) {
          const w = this.waitPoints[i] || this.waitPoints[0];
          this.guests[i].rotation.y = Math.atan2(
            this.carStop.x - w.x,
            this.carStop.z - w.z
          );
        }
        job.state = ST.WAIT_CURB;
        job.wait = 0.55 + Math.random() * 0.35;
        this._showWaitSms();
        break;
      }

      case ST.WAIT_CURB: {
        job.wait -= t;
        // Idle sway — keep personal space while they fidget
        for (let i = 0; i < job.n; i++) {
          this.guests[i].position.y = Math.sin(this.clock * 2.2 + i) * 0.012;
        }
        this._separateGuests();
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
        // Index where the path leaves the road for the lot (after curb waypoint)
        job.lotFrom = this.inLot ? 3 : path.length;
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

        this.waymo.position.copy(this.carStop);
        this.waymo.rotation.y = this.stopFaceY;
        this._setIdleHover(true); // wave / hover shake while loading

        if (job.mode === "pickup") {
          job.paths = this._pathsCurbToCar(job.n);
          job.pathI = new Array(job.n).fill(0);
          job.state = ST.BOARD;
          job.wait = 0.45;
        } else {
          job.paths = this._pathsCarToDoor(job.n);
          job.pathI = new Array(job.n).fill(0);
          for (let i = 0; i < job.n; i++) {
            const g = this.guests[i];
            g.visible = true;
            g.position.copy(job.paths[i][0]);
          }
          job.state = ST.DEBOARD;
          job.wait = 0.45;
        }
        break;
      }

      case ST.BOARD: {
        this._setIdleHover(true);
        if (job.wait > 0) {
          job.wait -= t;
          break;
        }
        if (!this._tickGuests(job, t, WALK * 1.05)) break;
        for (let i = 0; i < job.n; i++) this.guests[i].visible = false;
        job.wait = 0.35;
        this._setIdleHover(false);
        job.state = ST.WAYMO_OUT;
        job.carPath = this._leavePath();
        job.carI = 0;
        break;
      }

      case ST.DEBOARD: {
        this._setIdleHover(true);
        if (job.wait > 0) {
          job.wait -= t;
          break;
        }
        job.paths = this._pathsCarToDoor(job.n);
        job.pathI = new Array(job.n).fill(0);
        if (job.closed) {
          // Gaymo peels off immediately; guest heads to the (locked) door
          this._setIdleHover(false);
          job.carPath = this._leavePath();
          job.carI = 0;
          job.state = ST.CLOSED_WALK;
        } else {
          this._setIdleHover(false);
          job.state = ST.TO_DOOR;
        }
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

      case ST.CLOSED_WALK: {
        // First Gaymo leaves while the guest walks to the porch
        if (this.waymo.visible && job.carPath) {
          if (this._tickCar(job, t)) {
            this.waymo.visible = false;
            job.carPath = null;
          }
        }
        if (!this._tickGuests(job, t)) break;
        // At the door — face it and start knocking
        const g = this.guests[0];
        g.position.copy(this.streetDoor);
        this._faceDoor(g);
        job.knocks = 0;
        job.knockPhase = 0;
        job.wait = 0;
        job.state = ST.KNOCK;
        break;
      }

      case ST.KNOCK: {
        const g = this.guests[0];
        this._faceDoor(g);
        // Three knocks: lean in / lean out, float a "knock" sprite each time
        job.knockPhase += t;
        const half = 0.18;
        const cycle = half * 2;
        const idx = Math.min(3, Math.floor(job.knockPhase / cycle));
        const inKnock = job.knockPhase % cycle;
        const lean =
          idx >= 3
            ? 0
            : inKnock < half
              ? inKnock / half
              : 1 - (inKnock - half) / half;
        g.position.y = lean * 0.04;
        const yaw = g.rotation.y;
        g.position.x = this.streetDoor.x + Math.sin(yaw) * lean * 0.08;
        g.position.z = this.streetDoor.z + Math.cos(yaw) * lean * 0.08;

        if (idx > job.knocks && job.knocks < 3) {
          job.knocks = idx;
          this.knockFx.visible = true;
          this.knockFx.material.opacity = 1;
          this.knockFx.position.set(
            this.streetDoor.x,
            1.35,
            this.streetDoor.z + 0.15
          );
        }
        if (this.knockFx.visible) {
          this.knockFx.position.y += t * 0.6;
          this.knockFx.material.opacity -= t * 1.4;
          if (this.knockFx.material.opacity <= 0) this.knockFx.visible = false;
        }

        if (job.knockPhase > cycle * 3 + 0.35) {
          this.knockFx.visible = false;
          g.position.copy(this.streetDoor);
          g.position.y = 0;
          job.wait = 0;
          job.state = ST.CONFUSED;
        }
        break;
      }

      case ST.CONFUSED: {
        const g = this.guests[0];
        job.wait += t;
        // Look left-right, big question mark overhead
        g.rotation.y = Math.sin(job.wait * 3.2) * 0.85;
        g.position.y = Math.abs(Math.sin(job.wait * 6)) * 0.02;
        this.qMark.visible = true;
        this.qMark.position.set(g.position.x, 1.45, g.position.z);
        this.qMark.material.opacity =
          0.75 + 0.25 * Math.sin(job.wait * 5);
        if (job.wait < 2.2) break;
        this.qMark.visible = false;
        g.position.y = 0;
        this._faceDoor(g);
        job.wait = 0;
        job.state = ST.CALL;
        break;
      }

      case ST.CALL: {
        const g = this.guests[0];
        job.wait += t;
        // Phone out, glance at the screen
        this._placePhone(g);
        g.rotation.y += Math.sin(job.wait * 2) * 0.02;
        if (job.wait < 1.6) break;
        this.phone.visible = false;
        // Call a rescue Gaymo — walk back to the aisle wait spot
        job.paths = [
          this._clean([
            this.streetDoor.clone(),
            this.yardCorner.clone(),
            (this.waitPoints[0] || this.carStop).clone(),
          ]),
        ];
        job.pathI = [0];
        job.n = 1;
        job.state = ST.RESCUE_IN;
        job.wait = 0;
        // Spawn the rescue ride as they start walking back
        job.carPath = this._spawnArrive();
        job.carI = 0;
        job.lotFrom = this.inLot ? 3 : job.carPath.length;
        break;
      }

      case ST.RESCUE_IN: {
        // Guest to wait spot + Gaymo into the lot
        const guestDone = this._tickGuests(job, t);
        const carDone = this._tickCar(job, t);
        if (!carDone) break;
        this.waymo.position.copy(this.carStop);
        this.waymo.rotation.y = this.stopFaceY;
        this._setIdleHover(true);
        if (!guestDone) break;
        // Board the rescue
        job.paths = this._pathsCurbToCar(1);
        job.pathI = [0];
        job.state = ST.RESCUE_BOARD;
        job.wait = 0.3;
        break;
      }

      case ST.RESCUE_BOARD: {
        this._setIdleHover(true);
        if (job.wait > 0) {
          job.wait -= t;
          break;
        }
        if (!this._tickGuests(job, t, WALK * 1.05)) break;
        this.guests[0].visible = false;
        job.wait = 0.3;
        this._setIdleHover(false);
        job.state = ST.RESCUE_OUT;
        job.carPath = this._leavePath();
        job.carI = 0;
        break;
      }

      case ST.RESCUE_OUT:
      case ST.WAYMO_OUT: {
        if (job.wait > 0) {
          job.wait -= t;
          break;
        }
        if (!this._tickCar(job, t)) break;
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
    this._hideFx();
    this.job = null;
  }
}

function _questionTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#3ec8ff";
  ctx.font = "bold 100px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("?", 64, 72);
  return canvasTexture(c);
}

function _knockTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 96;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "rgba(20,18,34,0.75)";
  roundRect(ctx, 8, 12, 240, 72, 16);
  ctx.fill();
  ctx.fillStyle = "#f2eef8";
  ctx.font = "bold 36px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("knock knock", 128, 50);
  return canvasTexture(c);
}


