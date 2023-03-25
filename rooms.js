const roleSkaven = require("./role.skaven");

let rooms = {
  run: room => {
    if (Memory.rooms[room.name].status  === 'init') { rooms.init(room); }
  },
  // Setup plan for base, roads to sources..etc.
  init: room => {
    // Find our sources and build path from spawn to
    const energySources = room.find(FIND_SOURCES);
    const sourcePositions = energySources.map(source => source.pos);
    console.log(sourcePositions);
  },
  running: () => {

  }
}
module.exports = rooms;
