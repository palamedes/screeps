// const structures = require('structures');
//
// let rooms = {
//
//   setMemory: room => {
//     Memory.rooms = Memory.rooms || {}
//     Memory.rooms[room.name] = Memory.rooms[room.name] || {}
//     Memory.rooms[room.name] = {
//       status:     Memory.rooms[room.name].status    || 'init',
//       sources:    Memory.rooms[room.name].sources   || {},
//       maxSlaves:  Memory.rooms[room.name].maxSlaves || 2,
//       maxOgres:   Memory.rooms[room.name].maxOgres  || 0,
//       basePlan:   Memory.rooms[room.name].basePlan  || null,
//       tickCount:  Memory.rooms[room.name].tickCount || 0,
//       maxEnergy:  Memory.rooms[room.name].maxEnergy || 0,
//     }
//     return Memory.rooms[room.name];
//   },
//
//   run: room => {
//     let mem = Memory.rooms[room.name];
//     mem.tickCount++;
//     if (mem.status  === 'init')     { rooms.init(room); }
//     if (mem.status  === 'running')  { rooms.running(room); }
//   },
//
//   // Setup plan for base, roads to sources..etc.
//   init: room => {
//     // Find our sources and build path from spawn to
//     const energySources = room.find(FIND_SOURCES);
//     // Look around the sources, and find the suckle points
//     let findSucklePoints = source => {
//       const surroundings = [];
//       for (let x = source.pos.x - 1; x <= source.pos.x + 1; x++) {
//         for (let y = source.pos.y - 1; y <= source.pos.y + 1; y++) {
//           if (x === source.pos.x && y === source.pos.y) continue;
//           const look = source.room.lookAt(x, y);
//           if (look.some(obj => obj.type === LOOK_TERRAIN && obj.terrain === 'wall')) continue;
//           if (look.some(obj => obj.type === LOOK_STRUCTURES && OBSTACLE_OBJECT_TYPES.includes(obj.structure.structureType))) continue;
//           surroundings.push({x: x, y: y});
//         }
//       }
//       return surroundings;
//     }
//     for(let i in energySources) {
//       Memory.rooms[room.name].sources[energySources[i].id] = findSucklePoints(energySources[i]);
//     }
//
//
//
//     // Once this is all said and done, we can run the room.
//     Memory.rooms[room.name].status = "running";
//   },
//   // okay do the day to day running of the room
//   running: room => {
//     // Work Towers
//     structures.tower.run();
//     // Draw the base plan based on the rooms information
//     structures.drawBaseplan(room);
//     // Okay every so often we need the room to build something
//     structures.buildSomething(room);
//
//   }
// }
// module.exports = rooms;
