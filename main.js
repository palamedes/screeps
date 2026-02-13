// if (Memory.__wipe !== 2) {
//   for (const k in Memory) delete Memory[k];
//   Memory.__wipe = 2;
//   console.log('Memory wiped');
// }

require('empire');
require('room');
require('creep');

/**
 * Main game loop.
 * Orchestrates empire → rooms → creeps.
 * Contains no strategy logic.
 */
module.exports.loop = function () {

  cleanupMemory();

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
