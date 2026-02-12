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
    const patternCost = BODYPART_COST[WORK] +
      BODYPART_COST[CARRY] +
      BODYPART_COST[MOVE];

    const body = [];

    while (
      body.length < 15 && // prevent absurd size early
      this.bodyCost(body) + patternCost <= energy
      ) {
      body.push(WORK, CARRY, MOVE);
    }

    return body.length ? body : [WORK, CARRY, MOVE];
  },

  bodyCost(body) {
    return body.reduce((sum, part) => sum + BODYPART_COST[part], 0);
  }

};
