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
 *   idle → BFS pick target → transit out (hop by hop) → scan → transit home → idle
 *
 * KEY FIX (v3): Border tile crossing.
 *   When a creep enters room B from room A, it appears ON the border tile
 *   (e.g. x=0 if it came from the left). The exit tiles back to room A are
 *   ALSO at x=0. Traffic.requestMove to range=0 sees the creep is already
 *   there and skips the move — the creep gets stuck, stuck recovery fires a
 *   random nudge, and the creep oscillates back and forth indefinitely.
 *
 *   Fix: _grCrossToward() checks if we're already on the border tile.
 *   If yes, call creep.move(exitDirection) directly to actually cross.
 *   If no, use Traffic.requestMove normally to approach the tile.
 *
 *   Phase transitions no longer chain within the same tick — each phase
 *   sets the next phase and returns, keeping one Traffic call per tick.
 *
 * Called by: rat.js → Creep.prototype.tick()
 * Movement:  Traffic.requestMove for approach, direct move() for crossing
 */

const Traffic = require('traffic');

// Max hops from homeRoom the runner will scout.
// 3 hops = up to ~24 rooms depending on layout — solid regional coverage.
const MAX_SCOUT_DEPTH = 3;

// How old (in ticks) before data is worth re-scouting. ~83 real minutes.
const INTEL_STALE_AGE = 5000;

// Game.map.describeExits direction keys → FIND_EXIT_* and direction constants
const EXIT_FIND = {
  '1': FIND_EXIT_TOP,
  '3': FIND_EXIT_RIGHT,
  '5': FIND_EXIT_BOTTOM,
  '7': FIND_EXIT_LEFT
};

const EXIT_MOVE_DIR = {
  '1': TOP,
  '3': RIGHT,
  '5': BOTTOM,
  '7': LEFT
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
 * Idle: in homeRoom. BFS to find the next room worth scouting.
 * Sets phase and returns — transit begins next tick.
 */
Creep.prototype._grIdle = function () {

  if (this.room.name !== this.memory.homeRoom) {
    // Somehow not home — start heading back
    this.memory.grPhase = 'transit_home';
    return;
  }

  const result = this._grBfsFindTarget();

  if (!result) {
    // Everything within MAX_SCOUT_DEPTH is fresh — nothing to do
    return;
  }

  this.memory.grPath   = result.path;   // [homeRoom, ..., target]
  this.memory.grTarget = result.target;
  this.memory.grPhase  = 'transit_out';

  console.log(
    `[gutterrunner:${this.name}] scouting ${result.target} ` +
    `(${result.depth} hop${result.depth === 1 ? '' : 's'}: ${result.path.join(' → ')})`
  );
  // Movement starts next tick
};

/**
 * Transit out: follow grPath forward toward target.
 * One room crossing per tick (or approach if not at border yet).
 */
Creep.prototype._grTransitOut = function () {

  if (this.room.name === this.memory.grTarget) {
    // Arrived — scan next tick
    this.memory.grPhase = 'scanning';
    return;
  }

  const nextRoom = this._grNextRoomOnPath(this.memory.grPath, this.room.name, false);

  if (!nextRoom) {
    console.log(`[gutterrunner:${this.name}] path broken at ${this.room.name} — aborting to home`);
    this.memory.grPhase  = 'transit_home';
    this.memory.grTarget = null;
    return;
  }

  if (!this._grCrossToward(this.room.name, nextRoom)) {
    console.log(`[gutterrunner:${this.name}] can't exit ${this.room.name} → ${nextRoom} — aborting`);
    this.memory.grPhase  = 'transit_home';
    this.memory.grTarget = null;
  }
};

/**
 * Scanning: in target room. Write intelligence, then head home next tick.
 */
Creep.prototype._grScan = function () {

  // Sanity — should be in target room
  if (this.room.name !== this.memory.grTarget) {
    this.memory.grPhase  = 'transit_home';
    this.memory.grTarget = null;
    return;
  }

  this._grWriteIntelligence(this.room);

  this.memory.grPhase  = 'transit_home';
  this.memory.grTarget = null;
  // Movement home starts next tick
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
    console.log(`[gutterrunner:${this.name}] lost at ${this.room.name} — emergency routing`);
    if (!this._grEmergencyRouteHome()) {
      console.log(`[gutterrunner:${this.name}] can't find home — suiciding`);
      this.suicide();
    }
    return;
  }

  if (!this._grCrossToward(this.room.name, nextRoom)) {
    console.log(`[gutterrunner:${this.name}] can't exit toward home ${this.room.name} → ${nextRoom} — suiciding`);
    this.suicide();
  }
};

