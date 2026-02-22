/**
 * rat.gutterrunner.js
 *
 * BFS scout. Hops one room at a time using Game.map.findRoute.
 *
 * ROOT CAUSE OF OSCILLATION (final fix):
 *   moveTo(25,25,targetRoom) fails silently on multi-room routes when the
 *   intermediate rooms aren't fully visible. Screeps' pathfinder recalculates
 *   each tick, finds a "shorter" route that routes backwards, and the creep
 *   oscillates at the border forever.
 *
 * THE FIX:
 *   Never use moveTo with a destination in a different room.
 *   Instead: findRoute gives us an ordered list of rooms to pass through.
 *   Move to the EXIT POSITION of the current room toward the next room.
 *   One room at a time. Simple. Reliable.
 *
 *   Room sequence: W23N1 → W23N2 → W23N3
 *   Step 1: moveTo(exit tile of W23N1 that leads to W23N2)
 *   Step 2: now in W23N2. moveTo(exit tile of W23N2 that leads to W23N3)
 *   Step 3: now in W23N3. At destination. Write intel. Return home.
 *
 * SCOUTING:
 *   Intel is written when the creep reaches the CENTER of the target room
 *   (within range 10), not the border tile.
 */

const MAX_SCOUT_DEPTH = 3;
const INTEL_STALE_AGE = 5000;

Creep.prototype.runGutterRunner = function () {
  if (!this.memory.homeRoom) {
    this.memory.homeRoom = this.room.name;
  }

  switch (this.memory.grState) {
    case 'traveling': return this._grTravel();
    case 'returning': return this._grReturn();
    default:          return this._grIdle();
  }
};

// ---------------------------------------------------------------------------
// IDLE: pick a target room, build a route, start moving
// ---------------------------------------------------------------------------
Creep.prototype._grIdle = function () {
  if (this.room.name !== this.memory.homeRoom) {
    this.memory.grState = 'returning';
    this.memory.grRoute = null;
    return this._grReturn();
  }

  const target = this._grFindTarget();

  if (!target) {
    if (!this.memory.grVisited) this.memory.grVisited = [];
    // Nothing to scout — clear visited and sit tight
    this.memory.grVisited = [];
    return;
  }

  // Build explicit room-by-room route
  const route = Game.map.findRoute(this.memory.homeRoom, target);

  if (route === ERR_NO_PATH || !route || route.length === 0) {
    // Can't reach this room — mark it as visited so we skip it
    if (!this.memory.grVisited) this.memory.grVisited = [];
    this.memory.grVisited.push(target);
    console.log(`[gr:${this.name}] no route to ${target}, skipping`);
    return;
  }

  this.memory.grTarget = target;
  this.memory.grRoute  = route.map(r => r.room); // ['W23N2', 'W23N3']
  this.memory.grState  = 'traveling';
  console.log(`[gr:${this.name}] route to ${target}: ${this.memory.grRoute.join(' → ')}`);
};

// ---------------------------------------------------------------------------
// TRAVEL: follow the route one room at a time
// ---------------------------------------------------------------------------
Creep.prototype._grTravel = function () {
  const target = this.memory.grTarget;
  const route  = this.memory.grRoute;

  if (!target || !route || route.length === 0) {
    this.memory.grState = null;
    this.memory.grRoute = null;
    return;
  }

  // If we've reached the final target room
  if (this.room.name === target) {
    const center   = new RoomPosition(25, 25, target);
    const atCenter = this.pos.getRangeTo(center) <= 10;

    if (atCenter) {
      this._grWriteIntelligence(this.room);

      if (!this.memory.grVisited) this.memory.grVisited = [];
      if (!this.memory.grVisited.includes(target)) {
        this.memory.grVisited.push(target);
      }

      this.memory.grState  = 'returning';
      this.memory.grTarget = null;
      this.memory.grRoute  = null;
      console.log(`[gr:${this.name}] scanned ${target}, returning`);
      return;
    }

    // In target room, move to center
    this.moveTo(center, { reusePath: 5, visualizePathStyle: { stroke: '#aaffaa', opacity: 0.4 } });
    return;
  }

  // Move to the next room in the route
  // The first entry in grRoute is the next room we need to enter
  const nextRoom = route[0];

  if (this.room.name === nextRoom) {
    // We've entered this waypoint room — pop it and continue
    this.memory.grRoute = route.slice(1);
    // Don't return — fall through to move toward the next waypoint
  }

  // Get the updated route after potential pop
  const currentRoute = this.memory.grRoute;
  if (!currentRoute || currentRoute.length === 0) {
    // Should be in target room now — loop will catch it next tick
    return;
  }

  // Move toward the exit that leads to the next room
  // Use moveTo with the CENTER of the next room — but ONLY navigate within
  // the current room by using the exit tiles as waypoints.
  const dest = new RoomPosition(25, 25, currentRoute[0]);

  this.moveTo(dest, {
    reusePath: 5, // Short reuse so we recalculate when we cross borders
    visualizePathStyle: { stroke: '#aaffaa', opacity: 0.4 }
  });
};

