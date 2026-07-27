/**
 * sprites.js — canvas-drawn textures for the little floating reaction sprites, and a
 * pool for playing them one-shot.
 *
 * Shared so chores.js and incident.js do not each carry their own heart.
 */
import * as THREE from "three";

function canvas(S = 128) {
  const c = document.createElement("canvas");
  c.width = c.height = S;
  return [c, c.getContext("2d")];
}

function finish(c) {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function heartTexture() {
  const S = 128;
  const [c, ctx] = canvas(S);
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
  return finish(c);
}

/** Four-point sparkle, for the "this is clean now" flourish. */
export function starTexture() {
  const S = 128;
  const [c, ctx] = canvas(S);
  const cx = S / 2;
  const cy = S / 2;
  const long = S * 0.46;
  const short = S * 0.085;
  ctx.beginPath();
  ctx.moveTo(cx, cy - long);
  ctx.quadraticCurveTo(cx + short, cy - short, cx + long, cy);
  ctx.quadraticCurveTo(cx + short, cy + short, cx, cy + long);
  ctx.quadraticCurveTo(cx - short, cy + short, cx - long, cy);
  ctx.quadraticCurveTo(cx - short, cy - short, cx, cy - long);
  ctx.closePath();
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, long);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.5, "#fff6c8");
  g.addColorStop(1, "#ffe27a");
  ctx.fillStyle = g;
  ctx.fill();
  return finish(c);
}

/** A rainbow arc. */
export function rainbowTexture() {
  const S = 128;
  const [c, ctx] = canvas(S);
  const bands = ["#ff4d4d", "#ff9a3c", "#ffd93c", "#4fd964", "#3ca0ff", "#9b6dff"];
  const cx = S / 2;
  const cy = S * 0.82;
  const outer = S * 0.44;
  const band = (outer * 0.62) / bands.length;
  ctx.lineCap = "butt";
  bands.forEach((col, i) => {
    ctx.beginPath();
    ctx.strokeStyle = col;
    ctx.lineWidth = band;
    ctx.arc(cx, cy, outer - band * (i + 0.5), Math.PI, 0);
    ctx.stroke();
  });
  return finish(c);
}

/**
 * A pool of billboard sprites played as one-shots: spawn at a point, drift up, fade.
 *
 * Sprites each carry their own material (so they can fade independently), which means
 * one draw call each — kept to small pools for that reason. The mist uses Points
 * instead precisely because it needs hundreds.
 */
export class SpriteBurst {
  /**
   * @param {THREE.Object3D} parent
   * @param {THREE.Texture} texture
   * @param {object} [opts]
   * @param {number} [opts.count] pool size
   * @param {number} [opts.size] world-space scale
   * @param {number} [opts.rise] units travelled over a life
   * @param {number} [opts.life] seconds
   */
  constructor(parent, texture, opts = {}) {
    this.count = opts.count ?? 8;
    this.size = opts.size ?? 0.7;
    this.rise = opts.rise ?? 1.0;
    this.life = opts.life ?? 1.8;
    this.items = [];
    for (let i = 0; i < this.count; i++) {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          depthWrite: false,
        })
      );
      s.visible = false;
      s.scale.setScalar(this.size);
      parent.add(s);
      this.items.push({ sprite: s, age: Infinity, x: 0, y: 0, z: 0, drift: 0 });
    }
  }

  /** Play one at a world position. Silently does nothing if the pool is exhausted. */
  play(x, y, z, jitter = 0.18) {
    const it = this.items.find((i) => i.age >= this.life);
    if (!it) return false;
    it.age = 0;
    it.x = x + (Math.random() - 0.5) * jitter * 2;
    it.y = y;
    it.z = z + (Math.random() - 0.5) * jitter * 2;
    it.drift = (Math.random() - 0.5) * 0.3;
    it.sprite.visible = true;
    return true;
  }

  update(dt) {
    for (const it of this.items) {
      if (it.age >= this.life) continue;
      it.age += dt;
      const k = it.age / this.life;
      if (k >= 1) {
        it.sprite.visible = false;
        continue;
      }
      it.sprite.position.set(it.x + it.drift * k, it.y + this.rise * k, it.z);
      // Pop in over the first fifth, hold, then fade out over the last half
      const pop = k < 0.2 ? 0.55 + (k / 0.2) * 0.45 : 1;
      it.sprite.scale.setScalar(this.size * pop);
      it.sprite.material.opacity = k > 0.5 ? 1 - (k - 0.5) / 0.5 : 1;
    }
  }

  /** True while anything is still playing. */
  get busy() {
    return this.items.some((i) => i.age < this.life);
  }
}
