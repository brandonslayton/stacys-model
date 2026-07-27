/**
 * Cars and pedestrians.
 *
 * createCar / createPedestrian / addCarWheels are copied verbatim from the
 * parent game's builders.js, and the color lists from its config.js COLORS.
 * They live in their own module rather than kit.js because kit.js is the
 * read-only dependency closure of createStacys and these are not part of it.
 */
import * as THREE from "three";
import { box, cyl } from "./kit.js";

/** COLORS.car from the game's config.js. */
export const CAR_COLORS = [
  0xe85d5d, 0x5d8fe8, 0xf0c14d, 0xffffff, 0x3dd68c, 0x9b6dff,
];

/** COLORS.ped from the game's config.js. */
export const PED_COLORS = [0xffb6c1, 0x7ec8e3, 0xc5a3ff, 0xffd580, 0x98d8aa];

function addCarWheels(g, positions, radius = 0.18, width = 0.15) {
  for (const [wx, wz] of positions) {
    const wheel = cyl(radius, radius, width, 0x1a1a1a, {}, 8);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, radius, wz);
    g.add(wheel);
  }
}

export function createCar(color) {
  const g = new THREE.Group();
  g.name = "car";
  const body = box(1.1, 0.35, 2.0, color);
  body.position.y = 0.4;
  g.add(body);
  const cabin = box(0.9, 0.3, 1.0, 0x88b8d0, {
    roughness: 0.3,
    emissive: 0x224455,
    emissiveIntensity: 0.1,
  });
  cabin.position.set(0, 0.7, 0.2);
  g.add(cabin);
  addCarWheels(g, [
    [-0.45, 0.55],
    [0.45, 0.55],
    [-0.45, -0.55],
    [0.45, -0.55],
  ]);
  return g;
}

export function createPedestrian(color) {
  const g = new THREE.Group();
  const body = cyl(0.12, 0.15, 0.55, color, {}, 5);
  body.position.y = 0.55;
  g.add(body);
  const head = cyl(0.12, 0.12, 0.22, 0xe8c4a8, {}, 5);
  head.position.y = 0.95;
  g.add(head);
  return g;
}
