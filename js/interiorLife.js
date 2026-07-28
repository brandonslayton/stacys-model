/**
 * interiorLife.js — lot-style guests inside the pocket club.
 *
 * People use the same low-poly createPedestrian look as the lot. They enter
 * through the front door, walk to the bar and order, the bartender pours
 * quickly, then they mingle, visit the patio, or take a karaoke turn — and
 * eventually leave the way they came.
 */
import * as THREE from "three";
import { box, cyl } from "./kit.js";
import { createPedestrian, PED_COLORS } from "./agents.js";

const WALK = 1.55;
const WALK_FAST = 1.85;
const PED_MIN = 0.5;
const MAX_GUESTS = 12;
const TARGET_BUSY = 8;

/** Guest AI states. */
const GS = {
  ENTER: "enter",
  TO_BAR: "to_bar",
  ORDER: "order",
  WAIT_DRINK: "wait_drink",
  SIP: "sip",
  MINGLE: "mingle",
  TO_PATIO: "to_patio",
  PATIO: "patio",
  FROM_PATIO: "from_patio",
  TO_STAGE: "to_stage",
  SING: "sing",
  EXIT: "exit",
  GONE: "gone",
};

/** Karaoke host states. */
const HS = {
  IDLE: "idle",
  INTRO: "intro",
  WATCH: "watch",
  CALL: "call",
};

function pick(arr) {
  return arr[(Math.random() * arr.length) | 0];
}

function v3(x, y, z) {
  return new THREE.Vector3(x, y, z);
}

function makeMic() {
  const g = new THREE.Group();
  g.name = "handMic";
  const stick = cyl(0.012, 0.012, 0.16, 0x2a2a32, { metalness: 0.4, roughness: 0.4 }, 6);
  stick.position.y = 0.08;
  g.add(stick);
  const grille = cyl(0.035, 0.032, 0.06, 0x1a1a22, { metalness: 0.35, roughness: 0.45 }, 8);
  grille.position.y = 0.18;
  g.add(grille);
  const ring = cyl(0.038, 0.038, 0.015, 0xc8a040, { metalness: 0.5, roughness: 0.35 }, 8);
  ring.position.y = 0.15;
  g.add(ring);
  return g;
}

/** Lot pedestrian + hand mic + drink prop. */
function makeGuest(color) {
  const mesh = createPedestrian(color);
  mesh.userData.bob = Math.random() * Math.PI * 2;
  mesh.userData.color = color;

  const mic = makeMic();
  mic.position.set(0.16, 0.78, 0.12);
  mic.rotation.x = -0.35;
  mic.visible = false;
  mesh.add(mic);
  mesh.userData.mic = mic;

  const drink = cyl(0.03, 0.035, 0.1, 0x80d0e8, {
    transparent: true,
    opacity: 0.55,
    roughness: 0.2,
    metalness: 0.1,
  }, 6);
  drink.position.set(0.14, 0.72, 0.14);
  drink.visible = false;
  mesh.add(drink);
  mesh.userData.drink = drink;

  return mesh;
}

/** Karaoke host — same body language as lot peds, flashier shirt + always-mic. */
function makeHost() {
  const mesh = makeGuest(0xff4fa8);
  mesh.name = "karaokeHost";
  mesh.scale.set(1.06, 1.08, 1.06);
  // Sparkle jacket stripe
  const stripe = box(0.18, 0.12, 0.14, 0xffe080, {
    emissive: 0xffc040,
    emissiveIntensity: 0.45,
    roughness: 0.4,
  });
  stripe.position.set(0, 0.62, 0.1);
  mesh.add(stripe);
  if (mesh.userData.mic) mesh.userData.mic.visible = true;
  return mesh;
}

