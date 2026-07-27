/**
 * chores.js — small tap-to-trigger interactions around the venue.
 *
 * Separate from life.js on purpose. That system is ambient and autonomous: it runs
 * whether or not you are looking, and its agents are anonymous patrons. These are
 * *requested* one-shot performances with a named actor and a scripted beat, so they
 * want their own state and their own mesh. Built to take more chores later — add a
 * method that pushes onto `this.jobs` and give it a `tick`.
 *
 * Currently: take out the trash.
 */
import * as THREE from "three";
import { box, cyl } from "./kit.js";

/**
 * Worker walk speed. Noticeably brisker than a patron ambling in (1.85-2.4) —
 * the route out the front and up the aisle is ~14 units each way, and at a patron's
 * pace the round trip ran 13s, which is a long time to watch a chore.
 */
const WALK = 2.9;

/**
 * Route from the porch door to the dumpster.
 *
 * Goes the long way round, out the front and up the parking aisle, because the rear
 * patio door is the wrong exit: the patio is enclosed by purple CMU on three sides,
 * so a worker leaving that way would have to walk through a wall to reach the NE
 * corner. The aisle is clear of both the stalls (which end at z ≈ -2.5) and the
 * patio (which starts at x ≈ -3.2).
 */
function routeToDumpster(streetDoor, aisleX, dump) {
  return [
    new THREE.Vector3(streetDoor.x, 0, streetDoor.z),
    new THREE.Vector3(aisleX, 0, streetDoor.z + 0.5),
    new THREE.Vector3(aisleX, 0, -3.6),
    new THREE.Vector3(dump.approachX, 0, dump.approachZ),
  ];
}

