/**
 * life.js — the crowd sim for a single venue.
 *
 * Adapted from the parent game's js/visit.js VisitSystem. The choreography is
 * the same (car → lot → stall → walk to door → inside → dwell → out → drive off,
 * with patio hangouts), but reduced to one building and re-axed for the
 * workbench's local space, where 7th Avenue runs along X at +Z.
 *
 * Two deliberate departures from the game's version:
 *
 * 1. Going inside RELEASES the pedestrian mesh back to the pool. The game holds
 *    the mesh for the whole trip, which caps occupancy at the pool size (18).
 *    Here "inside" is just a timestamp in a list, so occupancy can read 60+
 *    while only a handful of agents are visible — which is what a busy bar looks
 *    like, and inside is invisible anyway.
 *
 * 2. The patio is reachable only from inside, via the rear patio door. Walking
 *    around to it would mean pathing through the purple CMU perimeter wall, and
 *    coming out the back door is how the real patio works.
 */
import * as THREE from "three";
import {
  createCar,
  createRamTruck,
  createPhxSuv,
  createLiquorBoxTruck,
  createLiquorSemi,
  createLiquorCrate,
  createDeliveryDriver,
  createGarbageTruck,
  createPedestrian,
  tickCarLights,
  setCarLightsOff,
  CAR_COLORS,
  CAR_STYLES,
  PHX_SUV_COLORS,
  PED_COLORS,
} from "./agents.js";
import {
  STREET,
  lanePoint,
  sidewalkPoint,
  roadPolyline,
  sidewalkPolyline,
} from "./street.js";

/** 1 Ram + several Phoenix SUVs + mixed body styles. */
const POOL_CARS = 10;
const POOL_PHX_SUV = 4;
const POOL_PEDS = 18;
const MAX_CAR_TRIPS = 7;
/** Soft occupancy ceiling. Far above the game's 5 — see note 1 above. */
const MAX_INSIDE = 70;
const SPAWN_CHECK_S = 0.3;
/** At most one liquor delivery at a time. */
const MAX_DELIVERIES = 1;
/** Seconds between delivery spawn rolls. */
const DELIVERY_CHECK_S = 12;
/** Base chance per check that a delivery rolls (before busyness). */
const DELIVERY_CHANCE = 0.14;
/** Seconds between garbage-truck spawn rolls. */
const GARBAGE_CHECK_S = 18;
/** Base chance per check the truck comes for Leslie. */
const GARBAGE_CHANCE = 0.11;

/** Pedestrian personal space — close is fine, overlapping is not. */
const PED_MIN = 0.48;
/**
 * Front-to-back only. Sized for SUVs / box trucks: if another vehicle's centre is
 * within this distance ahead in the facing cone, the follower soft-slows.
 */
const CAR_AHEAD = 3.2;
/** How wide the "in front of me" cone is (half-width, metres). */
const CAR_LANE = 0.85;
/** Absolute floor on speed scale so queues never freeze. */
const CAR_MIN_SCALE = 0.4;
/** Only depenetrate true centre-stacks (rare). */
const CAR_STACK = 1.35;

/** Car states. */
const CS = {
  DRIVE_IN: "drive_in",
  UNLOAD: "unload",
  INSIDE: "inside",
  LOAD: "load",
  DRIVE_OUT: "drive_out",
};

/** Liquor delivery trip states. */
const DS = {
  DRIVE_IN: "del_drive_in",
  WALK_IN: "del_walk_in",
  DROP: "del_drop",
  WALK_OUT: "del_walk_out",
  DRIVE_OUT: "del_drive_out",
};

/** Garbage truck → empty Leslie. */
const GS = {
  DRIVE_IN: "gar_drive_in",
  GRAB: "gar_grab",
  LIFT: "gar_lift",
  EMPTY: "gar_empty",
  LOWER: "gar_lower",
  DRIVE_OUT: "gar_drive_out",
};

/** Visible-pedestrian states. */
const PS = {
  TO_DOOR: "to_door",
  TO_PATIO: "to_patio",
  AT_PATIO: "at_patio",
  TO_INSIDE: "to_inside",
  LEAVING: "leaving",
};

/**
 * Hourly crowd curve for a bar. Index = local hour 0..23.
 * Closed mid-morning; ramps through the evening; peaks 9pm–1am.
 */
const HOUR_CURVE = [
  0.62, 0.4, 0.16, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.06,
  0.16, 0.2, 0.22, 0.26, 0.36, 0.5, 0.62, 0.74, 0.86, 1.0, 0.98, 0.84,
];

/** Sun–Sat multiplier. Friday and Saturday carry the week. */
const DAY_WEIGHT = {
  sunday: 0.78,
  monday: 0.5,
  tuesday: 0.55,
  wednesday: 0.62,
  thursday: 0.74,
  friday: 1.0,
  saturday: 1.0,
};

/**
 * Smooth crowd factor 0..1, interpolating between hours.
 *
 * Takes the VENUE's hour and weekday (see venue.js venueNow), not a Date — the
 * phone's own timezone would make the room busy at the wrong time if you checked
 * in from another state.
 *
 * @param {number} hourFloat 0..24 in venue-local time
 * @param {string} weekday e.g. "Sunday"
 */
export function crowdFactor(hourFloat, weekday) {
  const h = Math.floor(((hourFloat % 24) + 24) % 24);
  const frac = hourFloat - Math.floor(hourFloat);
  const a = HOUR_CURVE[h];
  const b = HOUR_CURVE[(h + 1) % 24];
  const weight = DAY_WEIGHT[String(weekday).toLowerCase()] ?? 0.7;
  return (a + (b - a) * frac) * weight;
}

export function isOpen(hourFloat, weekday) {
  return crowdFactor(hourFloat, weekday) > 0.02;
}

