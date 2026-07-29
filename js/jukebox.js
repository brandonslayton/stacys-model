/**
 * jukebox.js — catalog + real HTMLAudio playback for the interior jukebox.
 *
 * Tracks live in data/jukebox.json; audio files under audio/.
 * Browsers require a user gesture to start sound — the jukebox UI provides that.
 */

/**
 * Paint a "now playing" / idle face for the AMI jukebox main screen.
 * @returns {HTMLCanvasElement}
 */
export function paintJukeScreen({
  title = "PICK A BOP",
  artist = "",
  playing = false,
  kind = "main",
} = {}) {
  const w = kind === "main" ? 360 : 320;
  const h = kind === "main" ? 320 : 140;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");

  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, "#0a1838");
  grad.addColorStop(0.5, "#1a0a30");
  grad.addColorStop(1, "#081828");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Decorative notes
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const glyphs = ["♪", "♫", "♬", "$", "♪", "♫"];
  const cols = ["#60e8ff", "#ff80c0", "#ffe14a", "#80ffb0", "#c080ff"];
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = cols[i % cols.length];
    ctx.globalAlpha = 0.28 + (i % 3) * 0.12;
    ctx.font = `800 ${16 + (i % 4) * 7}px Outfit, system-ui, sans-serif`;
    ctx.fillText(
      glyphs[i % glyphs.length],
      28 + (i * 51) % (w - 56),
      24 + ((i * 41) % (h - 36))
    );
  }
  ctx.globalAlpha = 1;

  if (kind === "main") {
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(20, h * 0.22, w - 40, h * 0.56);
    ctx.fillStyle = playing ? "#80f0ff" : "#80f0ff";
    ctx.font = "800 28px Outfit, system-ui, sans-serif";
    ctx.fillText(playing ? "♪  NOW PLAYING  ♫" : "♪  JUKEBOX  ♫", w / 2, h * 0.36);
    ctx.fillStyle = "#ff80c0";
    ctx.font = "800 26px Outfit, system-ui, sans-serif";
    // Truncate long titles
    let t = title || "PICK A BOP";
    if (t.length > 22) t = t.slice(0, 20) + "…";
    ctx.fillText(t, w / 2, h * 0.52);
    if (artist) {
      ctx.fillStyle = "#ffe14a";
      ctx.font = "700 18px Outfit, system-ui, sans-serif";
      ctx.fillText(artist, w / 2, h * 0.66);
    } else {
      ctx.fillStyle = "#a0c0e0";
      ctx.font = "700 16px Outfit, system-ui, sans-serif";
      ctx.fillText(playing ? "TAP TO PAUSE" : "TAP TO BROWSE", w / 2, h * 0.66);
    }
  } else {
    ctx.fillStyle = playing ? "#3dd68c" : "#ff80c0";
    ctx.font = "800 26px Outfit, system-ui, sans-serif";
    ctx.fillText(playing ? "♪ ON AIR ♫" : "♪ TOUCH TO BROWSE ♫", w / 2, h * 0.42);
    ctx.fillStyle = "#80e8ff";
    ctx.font = "700 16px Outfit, system-ui, sans-serif";
    let t = title || "INSERT $  ·  TAP SONG";
    if (t.length > 28) t = t.slice(0, 26) + "…";
    ctx.fillText(t, w / 2, h * 0.72);
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
