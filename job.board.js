/**
 * Runtime job coordination system.
 * Stores per-tick jobs and assigns them to creeps.
 * No Memory writes — fully ephemeral.
 */
module.exports = {

  _rooms: {},

  reset(roomName) {
    this._rooms[roomName] = [];
  },

  publish(roomName, job) {
    if (!this._rooms[roomName]) {
      this._rooms[roomName] = [];
    }

    this._rooms[roomName].push({
      type: job.type,
      targetId: job.targetId,
      priority: job.priority !== undefined ? job.priority : 0,
      slots: job.slots !== undefined ? job.slots : 1,
      assigned: []
    });
  },

  getJobs(roomName) {
    return this._rooms[roomName] || [];
  },

  assignJob(creep) {
    const jobs = this.getJobs(creep.room.name);
    if (!jobs.length) return null;

    let bestJob = null;
    let bestScore = -Infinity;

    for (const job of jobs) {

      if (job.assigned.length >= job.slots) continue;
      if (!this.canDo(creep, job)) continue;

      const target = Game.getObjectById(job.targetId);
      if (!target) continue;

      const distance = creep.pos.getRangeTo(target);
      const score =
        (job.priority * 100) -
        (distance * 2) +
        this.rolePreference(creep, job);

      if (score > bestScore) {
        bestScore = score;
        bestJob = job;
      }
    }

    if (bestJob) {
      bestJob.assigned.push(creep.name);
      return bestJob;
    }

    return null;
  },

  canDo(creep, job) {
    switch (job.type) {

      case 'HARVEST':
        return creep.getActiveBodyparts(WORK) > 0;

      case 'BUILD':
      case 'UPGRADE':
      case 'REPAIR':
        return creep.getActiveBodyparts(WORK) > 0 &&
          creep.getActiveBodyparts(CARRY) > 0;

      case 'HAUL':
        return creep.getActiveBodyparts(CARRY) > 0;

      case 'DEFEND':
        return creep.getActiveBodyparts(ATTACK) > 0 ||
          creep.getActiveBodyparts(RANGED_ATTACK) > 0;

      default:
        return true;
    }
  },

  rolePreference(creep, job) {

    const role = creep.memory.role;
    if (!role) return 0;

    switch (role) {

      case 'slave':
        if (job.type === 'HARVEST') return 200;
        if (job.type === 'UPGRADE') return 50;
        return 0;

      case 'miner':
        if (job.type === 'HARVEST') return 500;
        return -200;

      case 'hauler':
        if (job.type === 'HAUL') return 500;
        return -200;

      case 'worker':
        if (job.type === 'BUILD') return 300;
        if (job.type === 'UPGRADE') return 100;
        return -50;

      default:
        return 0;
    }
  },

  publishHarvestJobs(room) {
    room.find(FIND_SOURCES).forEach(source => {
      this.publish(room.name, {
        type: 'HARVEST',
        targetId: source.id,
        priority: 100,
        slots: 1
      });
    });
  },

  publishUpgradeJobs(room) {
    this.publish(room.name, {
      type: 'UPGRADE',
      targetId: room.controller.id,
      priority: 50,
      slots: 2
    });
  },

  publishBuildJobs(room) {
    room.find(FIND_MY_CONSTRUCTION_SITES).forEach(site => {
      this.publish(room.name, {
        type: 'BUILD',
        targetId: site.id,
        priority: 800,
        slots: 2
      });
    });
  },

  publishDefenseJobs(room) {
    room.find(FIND_HOSTILE_CREEPS).forEach(hostile => {
      this.publish(room.name, {
        type: 'DEFEND',
        targetId: hostile.id,
        priority: 200,
        slots: 3
      });
    });
  }

};