// ---------------------------------------------------------------------------
// RETURN: go back to homeRoom one step at a time
// ---------------------------------------------------------------------------
Creep.prototype._grReturn = function () {
  if (this.room.name === this.memory.homeRoom) {
    this.memory.grState = null;
    this.memory.grRoute = null;
    return;
  }

  // Build return route if we don't have one
  if (!this.memory.grReturnRoute || this.memory.grReturnRoute.length === 0) {
    const route = Game.map.findRoute(this.room.name, this.memory.homeRoom);
    if (route === ERR_NO_PATH || !route || route.length === 0) {
      // Stuck — just try moveTo as fallback
      const homeRoom = Game.rooms[this.memory.homeRoom];
      const spawn    = homeRoom && homeRoom.find(FIND_MY_SPAWNS)[0];
      const dest     = spawn
        ? spawn.pos
        : new RoomPosition(25, 25, this.memory.homeRoom);
      this.moveTo(dest, { reusePath: 5 });
      return;
    }
    this.memory.grReturnRoute = route.map(r => r.room);
  }

  const returnRoute = this.memory.grReturnRoute;

  // Pop rooms we've already entered
  if (returnRoute.length > 0 && this.room.name === returnRoute[0]) {
    this.memory.grReturnRoute = returnRoute.slice(1);
  }

  const nextReturn = this.memory.grReturnRoute;
  if (!nextReturn || nextReturn.length === 0) {
    // Should be home next tick
    const homeRoom = Game.rooms[this.memory.homeRoom];
    const spawn    = homeRoom && homeRoom.find(FIND_MY_SPAWNS)[0];
    const dest     = spawn
      ? spawn.pos
      : new RoomPosition(25, 25, this.memory.homeRoom);
    this.moveTo(dest, { reusePath: 5, visualizePathStyle: { stroke: '#aaaaff', opacity: 0.4 } });
    return;
  }

  // Move toward next room in return route
  this.moveTo(new RoomPosition(25, 25, nextReturn[0]), {
    reusePath: 5,
    visualizePathStyle: { stroke: '#aaaaff', opacity: 0.4 }
  });
};

// ---------------------------------------------------------------------------
// BFS target finder
// ---------------------------------------------------------------------------
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

    if (depth > 0 && !visited.has(roomName)) {
      const entry        = intel[roomName];
      const needsScouting = !entry || (now - entry.scoutedAt) > INTEL_STALE_AGE;
      if (needsScouting) return roomName;
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

// ---------------------------------------------------------------------------
// Intel writer
// ---------------------------------------------------------------------------
Creep.prototype._grWriteIntelligence = function (room) {
  if (!Memory.intelligence) Memory.intelligence = {};

  const sources  = room.find(FIND_SOURCES).map(s => ({ id: s.id, x: s.pos.x, y: s.pos.y }));
  const hostiles = room.find(FIND_HOSTILE_CREEPS);
  const threat   = hostiles.length === 0 ? 'none'
    : hostiles.some(h =>
        h.getActiveBodyparts(ATTACK) > 0 ||
        h.getActiveBodyparts(RANGED_ATTACK) > 0
      ) ? 'high' : 'low';

  let controller = { owner: null, level: 0, reserved: false };
  if (room.controller) {
    controller = {
      owner:    room.controller.owner ? room.controller.owner.username : null,
      level:    room.controller.level,
      reserved: room.controller.reservation
        ? room.controller.reservation.username : false
    };
  }

  Memory.intelligence[room.name] = {
    scoutedAt:  Game.time,
    scoutedBy:  this.memory.homeRoom,
    sources,
    controller,
    exits:    Game.map.describeExits(room.name),
    hostiles: { count: hostiles.length, threat },
    minerals: room.find(FIND_MINERALS).map(m => ({
      type: m.mineralType, amount: m.mineralAmount
    })),
    safeMode: room.controller ? !!room.controller.safeMode : false
  };

  console.log(
    `[gr:${this.name}] ${room.name} — ` +
    `${sources.length} source(s) | ` +
    `owner: ${controller.owner || 'unowned'} RCL${controller.level} | ` +
    `threat: ${threat}`
  );
};