/** A heart, drawn to a canvas for use as a sprite. */
function heartTexture() {
  const S = 128;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d");
  const w = S * 0.74;
  const h = S * 0.68;
  const x = S / 2;
  const y = S * 0.16;

  ctx.beginPath();
  ctx.moveTo(x, y + h * 0.3);
  ctx.bezierCurveTo(x, y, x - w / 2, y, x - w / 2, y + h * 0.3);
  ctx.bezierCurveTo(x - w / 2, y + h * 0.6, x, y + h * 0.8, x, y + h);
  ctx.bezierCurveTo(x, y + h * 0.8, x + w / 2, y + h * 0.6, x + w / 2, y + h * 0.3);
  ctx.bezierCurveTo(x + w / 2, y, x, y, x, y + h * 0.3);
  ctx.closePath();

  ctx.fillStyle = "#ff4f8b";
  ctx.fill();
  ctx.lineWidth = S * 0.045;
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const ST = {
  TO_DUMPSTER: "to_dumpster",
  TOSSING: "tossing",
  BACK: "back",
};

export class ChoreSystem {
  /**
   * @param {THREE.Object3D} parent
   * @param {THREE.Group} venue result of createStacys()
   * @param {{streetDoor: THREE.Vector3, aisleX: number}} anchors from LifeSystem
   */
  constructor(parent, venue, anchors) {
    this.root = new THREE.Group();
    this.root.name = "chores";
    parent.add(this.root);

    this.venue = venue;
    this.dump = venue.userData.dumpster || null;
    this.dumpsterMesh = venue.getObjectByName("dumpster");
    this.streetDoor = anchors.streetDoor;
    this.aisleX = anchors.aisleX;

    // Distinct from the patron palette in agents.js — this one reads as staff
    this.worker = this._buildWorker();
    this.worker.visible = false;
    this.root.add(this.worker);

    this.bag = this._buildBag();
    this.bag.visible = false;
    this.root.add(this.bag);

    this.heart = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: heartTexture(),
        transparent: true,
        depthWrite: false,
      })
    );
    this.heart.scale.setScalar(0.7);
    this.heart.visible = false;
    this.root.add(this.heart);

    this.job = null;
    /** Seconds of dumpster wiggle remaining. */
    this.happy = 0;
    this.heartT = 0;
    this.bob = 0;
  }

  get busy() {
    return this.job !== null;
  }

  _buildWorker() {
    const g = new THREE.Group();
    const body = cyl(0.13, 0.16, 0.56, 0x2f4a52, {}, 5);
    body.position.y = 0.55;
    g.add(body);
    const apron = box(0.26, 0.24, 0.2, 0x1d2f34);
    apron.position.set(0, 0.46, 0.06);
    g.add(apron);
    const head = cyl(0.12, 0.12, 0.22, 0xe8c4a8, {}, 5);
    head.position.y = 0.95;
    g.add(head);
    return g;
  }

  _buildBag() {
    const g = new THREE.Group();
    const sack = box(0.3, 0.32, 0.28, 0x24242c, { roughness: 0.95 });
    sack.position.y = 0.16;
    g.add(sack);
    const tie = box(0.1, 0.1, 0.09, 0x33333d);
    tie.position.y = 0.36;
    g.add(tie);
    return g;
  }

  /** Start the chore. Returns false if it can't right now. */
  takeOutTrash() {
    if (this.job || !this.dump) return false;
    const path = routeToDumpster(this.streetDoor, this.aisleX, this.dump);
    this.worker.position.copy(path[0]);
    this.worker.visible = true;
    this.bag.visible = true;
    this.job = { state: ST.TO_DUMPSTER, path, i: 1, wait: 0 };
    return true;
  }

  /** Bag rides at hip height on the worker's right, swaying with the walk. */
  _carryBag() {
    const yaw = this.worker.rotation.y;
    this.bag.position.set(
      this.worker.position.x + Math.cos(yaw) * 0.28,
      0.3 + Math.sin(this.bob * 2) * 0.02,
      this.worker.position.z - Math.sin(yaw) * 0.28
    );
    this.bag.rotation.y = yaw;
  }

  _advance(path, i, dt) {
    if (i >= path.length) return { done: true, i };
    const target = path[i];
    const p = this.worker.position;
    const dx = target.x - p.x;
    const dz = target.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.14) return i + 1 >= path.length ? { done: true, i: i + 1 } : { done: false, i: i + 1 };
    const step = Math.min(d, WALK * dt);
    p.x += (dx / d) * step;
    p.z += (dz / d) * step;
    this.worker.rotation.y = Math.atan2(dx, dz);
    return { done: false, i };
  }

  update(dt) {
    const t = Math.min(dt, 0.05);

    // Heart drifts up and fades, independent of the worker's remaining walk
    if (this.heart.visible) {
      this.heartT += t;
      const k = this.heartT / 1.9;
      if (k >= 1) {
        this.heart.visible = false;
      } else {
        this.heart.position.y = this.dump.lidY + 0.55 + k * 1.0;
        // Quick pop on the way in, then ease out
        const pop = k < 0.18 ? 0.5 + (k / 0.18) * 0.35 : 0.85;
        this.heart.scale.setScalar(pop * 0.8);
        this.heart.material.opacity = k > 0.55 ? 1 - (k - 0.55) / 0.45 : 1;
      }
    }

    // A pleased little squash-and-hop
    if (this.happy > 0 && this.dumpsterMesh) {
      this.happy -= t;
      const w = Math.max(0, this.happy);
      const s = Math.sin(w * 15);
      this.dumpsterMesh.position.y = Math.abs(s) * 0.07 * w;
      this.dumpsterMesh.scale.set(1 + s * 0.03 * w, 1 - s * 0.04 * w, 1 + s * 0.03 * w);
      if (this.happy <= 0) {
        this.happy = 0;
        this.dumpsterMesh.position.y = 0;
        this.dumpsterMesh.scale.set(1, 1, 1);
      }
    }

    const job = this.job;
    if (!job) return;
    this.bob += t * 9;

    switch (job.state) {
      case ST.TO_DUMPSTER: {
        const r = this._advance(job.path, job.i, t);
        job.i = r.i;
        this.worker.position.y = Math.abs(Math.sin(this.bob)) * 0.04;
        this._carryBag();
        if (!r.done) break;
        this.worker.position.y = 0;
        // Face the dumpster before the toss
        this.worker.rotation.y = Math.atan2(
          this.dump.x - this.worker.position.x,
          this.dump.z - this.worker.position.z
        );
        job.state = ST.TOSSING;
        job.wait = 0.55;
        break;
      }
      case ST.TOSSING: {
        job.wait -= t;
        // Bag arcs from hip into the dumpster over the pause
        const k = 1 - Math.max(0, job.wait) / 0.55;
        this.bag.position.lerpVectors(
          new THREE.Vector3(
            this.worker.position.x + Math.cos(this.worker.rotation.y) * 0.28,
            0.3,
            this.worker.position.z - Math.sin(this.worker.rotation.y) * 0.28
          ),
          new THREE.Vector3(this.dump.x, this.dump.lidY + 0.1, this.dump.z),
          k
        );
        this.bag.position.y += Math.sin(k * Math.PI) * 0.5; // toss arc
        if (job.wait > 0) break;

        this.bag.visible = false;
        this.heart.visible = true;
        this.heartT = 0;
        this.heart.position.set(this.dump.x, this.dump.lidY + 0.55, this.dump.z);
        this.happy = 0.9;

        // Retrace the route home
        job.path = [...job.path].reverse();
        job.i = 1;
        this.worker.position.copy(job.path[0]);
        job.state = ST.BACK;
        break;
      }
      case ST.BACK: {
        const r = this._advance(job.path, job.i, t);
        job.i = r.i;
        this.worker.position.y = Math.abs(Math.sin(this.bob)) * 0.04;
        if (!r.done) break;
        this.worker.position.y = 0;
        this.worker.visible = false;
        this.job = null;
        break;
      }
      default:
        this.job = null;
    }
  }
}
