/**
 * rat.gutterrunner.js
 *
 * BFS scout. Expands outward from homeRoom up to MAX_SCOUT_DEPTH hops.
 * Three states: idle → traveling → returning.
 *
 * ROOT CAUSE OF OSCILLATION (now fixed):
 *   The old code wrote intel and switched to 'returning' the moment
 *   this.room.name === target. That happens at the BORDER TILE (x=0 or x=49),
 *   the very first step into the room. The creep immediately turned around,
 *   never actually seeing the room, and the BFS kept finding it as a target
 *   because any room reached only via that room was still unscouted.
 *
 * THE FIX:
 *   Don't transition to returning until the creep reaches the CENTER (25,25)
 *   of the target room (within range 5). This guarantees full room visibility
 *   before intel is written, and means the creep genuinely visited the room.
 *
 * SECONDARY FIX — visited guard:
 *   Track rooms visited this "tour" in memory.grVisited. Even if BFS logic
 *   has an edge case, we won't re-target a room we've already been to this
 *   run. Cleared when the creep goes idle with nothing left to scout.
 */

const MAX_SCOUT_DEPTH = 3;
const INTEL_STALE_AGE = 5000;
const SCOUT_CENTER_RANGE = 5; // how close to room center before we write intel

Creep.prototype.runGutterRunner = function () {
  if (!this.memory.homeRoom) {
    this.memory.homeRoom = this.room.name;
  }

  switch (this.memory.grState) {
    case 'traveling':  return this._grTravel();
    case 'returning':  return this._grReturn();
    default:           return this._grIdle();
  }
};

Creep.prototype._grIdle = function () {
  // Must be home before picking a new target
  if (this.room.name !== this.memory.homeRoom) {
    this.memory.grState = 'returning';
    return this._grReturn();
  }

  const target = this._grFindTarget();

  if (!target) {
    // Everything within range is fresh — clear visited list and sit tight
    this.memory.grVisited = [];
    return;
  }

  if (!this.memory.grVisited) this.memory.grVisited = [];

  this.memory.grTarget = target;
  this.memory.grState  = 'traveling';
  console.log(`[gr:${this.name}] targeting ${target}`);
};

/**
 * BFS outward from homeRoom. Returns first room that is unscouted or stale.
 * Skips rooms already visited this tour (grVisited guard).
 */
Creep.prototype._grFindTarget = function () {
  const intel   = Memory.intelligence || {};
  const home    = this.memory.homeRoom;
  const now     = Game.time;
  const visited = new Set(this.memory.grVisited || []);
  visited.add(home);

  const queue    = [{ roomName: home, depth: 0 }];
  const enqueued = new Set([home]);

  while (queue.length) {
    const { roomName, depth } = queue.shift();

    if (depth > 0) {
      // Skip rooms we already visited this tour
      if (visited.has(roomName)) continue;

      const entry = intel[roomName];
      const needsScouting = !entry || (now - entry.scoutedAt) > INTEL_STALE_AGE;
      if (needsScouting) return roomName;
      // Scouted and fresh — fall through to add neighbors
    }

    if (depth >= MAX_SCOUT_DEPTH) continue;

    const exits = Game.map.describeExits(roomName);
    for (const dir in exits) {
      const neighbor = exits[dir];
      if (!enqueued.has(neighbor)) {
        enqueued.add(neighbor);
        queue.push({ roomName: neighbor, depth: depth + 1 });
      }
    }
  }

  return null;
};

Creep.prototype._grTravel = function () {
  const target = this.memory.grTarget;
  if (!target) {
    this.memory.grState = null;
    return;
  }

  if (this.room.name === target) {
    // FIX: Don't write intel at the border tile — move to center first.
    // Only transition to returning once we have real room visibility.
    const center = new RoomPosition(25, 25, target);
    const atCenter = this.pos.getRangeTo(center) <= SCOUT_CENTER_RANGE;

    if (atCenter) {
      this._grWriteIntelligence(this.room);

      // Add to visited list so we don't re-target this room this tour
      if (!this.memory.grVisited) this.memory.grVisited = [];
      if (!this.memory.grVisited.includes(target)) {
        this.memory.grVisited.push(target);
      }

      this.memory.grState  = 'returning';
      this.memory.grTarget = null;
      console.log(`[gr:${this.name}] scanned ${target}, returning home`);
      return;
    }

    // In the target room but not at center yet — keep moving inward
    this.moveTo(center, {
      reusePath:          20,
      visualizePathStyle: { stroke: '#aaffaa', opacity: 0.3 }
    });
    return;
  }

  // Not in target room yet — move toward center of target room
  this.moveTo(new RoomPosition(25, 25, target), {
    reusePath:          20,
    visualizePathStyle: { stroke: '#aaffaa', opacity: 0.3 }
  });
};

Creep.prototype._grReturn = function () {
  if (this.room.name === this.memory.homeRoom) {
    this.memory.grState = null;
    // Don't clear grVisited here — keep it so _grIdle picks the NEXT room,
    // not one we already scouted this tour. Cleared only when nothing left.
    return;
  }

  const homeRoom = Game.rooms[this.memory.homeRoom];
  const spawn    = homeRoom && homeRoom.find(FIND_MY_SPAWNS)[0];
  const dest     = spawn
    ? spawn.pos
    : new RoomPosition(25, 25, this.memory.homeRoom);

  this.moveTo(dest, {
    reusePath:          20,
    visualizePathStyle: { stroke: '#aaaaff', opacity: 0.3 }
  });
};

Creep.prototype._grWriteIntelligence = function (room) {
  if (!Memory.intelligence) Memory.intelligence = {};

  const sources  = room.find(FIND_SOURCES).map(s => ({ id: s.id, x: s.pos.x, y: s.pos.y }));
  const hostiles = room.find(FIND_HOSTILE_CREEPS);
  const threat   = hostiles.length === 0 ? 'none'
    : hostiles.some(h => h.getActiveBodyparts(ATTACK) > 0 || h.getActiveBodyparts(RANGED_ATTACK) > 0)
      ? 'high' : 'low';

  let controller = { owner: null, level: 0, reserved: false };
  if (room.controller) {
    controller = {
      owner:    room.controller.owner ? room.controller.owner.username : null,
      level:    room.controller.level,
      reserved: room.controller.reservation ? room.controller.reservation.username : false
    };
  }

  Memory.intelligence[room.name] = {
    scoutedAt:  Game.time,
    scoutedBy:  this.memory.homeRoom,
    sources,
    controller,
    exits:    Game.map.describeExits(room.name),
    hostiles: { count: hostiles.length, threat },
    minerals: room.find(FIND_MINERALS).map(m => ({ type: m.mineralType, amount: m.mineralAmount })),
    safeMode: room.controller ? !!room.controller.safeMode : false
  };

  console.log(
    `[gr:${this.name}] ${room.name} — ` +
    `${sources.length} source(s) | ` +
    `controller: ${controller.owner || 'unowned'} RCL${controller.level} | ` +
    `threat: ${threat}`
  );
};
