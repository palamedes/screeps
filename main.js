// if (Memory.__wipe !== 2) {
//   for (const k in Memory) delete Memory[k];
//   Memory.__wipe = 2;
//   console.log('Memory wiped');
// }

require('console');
require('empire');
require('warren');
require('rat');

const Traffic = require('traffic');

/**
 * Main game loop.
 * Orchestrates empire → rooms → creeps → traffic resolution.
 * Contains no strategy logic.
 */
module.exports.loop = function () {

  cleanupMemory();

  // Clear all movement intents and pins from last tick.
  // Must happen before any room or creep ticks register new ones.
  Traffic.reset();

  Empire.tick();

  for (const roomName in Game.rooms) {
    const room = Game.rooms[roomName];
    if (room.controller && room.controller.my) {
      room.tick();
    }
  }

  for (const name in Game.creeps) {
    Game.creeps[name].tick();
  }

  // Execute all movement registered this tick.
  // Runs after all creep ticks so the full picture of intent is known
  // before any creep actually moves.
  Traffic.resolve();
};

/**
 * Removes memory entries for dead creeps.
 */
function cleanupMemory() {
  for (const name in Memory.creeps) {
    if (!Game.creeps[name]) {
      delete Memory.creeps[name];
    }
  }
}




global.status1 = function () {
  const report = {};

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

  report.rooms = Object.values(Game.rooms).map(room => {
    const controller = room.controller;
    const creeps = room.find(FIND_MY_CREEPS);
    const hostiles = room.find(FIND_HOSTILE_CREEPS);
    const structures = room.find(FIND_MY_STRUCTURES);
    const construction = room.find(FIND_MY_CONSTRUCTION_SITES);
    const roleCounts = _.countBy(creeps, c => c.memory.role || "unknown");
    const structureCounts = _.countBy(structures, s => s.structureType);

    return {
      name: room.name,
      rcl: controller ? controller.level : null,
      controllerProgress: controller ? controller.progress : null,
      controllerProgressTotal: controller ? controller.progressTotal : null,
      energyAvailable: room.energyAvailable,
      energyCapacity: room.energyCapacityAvailable,
      storedEnergy:
        (room.storage?.store[RESOURCE_ENERGY] || 0) +
        (room.terminal?.store[RESOURCE_ENERGY] || 0),
      sources: room.find(FIND_SOURCES).length,
      creeps: roleCounts,
      structures: structureCounts,
      constructionSites: construction.length,
      hostiles: hostiles.length
    };
  });

  report.totalCreeps = Object.keys(Game.creeps).length;
  report.creepRoles = _.countBy(Game.creeps, c => c.memory.role || "unknown");
  report.constructionSites = Object.keys(Game.constructionSites).length;
  report.market = {
    credits: Game.market.credits,
    orders: Object.keys(Game.market.orders).length
  };

  console.log(JSON.stringify(report, null, 2));
};
