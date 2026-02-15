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

