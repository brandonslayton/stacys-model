/**
 * incident.js — the sick-patron scene.
 *
 * Beats, in order:
 *   1. The north side door swings open and a patron staggers out into the lot.
 *   2. They stop in the middle of the parking lot, hunch, and are sick. Bright green.
 *   3. They straighten up and walk off down the street.
 *   4. A barback comes out the same door with a mop and bucket.
 *   5. They mop; the puddle shrinks away and the spot sparkles.
 *   6. Stars flourish, everyone standing nearby throws hearts and rainbows, and the
 *      barback carries the bucket back inside.
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

/** An irregular splat, flat on the asphalt. */
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
  g.add(blob(0.42, 0.3, 0x86e01e, 0.021));
  g.add(blob(0.24, 0.42, 0xa8f03a, 0.023));
  // A couple of satellite spatters
  for (const [dx, dz, r] of [
    [0.5, 0.16, 0.1],
    [-0.42, -0.3, 0.08],
    [0.2, -0.5, 0.07],
  ]) {
    const s = blob(r, 0.35, 0x86e01e, 0.021);
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

  _buildSpray() {
    const COUNT = 90;
    const pos = new Float32Array(COUNT * 3);
    // Park inactive particles under the map so they never draw at the origin
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3 + 1] = -50;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0x9ff03a,
      size: 0.09,
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
      life: 0.95,
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
   * Spray direction: horizontal facing of the person + a mild downward bias.
   * Using pure torso-local +Z when hunched points almost into the ground
   * (looked like a shoe fountain).
   */
  _pukeDir(out = new THREE.Vector3()) {
    const yaw = this.patron.rotation.y;
    out.set(Math.sin(yaw), -0.28, Math.cos(yaw));
    out.normalize();
    return out;
  }

  _emitSpray(from, dir) {
    const s = this.spray;
    let launched = 0;
    for (let i = 0; i < s.count && launched < 18; i++) {
      if (s.age[i] < s.life) continue;
      const j = i * 3;
      s.geo.attributes.position.array[j] = from.x + (Math.random() - 0.5) * 0.04;
      s.geo.attributes.position.array[j + 1] = from.y + (Math.random() - 0.5) * 0.03;
      s.geo.attributes.position.array[j + 2] = from.z + (Math.random() - 0.5) * 0.04;
      // Strong forward burst out of the mouth, mild arc, then gravity
      const speed = 2.6 + Math.random() * 1.2;
      s.vel[j] = dir.x * speed + (Math.random() - 0.5) * 0.4;
      s.vel[j + 1] = 0.85 + Math.random() * 0.7; // initial loft so stream arcs
      s.vel[j + 2] = dir.z * speed + (Math.random() - 0.5) * 0.4;
      s.age[i] = 0;
      launched++;
    }
    s.points.visible = true;
  }

  _updateSpray(dt) {
    const s = this.spray;
    let any = false;
    const arr = s.geo.attributes.position.array;
    for (let i = 0; i < s.count; i++) {
      if (s.age[i] >= s.life) {
        // Hide spent particles
        if (arr[i * 3 + 1] > -10) arr[i * 3 + 1] = -50;
        continue;
      }
      any = true;
      s.age[i] += dt;
      const j = i * 3;
      s.vel[j + 1] -= 5.5 * dt;
      arr[j] += s.vel[j] * dt;
      arr[j + 1] += s.vel[j + 1] * dt;
      arr[j + 2] += s.vel[j + 2] * dt;
      if (arr[j + 1] < this.groundY + 0.025) {
        // Settle into the puddle area ahead of the feet, not under them
        arr[j + 1] = this.groundY + 0.025;
        s.vel[j] *= 0.25;
        s.vel[j + 2] *= 0.25;
        s.vel[j + 1] = 0;
        // Expire quickly once puddled so the shoe-pile doesn't build up
        if (s.age[i] < s.life - 0.15) s.age[i] = s.life - 0.12;
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
          // The stagger's target sways, so they stop up to ~0.5 off SPOT. Put the
          // puddle where they actually are or the spray lands beside it.
          this.spot = {
            x: this.patron.position.x,
            z: this.patron.position.z,
          };
          this.puddle.position.set(this.spot.x, this.groundY, this.spot.z);
          job.state = ST.HUNCH;
          job.wait = 0.7;
        }
        break;
      }
      case ST.HUNCH: {
        job.wait -= t;
        // Fold torso forward (hips planted)
        const k = 1 - Math.max(0, job.wait) / 0.7;
        this._setHunch(k * 0.95);
        this.patron.position.y = this.groundY;
        if (job.wait > 0) break;
        job.state = ST.PUKE;
        job.wait = 1.5;
        job.sprayed = 0;
        break;
      }
      case ST.PUKE: {
        job.wait -= t;
        // Heaving torso — mouth marker rides along
        this._setHunch(0.95 + Math.sin(job.t * 22) * 0.1);
        this.patron.position.y = this.groundY;
        // Three retches rather than one continuous stream
        const beat = Math.floor((1.5 - job.wait) / 0.42);
        if (beat > job.sprayed && beat <= 3) {
          job.sprayed = beat;
          this._emitSpray(this._mouthWorld(), this._pukeDir());
        }
        this.puddle.visible = true;
        // Puddle slightly in front of feet (where the stream lands)
        const yaw = this.patron.rotation.y;
        this.puddle.position.set(
          this.patron.position.x + Math.sin(yaw) * 0.55,
          this.groundY,
          this.patron.position.z + Math.cos(yaw) * 0.55
        );
        this.spot = {
          x: this.puddle.position.x,
          z: this.puddle.position.z,
        };
        this.puddle.scale.setScalar(
          Math.min(1, 0.15 + (1.5 - Math.max(0, job.wait)) / 1.1)
        );
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
        const arrived = this._walk(
          this.barback,
          this.spot.x + 0.75,
          SPOT.z + 0.5,
          BARBACK_WALK,
          t,
          9
        );
        this._carry();
        if (!arrived) break;
        this.doorTarget = 0;
        // Bucket goes down beside them; the mop stays in hand
        this.bucket.position.set(
          this.barback.position.x + 0.42,
          this.groundY,
          this.barback.position.z + 0.22
        );
        job.state = ST.MOP;
        job.wait = 3.0;
        job.sparkleAt = 0;
        break;
      }
      case ST.MOP: {
        job.wait -= t;
        const k = 1 - Math.max(0, job.wait) / 3.0;
        // Mop sweeps across the puddle
        const sweep = Math.sin(job.t * 5.5);
        // Face the mess first, then point the mop the same way — the reverse order
        // left the mop a frame behind the body it belongs to.
        this.barback.rotation.y =
          Math.atan2(
            this.spot.x - this.barback.position.x,
            this.spot.z - this.barback.position.z
          ) + sweep * 0.18;
        this.mop.position.set(
          this.spot.x + sweep * 0.42,
          this.groundY,
          this.spot.z + Math.cos(job.t * 2.7) * 0.2
        );
        this.mop.rotation.set(0, this.barback.rotation.y, 0.4 + sweep * 0.22);

        // Puddle shrinks and dulls as it goes
        this.puddle.scale.setScalar(Math.max(0.001, 1 - k));
        this.puddle.traverse((o) => {
          if (o.material) o.material.emissiveIntensity = 0.22 * (1 - k);
        });

        // Sparkles trail the mop head
        if (job.t > job.sparkleAt) {
          job.sparkleAt = job.t + 0.22;
          this.stars.play(this.mop.position.x, this.groundY + 0.16, this.mop.position.z, 0.3);
        }
        if (job.wait > 0) break;
        this.puddle.visible = false;
        job.state = ST.SPARKLE;
        job.wait = 1.0;
        job.burst = false;
        break;
      }
      case ST.SPARKLE: {
        job.wait -= t;
        if (!job.burst) {
          job.burst = true;
          for (let i = 0; i < 7; i++) {
            this.stars.play(this.spot.x, this.groundY + 0.2 + Math.random() * 0.5, this.spot.z, 0.55);
          }
          this._cheerBystanders();
        }
        this._carryMopOnly();
        if (job.wait > 0) break;
        this.doorTarget = this.door.openAngle;
        job.state = ST.BARBACK_BACK;
        break;
      }
      case ST.BARBACK_BACK: {
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
