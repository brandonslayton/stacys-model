/**
 * stacys.js — Stacy's @ Melrose, 4343 N 7th Ave.
 *
 * THIS IS THE FILE UNDER ACTIVE DEVELOPMENT. Starting point is a verbatim copy
 * of createStacys from Melrose Rising, so any improvement here can be pasted
 * straight back into js/builders.js.
 *
 * Orientation (local space, matches the parent game's east-side parcels):
 *   +Z = west, toward 7th Avenue (the street face)
 *   -Z = east, the rear patio
 *   -X = north, the parking lot + mural gable
 *   +X = south
 *
 * Reference photos in ../refs/:
 *   IMG_0628  street face from 7th: porch, purple sign, slat screen, shoe
 *   IMG_0632  mural gable + parking, from the northwest
 *   IMG_0633  mural gable head-on, north entry bay at right
 *   IMG_0634  street face, closer on the porch
 *   Screenshot-2026-07-25-roof  near-elevation: roof step-down + scooter row
 */
import * as THREE from "three";
import { COLORS } from "./colors.js";
import {
  mat,
  box,
  cyl,
  neonBox,
  trackNightMat,
  trackNightMesh,
  installVenueNight,
  addPatioStringLights,
  createShadeTree,
  addPick,
  addParkingStalls,
  canvasTexture,
  roundRect,
  shadeHex,
  addHangingPrideFlag,
  createDumpster,
} from "./kit.js";

/**
 * Stacy's sign type — matches Melrose Rising brand:
 * Outfit (display) + DM Sans (UI), bold geometric, not thin script.
 */
export const STACYS_DISPLAY = "Outfit, 'DM Sans', 'Segoe UI', system-ui, sans-serif";

export const STACYS_UI = "'DM Sans', Outfit, 'Segoe UI', system-ui, sans-serif";

// Block module, in world units. Roughly 15 courses up the 2.85-high wall and a
// 2:1 block, which is what the photos read as at the game camera.
export const CMU_COURSE_H = 0.19;
export const CMU_BLOCK_W = 0.38;

/**
 * Running-bond CMU block texture — painted concrete block with recessed mortar.
 *
 * One tile is 4 blocks x 4 courses so the per-block value jitter does not
 * obviously repeat across a wall. Alternate courses are offset half a block.
 * Deterministic jitter (golden-ratio walk, same trick the gravel scatter uses)
 * so the wall is identical on every reload.
 */
