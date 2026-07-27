/**
 * bird.js — one-shot pigeon flyby.
 *
 * A low-poly rock pigeon on a smooth arc over the property: wing flaps, bank
 * into turns, ease in/out. Built as a button test so we can tune the model and
 * flight before any ambient spawn.
 */
import * as THREE from "three";
import { box, cyl } from "./kit.js";

/** Soft gray pigeon palette. */
const COL = {
  body: 0x9a9aa4,
  breast: 0xb8b8c0,
  head: 0x7a7a84,
  neck: 0x6a8a9a, // slight iridescent blue-gray
  wing: 0x6e6e78,
  wingBar: 0x2a2a30,
  wingTip: 0x1e1e24,
  tail: 0x5a5a64,
  beak: 0xd4a86a,
  cere: 0xe8a0a8,
  eye: 0x1a1a1e,
  leg: 0xc47850,
};

/**
 * Low-poly rock pigeon. Local +Z is forward (beak), +Y up, +X right wing.
 * Wings are separate groups so they can flap.
 */
export function createPigeon() {
  const g = new THREE.Group();
  g.name = "pigeon";

  // Body (slightly elongated)
  const body = cyl(0.11, 0.14, 0.32, COL.body, { roughness: 0.75 }, 8);
  body.rotation.x = Math.PI / 2;
  body.position.set(0, 0.02, 0.02);
  g.add(body);

  // Breast / chest fuller
  const breast = cyl(0.1, 0.12, 0.14, COL.breast, { roughness: 0.7 }, 7);
  breast.rotation.x = Math.PI / 2 + 0.35;
  breast.position.set(0, -0.02, 0.12);
  g.add(breast);

  // Neck
  const neck = cyl(0.055, 0.07, 0.1, COL.neck, {
    roughness: 0.55,
    metalness: 0.15,
    emissive: 0x2a4050,
    emissiveIntensity: 0.08,
  }, 7);
  neck.position.set(0, 0.06, 0.2);
  neck.rotation.x = 0.45;
  g.add(neck);

  // Head
  const head = cyl(0.07, 0.075, 0.1, COL.head, { roughness: 0.65 }, 8);
  head.rotation.x = Math.PI / 2;
  head.position.set(0, 0.1, 0.26);
  g.add(head);

  // Beak
  const beak = cyl(0.01, 0.028, 0.07, COL.beak, { roughness: 0.5 }, 5);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.08, 0.34);
  g.add(beak);

  // Cere (pink nose band)
  const cere = cyl(0.02, 0.025, 0.025, COL.cere, { roughness: 0.6 }, 5);
  cere.rotation.x = Math.PI / 2;
  cere.position.set(0, 0.09, 0.31);
  g.add(cere);

  // Eyes
  for (const side of [-1, 1]) {
    const eye = cyl(0.015, 0.015, 0.02, COL.eye, { roughness: 0.3 }, 5);
    eye.rotation.z = Math.PI / 2;
    eye.position.set(side * 0.055, 0.12, 0.28);
    g.add(eye);
  }

  // Tail
  const tail = box(0.1, 0.02, 0.16, COL.tail, { roughness: 0.7 });
  tail.position.set(0, 0.04, -0.2);
  tail.rotation.x = -0.25;
  g.add(tail);

  // Legs (tucked in flight — small stubs)
  for (const side of [-1, 1]) {
    const leg = cyl(0.012, 0.015, 0.06, COL.leg, { roughness: 0.7 }, 4);
    leg.position.set(side * 0.04, -0.1, 0.04);
    g.add(leg);
  }

  // Wings — hinged at shoulder
  const leftWing = _makeWing(-1);
  leftWing.position.set(-0.1, 0.04, 0.04);
  g.add(leftWing);

  const rightWing = _makeWing(1);
  rightWing.position.set(0.1, 0.04, 0.04);
  g.add(rightWing);

  g.userData.leftWing = leftWing;
  g.userData.rightWing = rightWing;

  /**
   * @param {number} phase 0..1 flap cycle
   * @param {number} amp flap amplitude (rad)
   */
  g.userData.flap = (phase, amp = 0.7) => {
    // Sine flap; outer tip lags slightly via nested group
    const a = Math.sin(phase * Math.PI * 2) * amp;
    leftWing.rotation.z = a;
    rightWing.rotation.z = -a;
    // Slight forward sweep on downstroke
    const sweep = Math.sin(phase * Math.PI * 2) * 0.12;
    leftWing.rotation.y = -0.15 + sweep;
    rightWing.rotation.y = 0.15 - sweep;
  };

  return g;
}

function _makeWing(side) {
  // side: -1 left, +1 right
  const wing = new THREE.Group();
  wing.name = side < 0 ? "leftWing" : "rightWing";

  // Upper arm / coverts
  const coverts = box(0.22, 0.025, 0.16, COL.wing, { roughness: 0.72 });
  coverts.position.set(side * 0.12, 0, 0.02);
  coverts.rotation.z = side * 0.08;
  wing.add(coverts);

  // Dark wing bar
  const bar = box(0.2, 0.02, 0.04, COL.wingBar, { roughness: 0.65 });
  bar.position.set(side * 0.14, 0.01, -0.02);
  wing.add(bar);

  // Outer primaries (darker tip)
  const tip = box(0.18, 0.018, 0.12, COL.wingTip, { roughness: 0.7 });
  tip.position.set(side * 0.28, -0.01, -0.04);
  tip.rotation.z = side * 0.2;
  tip.rotation.x = -0.1;
  wing.add(tip);

  return wing;
}

/**
 * One-shot pigeon flyby over the venue.
 */
