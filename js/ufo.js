/**
 * ufo.js — one-shot alien abduction on the sidewalk.
 *
 * Beats:
 *   1. Patron walks out past the property line.
 *   2. Saucer glides in and tracks above them while they keep walking.
 *   3. Thin laser stays on; they walk under it for about a second.
 *   4. They notice, stop, look up — beam blooms into a full column.
 *   5. Float, bounce, suck-up; beam dies; UFO warps out.
 */
import * as THREE from "three";
import { cyl } from "./kit.js";
import { PED_COLORS, createPedestrian } from "./agents.js";
import { STREET, sidewalkPoint, sidewalkPolyline } from "./street.js";

const WALK = 2.55;
const UFO_CRUISE = 9.5;
const UFO_ESCAPE = 48;

const ST = {
  /** Walk out; UFO may arrive mid-walk once past the property line. */
  WALK: "walk",
  /** Saucer glides in while the patron keeps walking. */
  UFO_IN: "ufo_in",
  /** Beam on, UFO tracks overhead, patron still walking (~1s). */
  FOLLOW: "follow",
  /** Patron notices the light and stops. */
  NOTICE: "notice",
  COLUMN: "column",
  FLOAT: "float",
  SUCK: "suck",
  FADE: "fade",
  UFO_OUT: "ufo_out",
};

/**
 * Sleek chrome saucer: thin multi-tier hull, glass cockpit, spinning light ring.
 * Body spins slowly; the rim ring spins fast so motion reads even while hovering.
 */
