/**
 * rat.gutterrunner.js
 *
 * BFS scout. Hops one room at a time using Game.map.findRoute.
 *
 * MOVEMENT STRATEGY:
 *   Never use moveTo with a destination in a different room.
 *   findRoute gives us an ordered list of rooms to pass through.
 *   We move to the exit tile of the current room toward the next room.
 *   One room at a time. Simple. Reliable.
 *
 *   Room sequence: W23N1 → W23N2 → W23N3
 *   Step 1: moveTo(exit tile of W23N1 that leads to W23N2)
 *   Step 2: now in W23N2. moveTo(exit tile of W23N2 that leads to W23N3)
 *   Step 3: now in W23N3. At destination. Write intel. Chain to next target.
 *
 * SCOUTING:
 *   Intel is written when the creep reaches within range 10 of room center.
 *
 * CHAINING (fix for oscillation):
 *   After scouting a room the creep does NOT return home. It calls _grIdle()
 *   directly to pick the next stale room and chain straight to it.
 *   The creep only returns home when:
 *     a) TTL drops below LOW_TTL_THRESHOLD, or
 *     b) There are no more stale rooms to scout (all intel is fresh)
 *   This prevents the home → A → home → B → home → A oscillation loop.
 */

const MAX_SCOUT_DEPTH    = 3;
const INTEL_STALE_AGE    = 5000;
const LOW_TTL_THRESHOLD  = 100;

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
  // If we somehow ended up away from home with nothing to do, go back
  if (this.room.name !== this.memory.homeRoom) {
    const target = this._grFindTarget();
    if (!target) {
      // Nothing to scout — go home
      this.memory.grVisited = [];
      this.memory.grState   = 'returning';
      return this._grReturn();
    }
    // There is something to scout — fall through and head there from here
  }

  const target = this._grFindTarget();

  if (!target) {
    // All rooms are fresh. Clear visited list and go home if not already there.
    this.memory.grVisited = [];
    if (this.room.name !== this.memory.homeRoom) {
      this.memory.grState = 'returning';
      return this._grReturn();
    }
    return; // At home with nothing to do — sit tight
  }

  // Build explicit room-by-room route from current room (not necessarily home)
  const route = Game.map.findRoute(this.room.name, target);

  if (route === ERR_NO_PATH || !route || route.length === 0) {
    // Can't reach — mark visited and try again next tick
    if (!this.memory.grVisited) this.memory.grVisited = [];
    this.memory.grVisited.push(target);
    console.log(`[gr:${this.name}] no route to ${target}, skipping`);
    return;
  }

  this.memory.grTarget = target;
  this.memory.grRoute  = route.map(r => r.room);
  this.memory.grState  = 'traveling';
  console.log(`[gr:${this.name}] route to ${target}: ${[this.room.name, ...this.memory.grRoute].join(' → ')}`);
};

// ---------------------------------------------------------------------------
// TRAVEL: follow the route one room at a time
// ---------------------------------------------------------------------------
Creep.prototype._grTravel = function () {
  const target = this.memory.grTarget;
  const route  = this.memory.grRoute;

  if (!target || !route) {
    this.memory.grState = null;
    this.memory.grRoute = null;
    return;
  }

  // Low TTL — abort and go home immediately
  if (this.ticksToLive < LOW_TTL_THRESHOLD) {
    console.log(`[gr:${this.name}] low TTL (${this.ticksToLive}) — aborting, returning home`);
    this.memory.grState       = 'returning';
    this.memory.grTarget      = null;
    this.memory.grRoute       = null;
    this.memory.grReturnRoute = null;
    return this._grReturn();
  }

  // Reached the target room
  if (this.room.name === target) {
    const center   = new RoomPosition(25, 25, target);
    const atCenter = this.pos.getRangeTo(center) <= 10;

    if (atCenter) {
      // Write intel for this room
      this._grWriteIntelligence(this.room);

      if (!this.memory.grVisited) this.memory.grVisited = [];
      if (!this.memory.grVisited.includes(target)) {
        this.memory.grVisited.push(target);
      }

      // Clear travel state
      this.memory.grState  = null;
      this.memory.grTarget = null;
      this.memory.grRoute  = null;

      // Low TTL — go home rather than chaining
      if (this.ticksToLive < LOW_TTL_THRESHOLD) {
        console.log(`[gr:${this.name}] scanned ${target}, low TTL — returning home`);
        this.memory.grState = 'returning';
        return this._grReturn();
      }

      // Chain: pick next stale room without going home first
      console.log(`[gr:${this.name}] scanned ${target}, chaining to next target`);
      return this._grIdle();
    }

    // In target room, move toward center
    this.moveTo(center, {
      reusePath: 5,
      visualizePathStyle: { stroke: '#aaffaa', opacity: 0.4 }
    });
    return;
  }

  // Still en route — pop waypoint rooms we've already entered
  const updatedRoute = [...route];
  if (updatedRoute.length > 0 && this.room.name === updatedRoute[0]) {
    updatedRoute.shift();
    this.memory.grRoute = updatedRoute;
  }

  if (!updatedRoute || updatedRoute.length === 0) {
    // Route exhausted but not in target room — something went wrong
    // Re-derive route from current position
    const newRoute = Game.map.findRoute(this.room.name, target);
    if (newRoute === ERR_NO_PATH || !newRoute || newRoute.length === 0) {
      console.log(`[gr:${this.name}] lost route to ${target} — aborting`);
      this.memory.grVisited = (this.memory.grVisited || []).concat([target]);
      this.memory.grState   = null;
      this.memory.grTarget  = null;
      this.memory.grRoute   = null;
      return;
    }
    this.memory.grRoute = newRoute.map(r => r.room);
  }

  // Move toward the next room in the route
  this.moveTo(new RoomPosition(25, 25, this.memory.grRoute[0]), {
    reusePath: 5,
    visualizePathStyle: { stroke: '#aaffaa', opacity: 0.4 }
  });
};

