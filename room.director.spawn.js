const JobBoard = require('job.board');

module.exports = {

  /**
   * Entry point for spawn logic.
   */
  run(room) {
    const spawn = room.find(FIND_MY_SPAWNS)
      .find(s => !s.spawning);

    if (!spawn) return;

    const creeps = this.getRoomCreeps(room);

    // Emergency recovery
    if (creeps.length === 0 && room.energyAvailable >= 200) {
      spawn.spawnCreep([WORK, CARRY, MOVE], `rat_${Game.time}`, {
        memory: { role: 'slave' }
      });
      return;
    }

    this.spawnByDemand(room, spawn, creeps);
  },

  /**
   * Spawns creeps based on harvest capacity and demand.
   */
  spawnByDemand(room, spawn, creeps) {
    const rcl = room.controller.level;
    const sources = room.find(FIND_SOURCES);

    const miners = creeps.filter(c => c.memory.role === 'miner');
    const haulers = creeps.filter(c => c.memory.role === 'hauler');
    const workers = creeps.filter(c => c.memory.role === 'worker');

    // RCL1 fallback
    if (rcl === 1) {
      if (creeps.length < sources.length) {
        spawn.spawnCreep(this.createBootstrapBody(room), `rat_${Game.time}`, {
          memory: { role: 'slave' }
        });
      }
      return;
    }

    // RCL2+ pivot
    if (miners.length < sources.length) {
      spawn.spawnCreep(this.createMinerBody(room), `miner_${Game.time}`, {
        memory: { role: 'miner' }
      });
      return;
    }

    if (haulers.length < miners.length) {
      spawn.spawnCreep(this.createHaulerBody(room), `hauler_${Game.time}`, {
        memory: { role: 'hauler' }
      });
      return;
    }

    if (workers.length < miners.length) {
      spawn.spawnCreep(this.createWorkerBody(room), `worker_${Game.time}`, {
        memory: { role: 'worker' }
      });
    }
  },


  /**
   * Returns creeps belonging to this room.
   */
  getRoomCreeps(room) {
    return Object.values(Game.creeps)
      .filter(c => c.room.name === room.name);
  },

  /**
   * Creates scalable bootstrap body based on energy capacity for RCL1
   */
  createBootstrapBody(room) {
    const energy = room.energyCapacityAvailable;
    const body = [];
    // Always start with basic mobility
    body.push(WORK, CARRY, MOVE);
    let remaining = energy - 200;
    // Prioritize WORK first
    while (remaining >= 100) {
      body.unshift(WORK); // add work at front
      remaining -= 100;
    }
    return body;
  },

  createMinerBody(room) {
    const energy = room.energyCapacityAvailable;
    if (energy >= 550) {
      return [WORK, WORK, WORK, WORK, WORK, MOVE];
    }
    if (energy >= 450) {
      return [WORK, WORK, WORK, WORK, MOVE];
    }
    return [WORK, WORK, CARRY, MOVE]; // fallback
  },

  createHaulerBody(room) {
    const energy = room.energyCapacityAvailable;
    if (energy >= 500) {
      return [CARRY, CARRY, CARRY, CARRY, MOVE, MOVE];
    }
    if (energy >= 300) {
      return [CARRY, CARRY, MOVE];
    }
    return [CARRY, MOVE];
  },

  createWorkerBody(room) {
    const energy = room.energyCapacityAvailable;
    if (energy >= 500) {
      return [WORK, WORK, CARRY, CARRY, MOVE, MOVE];
    }
    if (energy >= 300) {
      return [WORK, CARRY, MOVE];
    }
    return [WORK, CARRY, MOVE];
  },

};
