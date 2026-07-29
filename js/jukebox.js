/**
 * jukebox.js — catalog + real HTMLAudio playback for the interior jukebox.
 *
 * Tracks live in data/jukebox.json; audio files under audio/.
 * Browsers require a user gesture to start sound — the jukebox UI provides that.
 */

/**
 * Paint a GAY-MI face for the wall unit (idle pulse invite vs now playing).
 * @returns {HTMLCanvasElement}
 */
export function paintJukeScreen({
  title = "MAKE A SELECTION",
  artist = "",
  playing = false,
  kind = "main",
  pulse = 0,
} = {}) {
  const w = kind === "main" ? 360 : 320;
  const h = kind === "main" ? 320 : 140;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");

  const grad = ctx.createLinearGradient(0, 0, w, h);
  // Pink → purple → green club palette
  const p = 0.5 + 0.5 * Math.sin(pulse || 0);
  grad.addColorStop(0, playing ? "#0a1830" : `rgb(${20 + p * 30},${8},${40 + p * 20})`);
  grad.addColorStop(0.45, playing ? "#1a0a30" : `rgb(${40 + p * 40},${10},${60})`);
  grad.addColorStop(1, playing ? "#081820" : `rgb(${8},${30 + p * 40},${28})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const glyphs = ["♪", "♫", "♬", "♪", "♫"];
  const cols = ["#ff5fa2", "#9b6dff", "#3dd68c", "#ff80c0", "#60e8ff"];
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
    ctx.fillRect(18, h * 0.18, w - 36, h * 0.64);
    ctx.fillStyle = "#ff5fa2";
    ctx.font = "800 22px Outfit, system-ui, sans-serif";
    ctx.fillText("GAY-MI", w / 2, h * 0.3);
    ctx.fillStyle = playing ? "#3dd68c" : "#9b6dff";
    ctx.font = "800 20px Outfit, system-ui, sans-serif";
    ctx.fillText(playing ? "NOW PLAYING" : "TOUCH SCREEN", w / 2, h * 0.42);
    ctx.fillStyle = "#f2eef8";
    ctx.font = "800 24px Outfit, system-ui, sans-serif";
    let t = title || "MAKE A SELECTION";
    if (t.length > 20) t = t.slice(0, 18) + "…";
    ctx.fillText(t, w / 2, h * 0.56);
    ctx.fillStyle = playing ? "#ffe14a" : "#80e8ff";
    ctx.font = "700 15px Outfit, system-ui, sans-serif";
    ctx.fillText(
      playing ? artist || "PLAYING INSIDE" : "TAP TO SELECT · $1",
      w / 2,
      h * 0.7
    );
  } else {
    ctx.fillStyle = playing ? "#3dd68c" : "#ff5fa2";
    ctx.font = "800 24px Outfit, system-ui, sans-serif";
    ctx.fillText(playing ? "♪ ON AIR ♫" : "♪ TOUCH TO PLAY ♫", w / 2, h * 0.4);
    ctx.fillStyle = "#c8d0e8";
    ctx.font = "700 15px Outfit, system-ui, sans-serif";
    let t = title || "GAY-MI  ·  SELECT A TRACK";
    if (t.length > 26) t = t.slice(0, 24) + "…";
    ctx.fillText(t, w / 2, h * 0.7);
  }
  return c;
}

/**
 * Catalog + HTMLAudioElement controller.
 */
export class JukeboxPlayer {
  /**
   * @param {{
   *   onChange?: (state: { track: object|null, playing: boolean, error?: string }) => void
   * }} [opts]
   */
  constructor(opts = {}) {
    this.onChange = opts.onChange || (() => {});
    this.tracks = [];
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
      // Stay on the track, just stop
      this._emit();
    });
    this.audio.addEventListener("error", () => {
      this._emit("Could not load track");
    });
  }

  _emit(error) {
    const track = this.tracks.find((t) => t.id === this.currentId) || null;
    this.onChange({
      track,
      playing: !this.audio.paused && !this.audio.ended && !!this.currentId,
      error: error || null,
      currentTime: this.audio.currentTime || 0,
      duration: this.audio.duration || 0,
    });
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
    return this.tracks.find((t) => t.id === this.currentId) || null;
  }

  /**
   * Play a track by id (or resume current). Must be called from a user gesture.
   * @param {string} [id]
   */
  async play(id) {
    const track =
      (id && this.tracks.find((t) => t.id === id)) ||
      this.current ||
      this.tracks[0];
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

  pause() {
    this.audio.pause();
    this._emit();
  }

  /** Toggle play/pause for id (or current/first track). */
  async toggle(id) {
    if (id && id !== this.currentId) {
      await this.play(id);
      return;
    }
    if (this.playing) this.pause();
    else await this.play(id || this.currentId);
  }

  stop() {
    this.audio.pause();
    this.audio.currentTime = 0;
    this._emit();
  }
}