// ---------------------------------------------------------------------------
// RETURN: go back to homeRoom one step at a time
// ---------------------------------------------------------------------------
Creep.prototype._grReturn = function () {
  if (this.room.name === this.memory.homeRoom) {
    this.memory.grState       = null;
    this.memory.grRoute       = null;
    this.memory.grReturnRoute = null;
    return;
  }

  // Build return route if we don't have one
  if (!this.memory.grReturnRoute || this.memory.grReturnRoute.length === 0) {
    const route = Game.map.findRoute(this.room.name, this.memory.homeRoom);
    if (route === ERR_NO_PATH || !route || route.length === 0) {
      // Fallback: blind moveTo
      const homeRoom = Game.rooms[this.memory.homeRoom];
      const spawn    = homeRoom && homeRoom.find(FIND_MY_SPAWNS)[0];
      this.moveTo(
        spawn ? spawn.pos : new RoomPosition(25, 25, this.memory.homeRoom),
        { reusePath: 5 }
      );
      return;
    }
    this.memory.grReturnRoute = route.map(r => r.room);
  }

  // Pop rooms we've already entered
  if (this.memory.grReturnRoute.length > 0 &&
    this.room.name === this.memory.grReturnRoute[0]) {
    this.memory.grReturnRoute.shift();
  }

  if (!this.memory.grReturnRoute || this.memory.grReturnRoute.length === 0) {
    // Next room should be home
    const homeRoom = Game.rooms[this.memory.homeRoom];
    const spawn    = homeRoom && homeRoom.find(FIND_MY_SPAWNS)[0];
    this.moveTo(
      spawn ? spawn.pos : new RoomPosition(25, 25, this.memory.homeRoom),
      { reusePath: 5, visualizePathStyle: { stroke: '#aaaaff', opacity: 0.4 } }
    );
    return;
  }

  this.moveTo(new RoomPosition(25, 25, this.memory.grReturnRoute[0]), {
    reusePath: 5,
    visualizePathStyle: { stroke: '#aaaaff', opacity: 0.4 }
  });
};

// ---------------------------------------------------------------------------
// BFS target finder
// Starts from current room (not home) so chained routes are efficient
// ---------------------------------------------------------------------------
Creep.prototype._grFindTarget = function () {
  const intel   = Memory.intelligence || {};
  const home    = this.memory.homeRoom;
  const now     = Game.time;
  const visited = new Set(this.memory.grVisited || []);
  visited.add(home);

  // BFS from current room so chained routes don't backtrack unnecessarily
  const startRoom = this.room.name;
  const queue     = [{ roomName: startRoom, depth: 0 }];
  const enqueued  = new Set([startRoom]);

  // Also ensure home room exits are explored even if we're not there
  if (startRoom !== home) {
    enqueued.add(home);
  }

  while (queue.length) {
    const { roomName, depth } = queue.shift();

    if (!visited.has(roomName) && roomName !== startRoom) {
      const entry         = intel[roomName];
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
    `[gr:${this.name}] intel: ${room.name} — ` +
    `${sources.length} source(s) | ` +
    `owner: ${controller.owner || 'unowned'} RCL${controller.level} | ` +
    `threat: ${threat} | ` +
    `TTL: ${this.ticksToLive}`
  );
};