/**
 * icons.js — inline SVG for the header, plus moon phase maths.
 *
 * SVG rather than emoji: emoji render differently on every platform and cannot
 * take the UI's color, and the previous text glyphs (☀ / ☾) were too faint to read
 * against a bright sky. These inherit currentColor.
 */

const svg = (body, size = 17) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" ` +
  `stroke="currentColor" stroke-width="1.9" stroke-linecap="round" ` +
  `stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const RAYS = [
  "M12 1.6v2.2", "M12 20.2v2.2", "M1.6 12h2.2", "M20.2 12h2.2",
  "M4.6 4.6l1.6 1.6", "M17.8 17.8l1.6 1.6", "M4.6 19.4l1.6-1.6", "M17.8 6.2l1.6-1.6",
]
  .map((d) => `<path d="${d}"/>`)
  .join("");

const CLOUD = `<path d="M6.5 18h11a3.5 3.5 0 0 0 .3-7 5.5 5.5 0 0 0-10.6-1.3A3.6 3.6 0 0 0 6.5 18z"/>`;

export const WX_ICONS = {
  sun: svg(`<circle cx="12" cy="12" r="4.4"/>${RAYS}`),
  // Plain crescent, used only when the real moon phase is unavailable
  moon: svg(`<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5z"/>`),
  cloud: svg(CLOUD),
  partly: svg(
    `<circle cx="8" cy="8" r="3.1"/><path d="M8 2.6v1.4"/><path d="M2.6 8h1.4"/>` +
      `<path d="M4.2 4.2l1 1"/><path d="M11.8 4.2l-1 1"/>` +
      `<path d="M9.5 19h8a3.2 3.2 0 0 0 .2-6.4 5 5 0 0 0-9.6-1.2A3.3 3.3 0 0 0 9.5 19z"/>`
  ),
  rain: svg(
    `<path d="M6.5 15.5h11a3.5 3.5 0 0 0 .3-7 5.5 5.5 0 0 0-10.6-1.3A3.6 3.6 0 0 0 6.5 15.5z"/>` +
      `<path d="M9 19l-.8 2.2"/><path d="M13 19l-.8 2.2"/><path d="M17 19l-.8 2.2"/>`
  ),
  storm: svg(
    `<path d="M6.5 15.5h11a3.5 3.5 0 0 0 .3-7 5.5 5.5 0 0 0-10.6-1.3A3.6 3.6 0 0 0 6.5 15.5z"/>` +
      `<path d="M13 18l-2.6 3.6h3l-1 2.4"/>`
  ),
  snow: svg(
    `<path d="M6.5 15.5h11a3.5 3.5 0 0 0 .3-7 5.5 5.5 0 0 0-10.6-1.3A3.6 3.6 0 0 0 6.5 15.5z"/>` +
      `<path d="M12 18v4"/><path d="M10.2 19.2l3.6 1.6"/><path d="M13.8 19.2l-3.6 1.6"/>`
  ),
  fog: svg(
    `<path d="M4 9.5h16"/><path d="M6 13.5h12"/><path d="M4 17.5h16"/>`
  ),
};

/** A circular arrow, for the auto-rotate toggle. */
export const ROTATE_ICON = svg(
  `<path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1"/><path d="M20.8 4.4v4.4h-4.4"/>`,
  20
);

/** Queasy face, for the sick-patron scene. */
export const SICK_ICON = svg(
  `<circle cx="12" cy="12" r="9"/>` +
    `<path d="M7.6 9.2l2.4 1.6"/><path d="M16.4 9.2l-2.4 1.6"/>` +
    `<path d="M8 16.2c1-1 1.6-1 2.6 0s1.6 1 2.6 0 1.6-1 2.6 0"/>`,
  20
);

/** Mist / spray, for the patio misting system. */
export const MIST_ICON = svg(
  `<path d="M5 6.5h5"/><path d="M13.5 6.5h5.5"/>` +
    `<path d="M4 10.5h7"/><path d="M14.5 10.5h5"/>` +
    `<path d="M8.6 15.4v1.5"/><path d="M12 14.6v2.6"/><path d="M15.4 15.4v1.5"/>` +
    `<path d="M10.3 19.6v1.4"/><path d="M13.7 19.6v1.4"/>`,
  20
);

