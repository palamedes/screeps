/**
 * rat.gutterrunner.js
 *
 * Gutter Runner behavior — fast scout for the Skaven intelligence network.
 * Expands outward from homeRoom in a BFS pattern up to MAX_SCOUT_DEPTH hops,
 * building a full intelligence map of the surrounding region.
 *
 * Body: pure MOVE — always travels at 1 tile/tick on plains/roads.
 *
 * Behavior loop:
 *   idle (in homeRoom) → BFS pick target → follow path out → scan → follow path home → idle
 *
 * Multi-hop routing works because Game.map.describeExits() returns exit data
 * for any room without requiring vision. The full path is calculated before
 * leaving home and stored in memory — transit just follows it step by step.
 *
 * BFS priority: missing intel first, then stale intel, nearest rooms first.
 * This means the runner systematically covers ring 1 before ring 2, ring 2
 * before ring 3 — you always have a complete picture of the inner frontier
 * before pushing further out.
 *
 * If the runner ends up off-path it recalculates. If it's completely lost
 * it suicides so spawn director queues a fresh replacement.
 *
 * Intelligence written to: Memory.intelligence[roomName]
 * Schema documented at bottom of this file.
 *
 * Called by: rat.js → Creep.prototype.tick()
 * Movement:  all through Traffic.requestMove — no direct moveTo
 */

const Traffic = require('traffic');

// Max hops from homeRoom the runner will scout.
// 3 hops = up to ~24 rooms depending on map layout. Good regional coverage
// without sending the runner so far it can't reliably navigate home.
// Increase to 4+ once multi-hop is proven stable.
const MAX_SCOUT_DEPTH = 3;

// How old (in ticks) intelligence must be before it's worth re-scouting.
// ~5000 ticks ≈ 83 minutes of real time.
const INTEL_STALE_AGE = 5000;

// Exit direction keys from Game.map.describeExits → FIND_EXIT_* constants
const EXIT_FIND = {
  '1': FIND_EXIT_TOP,
  '3': FIND_EXIT_RIGHT,
  '5': FIND_EXIT_BOTTOM,
  '7': FIND_EXIT_LEFT
};

// ─────────────────────────────────────────────────────── Main behavior tick ──

Creep.prototype.runGutterRunner = function () {

  if (!this.memory.homeRoom) {
    this.memory.homeRoom = this.room.name;
  }

  switch (this.memory.grPhase) {
    case 'transit_out':  return this._grTransitOut();
    case 'scanning':     return this._grScan();
    case 'transit_home': return this._grTransitHome();
    default:             return this._grIdle();
  }
};

// ───────────────────────────────────────────────────────────────── Phases ──

/**
 * Idle: in homeRoom, nothing assigned.
 * BFS to find the next room worth scouting, store full path, begin transit.
 */
Creep.prototype._grIdle = function () {

  if (this.room.name !== this.memory.homeRoom) {
    this._grStartTransitHome();
    return;
  }

  const result = this._grBfsFindTarget();

  if (!result) {
    // Everything within range is fresh — nothing to do
    return;
  }

  this.memory.grPath   = result.path;   // [homeRoom, roomA, roomB, ..., target]
  this.memory.grTarget = result.target;
  this.memory.grPhase  = 'transit_out';

  console.log(
    `[gutterrunner:${this.name}] assigned to scout ${result.target} ` +
    `(${result.depth} hop${result.depth === 1 ? '' : 's'}: ${result.path.join(' → ')})`
  );

  this._grTransitOut();
};

/**
 * Transit out: follow grPath forward.
 * Advance one room per crossing — the game changes this.room automatically
 * when the creep steps through an exit tile.
 */
Creep.prototype._grTransitOut = function () {

  if (this.room.name === this.memory.grTarget) {
    this.memory.grPhase = 'scanning';
    this._grScan();
    return;
  }

  const nextRoom = this._grNextRoomOnPath(this.memory.grPath, this.room.name, false);

  if (!nextRoom) {
    // Off path — try recalculating from current position
    console.log(`[gutterrunner:${this.name}] path broken at ${this.room.name} — recalculating`);
    const recovery = this._grBfsFindTargetFrom(this.room.name);
    if (recovery) {
      this.memory.grPath   = recovery.path;
      this.memory.grTarget = recovery.target;
      this._grTransitOut();
    } else {
      this._grStartTransitHome();
    }
    return;
  }

  const exitPos = this._grExitToward(this.room.name, nextRoom);

  if (!exitPos) {
    console.log(`[gutterrunner:${this.name}] can't find exit ${this.room.name} → ${nextRoom} — aborting`);
    this._grStartTransitHome();
    return;
  }

  Traffic.requestMove(this, exitPos, { range: 0 });
};

