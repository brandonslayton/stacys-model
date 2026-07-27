/**
 * mist.js — the patio misting system.
 *
 * Phoenix patios live on these: a line of nozzles on the fence rail throwing a fine
 * fog that drops, pools, and drifts. Toggled from the header controls.
 *
 * Rendered as a single THREE.Points with a custom ShaderMaterial, which matters here:
 * the model already costs ~1,395 draw calls and that is the known bottleneck, so a
 * few hundred individual Sprites would be a bad trade. Points gets the whole effect
 * into ONE draw call.
 *
 * The custom shader exists because `PointsMaterial` cannot fade particles
 * individually — per-vertex colour multiplies the texture but alpha comes from the
 * texture alone, so a pool of particles at different ages cannot be expressed. The
 * usual workaround is additive blending with colour standing in for brightness, but
 * additive white mist blows out against a sunlit patio. A `vAlpha` attribute costs
 * about fifteen lines of GLSL and behaves correctly in daylight and at night.
 */
import * as THREE from "three";

const COUNT = 240;
/**
 * Seconds a particle lives.
 *
 * Long enough to actually reach the deck from the rail 1.9 units up. At 2.4s with
 * gentler velocities the mist expired mid-air and hung as a band at rail height,
 * which read as a floating haze rather than a patio filling up.
 */
const LIFE = 3.3;
/** Seconds for the whole system to fade fully on or off. */
const RAMP = 1.1;

const VERT = /* glsl */ `
  attribute float alpha;
  attribute float size;
  varying float vAlpha;
  uniform float uScale;
  void main() {
    vAlpha = alpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * (uScale / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vAlpha;
  void main() {
    vec4 t = texture2D(uMap, gl_PointCoord);
    gl_FragColor = vec4(uColor, t.a * vAlpha * uOpacity);
  }
`;

