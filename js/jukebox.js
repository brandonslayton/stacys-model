/**
 * jukebox.js — Juke Boxx catalog + HTMLAudio with a real jukebox queue.
 *
 * Tracks live in data/jukebox.json; audio files under audio/.
 * First selection starts playback; more selections line up and auto-play next.
 * Browsers require a user gesture for the *first* play.
 */

const PRIDE = ["#e40303", "#ff8c00", "#ffed00", "#008026", "#24408e", "#732982"];

/** Tiny pride bar under a title on canvas screens. */
function prideBar(ctx, x, y, w, h = 6) {
  const sw = w / PRIDE.length;
  for (let i = 0; i < PRIDE.length; i++) {
    ctx.fillStyle = PRIDE[i];
    ctx.fillRect(x + i * sw, y, sw + 0.5, h);
  }
}

/**
 * Paint a Juke Boxx face for the wall unit (idle pulse invite vs now playing).
 * @returns {HTMLCanvasElement}
 */
export function paintJukeScreen({
  title = "MAKE A SELECTION",
  artist = "",
  playing = false,
  kind = "main",
  pulse = 0,
  queueLen = 0,
} = {}) {
  const w = kind === "main" ? 360 : 320;
  const h = kind === "main" ? 320 : 140;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");

  const grad = ctx.createLinearGradient(0, 0, w, h);
  const p = 0.5 + 0.5 * Math.sin(pulse || 0);
  grad.addColorStop(0, playing ? "#0a1830" : `rgb(${20 + p * 30},${8},${40 + p * 20})`);
  grad.addColorStop(0.45, playing ? "#1a0a30" : `rgb(${40 + p * 40},${10},${60})`);
  grad.addColorStop(1, playing ? "#081820" : `rgb(${8},${30 + p * 40},${28})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const glyphs = ["♪", "♫", "♥", "♪", "♬"];
  const cols = ["#ff5fa2", "#9b6dff", "#3dd68c", "#ff80c0", "#60e8ff", "#ffe14a"];
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = cols[i % cols.length];
    ctx.globalAlpha = 0.22 + (i % 3) * 0.1 + (playing ? 0 : p * 0.12);
    ctx.font = `800 ${16 + (i % 4) * 7}px Outfit, system-ui, sans-serif`;
    ctx.fillText(
      glyphs[i % glyphs.length],
      28 + (i * 55) % (w - 56),
      24 + ((i * 43) % (h - 36))
    );
  }
  ctx.globalAlpha = 1;

  if (kind === "main") {
    ctx.fillStyle = "rgba(0,0,0,0.52)";
    ctx.fillRect(18, h * 0.16, w - 36, h * 0.68);
    // Wordmark
    ctx.fillStyle = "#ff8ec4";
    ctx.font = "800 16px Outfit, system-ui, sans-serif";
    ctx.fillText("JUKE", w / 2, h * 0.28);
    // Rainbow BOXX
    const boxx = "BOXX";
    ctx.font = "800 36px Outfit, system-ui, sans-serif";
    const tw = ctx.measureText(boxx).width;
    let cx = w / 2 - tw / 2;
    for (let i = 0; i < boxx.length; i++) {
      const ch = boxx[i];
      const cw = ctx.measureText(ch).width;
      ctx.fillStyle = PRIDE[i % PRIDE.length];
      ctx.fillText(ch, cx + cw / 2, h * 0.4);
      cx += cw;
    }
    prideBar(ctx, w / 2 - 54, h * 0.48, 108, 5);
    ctx.fillStyle = playing ? "#3dd68c" : "#c9a0e8";
    ctx.font = "800 16px Outfit, system-ui, sans-serif";
    ctx.fillText(playing ? "NOW PLAYING" : "TOUCH SCREEN", w / 2, h * 0.58);
    ctx.fillStyle = "#f2eef8";
    ctx.font = "800 20px Outfit, system-ui, sans-serif";
    let t = title || "MAKE A SELECTION";
    if (t.length > 20) t = t.slice(0, 18) + "…";
    ctx.fillText(t, w / 2, h * 0.68);
    ctx.fillStyle = playing ? "#ffe14a" : "#80e8ff";
    ctx.font = "700 14px Outfit, system-ui, sans-serif";
    let sub = playing ? artist || "PLAYING INSIDE" : "TAP TO SELECT · $1";
    if (playing && queueLen > 0) sub = `${queueLen} IN QUEUE`;
    ctx.fillText(sub, w / 2, h * 0.78);
  } else {
    prideBar(ctx, 24, 12, w - 48, 5);
    ctx.fillStyle = playing ? "#3dd68c" : "#ff5fa2";
    ctx.font = "800 22px Outfit, system-ui, sans-serif";
    ctx.fillText(playing ? "♪ ON AIR ♫" : "♪ JUKE BOXX ♫", w / 2, h * 0.42);
    ctx.fillStyle = "#c8d0e8";
    ctx.font = "700 14px Outfit, system-ui, sans-serif";
    let t =
      playing && queueLen > 0
        ? `+${queueLen} QUEUED`
        : title || "TAP TO SELECT A TRACK";
    if (t.length > 26) t = t.slice(0, 24) + "…";
    ctx.fillText(t, w / 2, h * 0.72);
  }
  return c;
}

/**
 * Catalog + HTMLAudioElement + FIFO selection queue (real jukebox behavior).
 */
export class JukeboxPlayer {
  /**
   * @param {{
   *   onChange?: (state: object) => void
   * }} [opts]
   */
  constructor(opts = {}) {
    this.onChange = opts.onChange || (() => {});
    this.tracks = [];
    /** @type {string[]} pending track ids after the current one */
    this.queue = [];
    this.currentId = null;
    this.audio = new Audio();
    this.audio.preload = "metadata";
    this.audio.crossOrigin = "anonymous";
    this._bound = false;
    this._wireAudio();
  }

  _wireAudio() {
    if (this._bound) return;
    this._bound = true;
    const emit = () => this._emit();
    this.audio.addEventListener("play", emit);
    this.audio.addEventListener("pause", emit);
    this.audio.addEventListener("ended", () => {
      this._advanceQueue();
    });
    this.audio.addEventListener("error", () => {
      this._emit("Could not load track");
    });
  }

  _trackById(id) {
    return this.tracks.find((t) => t.id === id) || null;
  }

  _emit(error) {
    const track = this._trackById(this.currentId);
    const queueTracks = this.queue.map((id) => this._trackById(id)).filter(Boolean);
    this.onChange({
      track,
      playing: !this.audio.paused && !this.audio.ended && !!this.currentId,
      error: error || null,
      currentTime: this.audio.currentTime || 0,
      duration: this.audio.duration || 0,
      queue: queueTracks,
      queueIds: this.queue.slice(),
      /** Last select() result for UI toast */
      lastAction: this._lastAction || null,
    });
    this._lastAction = null;
  }

  async loadCatalog(url = "data/jukebox.json") {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(`Jukebox catalog ${res.status}`);
    const data = await res.json();
    this.tracks = Array.isArray(data.tracks) ? data.tracks : [];
    this._emit();
    return this.tracks;
  }

  get playing() {
    return !this.audio.paused && !this.audio.ended && !!this.currentId;
  }

  get current() {
    return this._trackById(this.currentId);
  }

  /** True if something is loaded / mid-play (including paused). */
  get hasActiveSession() {
    if (!this.currentId) return false;
    if (this.playing) return true;
    // Paused mid-track still owns the "now playing" slot
    return (this.audio.currentTime || 0) > 0.05 && !this.audio.ended;
  }

  /**
   * Start a track immediately (clears nothing in the queue unless replace).
   * @param {string} [id]
   */
  async play(id) {
    const track =
      (id && this._trackById(id)) || this.current || this.tracks[0];
    if (!track) throw new Error("No tracks in catalog");

    if (this.currentId !== track.id) {
      this.currentId = track.id;
      this.audio.src = track.src;
      this.audio.load();
    }
    try {
      await this.audio.play();
    } catch (err) {
      this._emit(err?.message || "Playback blocked");
      throw err;
    }
    this._emit();
  }

  /**
   * Jukebox selection:
   *  - If nothing is playing → start this song
   *  - If something is already on → queue this song for later
   * @param {string} id
   * @returns {Promise<{ queued: boolean, position?: number, track: object }>}
   */
  async select(id) {
    const track = this._trackById(id);
    if (!track) throw new Error("Unknown track");

    // Idle (or fully stopped) → play now
    if (!this.hasActiveSession && !this.playing) {
      // Clear stale ended state
      if (this.audio.ended) {
        this.audio.currentTime = 0;
      }
      this._lastAction = { type: "play", track };
      await this.play(id);
      return { queued: false, track };
    }

    // Already the current song and nothing after? Re-queue for another spin
    // (classic jukebox lets you pay again for the same track)
    this.queue.push(id);
    this._lastAction = {
      type: "queue",
      track,
      position: this.queue.length,
    };
    this._emit();
    return { queued: true, position: this.queue.length, track };
  }

  /** Advance to next queued track, or go idle. */
  async _advanceQueue() {
    if (this.queue.length === 0) {
      // Stay on last track id but stopped — real jukes go silent
      this.audio.currentTime = 0;
      this._emit();
      return;
    }
    const nextId = this.queue.shift();
    this.currentId = nextId;
    const track = this._trackById(nextId);
    if (!track) {
      // Skip missing entries
      return this._advanceQueue();
    }
    this.audio.src = track.src;
    this.audio.load();
    try {
      await this.audio.play();
    } catch {
      // If autoplay fails mid-queue, keep queue and surface error
      this._emit("Tap play to continue the queue");
      return;
    }
    this._emit();
  }

  pause() {
    this.audio.pause();
    this._emit();
  }

  /** Toggle play/pause for the current song only (does not alter queue). */
  async toggle() {
    if (this.playing) {
      this.pause();
      return;
    }
    if (this.currentId) {
      await this.play(this.currentId);
      return;
    }
    if (this.queue.length) {
      await this._advanceQueue();
      return;
    }
    if (this.tracks[0]) await this.play(this.tracks[0].id);
  }

  /** Stop playback and clear the entire queue. */
  stop() {
    this.audio.pause();
    this.audio.currentTime = 0;
    this.queue = [];
    this._emit();
  }

  /** Remove one upcoming selection (by queue index). */
  removeFromQueue(index) {
    if (index < 0 || index >= this.queue.length) return;
    this.queue.splice(index, 1);
    this._emit();
  }

  clearQueue() {
    this.queue = [];
    this._emit();
  }
}
