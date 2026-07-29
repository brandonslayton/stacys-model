/**
 * bird.js — pigeon one-shots: flyby arc, and a realistic roof-perch sequence.
 *
 * Perch beats (as real as a low-poly rock pigeon allows):
 *   approach → flare/land → settle wings → look around → hop along the ridge
 *   → another look → crouch takeoff → exit off-screen.
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
 * Wings, head, and legs are separate groups so flight / perch / look work.
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

  // Neck + head as one look-group (yaw/pitch for scanning)
  const headRoot = new THREE.Group();
  headRoot.name = "headRoot";
  headRoot.position.set(0, 0.06, 0.18);
  g.add(headRoot);

  const neck = cyl(0.055, 0.07, 0.1, COL.neck, {
    roughness: 0.55,
    metalness: 0.15,
    emissive: 0x2a4050,
    emissiveIntensity: 0.08,
  }, 7);
  neck.position.set(0, 0.0, 0.02);
  neck.rotation.x = 0.45;
  headRoot.add(neck);

  const head = cyl(0.07, 0.075, 0.1, COL.head, { roughness: 0.65 }, 8);
  head.rotation.x = Math.PI / 2;
  head.position.set(0, 0.04, 0.08);
  headRoot.add(head);

  const beak = cyl(0.01, 0.028, 0.07, COL.beak, { roughness: 0.5 }, 5);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.02, 0.16);
  headRoot.add(beak);

  const cere = cyl(0.02, 0.025, 0.025, COL.cere, { roughness: 0.6 }, 5);
  cere.rotation.x = Math.PI / 2;
  cere.position.set(0, 0.03, 0.13);
  headRoot.add(cere);

  for (const side of [-1, 1]) {
    const eye = cyl(0.015, 0.015, 0.02, COL.eye, { roughness: 0.3 }, 5);
    eye.rotation.z = Math.PI / 2;
    eye.position.set(side * 0.055, 0.06, 0.1);
    headRoot.add(eye);
  }

  // Tail
  const tail = box(0.1, 0.02, 0.16, COL.tail, { roughness: 0.7 });
  tail.position.set(0, 0.04, -0.2);
  tail.rotation.x = -0.25;
  g.add(tail);

  // Legs — stowed in flight, extended on perch
  const legs = new THREE.Group();
  legs.name = "legs";
  g.add(legs);
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.04, -0.06, 0.04);
    const thigh = cyl(0.012, 0.014, 0.07, COL.leg, { roughness: 0.7 }, 4);
    thigh.position.y = -0.03;
    leg.add(thigh);
    const foot = box(0.035, 0.012, 0.04, COL.leg, { roughness: 0.65 });
    foot.position.set(0, -0.07, 0.01);
    leg.add(foot);
    legs.add(leg);
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
  g.userData.headRoot = headRoot;
  g.userData.legs = legs;

  /**
   * @param {number} phase 0..1 flap cycle
   * @param {number} amp flap amplitude (rad)
   */
  g.userData.flap = (phase, amp = 0.7) => {
    const a = Math.sin(phase * Math.PI * 2) * amp;
    leftWing.rotation.z = a;
    rightWing.rotation.z = -a;
    const sweep = Math.sin(phase * Math.PI * 2) * 0.12;
    leftWing.rotation.y = -0.15 + sweep;
    rightWing.rotation.y = 0.15 - sweep;
    leftWing.rotation.x = 0;
    rightWing.rotation.x = 0;
  };

  /**
   * Fold wings against the body for perching. t = 0 open/flapping pose, 1 tucked.
   */
  g.userData.foldWings = (t) => {
    const k = THREE.MathUtils.clamp(t, 0, 1);
    // Fold down and back along the body
    leftWing.rotation.z = THREE.MathUtils.lerp(0.15, 0.85, k);
    rightWing.rotation.z = THREE.MathUtils.lerp(-0.15, -0.85, k);
    leftWing.rotation.y = THREE.MathUtils.lerp(-0.15, -0.55, k);
    rightWing.rotation.y = THREE.MathUtils.lerp(0.15, 0.55, k);
    leftWing.rotation.x = THREE.MathUtils.lerp(0, 0.35, k);
    rightWing.rotation.x = THREE.MathUtils.lerp(0, 0.35, k);
  };

  /**
   * 0 = flight (legs tucked), 1 = standing on perch.
   */
  g.userData.setLegs = (t) => {
    const k = THREE.MathUtils.clamp(t, 0, 1);
    legs.scale.set(1, THREE.MathUtils.lerp(0.35, 1, k), 1);
    legs.position.y = THREE.MathUtils.lerp(0.04, 0, k);
    legs.visible = k > 0.05;
  };

  /**
   * Head look in local bird space (rad). yaw ±, pitch ±.
   */
  g.userData.look = (yaw, pitch) => {
    headRoot.rotation.y = yaw;
    headRoot.rotation.x = pitch;
  };

  // Defaults
  g.userData.setLegs(0);
  g.userData.look(0, 0);
  g.userData.flap(0, 0);

  return g;
}