/**
 * Scanning: we're in the target room — collect and write intelligence.
 */
Creep.prototype._grScan = function () {

  if (this.room.name !== this.memory.grTarget) {
    this._grStartTransitHome();
    return;
  }

  this._grWriteIntelligence(this.room);
  this._grStartTransitHome();
};

/**
 * Transit home: follow grPath in reverse back to homeRoom.
 */
Creep.prototype._grTransitHome = function () {

  if (this.room.name === this.memory.homeRoom) {
    this.memory.grPhase  = null;
    this.memory.grTarget = null;
    this.memory.grPath   = null;
    return;
  }

  const nextRoom = this._grNextRoomOnPath(this.memory.grPath, this.room.name, true);

  if (!nextRoom) {
    // Stored path doesn't cover current position — try emergency routing
    console.log(`[gutterrunner:${this.name}] lost on return from ${this.room.name} — emergency routing`);
    const emergencyExit = this._grEmergencyRouteHome();
    if (!emergencyExit) {
      console.log(`[gutterrunner:${this.name}] completely lost — suiciding`);
      this.suicide();
      return;
    }
    Traffic.requestMove(this, emergencyExit, { range: 0 });
    return;
  }

  const exitPos = this._grExitToward(this.room.name, nextRoom);

  if (!exitPos) {
    console.log(`[gutterrunner:${this.name}] can't find exit home ${this.room.name} → ${nextRoom} — suiciding`);
    this.suicide();
    return;
  }

  Traffic.requestMove(this, exitPos, { range: 0 });
};

// ──────────────────────────────────────────────────────── BFS path finding ──

/**
 * BFS outward from homeRoom to find the nearest room needing scouting.
 * Uses Game.map.describeExits() — no vision required.
 *
 * Prioritizes: unscouted > stale, and nearer rooms before farther ones
 * (BFS naturally gives shortest-path-first).
 *
 * @return {{ target, path, depth }} or null if everything is fresh
 */
Creep.prototype._grBfsFindTarget = function () {
  return this._grBfsFindTargetFrom(this.memory.homeRoom, true);
};

/**
 * BFS from an arbitrary start room. Used for in-transit recalculation.
 * When called mid-transit (fromHome=false) we don't enforce homeRoom as
 * the path root — the stored grPath handles the return leg.
 *
 * @param  {string}  startRoom
 * @param  {boolean} fromHome   — true when starting fresh from homeRoom
 * @return {{ target, path, depth }} or null
 */
Creep.prototype._grBfsFindTargetFrom = function (startRoom, fromHome) {
  const intel = Memory.intelligence || {};

  const queue   = [{ roomName: startRoom, path: [startRoom] }];
  const visited = new Set([startRoom]);

  while (queue.length) {
    const { roomName, path } = queue.shift();
    const depth = path.length - 1;

    // Evaluate this room (skip the start room itself when starting from home)
    if (depth > 0 || !fromHome) {
      if (depth > 0) { // always skip the actual start node
        const entry     = intel[roomName];
        const unscouted = !entry;
        const stale     = entry && (Game.time - entry.scoutedAt) > INTEL_STALE_AGE;

        if (unscouted || stale) {
          return { target: roomName, path, depth };
        }
      }
    }

    if (depth >= MAX_SCOUT_DEPTH) continue;

    const exits = Game.map.describeExits(roomName);
    for (const dir in exits) {
      const neighbor = exits[dir];
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push({ roomName: neighbor, path: [...path, neighbor] });
      }
    }
  }

  return null;
};

/**
 * Given the stored path and current room, return the next room to move toward.
 *
 * @param  {string[]} path     - room sequence from homeRoom to target
 * @param  {string}   current  - where we are now
 * @param  {boolean}  reverse  - true when returning home
 * @return {string|null}
 */
Creep.prototype._grNextRoomOnPath = function (path, current, reverse) {
  if (!path || !path.length) return null;

  const route = reverse ? [...path].reverse() : path;
  const idx   = route.indexOf(current);

  if (idx === -1 || idx >= route.length - 1) return null;

  return route[idx + 1];
};