export class LifeSystem {
  /**
   * @param {THREE.Scene|THREE.Group} parent
   * @param {THREE.Group} venue result of createStacys(), already positioned
   */
  constructor(parent, venue) {
    this.root = new THREE.Group();
    this.root.name = "life";
    parent.add(this.root);

    this.venue = venue;
    venue.updateWorldMatrix(true, true);
    const m = venue.matrixWorld;

    const ud = venue.userData;
    this.spots = (ud.parkingSpots || [])
      .filter((s) => s.vehicleAccess !== false)
      .map((s, i) => ({
        key: `p${i}`,
        pos: new THREE.Vector3(s.x, s.y ?? 0.02, s.z).applyMatrix4(m),
        approach: new THREE.Vector3(s.approachX, 0.02, s.approachZ).applyMatrix4(m),
        faceY: venue.rotation.y + (s.faceY || 0),
        occupied: false,
      }));

    const access = ud.venueAccess || { doors: [], patio: [] };
    const doors = access.doors || [];
    const street = doors.find((d) => d.kind === "street") || doors[0];
    const patioDoor = doors.find((d) => d.kind === "patio") || street;
    this.streetDoor = new THREE.Vector3(street.x, 0, street.z).applyMatrix4(m);
    this.patioDoor = new THREE.Vector3(patioDoor.x, 0, patioDoor.z).applyMatrix4(m);

    this.patioSpots = (access.patio || []).map((p, i) => ({
      key: `patio${i}`,
      pos: new THREE.Vector3(p.x, 0, p.z).applyMatrix4(m),
      occupied: false,
    }));

    const dw = ud.driveway;
    this.mouth = dw
      ? new THREE.Vector3(dw.mouthX, 0.02, dw.mouthZ).applyMatrix4(m)
      : null;
    this.aisle = dw
      ? new THREE.Vector3(dw.aisleX, 0.02, dw.aisleZ).applyMatrix4(m)
      : null;
    /** Waypoint in the front yard where the aisle meets the walk to the porch. */
    this.yardCorner = new THREE.Vector3(
      this.aisle ? this.aisle.x : this.streetDoor.x,
      0,
      this.streetDoor.z + 0.5
    );

    this.carPool = [];
    this.pedPool = [];
    this.deliveryPool = [];
    /** Active liquor delivery trips (box truck / semi). */
    this.deliveries = [];
    /** Active garbage run (at most one — empties Leslie). */
    this.garbage = null;
    this.garbageTruck = null;
    this.carTrips = [];
    this.walkers = [];
    /** Occupants with no mesh: { leaveAt } in seconds of sim time. */
    this.inside = [];
    this.busyness = 1;
    this.target = 0;
    this.now = 0;
    this._spawnAcc = 0;
    this._deliveryAcc = 0;
    /** Next sim-time a delivery is allowed to spawn (cooldown after one leaves). */
    this._deliveryReadyAt = 8;
    this._garbageAcc = 0;
    this._garbageReadyAt = 22;

    // Leslie — dumpster mesh + rest pose for the lift animation
    this.leslie = venue.getObjectByName("dumpster") || null;
    if (this.leslie) {
      this.leslieHome = {
        y: this.leslie.position.y,
        rotX: this.leslie.rotation.x,
        rotZ: this.leslie.rotation.z,
      };
    } else {
      this.leslieHome = null;
    }
    const dumpUd = ud.dumpster;
    this.leslieService = dumpUd
      ? new THREE.Vector3(
          dumpUd.serviceX ?? dumpUd.approachX,
          0.02,
          dumpUd.serviceZ ?? dumpUd.approachZ
        ).applyMatrix4(m)
      : null;

    this._buildPools();
    /** Rolling arrival log (sim timestamps) for the "recent arrivals" stat. */
    this.arrivalLog = [];
    /**
     * Optional () => THREE.Object3D[] of foreign vehicles (e.g. Gaymo) included
     * in front-cone avoidance.
     */
    this.getExtraVehicles = null;
    /**
     * When true, no new cars pull into the lot and any car already driving in or
     * out freezes (at the mouth / in place) until cleared. Used by the sick-patron
     * scene so nothing runs through the mess while it's being cleaned.
     */
    this.lotHold = false;

    // Dumpster as a solid obstacle (world-space AABB) — nothing drives through it
    const dump = venue.userData.dumpster;
    if (dump) {
      const p = new THREE.Vector3(dump.x, 0, dump.z).applyMatrix4(m);
      // Body ~1.2×0.8 after Ry(π/2); pad the box so cars stay clear
      this.dumpsterBox = {
        minX: p.x - 1.15,
        maxX: p.x + 1.15,
        minZ: p.z - 0.95,
        maxZ: p.z + 0.95,
      };
    } else {
      this.dumpsterBox = null;
    }
  }

  /**
   * Pre-fill to the current target so a check-in never opens on an empty room.
   * Call after setCrowd() — the spawn gates read this.target.
   */
  seed() {
    // Occupants already inside, spread across their dwells
    const n = Math.round(this.target * 0.8);
    for (let i = 0; i < n; i++) {
      this.inside.push({ leaveAt: this.now + 5 + Math.random() * 200 });
    }
    // Fill the lot more aggressively so it looks busy without cars stacking
    // on top of each other mid-aisle (traffic will serialize the rest).
    const cars = Math.min(this.spots.length, Math.max(2, Math.round(this.busyness * 3.5)));
    for (let i = 0; i < cars; i++) this._trySpawnCar();
    for (let i = 0; i < 4; i++) this._trySpawnWalker();
  }

  /**
   * Drive the sim from a 0..1 crowd factor (see crowdFactor()).
   *
   * This sets a TARGET occupancy, not just a spawn rate. Rate alone doesn't work:
   * arrivals outpace the 50–210s dwell by a wide margin at any hour, so the room
   * saturates at capacity within a few minutes and 2pm Sunday looks identical to
   * midnight Friday. Gating arrivals on the target instead makes the occupancy
   * number track the hour, and turnover falls out for free — someone leaves,
   * occupancy dips below target, the door opens again.
   */
  setCrowd(f) {
    const c = Math.min(1, Math.max(0, f));
    this.busyness = c * 1.6;
    this.target = Math.round(MAX_INSIDE * c);
  }

  /**
   * Bodies committed to going inside but not there yet — cars still driving in or
   * unloading, and pedestrians still walking to a door.
   */
  _pendingArrivals() {
    let n = 0;
    for (const t of this.carTrips) {
      if (t.state === CS.DRIVE_IN || t.state === CS.UNLOAD) n += t.party;
    }
    for (const w of this.walkers) {
      if (w.state === PS.TO_DOOR || w.state === PS.TO_INSIDE) n += 1;
    }
    return n;
  }

  /**
   * True while there's room for another body. Counts in-flight arrivals, or a
   * carful that passed the gate a minute ago lands on top of one that already
   * filled the room — which overshot the target by ~2x before this was added.
   */
  get wantsArrivals() {
    return this.inside.length + this._pendingArrivals() < this.target;
  }

  /**
   * Gate lot driving for one-shot scenes (vomit mop, etc.). Cars already parked
   * stay put; in-flight arrivals stop at the mouth; departures wait at the stall.
   */
  setLotHold(on) {
    this.lotHold = !!on;
  }

  _buildPools() {
    // Signature black Ram — one slot so it shows up parking at the bar
    const ram = createRamTruck();
    ram.visible = false;
    ram.castShadow = false;
    this.root.add(ram);
    this.carPool.push({ mesh: ram, busy: false, kind: "ram" });

    // Typical Phoenix SUVs — majority of the lot look
    for (let i = 0; i < POOL_PHX_SUV; i++) {
      const mesh = createPhxSuv(PHX_SUV_COLORS[i % PHX_SUV_COLORS.length]);
      mesh.visible = false;
      mesh.castShadow = false;
      this.root.add(mesh);
      this.carPool.push({ mesh, busy: false, kind: "phxSuv" });
    }

    // Remaining slots: mixed body styles + paint
    const mixed = POOL_CARS - 1 - POOL_PHX_SUV;
    for (let i = 0; i < mixed; i++) {
      const style = CAR_STYLES[i % CAR_STYLES.length];
      const color = CAR_COLORS[(i + 2) % CAR_COLORS.length];
      const mesh = createCar({ color, style });
      mesh.visible = false;
      mesh.castShadow = false;
      this.root.add(mesh);
      this.carPool.push({ mesh, busy: false, kind: style });
    }
    for (let i = 0; i < POOL_PEDS; i++) {
      const mesh = createPedestrian(PED_COLORS[i % PED_COLORS.length]);
      mesh.visible = false;
      mesh.castShadow = false;
      this.root.add(mesh);
      this.pedPool.push({ mesh, busy: false, bob: Math.random() * Math.PI * 2 });
    }

    // Liquor fleet: two nice box trucks + two nice semis (only one runs at a time)
    const fleet = [
      createLiquorBoxTruck(0),
      createLiquorBoxTruck(1),
      createLiquorSemi(0),
      createLiquorSemi(1),
    ];
    for (const mesh of fleet) {
      mesh.visible = false;
      mesh.castShadow = false;
      this.root.add(mesh);
      this.deliveryPool.push({
        mesh,
        busy: false,
        kind: mesh.userData.kind,
      });
    }

    // One sanitation truck for Leslie
    const garbo = createGarbageTruck();
    garbo.visible = false;
    garbo.castShadow = false;
    this.root.add(garbo);
    this.garbageTruck = { mesh: garbo, busy: false, kind: "garbage" };
  }

