/**
 * flicker.js — makes the lit fixtures behave like real hardware.
 *
 * kit.js already has a `glimmer` mechanism, but it is a sum of three sines: smooth,
 * strictly periodic, and identical every cycle. Reads as "shimmering", never as a
 * tube that is getting old. It also only touches materials marked `glimmer`, so the
 * signs sat perfectly steady and none of the PointLights moved at all — the wash on
 * the wall stayed constant while the sign above it shimmered, which is backwards.
 *
 * This layer runs AFTER `tickNight` and multiplies what it finds. That is safe
 * because pocket.js calls `setNight` every frame, so every intensity is rewritten
 * from its base before this touches it — nothing compounds frame to frame.
 *
 * Two ingredients, per fixture type:
 *
 *   Value noise  — smooth interpolated randomness for the constant idle wander.
 *                  Two octaves, so it does not read as a single sine.
 *   Stutters     — scheduled at random intervals, for the brief dropouts real neon
 *                  and fluorescent do. Incandescent does NOT do this, so the porch
 *                  lantern gets none; it just flutters warmly.
 *
 * Each fixture keeps its own noise seed and its own stutter schedule, so the pole
 * sign, the wall sign and the patio never blink together — simultaneous flicker is
 * the tell that gives away a fake.
 *
 * Stutter intervals are deliberately long (tens of seconds each). A first pass at
 * every 5-17s per sign read as faulty wiring rather than as "sometimes"; spread this
 * wide, something on the building twitches every ten seconds or so while no single
 * fixture looks broken.
 */

/**
 * Smooth 1-D value noise over a ring of random values. `t` is in cycles: 1.0 steps
 * one value along, so multiply time by the rate you want.
 */
function makeNoise(seed) {
  const N = 64;
  const vals = new Float32Array(N);
  let s = seed >>> 0;
  for (let i = 0; i < N; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    vals[i] = s / 4294967296;
  }
  return (t) => {
    const x = ((t % N) + N) % N;
    const i0 = Math.floor(x);
    const i1 = (i0 + 1) % N;
    const f = x - i0;
    const k = f * f * (3 - 2 * f); // smoothstep, so there are no corners
    return vals[i0] + (vals[i1] - vals[i0]) * k;
  };
}

/** Two octaves of noise centred on 1.0, swinging +/- amp. */
function wander(noiseA, noiseB, t, rate, amp) {
  const n = noiseA(t * rate) * 0.68 + noiseB(t * rate * 2.7) * 0.32;
  return 1 + (n - 0.5) * 2 * amp;
}

class Fixture {
  /**
   * @param {object} o
   * @param {THREE.Material[]} o.mats
   * @param {THREE.Light[]} o.lights
   * @param {number} o.rate idle wander speed, cycles/sec
   * @param {number} o.amp idle wander depth, 0..1
   * @param {[number, number]} [o.every] seconds between stutters, min/max
   * @param {[number, number]} [o.depth] how far a stutter drops, min/max
   * @param {number} o.seed
   */
  constructor({ mats, lights, rate, amp, every, depth, seed }) {
    this.mats = mats;
    this.lights = lights;
    this.rate = rate;
    this.amp = amp;
    this.every = every || null;
    this.depth = depth || [0.45, 0.7];
    this.a = makeNoise(seed);
    this.b = makeNoise(seed * 7919 + 13);
    // Stagger the first stutter so nothing fires on load
    this.nextAt = every ? 2 + Math.random() * every[1] : Infinity;
    this.until = 0;
    this.blinks = 2;
    this.dropTo = 0.5;
  }

  _scheduleNext(now) {
    const [lo, hi] = this.every;
    this.nextAt = now + lo + Math.random() * (hi - lo);
  }

  factor(now) {
    let f = wander(this.a, this.b, now, this.rate, this.amp);

    if (now >= this.nextAt && now >= this.until) {
      // Start a stutter
      const [dlo, dhi] = this.depth;
      this.dropTo = dlo + Math.random() * (dhi - dlo);
      this.blinks = 1 + ((Math.random() * 3) | 0);
      this.until = now + 0.07 + Math.random() * 0.17;
      this.startedAt = now;
      this._scheduleNext(this.until);
    }

    if (now < this.until) {
      const span = this.until - this.startedAt;
      const k = (now - this.startedAt) / span;
      // Rapid blinks inside a soft envelope, so it drops out and recovers rather
      // than popping to a hard value and back
      const osc = 0.5 - 0.5 * Math.cos(k * this.blinks * Math.PI * 2);
      const env = Math.sin(k * Math.PI);
      f *= 1 - (1 - this.dropTo) * osc * env;
    }
    return f;
  }
}

export class FlickerSystem {
  /** @param {THREE.Group} venue result of createStacys() */
  constructor(venue) {
    const fx = venue.userData.fixtures || {};
    const byName = (name) => {
      const out = [];
      venue.traverse((o) => {
        if (o.name === name && o.material) out.push(o.material);
      });
      return out;
    };
    const light = (l) => (l ? [l] : []);

    this.fixtures = [];

    // Wall sign — neon behind an acrylic face. Idles almost steady, then drops out
    // briefly. Its wash light moves with it, so the glow on the block tracks the sign.
    const wallMats = [...byName("wallSignFace"), ...byName("wallSignCabinet")];
    if (wallMats.length || fx.wallSignWash) {
      this.fixtures.push(
        new Fixture({
          mats: wallMats,
          lights: light(fx.wallSignWash),
          rate: 0.42,
          amp: 0.045,
          every: [14, 45],
          depth: [0.5, 0.8],
          seed: 12345,
        })
      );
    }

    // Pole sign — the big roadside marquee. Slightly livelier and on its own
    // schedule, so the two signs never stutter in step.
    const poleMats = [
      ...byName("stacysDiamondFace"),
      ...byName("stacysDiamondBulb"),
    ];
    if (poleMats.length || fx.poleSignWash) {
      this.fixtures.push(
        new Fixture({
          mats: poleMats,
          lights: light(fx.poleSignWash),
          rate: 0.55,
          amp: 0.06,
          every: [10, 38],
          depth: [0.45, 0.78],
          seed: 987654,
        })
      );
    }

    // Porch lantern — incandescent, so a continuous warm flutter and NO stutter.
    // Filaments do not strobe; giving this one blinks made it read as a fault.
    const lantern = byName("porchLantern");
    if (lantern.length) {
      this.fixtures.push(
        new Fixture({
          mats: lantern,
          lights: [],
          rate: 2.1,
          amp: 0.095,
          every: null,
          seed: 24680,
        })
      );
    }

    // Patio wash — collective breathing only. The individual bulbs and LED rails
    // already shimmer via kit.js glimmer, so this drives the two wash lights to make
    // the whole space breathe, with an occasional shallow sag like a load dip.
    if (fx.patioWashes?.length) {
      this.fixtures.push(
        new Fixture({
          mats: [],
          lights: fx.patioWashes.filter(Boolean),
          rate: 0.28,
          amp: 0.055,
          every: [20, 60],
          depth: [0.75, 0.9],
          seed: 555111,
        })
      );
    }
  }

  /**
   * @param {number} nowSeconds monotonic clock
   * @param {number} nightT current night mix; below ~0.12 nothing is lit
   */
  update(nowSeconds, nightT) {
    if (nightT < 0.12) return;
    for (const f of this.fixtures) {
      const k = f.factor(nowSeconds);
      for (const m of f.mats) m.emissiveIntensity *= k;
      for (const l of f.lights) l.intensity *= k;
    }
  }
}