/** A trash can, for the take-out-the-trash chore. */
export const TRASH_ICON = svg(
  `<path d="M4 7h16"/><path d="M9.5 7V4.6h5V7"/>` +
    `<path d="M6.2 7l1 12.2A1.6 1.6 0 0 0 8.8 20.7h6.4a1.6 1.6 0 0 0 1.6-1.5L17.8 7"/>` +
    `<path d="M10.3 11v5.6"/><path d="M13.7 11v5.6"/>`,
  20
);

/**
 * Gaymo rideshare: car silhouette with a roof sensor dome and no wheels so the
 * icon matches the hovering robotaxi on the street.
 */
export const RIDESHARE_ICON = svg(
  `<path d="M5 15.2h14"/>` +
    `<path d="M5.4 15.2l1.3-4A1.5 1.5 0 0 1 8.1 9.8h7.8a1.5 1.5 0 0 1 1.4 1.2l1.3 4.2"/>` +
    `<path d="M7.4 11.6h9.2"/>` +
    `<path d="M11 6.4v1.5"/><circle cx="12" cy="5.5" r="1.45"/>` +
    `<path d="M8 16.6c1.2.8 2.4 1.2 4 1.2s2.8-.4 4-1.2"/>` +
    `<path d="M9.5 17.8h5"/>`,
  20
);

/**
 * Creative mode: a small sparkle / wand so it reads as "play pretend" rather
 * than a real venue setting.
 */
export const CREATIVE_ICON = svg(
  `<path d="M12 2.5l1.1 3.4L16.5 7l-3.4 1.1L12 11.5l-1.1-3.4L7.5 7l3.4-1.1L12 2.5z"/>` +
    `<path d="M18.5 12.5l.7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7.7-2.1z"/>` +
    `<path d="M6.2 14.2l.55 1.7 1.7.55-1.7.55-.55 1.7-.55-1.7-1.7-.55 1.7-.55.55-1.7z"/>`,
  20
);

/** Flying saucer for the sidewalk abduction scene. */
export const UFO_ICON = svg(
  `<ellipse cx="12" cy="13.2" rx="8.2" ry="2.6"/>` +
    `<path d="M6.5 13.2c.4-3.2 2.5-5.2 5.5-5.2s5.1 2 5.5 5.2"/>` +
    `<ellipse cx="12" cy="10.2" rx="3.2" ry="2.1"/>` +
    `<path d="M4.2 13.8h1.2"/><path d="M18.6 13.8h1.2"/>` +
    `<path d="M8 16.2l-.6 1.6"/><path d="M12 16.6v1.6"/><path d="M16 16.2l.6 1.6"/>`,
  20
);

/** Soft taco shell for the festival taco-stand button. */
export const TACO_ICON = svg(
  `<path d="M4.5 14.5c0-4.2 3.4-7.6 7.5-7.6s7.5 3.4 7.5 7.6"/>` +
    `<path d="M5.2 14.5h13.6"/>` +
    `<path d="M7 12.2c.8-.6 1.6-.9 2.5-.9"/>` +
    `<path d="M12 10.8c.6 0 1.3.2 2 .6"/>` +
    `<path d="M9.2 14.5l.8 2.2"/><path d="M12 14.5v2.4"/><path d="M14.8 14.5l-.8 2.2"/>`,
  20
);

/**
 * Liquor delivery: bottle silhouette for the stock drop button.
 */
export const LIQUOR_ICON = svg(
  `<path d="M10 3.2h4v2.2c0 .6.2 1.1.6 1.5l1.2 1.2c.7.7 1.1 1.6 1.1 2.6V19a1.8 1.8 0 0 1-1.8 1.8H8.9A1.8 1.8 0 0 1 7.1 19v-8.3c0-1 .4-1.9 1.1-2.6l1.2-1.2c.4-.4.6-.9.6-1.5V3.2z"/>` +
    `<path d="M9.2 12.5h5.6"/>` +
    `<path d="M9.2 15.2h5.6"/>`,
  20
);