// ──────────────────────────────────────────────── Core crossing helper ──

/**
 * Move from fromRoom toward toRoom.
 *
 * THE FIX: if we're already standing on the border exit tile, execute a
 * direct creep.move(exitDirection) to physically cross into the next room.
 * Traffic.requestMove to range=0 would see "already in range" and skip it,
 * leaving the creep frozen on the border tile indefinitely.
 *
 * If we're NOT on the border tile, use Traffic.requestMove normally to
 * approach it — traffic will path us there, and next tick we'll cross.
 *
 * @param  {string} fromRoomName
 * @param  {string} toRoomName
 * @return {boolean} false if no exit found
 */
Creep.prototype._grCrossToward = function (fromRoomName, toRoomName) {
  const exits = Game.map.describeExits(fromRoomName);

  let exitDir = null;
  for (const dir in exits) {
    if (exits[dir] === toRoomName) {
      exitDir = dir;
      break;
    }
  }

  if (!exitDir) return false;

  const findConst = EXIT_FIND[exitDir];
  if (!findConst) return false;

  const room = Game.rooms[fromRoomName];
  if (!room) return false; // need vision to get tile positions

  const tiles = room.find(findConst);
  if (!tiles.length) return false;

  // Pick the middle exit tile to avoid corner-hugging
  const exitTile = tiles[Math.floor(tiles.length / 2)];

  // Are we already standing on this exit tile?
  if (this.pos.x === exitTile.x && this.pos.y === exitTile.y) {
    // Direct move in exit direction to actually cross the boundary
    const moveDir = EXIT_MOVE_DIR[exitDir];
    if (moveDir !== undefined) {
      this.move(moveDir);
    }
    return true;
  }

  // Not on the exit tile yet — approach it via traffic
  Traffic.requestMove(this, exitTile, { range: 0 });
  return true;
};

// ──────────────────────────────────────────────────────── BFS path finding ──

/**
 * BFS outward from homeRoom to find the nearest room needing scouting.
 * Uses Game.map.describeExits() — works globally, no vision required.
 *
 * Priority: unscouted rooms > stale rooms. Nearest rooms first (BFS order).
 *
 * @return {{ target, path, depth }} or null if all rooms within range are fresh
 */
Creep.prototype._grBfsFindTarget = function () {
  const intel = Memory.intelligence || {};
  const home  = this.memory.homeRoom;

  const queue   = [{ roomName: home, path: [home] }];
  const visited = new Set([home]);

  while (queue.length) {
    const { roomName, path } = queue.shift();
    const depth = path.length - 1;

    // Evaluate this room (skip homeRoom itself)
    if (depth > 0) {
      const entry     = intel[roomName];
      const unscouted = !entry;
      const stale     = entry && (Game.time - entry.scoutedAt) > INTEL_STALE_AGE;

      if (unscouted || stale) {
        return { target: roomName, path, depth };
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
 * @param  {string}   current  - current room name
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
 * Emergency home routing when stored path is useless.
 * Checks direct exits and one-hop exits via describeExits (no vision needed).
 *
 * @return {boolean} true if a move was registered
 */
Creep.prototype._grEmergencyRouteHome = function () {
  const home  = this.memory.homeRoom;
  const exits = Game.map.describeExits(this.room.name);

  // Direct neighbor?
  for (const dir in exits) {
    if (exits[dir] === home) {
      return this._grCrossToward(this.room.name, home);
    }
  }

  // One hop through a known intermediate room
  for (const dir in exits) {
    const neighbor      = exits[dir];
    const neighborExits = Game.map.describeExits(neighbor);
    for (const nDir in neighborExits) {
      if (neighborExits[nDir] === home) {
        return this._grCrossToward(this.room.name, neighbor);
      }
    }
  }

  return false;
};

// ──────────────────────────────────────────────────────── Intelligence scan ──

/**
 * Write full room intelligence to Memory.intelligence[roomName].
 * Only call when we have vision (this.room === target).
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

/*
 * Memory.intelligence[roomName] schema (for empire.js):
 *
 * {
 *   scoutedAt:  number,          // Game.time when last scanned
 *   scoutedBy:  string,          // homeRoom of the runner
 *   sources: [{ id, x, y }],
 *   controller: {
 *     owner:    string | null,
 *     level:    number,
 *     reserved: string | false
 *   },
 *   exits: { '1': roomName, '3': roomName, ... },  // describeExits output
 *   hostiles: { count: number, threat: 'none'|'low'|'high' },
 *   minerals: [{ type: string, amount: number }],
 *   safeMode: boolean
 * }
 */