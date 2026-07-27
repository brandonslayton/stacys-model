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