function createSaucer() {
  const g = new THREE.Group();
  g.name = "ufo";

  const body = new THREE.Group();
  body.name = "ufoBody";
  g.add(body);

  const chrome = {
    roughness: 0.28,
    metalness: 0.72,
    emissive: 0x1a2838,
    emissiveIntensity: 0.12,
  };
  const dark = {
    roughness: 0.4,
    metalness: 0.55,
    emissive: 0x0a1018,
    emissiveIntensity: 0.08,
  };

  // Thin main saucer disc — flatter / sleeker than a fat cylinder
  const hull = cyl(1.55, 1.72, 0.11, 0xd0d8e0, chrome, 32);
  hull.position.y = 0;
  body.add(hull);

  // Upper taper
  const upper = cyl(0.62, 1.42, 0.14, 0xb8c4d0, chrome, 28);
  upper.position.y = 0.11;
  body.add(upper);

  // Lower taper
  const lower = cyl(1.42, 0.7, 0.12, 0x8a96a4, dark, 28);
  lower.position.y = -0.1;
  body.add(lower);

  // Dark equatorial band (reads as a seam / panel line)
  const band = cyl(1.74, 1.74, 0.045, 0x1c2430, {
    roughness: 0.35,
    metalness: 0.65,
    emissive: 0x3ec8ff,
    emissiveIntensity: 0.22,
  }, 32);
  band.position.y = 0.01;
  body.add(band);

  // Cockpit dome — taller glass bubble
  const dome = cyl(0.38, 0.52, 0.42, 0x5ad4ff, {
    roughness: 0.08,
    metalness: 0.45,
    emissive: 0x2a90c8,
    emissiveIntensity: 0.55,
    transparent: true,
    opacity: 0.72,
  }, 20);
  dome.position.y = 0.42;
  body.add(dome);

  // Inner glow under glass
  const cockpitGlow = cyl(0.28, 0.34, 0.12, 0xa8f0ff, {
    roughness: 0.2,
    metalness: 0.2,
    emissive: 0x66e0ff,
    emissiveIntensity: 0.85,
  }, 14);
  cockpitGlow.position.y = 0.28;
  body.add(cockpitGlow);

  // Needle antenna
  const ant = cyl(0.025, 0.04, 0.28, 0xe8f4ff, {
    roughness: 0.3,
    metalness: 0.5,
    emissive: 0xaad4ff,
    emissiveIntensity: 0.4,
  }, 8);
  ant.position.y = 0.72;
  body.add(ant);
  const antTip = cyl(0.05, 0.02, 0.06, 0xff66cc, {
    roughness: 0.25,
    emissive: 0xff66cc,
    emissiveIntensity: 1.0,
  }, 8);
  antTip.position.y = 0.88;
  body.add(antTip);

  // Underside bay (beam emitter)
  const well = cyl(0.48, 0.28, 0.1, 0x121820, {
    roughness: 0.4,
    metalness: 0.4,
    emissive: 0x204868,
    emissiveIntensity: 0.5,
  }, 18);
  well.position.y = -0.2;
  body.add(well);

  const wellCore = cyl(0.18, 0.22, 0.06, 0x66eeff, {
    roughness: 0.2,
    emissive: 0x44ddff,
    emissiveIntensity: 1.1,
  }, 12);
  wellCore.position.y = -0.24;
  body.add(wellCore);

  // ── Spinning rim ring (the “it’s rotating” read) ───────────────────
  const spinner = new THREE.Group();
  spinner.name = "ufoSpinner";
  g.add(spinner);

  // Thin chrome lip that spins
  const lip = cyl(1.78, 1.82, 0.035, 0xe8eef4, {
    roughness: 0.22,
    metalness: 0.8,
    emissive: 0x6088a8,
    emissiveIntensity: 0.2,
  }, 36);
  lip.position.y = -0.02;
  spinner.add(lip);

  // Outer light ring — many small emitters so rotation is obvious
  const lights = [];
  const N = 18;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const hue = i / N;
    const col = new THREE.Color().setHSL(hue * 0.15 + 0.52, 0.9, 0.55); // cyan→blue band
    const hex = col.getHex();
    const bulb = cyl(0.055, 0.055, 0.04, hex, {
      roughness: 0.2,
      emissive: hex,
      emissiveIntensity: 1.0,
    }, 8);
    bulb.position.set(Math.cos(a) * 1.68, -0.05, Math.sin(a) * 1.68);
    spinner.add(bulb);
    lights.push(bulb);

    // Accent every 3rd: slightly larger magenta notch
    if (i % 3 === 0) {
      const notch = cyl(0.04, 0.04, 0.07, 0xff55aa, {
        roughness: 0.25,
        emissive: 0xff55aa,
        emissiveIntensity: 0.95,
      }, 6);
      notch.position.set(Math.cos(a) * 1.55, 0.06, Math.sin(a) * 1.55);
      spinner.add(notch);
    }
  }

  // Underside spinning vane marks (visible when looking up at hover)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const vane = boxishFin(0.55, 0.03, 0.12, 0x3ec8ff);
    vane.position.set(Math.cos(a) * 0.85, -0.16, Math.sin(a) * 0.85);
    vane.rotation.y = a;
    spinner.add(vane);
  }

  g.userData.body = body;
  g.userData.spinner = spinner;
  g.userData.rimLights = lights;
  g.userData.wellCore = wellCore;

  /** Continuous spin: body slow, rim fast + pulsing lights. */
  g.userData.tickSpin = (dt, t) => {
    body.rotation.y += dt * 0.85;
    spinner.rotation.y += dt * 3.6;
    for (let i = 0; i < lights.length; i++) {
      const pulse = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 8 + i * 0.55));
      lights[i].material.emissiveIntensity = pulse;
    }
    if (wellCore.material) {
      wellCore.material.emissiveIntensity =
        0.7 + 0.45 * (0.5 + 0.5 * Math.sin(t * 5.5));
    }
  };

  return g;
}

/** Small rectangular fin built from a box without importing box into every call site. */
function boxishFin(w, h, d, color) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.3,
      metalness: 0.4,
      emissive: color,
      emissiveIntensity: 0.45,
      flatShading: true,
    })
  );
}

/**
 * Vertical beam: thin core + soft outer sheath. Opacity/radius driven by job.
 */
