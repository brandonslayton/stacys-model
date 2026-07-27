/**
 * incident.js — the sick-patron scene.
 *
 * Beats, in order:
 *   1. The north side door swings open and a patron staggers out into the lot.
 *   2. They stop, hunch, and pour bright green — a short downward stream that hits
 *      the middle of a growing stain, with a ground splash (not a flying spray).
 *   3. They straighten up and walk off down the street.
 *   4. A barback comes out the same door with a mop and bucket.
 *   5. They mop the stain out (no celebration yet).
 *   6. Once clean: stars + bystander hearts/rainbows; barback heads back inside.
 *
 * Separate from chores.js because that class models a *single* actor doing one errand
 * with one state machine. This has two actors with an object persisting between them
 * (the puddle), reactions on third-party agents borrowed from life.js, and a prop that
 * belongs to the building (the door). Folding it into ChoreSystem would have meant
 * gutting that class rather than extending it.
 */
import * as THREE from "three";
import { box, cyl } from "./kit.js";
import { heartTexture, starTexture, rainbowTexture, SpriteBurst } from "./sprites.js";
import { STREET } from "./street.js";

const WALK = 1.5; // unsteady
const BARBACK_WALK = 2.6;

/**
 * Where it happens: building-side strip of the north aisle, past the last stall.
 *
 * Stalls sit at x≈-6.4 (noses end ~x -5.1) along z≈-2.5..2.8. The drive centreline
 * is x≈-4.16. An earlier pick at (-5.6, 3.5) sat on the aisle-facing ends of parked
 * cars, so the scene was constantly blocked. Here:
 *   - x ≈ -3.75  building face of the aisle (clear of stall noses; cars use centre)
 *   - z ≈ 4.2    south of the last bay, on the open front apron toward the street
 * LifeSystem.lotHold also freezes in/out traffic for the whole sick→mop beat so
 * nothing drives through him while the mess is down.
 */
const SPOT = { x: -3.75, z: 4.2 };

/** Sidewalk centreline; straight along the frontage, so a constant is fine here. */
const SIDEWALK_Z = STREET.sidewalkZ;

const ST = {
  DOOR_OPEN: "door_open",
  STAGGER: "stagger",
  HUNCH: "hunch",
  PUKE: "puke",
  RECOVER: "recover",
  LEAVE: "leave",
  CALL_BARBACK: "call_barback",
  BARBACK_OUT: "barback_out",
  MOP: "mop",
  SPARKLE: "sparkle",
  BARBACK_BACK: "barback_back",
};

/**
 * An irregular splat centered at origin — the pour aims at the middle of this.
 * One main pool + a few tight satellites so it reads as a mess, not confetti.
 */
function puddleMesh() {
  const g = new THREE.Group();
  const blob = (r, jitter, colour, y) => {
    const N = 18;
    const pts = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const rr = r * (1 - jitter + Math.random() * jitter * 2);
      pts.push(new THREE.Vector2(Math.cos(a) * rr, Math.sin(a) * rr));
    }
    const shape = new THREE.Shape(pts);
    const m = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      new THREE.MeshStandardMaterial({
        color: colour,
        roughness: 0.18, // wet
        metalness: 0.1,
        emissive: colour,
        emissiveIntensity: 0.22,
        side: THREE.DoubleSide,
      })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.y = y;
    return m;
  };
  // Main stain — stream lands in the centre of this
  g.add(blob(0.38, 0.22, 0x86e01e, 0.021));
  g.add(blob(0.2, 0.28, 0xa8f03a, 0.023));
  // Tight satellites only — still part of the same mess, not far-flung
  for (const [dx, dz, r] of [
    [0.22, 0.1, 0.08],
    [-0.18, -0.14, 0.07],
    [0.08, -0.2, 0.055],
  ]) {
    const s = blob(r, 0.28, 0x86e01e, 0.021);
    s.position.set(dx, 0.021, dz);
    g.add(s);
  }
  return g;
}