  /**
   * Grab a free car. Bias toward the Ram and Phoenix SUVs so the lot reads
   * like a real Central Ave night without locking out the other styles.
   */
  _takeCar() {
    const free = this.carPool.filter((c) => !c.busy);
    if (!free.length) return null;
    const ram = free.find((c) => c.kind === "ram");
    if (ram && Math.random() < 0.22) return ram;
    const phx = free.filter((c) => c.kind === "phxSuv");
    if (phx.length && Math.random() < 0.55) {
      return phx[(Math.random() * phx.length) | 0];
    }
    return free[(Math.random() * free.length) | 0];
  }

  _takePed() {
    const p = this.pedPool.find((x) => !x.busy);
    if (!p) return null;
    p.busy = true;
    p.mesh.visible = true;
    p.mesh.position.y = 0;
    return p;
  }

  _freePed(ped) {
    if (!ped) return;
    ped.busy = false;
    ped.mesh.visible = false;
    ped.mesh.position.y = 0;
  }

  // ── Paths ─────────────────────────────────────────────────────────

  _clean(pts) {
    const out = [];
    for (const p of pts) {
      if (!p) continue;
      const last = out[out.length - 1];
      if (!last || Math.hypot(p.x - last.x, p.z - last.z) >= 0.2) out.push(p.clone());
      else out[out.length - 1] = p.clone();
    }
    return out;
  }

  /** Road from a spawn X, right turn into the mouth, up the aisle to the stall. */
  _pathIntoLot(spot, spawnX) {
    if (!this.mouth || !this.aisle) return null;
    return this._clean([
      ...roadPolyline(spawnX, this.mouth.x, -1),
      new THREE.Vector3(this.mouth.x, 0.02, STREET.curbZ),
      this.mouth,
      this.aisle,
      spot.approach,
      spot.pos,
    ]);
  }

  /** Stall back down the aisle, right turn onto the northbound lane, off-screen. */
  _pathOutOfLot(spot) {
    if (!this.mouth || !this.aisle) return null;
    return this._clean([
      spot.pos,
      spot.approach,
      this.aisle,
      this.mouth,
      new THREE.Vector3(this.mouth.x, 0.02, STREET.curbZ),
      ...roadPolyline(this.mouth.x, STREET.xMin + 1, -1),
    ]);
  }

  /** Stall to the porch door, routed down the aisle and across the front yard. */
  _pathStallToDoor(from) {
    return this._clean([
      from,
      new THREE.Vector3(this.aisle.x, 0, from.z),
      this.yardCorner,
      this.streetDoor,
    ]);
  }

  /** Sidewalk approach: in from off-screen, then straight up to the porch. */
  _pathSidewalkToDoor(spawnX) {
    return this._clean([
      sidewalkPoint(spawnX),
      ...sidewalkPolyline(spawnX, this.streetDoor.x),
      this.streetDoor,
    ]);
  }

  /**
   * Just inside the street door. People start here when leaving so they read as
   * walking *out* of the building, not spawning on the porch.
   */
  _doorInside() {
    // Street face is +Z; interior is −Z from the porch threshold
    return new THREE.Vector3(
      this.streetDoor.x,
      0,
      this.streetDoor.z - 0.95
    );
  }

  /** Porch door back out to the sidewalk and off-screen. */
  _pathDoorToOffscreen() {
    const dir = Math.random() > 0.5 ? 1 : -1;
    const exitX =
      dir > 0
        ? Math.min(STREET.xMax - 1, this.streetDoor.x + 9 + Math.random() * 5)
        : Math.max(STREET.xMin + 1, this.streetDoor.x - 9 - Math.random() * 5);
    return this._clean([
      this._doorInside(),
      this.streetDoor,
      sidewalkPoint(this.streetDoor.x),
      ...sidewalkPolyline(this.streetDoor.x, exitX),
    ]);
  }

  _freePatioSpot() {
    const free = this.patioSpots.filter((p) => !p.occupied);
    if (!free.length) return null;
    return free[(Math.random() * free.length) | 0];
  }

  // ── Spawning ──────────────────────────────────────────────────────

  /**
   * City sanitation truck pulls into the rear lot and empties Leslie
   * (lift → tip into hopper → set her back down → leave).
   */
  _trySpawnGarbage() {
    if (this.lotHold) return;
    if (this.garbage) return;
    if (!this.garbageTruck || this.garbageTruck.busy) return;
    if (this.now < this._garbageReadyAt) return;
    if (!this.mouth || !this.aisle || !this.leslie || !this.leslieService) return;

    const unit = this.garbageTruck;
    const spawnX = this.mouth.x + 13 + Math.random() * 4;
    const stop = this.leslieService.clone();
    // Face so the rear (−local Z) points roughly at Leslie
    const leslieWorld = new THREE.Vector3();
    this.leslie.getWorldPosition(leslieWorld);
    // Truck nose points away from dumpster so rear loader faces her
    const awayX = stop.x - leslieWorld.x;
    const awayZ = stop.z - leslieWorld.z;
    const stopFaceY = Math.atan2(awayX, awayZ);

    const path = this._clean([
      ...roadPolyline(spawnX, this.mouth.x, -1),
      new THREE.Vector3(this.mouth.x, 0.02, STREET.curbZ),
      this.mouth.clone(),
      this.aisle.clone(),
      new THREE.Vector3(this.aisle.x, 0.02, stop.z),
      stop,
    ]);
    if (!path || path.length < 2) return;

    unit.busy = true;
    unit.mesh.visible = true;
    unit.mesh.position.copy(path[0]);
    unit.mesh.rotation.y = Math.atan2(
      path[1].x - path[0].x,
      path[1].z - path[0].z
    );
    unit.mesh.userData.setLift?.(0);
    this._resetLeslie();

    this.garbage = {
      state: GS.DRIVE_IN,
      unit,
      path,
      pathI: 0,
      lotFrom: Math.max(1, path.length - 3),
      speedRoad: 6.0 + Math.random() * 0.8,
      speedLot: 2.8 + Math.random() * 0.4,
      stopFaceY,
      t: 0,
      shake: 0,
    };
  }

  _resetLeslie() {
    if (!this.leslie || !this.leslieHome) return;
    this.leslie.position.y = this.leslieHome.y;
    this.leslie.rotation.x = this.leslieHome.rotX;
    this.leslie.rotation.z = this.leslieHome.rotZ;
    this.leslie.scale.set(1, 1, 1);
  }

