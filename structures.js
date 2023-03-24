
const sTower  = require('structure.tower');
const roleSkaven = require("./role.skaven");

let structures = {
  tower: sTower,

  // Place one of the road sections around the base
  buildRoad: () => {

  },

  // Place an extension around the base
  buildExtension: () => {
    // Do we have anything else being built?
    // Do we have any extensions available to be built?

  },

  findHabitrails: () => {
    //
    const roomVisual = new RoomVisual('W24S37');
    roomVisual.line(10, 10, 40, 40, { color: 'blue' });
  },



  drawBaseplan: () => {
    const spawn = Game.spawns[Object.keys(Game.spawns)[0]];
    const roomName = spawn.room.name
    const rV = new RoomVisual(roomName);

    structures.basePlan();
  } ,






  drawBaseplanStamp: () => {
    const spawn = Game.spawns[Object.keys(Game.spawns)[0]];
    const roomName = spawn.room.name
    const rV = new RoomVisual(roomName);
    const plan = structures.basePlanStamp();
    const startSpawn = { x:-6, y:-8 };
    for(let y in plan) {
      let line = plan[y].replace(/ /g,'');
      for(let x in line) {
        // console.log(Math.parseInt(spawn.pos.x) + " " + startSpawn.x + " "+ x + '::' + (spawn.pos.x + startSpawn.x + x));
        let placeX = parseInt(spawn.pos.x) + parseInt(startSpawn.x) + parseInt(x);
        let placeY = parseInt(spawn.pos.y) + parseInt(startSpawn.y) + parseInt(y);
        // if the terrain at this point is a wall we can't use it
        const terrain = Game.map.getRoomTerrain(placeX, placeY, roomName);
        if (terrain !== "wall") {
          rV.text(line[x], placeX, placeY, { color: '#ff0000', font: 0.8, opacity: 0.5, scale: 3 });
        }
      }
    }
    // rV.text("#", spawn.pos.x, spawn.pos.y, { color: '#ff0000', font: 0.8, opacity: 0.5, scale: 3 });
    // visual.drawIcon(RESOURCE_ENERGY, 3, 11, {scale: 1.5, opacity: 0.8, color: '#ff0000'});
  },

  basePlan: () => {
    // RESOURCE_*, MINERAL_*, CREEP, TOWER, SOURCE, CONTROLLER, POWER_BANK, POWER_SPAWN,
    // RUIN, PORTAL, LAB, SPAWN, LINK, WALL, EXTENSION, RAMPART, ROAD.
    // @ = SPAWN,  # = ROAD,  T = TOWER,  e = EXTENSION
    // const plan = "@,#Tee#eeT,eT.e#e#.#.#e#ee#"

    const basePlan = {};
    basePlan[0]  = "# # # # # # # # # # # # # # #";
    basePlan[1]  = "# # · · · · · · · · · · · # #"
    basePlan[2]  = "# · # · · · · @ · · · · # · #"
    basePlan[3]  = "# · · # · · · # · · · # · · #"
    basePlan[4]  = "# · · · # · # # # · # · · · #"
    basePlan[5]  = "# · · · · # e # e # · · · · #"
    basePlan[6]  = "# · · · # e e # e e # · · · #"
    basePlan[7]  = "# e e # e e T # T e e # e e #"
    basePlan[8]  = "# · · · # e @ T · e # · · · #"
    basePlan[9]  = "# · · · · # e e e # · · · · #"
    basePlan[10] = "# · · · # · # e # · # · · · #"
    basePlan[11] = "# · · # · · · # · · · # · · #"
    basePlan[12] = "# · # · · · · @ · · · · # · #"
    basePlan[13] = "# # · · · · · · · · · · · # #"
    basePlan[14] = "# # # # # # # # # # # # # # #"

    const spiralStamp = (basePlan, startX, startY) => {
      const dirs = [[-1, 0], [0, -1], [1, 0], [0, 1]];
      let x = startX, y = startY;
      let dirIndex = 0;
      let plan = '';
      let steps = 1;
      let stepCount = 0;
      let isDone = false;
      while (!isDone) {
        // Get the current character
        let currChar = basePlan[y][x];

        // Add it to the plan
        plan += currChar;

        // Move to the next position
        x += dirs[dirIndex][0];
        y += dirs[dirIndex][1];

        // Increment the step count
        stepCount++;

        // Check if we need to change direction
        if (stepCount === steps) {
          // Change direction
          dirIndex = (dirIndex + 1) % 4;

          // Increment steps every two turns
          if (dirIndex % 2 === 0) {
            steps++;
          }

          // Reset step count
          stepCount = 0;
        }

        // Check if we've reached the edge of the array
        if (x < 0 || y < 0 || y >= basePlan.length || x >= basePlan[y].length) {
          isDone = true;
        }
      }
      return plan;
    };
console.log(basePlan[7]);
// starting at (7, 8) and using basePlan
//     const plan = spiralStamp(basePlan,7, 8);
//     console.log(plan);

  }




}
module.exports = structures;
