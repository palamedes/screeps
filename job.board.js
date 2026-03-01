/**
 * Runtime job coordination system.
 * Stores per-tick jobs and assigns them to creeps.
 * No Memory writes — fully ephemeral.
 *
 * REPAIR CHANGES in this version:
 *
 * 1. PROACTIVE CONTAINER REPAIR: containers now trigger repair at 90% hits
 *    (down from "any damage"). Source containers at 34% hits means a miner's
 *    harvest starts spilling as drops the moment it dies. Don't wait that long.
 *
 * 2. ROAD MAINTENANCE TIER: roads now have three bands:
 *    - Healthy (>=75%): skip
 *    - Maintenance (<75%): priority 400 — fix before they deteriorate further
 *    - Damaged (<50%): priority 500
 *    - Critical (<25%): priority 750
 *    This catches roads early instead of scrambling when 8 go critical at once.
 *
 * 3. TOP 5 REPAIR JOBS (was 3): at RCL5 with 5 clanrats and multiple damaged
 *    structures, only 3 slots meant some critical repairs waited several ticks
 *    for a slot to open. 5 slots allows parallel repair on the worst offenders.
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
        if (job.type === 'UPGRADE') return 250;
        if (job.type === 'REPAIR')  return 150;
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
    const fullSlots     = Math.max(2, room.find(FIND_SOURCES).length * 4);

    const slots = (warlockActive && hasBuildSites) ? 1 : fullSlots;

    const energyRatio   = room.energyAvailable / room.energyCapacityAvailable;
    const extensions    = room.find(FIND_MY_STRUCTURES, {
      filter: s => s.structureType === STRUCTURE_EXTENSION
    }).length;
    const extensionSites = room.find(FIND_MY_CONSTRUCTION_SITES, {
      filter: s => s.structureType === STRUCTURE_EXTENSION
    }).length;

    const priority = energyRatio >= 0.95
      ? 750
      : (extensions === 0 && extensionSites === 0)
        ? 600
        : 300;

    this.publish(room.name, {
      type:     'UPGRADE',
      targetId: room.controller.id,
      priority,
      slots
    });
  },

  publishBuildJobs(room) {
    room.find(FIND_MY_CONSTRUCTION_SITES).forEach(site => {

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
   * CONTAINERS (proactive — repair at 90% hits):
   * - Controller container: priority 975
   * - Source containers:    priority 950
   * - Other containers:     priority 900
   * Containers are cheap to repair but expensive to lose. A dead source container
   * means dropped energy and a degraded miner. Don't wait for 50% hits.
   *
   * RAMPARTS:
   * - Critical (<1000 hits): priority 950
   * - Normal:                priority 900
   *
   * TOWERS:
   * - Any damage: priority 900
   *
   * ROADS (three tiers):
   * - Maintenance (<75% hits): priority 400 — catch early before they snowball
   * - Damaged     (<50% hits): priority 500
   * - Critical    (<25% hits): priority 750
   *
   * Publishes top 5 repair jobs so multiple clanrats can work in parallel.
   */
  publishRepairJobs(room) {
    const sources = room.find(FIND_SOURCES);

    const damagedStructures = room.find(FIND_MY_STRUCTURES, {
      filter: s => s.hits < s.hitsMax
    });

    const prioritized = damagedStructures.map(structure => {
      let priority = null; // null = skip this structure

      if (structure.structureType === STRUCTURE_CONTAINER) {
        const hitsPct = structure.hits / structure.hitsMax;

        // Proactive: repair containers when they drop below 90% hits.
        // At 100% a container has 250k hits. At 34% (like source containers now)
        // one bad tick can drop it below 1k and kill the miner's harvest point.
        if (hitsPct >= 0.9) return null; // still healthy, skip

        const isControllerContainer = room.controller &&
          structure.pos.inRangeTo(room.controller, 3);
        const isSourceContainer = sources.some(src =>
          structure.pos.inRangeTo(src, 2)
        );

        if (isControllerContainer)  priority = 975;
        else if (isSourceContainer) priority = 950;
        else                        priority = 900;

      } else if (structure.structureType === STRUCTURE_RAMPART) {
        priority = structure.hits < 1000 ? 950 : 900;

      } else if (structure.structureType === STRUCTURE_TOWER) {
        priority = 900;

      } else if (structure.structureType === STRUCTURE_ROAD) {
        const hitsPct = structure.hits / structure.hitsMax;

        if (hitsPct >= 0.75)      return null; // healthy road, skip
        else if (hitsPct < 0.25)  priority = 750; // critical
        else if (hitsPct < 0.50)  priority = 500; // damaged
        else                      priority = 400; // maintenance (<75%)

      } else if (
        structure.structureType === STRUCTURE_WALL ||
        structure.structureType === STRUCTURE_RAMPART
      ) {
        // Walls handled by tower; skip for clanrat repair jobs
        return null;

      } else {
        // Other structures (spawn, storage, extensions, etc.) — repair if damaged
        priority = 500;
      }

      if (priority === null) return null;
      return { structure, priority };

    }).filter(item => item !== null);

    // Sort by priority (highest first), then by hits (lowest first within same priority)
    prioritized.sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      return a.structure.hits - b.structure.hits;
    });

    // Publish top 5 — enough for parallel repair at RCL5 with 5 clanrats
    for (const item of prioritized.slice(0, 5)) {
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