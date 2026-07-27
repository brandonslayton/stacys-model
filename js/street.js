/**
 * street.js — a stub of 7th Avenue in front of the lot.
 *
 * The parent game gets its road from config.js ROAD / roadCenterAt / roadNormalAt,
 * where the road runs along world Z and parcels are rotated into place. In the
 * workbench's local space the street face is +Z and north is −X, so the road
 * runs along X at a fixed +Z offset. That makes the geometry a straight line and
 * the helpers trivial — no curve sampling needed.
 *
 * Right-hand traffic: the NEAR lane (smaller Z, building side) runs toward −X
 * (north), so a car in it has the lot on its right and turns right into the
 * driveway. The FAR lane runs toward +X and is used for pass-through traffic only.
 */
import * as THREE from "three";
import { box } from "./kit.js";
import { COLORS } from "./colors.js";

export const STREET = {
  sidewalkZ: 6.15,
  sidewalkW: 0.9,
  curbZ: 6.72,
  nearLaneZ: 7.5,
  farLaneZ: 9.4,
  edgeZ: 10.5,
  xMin: -24,
  xMax: 16,
};

/** Inner (property-side) edge of the sidewalk. The lot is seated flush to this. */
export const SIDEWALK_INNER_Z = STREET.sidewalkZ - STREET.sidewalkW / 2;

/**
 * Where 7th Ave starts to bend, and by how much.
 *
 * Real 7th Ave curves a little south of the building. `BEND_START` sits just south of
 * the property's south edge (x ≈ 3.68) so the frontage stays dead straight — a curve
 * running past the lot would leave the sidewalk non-parallel to the property line,
 * which is the thing that looks wrong. South is +X.
 */
const BEND_START = 4.2;
const BEND_AMOUNT = 3.1;

/**
 * Z offset of the road centreline at a given X. Zero along the frontage, then eased
 * in quadratically so there is no kink where the curve begins. Positive = away from
 * the building, which is the only safe direction; bending the other way would run the
 * asphalt through the property.
 */
export function bendZ(x) {
  if (x <= BEND_START) return 0;
  const k = (x - BEND_START) / (STREET.xMax - BEND_START);
  return BEND_AMOUNT * k * k;
}

/** Center of a travel lane. `dir` −1 = northbound (near), +1 = southbound (far). */
export function lanePoint(x, dir = -1) {
  return new THREE.Vector3(
    x,
    0.02,
    (dir < 0 ? STREET.nearLaneZ : STREET.farLaneZ) + bendZ(x)
  );
}

/** Point on the sidewalk in front of the lot. */
export function sidewalkPoint(x) {
  return new THREE.Vector3(x, 0.02, STREET.sidewalkZ + bendZ(x));
}

/** Straight polyline along the road between two X positions. */
export function roadPolyline(x0, x1, dir = -1, step = 1.4) {
  const dist = Math.abs(x1 - x0);
  if (dist < 1e-4) return [lanePoint(x0, dir)];
  const n = Math.max(1, Math.ceil(dist / step));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    pts.push(lanePoint(x0 + ((x1 - x0) * i) / n, dir));
  }
  return pts;
}

/** Straight polyline along the sidewalk between two X positions. */
export function sidewalkPolyline(x0, x1, step = 1.0) {
  const dist = Math.abs(x1 - x0);
  if (dist < 1e-4) return [sidewalkPoint(x0)];
  const n = Math.max(1, Math.ceil(dist / step));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    pts.push(sidewalkPoint(x0 + ((x1 - x0) * i) / n));
  }
  return pts;
}

/**
 * Build the road, curb, sidewalk and lane markings.
 *
 * The straight run past the property is single long boxes; only the curved section
 * south of `BEND_START` is chopped into segments that step and yaw along the bend.
 * Doing the whole length as segments would have cost ~100 extra draw calls for
 * backdrop, and draw calls are already this project's bottleneck.
 */
export function createStreet() {
  const g = new THREE.Group();
  g.name = "street";

  const SEG = 1.3; // curved-section segment length
  const curbD = 0.22;
  const roadD = STREET.edgeZ - STREET.curbZ - curbD * 0.5;
  const roadCz = STREET.curbZ + curbD * 0.5 + roadD * 0.5;
  const centerZ = (STREET.nearLaneZ + STREET.farLaneZ) * 0.5;

  /** One cross-section of the street at x, offset by the bend and yawed to match. */
  const slab = (x, len, yaw) => {
    const dz = bendZ(x);
    const add = (w, h, d, colour, z, y, opts = {}) => {
      const m = box(w, h, d, colour, { castShadow: false, ...opts });
      m.position.set(x, y, z + dz);
      m.rotation.y = yaw;
      g.add(m);
      return m;
    };
    add(len, 0.07, STREET.sidewalkW, 0xa8a49c, STREET.sidewalkZ, 0.035, {
      receiveShadow: true,
    });
    add(len, 0.14, curbD, 0xbdb9b0, STREET.curbZ, 0.07);
    add(len, 0.06, roadD, COLORS.asphalt, roadCz, 0.03, { receiveShadow: true });
    // Double yellow centre line
    for (const off of [-0.09, 0.09]) {
      add(len, 0.02, 0.08, 0xc8a83c, centerZ + off, 0.065);
    }
  };

  // Straight frontage: one slab from the north end to where the curve starts
  const straightLen = BEND_START - STREET.xMin;
  slab(STREET.xMin + straightLen / 2, straightLen, 0);

  // Curved section, stepped and yawed to follow the tangent
  for (let x = BEND_START; x < STREET.xMax; x += SEG) {
    const len = Math.min(SEG, STREET.xMax - x);
    const mid = x + len / 2;
    // Slight overlap hides the wedge gaps between yawed segments
    const yaw = -Math.atan2(bendZ(mid + 0.5) - bendZ(mid - 0.5), 1);
    slab(mid, len * 1.06, yaw);
  }

  // Dashed lane edge stripes, sampled along the bend
  for (const baseZ of [STREET.curbZ + 0.42, STREET.edgeZ - 0.3]) {
    const dashLen = 1.6;
    const gap = 1.5;
    for (let x = STREET.xMin + 0.8; x < STREET.xMax - dashLen; x += dashLen + gap) {
      const mid = x + dashLen / 2;
      const dash = box(dashLen, 0.02, 0.07, 0xd8d4cc, { castShadow: false });
      dash.position.set(mid, 0.062, baseZ + bendZ(mid));
      dash.rotation.y = -Math.atan2(bendZ(mid + 0.5) - bendZ(mid - 0.5), 1);
      g.add(dash);
    }
  }

  return g;
}
