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
    const profile = room.memory.profile;
    if (!profile || !profile.sources) {
      room.profile(); // force build if missing
    }

    const maxHarvesters = profile.sources
      .reduce((sum, s) => sum + s.openSpots, 0);

    const workers = creeps.filter(c => c.memory.role === 'slave');
    const workerCount = workers.length;

    if (workerCount < maxHarvesters) {
      const body = this.createWorkerBody(room);
      spawn.spawnCreep(body, `rat_${Game.time}`, {
        memory: { role: 'slave' }
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
   * Creates scalable worker body based on energy capacity.
   */
  createWorkerBody(room) {
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

};
