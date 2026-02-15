/**
 * console.js
 *
 * Exposes diagnostic commands as globals callable from the Screeps console.
 * Require this in main.js and these become available any time:
 *
 *   status()   — full empire snapshot (rooms, creeps, energy, structures)
 *
 * These are purely observational — no side effects, no Memory writes.
 */

global.status = function () {
  const sep = '─'.repeat(60);

  console.log('\n' + sep);
  console.log('SKAVEN EMPIRE SNAPSHOT — tick ' + Game.time);
  console.log(sep);

  // --- Global ---
  console.log('\n⚡ CPU:  used=' + Game.cpu.getUsed().toFixed(2) +
    '  limit=' + Game.cpu.limit +
    '  bucket=' + Game.cpu.bucket);
  console.log('🌐 GCL: level=' + Game.gcl.level +
    '  progress=' + Game.gcl.progress + '/' + Game.gcl.progressTotal);

  // --- Per Room ---
  for (const roomName in Game.rooms) {
    const room = Game.rooms[roomName];
    if (!room.controller || !room.controller.my) continue;

    console.log('\n' + sep);
    console.log('🏰 ROOM: ' + roomName +
      '  RCL=' + room.controller.level +
      '  progress=' + room.controller.progress + '/' + room.controller.progressTotal);
    console.log('   State:  ' + (room.memory.state !== undefined
      ? ['BOOTSTRAP','STABLE','GROW','FORTIFY','WAR'][room.memory.state]
      : 'unknown'));
    console.log('   Energy: ' + room.energyAvailable + '/' + room.energyCapacityAvailable +
      '  (' + Math.round(room.energyAvailable / room.energyCapacityAvailable * 100) + '%)');

    // Spawns
    const spawns = room.find(FIND_MY_SPAWNS);
    spawns.forEach(s => {
      const sp = s.spawning
        ? '  🥚 spawning: ' + s.spawning.name + ' (' + s.spawning.remainingTime + ' ticks left)'
        : '  ✅ idle';
      console.log('   Spawn [' + s.name + ']:' + sp);
    });

    // Structures summary
    const structures = room.find(FIND_MY_STRUCTURES);
    const structCount = {};
    structures.forEach(s => {
      structCount[s.structureType] = (structCount[s.structureType] || 0) + 1;
    });
    console.log('   Structures: ' + JSON.stringify(structCount));

    // Construction sites
    const sites = room.find(FIND_MY_CONSTRUCTION_SITES);
    if (sites.length) {
      const siteSum = {};
      sites.forEach(s => { siteSum[s.structureType] = (siteSum[s.structureType] || 0) + 1; });
      console.log('   Sites:      ' + JSON.stringify(siteSum));
    } else {
      console.log('   Sites:      none');
    }

    // Containers
    const containers = room.find(FIND_STRUCTURES, {
      filter: s => s.structureType === STRUCTURE_CONTAINER
    });
    containers.forEach(c => {
      const pct = Math.round(c.store[RESOURCE_ENERGY] / c.store.getCapacity(RESOURCE_ENERGY) * 100);
      const near = c.pos.inRangeTo(room.controller, 3) ? '[controller]'
        : room.find(FIND_SOURCES).some(src => c.pos.inRangeTo(src, 2)) ? '[source]'
          : '[other]';
      console.log('   Container ' + near + ': ' + c.store[RESOURCE_ENERGY] + '/' +
        c.store.getCapacity(RESOURCE_ENERGY) + ' (' + pct + '%)' +
        '  hits=' + c.hits + '/' + c.hitsMax);
    });

    // Roads health
    const roads = room.find(FIND_STRUCTURES, {filter: s => s.structureType === STRUCTURE_ROAD});
    const damagedRoads = roads.filter(r => r.hits < r.hitsMax * 0.5);
    console.log('   Roads:      ' + roads.length + ' total, ' +
      damagedRoads.length + ' below 50% health');

    // Hostiles
    const hostiles = room.find(FIND_HOSTILE_CREEPS);
    if (hostiles.length) {
      console.log('   ⚔️  HOSTILES: ' + hostiles.length);
    }

    // Creeps by role
    const creeps = Object.values(Game.creeps).filter(c => c.memory.homeRoom === roomName);
    const byRole = {};
    creeps.forEach(c => { byRole[c.memory.role] = (byRole[c.memory.role] || 0) + 1; });
    console.log('   Creeps (' + creeps.length + '): ' + JSON.stringify(byRole));

    // Dying creeps (< 200 ticks)
    const dying = creeps.filter(c => c.ticksToLive < 200);
    if (dying.length) {
      console.log('   ⚠️  Dying soon: ' +
        dying.map(c => c.name + '(' + c.ticksToLive + ')').join(', '));
    }

    // Dropped energy
    const dropped = room.find(FIND_DROPPED_RESOURCES, {
      filter: r => r.resourceType === RESOURCE_ENERGY
    });
    const droppedTotal = dropped.reduce((sum, r) => sum + r.amount, 0);
    if (droppedTotal > 0) {
      console.log('   Dropped energy: ' + droppedTotal + ' across ' + dropped.length + ' piles');
    }
  }

  console.log('\n' + sep);
  console.log('END SNAPSHOT');
  console.log(sep + '\n');
};



global.status1 = function () {
  var report = {};

  report.time = Game.time;
  report.cpu = {
    bucket: Game.cpu.bucket,
    limit: Game.cpu.limit,
    used: Game.cpu.getUsed()
  };

  report.gcl = {
    level: Game.gcl.level,
    progress: Game.gcl.progress,
    progressTotal: Game.gcl.progressTotal
  };

  report.rooms = Object.keys(Game.rooms).map(function (name) {
    var room = Game.rooms[name];
    var controller = room.controller;
    var creeps = room.find(FIND_MY_CREEPS);
    var hostiles = room.find(FIND_HOSTILE_CREEPS);
    var structures = room.find(FIND_MY_STRUCTURES);
    var construction = room.find(FIND_MY_CONSTRUCTION_SITES);
    var roleCounts = _.countBy(creeps, function (c) {
      return c.memory.role || "unknown";
    });

    var structureCounts = _.countBy(structures, function (s) {
      return s.structureType;
    });

    var storedEnergy = 0;

    if (room.storage && room.storage.store[RESOURCE_ENERGY]) {
      storedEnergy += room.storage.store[RESOURCE_ENERGY];
    }

    if (room.terminal && room.terminal.store[RESOURCE_ENERGY]) {
      storedEnergy += room.terminal.store[RESOURCE_ENERGY];
    }

    return {
      name: room.name,
      rcl: controller ? controller.level : null,
      controllerProgress: controller ? controller.progress : null,
      controllerProgressTotal: controller ? controller.progressTotal : null,
      energyAvailable: room.energyAvailable,
      energyCapacity: room.energyCapacityAvailable,
      storedEnergy: storedEnergy,
      sources: room.find(FIND_SOURCES).length,
      creeps: roleCounts,
      structures: structureCounts,
      constructionSites: construction.length,
      hostiles: hostiles.length
    };
  });
  report.totalCreeps = Object.keys(Game.creeps).length;
  report.creepRoles = _.countBy(Game.creeps, function (c) {
    return c.memory.role || "unknown";
  });
  report.constructionSites = Object.keys(Game.constructionSites).length;
  report.market = {
    credits: Game.market.credits,
    orders: Object.keys(Game.market.orders).length
  };
  console.log(JSON.stringify(report, null, 2));
};


