/**
 * rat.gutterrunner.js
 *
 * Gutter Runner behavior — fast scout for the Skaven intelligence network.
 * Skitters into adjacent rooms, maps everything worth knowing, then returns
 * home to let empire.js consume the data.
 *
 * Body: pure MOVE — always moves at 1 tile/tick on plains regardless of load.
 * No CARRY, no WORK, no weight. Just speed.
 *
 * Behavior loop:
 *   idle (in homeRoom) → pick target room → transit out → scan → transit home → idle
 *
 * v1 scope: adjacent rooms only (one hop). A runner that gets lost in a
 * two-hop chain and can't find home will suicide and a fresh one spawns.
 * Multi-hop routing is a v2 concern once the basic loop is proven.
 *
 * Intelligence written to: Memory.intelligence[roomName]
 * See schema at bottom of this file.
 *
 * Called by: rat.js → Creep.prototype.tick()
 * Movement:  all through Traffic.requestMove — no direct moveTo
 */

const Traffic = require('traffic');

// How old intelligence data must be (in ticks) before it's considered stale
// and worth re-scouting. ~5000 ticks ≈ 83 minutes.
const INTEL_STALE_AGE = 5000;

// Exit direction keys returned by Game.map.describeExits, mapped to
// room.find() constants so we can locate the actual exit tiles.
const EXIT_FIND = {
  '1': FIND_EXIT_TOP,
  '3': FIND_EXIT_RIGHT,
  '5': FIND_EXIT_BOTTOM,
  '7': FIND_EXIT_LEFT
};

// ─────────────────────────────────────────────────────── Main behavior tick ──

Creep.prototype.runGutterRunner = function () {

  // Ensure homeRoom is stamped — should be set by spawn director but
  // double-check here as a safety net.
  if (!this.memory.homeRoom) {
    this.memory.homeRoom = this.room.name;
  }

  // Route to current phase
  switch (this.memory.grPhase) {

    case 'transit_out':
      return this._grTransitOut();

    case 'scanning':
      return this._grScan();

    case 'transit_home':
      return this._grTransitHome();

    default:
      // Idle — pick next target and begin
      return this._grIdle();
  }
};

// ───────────────────────────────────────────────────────────────── Phases ──

/**
 * Idle: we're in homeRoom with nothing assigned.
 * Pick the next room that needs scouting and begin transit.
 */
Creep.prototype._grIdle = function () {

  // If somehow not home, recover
  if (this.room.name !== this.memory.homeRoom) {
    this.memory.grPhase = 'transit_home';
    return;
  }

  const target = this._grPickTarget();

  if (target) {
    this.memory.grTarget = target;
    this.memory.grPhase  = 'transit_out';
    console.log(`[gutterrunner:${this.name}] assigned to scout ${target}`);
    this._grTransitOut(); // start moving this tick
  }
  // else: nothing to scout, idle near spawn
};

/**
 * Transit out: move toward the target room's entry exit.
 * When we cross the boundary the game auto-changes this.room —
 * next tick grPhase transitions to 'scanning'.
 */
Creep.prototype._grTransitOut = function () {

  // Arrived!
  if (this.room.name === this.memory.grTarget) {
    this.memory.grPhase = 'scanning';
    this._grScan(); // scan immediately, don't waste the tick
    return;
  }

  const exitPos = this._grExitToward(this.room.name, this.memory.grTarget);

  if (!exitPos) {
    // Can't find a route — target must not be directly adjacent from here.
    // Abort and go home; spawn director will try again next cycle.
    console.log(
      `[gutterrunner:${this.name}] can't find exit toward ${this.memory.grTarget} ` +
      `from ${this.room.name} — aborting`
    );
    this.memory.grPhase  = 'transit_home';
    this.memory.grTarget = null;
    return;
  }

  Traffic.requestMove(this, exitPos, { range: 0 });
};

/**
 * Scanning: we're in the target room. Collect intelligence, write it to
 * Memory, then flip to transit_home.
 */
Creep.prototype._grScan = function () {

  // Sanity: if we're not in the target room, something weird happened
  if (this.room.name !== this.memory.grTarget) {
    this.memory.grPhase = 'transit_home';
    return;
  }

  this._grWriteIntelligence(this.room);

  this.memory.grPhase = 'transit_home';
  this._grTransitHome(); // start moving home this same tick
};

/**
 * Transit home: return to homeRoom.
 * On arrival, clear phase so we go idle next tick and pick a new target.
 */
Creep.prototype._grTransitHome = function () {

  if (this.room.name === this.memory.homeRoom) {
    // Home — clear assignment and go idle
    this.memory.grPhase  = null;
    this.memory.grTarget = null;
    return;
  }

  const exitPos = this._grExitToward(this.room.name, this.memory.homeRoom);

  if (!exitPos) {
    // Can't find home — this runner is lost. Suicide so spawn director
    // queues a fresh one rather than leaving a permanently wandering creep.
    console.log(
      `[gutterrunner:${this.name}] can't find route home from ${this.room.name} — suiciding`
    );
    this.suicide();
    return;
  }

  Traffic.requestMove(this, exitPos, { range: 0 });
};

