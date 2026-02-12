/**
 * Runtime job coordination system.
 * Stores per-tick jobs and assigns them to creeps.
 * No Memory writes — fully ephemeral.
 */
module.exports = {

  _rooms: {},

  /**
   * Clears job list for a room at start of tick.
   * @param {string} roomName
   */
  reset(roomName) {
    this._rooms[roomName] = [];
  },

  /**
   * Publishes a job into the room queue.
   * @param {string} roomName
   * @param {Object} job
   */
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

  /**
   * Returns active jobs for room.
   * @param {string} roomName
   */
  getJobs(roomName) {
    return this._rooms[roomName] || [];
  },

  /**
   * Assigns the best available job to a creep.
   * Uses priority + distance scoring.
   * @param {Creep} creep
   * @returns {Object|null}
   */
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
      const baseScore = this.score(job, distance);
      const roleWeight = this.rolePreference(creep, job);
      const score = baseScore + roleWeight;


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

  /**
   * Determines whether a creep is capable of performing a job.
   * @param {Creep} creep
   * @param {Object} job
   */
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

  /**
   * Scores a job based on priority and distance.
   * Higher score wins.
   * @param {Object} job
   * @param {number} distance
   */
  score(job, distance) {
    const priorityWeight = job.priority * 100;
    const distancePenalty = distance * 2;
    return priorityWeight - distancePenalty;
  },

  /* ========================
     Convenience Publishers
     ======================== */

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
        priority: this.buildPriority(site.structureType),
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
  },

  /**
   * Adds role-based weighting to job selection.
   * Keeps creeps biased toward preferred work.
   */
  rolePreference(creep, job) {

    const role = creep.memory.role;

    if (!role) return 0;

    switch (role) {

      case 'slave':
        if (job.type === 'HARVEST') return 200;
        if (job.type === 'UPGRADE') return 50;
        return 0;

      case 'packmaster':
        if (job.type === 'HAUL') return 300;
        return -100;

      case 'warlock':
        if (job.type === 'BUILD') return 250;
        if (job.type === 'REPAIR') return 200;
        return -50;

      case 'warlord':
        if (job.type === 'DEFEND') return 400;
        return -500;

      default:
        return 0;
    }
  },

  /**
   * Determines build priority by structure type.
   * Higher value = more important.
   * @param {string} structureType
   */
  buildPriority(type) {
    switch (type) {
      case STRUCTURE_CONTAINER: return 900;
      case STRUCTURE_EXTENSION: return 800;
      case STRUCTURE_TOWER: return 700;
      case STRUCTURE_STORAGE: return 600;
      case STRUCTURE_ROAD: return 400;
      case STRUCTURE_RAMPART: return 300;
      case STRUCTURE_WALL: return 200;
      default: return 500;
    }
  }

};