function createBeam() {
  const g = new THREE.Group();
  g.name = "abductBeam";
  g.visible = false;

  const coreMat = new THREE.MeshBasicMaterial({
    color: 0xaef0ff,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 10), coreMat);
  core.position.y = 0.5;
  g.add(core);

  const sheathMat = new THREE.MeshBasicMaterial({
    color: 0x66ddff,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const sheath = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.12, 1, 16, 1, true),
    sheathMat
  );
  sheath.position.y = 0.5;
  g.add(sheath);

  // Soft ground disc where the beam hits
  const discMat = new THREE.MeshBasicMaterial({
    color: 0x88eeff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.15, 24), discMat);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.04;
  g.add(disc);

  g.userData.core = core;
  g.userData.sheath = sheath;
  g.userData.disc = disc;
  g.userData.coreMat = coreMat;
  g.userData.sheathMat = sheathMat;
  g.userData.discMat = discMat;

  /**
   * @param {number} height world height of beam
   * @param {number} thin 0..1 laser thinness (1 = hairline)
   * @param {number} fill 0..1 column fill (0 = laser only)
   * @param {number} opacity overall brightness
   */
  g.userData.setBeam = (height, thin, fill, opacity) => {
    const h = Math.max(0.2, height);
    core.scale.set(1, h, 1);
    core.position.y = h * 0.5;
    sheath.scale.set(1, h, 1);
    sheath.position.y = h * 0.5;

    const coreR = THREE.MathUtils.lerp(0.04, 0.02, thin) * THREE.MathUtils.lerp(1, 3.5, fill);
    const sheathR = THREE.MathUtils.lerp(0.08, 0.55, fill);
    core.scale.x = coreR / 0.03;
    core.scale.z = coreR / 0.03;
    sheath.scale.x = sheathR / 0.1;
    sheath.scale.z = sheathR / 0.1;

    coreMat.opacity = opacity * (0.55 + fill * 0.35);
    sheathMat.opacity = opacity * fill * 0.45;
    discMat.opacity = opacity * (0.2 + fill * 0.55);
    disc.scale.setScalar(0.6 + fill * 2.8 + thin * 0.2);

    // Gradient-ish: shift sheath toward magenta as fill grows
    const c = sheathMat.color;
    c.setRGB(
      THREE.MathUtils.lerp(0.4, 0.85, fill),
      THREE.MathUtils.lerp(0.85, 0.45, fill),
      1.0
    );
  };

  return g;
}

export class UfoSystem {
  /**
   * @param {THREE.Object3D} parent
   * @param {THREE.Group} venue
   * @param {{streetDoor: THREE.Vector3}} anchors
   */
  constructor(parent, venue, anchors) {
    this.root = new THREE.Group();
    this.root.name = "ufoScene";
    parent.add(this.root);

    this.streetDoor = anchors.streetDoor.clone();
    venue.updateWorldMatrix(true, true);
    const m = venue.matrixWorld;
    const pad = venue.userData.pad;
    // Property edges in world X (street runs along X)
    if (pad) {
      const corners = [
        new THREE.Vector3(pad.xMin, 0, pad.zMin),
        new THREE.Vector3(pad.xMax, 0, pad.zMax),
      ].map((p) => p.applyMatrix4(m));
      this.padXMin = Math.min(corners[0].x, corners[1].x);
      this.padXMax = Math.max(corners[0].x, corners[1].x);
    } else {
      this.padXMin = this.streetDoor.x - 6;
      this.padXMax = this.streetDoor.x + 6;
    }

    this.patron = null;
    this.ufo = createSaucer();
    this.ufo.visible = false;
    this.root.add(this.ufo);

    this.beam = createBeam();
    this.root.add(this.beam);

    this.job = null;
    this.bob = 0;
    this.clock = 0;
  }

  get busy() {
    return this.job !== null;
  }