// ──────────────────────────────────────────────────────── Intelligence scan ──

/**
 * Write a full room intelligence snapshot to Memory.intelligence[roomName].
 * Calling this from outside a room we have vision of produces garbage —
 * only call when this.room === target.
 */
Creep.prototype._grWriteIntelligence = function (room) {

  if (!Memory.intelligence) Memory.intelligence = {};

  const sources = room.find(FIND_SOURCES).map(s => ({
    id: s.id,
    x:  s.pos.x,
    y:  s.pos.y
  }));

  let controller = { owner: null, level: 0, reserved: false };
  if (room.controller) {
    controller = {
      owner:    room.controller.owner    ? room.controller.owner.username   : null,
      level:    room.controller.level,
      reserved: room.controller.reservation
        ? room.controller.reservation.username
        : false
    };
  }

  // describeExits gives us { '1': 'W31S58', '3': 'W33S59', ... }
  // Keys are direction strings matching EXIT_FIND above.
  const exits = Game.map.describeExits(room.name);

  const hostiles = room.find(FIND_HOSTILE_CREEPS);
  const threat = hostiles.length === 0
    ? 'none'
    : hostiles.some(h =>
      h.getActiveBodyparts(ATTACK) > 0 ||
      h.getActiveBodyparts(RANGED_ATTACK) > 0
    )
      ? 'high'
      : 'low';

  Memory.intelligence[room.name] = {
    scoutedAt:  Game.time,
    scoutedBy:  this.memory.homeRoom,
    sources,
    controller,
    exits,
    hostiles:   { count: hostiles.length, threat },
    safeMode:   room.controller ? !!room.controller.safeMode : false
  };

  console.log(
    `[gutterrunner:${this.name}] scouted ${room.name} — ` +
    `${sources.length} sources | ` +
    `controller: ${controller.owner || 'unowned'} (RCL${controller.level}) | ` +
    `threat: ${threat}`
  );
};

// ─────────────────────────────────────────────────────── Routing helpers ──

/**
 * Pick the next room to scout.
 * Checks all direct exits from homeRoom against Memory.intelligence.
 * Prefers missing data over stale data; picks the first unsatisfied room.
 *
 * Returns a roomName string, or null if everything is fresh.
 */
Creep.prototype._grPickTarget = function () {
  const exits = Game.map.describeExits(this.memory.homeRoom);
  const intel = Memory.intelligence || {};

  // Pass 1: rooms with NO intelligence at all
  for (const dir in exits) {
    const roomName = exits[dir];
    if (!intel[roomName]) return roomName;
  }

  // Pass 2: rooms with stale intelligence
  for (const dir in exits) {
    const roomName = exits[dir];
    if ((Game.time - intel[roomName].scoutedAt) > INTEL_STALE_AGE) {
      return roomName;
    }
  }

  return null;
};

/**
 * Find the exit tile(s) in fromRoom that lead toward toRoom.
 * Returns a RoomPosition for the middle exit tile, or null if not adjacent.
 *
 * @param {string} fromRoomName
 * @param {string} toRoomName
 * @return {RoomPosition|null}
 */
Creep.prototype._grExitToward = function (fromRoomName, toRoomName) {
  const exits = Game.map.describeExits(fromRoomName);

  // Find which direction key points to the target room
  let exitDir = null;
  for (const dir in exits) {
    if (exits[dir] === toRoomName) {
      exitDir = dir;
      break;
    }
  }

  if (!exitDir) return null;

  const findConst = EXIT_FIND[exitDir];
  if (!findConst) return null;

  // fromRoom must be visible (we should be in it)
  const room = Game.rooms[fromRoomName];
  if (!room) return null;

  const tiles = room.find(findConst);
  if (!tiles.length) return null;

  // Pick the middle tile — avoids corners where pathfinding sometimes
  // gets stuck and reduces predictability for traffic manager
  return tiles[Math.floor(tiles.length / 2)];
};

/*
 * Memory.intelligence[roomName] schema (for reference / empire.js consumption):
 *
 * {
 *   scoutedAt:  number,          // Game.time when last scanned
 *   scoutedBy:  string,          // homeRoom of the runner that scouted
 *   sources: [                   // empty array for source-less rooms
 *     { id: string, x: number, y: number }
 *   ],
 *   controller: {
 *     owner:    string | null,   // username or null if unowned
 *     level:    number,          // 0 if unowned
 *     reserved: string | false   // reserving username or false
 *   },
 *   exits: {                     // from Game.map.describeExits
 *     '1': roomName,             // direction key → adjacent roomName
 *     '3': roomName,             // (not all directions always present)
 *     ...
 *   },
 *   hostiles: {
 *     count:  number,
 *     threat: 'none' | 'low' | 'high'
 *   },
 *   safeMode: boolean
 * }
 */