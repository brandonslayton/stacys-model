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

/** Property pad's west edge sits at z ≈ 5.88; everything here is beyond it. */
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

/** Center of a travel lane. `dir` −1 = northbound (near), +1 = southbound (far). */
export function lanePoint(x, dir = -1) {
  return new THREE.Vector3(
    x,
    0.02,
    dir < 0 ? STREET.nearLaneZ : STREET.farLaneZ
  );
}

/** Point on the sidewalk in front of the lot. */
export function sidewalkPoint(x) {
  return new THREE.Vector3(x, 0.02, STREET.sidewalkZ);
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
 * Build the road, curb, sidewalk and lane markings as a group.
 * Flat, unshadowed, and merged where possible — this is backdrop, not subject.
 */
export function createStreet() {
  const g = new THREE.Group();
  g.name = "street";
  const len = STREET.xMax - STREET.xMin;
  const cx = (STREET.xMin + STREET.xMax) * 0.5;

  // Sidewalk
  const sw = box(len, 0.07, STREET.sidewalkW, 0xa8a49c, {
    castShadow: false,
    receiveShadow: true,
  });
  sw.position.set(cx, 0.035, STREET.sidewalkZ);
  g.add(sw);

  // Curb face
  const curbD = 0.22;
  const curb = box(len, 0.14, curbD, 0xbdb9b0, { castShadow: false });
  curb.position.set(cx, 0.07, STREET.curbZ);
  g.add(curb);

  // Asphalt
  const roadD = STREET.edgeZ - STREET.curbZ - curbD * 0.5;
  const road = box(len, 0.06, roadD, COLORS.asphalt, {
    castShadow: false,
    receiveShadow: true,
  });
  road.position.set(cx, 0.03, STREET.curbZ + curbD * 0.5 + roadD * 0.5);
  g.add(road);

  // Double yellow center line
  const centerZ = (STREET.nearLaneZ + STREET.farLaneZ) * 0.5;
  for (const off of [-0.09, 0.09]) {
    const line = box(len, 0.02, 0.08, 0xc8a83c, { castShadow: false });
    line.position.set(cx, 0.065, centerZ + off);
    g.add(line);
  }

  // Dashed white edge stripes, one per lane, toward the outside of the road
  for (const z of [STREET.curbZ + 0.42, STREET.edgeZ - 0.3]) {
    const dashLen = 1.6;
    const gap = 1.5;
    for (let x = STREET.xMin + 0.8; x < STREET.xMax - dashLen; x += dashLen + gap) {
      const dash = box(dashLen, 0.02, 0.07, 0xd8d4cc, { castShadow: false });
      dash.position.set(x + dashLen * 0.5, 0.062, z);
      g.add(dash);
    }
  }

  return g;
}