/** Fixed mic stand on the performance stage. */
export function buildStageMicStand() {
  const g = new THREE.Group();
  g.name = "stageMicStand";
  const base = cyl(0.12, 0.14, 0.04, 0x2a2a32, { metalness: 0.4, roughness: 0.5 }, 8);
  base.position.y = 0.02;
  g.add(base);
  const pole = cyl(0.018, 0.018, 1.15, 0x3a3e46, { metalness: 0.5, roughness: 0.35 }, 6);
  pole.position.y = 0.6;
  g.add(pole);
  const boom = cyl(0.012, 0.012, 0.28, 0x3a3e46, { metalness: 0.5, roughness: 0.35 }, 6);
  boom.rotation.z = Math.PI / 2;
  boom.position.set(0.12, 1.2, 0);
  g.add(boom);
  const mic = makeMic();
  mic.position.set(0.26, 1.2, 0);
  mic.rotation.z = -0.4;
  g.add(mic);
  return g;
}

function advance(mesh, path, pathI, speed, dt, finalFaceY = null) {
  if (!path?.length || pathI >= path.length) {
    if (finalFaceY != null) mesh.rotation.y = finalFaceY;
    return { done: true, pathI };
  }
  const target = path[pathI];
  const pos = mesh.position;
  const dx = target.x - pos.x;
  const dz = target.z - pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.14) {
    pos.x = target.x;
    pos.z = target.z;
    const next = pathI + 1;
    if (next >= path.length) {
      if (finalFaceY != null) mesh.rotation.y = finalFaceY;
      return { done: true, pathI: next };
    }
    return { done: false, pathI: next };
  }
  const step = Math.min(dist, speed * dt);
  pos.x += (dx / dist) * step;
  pos.z += (dz / dist) * step;
  mesh.rotation.y = Math.atan2(dx, dz);
  // Walk bob like outdoor peds
  mesh.userData.bob = (mesh.userData.bob || 0) + dt * 10;
  mesh.position.y = Math.abs(Math.sin(mesh.userData.bob)) * 0.035;
  return { done: false, pathI };
}

function separate(mesh, others, minDist = PED_MIN) {
  if (!mesh?.visible) return;
  for (const o of others) {
    if (!o || o === mesh || !o.visible) continue;
    const dx = mesh.position.x - o.position.x;
    const dz = mesh.position.z - o.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-4 || d >= minDist) continue;
    const push = (minDist - d) * 0.5;
    mesh.position.x += (dx / d) * push;
    mesh.position.z += (dz / d) * push;
  }
}

/**
 * @param {THREE.Group} root interior root
 * @param {object} anchors layout hooks from createInterior
 */
