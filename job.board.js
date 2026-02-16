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
      type:     job.type,
      targetId: job.targetId,
      priority: job.priority !== undefined ? job.priority : 0,
      slots:    job.slots    !== undefined ? job.slots    : 1,
      assigned: []
    });
  },

  getJobs(roomName) {
    return this._rooms[roomName] || [];
  },

  assignJob(creep) {
    const jobs = this.getJobs(creep.room.name);
    if (!jobs.length) return null;

    let bestJob   = null;
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
        bestJob   = job;
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
        // Clanrats have their own gathering phase — harvesting from source
        // would break the miner → thrall → clanrat energy chain.
        return creep.memory.role !== 'clanrat' &&
          creep.getActiveBodyparts(WORK) > 0;

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

      case 'thrall':
        if (job.type === 'HAUL') return 500;
        return -200;

      case 'clanrat':
        if (job.type === 'BUILD')   return 300;
        if (job.type === 'REPAIR')  return 200;  // roads between builds
        if (job.type === 'UPGRADE') return 100;
        return -50;

      default:
        return 0;
    }
  },

  publishHarvestJobs(room) {
    room.find(FIND_SOURCES).forEach(source => {
      this.publish(room.name, {
        type:     'HARVEST',
        targetId: source.id,
        priority: 100,
        slots:    1
      });
    });
  },

  publishUpgradeJobs(room) {
    const warlockActive = Object.values(Game.creeps).some(c =>
      c.memory.homeRoom === room.name &&
      c.memory.role === 'warlock'
    );

    const hasBuildSites = room.find(FIND_MY_CONSTRUCTION_SITES).length > 0;

    const fullSlots = Math.max(2, room.find(FIND_SOURCES).length * 4);

    const slots = (warlockActive && hasBuildSites)
      ? 1
      : fullSlots;

    this.publish(room.name, {
      type:     'UPGRADE',
      targetId: room.controller.id,
      priority: 50,
      slots
    });
  },

  publishBuildJobs(room) {
    room.find(FIND_MY_CONSTRUCTION_SITES).forEach(site => {

      // Priority ladder — higher number = clanrats work this first:
      //   900: controller container (unlocks warlock continuous upgrade)
      //   875: tower              (defense infrastructure)
      //   850: rampart            (immediate structural protection)
      //   800: everything else   (extensions, roads, etc.)
      const isControllerContainer =
        site.structureType === STRUCTURE_CONTAINER &&
        room.controller &&
        site.pos.inRangeTo(room.controller, 3);

      const isTower   = site.structureType === STRUCTURE_TOWER;
      const isRampart = site.structureType === STRUCTURE_RAMPART;

      const priority = isControllerContainer ? 900 :
        isTower               ? 875 :
          isRampart             ? 850 : 800;

      this.publish(room.name, {
        type:     'BUILD',
        targetId: site.id,
        priority,
        slots:    2
      });
    });
  },

  /**
   * Publish repair jobs for damaged roads.
   *
   * Only roads for now — ramparts are maintained by the tower's idle repair.
   * Critical roads (< 25% hits) get higher priority than merely damaged ones.
   * Publish up to 3 worst roads so multiple clanrats can repair in parallel.
   */
  publishRepairJobs(room) {
    const damaged = room.find(FIND_MY_STRUCTURES, {
      filter: s =>
        s.structureType === STRUCTURE_ROAD &&
        s.hits < s.hitsMax * 0.5
    }).sort((a, b) => a.hits - b.hits).slice(0, 3);

    for (const road of damaged) {
      const isCritical = road.hits < road.hitsMax * 0.25;
      this.publish(room.name, {
        type:     'REPAIR',
        targetId: road.id,
        priority: isCritical ? 750 : 500,
        slots:    1
      });
    }
  },

  publishDefenseJobs(room) {
    room.find(FIND_HOSTILE_CREEPS).forEach(hostile => {
      this.publish(room.name, {
        type:     'DEFEND',
        targetId: hostile.id,
        priority: 200,
        slots:    3
      });
    });
  }

};