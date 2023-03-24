
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

    structure.basePlan();
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

    let spiralStamp = (startX, startY, stamp) => {
      const dx = [1, 0, -1, 0];
      const dy = [0, 1, 0, -1];
      let direction = 0;
      let stepsInCurrentDirection = 1;
      let currentStepsTakenInDirection = 0;
      let x = startX;
      let y = startY;
      let output = '';

      while (true) {
        // add current cell to output
        output += stamp[y].charAt(x);

        // update position and steps taken
        x += dx[direction];
        y += dy[direction];
        currentStepsTakenInDirection++;

        // if we've completed our spiral, return the output string
        if (x < 0 || y < 0 || x >= stamp[0].length || y >= stamp.length) {
          return output;
        }

        // if we've taken all the steps in this direction, change direction
        if (currentStepsTakenInDirection === stepsInCurrentDirection) {
          direction = (direction + 1) % 4;
          currentStepsTakenInDirection = 0;

          // every second direction change, we increase stepsInCurrentDirection
          if (direction % 2 === 0) {
            stepsInCurrentDirection++;
          }
        }
      }
    }

// starting at (7, 8) and using basePlan
    const plan = spiralStamp(7, 8, basePlan);
    console.log(plan);

  }




}
module.exports = structures;