/** Pigeon / bird for the flyby button. */
export const BIRD_ICON = svg(
  `<path d="M4 14c2-1 3.5-4 5-4 1 0 1.5.8 2.2 1.2"/>` +
    `<path d="M11.2 11.2c.8-2.2 2.6-3.8 5.3-4.2 1.2 1.6 1.6 3.4 1.2 5.2"/>` +
    `<path d="M16.5 12.5c1.2.2 2.4.8 3.5 1.8"/>` +
    `<path d="M9 12.5c-1.2 1-2.2 2.6-2.5 4"/>` +
    `<circle cx="18.2" cy="9.2" r="0.7" fill="currentColor" stroke="none"/>`,
  20
);

/** Doorway — enter the low-poly interior. */
export const INSIDE_ICON = svg(
  `<path d="M5 20V5.5A1.5 1.5 0 0 1 6.5 4h7A1.5 1.5 0 0 1 15 5.5V20"/>` +
    `<path d="M15 20h4v-9.5A1.5 1.5 0 0 0 17.5 9H15"/>` +
    `<path d="M9.2 12.2h0.1"/>` +
    `<circle cx="12.2" cy="12.2" r="0.7" fill="currentColor" stroke="none"/>`,
  20
);

/** Arrow out — leave the interior back to the lot. */
export const OUTSIDE_ICON = svg(
  `<path d="M9 6l-5 6 5 6"/>` +
    `<path d="M4 12h12.5"/>` +
    `<path d="M16.5 7v10"/>`,
  20
);

/** Sparkle grid / play menu — opens the labeled lot toy sheet. */
export const PLAY_ICON = svg(
  `<rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/>` +
    `<rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/>` +
    `<rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/>` +
    `<rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/>`,
  20
);

// ---------------------------------------------------------------- moon phase
const SYNODIC = 29.530588853; // mean days between new moons
/** A known new moon: 2000-01-06 18:14 UTC. */
const NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);

const PHASE_NAMES = [
  "New Moon",
  "Waxing Crescent",
  "First Quarter",
  "Waxing Gibbous",
  "Full Moon",
  "Waning Gibbous",
  "Last Quarter",
  "Waning Crescent",
];

/**
 * Moon phase as a fraction of the cycle: 0 = new, 0.25 = first quarter,
 * 0.5 = full, 0.75 = last quarter.
 *
 * Mean-synodic approximation, so it can be a few hours off a precise ephemeris.
 * That is far inside the resolution of naming a phase or drawing its shape, and it
 * avoids taking on another API dependency for a decorative detail.
 */
export function moonPhase(date = new Date()) {
  const days = (date.getTime() - NEW_MOON) / 86400000;
  let p = (days % SYNODIC) / SYNODIC;
  if (p < 0) p += 1;
  return p;
}

export function moonName(p) {
  return PHASE_NAMES[Math.round(p * 8) % 8];
}

/** Illuminated fraction, 0..1. */
export function moonIllumination(p) {
  return (1 - Math.cos(2 * Math.PI * p)) / 2;
}

/**
 * SVG of the moon showing its actual phase shape.
 *
 * The lit region is bounded by the limb on one side and the terminator — a
 * half-ellipse whose x semi-axis is R·|cos(2πp)| — on the other. It collapses to a
 * straight line at the quarters and to the full limb at new and full moon.
 */
export function moonIcon(p, size = 17) {
  const R = 9;
  const c = Math.cos(2 * Math.PI * p);
  const lit = p < 0.5 ? 1 : -1; // +1 = lit on the right
  const termX = lit * c * R;
  const sweepLimb = lit > 0 ? 1 : 0;
  const sweepTerm = termX > 0 ? 0 : 1;
  const rx = Math.abs(termX).toFixed(2);

  const d =
    `M12 3 A ${R} ${R} 0 0 ${sweepLimb} 12 21 ` +
    `A ${rx} ${R} 0 0 ${sweepTerm} 12 3 Z`;

  return (
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">` +
    `<circle cx="12" cy="12" r="${R}" fill="none" stroke="currentColor" ` +
    `stroke-width="1.3" opacity="0.4"/>` +
    `<path d="${d}" fill="currentColor"/></svg>`
  );
}