export class IncidentSystem {
  /**
   * @param {THREE.Object3D} parent
   * @param {THREE.Group} venue result of createStacys()
   * @param {import('./life.js').LifeSystem} life for borrowing bystanders to react
   */
  constructor(parent, venue, life) {
    this.root = new THREE.Group();
    this.root.name = "incident";
    parent.add(this.root);

    this.life = life;
    this.door = venue.userData.northDoor || null;
    /**
     * Surface of the asphalt. The puddle and the settled spray are flat decals, so
     * they have to sit just above it; at y 0.02 they were under 0.09 of pavement and
     * simply did not render, which looked like the whole beat was missing.
     */
    this.groundY = (venue.userData.pad?.topY ?? 0.09) + 0.004;
    this.doorPivot = venue.getObjectByName("northDoorPivot");
    this.enabled = !!(this.door && this.doorPivot);
    if (!this.enabled) return;

    this.patron = this._buildPerson(0xc57fd0, 0x2a2030);
    this.patron.visible = false;
    this.root.add(this.patron);

    this.barback = this._buildPerson(0x2f4a52, 0x1d2f34);
    this.barback.visible = false;
    this.root.add(this.barback);

    this.bucket = this._buildBucket();
    this.bucket.visible = false;
    this.root.add(this.bucket);

    this.mop = this._buildMop();
    this.mop.visible = false;
    this.root.add(this.mop);

    this.puddle = puddleMesh();
    this.puddle.visible = false;
    this.root.add(this.puddle);
    this.puddle.position.set(SPOT.x, this.groundY, SPOT.z);

    // Green spray, as Points so the burst is a single draw call
    this.spray = this._buildSpray();
    this.root.add(this.spray.points);

    this.stars = new SpriteBurst(this.root, starTexture(), {
      count: 10,
      size: 0.42,
      rise: 0.7,
      life: 1.3,
    });
    this.hearts = new SpriteBurst(this.root, heartTexture(), {
      count: 6,
      size: 0.5,
      rise: 1.1,
      life: 2.0,
    });
    this.rainbows = new SpriteBurst(this.root, rainbowTexture(), {
      count: 5,
      size: 0.68,
      rise: 0.9,
      life: 2.2,
    });

    this.job = null;
    this.doorAngle = 0;
    this.doorTarget = 0;
    /** Where it actually happened; STAGGER overwrites this with the real stop. */
    this.spot = { ...SPOT };
  }

  get busy() {
    return this.job !== null;
  }

  _buildPerson(shirt, trouser) {
    const g = new THREE.Group();
    // Legs stay planted — only the torso folds for the heave, so the mouth
    // actually moves toward the ground in front of them instead of the whole
    // figure rotating around the shoes.
    const legs = box(0.22, 0.3, 0.18, trouser);
    legs.position.y = 0.16;
    g.add(legs);

    const torso = new THREE.Group();
    torso.name = "torso";
    torso.position.y = 0.32; // hip pivot
    g.add(torso);

    const body = cyl(0.13, 0.16, 0.56, shirt, {}, 5);
    body.position.y = 0.28; // mid-torso relative to hips
    torso.add(body);

    const head = cyl(0.12, 0.12, 0.22, 0xe8c4a8, {}, 5);
    head.position.y = 0.68;
    head.name = "head";
    torso.add(head);

    // Mouth marker on the face (local to torso: front of head, slightly low)
    const mouth = new THREE.Object3D();
    mouth.name = "mouth";
    mouth.position.set(0, 0.62, 0.16);
    torso.add(mouth);

    g.userData.torso = torso;
    g.userData.mouth = mouth;
    return g;
  }

  _buildBucket() {
    const g = new THREE.Group();
    const pail = cyl(0.17, 0.13, 0.28, 0xd8d8dc, { metalness: 0.2, roughness: 0.5 }, 10);
    pail.position.y = 0.14;
    g.add(pail);
    const water = cyl(0.15, 0.15, 0.02, 0x6fb0d8, {
      roughness: 0.15,
      emissive: 0x2a5a78,
      emissiveIntensity: 0.15,
    }, 10);
    water.position.y = 0.24;
    g.add(water);
    const wheel = cyl(0.04, 0.04, 0.03, 0x2a2a30, {}, 6);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(0.13, 0.03, 0);
    g.add(wheel);
    return g;
  }

