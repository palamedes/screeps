// if (Memory.__wipe !== 2) {
//   for (const k in Memory) delete Memory[k];
//   Memory.__wipe = 2;
//   console.log('Memory wiped');
// }

require('empire');
require('warren');
require('rat');

const Traffic  = require('traffic');
const BlackBox = require('warren.blackbox');

/**
 * Main game loop.
 * Orchestrates empire → rooms → creeps → traffic resolution.
 * Contains no strategy logic.
 */
module.exports.loop = function () {

  cleanupMemory();

  // Instrumentation runs first — captures CPU before any game logic skews it.
  // BlackBox: always-on rolling 300-tick recorder. Start with blackbox().
  // Profiler: manual 300-tick deep-dive run.    Start with profile().
  BlackBox.tick();
  Profiler.tick();

  // Clear all movement intents and pins from last tick.
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