/**
 * Emergency home routing when the stored path can't help.
 * Checks up to 2 hops via Game.map.describeExits — no vision needed.
 *
 * @return {RoomPosition|null}
 */
Creep.prototype._grEmergencyRouteHome = function () {
  const home  = this.memory.homeRoom;
  const exits = Game.map.describeExits(this.room.name);

  // Direct neighbor?
  for (const dir in exits) {
    if (exits[dir] === home) {
      return this._grExitToward(this.room.name, home);
    }
  }

  // Two hops — check neighbors of neighbors
  for (const dir in exits) {
    const neighbor       = exits[dir];
    const neighborExits  = Game.map.describeExits(neighbor);
    for (const nDir in neighborExits) {
      if (neighborExits[nDir] === home) {
        return this._grExitToward(this.room.name, neighbor);
      }
    }
  }

  return null;
};

// ──────────────────────────────────────────────────────── Intelligence scan ──

/**
 * Write a full room intelligence snapshot to Memory.intelligence[roomName].
 * Must only be called when we have vision of the room (this.room === target).
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
      owner:    room.controller.owner ? room.controller.owner.username : null,
      level:    room.controller.level,
      reserved: room.controller.reservation
        ? room.controller.reservation.username
        : false
    };
  }

  const exits    = Game.map.describeExits(room.name);
  const hostiles = room.find(FIND_HOSTILE_CREEPS);
  const threat   = hostiles.length === 0
    ? 'none'
    : hostiles.some(h =>
      h.getActiveBodyparts(ATTACK) > 0 ||
      h.getActiveBodyparts(RANGED_ATTACK) > 0
    )
      ? 'high'
      : 'low';

  const minerals = room.find(FIND_MINERALS).map(m => ({
    type:   m.mineralType,
    amount: m.mineralAmount
  }));

  Memory.intelligence[room.name] = {
    scoutedAt:  Game.time,
    scoutedBy:  this.memory.homeRoom,
    sources,
    controller,
    exits,
    hostiles:   { count: hostiles.length, threat },
    minerals,
    safeMode:   room.controller ? !!room.controller.safeMode : false
  };

  console.log(
    `[gutterrunner:${this.name}] scouted ${room.name} — ` +
    `${sources.length} source${sources.length !== 1 ? 's' : ''} | ` +
    `controller: ${controller.owner || 'unowned'} RCL${controller.level} | ` +
    `threat: ${threat}` +
    (minerals.length ? ` | mineral: ${minerals.map(m => m.type).join(', ')}` : '')
  );
};

// ─────────────────────────────────────────────────────── Routing helpers ──

/**
 * Find the middle exit tile in fromRoom leading toward toRoom.
 * Middle tile avoids corner-hugging which can cause stuck issues near exits.
 *
 * @param  {string} fromRoomName
 * @param  {string} toRoomName
 * @return {RoomPosition|null}
 */
Creep.prototype._grExitToward = function (fromRoomName, toRoomName) {
  const exits = Game.map.describeExits(fromRoomName);

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

  const room = Game.rooms[fromRoomName];
  if (!room) return null; // need vision to get tile positions

  const tiles = room.find(findConst);
  if (!tiles.length) return null;

  return tiles[Math.floor(tiles.length / 2)];
};

/**
 * Flip to transit_home phase. grPath is kept so it can be reversed.
 * grTarget is cleared since scanning is done (or was aborted).
 */
Creep.prototype._grStartTransitHome = function () {
  this.memory.grPhase  = 'transit_home';
  this.memory.grTarget = null;
  this._grTransitHome();
};

/*
 * Memory.intelligence[roomName] schema (consumed by empire.js):
 *
 * {
 *   scoutedAt:  number,          // Game.time when last scanned
 *   scoutedBy:  string,          // homeRoom that sent the runner
 *   sources: [
 *     { id: string, x: number, y: number }
 *   ],
 *   controller: {
 *     owner:    string | null,   // username or null if unowned
 *     level:    number,          // 0 if unowned
 *     reserved: string | false   // reserving username or false
 *   },
 *   exits: {                     // from Game.map.describeExits
 *     '1': roomName,             // TOP
 *     '3': roomName,             // RIGHT
 *     '5': roomName,             // BOTTOM
 *     '7': roomName,             // LEFT
 *   },
 *   hostiles: {
 *     count:  number,
 *     threat: 'none' | 'low' | 'high'
 *   },
 *   minerals: [
 *     { type: string, amount: number }
 *   ],
 *   safeMode: boolean
 * }
 */