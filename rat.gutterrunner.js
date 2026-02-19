/**
 * rat.gutterrunner.js
 *
 * BFS scout. Expands outward from homeRoom up to MAX_SCOUT_DEPTH hops.
 * Three states: idle → traveling → returning.
 * moveTo handles all multi-room pathing — no custom path storage.
 */

const MAX_SCOUT_DEPTH = 3;
const INTEL_STALE_AGE = 5000;

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
  if (!target) return; // everything fresh — sit tight

  this.memory.grTarget = target;
  this.memory.grState  = 'traveling';
  console.log(`[gr:${this.name}] targeting ${target}`);
};

/**
 * BFS outward from homeRoom. Returns first room that is unscouted or stale.
 * No RECENT_GRACE — a scouted room is simply not stale until INTEL_STALE_AGE ticks pass.
 */
Creep.prototype._grFindTarget = function () {
  const intel = Memory.intelligence || {};
  const home  = this.memory.homeRoom;
  const now   = Game.time;

  const queue   = [{ roomName: home, depth: 0 }];
  const visited = new Set([home]);

  while (queue.length) {
    const { roomName, depth } = queue.shift();

    if (depth > 0) {
      const entry = intel[roomName];
      const needsScouting = !entry || (now - entry.scoutedAt) > INTEL_STALE_AGE;
      if (needsScouting) return roomName;
      // Already scouted and fresh — fall through to add neighbors
    }

    if (depth >= MAX_SCOUT_DEPTH) continue;

    const exits = Game.map.describeExits(roomName);
    for (const dir in exits) {
      const neighbor = exits[dir];
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push({ roomName: neighbor, depth: depth + 1 });
      }
    }
  }

  return null; // everything within range is fresh
};

Creep.prototype._grTravel = function () {
  const target = this.memory.grTarget;
  if (!target) {
    this.memory.grState = null;
    return;
  }

  // Arrived in target room — scan and head home
  if (this.room.name === target) {
    this._grWriteIntelligence(this.room);
    this.memory.grState  = 'returning';
    this.memory.grTarget = null;
    console.log(`[gr:${this.name}] scanned ${target}, returning home`);
    return;
  }

  this.moveTo(new RoomPosition(25, 25, target), {
    reusePath:          50,
    visualizePathStyle: { stroke: '#aaffaa', opacity: 0.3 }
  });
};

Creep.prototype._grReturn = function () {
  if (this.room.name === this.memory.homeRoom) {
    this.memory.grState = null;
    return;
  }

  const homeRoom = Game.rooms[this.memory.homeRoom];
  const spawn    = homeRoom && homeRoom.find(FIND_MY_SPAWNS)[0];
  const dest     = spawn
    ? spawn.pos
    : new RoomPosition(25, 25, this.memory.homeRoom);

  this.moveTo(dest, {
    reusePath:          50,
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