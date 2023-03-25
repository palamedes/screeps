const roleSkaven = require("./role.skaven");

let rooms = {
  run: room => {
    if (Memory.rooms[room.name].status  === 'init') { rooms.init(room); }
  },
  // Setup plan for base, roads to sources..etc.
  init: room => {
    // Find our sources and build path from spawn to
    const energySources = room.find(FIND_SOURCES);

    let surroundings = source => {
      const surroundings = [];
      for (let x = source.pos.x - 1; x <= source.pos.x + 1; x++) {
        for (let y = source.pos.y - 1; y <= source.pos.y + 1; y++) {
          if (x === source.pos.x && y === source.pos.y) continue;
          const look = source.room.lookAt(x, y);
          if (look.some(obj => obj.type === LOOK_TERRAIN && obj.terrain === 'wall')) continue;
          if (look.some(obj => obj.type === LOOK_STRUCTURES && OBSTACLE_OBJECT_TYPES.includes(obj.structure.structureType))) continue;
          surroundings.push({x: x, y: y});
        }
      }
      return surroundings;
    }
    Memory.rooms[room.name].sources = energySources.map(source => surroundings(source));

    // Once this is all said and done, we can run the room.
    Memory.rooms[room.name].status = "running";
  },
  running: () => {

  }
}
module.exports = rooms;
