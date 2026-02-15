/**
 * console.js
 *
 * Global helper functions for the Screeps console.
 * These are dev/debug tools — no game logic lives here.
 *
 * Usage (from Screeps console):
 *   status()   — full empire snapshot as pretty JSON
 */

global.status = function() {
  const rooms = {};

  for (const roomName in Game.rooms) {
    const room = Game.rooms[roomName];
    if (!room.controller || !room.controller.my) continue;

    const creeps     = Object.values(Game.creeps).filter(c => c.memory.homeRoom === roomName);
    const byRole     = {};
    creeps.forEach(c => { byRole[c.memory.role] = (byRole[c.memory.role] || 0) + 1; });

    const structures = room.find(FIND_MY_STRUCTURES);
    const structCount = {};
    structures.forEach(s => { structCount[s.structureType] = (structCount[s.structureType] || 0) + 1; });

    const sites = room.find(FIND_MY_CONSTRUCTION_SITES);
    const siteCount = {};
    sites.forEach(s => { siteCount[s.structureType] = (siteCount[s.structureType] || 0) + 1; });

    const sources    = room.find(FIND_SOURCES);
    const containers = room.find(FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_CONTAINER });
    const roads      = room.find(FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_ROAD });
    const dropped    = room.find(FIND_DROPPED_RESOURCES, { filter: r => r.resourceType === RESOURCE_ENERGY });
    const hostiles   = room.find(FIND_HOSTILE_CREEPS);
    const spawns     = room.find(FIND_MY_SPAWNS);
    const towers     = room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_TOWER });

    rooms[roomName] = {
      rcl:   room.controller.level,
      state: ['BOOTSTRAP','STABLE','GROW','FORTIFY','WAR'][room.memory.state] || 'unknown',
      controller: {
        progress:      room.controller.progress,
        progressTotal: room.controller.progressTotal,
        pct:           Math.round(room.controller.progress / room.controller.progressTotal * 100)
      },
      energy: {
        available: room.energyAvailable,
        capacity:  room.energyCapacityAvailable,
        pct:       Math.round(room.energyAvailable / room.energyCapacityAvailable * 100)
      },
      spawns: spawns.map(s => ({
        name:     s.name,
        spawning: s.spawning
          ? { name: s.spawning.name, ticksLeft: s.spawning.remainingTime }
          : null
      })),
      structures: structCount,
      sites:      Object.keys(siteCount).length ? siteCount : null,
      containers: containers.map(c => ({
        energy:   c.store[RESOURCE_ENERGY],
        capacity: c.store.getCapacity(RESOURCE_ENERGY),
        pct:      Math.round(c.store[RESOURCE_ENERGY] / c.store.getCapacity(RESOURCE_ENERGY) * 100),
        hits:     c.hits,
        hitsMax:  c.hitsMax,
        hitsPct:  Math.round(c.hits / c.hitsMax * 100),
        type:     c.pos.inRangeTo(room.controller, 3) ? 'controller'
          : sources.some(src => c.pos.inRangeTo(src, 2)) ? 'source' : 'other'
      })),
      roads: {
        total:    roads.length,
        damaged:  roads.filter(r => r.hits < r.hitsMax * 0.5).length,
        critical: roads.filter(r => r.hits < r.hitsMax * 0.25).length
      },
      towers: towers.map(t => ({
        energy:   t.store[RESOURCE_ENERGY],
        capacity: t.store.getCapacity(RESOURCE_ENERGY),
        pct:      Math.round(t.store[RESOURCE_ENERGY] / t.store.getCapacity(RESOURCE_ENERGY) * 100)
      })),
      creeps: {
        total:  creeps.length,
        byRole,
        dying:  creeps
          .filter(c => c.ticksToLive < 200)
          .map(c => ({ name: c.name, role: c.memory.role, ttl: c.ticksToLive }))
          .sort((a, b) => a.ttl - b.ttl)
      },
      sources:      sources.length,
      droppedEnergy: {
        total: dropped.reduce((sum, r) => sum + r.amount, 0),
        piles: dropped.length
      },
      hostiles: hostiles.length
    };
  }

  const snapshot = {
    tick: Game.time,
    cpu: {
      used:   parseFloat(Game.cpu.getUsed().toFixed(2)),
      limit:  Game.cpu.limit,
      bucket: Game.cpu.bucket
    },
    gcl: {
      level:         Game.gcl.level,
      progress:      Game.gcl.progress,
      progressTotal: Game.gcl.progressTotal,
      pct:           Math.round(Game.gcl.progress / Game.gcl.progressTotal * 100)
    },
    market: {
      credits: Math.round(Game.market.credits),
      orders:  Object.keys(Game.market.orders).length
    },
    rooms
  };

  console.log(JSON.stringify(snapshot, null, 2));
};