  /**
   * @returns {boolean}
   */
  start() {
    if (this.job) return false;

    // Walk either north (−X) or south (+X). UFO joins after the property line;
    // the path continues further so they can keep walking under the beam.
    const goNorth = Math.random() < 0.5;
    const dir = goNorth ? -1 : 1;
    const pastLine =
      (goNorth ? this.padXMin : this.padXMax) + dir * (1.6 + Math.random() * 0.6);
    // Extra sidewalk after the line so FOLLOW has room (~2.5–3.5 units)
    const endX = pastLine + dir * (2.8 + Math.random() * 1.0);
    const clampedEnd = THREE.MathUtils.clamp(
      endX,
      STREET.xMin + 2,
      STREET.xMax - 2
    );
    const clampedPast = THREE.MathUtils.clamp(
      pastLine,
      STREET.xMin + 2,
      STREET.xMax - 2
    );
    this.spot = sidewalkPoint(clampedEnd); // fallback camera target
    this.dir = dir;

    if (this.patron) this.root.remove(this.patron);
    this.patron = createPedestrian(
      PED_COLORS[(Math.random() * PED_COLORS.length) | 0]
    );
    this.patron.visible = true;
    this.patron.position.copy(this.streetDoor);
    this.patron.position.y = 0;
    this.patron.scale.set(1, 1, 1);
    this.patron.rotation.set(0, 0, 0);
    this.root.add(this.patron);

    const path = this._clean([
      this.streetDoor.clone(),
      sidewalkPoint(this.streetDoor.x),
      ...sidewalkPolyline(this.streetDoor.x, clampedEnd),
      sidewalkPoint(clampedEnd),
    ]);

    this.ufo.visible = false;
    this.beam.visible = false;
    this.job = {
      state: ST.WALK,
      path,
      pathI: 0,
      wait: 0,
      t: 0,
      floatY: 0,
      bounceDone: false,
      pastLineX: clampedPast,
      dir,
      ufoFrom: null,
      ufoTo: null,
      ufoK: 0,
    };
    return true;
  }

  /** Camera target — follows the patron when possible. */
  get focusTarget() {
    const p = this.patron?.position || this.spot;
    if (!p) return null;
    return {
      az: 40 + Math.random() * 20,
      el: 24,
      zoom: 0.5,
      target: [p.x, 1.4, p.z + 0.3],
    };
  }