export class BirdSystem {
  /**
   * @param {THREE.Object3D} parent
   * @param {THREE.Group} venue
   */
  constructor(parent, venue) {
    this.root = new THREE.Group();
    this.root.name = "bird";
    parent.add(this.root);

    this.venue = venue;
    venue.updateWorldMatrix(true, true);
    const m = venue.matrixWorld;
    // Approximate property centre in world space
    const pad = venue.userData.pad;
    if (pad) {
      const c = new THREE.Vector3(
        (pad.xMin + pad.xMax) * 0.5,
        0,
        (pad.zMin + pad.zMax) * 0.5
      ).applyMatrix4(m);
      this.center = c;
    } else {
      this.center = new THREE.Vector3(0, 0, 0);
    }

    this.bird = createPigeon();
    this.bird.visible = false;
    this.bird.scale.setScalar(1.15); // readable on phone
    this.root.add(this.bird);

    this.job = null;
    this.clock = 0;

    // Scratch
    this._pos = new THREE.Vector3();
    this._tan = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    this._quat = new THREE.Quaternion();
    this._mat = new THREE.Matrix4();
  }

  get busy() {
    return this.job !== null;
  }

  /**
   * Start a graceful arc over the property.
   * @returns {boolean}
   */
  start() {
    if (this.job) return false;

    // Random direction: mostly along the street (X) or across the lot
    const alongStreet = Math.random() < 0.65;
    const sign = Math.random() < 0.5 ? 1 : -1;
    const c = this.center;

    let pts;
    if (alongStreet) {
      // Fly along 7th Ave frontage, slightly over the property
      pts = [
        new THREE.Vector3(c.x + sign * 16, 3.2 + Math.random(), c.z + 8),
        new THREE.Vector3(c.x + sign * 8, 4.0, c.z + 5.5),
        new THREE.Vector3(c.x + sign * 1, 4.6, c.z + 3.2),
        new THREE.Vector3(c.x - sign * 4, 4.4, c.z + 1.5),
        new THREE.Vector3(c.x - sign * 10, 3.8, c.z + 4),
        new THREE.Vector3(c.x - sign * 18, 3.0, c.z + 9),
      ];
    } else {
      // Diagonal over the lot / mural side
      pts = [
        new THREE.Vector3(c.x + 12, 3.5, c.z + sign * 10),
        new THREE.Vector3(c.x + 5, 4.5, c.z + sign * 4),
        new THREE.Vector3(c.x - 1, 5.0, c.z + sign * 0.5),
        new THREE.Vector3(c.x - 6, 4.3, c.z - sign * 3),
        new THREE.Vector3(c.x - 14, 3.2, c.z - sign * 8),
      ];
    }

    const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.35);
    // Duration scales a bit with path length so speed feels consistent
    const len = curve.getLength();
    const duration = THREE.MathUtils.clamp(len / 7.5, 5.5, 9.5);

    this.bird.visible = true;
    this.bird.userData.flap(0, 0);
    curve.getPoint(0, this._pos);
    this.bird.position.copy(this._pos);

    this.job = {
      curve,
      t: 0,
      duration,
      flapPhase: Math.random(),
      prevPos: this._pos.clone(),
    };
    return true;
  }

  /** For optional camera follow. */
  followPoint() {
    if (!this.bird.visible) return null;
    const p = this.bird.position;
    return { x: p.x, y: p.y + 0.3, z: p.z };
  }

  update(dt) {
    const t = Math.min(dt, 0.05);
    this.clock += t;
    const job = this.job;
    if (!job) return;

    job.t += t;
    // Smoothstep ease on the path so takeoff and exit aren't abrupt
    const u = Math.min(1, job.t / job.duration);
    const s = u * u * (3 - 2 * u);
    // Mix a little linear so mid-flight stays lively
    const prog = s * 0.85 + u * 0.15;

    job.curve.getPoint(Math.min(0.999, prog), this._pos);
    job.curve.getTangent(Math.min(0.999, prog), this._tan);
    this._tan.normalize();

    // Vertical bob — gentle, not frantic
    const bob = Math.sin(this.clock * 3.2) * 0.08;
    this.bird.position.set(this._pos.x, this._pos.y + bob, this._pos.z);

    // Orient: +Z forward along tangent
    this._look.copy(this.bird.position).add(this._tan);
    this._mat.lookAt(this.bird.position, this._look, this._up);
    this._quat.setFromRotationMatrix(this._mat);
    this.bird.quaternion.slerp(this._quat, 1 - Math.exp(-t * 10));

    // Bank into curvature: approximate with lateral change of tangent
    const lookAhead = Math.min(0.999, prog + 0.04);
    const tan2 = job.curve.getTangent(lookAhead);
    // Cross product y-component ≈ horizontal turn rate
    const turn = this._tan.x * tan2.z - this._tan.z * tan2.x;
    const bank = THREE.MathUtils.clamp(-turn * 8, -0.55, 0.55);
    // Apply bank in local space after lookAt
    this.bird.rotateZ(bank * 0.85);

    // Wing flap rate: faster when climbing / early flight
    const climb = Math.max(0, this._tan.y);
    const flapRate = 3.8 + climb * 4 + (u < 0.15 || u > 0.85 ? 1.5 : 0);
    job.flapPhase = (job.flapPhase + t * flapRate) % 1;
    // Glide phases: smaller amplitude mid-cruise
    const amp =
      u > 0.25 && u < 0.75
        ? 0.35 + Math.abs(Math.sin(this.clock * 0.7)) * 0.25
        : 0.75;
    this.bird.userData.flap(job.flapPhase, amp);

    if (u >= 1) {
      this.bird.visible = false;
      this.job = null;
    }
  }
}
