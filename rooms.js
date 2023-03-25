const roleSkaven = require("./role.skaven");

let rooms = {
  run: room => {
    console.log(room.memory.status);
    if (room.memory.status === 'init') { rooms.init(room); }
  },
  // Setup plan for base, roads to sources..etc.
  init: room => {
    console.log('init the room');
  },
  running: () => {

  }
}
module.exports = rooms;