  /**
   * Liquor drop: box truck pulls into the aisle; semi stops on 7th at the curb.
   * Driver walks a crate to the porch, dwells, walks back, leaves.
   * ~70% box truck / ~30% semi when both kinds are free.
   */
  _trySpawnDelivery() {
    if (this.lotHold) return;
    if (this.deliveries.length >= MAX_DELIVERIES) return;
    if (this.now < this._deliveryReadyAt) return;
    if (!this.mouth || !this.aisle) return;

    const free = this.deliveryPool.filter((d) => !d.busy);
    if (!free.length) return;

    const boxes = free.filter((d) => d.kind === "boxTruck");
    const semis = free.filter((d) => d.kind === "semi");
    let unit = null;
    if (boxes.length && semis.length) {
      unit = Math.random() < 0.7
        ? boxes[(Math.random() * boxes.length) | 0]
        : semis[(Math.random() * semis.length) | 0];
    } else {
      unit = free[(Math.random() * free.length) | 0];
    }
    if (!unit) return;

    const isSemi = unit.kind === "semi";
    const spawnX = this.mouth.x + 12 + Math.random() * 5;
    let path;
    let stopFaceY;
    let stopPos;

    if (isSemi) {
      // Curb / near-lane stop abeam the porch — too long for the lot
      const stopX = this.streetDoor.x + 0.4;
      stopPos = new THREE.Vector3(stopX, 0.02, STREET.nearLaneZ);
      path = this._clean([
        ...roadPolyline(spawnX, stopX, -1),
        stopPos.clone(),
      ]);
      stopFaceY = Math.atan2(-1, 0); // facing northbound (−X)
    } else {
      // Box truck: into the lot, stop mid-aisle for the drop
      const stopZ = THREE.MathUtils.clamp(
        this.streetDoor.z + 0.4,
        Math.min(this.mouth.z, this.aisle.z) + 0.5,
        Math.max(this.mouth.z, this.aisle.z) - 0.5
      );
      stopPos = new THREE.Vector3(this.aisle.x, 0.02, stopZ);
      path = this._clean([
        ...roadPolyline(spawnX, this.mouth.x, -1),
        new THREE.Vector3(this.mouth.x, 0.02, STREET.curbZ),
        this.mouth.clone(),
        new THREE.Vector3(this.aisle.x, 0.02, (this.mouth.z + stopZ) * 0.5),
        stopPos.clone(),
      ]);
      stopFaceY = Math.atan2(
        this.aisle.x - this.mouth.x,
        this.aisle.z - this.mouth.z
      );
    }
    if (!path || path.length < 2) return;

    unit.busy = true;
    unit.mesh.visible = true;
    unit.mesh.position.copy(path[0]);
    unit.mesh.rotation.y = Math.atan2(
      path[1].x - path[0].x,
      path[1].z - path[0].z
    );

    // Dedicated driver (not from the patron ped pool)
    const driver = createDeliveryDriver(isSemi ? 0x3a2a1a : 0x2a3a5c);
    this.root.add(driver);
    driver.visible = false;
    const crate = createLiquorCrate();
    driver.userData.crateHold.add(crate);
    crate.visible = true;

    this.deliveries.push({
      state: DS.DRIVE_IN,
      unit,
      isSemi,
      path,
      pathI: 0,
      lotFrom: isSemi ? path.length - 1 : Math.max(1, path.length - 3),
      speedRoad: isSemi ? 6.2 + Math.random() * 0.8 : 6.8 + Math.random() * 1.0,
      speedLot: 3.2 + Math.random() * 0.6,
      walkSpeed: 1.55 + Math.random() * 0.25,
      stopFaceY,
      stopPos,
      driver,
      crate,
      pathWalk: null,
      dwellLeft: 0,
      tripsLeft: 1 + ((Math.random() * 2) | 0), // 1–2 crate runs
    });
  }

  _trySpawnCar() {
    if (this.lotHold) return;
    if (this.carTrips.length >= MAX_CAR_TRIPS) return;
    if (!this.wantsArrivals) return;
    const free = this.spots.filter((s) => !s.occupied);
    if (!free.length) return;
    const car = this._takeCar();
    if (!car) return;
    const spot = free[(Math.random() * free.length) | 0];

    // Approach from the south (+X) so the right turn into the lot reads
    const spawnX = this.mouth.x + 11 + Math.random() * 6;
    const path = this._pathIntoLot(spot, spawnX);
    if (!path || path.length < 2) return;

    car.busy = true;
    spot.occupied = true;
    car.mesh.visible = true;
    car.mesh.position.copy(path[0]);
    car.mesh.rotation.y = Math.atan2(
      path[1].x - path[0].x,
      path[1].z - path[0].z
    );

    this.carTrips.push({
      state: CS.DRIVE_IN,
      car,
      spot,
      ped: null,
      path,
      pathI: 0,
      lotFrom: Math.max(1, path.length - 4),
      speedRoad: 7.5 + Math.random() * 1.8,
      speedLot: 4.2 + Math.random() * 1.0,
      walkSpeed: 1.9 + Math.random() * 0.5,
      // 1–3 people per car
      party: 1 + ((Math.random() * 3) | 0),
      dwell: 40 + Math.random() * 90,
      dwellLeft: 0,
      unloadWait: 0,
      heldInside: 0,
    });
  }

  _trySpawnWalker() {
    if (!this.wantsArrivals) return;
    const ped = this._takePed();
    if (!ped) return;
    const dir = Math.random() > 0.5 ? 1 : -1;
    const spawnX = this.streetDoor.x + dir * (10 + Math.random() * 8);
    const path = this._pathSidewalkToDoor(
      THREE.MathUtils.clamp(spawnX, STREET.xMin + 1, STREET.xMax - 1)
    );
    ped.mesh.position.copy(path[0]);
    this.walkers.push({
      state: PS.TO_DOOR,
      ped,
      path,
      pathI: 0,
      speed: 1.85 + Math.random() * 0.55,
      spot: null,
      dwellLeft: 0,
    });
  }

  /** Someone walks out of the building — from the porch or onto the patio. */
  _emerge(toPatio) {
    const ped = this._takePed();
    if (!ped) return false;
    if (toPatio) {
      const spot = this._freePatioSpot();
      if (!spot) {
        this._freePed(ped);
        return false;
      }
      spot.occupied = true;
      // Start a step inside the patio door so they emerge, not teleport
      const patioInside = this.patioDoor.clone();
      patioInside.z -= 0.7;
      ped.mesh.position.copy(patioInside);
      this.walkers.push({
        state: PS.TO_PATIO,
        ped,
        path: this._clean([
          patioInside,
          this.patioDoor.clone(),
          spot.pos.clone(),
        ]),
        pathI: 0,
        speed: 1.5 + Math.random() * 0.4,
        spot,
        dwellLeft: 0,
      });
      return true;
    }
    const path = this._pathDoorToOffscreen();
    // path[0] is inside the porch — they walk through the doorway
    ped.mesh.position.copy(path[0]);
    this.walkers.push({
      state: PS.LEAVING,
      ped,
      path,
      pathI: 0,
      speed: 1.8 + Math.random() * 0.6,
      spot: null,
      dwellLeft: 0,
    });
    return true;
  }

  _enterInside(count = 1) {
    for (let i = 0; i < count; i++) {
      if (this.inside.length >= MAX_INSIDE) return;
      this.inside.push({ leaveAt: this.now + 50 + Math.random() * 160 });
      this.arrivalLog.push(this.now);
    }
  }

  // ── Movement ──────────────────────────────────────────────────────

  _advance(mesh, path, pathI, speed, dt, finalFaceY = null) {
    if (pathI >= path.length) return { done: true, pathI };
    const target = path[pathI];
    const pos = mesh.position;
    const dx = target.x - pos.x;
    const dz = target.z - pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.16) {
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
    return { done: false, pathI };
  }