export function createInteriorLife(root, anchors) {
  const {
    entrance,
    barFrontX,
    stoolZs,
    mingleSpots,
    patioDoor,
    patioSpot,
    stage,
    walk,
    bartender,
  } = anchors;

  const group = new THREE.Group();
  group.name = "interiorLife";
  root.add(group);

  // Stage mic stand
  if (stage) {
    const stand = buildStageMicStand();
    stand.position.set(stage.x + 0.15, stage.y, stage.z);
    group.add(stand);
  }

  const guests = [];
  for (let i = 0; i < MAX_GUESTS; i++) {
    const mesh = makeGuest(PED_COLORS[i % PED_COLORS.length]);
    mesh.visible = false;
    group.add(mesh);
    guests.push({
      mesh,
      state: GS.GONE,
      path: null,
      pathI: 0,
      speed: WALK,
      timer: 0,
      stoolI: -1,
      mingleI: 0,
      hasDrink: false,
      sang: false,
      life: 0,
    });
  }

  // Karaoke host (lot-style ped, pink)
  const hostMesh = makeHost();
  hostMesh.visible = false;
  group.add(hostMesh);
  const host = {
    mesh: hostMesh,
    state: HS.IDLE,
    timer: 0,
    path: null,
    pathI: 0,
  };

  const barSlots = (stoolZs || []).map((z, i) => ({
    i,
    x: barFrontX - 0.55,
    z,
    guest: null,
  }));

  let spawnAcc = 2.5; // first guest soon after enter
  let lastT = 0;
  let karaokeOn = true;
  let singer = null; // guest currently on stage

  const clampToWalk = (mesh) => {
    if (!walk) return;
    mesh.position.x = THREE.MathUtils.clamp(mesh.position.x, walk.xMin, walk.xMax);
    mesh.position.z = THREE.MathUtils.clamp(mesh.position.z, walk.zMin, walk.zMax);
  };

  const allMeshes = () => {
    const out = [];
    for (const g of guests) if (g.mesh.visible) out.push(g.mesh);
    if (host.mesh.visible) out.push(host.mesh);
    return out;
  };

  const freeSlot = () => barSlots.find((s) => !s.guest) || null;

  const releaseSlot = (g) => {
    if (g.stoolI >= 0 && barSlots[g.stoolI]) {
      if (barSlots[g.stoolI].guest === g) barSlots[g.stoolI].guest = null;
    }
    g.stoolI = -1;
  };

  const pathTo = (from, to, via = []) => {
    const pts = [];
    // Soft mid-room waypoints so they don't cut through the bar body
    for (const p of via) pts.push(v3(p.x, 0, p.z));
    pts.push(v3(to.x, 0, to.z));
    return pts;
  };

  const roomVia = (from, to) => {
    // Prefer a mid-room dogleg when crossing far
    const mid = {
      x: THREE.MathUtils.clamp((from.x + to.x) * 0.5, walk?.xMin ?? -4, walk?.xMax ?? 2),
      z: THREE.MathUtils.clamp((from.z + to.z) * 0.5, walk?.zMin ?? -3, walk?.zMax ?? 3),
    };
    // Pull mid toward open floor (away from bar)
    mid.x = Math.min(mid.x, (walk?.xMax ?? 2) - 0.4);
    if (Math.hypot(to.x - from.x, to.z - from.z) > 2.2) return [mid];
    return [];
  };

  const setPath = (g, to, faceY = null, speed = WALK) => {
    const from = { x: g.mesh.position.x, z: g.mesh.position.z };
    g.path = pathTo(from, to, roomVia(from, to));
    g.pathI = 0;
    g.speed = speed;
    g.faceY = faceY;
  };

  const faceBar = Math.PI / 2; // +X toward bartender
  const faceStage = Math.PI; // face roughly into room / audience (+Z-ish depends) — stage faces east (−Z) so singer faces +Z? 
  // Stage is on west side of pit area; audience is +Z and east. Looking at axes:
  // stage at curtain east of railing. Audience in pit is further −Z? 
  // stageZ is east of curtains. Pit is east of stage (more −Z). So audience is −Z from stage.
  // Singer faces audience → face −Z → rotation.y = Math.PI
  const faceAudience = Math.PI;

  const stageSpot = stage
    ? { x: stage.x, z: stage.z + 0.05, y: stage.y }
    : { x: -2.5, z: 1.2, y: 0.3 };

  const hostHome = stage
    ? { x: stage.x - stage.len * 0.35, z: stage.z, y: stage.y }
    : { x: -3.2, z: 1.4, y: 0.3 };

  const hostWatch = stage
    ? { x: stage.x - stage.len * 0.42, z: stage.z + 0.15, y: stage.y }
    : hostHome;

  const spawnGuest = () => {
    const g = guests.find((x) => x.state === GS.GONE);
    if (!g) return false;
    const color = pick(PED_COLORS);
    // Recolor lot body cylinder (same mesh style as outdoor peds)
    if (!g.mesh.userData.bodyMat) {
      const body = g.mesh.children.find(
        (ch) => ch.isMesh && ch.position.y > 0.4 && ch.position.y < 0.7
      );
      if (body?.material) {
        body.material = body.material.clone();
        g.mesh.userData.bodyMat = body.material;
      }
    }
    g.mesh.userData.bodyMat?.color?.setHex(color);
    g.mesh.userData.color = color;
    g.mesh.position.set(entrance.x, 0, entrance.z);
    g.mesh.rotation.y = Math.atan2(0 - entrance.x, 0 - entrance.z);
    g.mesh.visible = true;
    g.mesh.userData.mic.visible = false;
    g.mesh.userData.drink.visible = false;
    g.hasDrink = false;
    g.sang = false;
    g.life = 35 + Math.random() * 55;
    g.timer = 0;
    g.state = GS.ENTER;
    // First step into the room then bar
    const slot = freeSlot();
    const first = { x: entrance.x + 0.8, z: entrance.z - 1.2 };
    if (slot) {
      slot.guest = g;
      g.stoolI = slot.i;
      setPath(g, { x: slot.x, z: slot.z }, faceBar, WALK_FAST);
      g.state = GS.TO_BAR;
    } else {
      const m = pick(mingleSpots);
      setPath(g, m, null, WALK);
      g.state = GS.MINGLE;
      g.timer = 6 + Math.random() * 8;
    }
    // Nudge first waypoint through door throat
    g.path.unshift(v3(first.x, 0, first.z));
    return true;
  };

  const beginOrder = (g) => {
    g.state = GS.ORDER;
    g.timer = 1.2 + Math.random() * 0.8;
    g.mesh.rotation.y = faceBar;
    g.mesh.position.y = 0;
    g.mesh.userData.drink.visible = false;
    // Signal bartender
    if (bartender) {
      bartender.patronPresent = true;
      bartender.serveZ = g.mesh.position.z;
      bartender.state = "serve";
      bartender.stateT = 0;
      bartender.stateDur = 3.2 + Math.random() * 1.2; // quick pour
      bartender.orderGuest = g;
    }
  };

  const finishDrink = (g) => {
    g.hasDrink = true;
    g.mesh.userData.drink.visible = true;
    g.state = GS.SIP;
    g.timer = 3 + Math.random() * 4;
    if (bartender?.orderGuest === g) bartender.orderGuest = null;
  };

  const goMingle = (g) => {
    releaseSlot(g);
    const spots = mingleSpots.filter(Boolean);
    const m = pick(spots);
    g.mingleI = (g.mingleI + 1) % Math.max(1, spots.length);
    setPath(g, m, null, WALK);
    g.state = GS.MINGLE;
    g.timer = 7 + Math.random() * 12;
  };

  const goPatio = (g) => {
    releaseSlot(g);
    setPath(g, patioSpot || patioDoor, null, WALK);
    g.state = GS.TO_PATIO;
  };

  const goStage = (g) => {
    releaseSlot(g);
    singer = g;
    setPath(
      g,
      { x: stageSpot.x, z: stageSpot.z },
      faceAudience,
      WALK_FAST
    );
    g.state = GS.TO_STAGE;
    // Host intro
    if (karaokeOn && host.mesh.visible) {
      host.state = HS.INTRO;
      host.timer = 2.5;
    }
  };

  const goExit = (g) => {
    releaseSlot(g);
    if (singer === g) singer = null;
    g.mesh.userData.mic.visible = false;
    g.mesh.userData.drink.visible = false;
    setPath(g, { x: entrance.x, z: entrance.z }, null, WALK_FAST);
    g.state = GS.EXIT;
  };

  const disposeGuest = (g) => {
    releaseSlot(g);
    if (singer === g) singer = null;
    g.mesh.visible = false;
    g.mesh.userData.mic.visible = false;
    g.mesh.userData.drink.visible = false;
    g.state = GS.GONE;
    g.path = null;
  };

  const ensureHost = () => {
    if (!karaokeOn || !stage) {
      host.mesh.visible = false;
      return;
    }
    if (!host.mesh.visible) {
      host.mesh.visible = true;
      host.mesh.position.set(hostHome.x, stage.y, hostHome.z);
      host.mesh.rotation.y = faceAudience;
      host.state = HS.IDLE;
      host.timer = 0;
    }
  };

  const activeCount = () => guests.filter((g) => g.state !== GS.GONE).length;

  /**
   * @param {number} nowSec
   * @param {{ karaoke?: boolean, open?: boolean }} [opts]
   */
  function tick(nowSec, opts = {}) {
    const dt = lastT ? Math.min(0.05, Math.max(0, nowSec - lastT)) : 0.016;
    lastT = nowSec;
    if (opts.open === false) {
      // Clear floor when closed
      for (const g of guests) if (g.state !== GS.GONE) disposeGuest(g);
      host.mesh.visible = false;
      singer = null;
      return;
    }

    karaokeOn = opts.karaoke !== false; // default on (Mon karaoke night vibe)
    ensureHost();

    // Spawn cadence
    spawnAcc += dt;
    const want = Math.min(TARGET_BUSY + (karaokeOn ? 1 : 0), MAX_GUESTS - 1);
    if (spawnAcc > 3.5 + Math.random() * 2.5 && activeCount() < want) {
      spawnAcc = 0;
      spawnGuest();
    }

    // Host AI
    if (host.mesh.visible) {
      host.timer += dt;
      const hm = host.mesh;
      hm.position.y = stage?.y ?? 0.3;
      if (host.state === HS.INTRO) {
        hm.rotation.y = faceAudience + Math.sin(nowSec * 3) * 0.25;
        hm.position.y = (stage?.y ?? 0.3) + Math.abs(Math.sin(nowSec * 6)) * 0.04;
        if (host.timer > 2.8) {
          host.state = HS.WATCH;
          // step aside
          hm.position.x = hostWatch.x;
          hm.position.z = hostWatch.z;
          hm.rotation.y = faceAudience;
          host.timer = 0;
        }
      } else if (host.state === HS.WATCH) {
        hm.rotation.y = faceAudience + Math.sin(nowSec * 0.8) * 0.1;
        if (!singer) {
          host.state = HS.CALL;
          host.timer = 0;
        }
      } else if (host.state === HS.CALL) {
        hm.rotation.y = faceAudience + Math.sin(nowSec * 2.2) * 0.35;
        hm.position.y = (stage?.y ?? 0.3) + Math.abs(Math.sin(nowSec * 4)) * 0.03;
        // Invite a guest who has a drink and hasn't sung
        if (host.timer > 4 && !singer) {
          const candidates = guests.filter(
            (g) =>
              g.state === GS.MINGLE ||
              g.state === GS.SIP ||
              (g.state === GS.ORDER && g.hasDrink)
          );
          const pickG = candidates.find((g) => !g.sang) || pick(candidates);
          if (pickG && Math.random() < 0.55) {
            goStage(pickG);
            host.state = HS.INTRO;
            host.timer = 0;
          } else {
            host.state = HS.IDLE;
            host.timer = 0;
          }
        }
      } else {
        // IDLE — pace a little on stage edge
        hm.position.x = hostHome.x + Math.sin(nowSec * 0.5) * 0.15;
        hm.position.z = hostHome.z;
        hm.rotation.y = faceAudience + Math.sin(nowSec * 0.7) * 0.15;
        if (karaokeOn && !singer && host.timer > 8 + Math.random() * 6) {
          host.state = HS.CALL;
          host.timer = 0;
        }
      }
      if (hm.userData.mic) hm.userData.mic.visible = true;
    }

    // Guest AI
    for (const g of guests) {
      if (g.state === GS.GONE) continue;
      const m = g.mesh;
      g.life -= dt;
      g.timer -= dt;

      if (g.state === GS.TO_BAR) {
        const r = advance(m, g.path, g.pathI, g.speed, dt, faceBar);
        g.pathI = r.pathI;
        if (r.done) beginOrder(g);
      } else if (g.state === GS.ORDER) {
        m.position.y = 0;
        m.rotation.y = faceBar;
        // Lean / fidget toward bar
        m.position.y = Math.sin(nowSec * 2 + g.mesh.userData.bob) * 0.01;
        if (g.timer <= 0) {
          g.state = GS.WAIT_DRINK;
          g.timer = 3.5; // bartender quick prep
        }
      } else if (g.state === GS.WAIT_DRINK) {
        m.rotation.y = faceBar;
        m.position.y = Math.sin(nowSec * 1.5) * 0.012;
        // Finish when bartender finishes serve or timer
        const btDone =
          bartender &&
          bartender.orderGuest === g &&
          bartender.state !== "serve" &&
          bartender.stateT > 0.2;
        if (g.timer <= 0 || btDone || (bartender && bartender.stateT >= (bartender.stateDur || 3))) {
          finishDrink(g);
        }
      } else if (g.state === GS.SIP) {
        m.rotation.y = faceBar + Math.sin(nowSec) * 0.08;
        m.position.y = 0;
        // Raise drink slightly
        if (m.userData.drink) {
          m.userData.drink.visible = true;
          m.userData.drink.position.y = 0.72 + Math.sin(nowSec * 2) * 0.04;
        }
        if (g.timer <= 0) {
          const roll = Math.random();
          if (karaokeOn && !singer && !g.sang && roll < 0.22) goStage(g);
          else if (roll < 0.45) goPatio(g);
          else goMingle(g);
        }
      } else if (g.state === GS.MINGLE) {
        if (g.path && g.pathI < (g.path?.length || 0)) {
          const r = advance(m, g.path, g.pathI, g.speed, dt);
          g.pathI = r.pathI;
          if (r.done) {
            g.path = null;
            m.position.y = 0;
          }
        } else {
          // Chat sway
          m.position.y = Math.sin(nowSec * 1.8 + g.mesh.userData.bob) * 0.02;
          m.rotation.y += Math.sin(nowSec * 0.6 + g.mesh.userData.bob) * 0.004;
          if (g.timer <= 0) {
            if (g.life < 8) goExit(g);
            else {
              const roll = Math.random();
              if (karaokeOn && !singer && !g.sang && roll < 0.18) goStage(g);
              else if (roll < 0.35) goPatio(g);
              else if (roll < 0.5 && freeSlot()) {
                const slot = freeSlot();
                slot.guest = g;
                g.stoolI = slot.i;
                setPath(g, { x: slot.x, z: slot.z }, faceBar, WALK);
                g.state = GS.TO_BAR;
              } else goMingle(g);
            }
          }
        }
      } else if (g.state === GS.TO_PATIO) {
        const r = advance(m, g.path, g.pathI, g.speed, dt);
        g.pathI = r.pathI;
        if (r.done) {
          g.state = GS.PATIO;
          g.timer = 6 + Math.random() * 8;
          m.rotation.y = Math.PI; // face out / east-ish
          m.position.y = 0;
        }
      } else if (g.state === GS.PATIO) {
        m.position.y = Math.sin(nowSec * 1.2) * 0.015;
        m.rotation.y = Math.PI + Math.sin(nowSec * 0.5) * 0.2;
        if (g.timer <= 0) {
          if (g.life < 10) goExit(g);
          else {
            // Come back in toward mingle
            const mspot = pick(mingleSpots);
            setPath(g, mspot, null, WALK);
            g.state = GS.FROM_PATIO;
          }
        }
      } else if (g.state === GS.FROM_PATIO) {
        const r = advance(m, g.path, g.pathI, g.speed, dt);
        g.pathI = r.pathI;
        if (r.done) {
          g.state = GS.MINGLE;
          g.timer = 6 + Math.random() * 10;
        }
      } else if (g.state === GS.TO_STAGE) {
        const r = advance(m, g.path, g.pathI, g.speed * 1.05, dt, faceAudience);
        g.pathI = r.pathI;
        if (r.done) {
          g.state = GS.SING;
          g.timer = 10 + Math.random() * 8;
          g.sang = true;
          m.position.set(stageSpot.x, stage?.y ?? 0.3, stageSpot.z);
          m.rotation.y = faceAudience;
          if (m.userData.mic) m.userData.mic.visible = true;
          if (m.userData.drink) m.userData.drink.visible = false;
          if (host.mesh.visible) {
            host.state = HS.WATCH;
            host.mesh.position.set(hostWatch.x, stage?.y ?? 0.3, hostWatch.z);
          }
        }
      } else if (g.state === GS.SING) {
        // Perform — sway, mic up
        m.position.y = (stage?.y ?? 0.3) + Math.abs(Math.sin(nowSec * 5)) * 0.05;
        m.rotation.y = faceAudience + Math.sin(nowSec * 2.4) * 0.35;
        if (m.userData.mic) {
          m.userData.mic.visible = true;
          m.userData.mic.position.y = 0.82 + Math.sin(nowSec * 6) * 0.03;
        }
        if (g.timer <= 0) {
          if (m.userData.mic) m.userData.mic.visible = false;
          singer = null;
          if (host.mesh.visible) {
            host.state = HS.CALL;
            host.timer = 0;
          }
          if (g.life < 12) goExit(g);
          else goMingle(g);
        }
      } else if (g.state === GS.EXIT) {
        const r = advance(m, g.path, g.pathI, g.speed, dt);
        g.pathI = r.pathI;
        if (r.done) disposeGuest(g);
      } else if (g.state === GS.ENTER) {
        const r = advance(m, g.path, g.pathI, g.speed, dt);
        g.pathI = r.pathI;
        if (r.done) goMingle(g);
      }

      // Lifetime force-exit
      if (g.state !== GS.GONE && g.state !== GS.EXIT && g.state !== GS.SING && g.life <= 0) {
        goExit(g);
      }

      clampToWalk(m);
      // Stage singers can stand on stage y above floor — don't clamp y
      if (g.state !== GS.SING && g.state !== GS.TO_STAGE) {
        // keep y from walk bob only
      }
    }

    // Soft separation among visible peds
    const meshes = allMeshes();
    for (const mesh of meshes) separate(mesh, meshes);

    // Bartender: if someone is waiting at bar, keep serveZ on first ORDER/WAIT
    if (bartender) {
      const waiting = guests.find(
        (g) => g.state === GS.ORDER || g.state === GS.WAIT_DRINK || g.state === GS.SIP
      );
      bartender.patronPresent = !!waiting;
      if (waiting && (waiting.state === GS.ORDER || waiting.state === GS.WAIT_DRINK)) {
        bartender.serveZ = waiting.mesh.position.z;
        if (bartender.state !== "serve" && waiting.state === GS.ORDER) {
          bartender.state = "serve";
          bartender.stateT = 0;
          bartender.stateDur = 3.0 + Math.random();
          bartender.orderGuest = waiting;
        }
      }
    }
  }

  // Seed a few guests already inside so the room isn't empty on load
  for (let i = 0; i < 4; i++) {
    spawnGuest();
    // Snap past enter for some
    const g = guests.find((x) => x.state === GS.TO_BAR || x.state === GS.MINGLE);
    if (g && i < 2 && g.state === GS.TO_BAR) {
      // leave them walking in
    } else if (g && i >= 2) {
      // place mid-mingle
      releaseSlot(g);
      const mspot = mingleSpots[i % mingleSpots.length];
      g.mesh.position.set(mspot.x, 0, mspot.z);
      g.path = null;
      g.state = GS.MINGLE;
      g.timer = 5 + i * 2;
      g.hasDrink = i % 2 === 0;
      if (g.mesh.userData.drink) g.mesh.userData.drink.visible = g.hasDrink;
    }
  }
  ensureHost();

  return { tick, group, guests, host };
}
