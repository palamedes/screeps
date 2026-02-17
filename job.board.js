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
   * Publish repair jobs for damaged structures.
   *
   * CRITICAL STRUCTURES (containers, ramparts, towers, spawn):
   * - Controller container: priority 975 (warlock anchor point)
   * - Source containers: priority 950 (miner harvest points)
   * - Other containers: priority 900
   * - Critical ramparts (<1000 hits): priority 950
   * - Normal ramparts: priority 900
   * - Towers: priority 900
   *
   * ROADS:
   * - Critical (<25% hits): priority 750
   * - Damaged (<50% hits): priority 500
   *
   * Publish up to 3 worst damaged structures so multiple clanrats can repair in parallel.
   */
  publishRepairJobs(room) {
    const sources = room.find(FIND_SOURCES);

    // Find all damaged structures
    const damagedStructures = room.find(FIND_MY_STRUCTURES, {
      filter: s => s.hits < s.hitsMax
    });

    // Prioritize and sort
    const prioritized = damagedStructures.map(structure => {
      let priority = 500; // default

      if (structure.structureType === STRUCTURE_CONTAINER) {
        // Check if controller container
        const isControllerContainer = room.controller &&
          structure.pos.inRangeTo(room.controller, 3);

        // Check if source container
        const isSourceContainer = sources.some(src =>
          structure.pos.inRangeTo(src, 2)
        );

        if (isControllerContainer) {
          priority = 975;
        } else if (isSourceContainer) {
          priority = 950;
        } else {
          priority = 900;
        }
      } else if (structure.structureType === STRUCTURE_RAMPART) {
        // Critical ramparts get emergency priority
        if (structure.hits < 1000) {
          priority = 950;
        } else {
          priority = 900;
        }
      } else if (structure.structureType === STRUCTURE_TOWER) {
        priority = 900;
      } else if (structure.structureType === STRUCTURE_ROAD) {
        // Only repair roads below 50% hits
        if (structure.hits >= structure.hitsMax * 0.5) {
          return null; // Skip healthy roads
        }
        const isCritical = structure.hits < structure.hitsMax * 0.25;
        priority = isCritical ? 750 : 500;
      }

      return { structure, priority };
    }).filter(item => item !== null);

    // Sort by priority (highest first), then by hits (lowest first)
    prioritized.sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      return a.structure.hits - b.structure.hits;
    });

    // Publish top 3 repair jobs
    for (const item of prioritized.slice(0, 3)) {
      this.publish(room.name, {
        type:     'REPAIR',
        targetId: item.structure.id,
        priority: item.priority,
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