  _clean(pts) {
    const out = [];
    for (const p of pts) {
      if (!p) continue;
      const last = out[out.length - 1];
      if (!last || Math.hypot(p.x - last.x, p.z - last.z) >= 0.18) {
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

  _hoverY(t) {
    return 5.2 + Math.sin(t * 2.4) * 0.12;
  }

  /** Hover UFO directly above the patron (or a fixed x/z). */
  _placeUfoOver(x, z, t) {
    const y = this._hoverY(t);
    this.ufo.position.set(x, y, z);
    this.ufo.rotation.x = Math.sin(t * 1.7) * 0.04;
    this.ufo.rotation.z = Math.cos(t * 1.3) * 0.035;
  }

  _aimBeamAt(x, z, personY = 0) {
    const top = this.ufo.position.y - 0.2;
    const bot = personY + 0.02;
    const h = Math.max(0.3, top - bot);
    this.beam.position.set(x, bot, z);
    return h;
  }

  /** True once the patron has crossed the property line in their walk direction. */
  _pastPropertyLine(job) {
    const x = this.patron.position.x;
    if (job.dir < 0) return x <= job.pastLineX;
    return x >= job.pastLineX;
  }

  _bobWalk(dt) {
    this.bob += dt * 9;
    this.patron.position.y = Math.abs(Math.sin(this.bob)) * 0.04;
  }

  _spawnUfoApproach(job) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const px = this.patron.position.x;
    const pz = this.patron.position.z;
    job.ufoFrom = new THREE.Vector3(
      px + side * (12 + Math.random() * 5),
      8.5 + Math.random() * 2.5,
      pz + side * 3.5
    );
    job.ufoTo = new THREE.Vector3(px, this._hoverY(this.clock), pz);
    this.ufo.position.copy(job.ufoFrom);
    this.ufo.visible = true;
    this.ufo.scale.setScalar(1);
    job.ufoK = 0;
  }

  update(dt) {
    const t = Math.min(dt, 0.05);
    this.clock += t;
    if (this.ufo.visible) this.ufo.userData.tickSpin?.(t, this.clock);

    const job = this.job;
    if (!job) return;

    switch (job.state) {
      case ST.WALK: {
        const r = this._advance(this.patron, job.path, job.pathI, WALK, t);
        job.pathI = r.pathI;
        this._bobWalk(t);
        // Once past the property line, bring the saucer in — keep walking
        if (this._pastPropertyLine(job)) {
          this._spawnUfoApproach(job);
          job.state = ST.UFO_IN;
        } else if (r.done) {
          // Path ended before line (edge case) — still trigger
          this._spawnUfoApproach(job);
          job.state = ST.UFO_IN;
        }
        break;
      }

      case ST.UFO_IN: {
        // Patron keeps walking while the saucer eases in above them
        if (job.pathI < job.path.length) {
          const r = this._advance(this.patron, job.path, job.pathI, WALK, t);
          job.pathI = r.pathI;
          this._bobWalk(t);
        }
        job.ufoK = Math.min(1, job.ufoK + t * 0.7);
        const k = 1 - Math.pow(1 - job.ufoK, 2.2);
        // Target is live above the walking patron
        job.ufoTo.set(
          this.patron.position.x,
          this._hoverY(this.clock),
          this.patron.position.z
        );
        this.ufo.position.lerpVectors(job.ufoFrom, job.ufoTo, k);
        // Also ease the "from" so late approach still tracks
        if (k > 0.5) {
          this.ufo.position.x = THREE.MathUtils.lerp(
            this.ufo.position.x,
            this.patron.position.x,
            (k - 0.5) * 0.35
          );
          this.ufo.position.z = THREE.MathUtils.lerp(
            this.ufo.position.z,
            this.patron.position.z,
            (k - 0.5) * 0.35
          );
        }
        this.ufo.rotation.z =
          (1 - k) * 0.16 * Math.sign(job.ufoFrom.x - this.patron.position.x || 1);
        if (job.ufoK < 1) break;
        // Locked above — thin beam on, keep walking a moment
        this._placeUfoOver(
          this.patron.position.x,
          this.patron.position.z,
          this.clock
        );
        this.beam.visible = true;
        job.t = 0;
        job.state = ST.FOLLOW;
        break;
      }

      case ST.FOLLOW: {
        // Keep walking under a thin tracking beam for ~1.15s, then notice
        job.t += t;
        if (job.pathI < job.path.length) {
          const r = this._advance(this.patron, job.path, job.pathI, WALK * 0.95, t);
          job.pathI = r.pathI;
          this._bobWalk(t);
        } else {
          this.patron.position.y = 0;
        }
        this._placeUfoOver(
          this.patron.position.x,
          this.patron.position.z,
          this.clock
        );
        const h = this._aimBeamAt(
          this.patron.position.x,
          this.patron.position.z,
          0
        );
        // Thin laser only — no column yet
        this.beam.userData.setBeam(h, 1, 0, 0.55 + Math.sin(this.clock * 6) * 0.1);
        if (job.t < 1.15) break;
        // Freeze at current sidewalk position
        this.patron.position.y = 0;
        this.spot = this.patron.position.clone();
        this.spot.y = 0;
        job.t = 0;
        job.state = ST.NOTICE;
        break;
      }

      case ST.NOTICE: {
        job.t += t;
        this._placeUfoOver(this.spot.x, this.spot.z, this.clock);
        const h = this._aimBeamAt(this.spot.x, this.spot.z, 0);
        const look = Math.min(1, job.t / 0.45);
        this.beam.userData.setBeam(h, 1, 0, 0.6 + look * 0.2);
        // Stop and look up at the light
        this.patron.rotation.x = -0.35 * look;
        this.patron.rotation.y += (0 - this.patron.rotation.y) * Math.min(1, t * 4);
        if (job.t < 0.55) break;
        job.t = 0;
        job.state = ST.COLUMN;
        break;
      }

      case ST.COLUMN: {
        job.t += t;
        this._placeUfoOver(this.spot.x, this.spot.z, this.clock);
        const h = this._aimBeamAt(this.spot.x, this.spot.z, 0);
        const fill = Math.min(1, job.t / 0.9);
        this.beam.userData.setBeam(h, 1 - fill * 0.7, fill, 0.75 + fill * 0.2);
        this.patron.rotation.x = -0.25;
        if (job.t < 1.0) break;
        job.t = 0;
        job.floatY = 0;
        job.bounceDone = false;
        job.state = ST.FLOAT;
        break;
      }

      case ST.FLOAT: {
        job.t += t;
        this._placeUfoOver(this.spot.x, this.spot.z, this.clock);
        const hover = this._hoverY(this.clock);
        const mid = hover * 0.48;
        let y;
        if (!job.bounceDone) {
          const u = Math.min(1, job.t / 1.35);
          const ease = 1 - Math.pow(1 - u, 2.2);
          y = mid * ease;
          if (u > 0.82) {
            const b = (u - 0.82) / 0.18;
            y = mid + Math.sin(b * Math.PI) * 0.45;
          }
          if (u >= 1) {
            job.bounceDone = true;
            job.t = 0;
            job.floatY = mid;
          }
        } else {
          y = mid + Math.sin(job.t * 8) * 0.04;
          if (job.t > 0.35) {
            job.t = 0;
            job.floatY = mid;
            job.state = ST.SUCK;
            break;
          }
        }
        job.floatY = y;
        this.patron.position.y = y;
        this.patron.rotation.x = -0.25;
        this.patron.rotation.z = Math.sin(this.clock * 5) * 0.12;
        const h = this._aimBeamAt(this.spot.x, this.spot.z, 0);
        this.beam.userData.setBeam(h, 0.2, 1, 0.9);
        break;
      }

      case ST.SUCK: {
        job.t += t;
        this._placeUfoOver(this.spot.x, this.spot.z, this.clock);
        const hover = this._hoverY(this.clock);
        const u = Math.min(1, job.t / 0.28);
        const ease = u * u * u;
        const y = job.floatY + (hover - 0.15 - job.floatY) * ease;
        this.patron.position.y = y;
        this.patron.scale.setScalar(1 - ease * 0.85);
        this.patron.rotation.z = ease * 1.2;
        const h = this._aimBeamAt(this.spot.x, this.spot.z, 0);
        this.beam.userData.setBeam(h, 0.15, 1 - ease * 0.3, 0.95);
        if (u < 1) break;
        this.patron.visible = false;
        job.t = 0;
        job.state = ST.FADE;
        break;
      }

      case ST.FADE: {
        job.t += t;
        this._placeUfoOver(this.spot.x, this.spot.z, this.clock);
        const h = this._aimBeamAt(this.spot.x, this.spot.z, 0);
        const u = Math.min(1, job.t / 0.55);
        this.beam.userData.setBeam(
          h * (1 - u * 0.3),
          u,
          Math.max(0, 1 - u * 1.4),
          (1 - u) * 0.85
        );
        if (u < 1) break;
        this.beam.visible = false;
        const dir = job.dir || (this.spot.x < this.streetDoor.x ? -1 : 1);
        job.ufoFrom = this.ufo.position.clone();
        job.ufoTo = new THREE.Vector3(
          this.ufo.position.x + dir * 40,
          18 + Math.random() * 6,
          this.ufo.position.z + dir * 12
        );
        job.ufoK = 0;
        job.state = ST.UFO_OUT;
        break;
      }

      case ST.UFO_OUT: {
        job.ufoK = Math.min(1, job.ufoK + t * 1.8);
        // Ease-in: slow then warp
        const k = job.ufoK * job.ufoK * job.ufoK;
        this.ufo.position.lerpVectors(job.ufoFrom, job.ufoTo, k);
        // Spin harder on escape (body/spinner already spin; boost via extra yaw)
        if (this.ufo.userData.spinner) {
          this.ufo.userData.spinner.rotation.y += t * 6;
        }
        this.ufo.rotation.x = k * 0.25;
        this.ufo.scale.setScalar(1 - k * 0.35);
        if (job.ufoK < 1) break;
        this._finish();
        break;
      }

      default:
        this._finish();
    }
  }

  _finish() {
    this.ufo.visible = false;
    this.beam.visible = false;
    if (this.patron) {
      this.patron.visible = false;
    }
    this.job = null;
  }
}
