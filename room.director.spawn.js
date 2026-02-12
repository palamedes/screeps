const JobBoard = require('job.board');

module.exports = {

  run(room) {
    const spawn = room.find(FIND_MY_SPAWNS)
      .find(s => !s.spawning);

    if (!spawn) return;

    const creeps = Object.values(Game.creeps).filter(c => c.room.name === room.name);

    if (creeps.length === 0 && room.energyAvailable >= 200) {
      return this.spawnBootstrap(room, spawn);
    }

    this.spawnByDemand(room, spawn);
  },

  spawnBootstrap(room, spawn) {
    spawn.spawnCreep([WORK, CARRY, MOVE], `rat_${Game.time}`, {
      memory: { role: 'slave' }
    });
  },

  spawnByDemand(room, spawn) {
    const jobs = JobBoard.getJobs(room.name);

    const harvestDemand = jobs.filter(j => j.type === 'HARVEST').length;
    const workerCount = _.filter(Game.creeps, c =>
      c.room.name === room.name &&
      c.memory.role === 'slave'
    ).length;

    if (workerCount < harvestDemand) {
      spawn.spawnCreep([WORK, CARRY, MOVE], `rat_${Game.time}`, {
        memory: { role: 'slave' }
      });
    }
  }
};