  /**
   * Soft personal-space push so peds can stand close but never stack.
   * @param {THREE.Object3D} mesh
   * @param {THREE.Object3D[]} others
   * @param {number} [minDist]
   */
  separatePed(mesh, others, minDist = PED_MIN) {
    if (!mesh?.visible) return;
    for (const o of others) {
      if (!o || o === mesh || !o.visible) continue;
      const dx = mesh.position.x - o.position.x;
      const dz = mesh.position.z - o.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 1e-4 || d >= minDist) continue;
      // Split the correction so both parties share the nudge when both run this
      const push = (minDist - d) * 0.55;
      mesh.position.x += (dx / d) * push;
      mesh.position.z += (dz / d) * push;
    }
  }

  /** Every visible ped mesh currently in the sim (walkers + car-trip peds + drivers). */
  pedMeshes() {
    const out = [];
    for (const w of this.walkers) {
      if (w.ped?.mesh?.visible) out.push(w.ped.mesh);
    }
    for (const t of this.carTrips) {
      if (t.ped?.mesh?.visible) out.push(t.ped.mesh);
    }
    for (const d of this.deliveries) {
      if (d.driver?.visible) out.push(d.driver);
    }
    return out;
  }

  /**
   * Moving cars only (+ optional Gaymo). Parked stall cars are skipped so they
   * don't "stop" traffic that is merely nearby.
   */
  movingVehicleMeshes(exclude = null) {
    const out = [];
    for (const t of this.carTrips) {
      if (t.state !== CS.DRIVE_IN && t.state !== CS.DRIVE_OUT) continue;
      const m = t.car?.mesh;
      if (m?.visible && m !== exclude) out.push(m);
    }
    for (const d of this.deliveries) {
      if (d.state !== DS.DRIVE_IN && d.state !== DS.DRIVE_OUT) continue;
      const m = d.unit?.mesh;
      if (m?.visible && m !== exclude) out.push(m);
    }
    if (this.garbage) {
      const st = this.garbage.state;
      if (st === GS.DRIVE_IN || st === GS.DRIVE_OUT) {
        const m = this.garbage.unit?.mesh;
        if (m?.visible && m !== exclude) out.push(m);
      }
    }
    if (this.getExtraVehicles) {
      for (const m of this.getExtraVehicles()) {
        if (m?.visible && m !== exclude) out.push(m);
      }
    }
    return out;
  }

  /**
   * Speed scale 0.4..1 based on what's *in front* of this car only.
   * Side-by-side and rear cars are ignored — that's what was looking like
   * mutual blocking.
   */
  frontSpeedScale(car) {
    const others = this.movingVehicleMeshes(car);
    const yaw = car.rotation.y;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    let scale = 1;
    for (const o of others) {
      const dx = o.position.x - car.position.x;
      const dz = o.position.z - car.position.z;
      const along = dx * fx + dz * fz;
      if (along < 0.5 || along > CAR_AHEAD) continue; // not ahead
      const lat = Math.abs(dx * fz - dz * fx);
      if (lat > CAR_LANE) continue; // different lane / side
      // Soft slow: closer → slower, never freeze
      const s = CAR_MIN_SCALE + (1 - CAR_MIN_SCALE) * (along / CAR_AHEAD);
      if (s < scale) scale = s;
    }
    return scale;
  }

  /**
   * If two centres are almost on top of each other, push the *rear* car back
   * along its own reverse so front/back stay defined.
   */
  separateVehicles() {
    const meshes = this.movingVehicleMeshes();
    for (let i = 0; i < meshes.length; i++) {
      for (let j = i + 1; j < meshes.length; j++) {
        const a = meshes[i];
        const b = meshes[j];
        const dx = a.position.x - b.position.x;
        const dz = a.position.z - b.position.z;
        const d = Math.hypot(dx, dz);
        if (d < 1e-4 || d >= CAR_STACK) continue;
        // Who is behind? Project separation onto each facing.
        const ay = a.rotation.y;
        const by = b.rotation.y;
        const aAlong = dx * Math.sin(ay) + dz * Math.cos(ay); // b relative to a
        // If b is ahead of a (aAlong > 0), a is the rear car → push a back
        if (aAlong > 0) {
          a.position.x -= Math.sin(ay) * (CAR_STACK - d) * 0.6;
          a.position.z -= Math.cos(ay) * (CAR_STACK - d) * 0.6;
        } else {
          b.position.x -= Math.sin(by) * (CAR_STACK - d) * 0.6;
          b.position.z -= Math.cos(by) * (CAR_STACK - d) * 0.6;
        }
      }
    }
    // Dumpster is solid — push any vehicle centre out of its box
    this._resolveDumpster();
  }

  _resolveDumpster() {
    const box = this.dumpsterBox;
    if (!box) return;
    const meshes = this.movingVehicleMeshes();
    for (const m of meshes) {
      const x = m.position.x;
      const z = m.position.z;
      if (x < box.minX || x > box.maxX || z < box.minZ || z > box.maxZ) continue;
      // Push out via nearest edge
      const dl = x - box.minX;
      const dr = box.maxX - x;
      const db = z - box.minZ;
      const dt = box.maxZ - z;
      const mEdge = Math.min(dl, dr, db, dt);
      if (mEdge === dl) m.position.x = box.minX - 0.05;
      else if (mEdge === dr) m.position.x = box.maxX + 0.05;
      else if (mEdge === db) m.position.z = box.minZ - 0.05;
      else m.position.z = box.maxZ + 0.05;
    }
  }

  _bob(entry, dt, rate = 9, amp = 0.045) {
    entry.ped.bob += dt * rate;
    entry.ped.mesh.position.y = Math.abs(Math.sin(entry.ped.bob)) * amp;
  }

  _pedBesideCar(carMesh) {
    const yaw = carMesh.rotation.y;
    return new THREE.Vector3(
      carMesh.position.x + Math.cos(yaw) * 0.72,
      0,
      carMesh.position.z - Math.sin(yaw) * 0.72
    );
  }

  // ── Update ────────────────────────────────────────────────────────

  update(dt) {
    if (dt <= 0) return;
    const t = Math.min(dt, 0.05);
    this.now += t;

    this._spawnAcc += t;
    if (this._spawnAcc >= SPAWN_CHECK_S) {
      this._spawnAcc = 0;
      const b = this.busyness;
      // Slightly hungrier spawns so the lot fills; traffic prevents pile-ups
      if (Math.random() < 0.14 + b * 0.28) this._trySpawnCar();
      if (Math.random() < 0.22 + b * 0.45) this._trySpawnWalker();
      if (b > 1.0 && Math.random() < 0.4) this._trySpawnWalker();
    }

    this._deliveryAcc += t;
    if (this._deliveryAcc >= DELIVERY_CHECK_S) {
      this._deliveryAcc = 0;
      // Liquor drops show up even on quieter nights — bars always need stock
      if (Math.random() < DELIVERY_CHANCE + this.busyness * 0.06) {
        this._trySpawnDelivery();
      }
    }

    this._garbageAcc += t;
    if (this._garbageAcc >= GARBAGE_CHECK_S) {
      this._garbageAcc = 0;
      if (Math.random() < GARBAGE_CHANCE + this.busyness * 0.04) {
        this._trySpawnGarbage();
      }
    }

    // People leaving the building
    for (let i = this.inside.length - 1; i >= 0; i--) {
      if (this.inside[i].leaveAt > this.now) continue;
      // Some step out to the patio instead of going home
      const toPatio =
        this.patioSpots.some((p) => !p.occupied) && Math.random() < 0.4;
      if (this._emerge(toPatio)) this.inside.splice(i, 1);
      else this.inside[i].leaveAt = this.now + 4 + Math.random() * 8;
    }

    for (let i = this.carTrips.length - 1; i >= 0; i--) {
      const trip = this.carTrips[i];
      try {
        this._tickCar(trip, t);
      } catch (err) {
        console.warn("[life] car trip aborted", err);
        trip.state = "done";
      }
      if (trip.state === "done") {
        if (trip.car) {
          trip.car.busy = false;
          trip.car.mesh.visible = false;
        }
        this._freePed(trip.ped);
        if (trip.spot) trip.spot.occupied = false;
        this.carTrips.splice(i, 1);
      } else if (trip.car?.mesh?.visible) {
        // Running only while driving. Parked + patrons inside → lights off.
        const engineOn =
          trip.state === CS.DRIVE_IN || trip.state === CS.DRIVE_OUT;
        tickCarLights(trip.car.mesh, this.now, { engineOn });
      }
    }

    for (let i = this.deliveries.length - 1; i >= 0; i--) {
      const del = this.deliveries[i];
      try {
        this._tickDelivery(del, t);
      } catch (err) {
        console.warn("[life] delivery aborted", err);
        del.state = "done";
      }
      if (del.state === "done") {
        this._finishDelivery(del);
        this.deliveries.splice(i, 1);
        // Cooldown so the next drop is spaced out
        this._deliveryReadyAt = this.now + 45 + Math.random() * 50;
      } else if (del.unit?.mesh?.visible) {
        tickCarLights(del.unit.mesh, this.now);
      }
    }

    if (this.garbage) {
      try {
        this._tickGarbage(this.garbage, t);
      } catch (err) {
        console.warn("[life] garbage run aborted", err);
        this.garbage.state = "done";
      }
      if (this.garbage.state === "done") {
        this._finishGarbage(this.garbage);
        this.garbage = null;
        this._garbageReadyAt = this.now + 70 + Math.random() * 60;
      } else if (this.garbage.unit?.mesh?.visible) {
        tickCarLights(this.garbage.unit.mesh, this.now);
      }
    }

    // Ped personal space — resolve after all moves so everyone shares the shove
    const peds = this.pedMeshes();
    for (const m of peds) this.separatePed(m, peds);

    for (let i = this.walkers.length - 1; i >= 0; i--) {
      const wk = this.walkers[i];
      try {
        this._tickWalker(wk, t);
      } catch (err) {
        console.warn("[life] walker aborted", err);
        wk.state = "done";
      }
      if (wk.state === "done") {
        if (wk.spot) wk.spot.occupied = false;
        this._freePed(wk.ped);
        this.walkers.splice(i, 1);
      }
    }

    // Second ped pass after walkers moved
    const peds2 = this.pedMeshes();
    for (const m of peds2) this.separatePed(m, peds2);

    // Soft nudge only if centres are nearly stacked (Gaymo included via extras)
    this.separateVehicles();

    // Trim the rolling arrival log to the last 10 minutes of sim time
    const cutoff = this.now - 600;
    while (this.arrivalLog.length && this.arrivalLog[0] < cutoff) {
      this.arrivalLog.shift();
    }
  }

  _carSpeed(trip) {
    // Sick scene (etc.): no new entries, no departures through the aisle.
    // Cars already past the mouth finish parking so they clear the apron;
    // ones still on the street may queue up to the mouth, then wait.
    if (this.lotHold) {
      if (trip.state === CS.DRIVE_OUT) return 0;
      if (trip.state === CS.DRIVE_IN) {
        const gate = Math.max(0, trip.lotFrom - 1);
        if (trip.pathI >= trip.lotFrom) return trip.speedLot; // already in — finish
        if (trip.pathI >= gate) return 0; // at mouth — wait until hold lifts
      }
    }
    if (trip.state === CS.DRIVE_IN && trip.pathI >= trip.lotFrom) return trip.speedLot;
    if (trip.state === CS.DRIVE_OUT && trip.pathI < 4) return trip.speedLot;
    return trip.speedRoad;
  }

  _deliverySpeed(del) {
    if (this.lotHold) {
      if (del.state === DS.DRIVE_OUT) return 0;
      if (del.state === DS.DRIVE_IN) {
        // Semis are on the street — still hold at the stop zone
        const gate = Math.max(0, del.lotFrom - 1);
        if (del.pathI >= del.lotFrom) return del.isSemi ? 0 : del.speedLot;
        if (del.pathI >= gate) return 0;
      }
    }
    if (del.state === DS.DRIVE_IN && del.pathI >= del.lotFrom) return del.speedLot;
    if (del.state === DS.DRIVE_OUT && del.pathI < 3) {
      return del.isSemi ? del.speedRoad * 0.7 : del.speedLot;
    }
    return del.speedRoad;
  }

  _garbageSpeed(job) {
    if (this.lotHold) {
      if (job.state === GS.DRIVE_OUT) return 0;
      if (job.state === GS.DRIVE_IN) {
        const gate = Math.max(0, job.lotFrom - 1);
        if (job.pathI >= job.lotFrom) return job.speedLot;
        if (job.pathI >= gate) return 0;
      }
    }
    if (job.state === GS.DRIVE_IN && job.pathI >= job.lotFrom) return job.speedLot;
    if (job.state === GS.DRIVE_OUT && job.pathI < 3) return job.speedLot;
    return job.speedRoad;
  }

  _finishGarbage(job) {
    this._resetLeslie();
    if (job.unit) {
      job.unit.busy = false;
      job.unit.mesh.visible = false;
      job.unit.mesh.userData.setLift?.(0);
    }
  }

  _pathGarbageOut(job) {
    const truck = job.unit.mesh;
    return this._clean([
      truck.position.clone(),
      new THREE.Vector3(this.aisle.x, 0.02, truck.position.z),
      this.aisle.clone(),
      this.mouth.clone(),
      new THREE.Vector3(this.mouth.x, 0.02, STREET.curbZ),
      ...roadPolyline(this.mouth.x, STREET.xMin + 1, -1),
    ]);
  }

  _tickGarbage(job, dt) {
    const truck = job.unit.mesh;
    const leslie = this.leslie;
    const home = this.leslieHome;

    switch (job.state) {
      case GS.DRIVE_IN: {
        const r = this._advance(
          truck,
          job.path,
          job.pathI,
          this._garbageSpeed(job) * this.frontSpeedScale(truck),
          dt,
          job.stopFaceY
        );
        job.pathI = r.pathI;
        if (!r.done) break;
        truck.rotation.y = job.stopFaceY;
        job.t = 0;
        job.state = GS.GRAB;
        break;
      }
      case GS.GRAB: {
        // Arms swing down onto Leslie
        job.t += dt;
        const k = Math.min(1, job.t / 1.1);
        truck.userData.setLift?.(k * 0.22);
        // Nudge Leslie slightly as the forks catch her
        if (leslie && home) {
          leslie.position.y = home.y + k * 0.08;
          leslie.rotation.z = Math.sin(k * Math.PI) * 0.04;
        }
        if (k < 1) break;
        job.t = 0;
        job.state = GS.LIFT;
        break;
      }
      case GS.LIFT: {
        // Raise and tip her into the hopper
        job.t += dt;
        const k = Math.min(1, job.t / 2.2);
        const ease = k * k * (3 - 2 * k); // smoothstep
        truck.userData.setLift?.(0.22 + ease * 0.78);
        if (leslie && home) {
          leslie.position.y = home.y + ease * 1.85;
          leslie.rotation.x = home.rotX + ease * 1.35;
          leslie.rotation.z = Math.sin(ease * Math.PI) * 0.08;
          // Soft squash as she goes inverted
          const sq = 1 + Math.sin(ease * Math.PI) * 0.06;
          leslie.scale.set(sq, 1 / sq, sq);
        }
        if (k < 1) break;
        job.t = 0;
        job.shake = 0;
        job.state = GS.EMPTY;
        break;
      }
      case GS.EMPTY: {
        // Shake the goods out — Leslie's happy to be light again
        job.t += dt;
        job.shake += dt;
        const shake = Math.sin(job.shake * 28) * 0.06;
        truck.userData.setLift?.(1.0);
        if (leslie && home) {
          leslie.position.y = home.y + 1.85 + Math.abs(Math.sin(job.shake * 20)) * 0.05;
          leslie.rotation.x = home.rotX + 1.35;
          leslie.rotation.z = shake;
          leslie.scale.set(1.05, 0.92, 1.05);
        }
        // Brief hopper pulse via scale on truck (reads as packer kicking)
        truck.scale.y = 1 + Math.sin(job.shake * 16) * 0.015;
        if (job.t < 1.6) break;
        truck.scale.y = 1;
        job.t = 0;
        job.state = GS.LOWER;
        break;
      }
      case GS.LOWER: {
        job.t += dt;
        const k = Math.min(1, job.t / 2.0);
        const ease = k * k * (3 - 2 * k);
        truck.userData.setLift?.(1.0 - ease);
        if (leslie && home) {
          leslie.position.y = home.y + (1 - ease) * 1.85;
          leslie.rotation.x = home.rotX + (1 - ease) * 1.35;
          leslie.rotation.z = (1 - ease) * 0.04;
          const s = 1 + (1 - ease) * 0.04;
          leslie.scale.set(s, 1 / s, s);
        }
        if (k < 1) break;
        this._resetLeslie();
        // Little grateful hop
        job.t = 0;
        job.happy = 0.85;
        // Fall through into a short happy beat then leave
        job.state = GS.DRIVE_OUT;
        job.path = this._pathGarbageOut(job);
        job.pathI = 0;
        // one-frame settle: actually do happy hop via residual
        job._hop = 0.9;
        break;
      }
      case GS.DRIVE_OUT: {
        // Leslie's post-empty hop while the truck rolls away
        if (job._hop > 0 && leslie) {
          job._hop -= dt;
          const w = Math.max(0, job._hop);
          const s = Math.sin(w * 15);
          leslie.position.y = home.y + Math.abs(s) * 0.07 * w;
          leslie.scale.set(1 + s * 0.03 * w, 1 - s * 0.04 * w, 1 + s * 0.03 * w);
          if (job._hop <= 0) this._resetLeslie();
        }
        const r = this._advance(
          truck,
          job.path,
          job.pathI,
          this._garbageSpeed(job) * this.frontSpeedScale(truck),
          dt
        );
        job.pathI = r.pathI;
        if (r.done) {
          this._resetLeslie();
          job.state = "done";
        }
        break;
      }
      default:
        job.state = "done";
    }
  }

  _finishDelivery(del) {
    if (del.unit) {
      del.unit.busy = false;
      del.unit.mesh.visible = false;
    }
    if (del.driver) {
      del.driver.visible = false;
      this.root.remove(del.driver);
      // Dispose is overkill for pool-less one-shot meshes; drop references
      del.driver = null;
    }
    del.crate = null;
  }

  /** Path from truck stop to porch door (box truck from aisle; semi from curb). */
  _pathDeliveryToDoor(del) {
    const start = del.driver.position.clone();
    if (del.isSemi) {
      return this._clean([
        start,
        sidewalkPoint(start.x),
        ...sidewalkPolyline(start.x, this.streetDoor.x),
        this.streetDoor.clone(),
      ]);
    }
    return this._clean([
      start,
      new THREE.Vector3(this.aisle.x + 0.7, 0, start.z),
      this.yardCorner.clone(),
      this.streetDoor.clone(),
    ]);
  }

  _pathDoorToDelivery(del) {
    const end = this._pedBesideDelivery(del);
    if (del.isSemi) {
      return this._clean([
        this.streetDoor.clone(),
        sidewalkPoint(this.streetDoor.x),
        ...sidewalkPolyline(this.streetDoor.x, end.x),
        end,
      ]);
    }
    return this._clean([
      this.streetDoor.clone(),
      this.yardCorner.clone(),
      new THREE.Vector3(this.aisle.x + 0.7, 0, end.z),
      end,
    ]);
  }

  _pedBesideDelivery(del) {
    const mesh = del.unit.mesh;
    const yaw = mesh.rotation.y;
    // Stand on the building / curb side of the truck
    const side = del.isSemi ? 1 : 1; // +X-ish via cos for yaw≈0...
    return new THREE.Vector3(
      mesh.position.x + Math.cos(yaw) * 0.85 * side,
      0,
      mesh.position.z - Math.sin(yaw) * 0.85 * side
    );
  }

  _pathDeliveryOut(del) {
    if (del.isSemi) {
      const x = del.unit.mesh.position.x;
      return this._clean([
        del.unit.mesh.position.clone(),
        ...roadPolyline(x, STREET.xMin + 1, -1),
      ]);
    }
    // Back down the aisle, out the mouth, north on 7th
    return this._clean([
      del.unit.mesh.position.clone(),
      new THREE.Vector3(this.aisle.x, 0.02, (del.unit.mesh.position.z + this.mouth.z) * 0.5),
      this.mouth.clone(),
      new THREE.Vector3(this.mouth.x, 0.02, STREET.curbZ),
      ...roadPolyline(this.mouth.x, STREET.xMin + 1, -1),
    ]);
  }

  _tickDelivery(del, dt) {
    const truck = del.unit.mesh;

    switch (del.state) {
      case DS.DRIVE_IN: {
        const r = this._advance(
          truck,
          del.path,
          del.pathI,
          this._deliverySpeed(del) * this.frontSpeedScale(truck),
          dt,
          del.stopFaceY
        );
        del.pathI = r.pathI;
        if (!r.done) break;
        truck.rotation.y = del.stopFaceY;
        // Driver steps out with a crate
        const beside = this._pedBesideDelivery(del);
        del.driver.position.copy(beside);
        del.driver.visible = true;
        if (del.crate) del.crate.visible = true;
        del.path = this._pathDeliveryToDoor(del);
        del.pathI = 0;
        del.state = DS.WALK_IN;
        break;
      }
      case DS.WALK_IN: {
        const r = this._advance(
          del.driver,
          del.path,
          del.pathI,
          del.walkSpeed,
          dt
        );
        del.pathI = r.pathI;
        del.driver.position.y = Math.abs(Math.sin(this.now * 9)) * 0.04;
        if (!r.done) break;
        del.driver.position.y = 0;
        // Hand off at the door — hide crate for a beat
        if (del.crate) del.crate.visible = false;
        del.dwellLeft = 2.2 + Math.random() * 1.4;
        del.state = DS.DROP;
        break;
      }
      case DS.DROP: {
        del.dwellLeft -= dt;
        // Slight shift like waiting for a signature
        del.driver.rotation.y = Math.atan2(
          this.streetDoor.x - del.driver.position.x,
          this.streetDoor.z - del.driver.position.z
        );
        if (del.dwellLeft > 0) break;
        del.tripsLeft -= 1;
        if (del.tripsLeft > 0) {
          // Another crate run — walk back empty, then out again full
          del.path = this._pathDoorToDelivery(del);
          del.pathI = 0;
          del.state = DS.WALK_OUT;
          del._reload = true;
          break;
        }
        del.path = this._pathDoorToDelivery(del);
        del.pathI = 0;
        del._reload = false;
        del.state = DS.WALK_OUT;
        break;
      }
      case DS.WALK_OUT: {
        const r = this._advance(
          del.driver,
          del.path,
          del.pathI,
          del.walkSpeed * 1.05,
          dt
        );
        del.pathI = r.pathI;
        del.driver.position.y = Math.abs(Math.sin(this.now * 9)) * 0.04;
        if (!r.done) break;
        del.driver.position.y = 0;
        if (del._reload) {
          // Grab another case from the truck
          if (del.crate) del.crate.visible = true;
          del.path = this._pathDeliveryToDoor(del);
          del.pathI = 0;
          del.state = DS.WALK_IN;
          del._reload = false;
          break;
        }
        // Done — board and leave
        del.driver.visible = false;
        del.path = this._pathDeliveryOut(del);
        del.pathI = 0;
        del.state = DS.DRIVE_OUT;
        break;
      }
      case DS.DRIVE_OUT: {
        const r = this._advance(
          truck,
          del.path,
          del.pathI,
          this._deliverySpeed(del) * this.frontSpeedScale(truck),
          dt
        );
        del.pathI = r.pathI;
        if (r.done) del.state = "done";
        break;
      }
      default:
        del.state = "done";
    }
  }

  _tickCar(trip, dt) {
    const car = trip.car.mesh;

    switch (trip.state) {
      case CS.DRIVE_IN: {
        const r = this._advance(
          car,
          trip.path,
          trip.pathI,
          this._carSpeed(trip) * this.frontSpeedScale(car),
          dt,
          trip.spot.faceY
        );
        trip.pathI = r.pathI;
        if (!r.done) break;
        car.rotation.y = trip.spot.faceY;
        // Parked — kill headlights while patrons are out / inside
        setCarLightsOff(car);
        const ped = this._takePed();
        if (!ped) {
          // No mesh free — the party walks in "off-camera"
          this._enterInside(trip.party);
          trip.heldInside = trip.party;
          trip.dwellLeft = trip.dwell;
          trip.state = CS.INSIDE;
          break;
        }
        trip.ped = ped;
        const start = this._pedBesideCar(car);
        ped.mesh.position.copy(start);
        trip.path = this._pathStallToDoor(start);
        trip.pathI = 0;
        trip.unloadWait = 0.25 + Math.random() * 0.35;
        trip.state = CS.UNLOAD;
        break;
      }
      case CS.UNLOAD: {
        if (trip.unloadWait > 0) {
          trip.unloadWait -= dt;
          break;
        }
        const r = this._advance(
          trip.ped.mesh,
          trip.path,
          trip.pathI,
          trip.walkSpeed,
          dt
        );
        trip.pathI = r.pathI;
        this._bob(trip, dt);
        if (!r.done) break;
        this._freePed(trip.ped);
        trip.ped = null;
        this._enterInside(trip.party);
        trip.heldInside = trip.party;
        trip.dwellLeft = trip.dwell;
        trip.state = CS.INSIDE;
        break;
      }
      case CS.INSIDE: {
        trip.dwellLeft -= dt;
        if (trip.dwellLeft > 0) break;
        const ped = this._takePed();
        if (!ped) {
          // Retry shortly rather than teleporting the car away
          trip.dwellLeft = 3 + Math.random() * 5;
          break;
        }
        trip.ped = ped;
        // Start inside and walk out the door so the exit is readable
        const inside = this._doorInside();
        ped.mesh.position.copy(inside);
        const end = this._pedBesideCar(car);
        trip.path = this._clean([
          inside,
          this.streetDoor,
          this.yardCorner,
          new THREE.Vector3(this.aisle.x, 0, end.z),
          end,
        ]);
        trip.pathI = 0;
        // The party this car brought is heading home
        this._releaseInside(trip.heldInside);
        trip.heldInside = 0;
        trip.state = CS.LOAD;
        break;
      }
      case CS.LOAD: {
        const r = this._advance(
          trip.ped.mesh,
          trip.path,
          trip.pathI,
          trip.walkSpeed,
          dt
        );
        trip.pathI = r.pathI;
        this._bob(trip, dt);
        if (!r.done) break;
        this._freePed(trip.ped);
        trip.ped = null;
        trip.path = this._pathOutOfLot(trip.spot) || [car.position.clone()];
        trip.pathI = 0;
        trip.state = CS.DRIVE_OUT;
        break;
      }
      case CS.DRIVE_OUT: {
        const r = this._advance(
          car,
          trip.path,
          trip.pathI,
          this._carSpeed(trip) * this.frontSpeedScale(car),
          dt
        );
        trip.pathI = r.pathI;
        if (r.done) trip.state = "done";
        break;
      }
      default:
        trip.state = "done";
    }
  }

  /** Remove n occupants without spawning walk-out meshes (they left by car). */
  _releaseInside(n) {
    for (let i = 0; i < n && this.inside.length; i++) this.inside.pop();
  }

  _tickWalker(wk, dt) {
    const mesh = wk.ped.mesh;

    switch (wk.state) {
      case PS.TO_DOOR: {
        const r = this._advance(mesh, wk.path, wk.pathI, wk.speed, dt);
        wk.pathI = r.pathI;
        this._bob(wk, dt);
        if (!r.done) break;
        // The generic cleanup returns the mesh to the pool
        this._enterInside(1);
        wk.state = "done";
        break;
      }
      case PS.TO_PATIO: {
        const r = this._advance(mesh, wk.path, wk.pathI, wk.speed, dt);
        wk.pathI = r.pathI;
        this._bob(wk, dt, 7, 0.035);
        if (!r.done) break;
        mesh.position.y = 0;
        wk.dwellLeft = 25 + Math.random() * 60;
        wk.state = PS.AT_PATIO;
        break;
      }
      case PS.AT_PATIO: {
        wk.dwellLeft -= dt;
        wk.ped.bob += dt * 2.8;
        mesh.position.y = Math.abs(Math.sin(wk.ped.bob)) * 0.02;
        mesh.rotation.y += Math.sin(wk.ped.bob * 0.4) * 0.003;
        if (wk.dwellLeft > 0) break;
        if (wk.spot) {
          wk.spot.occupied = false;
          wk.spot = null;
        }
        // Back inside, then out the front later
        if (Math.random() < 0.55) {
          wk.path = this._clean([mesh.position.clone(), this.patioDoor]);
          wk.pathI = 0;
          wk.state = PS.TO_INSIDE;
        } else {
          mesh.position.copy(this.patioDoor);
          wk.path = this._pathDoorToOffscreen();
          wk.pathI = 0;
          wk.state = PS.LEAVING;
        }
        break;
      }
      case PS.TO_INSIDE: {
        const r = this._advance(mesh, wk.path, wk.pathI, wk.speed, dt);
        wk.pathI = r.pathI;
        this._bob(wk, dt, 7, 0.035);
        if (!r.done) break;
        this._enterInside(1);
        wk.state = "done";
        break;
      }
      case PS.LEAVING: {
        const r = this._advance(mesh, wk.path, wk.pathI, wk.speed, dt);
        wk.pathI = r.pathI;
        this._bob(wk, dt);
        if (r.done) wk.state = "done";
        break;
      }
      default:
        wk.state = "done";
    }
  }

  // ── Stats ─────────────────────────────────────────────────────────

  stats() {
    const carsParked = this.spots.filter((s) => s.occupied).length;
    const onPatio = this.patioSpots.filter((p) => p.occupied).length;
    const visible =
      this.walkers.filter((w) => w.ped?.mesh?.visible).length +
      this.carTrips.filter((t) => t.ped?.mesh?.visible).length;
    return {
      inside: this.inside.length,
      capacity: MAX_INSIDE,
      target: this.target,
      carsParked,
      stalls: this.spots.length,
      onPatio,
      patioSpots: this.patioSpots.length,
      outside: visible,
      arrivals10m: this.arrivalLog.length,
      busyness: this.busyness,
    };
  }
}