export function makeCmuBlockTexture(faceHex, mortarHex, liteHex) {
  const COLS = 4;
  const ROWS = 4;
  const BW = 128; // px per block length
  const BH = 64; // px per course
  const c = document.createElement("canvas");
  c.width = COLS * BW;
  c.height = ROWS * BH;
  const ctx = c.getContext("2d");

  // kit.shadeHex takes a CSS hex string and returns an rgb() string
  const css = (n) => `#${n.toString(16).padStart(6, "0")}`;
  const faceCss = css(faceHex);
  const mortarCss = css(mortarHex);
  const liteCss = css(liteHex);

  ctx.fillStyle = mortarCss;
  ctx.fillRect(0, 0, c.width, c.height);

  const joint = 3; // recessed mortar joint, px
  let k = 0;
  for (let r = 0; r < ROWS; r++) {
    // Running bond: every other course shifts half a block
    const shift = r % 2 ? BW * 0.5 : 0;
    // Draw one extra block each side so the shifted course wraps seamlessly
    for (let col = -1; col <= COLS; col++) {
      const x = col * BW + shift;
      const y = r * BH;
      const u = (k++ * 0.6180339887) % 1;
      // Subtle painted-block value variation
      ctx.fillStyle = shadeHex(faceCss, 0.88 + u * 0.2);
      ctx.fillRect(x + joint, y + joint, BW - joint * 2, BH - joint * 2);
      // Top-lit sliver reads as the chamfered top edge of each block
      ctx.fillStyle = shadeHex(liteCss, 0.95 + u * 0.1);
      ctx.fillRect(x + joint, y + joint, BW - joint * 2, Math.max(2, joint));
      // Shadow under the block
      ctx.fillStyle = shadeHex(mortarCss, 0.86);
      ctx.fillRect(x + joint, y + BH - joint * 2, BW - joint * 2, joint);
    }
  }

  const tex = canvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * Carved Mexican-style double entry door — the porch centerpiece.
 *
 * IMG_0628 shows each leaf carved with a big X/starburst of radiating slats
 * inside a border of vertical slats, a round boss at each X center, and a
 * barley-twist turned mullion between the leaves. This is the most recognizable
 * piece of joinery on the building and it was a single flat box before.
 *
 * `x` / `z` = door center on the wall, `baseY` = deck height it stands on.
 */
export function addCarvedDoubleDoor(g, x, z, totalW, totalH, baseY = 0) {
  const dark = 0x2b1c12;
  const mid = 0x422b1c;
  const carveHi = 0x6d4a2e; // warm lit edge of the carving

  // Recessed opening behind the leaves, so gaps read as interior darkness
  const jamb = box(totalW + 0.16, totalH + 0.14, 0.08, dark, { roughness: 0.92 });
  jamb.position.set(x, baseY + (totalH + 0.14) / 2, z - 0.03);
  g.add(jamb);
  const voidBox = box(totalW, totalH, 0.06, 0x0d0a07, { roughness: 0.98 });
  voidBox.position.set(x, baseY + totalH / 2, z + 0.005);
  g.add(voidBox);

  // Surrounding frame
  for (const [fx, fw, fh] of [
    [-(totalW / 2 + 0.07), 0.13, totalH + 0.14],
    [totalW / 2 + 0.07, 0.13, totalH + 0.14],
  ]) {
    const post = box(fw, fh, 0.13, mid, { roughness: 0.88 });
    post.position.set(x + fx, baseY + fh / 2, z + 0.04);
    g.add(post);
  }
  const lintel = box(totalW + 0.3, 0.15, 0.15, mid, { roughness: 0.88 });
  lintel.position.set(x, baseY + totalH + 0.11, z + 0.04);
  g.add(lintel);

  const leafW = totalW / 2 - 0.03;

  /** One carved leaf: slat border + radiating X + center boss. */
  const addLeaf = (cx, flip) => {
    // Leaf slab
    const slab = box(leafW, totalH, 0.06, mid, { roughness: 0.9 });
    slab.position.set(cx, baseY + totalH / 2, z + 0.055);
    g.add(slab);

    // Vertical slat border, top and bottom bands
    const bandH = totalH * 0.14;
    for (const by of [baseY + bandH * 0.6, baseY + totalH - bandH * 0.6]) {
      const nSlat = 9;
      for (let i = 0; i < nSlat; i++) {
        const sx = cx - leafW / 2 + (i + 0.5) * (leafW / nSlat);
        const sl = box((leafW / nSlat) * 0.62, bandH, 0.035, i % 2 ? carveHi : dark, {
          roughness: 0.88,
          castShadow: false,
        });
        sl.position.set(sx, by, z + 0.088);
        g.add(sl);
      }
    }

    // Central field with the radiating X
    const fieldY = baseY + totalH / 2;
    const fieldH = totalH * 0.56;
    // Four diagonal arms out of the center
    for (const [sxg, syg] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const armLen = Math.hypot(leafW * 0.42, fieldH * 0.42);
      const arm = box(armLen, 0.055, 0.03, carveHi, {
        roughness: 0.87,
        castShadow: false,
      });
      arm.position.set(cx + sxg * leafW * 0.2, fieldY + syg * fieldH * 0.2, z + 0.088);
      arm.rotation.z = Math.atan2(syg * fieldH * 0.42, sxg * leafW * 0.42);
      g.add(arm);
      // A shorter parallel rib beside each arm — reads as carved relief
      const rib = box(armLen * 0.62, 0.04, 0.028, dark, {
        roughness: 0.9,
        castShadow: false,
      });
      rib.position.set(
        cx + sxg * leafW * 0.24,
        fieldY + syg * fieldH * 0.14,
        z + 0.085
      );
      rib.rotation.z = Math.atan2(syg * fieldH * 0.42, sxg * leafW * 0.42);
      g.add(rib);
    }
    // Horizontal and vertical cross members through the field
    const hBar = box(leafW * 0.86, 0.055, 0.03, carveHi, {
      roughness: 0.87,
      castShadow: false,
    });
    hBar.position.set(cx, fieldY, z + 0.086);
    g.add(hBar);
    const vBar = box(0.055, fieldH * 0.9, 0.03, carveHi, {
      roughness: 0.87,
      castShadow: false,
    });
    vBar.position.set(cx, fieldY, z + 0.086);
    g.add(vBar);
    // Round boss at the X center
    const boss = cyl(0.075, 0.075, 0.045, carveHi, { roughness: 0.85 }, 8);
    boss.rotation.x = Math.PI / 2;
    boss.position.set(cx, fieldY, z + 0.105);
    g.add(boss);

    // Iron ring pull near the meeting stile
    const pull = cyl(0.05, 0.05, 0.022, 0x1d1a16, { metalness: 0.45, roughness: 0.5 }, 8);
    pull.rotation.x = Math.PI / 2;
    pull.position.set(cx + flip * (leafW / 2 - 0.13), baseY + totalH * 0.46, z + 0.11);
    g.add(pull);
  };

  addLeaf(x - totalW / 4 - 0.015, -1);
  addLeaf(x + totalW / 4 + 0.015, 1);

  // Barley-twist turned mullion between the leaves — stacked rotated blocks
  const twistSegs = 14;
  for (let i = 0; i < twistSegs; i++) {
    const seg = box(0.075, (totalH * 0.94) / twistSegs, 0.075, i % 2 ? carveHi : mid, {
      roughness: 0.86,
      castShadow: false,
    });
    seg.position.set(
      x,
      baseY + totalH * 0.03 + (i + 0.5) * ((totalH * 0.94) / twistSegs),
      z + 0.1
    );
    seg.rotation.y = i * 0.42;
    g.add(seg);
  }
}

/**
 * Decomposed-granite texture — dense fine reddish crushed rock.
 *
 * IMG_0628's front yard is a uniform field of small mauve-pink gravel. Modelling
 * that as ~85 individual pebble meshes read as tossed rubble and cost about a
 * hundred draw calls for a speckle; a tiling texture on one plate is both more
 * accurate and far cheaper. Deterministic, so the bed never reshuffles.
 */
export function makeGraniteTexture() {
  const S = 256;
  const c = document.createElement("canvas");
  c.width = S;
  c.height = S;
  const ctx = c.getContext("2d");

  ctx.fillStyle = "#9c7d78";
  ctx.fillRect(0, 0, S, S);

  const cols = [
    "#bb9c96", "#d0b1a9", "#8a6b67", "#ac8a83", "#c5a69d",
    "#77605d", "#dcc1b7", "#9a7d78", "#6d5754",
  ];
  // One fleck per path — batching thousands of arcs into a single fill produced
  // faint diagonal seam artifacts. Flecks are small enough that not wrapping
  // them across the tile edge is invisible at this repeat.
  // A golden-ratio pair for (u, v) lands points on lattice lines, which showed
  // up as faint vertical striations across the bed. A plain LCG decorrelates.
  let rs = 20260726;
  const rnd = () => ((rs = (rs * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 3400; i++) {
    const u = rnd();
    const v = rnd();
    const r = 2.2 + rnd() * 4.4;
    ctx.fillStyle = cols[i % cols.length];
    ctx.beginPath();
    ctx.arc(u * S, v * S, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = canvasTexture(c, 8);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * Sparse desert scrub — thin wispy stems you can see the ground through.
 * The photo's bushes are airy olive-grey, not the solid dark-green blobs the
 * shared kit's createDesertBush produces.
 */
export function addDesertScrub(g, x, z, scale = 1, baseY = 0, seed = 0) {
  let s = seed * 9301 + 49297;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const cols = [0x7e8a63, 0x6d7a55, 0x8e9871, 0x5f6b4a];
  const stems = 16;
  for (let i = 0; i < stems; i++) {
    const ang = rnd() * Math.PI * 2;
    const lean = 0.5 + rnd() * 0.7;
    const len = (0.1 + rnd() * 0.13) * scale;
    const stem = box(0.018 * scale, len, 0.018 * scale, cols[i % cols.length], {
      roughness: 0.95,
      castShadow: false,
    });
    stem.position.set(
      x + Math.cos(ang) * len * 0.55,
      baseY + len * 0.3,
      z + Math.sin(ang) * len * 0.55
    );
    // Splayed hard outward so the tuft is low and open, not a cone
    stem.rotation.z = Math.cos(ang) * lean * 1.15;
    stem.rotation.x = Math.sin(ang) * lean * 1.15;
    g.add(stem);
  }
  // Small dry mound at the base
  const mound = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.11 * scale, 0),
    mat(0x7a6a58, { roughness: 0.97 })
  );
  mound.position.set(x, baseY + 0.03 * scale, z);
  mound.scale.set(1.3, 0.45, 1.3);
  mound.castShadow = false;
  g.add(mound);
}

/**
 * Ghost-gum eucalyptus — pale multi-trunk desert tree.
 *
 * Two things this fixes versus the generic shade tree it replaces:
 *  - bark is near-white with grey/olive shed patches, the actual species in
 *    front of Stacy's, instead of a dark brown trunk
 *  - canopy blobs are anchored ON the trunk tips. The old tree scattered ~40
 *    loose leaf quads around the hull, which read as floating debris at the
 *    game camera rather than foliage.
 *
 * Deterministic from `seed`, so the tree is identical on every reload.
 */
export function createGumTree(x = 0, z = 0, scale = 1, seed = 0) {
  const g = new THREE.Group();
  g.name = "gumTree";

  // Cheap deterministic PRNG so repeated calls with the same seed match
  let s = seed * 9301 + 49297;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };

  // Bark: pale but not chalk-white, or it blows out against the olive block
  const barkPale = 0xbcb5a3;
  const barkMid = 0xaea695;
  const barkShed = 0x7d7466;
  const leafDark = 0x51704f;
  const leafMid = 0x648759;
  const leafHi = 0x7c9e6c;

  // Low root swell. A single wide cylinder here read as a concrete lamp footing,
  // so this is short and only slightly proud of the trunks; each trunk then gets
  // its own flare at the bottom.
  const swell = cyl(0.13 * scale, 0.18 * scale, 0.1 * scale, barkMid, { roughness: 0.9 }, 7);
  swell.position.y = 0.05 * scale;
  g.add(swell);

  // Explicit trunk tops rather than a per-segment lean. The lean approach put
  // all three tops within ~0.3 units of each other, so the canopies merged into
  // one lollipop; stating the top offset guarantees a spread silhouette.
  // Tops lean mostly toward +Z (out to the street) rather than +X, so the
  // trunks do not cross the porch entry.
  const trunks = [
    { top: [-0.9, 0.45], h: 3.4, r: 0.10 },
    { top: [0.2, 0.95], h: 4.15, r: 0.12 },
    { top: [-0.5, -0.5], h: 2.95, r: 0.082 },
  ];

  const UP = new THREE.Vector3(0, 1, 0);
  for (let t = 0; t < trunks.length; t++) {
    const tr = trunks[t];
    const topV = new THREE.Vector3(
      tr.top[0] * scale,
      tr.h * scale,
      tr.top[1] * scale
    );
    const baseY = 0.3 * scale;
    const len = topV.length();
    const dir = topV.clone().normalize();
    // One orientation for the whole trunk, so segments never disjoint
    const quat = new THREE.Quaternion().setFromUnitVectors(UP, dir);

    // Root flare: a short wider stub where this trunk leaves the swell
    const flare = cyl(tr.r * scale * 1.02, tr.r * scale * 1.32, 0.18 * scale, barkPale, {
      roughness: 0.89,
    }, 7);
    flare.position.set(topV.x * 0.02, 0.16 * scale, topV.z * 0.02);
    g.add(flare);

    const segs = 6;
    const segLen = len / segs;
    for (let i = 0; i < segs; i++) {
      const taper = 1 - i * 0.12;
      const seg = cyl(
        tr.r * scale * taper * 0.84,
        tr.r * scale * taper,
        segLen * 1.05,
        i % 2 ? barkPale : barkMid,
        { roughness: 0.88 },
        6
      );
      const along = dir.clone().multiplyScalar((i + 0.5) * segLen);
      seg.position.set(along.x, baseY + along.y, along.z);
      seg.quaternion.copy(quat);
      g.add(seg);

      // Shed-bark patch — the mottled look gum trees have
      if (i > 1 && rnd() > 0.55) {
        const patch = box(
          tr.r * scale * 0.95,
          segLen * (0.2 + rnd() * 0.2),
          tr.r * scale * 0.35,
          barkShed,
          { roughness: 0.92, castShadow: false }
        );
        patch.position.set(
          along.x + tr.r * scale * 0.55,
          baseY + along.y,
          along.z + tr.r * scale * 0.55
        );
        patch.quaternion.copy(quat);
        g.add(patch);
      }
    }

    const tipX = topV.x;
    const tipY = baseY + topV.y;
    const tipZ = topV.z;

    // Canopy: one cluster per trunk, blobs spread horizontally so the mass is
    // wide (gums are broad, not round) but each blob still overlaps its
    // neighbour. Flat-shaded icosahedron hulls — no loose leaf quads.
    // Six smaller blobs instead of three large ones — the big icosahedra read as
    // a single faceted broccoli head; more, varied ones give an airier gum
    // silhouette while still overlapping into one mass.
    const NB = 6;
    for (let b = 0; b < NB; b++) {
      const r = (0.3 + rnd() * 0.22) * scale * (t === 1 ? 1.2 : 0.95);
      const ang = (b / NB) * Math.PI * 2 + t * 1.1;
      const spread = r * (0.9 + rnd() * 0.7);
      const blob = new THREE.Mesh(
        new THREE.IcosahedronGeometry(r, 0),
        mat([leafDark, leafMid, leafHi][(t + b) % 3], {
          roughness: 0.92,
          metalness: 0.01,
        })
      );
      blob.position.set(
        tipX + Math.cos(ang) * spread,
        tipY + r * 0.15 + (rnd() - 0.5) * r * 0.7,
        tipZ + Math.sin(ang) * spread
      );
      blob.scale.set(1.2, 0.6, 1.2); // flattened + widened
      blob.rotation.set(rnd() * 0.5, rnd(), rnd() * 0.5);
      blob.castShadow = true;
      g.add(blob);
    }

    // Bare upper branches poking out of the canopy, angled off the trunk tip
    for (let bch = 0; bch < 4; bch++) {
      const bl = (0.3 + rnd() * 0.34) * scale;
      const ang = rnd() * Math.PI * 2;
      const tilt = 0.7 + rnd() * 0.4;
      const bdir = new THREE.Vector3(
        Math.cos(ang) * Math.sin(tilt),
        Math.cos(tilt),
        Math.sin(ang) * Math.sin(tilt)
      ).normalize();
      const branch = cyl(0.013 * scale, 0.028 * scale, bl, barkPale, { roughness: 0.88 }, 5);
      const mid = bdir.clone().multiplyScalar(bl * 0.5);
      branch.position.set(tipX + mid.x, tipY - r0(scale) + mid.y, tipZ + mid.z);
      branch.quaternion.setFromUnitVectors(UP, bdir);
      branch.castShadow = false;
      g.add(branch);
    }
  }

  g.position.set(x, 0, z);
  return g;
}

/** Small vertical nudge so branches emerge from inside the canopy mass. */
function r0(scale) {
  return 0.15 * scale;
}

/**
 * Diamond "Stacy's @ Melrose" logo face (Vegas-style marquee).
 * Wide rhombus (broader than tall); big wordmark; transparent corners.
 */
export function makeStacysDiamondLogoTexture() {
  // Wider canvas so a flat diamond maps cleanly without letterbox stretch
  const w = 1280;
  const h = 900;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;
  // Half-diagonals: horizontal > vertical → wide diamond
  const halfX = w * 0.46;
  const halfY = h * 0.42;

  const drawDiamond = (sx, sy, fill, stroke, lineW) => {
    ctx.beginPath();
    ctx.moveTo(cx, cy - halfY * sy);
    ctx.lineTo(cx + halfX * sx, cy);
    ctx.lineTo(cx, cy + halfY * sy);
    ctx.lineTo(cx - halfX * sx, cy);
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineW;
      ctx.lineJoin = "round";
      ctx.stroke();
    }
  };

  // Single clean rim (no stacked neon clutter)
  const face = ctx.createLinearGradient(cx, cy - halfY, cx, cy + halfY);
  face.addColorStop(0, "#2e1c48");
  face.addColorStop(0.5, "#1a1028");
  face.addColorStop(1, "#120a1c");
  drawDiamond(1, 1, face, null, 0);
  drawDiamond(0.97, 0.96, null, "#ff5c8a", 16);
  drawDiamond(0.9, 0.88, null, "rgba(240,236,248,0.85)", 5);

  // Wordmark — fill most of the wide diamond band
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const main = "Stacy's";
  // Horizontal chord of diamond at y-offset ≈ halfX * (1 - |dy|/halfY)
  let mainSize = 280;
  ctx.font = `800 ${mainSize}px ${STACYS_DISPLAY}`;
  const maxW = halfX * 1.55;
  let tw = ctx.measureText(main).width;
  if (tw > maxW) {
    mainSize = Math.floor(mainSize * (maxW / tw));
    ctx.font = `800 ${mainSize}px ${STACYS_DISPLAY}`;
    tw = ctx.measureText(main).width;
  }
  const mainY = cy - mainSize * 0.06;
  // Neon white wordmark with pink halo (emissiveMap reads as tube glow at night)
  ctx.shadowColor = "#ff4d9a";
  ctx.shadowBlur = 40;
  ctx.fillStyle = "#ff8ab8";
  ctx.fillText(main, cx, mainY);
  ctx.shadowBlur = 18;
  ctx.fillStyle = "#ffe8f4";
  ctx.fillText(main, cx, mainY);
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(main, cx, mainY);

  // Neon pink rule
  const ruleW = Math.min(tw * 0.58, halfX * 0.85);
  ctx.shadowColor = "#ff5c8a";
  ctx.shadowBlur = 18;
  ctx.fillStyle = "#ff5c8a";
  ctx.fillRect(cx - ruleW / 2, mainY + mainSize * 0.38, ruleW, 7);
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#ffc0d8";
  ctx.fillRect(cx - ruleW / 2, mainY + mainSize * 0.38 + 1, ruleW, 3);

  // Subtitle with soft neon
  ctx.shadowColor = "#c8a0ff";
  ctx.shadowBlur = 16;
  ctx.fillStyle = "#f4ecff";
  ctx.font = `700 56px ${STACYS_UI}`;
  ctx.letterSpacing = "0.2em";
  ctx.fillText("@ MELROSE", cx, mainY + mainSize * 0.58);
  ctx.letterSpacing = "0px";
  ctx.shadowBlur = 0;

  return canvasTexture(canvas, 8);
}

/**
 * Freestanding Vegas-style diamond pole sign (Stacy's logo).
 * Wide diamond (broader than tall), double-faced for N–S read.
 */
export function createStacysDiamondPoleSign(x = 0, z = 0) {
  const g = new THREE.Group();
  const purple = 0x5a3a7a;
  const pink = COLORS.neonPink;
  const steel = 0x6a7078;

  // Concrete base pad
  const base = box(0.85, 0.18, 0.85, 0x8a8480, { roughness: 0.92 });
  base.position.y = 0.09;
  g.add(base);
  const baseCap = box(0.55, 0.1, 0.55, 0x6a6660, { roughness: 0.88 });
  baseCap.position.y = 0.2;
  g.add(baseCap);

  // Steel pole — smooth round tube (no low-poly ridges)
  const poleH = 3.6;
  const pole = cyl(0.07, 0.09, poleH, steel, { metalness: 0.4, roughness: 0.45 }, 20);
  pole.material.flatShading = false;
  pole.material.needsUpdate = true;
  pole.position.y = 0.22 + poleH / 2;
  g.add(pole);
  // Pole collar rings (also smooth)
  for (const y of [1.1, 2.0, 2.85]) {
    const ring = cyl(0.1, 0.1, 0.08, 0x4a5058, { metalness: 0.35, roughness: 0.5 }, 20);
    ring.material.flatShading = false;
    ring.material.needsUpdate = true;
    ring.position.y = y;
    g.add(ring);
  }

  // Wide diamond: horizontal diagonal > vertical
  const diamondY = 4.15;
  const faceW = 2.55; // full width tip-to-tip
  const faceH = 1.75; // full height tip-to-tip
  const depth = 0.2;
  const logoMap = makeStacysDiamondLogoTexture();

  // Build square diamond, then parent-scale so world axes stay wide×short
  const body = new THREE.Group();
  body.position.y = diamondY;
  // Side of square whose diagonal equals min(faceW, faceH) before stretch
  const baseDiag = Math.min(faceW, faceH);
  const side = baseDiag / Math.SQRT2;
  const stretchX = faceW / baseDiag;
  const stretchY = faceH / baseDiag;

  const cabinet = box(side * 0.92, side * 0.92, depth, 0x1a1020, {
    roughness: 0.55,
    metalness: 0.15,
    emissive: purple,
    emissiveIntensity: 0.12,
  });
  cabinet.rotation.z = Math.PI / 4;
  body.add(cabinet);

  // Hot pink neon edge tube
  const edge = neonBox(side * 1.0, side * 1.0, 0.07, pink, 0.85);
  edge.rotation.z = Math.PI / 4;
  body.add(edge);

  body.scale.set(stretchX, stretchY, 1);
  g.add(body);

  // Logo faces — bright white neon wordmark via emissiveMap (white × map)
  for (const sideFace of [1, -1]) {
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(faceW * 1.08, faceH * 1.08),
      new THREE.MeshStandardMaterial({
        map: logoMap,
        transparent: true,
        roughness: 0.28,
        metalness: 0.05,
        flatShading: false,
        emissive: 0xffffff,
        emissiveIntensity: 0.02,
        emissiveMap: logoMap,
        side: THREE.FrontSide,
      })
    );
    face.position.set(0, diamondY, sideFace * (depth * 0.55 + 0.02));
    if (sideFace < 0) face.rotation.y = Math.PI;
    face.castShadow = false;
    face.name = "stacysDiamondFace";
    g.add(face);
  }

  // Support arms
  for (const s of [-1, 1]) {
    const arm = box(0.08, 0.08, 0.45, steel, { metalness: 0.35, roughness: 0.5 });
    arm.position.set(s * 0.18, diamondY - 0.55, 0);
    arm.rotation.z = s * 0.35;
    g.add(arm);
  }

  // Point bulbs at the four diamond tips (brighter neon tips)
  for (const [ox, oy] of [
    [0, faceH * 0.5],
    [0, -faceH * 0.5],
    [faceW * 0.5, 0],
    [-faceW * 0.5, 0],
  ]) {
    const bulb = cyl(0.06, 0.06, 0.08, 0xffe8a0, {
      emissive: 0xffd060,
      emissiveIntensity: 0.9,
    }, 6);
    bulb.position.set(ox, diamondY + oy, 0);
    bulb.name = "stacysDiamondBulb";
    g.add(bulb);
  }

  g.position.set(x, 0, z);
  return g;
}

/**
 * Purple wall sign — neon "Stacy's" + "@ MELROSE" (glows via emissiveMap at night).
 */
export function makeStacysSignTexture() {
  const w = 1280;
  const h = 400;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");

  // Deep purple cabinet face
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#4a2a72");
  bg.addColorStop(0.5, "#3a1e58");
  bg.addColorStop(1, "#2a1448");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Hot pink neon border
  ctx.strokeStyle = "#ff5c8a";
  ctx.lineWidth = 14;
  ctx.shadowColor = "#ff5c8a";
  ctx.shadowBlur = 28;
  roundRect(ctx, 18, 16, w - 36, h - 32, 14);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 4;
  roundRect(ctx, 28, 24, w - 56, h - 48, 10);
  ctx.stroke();

  // Main wordmark — neon white with pink halo
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let mainSize = 270;
  ctx.font = `800 ${mainSize}px ${STACYS_DISPLAY}`;
  let tw = ctx.measureText("Stacy's").width;
  if (tw > w * 0.9) {
    mainSize = Math.floor(mainSize * ((w * 0.9) / tw));
    ctx.font = `800 ${mainSize}px ${STACYS_DISPLAY}`;
    tw = ctx.measureText("Stacy's").width;
  }
  const mx = w / 2;
  const my = h * 0.4;
  // Pink outer glow (reads as neon tube when emissive)
  ctx.shadowColor = "#ff4d9a";
  ctx.shadowBlur = 36;
  ctx.fillStyle = "#ff8ab8";
  ctx.fillText("Stacy's", mx, my);
  ctx.shadowBlur = 18;
  ctx.fillStyle = "#ffe0f0";
  ctx.fillText("Stacy's", mx, my);
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#ffffff";
  ctx.fillText("Stacy's", mx, my);

  // Neon pink rule
  const underW = Math.min(w * 0.45, tw * 0.55);
  ctx.shadowColor = "#ff5c8a";
  ctx.shadowBlur = 16;
  ctx.fillStyle = "#ff5c8a";
  ctx.fillRect(mx - underW / 2, my + mainSize * 0.34, underW, 7);
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#ffb0d0";
  ctx.fillRect(mx - underW / 2, my + mainSize * 0.34 + 1, underW, 3);

  // Subtitle with soft neon
  ctx.shadowColor = "#c8a0ff";
  ctx.shadowBlur = 14;
  ctx.fillStyle = "#f0e4ff";
  ctx.font = `700 50px ${STACYS_UI}`;
  ctx.letterSpacing = "0.22em";
  ctx.fillText("@ MELROSE", w / 2, h * 0.82);
  ctx.letterSpacing = "0px";
  ctx.shadowBlur = 0;

  return canvasTexture(canvas, 8);
}

/**
 * Painted rainbow angel-wings mural (Stacy's photo wall).
 * Photo-matched: desert sunset, layered rainbow feathers, diamond logo,
 * sun rays, saguaros, brick texture.
 */
export function makeStacysWingsMuralTexture() {
  // Aspect matches how addStacysGableMural maps UVs: the texture spans the
  // gable's full bounding box, baseW (d * 0.99) by peakY.
  const W = 1520;
  const H = 1256;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");

  // v = 0 at the wall base (canvas y = H), v = 1 at the gable peak (y = 0).
  // The eave sits near v 0.75, so above EAVE_Y the geometry narrows to the peak
  // and the top corners are clipped away — keep nothing important out there.
  const EAVE_Y = H * 0.25;
  const HORIZON_Y = H * 0.58; // gold band, brightest behind the wings
  const GROUND_Y = H * 0.78; // top of the desert floor
  const cx = W * 0.5;

  // ─── Sky ───────────────────────────────────────────────────────────────
  // Photo reads deep blue at the peak, through periwinkle and pale blue, into a
  // gold horizon band and then coral. The old version turned orange by 40% up.
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  sky.addColorStop(0.0, "#2c4a80");
  sky.addColorStop(0.16, "#3f629b");
  sky.addColorStop(0.32, "#6b85b8");
  sky.addColorStop(0.46, "#9fb2d2");
  sky.addColorStop(0.58, "#cfd0bd");
  sky.addColorStop(0.68, "#eccb84");
  sky.addColorStop(0.78, "#f2b673");
  sky.addColorStop(0.9, "#e8926d");
  sky.addColorStop(1.0, "#dc8f74");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, GROUND_Y + 2);

  // ─── Painted cumulus, upper wall only ──────────────────────────────────
  const cloud = (x, y, rx, ry, a) => {
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = "#f2f4f8";
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.ellipse(x - rx * 0.55, y + ry * 0.3, rx * 0.5, ry * 0.62, 0, 0, Math.PI * 2);
    ctx.ellipse(x + rx * 0.6, y + ry * 0.26, rx * 0.45, ry * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  cloud(cx + 60, H * 0.1, 150, 40, 0.72);
  cloud(cx - 130, H * 0.16, 110, 30, 0.5);
  cloud(cx + 250, H * 0.2, 130, 33, 0.42);
  cloud(cx - 300, H * 0.25, 95, 26, 0.3);

  // ─── Sunburst ──────────────────────────────────────────────────────────
  // Broad pale rays from BEHIND the wing junction, fanning up and out. The photo
  // has no sun disc at all — the old cartoon sun on the left was invented.
  const burstX = cx;
  const burstY = HORIZON_Y + H * 0.04;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 16; i++) {
    const t = i / 15;
    // Two fans sweeping up and OUT, not a full starburst — and they fade well
    // before the top of the wall so the deep blue peak stays clean.
    const spread = -Math.PI * 0.88 + t * Math.PI * 0.76;
    if (Math.abs(spread + Math.PI * 0.5) < 0.22) continue;
    const wRay = 0.010 + (i % 3) * 0.005;
    const len = H * (0.3 + ((i * 7) % 5) * 0.035);
    ctx.save();
    ctx.translate(burstX, burstY);
    ctx.rotate(spread);
    const gr = ctx.createLinearGradient(0, 0, len, 0);
    gr.addColorStop(0, "rgba(255,246,206,0.34)");
    gr.addColorStop(0.4, "rgba(255,236,170,0.13)");
    gr.addColorStop(1, "rgba(255,225,150,0)");
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.moveTo(0, -W * wRay * 0.25);
    ctx.lineTo(len, -W * wRay);
    ctx.lineTo(len, W * wRay);
    ctx.lineTo(0, W * wRay * 0.25);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  // Warm bloom right behind the wing junction
  const bloom = ctx.createRadialGradient(cx, burstY, 10, cx, burstY, W * 0.3);
  bloom.addColorStop(0, "rgba(255,250,225,0.85)");
  bloom.addColorStop(0.35, "rgba(255,232,170,0.4)");
  bloom.addColorStop(1, "rgba(255,215,140,0)");
  ctx.fillStyle = bloom;
  ctx.fillRect(0, HORIZON_Y - H * 0.2, W, H * 0.42);

  // ─── Purple mesas ──────────────────────────────────────────────────────
  // Small silhouettes in a band on the LEFT and RIGHT only. Previously these
  // were drawn so large and low that they merged into a purple floor across the
  // whole lower half — the reason the mural read muddy purple.
  const mesa = (pts, fill) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.lineTo(pts[pts.length - 1][0], GROUND_Y + 4);
    ctx.lineTo(pts[0][0], GROUND_Y + 4);
    ctx.closePath();
    ctx.fill();
  };
  const mTop = HORIZON_Y + H * 0.03;
  // far, lighter
  mesa(
    [[-20, mTop + 46], [W * 0.09, mTop + 6], [W * 0.17, mTop + 34], [W * 0.26, mTop + 14], [W * 0.34, mTop + 52]],
    "#8f7ab0"
  );
  mesa(
    [[W * 0.68, mTop + 48], [W * 0.76, mTop + 12], [W * 0.85, mTop + 34], [W * 0.93, mTop + 4], [W + 20, mTop + 44]],
    "#8f7ab0"
  );
  // near, deeper
  mesa(
    [[-20, mTop + 74], [W * 0.06, mTop + 40], [W * 0.13, mTop + 62], [W * 0.22, mTop + 44], [W * 0.3, mTop + 80]],
    "#6d5a95"
  );
  mesa(
    [[W * 0.71, mTop + 78], [W * 0.8, mTop + 44], [W * 0.88, mTop + 64], [W * 0.96, mTop + 40], [W + 20, mTop + 76]],
    "#6d5a95"
  );
  // Low red-brown butte directly behind the wing junction
  ctx.fillStyle = "#9c5f5a";
  ctx.beginPath();
  ctx.moveTo(cx - W * 0.11, GROUND_Y + 4);
  ctx.lineTo(cx - W * 0.06, HORIZON_Y + H * 0.1);
  ctx.lineTo(cx + W * 0.05, HORIZON_Y + H * 0.1);
  ctx.lineTo(cx + W * 0.1, GROUND_Y + 4);
  ctx.closePath();
  ctx.fill();

  // ─── Desert floor ──────────────────────────────────────────────────────
  const ground = ctx.createLinearGradient(0, GROUND_Y, 0, H);
  ground.addColorStop(0, "#e2b899");
  ground.addColorStop(0.4, "#d8a98c");
  ground.addColorStop(1, "#c4937b");
  ctx.fillStyle = ground;
  ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
  // Soft dune shading
  for (let i = 0; i < 5; i++) {
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = i % 2 ? "#a87f6a" : "#efcaa8";
    ctx.beginPath();
    ctx.ellipse(
      W * (0.1 + i * 0.2),
      GROUND_Y + H * (0.03 + (i % 3) * 0.035),
      W * 0.2,
      H * 0.035,
      0, 0, Math.PI * 2
    );
    ctx.fill();
    ctx.restore();
  }

  // ─── Boulders ──────────────────────────────────────────────────────────
  // Rounded sandstone forms along the ground, prominent in the photo.
  const boulder = (x, y, r, fill, shade) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.62, 0, Math.PI, Math.PI * 2);
    ctx.ellipse(x, y, r, r * 0.3, 0, 0, Math.PI);
    ctx.fill();
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.ellipse(x - r * 0.3, y - r * 0.16, r * 0.42, r * 0.24, -0.3, 0, Math.PI * 2);
    ctx.fill();
  };
  for (const [bx, by, br] of [
    [W * 0.07, GROUND_Y + 26, 62],
    [W * 0.17, GROUND_Y + 12, 44],
    [W * 0.26, GROUND_Y + 40, 52],
    [W * 0.74, GROUND_Y + 20, 50],
    [W * 0.84, GROUND_Y + 40, 66],
    [W * 0.93, GROUND_Y + 14, 40],
    [W * 0.45, GROUND_Y + 52, 34],
    [W * 0.58, GROUND_Y + 44, 30],
  ]) {
    boulder(bx, by, br, "#cfa384", "#e3bd9e");
  }
  // Pebble scatter
  for (let i = 0; i < 34; i++) {
    const u = (i * 0.6180339887) % 1;
    const v = (i * 0.3819660113 + 0.2) % 1;
    ctx.fillStyle = i % 3 ? "#b98d74" : "#e7c4a4";
    ctx.beginPath();
    ctx.ellipse(u * W, GROUND_Y + 14 + v * (H - GROUND_Y - 20), 9 + (i % 4) * 4, 5 + (i % 3) * 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ─── Saguaros ──────────────────────────────────────────────────────────
  // Muted sage green, standing ON the ground line, not floating on purple.
  const saguaro = (x, baseY, hgt, scale, fill, edge) => {
    const wid = 26 * scale;
    ctx.fillStyle = fill;
    const trunk = (bx, by, bh, bw) => {
      ctx.beginPath();
      ctx.moveTo(bx - bw / 2, by);
      ctx.lineTo(bx - bw / 2, by - bh + bw * 0.5);
      ctx.quadraticCurveTo(bx - bw / 2, by - bh, bx, by - bh);
      ctx.quadraticCurveTo(bx + bw / 2, by - bh, bx + bw / 2, by - bh + bw * 0.5);
      ctx.lineTo(bx + bw / 2, by);
      ctx.closePath();
      ctx.fill();
    };
    trunk(x, baseY, hgt, wid);
    // Two arms
    const arm = (dir, atY, alen) => {
      const aw = wid * 0.7;
      ctx.beginPath();
      ctx.moveTo(x + dir * wid * 0.4, atY);
      ctx.lineTo(x + dir * (wid * 0.4 + alen), atY);
      ctx.lineTo(x + dir * (wid * 0.4 + alen), atY - alen * 0.9);
      ctx.quadraticCurveTo(
        x + dir * (wid * 0.4 + alen + aw * 0.5), atY - alen * 0.9 - aw * 0.5,
        x + dir * (wid * 0.4 + alen + aw), atY - alen * 0.9
      );
      ctx.lineTo(x + dir * (wid * 0.4 + alen + aw), atY + aw * 0.55);
      ctx.lineTo(x + dir * wid * 0.4, atY + aw * 0.55);
      ctx.closePath();
      ctx.fill();
    };
    arm(-1, baseY - hgt * 0.55, wid * 0.5);
    arm(1, baseY - hgt * 0.42, wid * 0.6);
    // Ribs
    ctx.strokeStyle = edge;
    ctx.lineWidth = 2 * scale;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(x + i * wid * 0.28, baseY - 4);
      ctx.lineTo(x + i * wid * 0.28, baseY - hgt + wid * 0.5);
      ctx.stroke();
    }
  };
  saguaro(W * 0.045, GROUND_Y + 34, H * 0.3, 1.5, "#54804f", "#3f6a3c");
  saguaro(W * 0.135, GROUND_Y + 14, H * 0.19, 1.0, "#4d7749", "#3a633a");
  saguaro(W * 0.955, GROUND_Y + 30, H * 0.31, 1.55, "#54804f", "#3f6a3c");
  saguaro(W * 0.865, GROUND_Y + 44, H * 0.2, 1.05, "#4d7749", "#3a633a");

  // ─── Rose spars ────────────────────────────────────────────────────────
  // Long pink banners angling up and out from behind each shoulder. Drawn
  // BEFORE the wings so the wings overlap their base, and placed outboard so
  // they no longer cross the badge.
  const shoulderY = HORIZON_Y + H * 0.055;
  for (const dir of [-1, 1]) {
    ctx.save();
    ctx.translate(cx + dir * W * 0.16, shoulderY - H * 0.045);
    ctx.rotate(dir > 0 ? -0.92 : Math.PI + 0.92);
    const sl = H * 0.26;
    const sw = 24;
    const gr = ctx.createLinearGradient(0, 0, sl, 0);
    gr.addColorStop(0, "#a86274");
    gr.addColorStop(0.6, "#cb8792");
    gr.addColorStop(1, "#dca4a8");
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.moveTo(0, -sw * 0.5);
    ctx.lineTo(sl * 0.85, -sw * 0.6);
    ctx.lineTo(sl, -sw * 0.05);
    ctx.lineTo(sl * 0.88, sw * 0.55);
    ctx.lineTo(0, sw * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#8f5164";
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.fillStyle = "#c9838f";
    ctx.fillRect(sl * 0.84, -sw * 0.72, sw * 0.62, sw * 0.46);
    ctx.restore();
  }

  // ─── Wings ─────────────────────────────────────────────────────────────
  // Two parts, which is how the photo actually reads and how a real wing is
  // built: long pointed PRIMARIES fanning out below, and a smooth COVERT mass
  // over their roots carrying the pink-to-teal banding.
  //
  // Three earlier attempts failed here. Feathers hung downward off a leading
  // edge read as a moustache; spread wide they read as a spiky fan; and a single
  // clipped silhouette with a smooth trailing edge read as a rounded leaf. The
  // ragged, layered bottom edge is the thing that makes it a wing, so the
  // primaries have to be discrete geometry.

  /** Long feather with a rounded base and a pointed tip. */
  const primary = (x, y, ang, len, wid, rootCol, tipCol, edge) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    // Colour runs along the feather — mid blue at the root into deep indigo at
    // the tip, which is how the photo bands them. Flat-coloured feathers read as
    // glass shards.
    const gr = ctx.createLinearGradient(0, 0, len, 0);
    gr.addColorStop(0, rootCol);
    gr.addColorStop(0.55, tipCol);
    gr.addColorStop(1, tipCol);
    ctx.beginPath();
    ctx.moveTo(0, -wid * 0.5);
    ctx.quadraticCurveTo(len * 0.58, -wid * 0.46, len, 0);
    ctx.quadraticCurveTo(len * 0.58, wid * 0.46, 0, wid * 0.5);
    ctx.closePath();
    ctx.fillStyle = gr;
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(len * 0.06, 0);
    ctx.lineTo(len * 0.9, 0);
    ctx.strokeStyle = "rgba(255,255,255,0.13)";
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();
  };

  // [root, tip, edge] — variation across the fan is mild; the strong change is
  // along each feather's length.
  const PRIM_COLS = [
    ["#4f93c4", "#3b2f80", "rgba(30,24,70,0.5)"],
    ["#4a8cc2", "#3a2e7e", "rgba(30,24,70,0.5)"],
    ["#4884c0", "#3c327f", "rgba(30,24,70,0.5)"],
    ["#4a7cbd", "#3f3684", "rgba(32,26,72,0.5)"],
    ["#4b72b8", "#413a88", "rgba(32,26,72,0.5)"],
    ["#4d69b4", "#443d8d", "rgba(34,28,74,0.5)"],
    ["#5065ae", "#464090", "rgba(34,28,74,0.5)"],
  ];

  for (const dir of [-1, 1]) {
    // --- Primaries, longest through the middle of the fan ---
    // Measured off IMG_0633: the LONGEST primaries are the inner ones hanging
    // near the centre, and they shorten going outward while sweeping out — so
    // the wing's lower edge rises toward the tip. An earlier version had them
    // growing outward, which splayed the fan flat across the whole wall.
    const PRIM = 15;
    for (let i = 0; i < PRIM; i++) {
      const u = i / (PRIM - 1);
      const ox = cx + dir * (W * 0.028 + u * W * 0.15);
      const oy = shoulderY + H * (0.03 - u * 0.075);
      const deg = 86 - 40 * u;
      const ang = dir > 0 ? (deg * Math.PI) / 180 : Math.PI - (deg * Math.PI) / 180;
      const len = H * (0.275 - 0.105 * u);
      const wid = 64 - u * 20;
      const ci = Math.min(PRIM_COLS.length - 1, Math.round(u * (PRIM_COLS.length - 1)));
      const [rootCol, tipCol, edge] = PRIM_COLS[ci];
      primary(ox, oy, ang, len, wid, rootCol, tipCol, edge);
    }

    // --- Covert mass over the primary roots ---
    // Lower edge is scalloped so the join to the primaries reads as feathering
    const covert = () => {
      ctx.beginPath();
      ctx.moveTo(cx + dir * W * 0.015, shoulderY + H * 0.04);
      ctx.quadraticCurveTo(
        cx + dir * W * 0.105, shoulderY - H * 0.095,
        cx + dir * W * 0.185, shoulderY - H * 0.1
      );
      ctx.quadraticCurveTo(
        cx + dir * W * 0.238, shoulderY - H * 0.07,
        cx + dir * W * 0.222, shoulderY + H * 0.018
      );
      // scalloped underside, outer -> inner
      const steps = 7;
      for (let k = 0; k < steps; k++) {
        const t0 = k / steps;
        const t1 = (k + 1) / steps;
        const x0 = cx + dir * (W * (0.222 - t0 * 0.17));
        const y0 = shoulderY + H * (0.022 + t0 * 0.085);
        const x1 = cx + dir * (W * (0.222 - t1 * 0.17));
        const y1 = shoulderY + H * (0.022 + t1 * 0.085);
        const mx = (x0 + x1) * 0.5;
        const my = (y0 + y1) * 0.5 + H * 0.026;
        ctx.quadraticCurveTo(mx, my, x1, y1);
      }
      ctx.quadraticCurveTo(
        cx + dir * W * 0.04, shoulderY + H * 0.09,
        cx + dir * W * 0.015, shoulderY + H * 0.04
      );
      ctx.closePath();
    };

    ctx.save();
    covert();
    ctx.clip();
    const bands = ctx.createLinearGradient(
      cx + dir * W * 0.10, shoulderY - H * 0.1,
      cx + dir * W * 0.11, shoulderY + H * 0.105
    );
    bands.addColorStop(0.0, "#f2c8ca");
    bands.addColorStop(0.13, "#e4a5ae");
    bands.addColorStop(0.27, "#d3808f");
    bands.addColorStop(0.45, "#a89a72");
    bands.addColorStop(0.6, "#7fae6a");
    bands.addColorStop(0.78, "#57a58c");
    bands.addColorStop(1.0, "#49a0a4");
    ctx.fillStyle = bands;
    ctx.fillRect(0, 0, W, H);

    // Feather rows inside the coverts — short curved marks, not long hatching
    for (let row = 0; row < 5; row++) {
      const rv = 0.16 + row * 0.17;
      const marks = 9 + row * 2;
      for (let m = 0; m < marks; m++) {
        const mu = (m + 0.5) / marks;
        const mx = cx + dir * (W * (0.025 + mu * 0.19));
        const my = shoulderY + H * (-0.09 + rv * 0.19 + mu * 0.012);
        const rr = W * 0.017;
        ctx.beginPath();
        // Crescent only — a full ellipse read as chainmail
        ctx.ellipse(mx, my, rr, rr * 0.7, dir > 0 ? 0.3 : -0.3, 0.15, Math.PI - 0.15);
        ctx.strokeStyle = "rgba(40,32,60,0.10)";
        ctx.lineWidth = 1.8;
        ctx.stroke();
      }
    }
    // Sun catching the top of the coverts
    const rim = ctx.createLinearGradient(
      0, shoulderY - H * 0.115, 0, shoulderY - H * 0.03
    );
    rim.addColorStop(0, "rgba(255,250,236,0.55)");
    rim.addColorStop(1, "rgba(255,242,220,0)");
    ctx.fillStyle = rim;
    ctx.fillRect(0, shoulderY - H * 0.12, W, H * 0.095);
    ctx.restore();

    // Pale rim on the covert silhouette
    ctx.save();
    covert();
    ctx.strokeStyle = "rgba(255,250,240,0.4)";
    ctx.lineWidth = 2.6;
    ctx.stroke();
    ctx.restore();
  }

  // Light shining through the gap between the wings
  const gap = ctx.createRadialGradient(
    cx, shoulderY + H * 0.06, 6, cx, shoulderY + H * 0.06, W * 0.085
  );
  gap.addColorStop(0, "rgba(255,253,244,0.95)");
  gap.addColorStop(0.5, "rgba(255,242,210,0.5)");
  gap.addColorStop(1, "rgba(255,230,185,0)");
  ctx.fillStyle = gap;
  ctx.fillRect(cx - W * 0.1, shoulderY - H * 0.04, W * 0.2, H * 0.24);

  // ─── Diamond logo ──────────────────────────────────────────────────────
  // Wide rhombus, well clear above the wing junction. Was oversized before and
  // collided with both the wings and the spars.
  const dcx = cx;
  const dcy = HORIZON_Y - H * 0.105;
  const dW = W * 0.105;
  const dH = H * 0.072;
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.lineWidth = 2.4;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r0 = dW * 0.85;
    const r1 = dW * (0.98 + (i % 2) * 0.1);
    ctx.beginPath();
    ctx.moveTo(dcx + Math.cos(a) * r0, dcy + Math.sin(a) * r0 * 0.72);
    ctx.lineTo(dcx + Math.cos(a) * r1, dcy + Math.sin(a) * r1 * 0.72);
    ctx.stroke();
  }
  ctx.restore();
  const diamond = (sx, sy, fill) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(dcx, dcy - sy);
    ctx.lineTo(dcx + sx, dcy);
    ctx.lineTo(dcx, dcy + sy);
    ctx.lineTo(dcx - sx, dcy);
    ctx.closePath();
    ctx.fill();
  };
  diamond(dW * 1.06, dH * 1.06, "rgba(255,255,255,0.5)");
  diamond(dW, dH, "#181c2c");
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 ${Math.round(dH * 0.56)}px ${STACYS_DISPLAY}`;
  ctx.fillText("Stacy's", dcx, dcy - dH * 0.12);
  ctx.fillStyle = "#bfe0ea";
  ctx.font = `700 ${Math.round(dH * 0.2)}px ${STACYS_UI}`;
  ctx.fillText("@ MELROSE", dcx, dcy + dH * 0.42);

  // ─── Painted-on-brick coursing ─────────────────────────────────────────
  // The photo never hides the masonry — coursing shows through the paint
  // everywhere, so this goes on last, over the whole composition.
  ctx.save();
  ctx.globalAlpha = 0.13;
  const courseH = H / 44;
  const brickW = courseH * 2.6;
  ctx.strokeStyle = "#6a5c50";
  ctx.lineWidth = 2;
  for (let r = 0; r * courseH < H; r++) {
    const y = r * courseH;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
    const off = r % 2 ? brickW * 0.5 : 0;
    for (let x = off; x < W; x += brickW) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + courseH);
      ctx.stroke();
    }
  }
  ctx.restore();
  // Faint highlight on each course top, so the brick reads as relief
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = "#ffffff";
  for (let r = 0; r * courseH < H; r++) ctx.fillRect(0, r * courseH + 1, W, 2);
  ctx.restore();

  // ─── Artist signature, bottom right ────────────────────────────────────
  ctx.save();
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = "#4a3a30";
  ctx.textAlign = "right";
  ctx.font = `700 ${Math.round(H * 0.019)}px ${STACYS_UI}`;
  ctx.fillText("JEREMY CITES", W * 0.96, H * 0.945);
  ctx.restore();

  return canvasTexture(c, 8);
}

/**
 * Full north-gable mural: rectangle body + triangle peak matching the roof rake.
 * Shape covers the entire painted brick gable (not a floating square).
 *
 * @param {THREE.Group} g
 * @param {object} opts
 * @param {number} opts.wallX  outer face X
 * @param {number} opts.centerZ  wall center along Z
 * @param {number} opts.baseW  full width along Z (building depth)
 * @param {number} opts.eaveY  height where triangle starts
 * @param {number} opts.peakY  peak height (under ridge)
 * @param {number} [opts.out=-1]  outward (+1 / −1)
 */
export function addStacysGableMural(g, opts) {
  const wallX = opts.wallX;
  const centerZ = opts.centerZ;
  const baseW = opts.baseW;
  const eaveY = opts.eaveY;
  const peakY = opts.peakY;
  const out = opts.out ?? -1;
  const half = baseW * 0.5;
  const map = makeStacysWingsMuralTexture();

  // Local shape in XY: X → along wall (world Z), Y → up
  // CCW winding so default normal is +Z before we rotate to face outward
  const shape = new THREE.Shape();
  shape.moveTo(-half, 0.04);
  shape.lineTo(-half, eaveY);
  shape.lineTo(0, peakY); // gable peak
  shape.lineTo(half, eaveY);
  shape.lineTo(half, 0.04);
  shape.closePath();

  const geo = new THREE.ShapeGeometry(shape, 32);
  // Remap UVs so texture covers full gable bounds (0–1 across width & height)
  const uv = geo.attributes.uv;
  const pos = geo.attributes.position;
  if (uv && pos) {
    const maxY = Math.max(peakY, 0.01);
    for (let i = 0; i < uv.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      uv.setXY(i, (x + half) / baseW, y / maxY);
    }
    uv.needsUpdate = true;
  }
  geo.computeVertexNormals();

  const muralMat = new THREE.MeshStandardMaterial({
    map,
    roughness: 0.8,
    metalness: 0.02,
    flatShading: false,
    emissive: 0x1a1410,
    emissiveIntensity: 0.16,
    emissiveMap: map,
    // DoubleSide so a facing error never makes the mural vanish
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, muralMat);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.name = "stacysGableMural";
  // Shape lies in XY facing +Z. Ry(−π/2) sends +Z → −X (parking / north).
  // Ry(+π/2) sends +Z → +X (south). out −1 = north outward.
  mesh.rotation.y = out < 0 ? -Math.PI / 2 : Math.PI / 2;
  // Sit proud of the gable brick so it is not z-fought inside the wall
  mesh.position.set(wallX + out * 0.14, 0, centerZ);
  g.add(mesh);

  // Thin dark brick edge trim along the two rakes
  const rakeLen = Math.hypot(half, peakY - eaveY);
  for (const side of [-1, 1]) {
    const trim = box(0.04, 0.06, rakeLen + 0.05, 0x3a3428, { roughness: 0.9 });
    const midY = (eaveY + peakY) * 0.5;
    const midZ = centerZ + side * half * 0.5;
    trim.position.set(wallX + out * 0.16, midY, midZ);
    const ang = Math.atan2(peakY - eaveY, half);
    trim.rotation.x = side > 0 ? ang : -ang;
    g.add(trim);
  }
}

/**
 * Giant rainbow Converse high-top planter — Stacy's front-yard landmark.
 *
 * The real thing (IMG_0628) is a hand-sculpted concrete high-top lying in the
 * gravel bed, painted with a rainbow whose bands run ACROSS the shoe: each band
 * is a rib sweeping up from the foxing, over the top, and down the far side,
 * with the bands sequenced toe-to-heel. The previous version stacked six
 * HORIZONTAL bands from sole to collar, which is why it read as a staircase
 * from the street and as one solid purple slab from the game camera — with
 * horizontal bands, an overhead view only ever sees the topmost colour.
 *
 * The body — silhouette, rainbow ribs, white foxing, its black pinstripe and
 * the toe cap — is ONE lofted mesh: cross-sections along the length, flat
 * shaded, coloured per face. That is a single draw call where the old
 * band-slab approach cost about seventy.
 *
 * Local +X = toe, -X = heel, y = 0 is the ground contact.
 */
export function createRainbowConverse(x = 0, z = 0, scale = 1) {
  const g = new THREE.Group();
  const s = scale;

  // Chalky, sun-faded paint. The sculpture is matte concrete in full Phoenix
  // sun, not enamel — the old saturated primaries read as plastic. Ordered
  // toe -> heel, which is the direction the bands are sequenced.
  const BANDS = [
    0x7fa8c9, // sky blue, first band behind the toe cap
    0x5fa39a, // teal
    0x6ea24e, // green
    0xd9b23f, // gold
    0xd97e33, // orange
    0xb8422f, // red
    0xa8446b, // magenta
    0x7b4f86, // violet, wrapping the heel
  ];
  const RUBBER = 0xe8e2d6; // warm off-white; the foxing is road-dirty, not clean
  const PINSTRIPE = 0x2a2622; // thin dark line along the bottom of the foxing

  // ---- profile, u = 0 at the heel, u = 1 at the toe tip ----
  const LEN = 2.05 * s;
  const HEEL_X = -0.95 * s;
  // The foxing is a deep band: measured on IMG_0628 it is 0.22 of the shoe's
  // total height, so it reads as the thick rubber wrap it is rather than a
  // pinstripe at the gravel line.
  const SOLE_TOP = 0.25 * s; // top of the white foxing
  const STRIPE_TOP = 0.05 * s;
  const TOE_CAP_U = 0.79; // white rubber shell forward of this station

  // Top of the upper. The plateau across u 0.06-0.17 is the planter mouth; the
  // drop after it is the ankle notch, then the vamp runs down to the toe.
  // Length:ankle-height comes out ~1.75, measured off IMG_0628.
  // Both ends have to round OFF over the first few stations. Running the full
  // width and height straight to u = 0 leaves the heel a flat vertical wall,
  // which is what made it read as a paint can rather than a heel.
  const TOP_KEYS = [
    [0.0, 0.66], [0.03, 0.9], [0.09, 1.09], [0.18, 1.12], [0.28, 0.9],
    [0.4, 0.64], [0.55, 0.5], [0.7, 0.4], [0.85, 0.31], [0.94, 0.24],
    [1.0, 0.1],
  ];
  const HALF_W_KEYS = [
    [0.0, 0.1], [0.035, 0.2], [0.1, 0.29], [0.25, 0.33], [0.45, 0.37],
    [0.65, 0.38], [0.82, 0.34], [0.93, 0.27], [1.0, 0.1],
  ];

  // Smoothstep between keys — linear interpolation leaves visible kinks in the
  // silhouette at every keyframe.
  const sampleKeys = (keys, u) => {
    if (u <= keys[0][0]) return keys[0][1];
    const last = keys[keys.length - 1];
    if (u >= last[0]) return last[1];
    for (let i = 1; i < keys.length; i++) {
      if (u <= keys[i][0]) {
        const [u0, v0] = keys[i - 1];
        const [u1, v1] = keys[i];
        const t = (u - u0) / (u1 - u0);
        return v0 + (v1 - v0) * t * t * (3 - 2 * t);
      }
    }
    return last[1];
  };
  const topAt = (u) => sampleKeys(TOP_KEYS, u) * s;
  const halfAt = (u) => sampleKeys(HALF_W_KEYS, u) * s;

  // ---- sculpted swell ----
  // A coarse random field, bilinearly interpolated, so the wobble reads as
  // hand-troweled concrete rather than per-vertex sandpaper. LCG, not a
  // golden-ratio pair: that trick lays samples on lattice lines and the
  // regularity shows up as striations (it did exactly that in the gravel bed).
  let seed = 0x9e37;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const NU = 8;
  const NV = 6;
  const field = [];
  for (let i = 0; i <= NU; i++) {
    const row = [];
    for (let j = 0; j < NV; j++) row.push(rnd() * 2 - 1);
    field.push(row);
  }
  const wobble = (u, vFrac) => {
    const fu = Math.max(0, Math.min(NU - 1e-6, u * NU));
    const fv = vFrac * NV;
    const i0 = Math.floor(fu);
    const j0 = Math.floor(fv) % NV;
    const j1 = (j0 + 1) % NV;
    const tu = fu - i0;
    const tv = fv - Math.floor(fv);
    const su = tu * tu * (3 - 2 * tu);
    const sv = tv * tv * (3 - 2 * tv);
    const a = field[i0][j0] + (field[i0 + 1][j0] - field[i0][j0]) * su;
    const b = field[i0][j1] + (field[i0 + 1][j1] - field[i0][j1]) * su;
    return a + (b - a) * sv;
  };

  // ---- cross-section ----
  // A squircle: near-flat bottom (high exponent), domed top, slab-ish sides.
  const N_TOP = 2.2; // dome exponent above the section's mid-height
  const N_BOT = 6.5; // near-flat bottom, since the shoe lies on the gravel
  const N_SIDE = 3.2; // slab-ish flanks

  // The ring is sampled as TWO arcs meeting exactly on the foxing line, rather
  // than at uniform angles. That matters: with uniform angles the lower half of
  // a tall section is one enormous quad running from the widest point almost to
  // the ground, its midpoint sits above the foxing line, and so the rainbow ran
  // straight down to the gravel and the white rubber wrap disappeared under the
  // ankle. Splitting on the boundary makes the foxing an index range instead of
  // a midpoint guess, so it is exact everywhere.
  const N_CANVAS = 16; // samples over the painted arc
  const N_RUBBER = 10; // samples over the foxing arc
  const RING = N_CANVAS + N_RUBBER;

  // Taper the foxing line at the very toe so the painted arc never collapses to
  // a point and emit degenerate, NaN-normal triangles. That nose is inside the
  // toe cap and reads white regardless.
  const soleTopAt = (u) => Math.min(SOLE_TOP, topAt(u) * 0.7);

  // theta where the section crosses the foxing line, on the +Z and -Z flanks.
  // Above the section's mid-height (near the toe, where the shoe is shallow)
  // the crossing is on the dome; below it, on the flat. Same formula, one sign.
  const soleArc = (u) => {
    const top = topAt(u);
    const yc = top * 0.46;
    const st = soleTopAt(u);
    if (st > yc) {
      const a = Math.asin(Math.min(1, Math.pow((st - yc) / (top - yc), N_TOP / 2)));
      return [a, Math.PI - a];
    }
    const a = Math.asin(Math.min(1, Math.pow(1 - st / yc, N_BOT / 2)));
    return [-a, Math.PI + a];
  };

  const pointAt = (u, th, onRubber) => {
    const c = Math.cos(th);
    const sn = Math.sin(th);
    const top = topAt(u);
    const yc = top * 0.46;
    const pw = (v, n) => Math.sign(v) * Math.pow(Math.abs(v), 2 / n);
    const wob = wobble(u, (th / (Math.PI * 2) + 1) % 1) * 0.022;
    let y = sn >= 0 ? yc + (top - yc) * pw(sn, N_TOP) : yc + yc * pw(sn, N_BOT);
    let zz = halfAt(u) * pw(c, N_SIDE);
    y *= 1 + wob;
    zz *= 1 + wob;
    // The rubber stands proud of the canvas, the way the foxing does for real.
    if (onRubber) zz *= 1.07;
    return [HEEL_X + u * LEN, Math.max(0, y), zz];
  };

  // Indices 0..N_CANVAS are the painted arc; the rest wrap the foxing.
  const buildRing = (u) => {
    const [thR, thL] = soleArc(u);
    const r = [];
    for (let i = 0; i <= N_CANVAS; i++) {
      r.push(pointAt(u, thR + ((thL - thR) * i) / N_CANVAS, false));
    }
    for (let j = 1; j < N_RUBBER; j++) {
      r.push(pointAt(u, thL + ((thR + Math.PI * 2 - thL) * j) / N_RUBBER, true));
    }
    return r;
  };

  // ---- stations ----
  // Uniform samples plus an exact station at every band boundary, so each rib
  // edge lands on a quad edge and comes out crisp.
  const raw = [];
  for (let i = 0; i <= 34; i++) raw.push(i / 34);
  for (let i = 1; i < BANDS.length; i++) raw.push((TOE_CAP_U * i) / BANDS.length);
  raw.push(TOE_CAP_U);
  raw.sort((a, b) => a - b);
  const US = raw.filter((u, i) => i === 0 || u - raw[i - 1] > 0.004);

  // Colour is decided per FACE, never per vertex — interpolating a band edge
  // across a quad smears it into a gradient. Whether a face is rubber is an
  // index test, not a height test, because of how the ring is split above.
  const faceColor = (uMid, yMid, onRubber) => {
    if (onRubber) return yMid < STRIPE_TOP ? PINSTRIPE : RUBBER;
    if (uMid > TOE_CAP_U) return RUBBER;
    const bi = Math.floor(((TOE_CAP_U - uMid) / TOE_CAP_U) * BANDS.length);
    return BANDS[Math.max(0, Math.min(BANDS.length - 1, bi))];
  };

  const pos = [];
  const col = [];
  const tmpC = new THREE.Color();
  const pushTri = (p0, p1, p2, hex, shade) => {
    pos.push(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
    tmpC.setHex(hex).multiplyScalar(shade);
    for (let i = 0; i < 3; i++) col.push(tmpC.r, tmpC.g, tmpC.b);
  };
  // Winding on a lofted tube is easy to get backwards in one place and right in
  // another, so every triangle is emitted with its normal forced to face away
  // from an interior reference point instead of trusting the traversal order.
  const pushOut = (p0, p1, p2, inner, hex, shade) => {
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
    const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const dot =
      nx * (p0[0] - inner[0]) + ny * (p0[1] - inner[1]) + nz * (p0[2] - inner[2]);
    if (dot < 0) pushTri(p0, p2, p1, hex, shade);
    else pushTri(p0, p1, p2, hex, shade);
  };

  const rings = US.map(buildRing);

  for (let i = 0; i < rings.length - 1; i++) {
    const uMid = (US[i] + US[i + 1]) * 0.5;
    const inner = [HEEL_X + uMid * LEN, topAt(uMid) * 0.46, 0];
    for (let k = 0; k < RING; k++) {
      const k2 = (k + 1) % RING;
      const a = rings[i][k];
      const b = rings[i][k2];
      const c = rings[i + 1][k2];
      const d = rings[i + 1][k];
      const yMid = (a[1] + b[1] + c[1] + d[1]) * 0.25;
      const hex = faceColor(uMid, yMid, k >= N_CANVAS);
      // subtle per-face value mottle = chalky brush-painted concrete
      const shade = 1 + wobble(uMid, (k + 0.5) / RING) * 0.05;
      pushOut(a, b, c, inner, hex, shade);
      pushOut(a, c, d, inner, hex, shade);
    }
  }

  // End caps: the heel is a real disc, the toe tip nearly a point.
  for (const [ring, uMid, push] of [
    [rings[0], 0.002, 0.12],
    [rings[rings.length - 1], 0.998, -0.12],
  ]) {
    const ctr = [0, 0, 0];
    for (const p of ring) {
      ctr[0] += p[0] / RING;
      ctr[1] += p[1] / RING;
      ctr[2] += p[2] / RING;
    }
    const inner = [ctr[0] + push * s, ctr[1], ctr[2]];
    for (let k = 0; k < RING; k++) {
      const a = ring[k];
      const b = ring[(k + 1) % RING];
      const yMid = (a[1] + b[1] + ctr[1]) / 3;
      pushOut(ctr, a, b, inner, faceColor(uMid, yMid, k >= N_CANVAS), 1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const body = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.92, // matte concrete
      metalness: 0,
      flatShading: true,
    })
  );
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  const paint = (color, roughness = 0.9) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, flatShading: true });

  const addMesh = (geometry, material, cast = true) => {
    const m = new THREE.Mesh(geometry, material);
    m.castShadow = cast;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };

  // —— Planter mouth ——
  // It IS a planter: the ankle opening in IMG_0628 is filled with dark mulch
  // nearly level with a thick worn rim. The old version modelled it as an
  // empty black box floating on top of the collar.
  // A fat black torus here reads as a paint-can lid; the real rim is a thin
  // worn concrete edge with the mulch sitting recessed below it.
  const mouthU = 0.14;
  const mouthX = HEEL_X + mouthU * LEN;
  const mouthY = topAt(mouthU);
  const mouthR = 0.185 * s;
  const OVOID = 1.4; // the opening runs longer fore-aft than across
  const rim = addMesh(
    new THREE.TorusGeometry(mouthR, 0.032 * s, 6, 18),
    paint(0x6b6058, 0.9)
  );
  rim.rotation.x = Math.PI / 2;
  rim.scale.set(OVOID, 1, 1);
  rim.position.set(mouthX, mouthY - 0.03 * s, 0);
  // Flat fill first, then the lumpy mound. A mound alone does not cover the
  // mouth: an icosahedron's faces sit inside its circumsphere and the vertical
  // squash pulls its silhouette in further, so the painted body showed through
  // the ring as a pink crescent.
  const mulchMat = paint(0x2b2219, 1);
  // The fill must overlap the rim's INNER radius so no painted body shows
  // through the ring at a low camera (it read as a pink crescent), but stay
  // under the rim's top so the rim still reads as a concrete edge rather than
  // the whole thing reading as a dark lid.
  const fill = addMesh(
    new THREE.CylinderGeometry(mouthR * 0.89, mouthR * 0.89, 0.12 * s, 16),
    mulchMat,
    false
  );
  fill.scale.set(OVOID, 1, 1);
  fill.position.set(mouthX, mouthY - 0.075 * s, 0);
  const mulch = addMesh(new THREE.IcosahedronGeometry(mouthR * 0.82, 1), mulchMat, false);
  mulch.scale.set(OVOID, 0.34, 1.0);
  mulch.position.set(mouthX, mouthY - 0.035 * s, 0);

  // —— All-Star roundel ——
  // Measured off IMG_0628: centre 80% of the way back from the toe, a little
  // over half the total height, radius ~0.23 units at scale 1. White circle,
  // dark maroon star — not the black disc the old version had.
  const patchU = 0.2;
  const patchX = HEEL_X + patchU * LEN;
  const patchY = 0.62 * s;
  // Near flush — a thick puck reads as a bottle cap stuck on the ankle. 1.03
  // rather than 1.00 so the sculpted wobble (+/-2.2%) cannot swallow it.
  const patchZ = halfAt(patchU) * 1.03;
  const starShape = new THREE.Shape();
  for (let k = 0; k < 10; k++) {
    const r = k % 2 === 0 ? 1 : 0.42;
    const a = Math.PI / 2 + (k / 10) * Math.PI * 2;
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r;
    if (k === 0) starShape.moveTo(px, py);
    else starShape.lineTo(px, py);
  }
  const starGeo = new THREE.ShapeGeometry(starShape);
  const starMat = paint(0x6e2230, 0.9);
  const discMat = paint(0xeee8dc, 0.9);
  const ringMat = paint(0x4a423a, 0.9);
  for (const side of [-1, 1]) {
    const disc = addMesh(
      new THREE.CylinderGeometry(0.21 * s, 0.21 * s, 0.02 * s, 20),
      discMat
    );
    disc.rotation.x = Math.PI / 2;
    disc.position.set(patchX, patchY, side * patchZ);
    const outline = addMesh(
      new THREE.TorusGeometry(0.205 * s, 0.012 * s, 5, 20),
      ringMat,
      false
    );
    outline.position.set(patchX, patchY, side * (patchZ + 0.011 * s));
    const star = addMesh(starGeo, starMat, false);
    star.scale.setScalar(0.14 * s);
    star.position.set(patchX, patchY, side * (patchZ + 0.014 * s));
    if (side < 0) star.rotation.y = Math.PI;
  }

  // —— Laces ——
  // Criss-crossed Xs over the vamp, as in the photo, not the parallel bars the
  // old version had. Each pair is a group so the Y splay happens first and the
  // group's Z tilt then lays the whole X down along the vamp's slope. Bars span
  // the central ~70% of the width, where the dome is flat enough that a
  // straight box does not lift off the surface at its ends.
  const laceMat = paint(0xdedad0, 0.85);
  for (const lu of [0.33, 0.42, 0.51, 0.6, 0.69]) {
    const slope = (topAt(lu + 0.03) - topAt(lu - 0.03)) / (0.06 * LEN);
    const pair = new THREE.Group();
    for (const dir of [-1, 1]) {
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(0.055 * s, 0.035 * s, halfAt(lu) * 1.35),
        laceMat
      );
      bar.rotation.y = dir * 0.55;
      bar.castShadow = true;
      pair.add(bar);
    }
    pair.position.set(HEEL_X + lu * LEN, topAt(lu) - 0.022 * s, 0);
    pair.rotation.z = Math.atan(slope);
    g.add(pair);
  }

  // —— Eyelets ——
  // Dark holes along both throat edges, offset from the lace crossings. Read
  // straight off the ring a quarter and three quarters along the painted arc,
  // so each one is guaranteed to sit exactly on the surface, then oriented to
  // the local outward direction — a plain Z-facing disc buries itself where the
  // dome rolls over.
  const eyeMat = paint(0x241f1a, 0.95);
  const eyeGeo = new THREE.CylinderGeometry(0.036 * s, 0.036 * s, 0.03 * s, 10);
  const up = new THREE.Vector3(0, 1, 0);
  for (const eu of [0.3, 0.38, 0.46, 0.55, 0.64, 0.73]) {
    const ring = buildRing(eu);
    for (const k of [N_CANVAS / 4, (N_CANVAS * 3) / 4]) {
      const p = ring[k];
      const n = new THREE.Vector3(0, p[1] - topAt(eu) * 0.46, p[2]).normalize();
      const eye = addMesh(eyeGeo, eyeMat, false);
      eye.quaternion.setFromUnitVectors(up, n);
      eye.position.set(p[0] + n.x * 0.004 * s, p[1] + n.y * 0.004 * s, p[2] + n.z * 0.004 * s);
    }
  }

  g.position.set(x, 0, z);
  g.rotation.y = -0.55; // default heading; callers override (see createStacys)
  return g;
}

/**
 * Stacy's @ Melrose — 4343 N 7th Ave.
 * Photo-matched low-poly: tan brick hall, Spanish tile roof, wood porch,
 * gable rainbow-wings mural, purple rooftop patio, giant Converse shoe.
 */
export function createStacys(parcel) {
  const g = new THREE.Group();
  g.name = "stacys";
  // Painted CMU block. Photos (IMG_0628/0632/0633) read olive/khaki-gold in
  // full sun, not the pinkish tan this used to be — and the cooler olive makes
  // the terracotta roof and purple sign pop harder by contrast.
  const brick = 0xa89a5c; // sunlit block face
  const brickDark = 0x8e8148; // mortar / shaded courses
  const brickLite = 0xb8a860; // top-lit block highlight
  const tile = 0xb85a3a; // terracotta Spanish tile
  const tileDark = 0x9a4a30;
  const purple = 0x5a3a7a; // patio CMU + sign face
  const purpleLite = 0x6a4a8a;
  // Night-only neon / patio / dance lights
  const nightMats = [];
  const flashMats = [];
  const flashLights = [];
  const addNeon = (w, h, d, color, nightI = 0.7) =>
    trackNightMesh(nightMats, neonBox(w, h, d, color, nightI), nightI, 0.015);

  // Hall massing (street face = +Z; mural gable on −X)
  // For east-side parcels, local −X is north along 7th (toward Turney / Camelback).
  const w = 6.4; // along street (N–S)
  const d = 4.6; // depth from street
  const h = 2.85;
  const bZ = -0.15; // slight setback so porch sits forward
  const bX = 0; // building centered on pad X

  // —— North parking (−X side): aisle + lined stalls north of building ——
  // Layout: [stalls north] → aisle → building north face → … south
  // Car length along X (N–S); stalls lined along Z (building depth)
  const edgeMargin = 0.3;
  const aisleW = 1.6; // clear drive lane between north wall and stalls
  const northLotLen = 2.9; // stall depth (car length N–S)
  const northStallCount = 5;
  const patioDepth = 2.9; // rear patio extent (−Z)
  // Front (+Z / west toward 7th): extra yard for shade tree + shoe landmark
  const frontExtra = 3.35;
  // Pad covers building + front yard + rear patio + north aisle + stalls
  const padW = w + aisleW + northLotLen + edgeMargin * 2 + 0.35;
  const padD = d + patioDepth + frontExtra + 0.9;
  // Shift pad toward −X (north) so the lot sits on the north side of the hall
  const padCx = bX - (aisleW + northLotLen) * 0.5;
  // Bias pad slightly west (+Z) so front yard is fully on asphalt
  const padCz = bZ - patioDepth * 0.2 + frontExtra * 0.22;
  const padY = 0.05;
  const padTop = padY + 0.04;
  const markY = padTop + 0.025;

  const propPad = box(padW, 0.08, padD, COLORS.asphalt, {
    castShadow: false,
    receiveShadow: true,
  });
  propPad.position.set(padCx, padY, padCz);
  propPad.userData.previewIgnore = true;
  g.add(propPad);
  const padRim = box(padW + 0.12, 0.03, padD + 0.12, COLORS.asphaltEdge, {
    castShadow: false,
  });
  padRim.position.set(padCx, padY + 0.03, padCz);
  padRim.userData.previewIgnore = true;
  g.add(padRim);

  // North stall bay on −X: outer pad edge → car length → aisle → building north face
  // Cars pull in from the aisle (building side); concrete wheel stops sit on the
  // outer property edge so the far end of each stall reads as the lot boundary.
  const buildingNorth = bX - w / 2; // north wall of hall
  const northPadEdge = padCx - padW * 0.5 + edgeMargin; // northernmost pad edge (−X)
  const nLotX = northPadEdge + northLotLen * 0.5; // center of stall depth
  const stallAisle = nLotX + northLotLen * 0.45; // stall edge facing aisle (toward building)
  const stallOuter = nLotX - northLotLen * 0.45; // stall edge at property edge
  // Line stalls along building depth + a bit of front/rear apron
  const northLotSpan = d + 1.6;
  const nLotZ = bZ;
  // Soft aisle strip between stalls and building
  const aisleCenterX = (stallAisle + buildingNorth) * 0.5;
  const aisleDepth = Math.max(0.5, buildingNorth - stallAisle);
  if (aisleDepth > 0.35) {
    const aisleMark = box(aisleDepth * 0.92, 0.02, northLotSpan * 0.95, 0x4a505a, {
      castShadow: false,
    });
    aisleMark.position.set(aisleCenterX, markY - 0.005, nLotZ);
    g.add(aisleMark);
  }
  // Shared stall language (lines + concrete stops on outer property edge)
  addParkingStalls(g, {
    count: northStallCount,
    cx: nLotX,
    cz: nLotZ,
    depth: northLotLen,
    span: northLotSpan,
    depthAxis: "x",
    stopAt: "min",
    markY,
  });

  // Front yard (west / street side) — natural desert floor (not asphalt)
  // Extends to the SW property corner: +X = south, +Z = west (7th Ave).
  const frontZ = bZ + d / 2;
  const padSouth = padCx + padW * 0.5;
  const padWestEdge = padCz + padD * 0.5;
  const yardInset = 0.12;
  // Cover tree/shoe area and run all the way to SW pad edges
  const yardXMin = -2.35; // still wraps the shade tree
  const yardXMax = padSouth - yardInset; // south property edge
  const yardZMin = frontZ + 0.4; // just off the building face
  const yardZMax = padWestEdge - yardInset; // west property edge (street)
  const yardW = yardXMax - yardXMin;
  const yardD = yardZMax - yardZMin;
  const yardX = (yardXMin + yardXMax) * 0.5;
  const yardZ = (yardZMin + yardZMax) * 0.5;
  // —— Decomposed-granite bed ——
  // IMG_0628 shows a dense, uniform field of fine reddish crushed rock sitting
  // FLUSH with the pavement behind a concrete curb — not a raised planter.
  //
  // This used to be a 0.14-tall soil plinth plus a 0.06 gravel layer, 14 flat
  // "dust patch" boxes and 85 pebble meshes. At the game camera that read as a
  // raised tray with rubble tossed on it, one patch looking like a dropped
  // plank, and it cost ~100 draw calls for a speckle. One textured plate does
  // the job better and cheaper.
  const gravelMap = makeGraniteTexture();
  gravelMap.repeat.set(yardW / 0.85, yardD / 0.85);
  const bed = new THREE.Mesh(
    new THREE.PlaneGeometry(yardW, yardD),
    new THREE.MeshStandardMaterial({
      map: gravelMap,
      roughness: 0.99,
      metalness: 0.0,
      flatShading: true,
    })
  );
  bed.rotation.x = -Math.PI / 2;
  bed.position.set(yardX, padTop + 0.012, yardZ);
  bed.receiveShadow = true;
  g.add(bed);

  // The tree stands at treeX -2.7, north of the main bed's edge at -2.35, so it
  // was planted on bare asphalt. This second plate covers it — kept west of the
  // porch steps (the porch front is about z 3.7) so it never runs under the deck.
  const tbXMin = -3.55;
  const tbXMax = yardXMin + 0.02;
  // porchZ/porchD are declared further down, so derive the edge from frontZ:
  // the porch projects porchD (1.55) off the building face, hence +1.75.
  const tbZMin = frontZ + 1.75;
  const tbZMax = yardZMax;
  const tbW = tbXMax - tbXMin;
  const tbD = tbZMax - tbZMin;
  if (tbW > 0.2 && tbD > 0.2) {
    const tbMap = makeGraniteTexture();
    tbMap.repeat.set(tbW / 0.85, tbD / 0.85);
    const treeBed = new THREE.Mesh(
      new THREE.PlaneGeometry(tbW, tbD),
      new THREE.MeshStandardMaterial({
        map: tbMap,
        roughness: 0.99,
        metalness: 0.0,
        flatShading: true,
      })
    );
    treeBed.rotation.x = -Math.PI / 2;
    treeBed.position.set((tbXMin + tbXMax) * 0.5, padTop + 0.012, (tbZMin + tbZMax) * 0.5);
    treeBed.receiveShadow = true;
    g.add(treeBed);
    // Curbs on its exposed north and east sides
    const tbCurbN = box(0.11, 0.07, tbD + 0.11, 0xa9a294, { roughness: 0.93 });
    tbCurbN.position.set(tbXMin - 0.055, padTop + 0.03, (tbZMin + tbZMax) * 0.5);
    g.add(tbCurbN);
    const tbCurbE = box(tbW + 0.11, 0.07, 0.11, 0xa9a294, { roughness: 0.93 });
    tbCurbE.position.set((tbXMin + tbXMax) * 0.5, padTop + 0.03, tbZMin - 0.055);
    g.add(tbCurbE);
  }

  // Concrete curb strip separating the granite from the asphalt on the two
  // exposed sides (north and east), as in the photo.
  const curbCol = 0xa9a294;
  const curbN = box(0.11, 0.07, yardD + 0.11, curbCol, { roughness: 0.93 });
  curbN.position.set(yardXMin - 0.055, padTop + 0.03, yardZ);
  g.add(curbN);
  const curbE = box(yardW + 0.11, 0.07, 0.11, curbCol, { roughness: 0.93 });
  curbE.position.set(yardX, padTop + 0.03, yardZMin - 0.055);
  g.add(curbE);

  // A few rounded salmon boulders — the terracotta rocks in the photo
  for (const [rx, rz, rr, col] of [
    [yardXMax - 0.6, yardZMax - 0.7, 0.26, 0xb9755f],
    [yardXMax - 1.5, yardZMin + 0.6, 0.19, 0xa96a56],
    [yardXMin + 0.7, yardZMax - 0.8, 0.22, 0xc07f68],
  ]) {
    const rock = new THREE.Mesh(
      new THREE.IcosahedronGeometry(rr, 0),
      mat(col, { roughness: 0.95 })
    );
    rock.position.set(rx, padTop + rr * 0.42, rz);
    rock.scale.set(1.15, 0.62, 1.0);
    rock.rotation.set(rx, rz, rx * 0.5);
    rock.castShadow = true;
    g.add(rock);
  }

  // —— Main painted-CMU hall ——
  const body = box(w, h, d, brick, { roughness: 0.92 });
  body.position.set(0, h / 2, bZ);
  g.add(body);

  // Block coursing. The real building is painted CMU with very loud mortar
  // joints — it is a defining texture in every photo. Four thin bands read as
  // generic wall stripes at the game camera, and doing it as real geometry
  // would cost ~240 blocks per face. A running-bond canvas tile gets the same
  // read for one draw call per wall, matching how the sign and mural are done.
  const cmuMap = makeCmuBlockTexture(brick, brickDark, brickLite);
  /** Textured block face just proud of a wall plane. */
  const addBlockFace = (px, py, pz, faceW, faceH, rotY) => {
    const m = cmuMap.clone();
    m.needsUpdate = true;
    // One tile = 4 blocks x 4 courses; keep blocks the same size on every wall
    m.repeat.set(faceW / (4 * CMU_BLOCK_W), faceH / (4 * CMU_COURSE_H));
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(faceW, faceH),
      new THREE.MeshStandardMaterial({
        map: m,
        roughness: 0.93,
        metalness: 0.02,
        flatShading: true,
      })
    );
    face.position.set(px, py, pz);
    face.rotation.y = rotY;
    face.receiveShadow = true;
    g.add(face);
    return face;
  };
  // Street face (+Z / west) and south face (+X) are the walls the game camera
  // sees. North (−X) is the mural gable, so it gets no coursing.
  //
  // The street face is NOT all block: in IMG_0628 the north half — the porch bay
  // and the wall carrying the sacred-heart panel — is dark stained vertical
  // wood planking, and block only resumes south of the porch under the sign.
  const woodWallXMin = -w / 2;
  const woodWallXMax = -0.2;
  const woodWallW = woodWallXMax - woodWallXMin;
  const blockFaceW = w / 2 - woodWallXMax;
  addBlockFace(
    (woodWallXMax + w / 2) * 0.5,
    h / 2,
    bZ + d / 2 + 0.012,
    blockFaceW,
    h,
    0
  );
  addBlockFace(w / 2 + 0.012, h / 2, bZ, d, h, Math.PI / 2);
  addBlockFace(0, h / 2, bZ - d / 2 - 0.012, w, h, Math.PI);

  // Two proud courses for genuine relief: a base course and a bond beam just
  // under the eave, both visible in IMG_0628.
  for (const [cy, ch, col] of [
    [0.13, 0.2, brickDark],
    [h - 0.16, 0.14, brickLite],
  ]) {
    const course = box(w + 0.05, ch, d + 0.05, col, { roughness: 0.94 });
    course.position.set(0, cy, bZ);
    g.add(course);
  }

  // —— Spanish clay barrel-tile roof (photo-matched) ——
  // Ridge runs N–S along X. Front (+Z / west / 7th) & back (−Z / east / patio) slopes.
  // North (−X): closed mural gable. South (+X): closed tan stucco gable.
  const tileHi = 0xc88858;
  const tileMid = 0xb86a42;
  const tileLo = 0x9a4a30;
  const tileDeep = 0x7a3a28;
  const tileCols = [tileHi, tileMid, tileLo, tileDeep, 0xa85838, 0xc47850, 0x8a4428];
  const fasciaCol = 0x4a2818;
  const roofPitch = 0.38; // ~22° — low Spanish pitch like the photo
  const roofOverhang = 0.42;
  const halfSpan = d / 2 + roofOverhang;
  const slopeLen = halfSpan / Math.cos(roofPitch);
  const slopeRise = halfSpan * Math.tan(roofPitch);
  const eaveY = h;
  const ridgeY = eaveY + slopeRise;
  const gableH = slopeRise; // mural peak = roof ridge
  // Main E–W slopes: flush inside north gable → past south wall with eave overhang
  const northRoofX = -w / 2 + 0.06;
  // The south end is HIPPED, not gabled — IMG_0628 and the roof screenshot both
  // show a clear diagonal hip rake over the southern third. The main N–S slopes
  // therefore stop short, and a hip plane carries the roof down to the south
  // eave. `hipRun` shorter than halfSpan makes the hip a little steeper than the
  // main slopes, which is what the photos read as.
  const southEaveX = w / 2 + roofOverhang * 0.85;
  const hipRun = 1.5;
  const southRoofX = southEaveX - hipRun; // where the main ridge/slopes end
  const roofLen = southRoofX - northRoofX;
  const roofCx = (northRoofX + southRoofX) * 0.5;

  /**
   * E–W pitched plane of barrel tiles (local Z = downslope).
   *
   * `hipExtend` makes the plane a TRAPEZOID rather than a rectangle: rows grow
   * by up to `hipExtend` toward +X as they descend to the eave. That is the
   * correct shape against a hipped end — the ridge stops short but the eave
   * still runs the full length of the building. Passing 0 gives the old
   * rectangle. (Getting this wrong left two triangular holes beside the hip.)
   */
  const addBarrelTileSlope = (
    side, lenX, lenSlope, rows, yBase, zCenter, xCenter, hipExtend = 0
  ) => {
    // side +1 = front/street (+Z / west), −1 = rear (−Z / east)
    const plane = new THREE.Group();

    const rowD = lenSlope / rows;
    for (let r = 0; r < rows; r++) {
      const zRow = -lenSlope * 0.5 + (r + 0.52) * rowD;
      // 0 at the ridge, 1 at the eave — the eave is +Z for side +1, −Z for −1
      const towardEave =
        side > 0
          ? (zRow + lenSlope * 0.5) / lenSlope
          : (lenSlope * 0.5 - zRow) / lenSlope;
      const extra = hipExtend * towardEave;
      const rowLenX = lenX + extra;
      const rowCx = extra * 0.5; // grow toward +X only

      // Per-row deck slab, so the trapezoid reads correctly
      const deckRow = box(rowLenX, 0.09, rowD * 1.03, tileMid, {
        roughness: 0.9,
        castShadow: true,
      });
      deckRow.position.set(rowCx, 0, zRow);
      plane.add(deckRow);

      const segs = Math.max(12, Math.round(rowLenX / 0.26));
      const barrelW = rowLenX / segs;
      const pan = box(rowLenX * 0.99, 0.035, rowD * 0.55, tileDeep, {
        roughness: 0.93,
        castShadow: false,
      });
      pan.position.set(rowCx, 0.025, zRow - rowD * 0.18);
      plane.add(pan);
      for (let c = 0; c < segs; c++) {
        const col = tileCols[(r * 3 + c * 2 + side + 7) % tileCols.length];
        const br = rowD * 0.36;
        const barrel = cyl(br, br, barrelW * 0.94, col, {
          roughness: 0.87,
          metalness: 0.03,
        }, 8);
        barrel.rotation.z = Math.PI / 2;
        barrel.position.set(
          rowCx - rowLenX * 0.5 + (c + 0.5) * barrelW + (r % 2 ? barrelW * 0.12 : 0),
          br * 0.55 + 0.02,
          zRow
        );
        barrel.castShadow = r < 2;
        plane.add(barrel);
      }
    }

    // Eave fascia runs the full extended length
    const fascia = box(lenX + hipExtend + 0.06, 0.14, 0.08, fasciaCol, {
      roughness: 0.85,
    });
    fascia.position.set(hipExtend * 0.5, -0.04, side * (lenSlope * 0.5));
    plane.add(fascia);

    const thisRise = lenSlope * Math.sin(roofPitch);
    plane.position.set(xCenter, yBase + thisRise * 0.5, zCenter);
    plane.rotation.x = side > 0 ? roofPitch : -roofPitch;
    g.add(plane);
  };

  // Front (+Z / west) and back (−Z / east) main slopes, trapezoidal so their
  // eaves reach the south end while the ridge stops at the hip apex
  addBarrelTileSlope(+1, roofLen, slopeLen, 9, eaveY, bZ + halfSpan * 0.5, roofCx, hipRun);
  addBarrelTileSlope(-1, roofLen, slopeLen, 9, eaveY, bZ - halfSpan * 0.5, roofCx, hipRun);

  // Ridge cap along the peak (stops short of north gable face)
  const ridgeSegs = 15;
  for (let i = 0; i < ridgeSegs; i++) {
    const col = tileCols[i % tileCols.length];
    const cap = cyl(0.09, 0.09, roofLen / ridgeSegs + 0.02, col, { roughness: 0.85 }, 8);
    cap.rotation.z = Math.PI / 2;
    cap.position.set(
      roofCx - roofLen * 0.5 + (i + 0.5) * (roofLen / ridgeSegs),
      ridgeY + 0.06,
      bZ
    );
    cap.castShadow = true;
    g.add(cap);
  }
  const ridgeBoard = box(roofLen * 0.98, 0.08, 0.2, tileLo, { roughness: 0.9 });
  ridgeBoard.position.set(roofCx, ridgeY, bZ);
  g.add(ridgeBoard);

  // —— South hip end ——
  // Built in a LOCAL frame the same way addBarrelTileSlope does (local +Z is
  // downslope, local X is across), then the whole group is oriented into place.
  // Placing the tiles directly in world space was the first attempt and it went
  // wrong two ways: the barrels kept their default Y axis so they stood upright
  // instead of lying along the slope, and the taper ran the wrong direction.
  //
  // The hip plane is a triangle: apex at the ridge end, base along the south
  // eave at full depth.
  {
    const hipSlopeLen = Math.hypot(hipRun, slopeRise);
    const hipPitch = Math.atan2(slopeRise, hipRun);
    const hipRows = 9;

    const tilt = new THREE.Group(); // local +Z downslope, tilted to the pitch
    const rowD = hipSlopeLen / hipRows;
    for (let r = 0; r < hipRows; r++) {
      const zz = (r + 0.5) * rowD; // distance from apex down the slope
      const frac = zz / hipSlopeLen; // 0 at apex, 1 at eave
      const rowW = Math.max(0.14, halfSpan * 2 * frac);

      const deck = box(rowW, 0.09, rowD * 1.04, tileMid, { roughness: 0.9 });
      deck.position.set(0, 0, zz);
      tilt.add(deck);

      const pan = box(rowW * 0.99, 0.035, rowD * 0.55, tileDeep, {
        roughness: 0.93,
        castShadow: false,
      });
      pan.position.set(0, 0.025, zz - rowD * 0.18);
      tilt.add(pan);

      const segs = Math.max(3, Math.round(rowW / 0.26));
      const barrelW = rowW / segs;
      const br = rowD * 0.36;
      for (let c = 0; c < segs; c++) {
        const col = tileCols[(r * 3 + c * 2 + 5) % tileCols.length];
        const barrel = cyl(br, br, barrelW * 0.94, col, {
          roughness: 0.87,
          metalness: 0.03,
        }, 8);
        barrel.rotation.z = Math.PI / 2; // lie along local X, as the main slopes do
        barrel.position.set(
          -rowW * 0.5 + (c + 0.5) * barrelW + (r % 2 ? barrelW * 0.12 : 0),
          br * 0.55 + 0.02,
          zz
        );
        barrel.castShadow = r > hipRows - 3;
        tilt.add(barrel);
      }
    }
    // Fascia along the bottom (eave) edge
    const hipFascia = box(halfSpan * 2 + 0.06, 0.14, 0.08, fasciaCol, { roughness: 0.85 });
    hipFascia.position.set(0, -0.04, hipSlopeLen);
    tilt.add(hipFascia);
    tilt.rotation.x = hipPitch;

    // Orient: local +Z -> world +X, anchored at the ridge apex
    const hip = new THREE.Group();
    hip.add(tilt);
    hip.rotation.y = Math.PI / 2;
    hip.position.set(southRoofX, ridgeY, bZ);
    g.add(hip);

    // Hip rakes — the two diagonal ridge lines from the apex down to the south
    // eave corners. Oriented by direction vector rather than guessed Euler angles.
    const apex = new THREE.Vector3(southRoofX, ridgeY, bZ);
    const UPV = new THREE.Vector3(0, 1, 0);
    for (const side of [-1, 1]) {
      const corner = new THREE.Vector3(southEaveX, eaveY, bZ + side * halfSpan);
      const dirV = corner.clone().sub(apex);
      const rakeLen2 = dirV.length();
      const dirN = dirV.clone().normalize();
      const quat = new THREE.Quaternion().setFromUnitVectors(UPV, dirN);
      const rakeSegs = 8;
      for (let i = 0; i < rakeSegs; i++) {
        const cap = cyl(0.08, 0.08, (rakeLen2 / rakeSegs) * 1.06, tileCols[i % tileCols.length], {
          roughness: 0.85,
        }, 7);
        const at = apex.clone().addScaledVector(dirN, (i + 0.5) * (rakeLen2 / rakeSegs));
        cap.position.copy(at);
        cap.position.y += 0.06;
        cap.quaternion.copy(quat);
        cap.castShadow = true;
        g.add(cap);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // NORTH / SOUTH closed gables — stay UNDER the roof rake
  // (no full-height rectangular face plates — those poked through the tiles)
  // ═══════════════════════════════════════════════════════════
  // At height fraction t (0=eave → 1=ridge), roof half-width in Z is halfSpan*(1-t).
  // Wall bands use a slightly smaller width so brick never pierces the deck.
  const gableInset = 0.88; // fraction of roof triangle — sits under underside
  const gablePeakT = 0.9; // stop short of ridge so peak is under ridge caps
  const rakeLen = Math.hypot(halfSpan, slopeRise) * 0.92;

  const addClosedGable = (wallX, outward, color, darkColor) => {
    // outward: −1 = north face (toward −X), +1 = south face (toward +X)
    // Base wall: only up to eave (never into the roof volume)
    const base = box(0.16, eaveY - 0.02, d * 0.98, color, { roughness: 0.92 });
    base.position.set(wallX, (eaveY - 0.02) * 0.5, bZ);
    g.add(base);

    // Face plate under the eave only (mural / stucco body)
    const face = box(0.1, eaveY - 0.04, d * 0.96, color, { roughness: 0.91 });
    face.position.set(wallX + outward * 0.06, (eaveY - 0.04) * 0.5, bZ);
    g.add(face);

    // Triangle steps: each band's Z width fits under the roof at that height
    const steps = 14;
    for (let i = 0; i < steps; i++) {
      const t0 = (i / steps) * gablePeakT;
      const t1 = ((i + 1) / steps) * gablePeakT;
      const midT = (t0 + t1) * 0.5;
      // Roof allows 2 * halfSpan * (1-t) total Z width; keep wall inside
      const roofAllow = 2 * halfSpan * (1 - midT) * gableInset;
      const bandZ = Math.min(d * 0.98, roofAllow);
      if (bandZ < 0.14) continue;
      const yBot = eaveY + t0 * slopeRise;
      // Hard cap: top of band under roof underside at this band's outer edge
      const edgeS = bandZ * 0.5;
      const roofUnder = ridgeY - edgeS * Math.tan(roofPitch) - 0.1;
      const yTop = Math.min(eaveY + t1 * slopeRise, roofUnder);
      const bandH = yTop - yBot;
      if (bandH < 0.04) continue;
      const band = box(0.14, bandH, bandZ, color, { roughness: 0.92 });
      band.position.set(wallX + outward * 0.02, yBot + bandH * 0.5, bZ);
      g.add(band);
      // Outer thin face for each step (clean gable read from outside)
      const faceStep = box(0.08, bandH * 0.96, bandZ * 0.98, color, { roughness: 0.91 });
      faceStep.position.set(wallX + outward * 0.08, yBot + bandH * 0.5, bZ);
      g.add(faceStep);
    }

    // Small peak block — deliberately below ridge board
    const peakY = eaveY + gablePeakT * slopeRise - 0.1;
    const peak = box(0.14, 0.16, 0.28, color, { roughness: 0.9 });
    peak.position.set(wallX + outward * 0.04, peakY, bZ);
    g.add(peak);

    // Course lines only on the base wall (below eave)
    if (darkColor != null) {
      for (let i = 0; i < 3; i++) {
        const course = box(0.17, 0.05, d * 0.92, darkColor, { roughness: 0.94 });
        course.position.set(wallX + outward * 0.03, 0.55 + i * 0.65, bZ);
        g.add(course);
      }
    }

    // Barge boards sit ON the roof rake (outside), not through the wall
    for (const side of [-1, 1]) {
      const barge = box(0.07, 0.1, rakeLen, fasciaCol, { roughness: 0.88 });
      // Midpoint of rake, slightly outside the wall
      barge.position.set(
        wallX + outward * 0.12,
        eaveY + slopeRise * 0.45,
        bZ + side * halfSpan * 0.45
      );
      barge.rotation.x = side > 0 ? roofPitch : -roofPitch;
      g.add(barge);

      // Tile lip just under the roof surface along the rake
      const lipRows = 5;
      for (let i = 0; i < lipRows; i++) {
        const t = (i + 0.55) / lipRows; // 0 near eave → 1 near ridge
        // Stay under roof: y = eave + t*rise − small inset
        const ly = eaveY + slopeRise * t * gablePeakT - 0.02;
        const lz = bZ + side * halfSpan * (1 - t * gablePeakT) * 0.92;
        const col = tileCols[(i + (outward > 0 ? 2 : 0)) % tileCols.length];
        const lip = cyl(0.05, 0.05, 0.24, col, { roughness: 0.86 }, 6);
        lip.rotation.set(0, 0, Math.PI / 2);
        lip.position.set(wallX + outward * 0.05, ly, lz);
        lip.castShadow = false;
        g.add(lip);
      }
    }
  };

  const gableX = -w / 2 - 0.07;
  addClosedGable(gableX, -1, brick, brickDark);

  // No south gable: that end is hipped, so the body wall simply runs up to the
  // eave and the hip plane covers it. A closed gable there was the single
  // biggest massing error — it squared off an end the photos show as a hip.
  // Soffit strip under the south eave, closing the gap over the wall head.
  const southSoffit = box(roofOverhang * 0.9, 0.07, d * 0.98, 0x6a5a3c, {
    roughness: 0.92,
  });
  southSoffit.position.set(w / 2 + roofOverhang * 0.45, eaveY - 0.05, bZ);
  g.add(southSoffit);

  // Ridge end caps: north sits on the ridge, south sits at the hip apex
  for (const xEnd of [northRoofX + 0.15, southRoofX - 0.06]) {
    const endCap = cyl(0.09, 0.09, 0.3, tileMid, { roughness: 0.85 }, 8);
    endCap.rotation.z = Math.PI / 2;
    endCap.position.set(xEnd, ridgeY + 0.05, bZ);
    g.add(endCap);
  }

  // —— Street facade (+Z): wood porch bay + long rail wall ——
  // Covered porch (left / north-ish of facade — under mural end)
  const porchW = 2.6;
  const porchD = 1.55;
  const porchX = -w * 0.28;
  const porchZ = bZ + d / 2 + porchD / 2;
  // Burgundy stained timber, the actual porch color in IMG_0628 — the old
  // generic browns read as a fence rather than the heavy stained frame.
  const burgundy = 0x5a2c22;
  const burgundyDark = 0x431f18;
  const plank = 0x4a3124;
  const plankDark = 0x38251b;

  // —— Vertical wood plank cladding on the porch-bay wall ——
  // The wall behind and beside the porch is dark stained vertical boards, not
  // block. Individual planks so the board joints catch the light.
  {
    const clad = box(woodWallW, h - 0.1, 0.07, plankDark, { roughness: 0.93 });
    clad.position.set(
      (woodWallXMin + woodWallXMax) * 0.5,
      (h - 0.1) * 0.5,
      bZ + d / 2 + 0.03
    );
    g.add(clad);
    const boardPitch = 0.16;
    const boards = Math.floor(woodWallW / boardPitch);
    for (let i = 0; i < boards; i++) {
      const bx = woodWallXMin + (i + 0.5) * (woodWallW / boards);
      const bd = box(boardPitch * 0.78, h - 0.14, 0.05, i % 3 === 0 ? plankDark : plank, {
        roughness: 0.92,
        castShadow: false,
      });
      bd.position.set(bx, (h - 0.14) * 0.5, bZ + d / 2 + 0.075);
      g.add(bd);
    }
    // Burgundy trim band at the top, carrying the painted "4343" address
    const trim = box(woodWallW + 0.06, 0.17, 0.11, burgundy, { roughness: 0.86 });
    trim.position.set(
      (woodWallXMin + woodWallXMax) * 0.5,
      h - 0.13,
      bZ + d / 2 + 0.085
    );
    g.add(trim);
  }

  // Porch deck — plank boards running across, on a low skirt
  const deckY = 0.24;
  const deckSkirt = box(porchW + 0.1, deckY, porchD + 0.05, burgundyDark, { roughness: 0.9 });
  deckSkirt.position.set(porchX, deckY * 0.5, porchZ);
  g.add(deckSkirt);
  const deckBoards = 9;
  for (let i = 0; i < deckBoards; i++) {
    const bz = porchZ - porchD / 2 + (i + 0.5) * (porchD / deckBoards);
    const bd = box(porchW, 0.05, (porchD / deckBoards) * 0.86, i % 2 ? 0x54382a : 0x4a3124, {
      roughness: 0.9,
      castShadow: false,
    });
    bd.position.set(porchX, deckY + 0.02, bz);
    g.add(bd);
  }
  // Two worn timber steps down to the gravel
  for (const [si, sw] of [[0, 0.8], [1, 0.9]]) {
    const st = box(porchW * sw, 0.1, 0.28, si ? 0x3e2a20 : 0x54382a, { roughness: 0.92 });
    st.position.set(porchX, deckY - 0.06 - si * 0.1, porchZ + porchD / 2 + 0.14 + si * 0.26);
    g.add(st);
  }

  // —— Posts + header beam, with corbel brackets ——
  const postH = 2.42;
  const postXs = [-porchW * 0.42, porchW * 0.42];
  for (const sx of postXs) {
    // Chunky square post — was 0.14, the photo shows a heavy timber
    const post = box(0.22, postH, 0.22, burgundy, { roughness: 0.87 });
    post.position.set(porchX + sx, postH / 2 + deckY * 0.5, porchZ + porchD * 0.36);
    g.add(post);
    // Base block
    const pBase = box(0.28, 0.12, 0.28, burgundyDark, { roughness: 0.9 });
    pBase.position.set(porchX + sx, deckY + 0.06, porchZ + porchD * 0.36);
    g.add(pBase);
    // Corbel brackets: a diagonal knee plus a short horizontal shoulder, the
    // detail that makes the frame read as carpentry instead of scaffolding
    for (const dir of [-1, 1]) {
      const knee = box(0.42, 0.09, 0.12, burgundyDark, { roughness: 0.88 });
      knee.position.set(
        porchX + sx + dir * 0.21,
        postH + deckY * 0.5 - 0.24,
        porchZ + porchD * 0.36
      );
      knee.rotation.z = dir * 0.62;
      g.add(knee);
      const shoulder = box(0.2, 0.08, 0.14, burgundy, { roughness: 0.88 });
      shoulder.position.set(
        porchX + sx + dir * 0.19,
        postH + deckY * 0.5 - 0.06,
        porchZ + porchD * 0.36
      );
      g.add(shoulder);
    }
  }
  // Deep header beam (photo shows a tall board, not a thin rail)
  const beam = box(porchW + 0.5, 0.26, 0.2, burgundy, { roughness: 0.86 });
  beam.position.set(porchX, postH + deckY * 0.5 + 0.07, porchZ + porchD * 0.36);
  g.add(beam);
  // Secondary beam back against the wall, carrying the roof
  const beamBack = box(porchW + 0.3, 0.18, 0.16, burgundyDark, { roughness: 0.88 });
  beamBack.position.set(porchX, postH + deckY * 0.5 + 0.03, bZ + d / 2 + 0.14);
  g.add(beamBack);
  // Porch Spanish roof — lower shed pitch toward street (photo: dark fascia + tiles)
  {
    const pPitch = 0.22;
    const pLen = porchD * 1.25;
    const pW = porchW * 1.2;
    const pEaveY = 2.55;
    const pRise = pLen * Math.sin(pPitch);
    const porchPlane = new THREE.Group();
    const pDeck = box(pW, 0.08, pLen, tileMid, { roughness: 0.9 });
    porchPlane.add(pDeck);
    const pRows = 5;
    for (let r = 0; r < pRows; r++) {
      const segs = 8;
      const rowD = pLen / pRows;
      const br = rowD * 0.36;
      // Valley pan
      const pan = box(pW * 0.98, 0.03, rowD * 0.45, tileDeep, {
        roughness: 0.93,
        castShadow: false,
      });
      pan.position.set(0, 0.02, -pLen * 0.5 + (r + 0.35) * rowD);
      porchPlane.add(pan);
      for (let c = 0; c < segs; c++) {
        const col = tileCols[(r + c) % tileCols.length];
        const barrel = cyl(br, br, (pW / segs) * 0.9, col, {
          roughness: 0.88,
          castShadow: false,
        }, 7);
        barrel.rotation.z = Math.PI / 2;
        barrel.position.set(
          -pW * 0.5 + (c + 0.5) * (pW / segs),
          br * 0.55 + 0.02,
          -pLen * 0.5 + (r + 0.55) * rowD
        );
        porchPlane.add(barrel);
      }
    }
    // Burgundy wood fascia (photo)
    const pFascia = box(pW + 0.05, 0.12, 0.08, 0x5a2818, { roughness: 0.85 });
    pFascia.position.set(0, -0.03, pLen * 0.5);
    porchPlane.add(pFascia);
    // Side barge boards
    for (const sx of [-1, 1]) {
      const barge = box(0.07, 0.1, pLen, 0x4a2415, { roughness: 0.88 });
      barge.position.set(sx * pW * 0.5, 0.02, 0);
      porchPlane.add(barge);
    }
    porchPlane.position.set(porchX, pEaveY + pRise * 0.5, porchZ + 0.05);
    porchPlane.rotation.x = pPitch;
    g.add(porchPlane);
  }
  // —— Porch railing: burgundy rails + dense dark iron balusters ——
  // Photo shows closely spaced thin iron pickets with a small square knuckle at
  // mid height, between heavy stained rails — not five fat wooden boxes.
  {
    const rZ = porchZ + porchD * 0.44;
    const railSpan = porchW + 0.12;
    const iron = 0x24201c;
    // Top and bottom rails
    const rTop = box(railSpan, 0.1, 0.11, burgundy, { roughness: 0.87 });
    rTop.position.set(porchX, 1.02, rZ);
    g.add(rTop);
    const rBot = box(railSpan, 0.08, 0.1, burgundyDark, { roughness: 0.89 });
    rBot.position.set(porchX, deckY + 0.1, rZ);
    g.add(rBot);
    // Solid apron below the deck line
    const apron = box(railSpan, 0.16, 0.08, burgundyDark, { roughness: 0.9 });
    apron.position.set(porchX, deckY - 0.03, rZ);
    g.add(apron);
    // Pickets, skipping the gate opening in front of the doors
    const pitch = 0.105;
    const nPick = Math.floor(railSpan / pitch);
    for (let i = 0; i < nPick; i++) {
      const px = porchX - railSpan / 2 + (i + 0.5) * pitch;
      // Leave a gap where the steps meet the deck
      if (Math.abs(px - porchX) < 0.34) continue;
      const pick = box(0.032, 0.66, 0.032, iron, { roughness: 0.55, metalness: 0.3 });
      pick.position.set(px, deckY + 0.44, rZ);
      pick.castShadow = false;
      g.add(pick);
      // Mid-height knuckle
      const knuck = box(0.058, 0.058, 0.058, iron, { roughness: 0.5, metalness: 0.35 });
      knuck.position.set(px, deckY + 0.44, rZ);
      knuck.castShadow = false;
      g.add(knuck);
    }
    // Newel posts with caps at each end
    for (const sx of [-railSpan / 2, railSpan / 2]) {
      const newel = box(0.13, 0.98, 0.13, burgundy, { roughness: 0.87 });
      newel.position.set(porchX + sx, deckY + 0.49, rZ);
      g.add(newel);
      const cap = box(0.19, 0.06, 0.19, burgundyDark, { roughness: 0.85 });
      cap.position.set(porchX + sx, deckY + 1.01, rZ);
      g.add(cap);
      const finial = box(0.1, 0.07, 0.1, burgundy, { roughness: 0.85 });
      finial.position.set(porchX + sx, deckY + 1.07, rZ);
      g.add(finial);
    }
  }

  // —— Carved double entry doors ——
  addCarvedDoubleDoor(g, porchX, bZ + d / 2 + 0.05, 1.34, 2.0, deckY);

  // —— Framed sacred-heart art panel on the plank wall ——
  // IMG_0628: a teal panel with radiating rays and a red flaming heart, in a
  // pale blue frame. Was a single flat box before.
  {
    const hx = porchX - 0.95; // north of the doors, as in IMG_0628
    const hy = 1.46;
    const hz = bZ + d / 2 + 0.1;
    const frame = box(0.46, 0.62, 0.05, 0x7fb4c8, { roughness: 0.6 });
    frame.position.set(hx, hy, hz);
    g.add(frame);
    const fieldMat = {
      emissive: 0x1c4a68,
      emissiveIntensity: 0.16,
      roughness: 0.45,
    };
    const field = box(0.37, 0.53, 0.04, 0x2a6a90, fieldMat);
    field.position.set(hx, hy, hz + 0.02);
    g.add(field);
    // Radiating rays
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2;
      const ray = box(0.035, 0.2, 0.02, 0x9fd4e4, { roughness: 0.5 });
      ray.position.set(hx + Math.cos(a) * 0.11, hy + Math.sin(a) * 0.15, hz + 0.035);
      ray.rotation.z = -a + Math.PI / 2;
      ray.castShadow = false;
      g.add(ray);
    }
    // Heart + flame
    const heartBody = box(0.15, 0.15, 0.02, 0xb03a44, { roughness: 0.55 });
    heartBody.position.set(hx, hy - 0.03, hz + 0.045);
    heartBody.rotation.z = Math.PI / 4;
    heartBody.castShadow = false;
    g.add(heartBody);
    for (const lx of [-0.052, 0.052]) {
      const lobe = cyl(0.053, 0.053, 0.02, 0xb03a44, { roughness: 0.55 }, 7);
      lobe.rotation.x = Math.PI / 2;
      lobe.position.set(hx + lx, hy + 0.052, hz + 0.045);
      lobe.castShadow = false;
      g.add(lobe);
    }
    const flame = box(0.05, 0.09, 0.02, 0xe8a038, {
      emissive: 0xc06820,
      emissiveIntensity: 0.2,
      roughness: 0.5,
    });
    flame.position.set(hx, hy + 0.15, hz + 0.045);
    flame.castShadow = false;
    g.add(flame);
  }

  // —— Wall lantern + speaker box on the porch post ——
  {
    const lx = porchX + porchW * 0.42 - 0.16;
    const lz = porchZ + porchD * 0.36;
    const backPlate = box(0.07, 0.1, 0.07, burgundyDark, { roughness: 0.85 });
    backPlate.position.set(lx, 1.94, lz);
    g.add(backPlate);
    const arm = box(0.13, 0.035, 0.035, 0x2a2620, { metalness: 0.35, roughness: 0.5 });
    arm.position.set(lx - 0.09, 1.98, lz);
    g.add(arm);
    // Lantern body — small glowing box at night
    const lantern = box(0.13, 0.19, 0.13, 0xfff0c8, {
      emissive: 0xffd88a,
      emissiveIntensity: 0.02,
      roughness: 0.4,
    });
    lantern.position.set(lx - 0.17, 1.87, lz);
    lantern.name = "porchLantern"; // flicker.js
    g.add(lantern);
    trackNightMesh(nightMats, lantern, 1.35, 0.02, { glimmer: true, glimmerSpeed: 1.2 });
    const lidTop = box(0.16, 0.04, 0.16, 0x2a2620, { roughness: 0.6 });
    lidTop.position.set(lx - 0.17, 1.98, lz);
    g.add(lidTop);
    const lidBot = box(0.15, 0.03, 0.15, 0x2a2620, { roughness: 0.6 });
    lidBot.position.set(lx - 0.17, 1.76, lz);
    g.add(lidBot);
    // Small black speaker/box above the door, as in the photo
    const spk = box(0.13, 0.17, 0.1, 0x16130f, { roughness: 0.8 });
    spk.position.set(porchX - 0.5, 2.06, bZ + d / 2 + 0.11);
    g.add(spk);
  }

  // —— Stone pedestal bench in front of the porch ——
  // The weathered concrete pedestal in IMG_0628 / IMG_0634, a recognizable prop.
  {
    const sx = porchX + 0.55;
    const sz = porchZ + porchD / 2 + 0.72;
    const stone = 0xbfae94;
    const stoneDark = 0xa2917a;
    const foot = box(0.34, 0.07, 0.3, stoneDark, { roughness: 0.95 });
    foot.position.set(sx, 0.24, sz);
    g.add(foot);
    const stem = cyl(0.1, 0.13, 0.34, stone, { roughness: 0.94 }, 7);
    stem.position.set(sx, 0.44, sz);
    g.add(stem);
    const collar = cyl(0.15, 0.13, 0.05, stoneDark, { roughness: 0.94 }, 7);
    collar.position.set(sx, 0.63, sz);
    g.add(collar);
    const slab = box(0.56, 0.1, 0.3, stone, { roughness: 0.93 });
    slab.position.set(sx, 0.7, sz);
    g.add(slab);
  }

  // —— Front slat screen + stepped planter wall (right of porch) ——
  // IMG_0628: a dense vertical wood-slat screen runs the whole frontage under
  // the sign, with a low block planter wall and a stepped cap in front of it.
  // The old version was 7 dark boxes at 0.45 spacing, which read as a sparse
  // handrail rather than the solid warm screen in the photo.
  const railZ = bZ + d / 2 + 0.08;
  const screenX = w * 0.18;
  const screenW = w * 0.62;
  const screenZ = railZ + 0.3;
  const slatWood = 0x6a4a2e;
  const slatWoodDark = 0x4a3220;

  // Dark recess behind the slats so gaps read as shadow, not sky
  const screenBack = box(screenW, 0.95, 0.05, 0x241a12, { roughness: 0.95 });
  screenBack.position.set(screenX, 0.72, screenZ - 0.05);
  g.add(screenBack);

  // Dense vertical slats — ~0.12 pitch instead of 0.45
  const slatPitch = 0.12;
  const slatCount = Math.floor(screenW / slatPitch);
  for (let i = 0; i < slatCount; i++) {
    const sx = screenX - screenW / 2 + (i + 0.5) * slatPitch;
    const slat = box(0.075, 0.92, 0.055, i % 4 === 0 ? slatWoodDark : slatWood, {
      roughness: 0.9,
    });
    slat.position.set(sx, 0.72, screenZ);
    slat.castShadow = false;
    g.add(slat);
  }
  // Top and bottom rails framing the screen
  for (const [ry, rh] of [[1.22, 0.1], [0.24, 0.09]]) {
    const r = box(screenW + 0.06, rh, 0.09, slatWoodDark, { roughness: 0.88 });
    r.position.set(screenX, ry, screenZ + 0.01);
    g.add(r);
  }

  // Low block planter wall with a stepped cap, in front of the screen
  const planterZ = screenZ + 0.24;
  const planter = box(screenW + 0.3, 0.42, 0.3, brick, { roughness: 0.93 });
  planter.position.set(screenX, 0.21, planterZ);
  g.add(planter);
  // Stepped cap: two shallow courses, the top one proud
  const capA = box(screenW + 0.4, 0.07, 0.36, brickDark, { roughness: 0.92 });
  capA.position.set(screenX, 0.45, planterZ);
  g.add(capA);
  const capB = box(screenW + 0.34, 0.06, 0.32, brickLite, { roughness: 0.9 });
  capB.position.set(screenX, 0.51, planterZ);
  g.add(capB);
  // Block joints along the planter face
  for (let i = 0; i < 9; i++) {
    const j = box(0.04, 0.34, 0.02, brickDark, { roughness: 0.95 });
    j.position.set(
      screenX - (screenW + 0.3) / 2 + (i + 0.5) * ((screenW + 0.3) / 9),
      0.21,
      planterZ + 0.16
    );
    g.add(j);
  }

  // —— Purple "Stacy's @ Melrose" sign ——
  // Photo-matched proportion: the real panel is roughly a quarter of the
  // frontage (not the two thirds this used to be), mounted flat to the block
  // below the eave and sitting just above the slat screen. The real sign is a
  // plain purple panel with white script and small radiating rays — no neon
  // tube frame, so the four pink trims are gone. Night read comes entirely
  // from the emissiveMap on the face, which is plenty.
  //
  // signW is the knob to turn if it needs to be more legible at map zoom
  // (the game renders at viewSize 28); 2.2 is true to the building.
  const signW = 2.2;
  const signH = 0.66; // real panel is ~3.3:1
  const signX = w * 0.26; // south of the porch bay, clear of the tree canopy
  const signY = 1.62; // above the slat screen, below the bond beam
  const signZ = bZ + d / 2 + 0.045; // flush to the block, not floating
  // Shallow cabinet, just proud of the wall
  const cabinet = box(signW + 0.07, signH + 0.07, 0.05, 0x2a1840, {
    roughness: 0.65,
    emissive: 0x3a2060,
    emissiveIntensity: 0.02,
  });
  cabinet.position.set(signX, signY, signZ - 0.015);
  cabinet.name = "wallSignCabinet"; // flicker.js
  g.add(cabinet);
  trackNightMat(nightMats, cabinet.material, 0.35, 0.02, { glimmer: true, glimmerSpeed: 1.4 });
  // Textured face — white neon wordmark (emissive white × map = Boycott-bright text)
  const signMap = makeStacysSignTexture();
  const signFace = new THREE.Mesh(
    new THREE.PlaneGeometry(signW, signH),
    new THREE.MeshStandardMaterial({
      map: signMap,
      roughness: 0.28,
      metalness: 0.05,
      flatShading: false,
      // White emissive so map whites read as hot neon (purple tinted the text before)
      emissive: 0xffffff,
      emissiveIntensity: 0.02,
      emissiveMap: signMap,
    })
  );
  signFace.position.set(signX, signY, signZ + 0.025);
  signFace.castShadow = false;
  signFace.name = "wallSignFace"; // flicker.js
  g.add(signFace);
  // Match Boycott letter punch (white neon ~1.15+) with room for glimmer peak
  trackNightMat(nightMats, signFace.material, 2.05, 0.02, {
    glimmer: true,
    glimmerSpeed: 2.1,
  });
  // Two small gooseneck can lights over the panel, as in IMG_0628 — this is how
  // the real sign is lit, in place of the neon tube frame that was here.
  for (const gx of [signX - signW * 0.3, signX + signW * 0.3]) {
    const arm = cyl(0.022, 0.022, 0.26, 0x2a2620, { metalness: 0.4, roughness: 0.5 }, 5);
    arm.rotation.x = Math.PI * 0.32;
    arm.position.set(gx, signY + signH / 2 + 0.19, signZ + 0.06);
    g.add(arm);
    const hood = cyl(0.075, 0.055, 0.07, 0x2a2620, { metalness: 0.35, roughness: 0.5 }, 7);
    hood.position.set(gx, signY + signH / 2 + 0.28, signZ + 0.16);
    g.add(hood);
    const lamp = box(0.075, 0.02, 0.075, 0xfff2d0, {
      emissive: 0xffe8b0,
      emissiveIntensity: 0.02,
    });
    lamp.position.set(gx, signY + signH / 2 + 0.24, signZ + 0.16);
    g.add(lamp);
    trackNightMesh(nightMats, lamp, 1.5, 0.02, { glimmer: false });
  }
  // Soft front sign wash light at night (helps white text pop)
  const signWash = new THREE.PointLight(0xffe8ff, 0, 7, 2);
  signWash.position.set(signX, signY, signZ + 0.8);
  signWash.castShadow = false;
  g.add(signWash);

  // —— Full north gable mural (rectangle + triangle peak, full wall) ——
  // Covers entire painted brick gable under the roof rake (not a floating square)
  const muralPeakY = eaveY + gablePeakT * slopeRise - 0.06;
  addStacysGableMural(g, {
    wallX: gableX, // function offsets further outward by out * 0.14
    centerZ: bZ,
    baseW: d * 0.99,
    eaveY: eaveY - 0.02,
    peakY: muralPeakY,
    out: -1, // faces parking (−X / north)
  });

  // —— North door bay (photo: black entry at street end of mural wall) ——
  // Built proud of the gable so the mural + gable never bury it
  const doorStrip = 1.1;
  const nDoorW = 0.95; // along Z
  const nDoorH = 2.05;
  const nDoorZ = bZ + d / 2 - doorStrip * 0.42;
  const nDoorX = gableX - 0.32;
  // Black painted bay mass
  const nBay = box(0.55, nDoorH + 0.45, nDoorW + 0.55, 0x1a1816, { roughness: 0.9 });
  nBay.position.set(nDoorX + 0.12, (nDoorH + 0.45) / 2, nDoorZ);
  g.add(nBay);
  // Brick return where bay meets mural wall
  const nReturn = box(0.22, nDoorH + 0.5, 0.18, brick, { roughness: 0.92 });
  nReturn.position.set(gableX - 0.02, (nDoorH + 0.5) / 2, nDoorZ - nDoorW * 0.45);
  g.add(nReturn);
  // Door frame
  const nFrame = box(0.1, nDoorH + 0.18, nDoorW + 0.16, 0x0e0c0a, { roughness: 0.85 });
  nFrame.position.set(nDoorX + 0.02, nDoorH / 2 + 0.05, nDoorZ);
  g.add(nFrame);
  // Door leaf, on a hinge pivot so incident.js can swing it open. Everything that
  // moves with the leaf (slab, lite, badge, handle) is a child of the pivot, placed
  // relative to it; the hinge is the −Z stile, opposite the handle.
  const nHingeX = nDoorX - 0.04;
  const nHingeZ = nDoorZ - nDoorW / 2;
  const nDoorPivot = new THREE.Group();
  nDoorPivot.name = "northDoorPivot";
  nDoorPivot.position.set(nHingeX, 0, nHingeZ);
  g.add(nDoorPivot);
  // Door slab (faces north / parking)
  const nDoor = box(0.07, nDoorH, nDoorW, 0x12100e, { roughness: 0.82 });
  nDoor.position.set(0, nDoorH / 2, nDoorW / 2);
  nDoorPivot.add(nDoor);
  // Upper glass lite
  const nLite = box(0.04, 0.48, nDoorW * 0.58, 0x1a3040, {
    emissive: 0x3a6080,
    emissiveIntensity: 0.22,
    roughness: 0.28,
  });
  nLite.position.set(-0.03, nDoorH * 0.72, nDoorW / 2);
  nDoorPivot.add(nLite);
  // Stacy's diamond badge on door
  const nBadge = box(0.04, 0.28, 0.28, 0x1a1830, {
    emissive: 0x2a2850,
    emissiveIntensity: 0.15,
  });
  nBadge.position.set(-0.04, nDoorH * 0.42, nDoorW / 2);
  nBadge.rotation.x = Math.PI / 4;
  nDoorPivot.add(nBadge);
  // Handle
  const nHandle = box(0.05, 0.16, 0.06, 0xc8a868, { metalness: 0.5, roughness: 0.35 });
  nHandle.position.set(-0.06, nDoorH * 0.48, nDoorW / 2 + nDoorW * 0.28);
  nDoorPivot.add(nHandle);
  // Dark reveal behind the leaf, so an open door shows an interior rather than a hole
  const nReveal = box(0.06, nDoorH - 0.04, nDoorW - 0.04, 0x08070a, {
    roughness: 1,
    castShadow: false,
  });
  nReveal.position.set(nDoorX + 0.06, nDoorH / 2, nDoorZ);
  g.add(nReveal);
  // Small Spanish-tile awning over door
  const nAwning = box(0.75, 0.1, nDoorW + 0.55, tile, { roughness: 0.88 });
  nAwning.position.set(nDoorX + 0.05, nDoorH + 0.38, nDoorZ);
  g.add(nAwning);
  for (let i = 0; i < 4; i++) {
    const ridge = box(0.14, 0.06, nDoorW + 0.5, tileDark, { roughness: 0.88 });
    ridge.position.set(nDoorX - 0.05 - i * 0.1, nDoorH + 0.46, nDoorZ);
    g.add(ridge);
  }
  const nAwningFascia = box(0.08, 0.1, nDoorW + 0.5, 0x3a2010, { roughness: 0.9 });
  nAwningFascia.position.set(nDoorX - 0.32, nDoorH + 0.32, nDoorZ);
  g.add(nAwningFascia);
  const nSill = box(0.45, 0.12, nDoorW + 0.25, brickDark, { roughness: 0.92 });
  nSill.position.set(nDoorX - 0.12, 0.06, nDoorZ);
  g.add(nSill);

  // Pride flag on the wall just to the RIGHT of the door (not on the door).
  // Facing door from parking (looking +X/south): right = −Z (toward mural).
  // Door spans nDoorZ ± nDoorW/2; place past the −Z frame edge onto brick.
  const nDoorRightZ = nDoorZ - nDoorW * 0.5 - 0.22;
  addHangingPrideFlag(
    g,
    gableX - 0.16, // mount on north wall face
    nDoorH + 0.18, // arm height ≈ top of door
    nDoorRightZ,
    1.0,
    Math.PI // hang outward into parking
  );

  // —— Building rear wall (faces patio): door into venue + wall-mounted TV ——
  const rearZ = bZ - d / 2 - 0.05;
  // Door into the building from patio (left of center)
  const rearDoorX = -1.15;
  const rearDoorW = 0.9;
  const rearDoorH = 1.85;
  const rearDoor = box(rearDoorW, rearDoorH, 0.1, 0x1a1410);
  rearDoor.position.set(rearDoorX, rearDoorH / 2, rearZ);
  g.add(rearDoor);
  // Door frame
  const doorFrame = box(rearDoorW + 0.16, rearDoorH + 0.1, 0.08, 0x2a2218);
  doorFrame.position.set(rearDoorX, rearDoorH / 2 + 0.02, rearZ + 0.02);
  g.add(doorFrame);
  // Window lite in upper door
  const doorLite = box(rearDoorW * 0.55, 0.45, 0.04, 0x1a3040, {
    emissive: 0x3a6080,
    emissiveIntensity: 0.2,
    roughness: 0.3,
  });
  doorLite.position.set(rearDoorX, rearDoorH * 0.68, rearZ - 0.04);
  g.add(doorLite);
  // Handle on patio side (−Z)
  const rearHandle = box(0.06, 0.14, 0.06, 0xc0a060, { metalness: 0.45, roughness: 0.4 });
  rearHandle.position.set(rearDoorX + rearDoorW * 0.28, rearDoorH * 0.48, rearZ - 0.08);
  g.add(rearHandle);
  // Small step/sill at door
  const doorSill = box(rearDoorW + 0.25, 0.08, 0.28, brickDark);
  doorSill.position.set(rearDoorX, 0.05, rearZ - 0.15);
  g.add(doorSill);

  // Flat-screen TV mounted on rear facade (right of door), facing patio
  const tvX = 1.25;
  const tvY = 1.55;
  const tvW = 1.35;
  const tvH = 0.82;
  // Mount bracket / backplate
  const tvMount = box(tvW + 0.12, tvH + 0.12, 0.06, 0x1a1a1e);
  tvMount.position.set(tvX, tvY, rearZ + 0.01);
  g.add(tvMount);
  // Bezel
  const tvBezel = box(tvW, tvH, 0.08, 0x0a0a0c);
  tvBezel.position.set(tvX, tvY, rearZ - 0.04);
  g.add(tvBezel);
  // Screen (glowing)
  const tvScreen = box(tvW * 0.9, tvH * 0.86, 0.04, 0x1a2848, {
    emissive: 0x2a5088,
    emissiveIntensity: 0.45,
    roughness: 0.25,
    metalness: 0.1,
  });
  tvScreen.position.set(tvX, tvY, rearZ - 0.08);
  g.add(tvScreen);
  // Simple content bars (sports-bar screen suggestion)
  for (let i = 0; i < 3; i++) {
    const bar = box(tvW * 0.7, 0.06, 0.02, 0x4a90d0, {
      emissive: 0x3a70b0,
      emissiveIntensity: 0.35,
    });
    bar.position.set(tvX, tvY + 0.18 - i * 0.14, rearZ - 0.1);
    g.add(bar);
  }
  // Thin soundbar under TV
  const soundbar = box(tvW * 0.75, 0.08, 0.1, 0x1a1a1e);
  soundbar.position.set(tvX, tvY - tvH / 2 - 0.12, rearZ - 0.05);
  g.add(soundbar);

  // —— Ground-level purple patio (3 sides; building rear is 4th wall) ——
  const patW = w; // full building width
  const patD = 2.8;
  const wallH = 1.2; // purple CMU perimeter height
  const wallT = 0.28; // wall thickness
  const patX = 0;
  // Patio sits against building rear, open toward −Z
  const patZ = bZ - d / 2 - patD / 2 - 0.08;
  // Thin ground slab — furniture at ground level
  const patFloor = box(patW - wallT * 2, 0.06, patD - wallT, 0x4a4440, {
    castShadow: false,
    receiveShadow: true,
  });
  patFloor.position.set(patX, 0.04, patZ - wallT * 0.25);
  g.add(patFloor);

  // Purple CMU walls: rear + left + right only (building is the patio's back wall)
  const wallSpecs = [
    // outer rear wall (away from building)
    [patX, patZ - patD / 2 + wallT / 2, patW, wallT],
    // left / right
    [patX - patW / 2 + wallT / 2, patZ, wallT, patD],
    [patX + patW / 2 - wallT / 2, patZ, wallT, patD],
  ];
  for (const [wx, wz, ww, wd] of wallSpecs) {
    const wall = box(ww, wallH, wd, purpleLite, { roughness: 0.9 });
    wall.position.set(wx, wallH / 2, wz);
    g.add(wall);
    for (let i = 0; i < 3; i++) {
      const line = box(ww + 0.02, 0.04, wd + 0.02, purple);
      line.position.set(wx, 0.3 + i * 0.35, wz);
      g.add(line);
    }
  }

  // Black metal mesh fence on top of purple walls (3 sides only)
  const fenceH = 0.9;
  for (const [fx, fz, fw, fd] of [
    [patX, patZ - patD / 2, patW, 0.06],
    [patX - patW / 2, patZ, 0.06, patD],
    [patX + patW / 2, patZ, 0.06, patD],
  ]) {
    const top = box(fw, 0.06, fd, 0x1a1a1e);
    top.position.set(fx, wallH + fenceH, fz);
    g.add(top);
    const bars = Math.max(5, Math.round((fw > fd ? fw : fd) * 2.2));
    for (let i = 0; i < bars; i++) {
      if (fw > fd) {
        const v = box(0.04, fenceH, 0.04, 0x2a2a30);
        v.position.set(
          fx - fw / 2 + (i + 0.5) * (fw / bars),
          wallH + fenceH / 2,
          fz
        );
        g.add(v);
      } else {
        const v = box(0.04, fenceH, 0.04, 0x2a2a30);
        v.position.set(
          fx,
          wallH + fenceH / 2,
          fz - fd / 2 + (i + 0.5) * (fd / bars)
        );
        g.add(v);
      }
    }
  }

  // Open shade structure from ground level: poles + thin tension sails
  const poleH = 2.6;
  const sailMat = (color) =>
    mat(color, {
      roughness: 0.95,
      metalness: 0.02,
      transparent: true,
      opacity: 0.72,
    });
  const poles = [
    [-patW * 0.38, patZ + patD * 0.28],
    [-patW * 0.08, patZ - patD * 0.28],
    [patW * 0.12, patZ + patD * 0.25],
    [patW * 0.38, patZ - patD * 0.25],
    [-patW * 0.22, patZ - patD * 0.02],
    [patW * 0.25, patZ + patD * 0.02],
  ];
  for (const [px, pz] of poles) {
    const pole = cyl(0.04, 0.05, poleH, 0x2a2a30, { metalness: 0.35, roughness: 0.45 }, 5);
    pole.position.set(px, poleH / 2, pz);
    g.add(pole);
  }
  const addSail = (x, y, z, sw, sd, rotX, rotZ, color) => {
    const sail = new THREE.Mesh(
      new THREE.BoxGeometry(sw, 0.03, sd),
      sailMat(color)
    );
    sail.position.set(x, y, z);
    sail.rotation.x = rotX;
    sail.rotation.z = rotZ;
    sail.castShadow = false;
    sail.receiveShadow = false;
    g.add(sail);
  };
  addSail(-patW * 0.25, 2.35, patZ + 0.05, 2.4, 1.35, 0.18, 0.1, 0x3a3228);
  addSail(patW * 0.05, 2.5, patZ - 0.1, 2.1, 1.2, -0.14, -0.08, 0x4a3a28);
  addSail(patW * 0.3, 2.4, patZ + 0.08, 2.0, 1.15, 0.12, 0.12, 0x3a3020);
  for (const [x0, z0, x1, z1] of [
    [-patW * 0.38, patZ + patD * 0.28, -patW * 0.08, patZ - patD * 0.28],
    [patW * 0.12, patZ + patD * 0.25, patW * 0.38, patZ - patD * 0.25],
    [-patW * 0.22, patZ - patD * 0.02, patW * 0.25, patZ + patD * 0.02],
  ]) {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    const cable = box(len, 0.03, 0.03, 0x1a1a1e, { metalness: 0.4, roughness: 0.5 });
    cable.position.set((x0 + x1) / 2, poleH - 0.05, (z0 + z1) / 2);
    cable.rotation.y = Math.atan2(dx, dz);
    g.add(cable);
  }

  // Patio tables + chairs at GROUND level (inside hollow purple walls)
  const addPatioTable = (tx, tz, rotY = 0) => {
    const tg = new THREE.Group();
    const top = cyl(0.38, 0.38, 0.06, 0xc4a882, { roughness: 0.75 }, 8);
    top.position.y = 0.72;
    tg.add(top);
    const stem = cyl(0.06, 0.08, 0.62, 0x5a5048, {}, 6);
    stem.position.y = 0.38;
    tg.add(stem);
    const base = cyl(0.22, 0.22, 0.05, 0x4a4440, {}, 6);
    base.position.y = 0.06;
    tg.add(base);
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const cx = Math.cos(ang) * 0.58;
      const cz = Math.sin(ang) * 0.58;
      const seat = box(0.32, 0.05, 0.32, 0x3a3428);
      seat.position.set(cx, 0.42, cz);
      tg.add(seat);
      const back = box(0.32, 0.38, 0.05, 0x3a3428);
      back.position.set(cx + Math.cos(ang) * 0.12, 0.62, cz + Math.sin(ang) * 0.12);
      back.rotation.y = -ang;
      tg.add(back);
      const leg = box(0.05, 0.4, 0.05, 0x2a2824);
      leg.position.set(cx, 0.22, cz);
      tg.add(leg);
    }
    tg.position.set(tx, 0, tz); // ground level
    tg.rotation.y = rotY;
    g.add(tg);
  };
  addPatioTable(-patW * 0.32, patZ + 0.15, 0.1);
  addPatioTable(-patW * 0.08, patZ - 0.25, -0.15);
  addPatioTable(patW * 0.16, patZ + 0.2, 0.2);
  addPatioTable(patW * 0.38, patZ - 0.15, -0.05);

  // —— Patio night lights: brighter neon string bulbs that glimmer ——
  const patioNeonCols = [
    COLORS.neonPink,
    0xb06aff,
    COLORS.neonCyan,
    0xff9ad0,
    0xffffff,
    COLORS.neonPink,
    0xff6bcb,
    COLORS.neonCyan,
  ];
  addPatioStringLights(
    g,
    nightMats,
    poles.map(([px, pz]) => [px, pz]),
    poleH - 0.12,
    patioNeonCols,
    1.15,
    { night: 1.45, segs: 7, glimmer: true }
  );
  // Hot neon LED rails on purple CMU (glimmer)
  for (const [lx, lz, lw, ld] of [
    [patX, patZ - patD / 2, patW * 0.94, 0.08],
    [patX - patW / 2, patZ, 0.08, patD * 0.92],
    [patX + patW / 2, patZ, 0.08, patD * 0.92],
  ]) {
    const led = addNeon(lw, 0.07, ld, 0xd060ff, 1.35);
    led.position.set(lx, wallH + 0.05, lz);
    g.add(led);
    if (nightMats.length) {
      nightMats[nightMats.length - 1].glimmer = true;
      nightMats[nightMats.length - 1].glimmerSpeed = 2.4;
    }
  }
  // Fence-line neon bulbs
  for (let i = 0; i < 10; i++) {
    const t = i / 10;
    const fx = patX - patW * 0.44 + t * patW * 0.88;
    const col = patioNeonCols[i % patioNeonCols.length];
    const bulb = addNeon(0.12, 0.14, 0.12, col, 1.4);
    bulb.position.set(fx, wallH + fenceH - 0.02, patZ - patD / 2 + 0.02);
    g.add(bulb);
    if (nightMats.length) {
      nightMats[nightMats.length - 1].glimmer = true;
      nightMats[nightMats.length - 1].glimmerSpeed = 2.8 + (i % 4) * 0.35;
      nightMats[nightMats.length - 1].phase = i * 0.7;
    }
  }
  const stacyPatioLight = new THREE.PointLight(0xff60d0, 0, 9, 2);
  stacyPatioLight.position.set(patX, poleH - 0.25, patZ);
  stacyPatioLight.castShadow = false;
  g.add(stacyPatioLight);
  // Second cooler wash for neon color mix
  const stacyPatioLight2 = new THREE.PointLight(0x80c0ff, 0, 7, 2);
  stacyPatioLight2.position.set(patX + 1.2, wallH + 0.8, patZ - 0.4);
  stacyPatioLight2.castShadow = false;
  g.add(stacyPatioLight2);

  // —— Interior dance lights (flash through rear wall / patio-facing openings) ——
  const danceColors = [
    0xff4d8d,
    0x9b6dff,
    0x4de0ff,
    0xffc14d,
    0x5dff9a,
    0xff6b9a,
  ];
  // Glowing "window" panes on rear facade facing patio
  for (const [dx, dy] of [
    [-1.8, 1.5],
    [-0.5, 1.7],
    [0.7, 1.45],
    [1.9, 1.65],
  ]) {
    const pane = box(0.55, 0.45, 0.06, 0x2a1840, {
      emissive: danceColors[0],
      emissiveIntensity: 0.03,
      roughness: 0.35,
    });
    pane.position.set(dx, dy, rearZ - 0.02);
    g.add(pane);
    flashMats.push({
      mat: pane.material,
      day: 0.03,
      night: 1.05,
      colors: danceColors,
      speed: 3.8 + Math.abs(dx) * 0.3,
      beat: 2.2,
      colorSpeed: 1.9,
    });
  }
  // Two low PointLights inside / at rear wall for color wash on patio
  for (const [dx, col] of [
    [-0.9, 0xff4d8d],
    [1.0, 0x4de0ff],
  ]) {
    const pl = new THREE.PointLight(col, 0, 5.5, 2);
    pl.position.set(dx, 1.4, rearZ + 0.35);
    pl.castShadow = false;
    g.add(pl);
    flashLights.push({
      light: pl,
      night: 1.35,
      speed: 4.8,
      colors: danceColors,
    });
  }

  // HVAC units on rear roof slope (not patio)
  const hvac = box(0.7, 0.45, 0.55, 0x8a9098, { metalness: 0.3, roughness: 0.55 });
  hvac.position.set(w * 0.15, ridgeY - 0.15, bZ - d * 0.18);
  hvac.rotation.x = -roofPitch * 0.5;
  g.add(hvac);
  const hvac2 = box(0.55, 0.35, 0.45, 0x7a8088, { metalness: 0.3, roughness: 0.55 });
  hvac2.position.set(w * 0.28, ridgeY - 0.35, bZ - d * 0.28);
  hvac2.rotation.x = -roofPitch * 0.5;
  g.add(hvac2);

  // —— Front landmarks: shade tree (left) + rainbow Converse (right) ——
  // Sit slightly above desert bed so they rest on the soil, not sink into asphalt
  const yardSurfY = 0.2;
  // Fixed in the landscaped strip (not tied to yard center as bed expands SW)
  // Tree sits in front of the PORCH (north end), as in IMG_0628 — not in front
  // of the sign. At the game camera its canopy otherwise buries the wordmark.
  // Out in the front yard rather than tight to the wall: at el 42 a 5-unit tree
  // standing against a 2.85-unit facade always drapes its canopy over the wall,
  // and the porch detail is the thing worth seeing.
  const treeX = -2.7;
  const treeZ = frontZ + 2.95;
  const shoeX = 0.95;
  const shoeZ = frontZ + 2.0;
  // Ghost-gum eucalyptus, not the generic dark-trunk shade tree. The trees in
  // front of Stacy's are pale multi-trunk eucalyptus (IMG_0628, and the roof
  // screenshot) — a very Phoenix silhouette, and the white bark reads well
  // against the olive block.
  const tree = createGumTree(treeX, treeZ, 1.15, 7);
  tree.position.y = yardSurfY;
  g.add(tree);
  const shoe = createRainbowConverse(shoeX, shoeZ, 1.15 * 0.92); // ~8% smaller
  shoe.position.y = yardSurfY;
  // Local +X = toe; −3π/4 aims toe northwest (−X north, +Z west / 7th)
  shoe.rotation.y = -Math.PI * 0.75;
  g.add(shoe);

  // Sparse wispy scrub, not the dark green blobs that were here — the photo has
  // thin olive-grey bushes you can see the ground through.
  addDesertScrub(g, 0.15, treeZ + 0.5, 0.95, padTop, 3);
  addDesertScrub(g, yardXMax - 1.2, yardZMax - 0.9, 1.1, padTop, 7);
  addDesertScrub(g, yardXMax - 0.75, yardZMin + 1.0, 0.8, padTop, 11);

  // Bike racks: galvanized inverted-U hoops on a rail, as in IMG_0628.
  // Previously two flat grey posts.
  {
    const hoopN = 4;
    const pitch = 0.34;
    const rackX = shoeX + 1.5;
    const rackZ = shoeZ - 0.45;
    const steel = { metalness: 0.55, roughness: 0.35 };
    for (let i = 0; i < hoopN; i++) {
      // Hoops step along X (north-south) with each U in the ZY plane, so from
      // the street they read as a row of separate hoops. Spacing them along Z
      // stacked them behind one another and looked like a ladder.
      const hx = rackX - ((hoopN - 1) * pitch) / 2 + i * pitch;
      for (const lz of [-0.19, 0.19]) {
        const leg = cyl(0.026, 0.026, 0.46, 0xa8aeb4, steel, 6);
        leg.position.set(hx, padTop + 0.23, rackZ + lz);
        g.add(leg);
      }
      const top = cyl(0.026, 0.026, 0.38, 0xa8aeb4, steel, 6);
      top.rotation.x = Math.PI / 2;
      top.position.set(hx, padTop + 0.46, rackZ);
      g.add(top);
      for (const sz of [-0.19, 0.19]) {
        const sh = cyl(0.026, 0.026, 0.1, 0xa8aeb4, steel, 6);
        sh.rotation.x = sz < 0 ? Math.PI / 4 : -Math.PI / 4;
        sh.position.set(hx, padTop + 0.43, rackZ + sz * 0.86);
        g.add(sh);
      }
    }
    // Ground rail tying the hoops together
    const rail = cyl(0.022, 0.022, (hoopN - 1) * pitch + 0.16, 0x9aa0a6, steel, 6);
    rail.rotation.z = Math.PI / 2;
    rail.position.set(rackX, padTop + 0.05, rackZ);
    g.add(rail);
  }

  // —— Vegas-style diamond pole sign @ NW parking corner ——
  // Local −X = north, +Z = west (toward 7th). Tucked inside the asphalt corner.
  // Faces point N–S so the diamond reads when driving along 7th Ave.
  const padWest = padCz + padD * 0.5;
  const diamondSignX = northPadEdge + 0.48;
  const diamondSignZ = padWest - 0.48;
  const diamondSign = createStacysDiamondPoleSign(diamondSignX, diamondSignZ);
  diamondSign.rotation.y = Math.PI / 2; // ±Z faces → ±X (north / south)
  g.add(diamondSign);

  // Taco stand — off the road, north of the property line by the diamond pole.
  // Layout (north −X ←):  [SUV]  gap  [TENT]  gap  [SIGN on pad / building]
  // SUV parks on the FAR side of the tent from the building so it is not in the
  // way of the lot, the sign, or the serving face.
  // Tent half-size ~1.15, SUV ~1.2 wide when parked parallel to 7th — keep ≥0.6 clear.
  const tacoTentX = northPadEdge - 3.15;
  const tacoTentZ = diamondSignZ - 0.2;
  g.userData.tacoStand = {
    x: tacoTentX,
    z: tacoTentZ,
    // Curb approach abeam the tent (unload still near the stand)
    unloadX: tacoTentX + 0.4,
    unloadZ: diamondSignZ + 1.15,
    // Park north of the tent (−X), away from the building and sign
    parkX: tacoTentX - 2.55,
    parkZ: tacoTentZ + 0.35,
    /** Tent serving face toward the lot/sign (+X). SUV parks facing the street. */
    faceY: Math.PI / 2,
    parkFaceY: 0,
  };
  // Diamond marquee — white neon text + pink edge glow at night (Boycott-bright)
  diamondSign.traverse((obj) => {
    if (!obj.isMesh || !obj.material?.emissive) return;
    const isFace = obj.name === "stacysDiamondFace";
    const isBulb = obj.name === "stacysDiamondBulb";
    if (isFace) {
      obj.material.emissive.setHex(0xffffff);
      obj.material.emissiveIntensity = 0.02;
    }
    const nightI = isFace ? 2.1 : isBulb ? 1.55 : Math.max(1.1, obj.material.emissiveIntensity || 0.6);
    trackNightMat(nightMats, obj.material, nightI, isFace ? 0.02 : 0.02, {
      glimmer: true,
      glimmerSpeed: isFace ? 2.0 : 2.8,
    });
  });
  // Soft wash under the diamond so the marquee “shines”
  const diamondWash = new THREE.PointLight(0xffe0f0, 0, 9, 2);
  diamondWash.position.set(diamondSignX, 3.6, diamondSignZ);
  diamondWash.castShadow = false;
  g.add(diamondWash);

  // —— Dumpster @ NE property corner (−X north, −Z east / patio side) ——
  const padEast = padCz - padD * 0.5;
  const padNorth = padCx - padW * 0.5;
  const dumpsterX = padNorth + 0.75; // inset from north edge
  const dumpsterZ = padEast + 0.65; // inset from east edge
  const dumpster = createDumpster(dumpsterX, dumpsterZ);
  dumpster.rotation.y = Math.PI * 0.5; // face into the lot
  dumpster.name = "dumpster"; // chores.js + garbage truck animate this
  dumpster.userData.displayName = "Leslie";
  g.add(dumpster);

  // Day: patio neon / marquee / dance lights off · Night: full glow + glimmer + flashes
  installVenueNight(g, nightMats, {
    lights: [
      { light: stacyPatioLight, day: 0, night: 1.85 },
      { light: stacyPatioLight2, day: 0, night: 1.25 },
      { light: signWash, day: 0, night: 2.0 },
      { light: diamondWash, day: 0, night: 2.05 },
    ],
    flashMats,
    flashLights,
  });

  addPick(g, w + 1.5, h + gableH + 0.8, d + frontExtra + 1.2, 2.6);

  // —— Visit metadata (stall / door / driveway coordinates, local space) ——
  // addParkingStalls only paints stripes and wheel stops; the coordinates an
  // agent sim needs are not derivable from the geometry, so publish them here
  // where the lot variables are still in scope. In the parent game this same
  // shape comes from the map's parcel data.
  //
  // Stall centers match addParkingStalls' `across` formula for depthAxis "x":
  //   across = -span * 0.38 + i * (span * 0.85) / (count - 1)
  // Cars nose toward −X (the wheel stops on the outer property edge) and pull
  // in from the aisle on the building side, so faceY points down −X.
  const stallSpots = [];
  for (let i = 0; i < northStallCount; i++) {
    const across =
      -northLotSpan * 0.38 +
      (i * (northLotSpan * 0.85)) / Math.max(1, northStallCount - 1);
    stallSpots.push({
      x: nLotX,
      y: markY + 0.02,
      z: nLotZ + across,
      // Approach sits in the aisle, abeam the stall
      approachX: aisleCenterX,
      approachZ: nLotZ + across,
      faceY: -Math.PI / 2,
      vehicleAccess: true,
    });
  }
  g.userData.parkingSpots = stallSpots;

  // Driveway: mouth at the street (+Z) end of the aisle, then up the aisle.
  g.userData.driveway = {
    mouthX: aisleCenterX,
    mouthZ: padCz + padD * 0.5,
    aisleX: aisleCenterX,
    aisleZ: nLotZ + northLotSpan * 0.5,
  };

  // Light fixtures, for flicker.js. Meshes are resolved by name (see
  // "wallSignFace", "porchLantern", "stacysDiamondFace"/"Bulb"); these PointLights
  // have no mesh to name, so they are published directly. setNight() rewrites every
  // one of these every frame, which is what lets flicker safely multiply them.
  g.userData.fixtures = {
    wallSignWash: signWash,
    poleSignWash: diamondWash,
    patioWashes: [stacyPatioLight, stacyPatioLight2],
  };

  // Property pad extents, local space. pocket.js uses zMax to sit the lot flush
  // against the sidewalk instead of overlapping it.
  g.userData.pad = {
    xMin: padCx - padW / 2,
    xMax: padCx + padW / 2,
    zMin: padCz - padD / 2,
    zMax: padCz + padD / 2,
    /** Top of the asphalt. Anything laid flat on the lot must clear this or it is
     *  buried — the puddle in incident.js sat at 0.02 and was invisible. */
    topY: padTop,
  };

  // Main ridge line (local space) — bird perch hops along this.
  // Caps sit ~0.06 above ridgeY; bird feet need a little more clearance.
  g.userData.roof = {
    ridgeY: ridgeY + 0.12,
    ridgeZ: bZ,
    xMin: northRoofX + 0.55,
    xMax: southRoofX - 0.45,
    eaveY,
  };

  // North side door, for incident.js. The leaf hangs on "northDoorPivot"; a negative
  // rotation.y swings it out into the parking lot (its face points −X).
  g.userData.northDoor = {
    x: nDoorX,
    z: nDoorZ,
    /** Standing spot just outside, clear of the swinging leaf. */
    outsideX: nDoorX - 0.85,
    outsideZ: nDoorZ,
    openAngle: -1.35,
  };

  // Rear patio bounds, for the misting system. Interior extents (inside the CMU),
  // plus the fence rail height where misting lines actually get mounted.
  g.userData.patio = {
    xMin: patX - patW / 2 + wallT,
    xMax: patX + patW / 2 - wallT,
    zMin: patZ - patD / 2 + wallT,
    zMax: patZ + patD / 2,
    floorY: 0.07,
    wallTopY: wallH,
    railY: wallH + fenceH,
  };

  // Leslie the dumpster — take-out-the-trash chore + garbage truck empties.
  // `approach` is where a worker stands to toss a bag in — offset into the lot,
  // since the far sides of the dumpster are up against the property edges.
  g.userData.dumpster = {
    name: "Leslie",
    x: dumpsterX,
    z: dumpsterZ,
    approachX: dumpsterX + 0.95,
    approachZ: dumpsterZ + 0.55,
    /**
     * Front-loader stop: further into the lot so the longer nose + forks reach
     * Leslie without the body clipping the property edge.
     */
    serviceX: dumpsterX + 2.85,
    serviceZ: dumpsterZ + 2.45,
    lidY: 1.08,
  };

  // Doors: the carved double door on the street face, and the rear patio door.
  // Patio spots are ground-level hangout points inside the purple walls.
  g.userData.venueAccess = {
    doors: [
      { x: porchX, z: porchZ + porchD / 2 + 0.35, kind: "street" },
      { x: -w * 0.18, z: patZ + patD / 2 + 0.15, kind: "patio" },
    ],
    patio: [
      { x: patX - patW * 0.28, z: patZ + patD * 0.16 },
      { x: patX - patW * 0.1, z: patZ - patD * 0.2 },
      { x: patX + patW * 0.12, z: patZ + patD * 0.2 },
      { x: patX + patW * 0.3, z: patZ - patD * 0.14 },
    ],
  };

  return g;
}