function _makeWing(side) {
  const wing = new THREE.Group();
  wing.name = side < 0 ? "leftWing" : "rightWing";

  const coverts = box(0.22, 0.025, 0.16, COL.wing, { roughness: 0.72 });
  coverts.position.set(side * 0.12, 0, 0.02);
  coverts.rotation.z = side * 0.08;
  wing.add(coverts);

  const bar = box(0.2, 0.02, 0.04, COL.wingBar, { roughness: 0.65 });
  bar.position.set(side * 0.14, 0.01, -0.02);
  wing.add(bar);

  const tip = box(0.18, 0.018, 0.12, COL.wingTip, { roughness: 0.7 });
  tip.position.set(side * 0.28, -0.01, -0.04);
  tip.rotation.z = side * 0.2;
  tip.rotation.x = -0.1;
  wing.add(tip);

  return wing;
}

function smoothstep(u) {
  const x = THREE.MathUtils.clamp(u, 0, 1);
  return x * x * (3 - 2 * x);
}

function easeInOut(u) {
  const x = THREE.MathUtils.clamp(u, 0, 1);
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

/**
 * One-shot pigeon scenes over the venue.
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

    // Roof ridge in world space (for perch)
    this.ridge = this._buildRidge(venue);

    this.bird = createPigeon();
    this.bird.visible = false;
    this.bird.scale.setScalar(1.15); // readable on phone
    this.root.add(this.bird);

    this.job = null;
    this.clock = 0;

    this._pos = new THREE.Vector3();
    this._tan = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    this._quat = new THREE.Quaternion();
    this._mat = new THREE.Matrix4();
    this._tmp = new THREE.Vector3();
    // Model is built beak = +Z; Object3D/Matrix4.lookAt uses −Z as forward.
    this._faceFwd = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      Math.PI
    );
  }

  _buildRidge(venue) {
    const roof = venue.userData.roof;
    const m = venue.matrixWorld;
    if (!roof) {
      // Fallback approx if roof metadata missing
      const c = this.center;
      return {
        y: c.y + 4.0,
        pts: [
          new THREE.Vector3(c.x - 1.8, c.y + 4.0, c.z - 0.2),
          new THREE.Vector3(c.x - 0.6, c.y + 4.0, c.z - 0.2),
          new THREE.Vector3(c.x + 0.6, c.y + 4.0, c.z - 0.2),
          new THREE.Vector3(c.x + 1.8, c.y + 4.0, c.z - 0.2),
        ],
      };
    }
    const toW = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(m);
    const y = roof.ridgeY;
    const z = roof.ridgeZ;
    const x0 = roof.xMin;
    const x1 = roof.xMax;
    // 5 perch pads along the ridge (north → south in local +X)
    const pts = [];
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      pts.push(toW(THREE.MathUtils.lerp(x0, x1, t), y, z));
    }
    return { y: pts[0].y, pts };
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

    const alongStreet = Math.random() < 0.65;
    const sign = Math.random() < 0.5 ? 1 : -1;
    const c = this.center;

    let pts;
    if (alongStreet) {
      pts = [
        new THREE.Vector3(c.x + sign * 16, 3.2 + Math.random(), c.z + 8),
        new THREE.Vector3(c.x + sign * 8, 4.0, c.z + 5.5),
        new THREE.Vector3(c.x + sign * 1, 4.6, c.z + 3.2),
        new THREE.Vector3(c.x - sign * 4, 4.4, c.z + 1.5),
        new THREE.Vector3(c.x - sign * 10, 3.8, c.z + 4),
        new THREE.Vector3(c.x - sign * 18, 3.0, c.z + 9),
      ];
    } else {
      pts = [
        new THREE.Vector3(c.x + 12, 3.5, c.z + sign * 10),
        new THREE.Vector3(c.x + 5, 4.5, c.z + sign * 4),
        new THREE.Vector3(c.x - 1, 5.0, c.z + sign * 0.5),
        new THREE.Vector3(c.x - 6, 4.3, c.z - sign * 3),
        new THREE.Vector3(c.x - 14, 3.2, c.z - sign * 8),
      ];
    }

    const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.35);
    const len = curve.getLength();
    const duration = THREE.MathUtils.clamp(len / 7.5, 5.5, 9.5);

    this.bird.visible = true;
    this.bird.userData.setLegs(0);
    this.bird.userData.look(0, 0);
    this.bird.userData.flap(0, 0);
    curve.getPoint(0, this._pos);
    this.bird.position.copy(this._pos);

    this.job = {
      kind: "flyby",
      curve,
      t: 0,
      duration,
      flapPhase: Math.random(),
      prevPos: this._pos.clone(),
    };
    return true;
  }

  /**
   * Fly in, land on the ridge, look around, hop along the roof, take off, exit.
   * @returns {boolean}
   */
  startPerch() {
    if (this.job) return false;

    const ridge = this.ridge.pts;
    // Land near the middle-north of the ridge, hop southward (or reverse)
    const dir = Math.random() < 0.5 ? 1 : -1;
    const startIdx = dir > 0 ? 1 : 3;
    const hopIdx = [];
    if (dir > 0) {
      for (let i = startIdx; i < ridge.length; i++) hopIdx.push(i);
    } else {
      for (let i = startIdx; i >= 0; i--) hopIdx.push(i);
    }
    // Cap hops to 3 so the beat stays punchy
    const perchPads = hopIdx.slice(0, 3).map((i) => ridge[i].clone());
    const land = perchPads[0].clone();

    // Approach from street frontage (+Z world-ish relative to center), bank in
    const c = this.center;
    const approachSign = land.x >= c.x ? 1 : -1;
    const approachPts = [
      new THREE.Vector3(
        land.x + approachSign * 10,
        land.y + 2.2,
        land.z + 11
      ),
      new THREE.Vector3(
        land.x + approachSign * 4.5,
        land.y + 1.6,
        land.z + 6.5
      ),
      new THREE.Vector3(land.x + approachSign * 1.2, land.y + 0.9, land.z + 2.8),
      new THREE.Vector3(land.x + approachSign * 0.35, land.y + 0.45, land.z + 0.8),
      land.clone().add(new THREE.Vector3(0, 0.55, 0.15)), // flare hover
    ];
    const approachCurve = new THREE.CatmullRomCurve3(
      approachPts,
      false,
      "catmullrom",
      0.4
    );

    // Exit: leap up, then peel off over the street / lot
    const exitDir = dir > 0 ? 1 : -1;
    const lastPad = perchPads[perchPads.length - 1];
    const exitPts = [
      lastPad.clone().add(new THREE.Vector3(0, 0.15, 0)),
      lastPad.clone().add(new THREE.Vector3(exitDir * 0.6, 1.1, 0.8)),
      lastPad.clone().add(new THREE.Vector3(exitDir * 3.5, 2.4, 3.5)),
      lastPad.clone().add(new THREE.Vector3(exitDir * 8, 3.2, 8)),
      lastPad.clone().add(new THREE.Vector3(exitDir * 14, 2.6, 14)),
    ];
    const exitCurve = new THREE.CatmullRomCurve3(
      exitPts,
      false,
      "catmullrom",
      0.35
    );

    this.bird.visible = true;
    this.bird.userData.setLegs(0);
    this.bird.userData.look(0, 0);
    this.bird.userData.flap(0, 0.7);
    approachCurve.getPoint(0, this._pos);
    this.bird.position.copy(this._pos);

    this.job = {
      kind: "perch",
      phase: "approach",
      t: 0,
      flapPhase: Math.random(),
      approachCurve,
      exitCurve,
      perchPads,
      padI: 0,
      // phase durations (seconds)
      approachDur: THREE.MathUtils.clamp(
        approachCurve.getLength() / 6.2,
        3.2,
        5.0
      ),
      flareDur: 0.85,
      settleDur: 0.55,
      lookDur: 2.4 + Math.random() * 0.8,
      hopDur: 0.55,
      hopPause: 0.7 + Math.random() * 0.35,
      look2Dur: 1.6 + Math.random() * 0.5,
      crouchDur: 0.35,
      takeoffDur: 0.55,
      exitDur: THREE.MathUtils.clamp(exitCurve.getLength() / 8.0, 2.4, 4.0),
      // look targets cycle
      lookTargets: this._makeLookTargets(),
      lookI: 0,
      fold: 0,
      legs: 0,
      from: land.clone(),
      to: land.clone(),
      faceYaw: 0,
    };
    return true;
  }

  _makeLookTargets() {
    // Pigeons scan in short holds — yaw/pitch pairs
    return [
      { yaw: 0.55, pitch: -0.12, hold: 0.55 },
      { yaw: -0.7, pitch: -0.08, hold: 0.7 },
      { yaw: 0.15, pitch: 0.2, hold: 0.45 }, // glance up
      { yaw: -0.35, pitch: -0.15, hold: 0.6 },
      { yaw: 0.8, pitch: -0.05, hold: 0.5 },
      { yaw: 0, pitch: -0.1, hold: 0.4 },
    ];
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

    if (job.kind === "flyby") this._updateFlyby(job, t);
    else if (job.kind === "perch") this._updatePerch(job, t);
  }

  _updateFlyby(job, t) {
    job.t += t;
    const u = Math.min(1, job.t / job.duration);
    const s = u * u * (3 - 2 * u);
    const prog = s * 0.85 + u * 0.15;

    job.curve.getPoint(Math.min(0.999, prog), this._pos);
    job.curve.getTangent(Math.min(0.999, prog), this._tan);
    this._tan.normalize();

    const bob = Math.sin(this.clock * 3.2) * 0.08;
    this.bird.position.set(this._pos.x, this._pos.y + bob, this._pos.z);

    this._orientAlong(this._tan, t, 10);

    const lookAhead = Math.min(0.999, prog + 0.04);
    const tan2 = job.curve.getTangent(lookAhead);
    const turn = this._tan.x * tan2.z - this._tan.z * tan2.x;
    const bank = THREE.MathUtils.clamp(-turn * 8, -0.55, 0.55);
    this.bird.rotateZ(bank * 0.85);

    const climb = Math.max(0, this._tan.y);
    const flapRate = 3.8 + climb * 4 + (u < 0.15 || u > 0.85 ? 1.5 : 0);
    job.flapPhase = (job.flapPhase + t * flapRate) % 1;
    const amp =
      u > 0.25 && u < 0.75
        ? 0.35 + Math.abs(Math.sin(this.clock * 0.7)) * 0.25
        : 0.75;
    this.bird.userData.flap(job.flapPhase, amp);
    this.bird.userData.setLegs(0);
    this.bird.userData.look(0, 0);

    if (u >= 1) this._end();
  }

  _updatePerch(job, t) {
    job.t += t;
    const phase = job.phase;

    if (phase === "approach") {
      const u = Math.min(1, job.t / job.approachDur);
      const prog = easeInOut(u);
      job.approachCurve.getPoint(Math.min(0.999, prog), this._pos);
      job.approachCurve.getTangent(Math.min(0.999, prog), this._tan);
      this._tan.normalize();
      // Slow near end (flare energy)
      const slow = 1 - smoothstep((u - 0.65) / 0.35) * 0.35;
      const bob = Math.sin(this.clock * 4.2) * 0.05 * (1 - u * 0.5);
      this.bird.position.set(this._pos.x, this._pos.y + bob, this._pos.z);
      this._orientAlong(this._tan, t, 8 + u * 4);

      const flapRate = 4.2 + (1 - slow) * 2;
      job.flapPhase = (job.flapPhase + t * flapRate) % 1;
      this.bird.userData.flap(job.flapPhase, 0.55 + (1 - u) * 0.25);
      this.bird.userData.setLegs(smoothstep((u - 0.75) / 0.25));
      this.bird.userData.look(0, -0.05);

      if (u >= 1) {
        job.phase = "flare";
        job.t = 0;
        job.from.copy(this.bird.position);
        job.to.copy(job.perchPads[0]);
      }
      return;
    }

    if (phase === "flare") {
      // Final stall onto the ridge: wings wide, pitch up, legs out
      const u = Math.min(1, job.t / job.flareDur);
      const s = smoothstep(u);
      this._pos.lerpVectors(job.from, job.to, s);
      // Slight arc over the ridge before settling
      this._pos.y += Math.sin(s * Math.PI) * 0.28 * (1 - s);
      this.bird.position.copy(this._pos);

      this._tan.subVectors(job.to, job.from).normalize();
      if (this._tan.lengthSq() < 1e-6) this._tan.set(0, 0, 1);
      this._orientAlong(this._tan, t, 14);
      // Pitch up as we flare
      this.bird.rotateX(-0.35 * (1 - s) - 0.08);

      job.flapPhase = (job.flapPhase + t * (3.2 + (1 - u) * 2)) % 1;
      // Big slow wing beats into a hold
      const amp = THREE.MathUtils.lerp(0.85, 0.15, s);
      this.bird.userData.flap(job.flapPhase, amp);
      job.legs = smoothstep(u);
      this.bird.userData.setLegs(job.legs);
      this.bird.userData.look(0, -0.2 + s * 0.1);

      if (u >= 1) {
        job.phase = "settle";
        job.t = 0;
        job.fold = 0;
        // Face along the ridge toward next hop if any
        if (job.perchPads.length > 1) {
          this._tan.subVectors(job.perchPads[1], job.perchPads[0]).normalize();
        }
        job.faceYaw = Math.atan2(this._tan.x, this._tan.z);
      }
      return;
    }

    if (phase === "settle") {
      const u = Math.min(1, job.t / job.settleDur);
      const s = smoothstep(u);
      // Soft landing settle (tiny bounce)
      const bounce = Math.sin(s * Math.PI) * 0.04 * (1 - s);
      this.bird.position.copy(job.perchPads[job.padI]);
      this.bird.position.y += bounce;

      this._faceYaw(job.faceYaw, t, 8);
      // Fold wings against body
      job.fold = s;
      this.bird.userData.foldWings(job.fold);
      this.bird.userData.setLegs(1);
      // Small crouch release
      this.bird.scale.setScalar(1.15 * (1 - 0.04 * Math.sin(s * Math.PI)));

      if (u >= 1) {
        this.bird.scale.setScalar(1.15);
        job.phase = "look";
        job.t = 0;
        job.lookI = 0;
        job.lookHold = 0;
        job.lookFrom = { yaw: 0, pitch: -0.08 };
        job.lookTo = job.lookTargets[0];
      }
      return;
    }

    if (phase === "look" || phase === "look2") {
      this.bird.position.copy(job.perchPads[job.padI]);
      // Micro weight shift
      this.bird.position.y += Math.sin(this.clock * 1.6) * 0.008;
      this._faceYaw(job.faceYaw, t, 4);
      this.bird.userData.foldWings(1);
      this.bird.userData.setLegs(1);

      // Animate head toward current look target
      job.lookHold += t;
      const hold = job.lookTo.hold || 0.5;
      const k = smoothstep(Math.min(1, job.lookHold / 0.22));
      const yaw = THREE.MathUtils.lerp(job.lookFrom.yaw, job.lookTo.yaw, k);
      const pitch = THREE.MathUtils.lerp(job.lookFrom.pitch, job.lookTo.pitch, k);
      this.bird.userData.look(yaw, pitch);

      // Occasional tiny wing tuck adjust
      if (Math.sin(this.clock * 7) > 0.92) {
        this.bird.userData.foldWings(0.92);
      }

      if (job.lookHold >= hold) {
        job.lookI++;
        const dur = phase === "look" ? job.lookDur : job.look2Dur;
        if (job.t >= dur || job.lookI >= job.lookTargets.length) {
          if (phase === "look" && job.padI < job.perchPads.length - 1) {
            job.phase = "hop";
            job.t = 0;
            job.from.copy(job.perchPads[job.padI]);
            job.to.copy(job.perchPads[job.padI + 1]);
            this._tan.subVectors(job.to, job.from).normalize();
            job.faceYaw = Math.atan2(this._tan.x, this._tan.z);
          } else if (phase === "look") {
            // No more hops — go to second look then takeoff
            job.phase = "look2";
            job.t = 0;
            job.lookI = 0;
            job.lookHold = 0;
            job.lookFrom = { yaw, pitch };
            job.lookTo = job.lookTargets[0];
          } else {
            job.phase = "crouch";
            job.t = 0;
          }
        } else {
          job.lookFrom = { yaw, pitch };
          job.lookTo = job.lookTargets[job.lookI % job.lookTargets.length];
          job.lookHold = 0;
        }
      }
      return;
    }

    if (phase === "hop") {
      const u = Math.min(1, job.t / job.hopDur);
      const s = easeInOut(u);
      this._pos.lerpVectors(job.from, job.to, s);
      // Parabolic hop — pigeons hop more than they walk on a ridge
      const hopH = 0.38 + job.from.distanceTo(job.to) * 0.12;
      this._pos.y += Math.sin(s * Math.PI) * hopH;
      this.bird.position.copy(this._pos);

      this._tan.subVectors(job.to, job.from).normalize();
      this._orientAlong(this._tan, t, 16);
      // Slight nose-down at apex, up on land
      this.bird.rotateX(-0.15 * Math.sin(s * Math.PI));

      if (u < 0.15) {
        // Push-off crouch → extend
        this.bird.userData.setLegs(1 - u / 0.15 * 0.4);
        this.bird.userData.foldWings(1 - u / 0.15 * 0.5);
      } else if (u < 0.75) {
        // Mid-hop: quick wing beats
        job.flapPhase = (job.flapPhase + t * 7) % 1;
        this.bird.userData.flap(job.flapPhase, 0.55);
        this.bird.userData.setLegs(0.2);
      } else {
        // Landing
        const landK = (u - 0.75) / 0.25;
        this.bird.userData.setLegs(landK);
        this.bird.userData.foldWings(landK);
        this.bird.userData.look(0, -0.15);
      }

      if (u >= 1) {
        job.padI++;
        job.phase = "hopPause";
        job.t = 0;
        this.bird.position.copy(job.perchPads[job.padI]);
        this.bird.userData.foldWings(1);
        this.bird.userData.setLegs(1);
      }
      return;
    }

    if (phase === "hopPause") {
      const u = Math.min(1, job.t / job.hopPause);
      this.bird.position.copy(job.perchPads[job.padI]);
      this.bird.position.y += Math.sin(this.clock * 2.2) * 0.006;
      this._faceYaw(job.faceYaw, t, 6);
      this.bird.userData.foldWings(1);
      this.bird.userData.setLegs(1);
      // Quick look after each hop
      const peek = Math.sin(job.t * 3) * 0.35;
      this.bird.userData.look(peek, -0.1);

      if (u >= 1) {
        if (job.padI < job.perchPads.length - 1) {
          job.phase = "hop";
          job.t = 0;
          job.from.copy(job.perchPads[job.padI]);
          job.to.copy(job.perchPads[job.padI + 1]);
          this._tan.subVectors(job.to, job.from).normalize();
          job.faceYaw = Math.atan2(this._tan.x, this._tan.z);
        } else {
          job.phase = "look2";
          job.t = 0;
          job.lookI = 0;
          job.lookHold = 0;
          job.lookFrom = { yaw: 0, pitch: -0.08 };
          job.lookTo = job.lookTargets[1] || job.lookTargets[0];
        }
      }
      return;
    }

    if (phase === "crouch") {
      const u = Math.min(1, job.t / job.crouchDur);
      const s = smoothstep(u);
      this.bird.position.copy(job.perchPads[job.padI]);
      // Compress for spring
      this.bird.position.y -= s * 0.06;
      this.bird.scale.setScalar(1.15 * (1 - 0.06 * s));
      this._faceYaw(job.faceYaw, t, 6);
      this.bird.userData.foldWings(1 - s * 0.3);
      this.bird.userData.setLegs(1);
      this.bird.userData.look(0, s * 0.25); // head up — about to go

      if (u >= 1) {
        job.phase = "takeoff";
        job.t = 0;
        job.from.copy(this.bird.position);
        job.exitCurve.getPoint(0.12, job.to);
        this.bird.scale.setScalar(1.15);
      }
      return;
    }

    if (phase === "takeoff") {
      const u = Math.min(1, job.t / job.takeoffDur);
      const s = easeInOut(u);
      // Leap onto the exit curve start
      job.exitCurve.getPoint(THREE.MathUtils.lerp(0, 0.18, s), this._pos);
      this.bird.position.copy(this._pos);
      job.exitCurve.getTangent(Math.min(0.2, s * 0.2 + 0.02), this._tan);
      this._tan.normalize();
      this._orientAlong(this._tan, t, 12);

      job.flapPhase = (job.flapPhase + t * (6 + u * 3)) % 1;
      this.bird.userData.flap(job.flapPhase, 0.85);
      this.bird.userData.setLegs(1 - s);
      this.bird.userData.look(0, -0.05);

      if (u >= 1) {
        job.phase = "exit";
        job.t = 0;
      }
      return;
    }

    if (phase === "exit") {
      const u = Math.min(1, job.t / job.exitDur);
      const prog = easeInOut(u) * 0.9 + u * 0.1;
      // Start further along curve since takeoff already used the first segment
      const p = THREE.MathUtils.lerp(0.18, 0.999, prog);
      job.exitCurve.getPoint(p, this._pos);
      job.exitCurve.getTangent(p, this._tan);
      this._tan.normalize();

      const bob = Math.sin(this.clock * 3.5) * 0.06;
      this.bird.position.set(this._pos.x, this._pos.y + bob, this._pos.z);
      this._orientAlong(this._tan, t, 10);

      const lookAhead = Math.min(0.999, p + 0.04);
      const tan2 = job.exitCurve.getTangent(lookAhead);
      const turn = this._tan.x * tan2.z - this._tan.z * tan2.x;
      const bank = THREE.MathUtils.clamp(-turn * 7, -0.5, 0.5);
      this.bird.rotateZ(bank * 0.8);

      const flapRate = 4.5 + (u < 0.25 ? 2 : 0);
      job.flapPhase = (job.flapPhase + t * flapRate) % 1;
      const amp = u > 0.45 ? 0.4 + Math.abs(Math.sin(this.clock)) * 0.2 : 0.75;
      this.bird.userData.flap(job.flapPhase, amp);
      this.bird.userData.setLegs(0);
      this.bird.userData.look(0, 0);

      if (u >= 1) this._end();
    }
  }

  _orientAlong(tan, dt, rate) {
    this._look.copy(this.bird.position).add(tan);
    this._mat.lookAt(this.bird.position, this._look, this._up);
    this._quat.setFromRotationMatrix(this._mat).multiply(this._faceFwd);
    this.bird.quaternion.slerp(this._quat, 1 - Math.exp(-dt * rate));
  }

  _faceYaw(yaw, dt, rate) {
    // Face a world yaw (atan2 x,z) while perched — level, no pitch from path
    this._tan.set(Math.sin(yaw), 0, Math.cos(yaw));
    this._orientAlong(this._tan, dt, rate);
  }

  _end() {
    this.bird.visible = false;
    this.bird.userData.setLegs(0);
    this.bird.userData.look(0, 0);
    this.bird.userData.flap(0, 0);
    this.bird.scale.setScalar(1.15);
    this.job = null;
  }
}