/** Soft round puff. */
function puffTexture() {
  const S = 64;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, "rgba(255,255,255,0.95)");
  g.addColorStop(0.45, "rgba(255,255,255,0.42)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class MistSystem {
  /**
   * @param {THREE.Object3D} parent
   * @param {THREE.Group} venue result of createStacys()
   */
  constructor(parent, venue) {
    this.patio = venue.userData.patio || null;
    this.on = false;
    /** Eased 0..1 follow of `on`. */
    this.strength = 0;
    this.enabled = !!this.patio;
    if (!this.enabled) return;

    const p = this.patio;
    this.nozzles = this._buildNozzles(p);

    const pos = new Float32Array(COUNT * 3);
    const alpha = new Float32Array(COUNT);
    const size = new Float32Array(COUNT);
    this.age = new Float32Array(COUNT);
    this.life = new Float32Array(COUNT);
    this.vel = new Float32Array(COUNT * 3);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("alpha", new THREE.BufferAttribute(alpha, 1));
    geo.setAttribute("size", new THREE.BufferAttribute(size, 1));
    this.geo = geo;

    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: puffTexture() },
        // Faintly cool rather than pure white — it should read as cold water
        uColor: { value: new THREE.Color(0xdcefff) },
        uOpacity: { value: 0 },
        uScale: { value: 700 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      // depthTest so the building occludes it; no depthWrite so puffs blend together
      depthTest: true,
      depthWrite: false,
    });

    this.points = new THREE.Points(geo, this.mat);
    this.points.name = "patioMist";
    this.points.frustumCulled = false;
    this.points.visible = false;
    parent.add(this.points);

    // Sells the "cooling" read; stays subtle so it never fights the patio neon
    this.chill = new THREE.PointLight(0x9fd8ff, 0, 6.5, 2);
    this.chill.position.set(
      (p.xMin + p.xMax) / 2,
      p.railY - 0.3,
      (p.zMin + p.zMax) / 2
    );
    this.chill.castShadow = false;
    parent.add(this.chill);

    // All particles start dead; spawning begins on the first update after switch-on
    for (let i = 0; i < COUNT; i++) {
      this.age[i] = Infinity;
      this.life[i] = LIFE;
    }
  }

  /**
   * Nozzle positions and spray directions along the three fence rails. The building
   * is the patio's fourth wall, so it gets none.
   */
  _buildNozzles(p) {
    const out = [];
    const y = p.railY - 0.06;
    const inset = 0.12;
    const stepX = (p.xMax - p.xMin) / 7;
    for (let i = 0; i <= 7; i++) {
      // Rear rail, spraying toward the building
      out.push({ x: p.xMin + i * stepX, y, z: p.zMin + inset, dx: 0, dz: 1 });
    }
    const stepZ = (p.zMax - p.zMin) / 3;
    for (let i = 0; i <= 3; i++) {
      const z = p.zMin + i * stepZ;
      out.push({ x: p.xMin + inset, y, z, dx: 1, dz: 0 });
      out.push({ x: p.xMax - inset, y, z, dx: -1, dz: 0 });
    }
    return out;
  }

  /** Exact projection factor for gl_PointSize, so puffs are the same size anywhere. */
  setProjection(fovDeg, viewportHeightPx) {
    if (!this.enabled) return;
    const fov = (fovDeg * Math.PI) / 180;
    this.mat.uniforms.uScale.value = viewportHeightPx / (2 * Math.tan(fov / 2));
  }

  toggle() {
    if (!this.enabled) return false;
    this.on = !this.on;
    return this.on;
  }

  _spawn(i) {
    const n = this.nozzles[(Math.random() * this.nozzles.length) | 0];
    const j = i * 3;
    const pos = this.geo.attributes.position.array;
    pos[j] = n.x + (Math.random() - 0.5) * 0.16;
    pos[j + 1] = n.y + (Math.random() - 0.5) * 0.1;
    pos[j + 2] = n.z + (Math.random() - 0.5) * 0.16;

    // Out of the nozzle, angled inward and down, then it sinks and spreads
    const spread = 0.22;
    this.vel[j] = n.dx * (0.3 + Math.random() * 0.22) + (Math.random() - 0.5) * spread;
    this.vel[j + 1] = -0.34 - Math.random() * 0.2;
    this.vel[j + 2] = n.dz * (0.3 + Math.random() * 0.22) + (Math.random() - 0.5) * spread;

    this.age[i] = 0;
    this.life[i] = LIFE * (0.75 + Math.random() * 0.5);
    // WORLD units, not pixels — uScale converts. Set to pixel-scale numbers once and
    // each puff covered the entire screen.
    this.geo.attributes.size.array[i] = 0.55 + Math.random() * 0.5;
  }

  update(dt) {
    if (!this.enabled) return;
    const t = Math.min(dt, 0.05);

    // Ease toward the switch position
    const target = this.on ? 1 : 0;
    if (this.strength !== target) {
      const step = t / RAMP;
      this.strength =
        target > this.strength
          ? Math.min(target, this.strength + step)
          : Math.max(target, this.strength - step);
    }

    // Low per-puff alpha: they overlap heavily, so density comes from stacking
    this.mat.uniforms.uOpacity.value = this.strength * 0.5;
    this.chill.intensity = this.strength * 0.55;

    // uOpacity multiplies every particle, so at zero there is nothing to see no
    // matter how many are still mid-life — skip the whole update rather than paying
    // a draw call and a 240-particle pass for fully transparent output.
    if (this.mat.uniforms.uOpacity.value <= 0.001) {
      if (this.points.visible) {
        // Park everything on the way out, or switching back on flashes the stale
        // positions particles were frozen at
        this.geo.attributes.alpha.array.fill(0);
        this.geo.attributes.alpha.needsUpdate = true;
        this.age.fill(Infinity);
        this.points.visible = false;
      }
      return;
    }
    this.points.visible = true;

    const pos = this.geo.attributes.position.array;
    const alpha = this.geo.attributes.alpha.array;
    const p = this.patio;

    // Spawn budget scales with strength, so it thins out as it switches off
    let budget = Math.ceil(COUNT * (t / LIFE) * this.strength);

    for (let i = 0; i < COUNT; i++) {
      const j = i * 3;
      this.age[i] += t;

      if (this.age[i] >= this.life[i]) {
        if (budget > 0 && this.strength > 0.02) {
          this._spawn(i);
          budget--;
        } else {
          alpha[i] = 0;
          continue;
        }
      }

      // Sink, slow down, and drift
      this.vel[j] *= 0.985;
      this.vel[j + 2] *= 0.985;
      this.vel[j + 1] = Math.max(-0.85, this.vel[j + 1] - 0.3 * t);

      pos[j] += this.vel[j] * t;
      pos[j + 1] += this.vel[j + 1] * t;
      pos[j + 2] += this.vel[j + 2] * t;

      // Pool on the deck rather than sinking through it, and creep outward there
      if (pos[j + 1] < p.floorY + 0.12) {
        pos[j + 1] = p.floorY + 0.12;
        this.vel[j + 1] = 0;
        this.vel[j] *= 1.008;
        this.vel[j + 2] *= 1.008;
      }

      // Keep it inside the walls — it is a walled patio, not open ground
      pos[j] = Math.min(p.xMax, Math.max(p.xMin, pos[j]));
      pos[j + 2] = Math.min(p.zMax + 0.35, Math.max(p.zMin, pos[j + 2]));

      // Fade in fast, out slowly
      const k = this.age[i] / this.life[i];
      alpha[i] = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
    }

    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.alpha.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
  }
}
