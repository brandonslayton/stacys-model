/**
 * rideshare.js — Waymo pickup / drop-off at the curb.
 *
 * Tap: one or two guests walk out of the porch, wait on the sidewalk, a Waymo
 * pulls up, they board, and it drives off.
 *
 * Double-tap or long-press: a Waymo arrives, drops one or two people off, they
 * walk into the bar, and it leaves.
 *
 * Separate from life.js on purpose — ambient cars are anonymous and pool-based;
 * this is a named one-shot performance with a unique robotaxi mesh.
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

const ST = {
  GUESTS_OUT: "guests_out",
  WAIT_CURB: "wait_curb",
  WAYMO_IN: "waymo_in",
  BOARD: "board",
  DEBOARD: "deboard",
  TO_DOOR: "to_door",
  WAYMO_OUT: "waymo_out",
};

/**
 * Waymo Jaguar I-Pace–style robotaxi: white body, black cladding, the tall
 * spinning lidar dome and roof sensor suite that read as "AI car" at a glance.
 * No driver silhouette — tinted empty cabin.
 */
export function createWaymo() {
  const g = new THREE.Group();
  g.name = "waymo";

  // Lower rocker / cladding
  const rocker = box(1.18, 0.18, 2.15, 0x1a1a1e, {
    roughness: 0.55,
    metalness: 0.15,
  });
  rocker.position.y = 0.28;
  g.add(rocker);

  // Main white body — tiny emissive so it still reads white under night neon
  const body = box(1.12, 0.38, 2.05, 0xf2f2f4, {
    roughness: 0.42,
    metalness: 0.08,
    emissive: 0xd8dce0,
    emissiveIntensity: 0.12,
  });
  body.position.y = 0.52;
  g.add(body);

  // Subtle charcoal belt line
  const belt = box(1.14, 0.06, 2.06, 0x2a2a30, { roughness: 0.5, metalness: 0.2 });
  belt.position.y = 0.72;
  g.add(belt);

  // Cabin — deep tint so it reads empty / no driver
  const cabin = box(0.98, 0.38, 1.15, 0x1a2830, {
    roughness: 0.18,
    metalness: 0.35,
    emissive: 0x0a1820,
    emissiveIntensity: 0.12,
  });
  cabin.position.set(0, 0.92, 0.05);
  g.add(cabin);

  // White roof panel over the cabin
  const roof = box(0.96, 0.08, 1.12, 0xf0f0f2, { roughness: 0.45 });
  roof.position.set(0, 1.14, 0.05);
  g.add(roof);

  // Front / rear glass darker strip
  for (const [z, d] of [
    [0.72, 0.28],
    [-0.62, 0.28],
  ]) {
    const glass = box(0.92, 0.28, d, 0x152028, {
      roughness: 0.15,
      metalness: 0.4,
      emissive: 0x081418,
      emissiveIntensity: 0.1,
    });
    glass.position.set(0, 0.88, z);
    g.add(glass);
  }

  // Front fascia with blue status strip (signature robotaxi cue)
  const fascia = box(1.0, 0.12, 0.08, 0x1a1a1e, { roughness: 0.4 });
  fascia.position.set(0, 0.42, 1.08);
  g.add(fascia);
  const led = box(0.72, 0.04, 0.05, 0x3ec8ff, {
    roughness: 0.25,
    emissive: 0x3ec8ff,
    emissiveIntensity: 0.85,
  });
  led.position.set(0, 0.48, 1.1);
  led.name = "waymoLed";
  g.add(led);

  // Rear light bar
  const rear = box(0.7, 0.05, 0.05, 0xff3344, {
    roughness: 0.3,
    emissive: 0xff2233,
    emissiveIntensity: 0.55,
  });
  rear.position.set(0, 0.48, -1.08);
  g.add(rear);

  // Wheels
  for (const [wx, wz] of [
    [-0.48, 0.62],
    [0.48, 0.62],
    [-0.48, -0.62],
    [0.48, -0.62],
  ]) {
    const wheel = cyl(0.2, 0.2, 0.16, 0x141418, { roughness: 0.85 }, 10);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.2, wz);
    g.add(wheel);
    const hub = cyl(0.08, 0.08, 0.17, 0x888890, { metalness: 0.5, roughness: 0.35 }, 8);
    hub.rotation.z = Math.PI / 2;
    hub.position.set(wx, 0.2, wz);
    g.add(hub);
  }

  // ── Roof sensor suite (the "this is a robotaxi" read) ──────────────
  const suite = new THREE.Group();
  suite.name = "sensorSuite";
  suite.position.set(0, 1.18, 0.02);
  g.add(suite);

  // Base plate
  const base = box(0.42, 0.05, 0.55, 0x1c1c22, { roughness: 0.45, metalness: 0.25 });
  base.position.y = 0.03;
  suite.add(base);

  // Main spinning lidar dome — matte white cylinder + dark band + blue ring
  const dome = new THREE.Group();
  dome.name = "lidarDome";
  dome.position.set(0, 0.22, 0.05);
  suite.add(dome);

  const domeBody = cyl(0.13, 0.14, 0.22, 0xf4f4f6, {
    roughness: 0.35,
    metalness: 0.12,
  }, 14);
  dome.add(domeBody);

  const domeBand = cyl(0.145, 0.145, 0.04, 0x222228, {
    roughness: 0.4,
    metalness: 0.3,
  }, 14);
  domeBand.position.y = 0.02;
  dome.add(domeBand);

  const blueRing = cyl(0.15, 0.15, 0.025, 0x3ec8ff, {
    roughness: 0.25,
    emissive: 0x3ec8ff,
    emissiveIntensity: 0.9,
  }, 16);
  blueRing.position.y = -0.06;
  blueRing.name = "lidarRing";
  dome.add(blueRing);

  // Cap
  const cap = cyl(0.08, 0.12, 0.05, 0xe8e8ec, { roughness: 0.4 }, 12);
  cap.position.y = 0.13;
  dome.add(cap);

  // Secondary sensors around the dome (cameras / mid-range lidar)
  for (const [sx, sz, sy] of [
    [0.16, 0.18, 0.08],
    [-0.16, 0.18, 0.08],
    [0.16, -0.16, 0.08],
    [-0.16, -0.16, 0.08],
    [0, 0.22, 0.12],
  ]) {
    const pod = box(0.08, 0.07, 0.09, 0x1a1a20, { roughness: 0.4, metalness: 0.3 });
    pod.position.set(sx, sy, sz);
    suite.add(pod);
    const lens = box(0.045, 0.04, 0.02, 0x111820, {
      roughness: 0.15,
      metalness: 0.5,
      emissive: 0x1a3040,
      emissiveIntensity: 0.2,
    });
    lens.position.set(sx, sy, sz + (sz >= 0 ? 0.05 : -0.05));
    suite.add(lens);
  }

  // Side fender camera pods
  for (const side of [-1, 1]) {
    const fender = box(0.08, 0.08, 0.12, 0x1a1a20, { roughness: 0.4, metalness: 0.25 });
    fender.position.set(side * 0.58, 0.72, 0.55);
    g.add(fender);
  }

  // Door badge — small "W" plate so it reads Waymo up close
  const badge = _waymoBadge();
  badge.position.set(0.565, 0.58, 0.1);
  badge.rotation.y = Math.PI / 2;
  g.add(badge);
  const badgeL = _waymoBadge();
  badgeL.position.set(-0.565, 0.58, 0.1);
  badgeL.rotation.y = -Math.PI / 2;
  g.add(badgeL);

  // Slightly larger than ambient life.js cars so the sensor dome reads clearly
  g.scale.setScalar(1.08);

  g.userData.spinLidar = (dt) => {
    dome.rotation.y += dt * 2.8;
  };
  g.userData.pulseLed = (t) => {
    const pulse = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 4.2));
    led.material.emissiveIntensity = pulse;
    blueRing.material.emissiveIntensity = 0.7 + 0.35 * (0.5 + 0.5 * Math.sin(t * 3.1));
  };

  return g;
}

function _waymoBadge() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#1a1a1e";
  roundRect(ctx, 4, 10, 56, 44, 8);
  ctx.fill();
  ctx.fillStyle = "#3ec8ff";
  ctx.font = "bold 36px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("W", 32, 34);
  const tex = canvasTexture(c);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.22),
    new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.5,
      metalness: 0.1,
      transparent: true,
    })
  );
  return mesh;
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