  _buildMop() {
    const g = new THREE.Group();
    const handle = cyl(0.022, 0.022, 1.15, 0xc8a878, { roughness: 0.7 }, 6);
    handle.position.y = 0.6;
    g.add(handle);
    const head = box(0.3, 0.09, 0.16, 0xe8e2d0, { roughness: 0.95 });
    head.position.y = 0.05;
    g.add(head);
    return g;
  }

  /**
   * Green pour + splash as one Points draw call.
   * kind: 0 = stream (mouth → puddle), 1 = splash (radial on impact).
   */
  _buildSpray() {
    const COUNT = 140;
    const pos = new Float32Array(COUNT * 3);
    // Park inactive particles under the map so they never draw at the origin
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3 + 1] = -50;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0x9ff03a,
      size: 0.085,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    points.visible = false;
    return {
      points,
      geo,
      mat,
      count: COUNT,
      vel: new Float32Array(COUNT * 3),
      age: new Float32Array(COUNT).fill(Infinity),
      life: new Float32Array(COUNT).fill(0.9),
      kind: new Uint8Array(COUNT), // 0 stream, 1 splash
    };
  }

  /** Start the scene. Returns false if it is already running. */
  start() {
    if (!this.enabled || this.job) return false;
    const d = this.door;
    this.patron.position.set(d.x - 0.15, this.groundY, d.z);
    this.patron.rotation.y = -Math.PI / 2; // facing out into the lot
    this.patron.visible = true;
    this.puddle.visible = false;
    this.puddle.scale.setScalar(0.01);
    this.puddle.traverse((o) => {
      if (o.material) o.material.emissiveIntensity = 0.22;
    });
    this.spot = { ...SPOT };
    this.doorTarget = d.openAngle;
    // Hold lot traffic until the mop is done and the spot is clean
    if (this.life?.setLotHold) this.life.setLotHold(true);
    this.job = { state: ST.DOOR_OPEN, wait: 0.55, t: 0, sprayed: 0 };
    return true;
  }

  /** End the scene and re-open the lot to cars. */
  _finish() {
    this.job = null;
    if (this.life?.setLotHold) this.life.setLotHold(false);
  }

  _walk(obj, tx, tz, speed, dt, bob = 9) {
    const dx = tx - obj.position.x;
    const dz = tz - obj.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.12) {
      obj.position.y = this.groundY;
      return true;
    }
    const step = Math.min(d, speed * dt);
    obj.position.x += (dx / d) * step;
    obj.position.z += (dz / d) * step;
    obj.rotation.y = Math.atan2(dx, dz);
    this._bob += dt * bob;
    obj.position.y = this.groundY + Math.abs(Math.sin(this._bob)) * 0.04;
    return false;
  }

  /**
   * World-space mouth from the torso's mouth marker (folds with the heave).
   */
  _mouthWorld(out = new THREE.Vector3()) {
    this.patron.updateWorldMatrix(true, true);
    const mouth = this.patron.userData.mouth || this.patron.getObjectByName("mouth");
    if (mouth) {
      mouth.getWorldPosition(out);
    } else {
      out.set(
        this.patron.position.x,
        this.patron.position.y + 0.9,
        this.patron.position.z
      );
    }
    return out;
  }

  /**
   * Lock the stain a short step in front of the patron's feet — the pour aims
   * at this point so every drop hits the middle of the mess that grows there.
   */
  _lockPuddleSpot() {
    const yaw = this.patron.rotation.y;
    // Close enough that a vertical pour from a hunched head lands in the centre
    const reach = 0.42;
    this.spot = {
      x: this.patron.position.x + Math.sin(yaw) * reach,
      z: this.patron.position.z + Math.cos(yaw) * reach,
    };
    this.puddle.position.set(this.spot.x, this.groundY, this.spot.z);
    this.puddle.scale.setScalar(0.08);
    this.puddle.visible = true;
  }

  /** Spawn a few free particles from the pool. Returns how many launched. */
  _spawnParticles(n, setup) {
    const s = this.spray;
    let launched = 0;
    for (let i = 0; i < s.count && launched < n; i++) {
      if (s.age[i] < s.life[i]) continue;
      setup(i, i * 3);
      launched++;
    }
    if (launched) s.points.visible = true;
    return launched;
  }

  /**
   * Continuous green pour: almost straight down from the mouth, with a gentle
   * steer so the column lands on the puddle centre (like water from a faucet,
   * not a projectile spit).
   */
  _emitPour(from) {
    const tx = this.spot.x;
    const tz = this.spot.z;
    const dx = tx - from.x;
    const dz = tz - from.z;
    // Time-of-flight so gravity drops them near the stain centre
    const drop = Math.max(0.12, from.y - (this.groundY + 0.03));
    const fallT = Math.sqrt((2 * drop) / 14); // g≈14 in particle sim

    this._spawnParticles(14, (i, j) => {
      const arr = this.spray.geo.attributes.position.array;
      // Tight column at the mouth
      arr[j] = from.x + (Math.random() - 0.5) * 0.05;
      arr[j + 1] = from.y - 0.02 + (Math.random() - 0.5) * 0.04;
      arr[j + 2] = from.z + (Math.random() - 0.5) * 0.05;
      // Mostly downward; horizontal vel aims the column at the stain centre
      this.spray.vel[j] = dx / Math.max(0.08, fallT) * 0.85 + (Math.random() - 0.5) * 0.12;
      this.spray.vel[j + 1] = -1.2 - Math.random() * 0.9; // pour, not loft
      this.spray.vel[j + 2] = dz / Math.max(0.08, fallT) * 0.85 + (Math.random() - 0.5) * 0.12;
      this.spray.age[i] = 0;
      this.spray.life[i] = 0.55 + Math.random() * 0.25;
      this.spray.kind[i] = 0;
    });
  }

  /** Radial splash where the stream hits the middle of the stain. */
  _emitSplash(x, z) {
    this._spawnParticles(10, (i, j) => {
      const arr = this.spray.geo.attributes.position.array;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.06;
      arr[j] = x + Math.cos(a) * r;
      arr[j + 1] = this.groundY + 0.03;
      arr[j + 2] = z + Math.sin(a) * r;
      const speed = 0.55 + Math.random() * 0.85;
      this.spray.vel[j] = Math.cos(a) * speed;
      this.spray.vel[j + 1] = 0.9 + Math.random() * 1.1; // little bounce
      this.spray.vel[j + 2] = Math.sin(a) * speed;
      this.spray.age[i] = 0;
      this.spray.life[i] = 0.35 + Math.random() * 0.2;
      this.spray.kind[i] = 1;
    });
  }

  _updateSpray(dt) {
    const s = this.spray;
    let any = false;
    const arr = s.geo.attributes.position.array;
    const gy = this.groundY + 0.022;
    for (let i = 0; i < s.count; i++) {
      if (s.age[i] >= s.life[i]) {
        if (arr[i * 3 + 1] > -10) arr[i * 3 + 1] = -50;
        continue;
      }
      any = true;
      s.age[i] += dt;
      const j = i * 3;
      // Stream falls hard; splash drifts lighter
      s.vel[j + 1] -= (s.kind[i] === 1 ? 9.5 : 14) * dt;
      arr[j] += s.vel[j] * dt;
      arr[j + 1] += s.vel[j + 1] * dt;
      arr[j + 2] += s.vel[j + 2] * dt;

      if (arr[j + 1] <= gy) {
        arr[j + 1] = gy;
        if (s.kind[i] === 0) {
          // Stream hits — pull toward stain centre, splash, leave a wet bead
          const toCx = this.spot.x - arr[j];
          const toCz = this.spot.z - arr[j + 2];
          const dist = Math.hypot(toCx, toCz);
          if (dist > 0.06) {
            arr[j] += toCx * 0.45;
            arr[j + 2] += toCz * 0.45;
          }
          // Rate-limit splash so the pool doesn't explode every frame
          if (Math.random() < 0.4) this._emitSplash(arr[j], arr[j + 2]);
          s.vel[j] = (Math.random() - 0.5) * 0.12;
          s.vel[j + 1] = 0;
          s.vel[j + 2] = (Math.random() - 0.5) * 0.12;
          s.kind[i] = 1; // settled droplet on the stain
          s.life[i] = s.age[i] + 0.5;
        } else {
          // Splash droplet settles and fades on the stain
          s.vel[j] *= 0.3;
          s.vel[j + 2] *= 0.3;
          s.vel[j + 1] = 0;
          if (s.age[i] < s.life[i] - 0.18) s.life[i] = s.age[i] + 0.2;
        }
      }
    }
    s.geo.attributes.position.needsUpdate = true;
    s.points.visible = any;
  }

  _setHunch(amount) {
    // amount 0..~0.85 — fold torso only
    const torso = this.patron.userData.torso;
    if (torso) torso.rotation.x = amount;
    else this.patron.rotation.x = amount;
  }

  /** Hearts and rainbows over whoever happens to be standing about. */
  _cheerBystanders() {
    const seen = [];
    for (const w of this.life?.walkers || []) {
      const m = w.ped?.mesh;
      if (m?.visible) seen.push(m.position);
    }
    for (const t of this.life?.carTrips || []) {
      const m = t.ped?.mesh;
      if (m?.visible) seen.push(m.position);
    }
    // Always cheer at the cleaned spot too, so the beat lands on an empty street
    seen.push(new THREE.Vector3(this.spot.x, 0, this.spot.z));
    seen.slice(0, 5).forEach((p, i) => {
      this.hearts.play(p.x, 1.25, p.z, 0.22);
      if (i % 2 === 0) this.rainbows.play(p.x, 1.55, p.z, 0.3);
    });
  }

  update(dt) {
    if (!this.enabled) return;
    const t = Math.min(dt, 0.05);
    this._bob = this._bob || 0;

    // Door eases toward its target angle whatever else is happening
    const da = this.doorTarget - this.doorAngle;
    if (Math.abs(da) > 0.001) {
      this.doorAngle += da * (1 - Math.exp(-t * 6));
      this.doorPivot.rotation.y = this.doorAngle;
    }

    this._updateSpray(t);
    this.stars.update(t);
    this.hearts.update(t);
    this.rainbows.update(t);

    const job = this.job;
    if (!job) return;
    job.t += t;

    switch (job.state) {
      case ST.DOOR_OPEN: {
        job.wait -= t;
        if (job.wait > 0) break;
        job.state = ST.STAGGER;
        break;
      }
      case ST.STAGGER: {
        // Weave on the way out, so they read as unwell before anything happens
        const sway = Math.sin(job.t * 4.5) * 0.5;
        if (this._walk(this.patron, SPOT.x, SPOT.z + sway, WALK, t, 6)) {
          this.doorTarget = 0; // door shuts behind them
          // Plant feet; lock the stain centre in front of them before the pour
          this.patron.position.y = this.groundY;
          this._lockPuddleSpot();
          job.state = ST.HUNCH;
          job.wait = 0.7;
        }
        break;
      }
      case ST.HUNCH: {
        job.wait -= t;
        // Fold torso forward (hips planted) — mouth drops toward the stain
        const k = 1 - Math.max(0, job.wait) / 0.7;
        this._setHunch(k * 1.05);
        this.patron.position.y = this.groundY;
        if (job.wait > 0) break;
        job.state = ST.PUKE;
        job.wait = 1.65;
        job.pourAcc = 0;
        job.heave = 0;
        break;
      }
      case ST.PUKE: {
        job.wait -= t;
        // Three heaves: deep fold on each pulse, pour while the gut clenches
        const elapsed = 1.65 - Math.max(0, job.wait);
        const heavePhase = (elapsed % 0.5) / 0.5; // 0..1 within each retch
        const heaveFold = heavePhase < 0.45
          ? heavePhase / 0.45
          : 1 - (heavePhase - 0.45) / 0.55;
        this._setHunch(0.95 + heaveFold * 0.22);
        this.patron.position.y = this.groundY;

        // Pour mostly during the clench of each heave (not a continuous firehose)
        const pouring = heavePhase > 0.12 && heavePhase < 0.72;
        if (pouring) {
          job.pourAcc += t;
          // Dense green column — several packets per second while pouring
          if (job.pourAcc >= 0.045) {
            job.pourAcc = 0;
            this._emitPour(this._mouthWorld());
          }
        } else {
          job.pourAcc = 0.04; // ready to fire next heave
        }

        // Stain grows under the hit point as the mess accumulates
        this.puddle.visible = true;
        this.puddle.position.set(this.spot.x, this.groundY, this.spot.z);
        const grow = Math.min(1, 0.12 + elapsed / 1.35);
        this.puddle.scale.setScalar(grow);

        if (job.wait > 0) break;
        job.state = ST.RECOVER;
        job.wait = 0.9;
        break;
      }
      case ST.RECOVER: {
        job.wait -= t;
        const k = Math.max(0, job.wait) / 0.9;
        this._setHunch(k * 0.95);
        this.patron.position.y = this.groundY;
        if (job.wait > 0) break;
        this._setHunch(0);
        this.patron.position.y = this.groundY;
        job.state = ST.LEAVE;
        break;
      }
      case ST.LEAVE: {
        // Out to the sidewalk, then north along it and off frame. Walking straight to
        // a far +Z put them in the middle of the road.
        if (!job.onWalk) {
          job.onWalk = this._walk(
            this.patron,
            this.spot.x + 1.2,
            SIDEWALK_Z,
            WALK * 1.1,
            t,
            7
          );
          break;
        }
        if (this._walk(this.patron, -13, SIDEWALK_Z, WALK * 1.15, t, 7)) {
          this.patron.visible = false;
          this.doorTarget = this.door.openAngle;
          job.state = ST.CALL_BARBACK;
          job.wait = 0.5;
        }
        break;
      }
      case ST.CALL_BARBACK: {
        job.wait -= t;
        if (job.wait > 0) break;
        const d = this.door;
        this.barback.position.set(d.x - 0.15, this.groundY, d.z);
        this.barback.rotation.y = -Math.PI / 2;
        this.barback.visible = true;
        this.bucket.visible = true;
        this.mop.visible = true;
        job.state = ST.BARBACK_OUT;
        break;
      }
      case ST.BARBACK_OUT: {
        // Approach from a stand-off so they face the mess to mop, not stand in it
        const arrived = this._walk(
          this.barback,
          this.spot.x + 0.85,
          this.spot.z + 0.55,
          BARBACK_WALK,
          t,
          9
        );
        this._carry();
        if (!arrived) break;
        this.doorTarget = 0;
        // Face the stain, plant the bucket at their side
        this.barback.rotation.y = Math.atan2(
          this.spot.x - this.barback.position.x,
          this.spot.z - this.barback.position.z
        );
        const yaw = this.barback.rotation.y;
        this.bucket.position.set(
          this.barback.position.x + Math.cos(yaw) * 0.38,
          this.groundY,
          this.barback.position.z - Math.sin(yaw) * 0.38
        );
        job.state = ST.MOP;
        job.wait = 3.6;
        job.mopPhase = 0; // 0 scrub, 1 dunk, 2 scrub, 3 final wipe
        job.phaseT = 0;
        break;
      }
      case ST.MOP: {
        // Phased cleanup — no stars until the stain is fully gone
        job.wait -= t;
        job.phaseT += t;
        const total = 3.6;
        const done = 1 - Math.max(0, job.wait) / total;

        // Cycle: scrub → dunk in bucket → scrub → finish wipe
        const cycle = job.phaseT % 1.15;
        const dunking = cycle > 0.72 && cycle < 0.95;
        const faceYaw = Math.atan2(
          this.spot.x - this.barback.position.x,
          this.spot.z - this.barback.position.z
        );

        if (dunking) {
          // Pull mop back to the bucket for a wet dunk
          const bx = this.bucket.position.x;
          const bz = this.bucket.position.z;
          this.barback.rotation.y = Math.atan2(
            bx - this.barback.position.x,
            bz - this.barback.position.z
          );
          this.mop.position.set(bx, this.groundY + 0.12, bz);
          this.mop.rotation.set(0.55, this.barback.rotation.y, 0.15);
          // Tiny dip
          this.bucket.position.y = this.groundY + Math.sin((cycle - 0.72) / 0.23 * Math.PI) * 0.04;
        } else {
          this.bucket.position.y = this.groundY;
          // Two-axis scrub across the stain — figure-8-ish stroke
          const sweep = Math.sin(job.phaseT * 6.2);
          const push = Math.cos(job.phaseT * 3.8);
          this.barback.rotation.y = faceYaw + sweep * 0.22;
          // Lean into the work
          const torso = this.barback.userData.torso;
          if (torso) torso.rotation.x = 0.35 + Math.abs(sweep) * 0.12;

          this.mop.position.set(
            this.spot.x + sweep * 0.38,
            this.groundY + 0.02,
            this.spot.z + push * 0.22
          );
          this.mop.rotation.set(
            0.15,
            faceYaw + sweep * 0.35,
            0.55 + sweep * 0.28
          );
          // Small step-in as they work (don't stand glued to one pixel)
          const stepIn = 0.04 * Math.sin(job.phaseT * 2.4);
          this.barback.position.x =
            this.spot.x + 0.85 + Math.cos(faceYaw) * stepIn;
          this.barback.position.z =
            this.spot.z + 0.55 - Math.sin(faceYaw) * stepIn;
          this.barback.position.y = this.groundY;
        }

        // Stain shrinks and dulls — fully gone only at the end
        this.puddle.scale.setScalar(Math.max(0.001, 1 - done * done));
        this.puddle.traverse((o) => {
          if (o.material) o.material.emissiveIntensity = 0.22 * (1 - done);
        });

        if (job.wait > 0) break;
        // Clean: straighten up, hide the mess, THEN celebrate
        const torso = this.barback.userData.torso;
        if (torso) torso.rotation.x = 0;
        this.puddle.visible = false;
        this.bucket.position.y = this.groundY;
        job.state = ST.SPARKLE;
        job.wait = 1.15;
        job.burst = false;
        break;
      }
      case ST.SPARKLE: {
        job.wait -= t;
        // Stars only after the floor is clean — not during the mop
        if (!job.burst) {
          job.burst = true;
          for (let i = 0; i < 8; i++) {
            this.stars.play(
              this.spot.x,
              this.groundY + 0.15 + Math.random() * 0.55,
              this.spot.z,
              0.5
            );
          }
          this._cheerBystanders();
        }
        // Stand proud over the clean spot with mop planted
        this.barback.rotation.y = Math.atan2(
          this.spot.x - this.barback.position.x,
          this.spot.z - this.barback.position.z
        );
        this._carryMopOnly();
        if (job.wait > 0) break;
        this.doorTarget = this.door.openAngle;
        job.state = ST.BARBACK_BACK;
        break;
      }
      case ST.BARBACK_BACK: {
        const torso = this.barback.userData.torso;
        if (torso) torso.rotation.x = 0;
        const home = this._walk(
          this.barback,
          this.door.outsideX,
          this.door.outsideZ,
          BARBACK_WALK,
          t,
          9
        );
        this._carry();
        if (!home) break;
        this.barback.visible = false;
        this.bucket.visible = false;
        this.mop.visible = false;
        this.doorTarget = 0;
        this._finish();
        break;
      }
      default:
        this._finish();
    }
  }

  /** Bucket in one hand, mop in the other, both tracking the walk. */
  _carry() {
    const yaw = this.barback.rotation.y;
    this.bucket.position.set(
      this.barback.position.x + Math.cos(yaw) * 0.3,
      this.groundY,
      this.barback.position.z - Math.sin(yaw) * 0.3
    );
    this._carryMopOnly();
  }

  _carryMopOnly() {
    const yaw = this.barback.rotation.y;
    this.mop.position.set(
      this.barback.position.x - Math.cos(yaw) * 0.26,
      this.groundY,
      this.barback.position.z + Math.sin(yaw) * 0.26
    );
    this.mop.rotation.set(0, yaw, 0.35);
  }
}
