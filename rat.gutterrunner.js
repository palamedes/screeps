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
 *   idle → BFS pick target → moveTo center of target room → scan → moveTo home spawn → idle
 *
 * WHY moveTo INSTEAD OF TRAFFIC:
 *   The manual exit-tile approach (find exit tiles, check position, direct move())
 *   was fragile because the creep lands on an arbitrary border tile after crossing,
 *   almost never the specific middle tile we compared against, so the crossing
 *   logic never fired correctly and the creep oscillated.
 *
 *   Screeps' built-in moveTo() handles room boundary crossing automatically —
 *   give it a RoomPosition in any room and the pathfinder routes through exits.
 *   Gutter runners are the one creep type where bypassing Traffic is correct:
 *     - Pure MOVE body, no fatigue regardless of path
 *     - Solo traveler, never competing for tiles with miners or thralls
 *     - Cross-room targets are meaningless to Traffic's single-room cost matrix
 *
 * Phase detection (not movement) still uses room name checks:
 *   - Entered target room?  → scan
 *   - Returned to homeRoom? → idle
 *
 * Called by: rat.js → Creep.prototype.tick()
 * Movement:  this.moveTo() directly — NOT Traffic (intentional, see above)
 */

// Max hops from homeRoom the runner will scout.
// 3 hops = up to ~24 rooms depending on layout.
const MAX_SCOUT_DEPTH = 3;

// How old (in ticks) before data is worth re-scouting. ~83 real minutes.
const INTEL_STALE_AGE = 5000;

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
 * Idle: in homeRoom. BFS to find next room worth scouting.
 * Sets phase and returns — movement begins next tick.
 */
Creep.prototype._grIdle = function () {

  if (this.room.name !== this.memory.homeRoom) {
    this.memory.grPhase = 'transit_home';
    return;
  }

  const result = this._grBfsFindTarget();

  if (!result) {
    // Everything within MAX_SCOUT_DEPTH is fresh — nothing to do
    return;
  }

  this.memory.grTarget = result.target;
  this.memory.grPath   = result.path;
  this.memory.grPhase  = 'transit_out';

  console.log(
    `[gutterrunner:${this.name}] scouting ${result.target} ` +
    `(${result.depth} hop${result.depth === 1 ? '' : 's'}: ${result.path.join(' → ')})`
  );
};

/**
 * Transit out: moveTo the center of the target room.
 * Screeps pathfinder handles room crossing automatically.
 * Phase flips to scanning the tick we arrive in the target room.
 */
Creep.prototype._grTransitOut = function () {

  // Arrived in target room
  if (this.room.name === this.memory.grTarget) {
    this.memory.grPhase = 'scanning';
    return;
  }

  if (!this.memory.grTarget) {
    this.memory.grPhase = 'transit_home';
    return;
  }

  // moveTo room center — pathfinder routes through exits automatically
  const target = new RoomPosition(25, 25, this.memory.grTarget);
  this.moveTo(target, {
    reusePath:          20,
    visualizePathStyle: { stroke: '#aaffaa', opacity: 0.3 }
  });
};

/**
 * Scanning: we're in the target room. Write intelligence, then head home.
 */
Creep.prototype._grScan = function () {

  if (this.room.name !== this.memory.grTarget) {
    // Somehow not in target room — abort home
    this.memory.grPhase  = 'transit_home';
    this.memory.grTarget = null;
    return;
  }

  this._grWriteIntelligence(this.room);
  this.memory.grPhase  = 'transit_home';
  this.memory.grTarget = null;
};

/**
 * Transit home: moveTo the homeRoom spawn (or center if no spawn yet).
 * Phase clears on arrival — next tick goes idle and picks a new target.
 */
Creep.prototype._grTransitHome = function () {

  if (this.room.name === this.memory.homeRoom) {
    this.memory.grPhase = null;
    this.memory.grPath  = null;
    return;
  }

  // Target the spawn in homeRoom if visible, otherwise room center
  const homeRoom = Game.rooms[this.memory.homeRoom];
  let target;

  if (homeRoom) {
    const spawn = homeRoom.find(FIND_MY_SPAWNS)[0];
    target = spawn
      ? spawn.pos
      : new RoomPosition(25, 25, this.memory.homeRoom);
  } else {
    target = new RoomPosition(25, 25, this.memory.homeRoom);
  }

  this.moveTo(target, {
    reusePath:          20,
    visualizePathStyle: { stroke: '#aaaaff', opacity: 0.3 }
  });
};

// ──────────────────────────────────────────────────────── BFS path finding ──

/**
 * BFS outward from homeRoom to find the nearest room needing scouting.
 * Uses Game.map.describeExits() — works globally, no vision required.
 *
 * Priority: unscouted rooms > stale rooms. Nearest first (BFS order).
 *
 * @return {{ target, path, depth }} or null if everything is fresh
 */
Creep.prototype._grBfsFindTarget = function () {
  const intel = Memory.intelligence || {};
  const home  = this.memory.homeRoom;

  const RECENT_GRACE = 500;
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
      const recent    = entry && (Game.time - entry.scoutedAt) < RECENT_GRACE;

      if ((unscouted || stale) && !recent) {
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
 *   scoutedAt:  number,
 *   scoutedBy:  string,
 *   sources:    [{ id, x, y }],
 *   controller: { owner: string|null, level: number, reserved: string|false },
 *   exits:      { '1': roomName, '3': roomName, ... },
 *   hostiles:   { count: number, threat: 'none'|'low'|'high' },
 *   minerals:   [{ type: string, amount: number }],
 *   safeMode:   boolean
 * }
 */