const roleSkaven = require("./role.skaven");

let rooms = {
  run: room => {
    console.log(Memory.rooms[room.name].status);
    if (Memory.rooms[room.name].status  === 'init') { rooms.init(room); }
  },
  // Setup plan for base, roads to sources..etc.
  init: room => {
    console.log('init the room');
  },
  running: () => {

  }
}
module.exports = rooms;
