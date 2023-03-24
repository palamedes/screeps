
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

    const basePlan = [];
    basePlan[0] = "###############";
    basePlan[1] = "##···········##";
    basePlan[2] = "#·#····@····#·#";
    basePlan[3] = "#··#···#···#··#";
    basePlan[4] = "#···#·###·#···#";
    basePlan[5] = "#····#e#e#····#";
    basePlan[6] = "#···#ee#ee#···#";
    basePlan[7] = "#ee#eeT#Tee#ee#";
    basePlan[8] = "#···#e*T·e#···#";
    basePlan[9] = "#····#eee#····#";
    basePlan[10]= "#···#·#e#·#···#";
    basePlan[11]= "#··#···#···#··#";
    basePlan[12]= "#·#····@····#·#";
    basePlan[13]= "##···········##";
    basePlan[14]= "###############";

    // Convert the above stamp, to a spiral starting at the main base "*" (6,8)
    // *eeT#Tee#·#e#ee#eT·e#e#·... etc.. around and around expanding outwards
    // This was hard to figure out.. And kinda pointless, its only ever run once typically.. but still was a fun challenge.
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
        if (x < -1 || y < -1 || y >= basePlan.length || x >= basePlan[y].length) {
          isDone = true;
        }
      }
      return plan;
    };
    let spiral = spiralStamp(basePlan,6, 8);
console.log(spiral);
    const drawSpiral = (stamp, startX, startY, rV) => {
      const directions = [
        { x: 1, y: 0 }, // right
        { x: 0, y: 1 }, // down
        { x: -1, y: 0 }, // left
        { x: 0, y: -1 } // up
      ];
      let direction = 0;
      let stepsInDirection = 1;
      let stepsTakenInDirection = 0;
      let currentX = startX;
      let currentY = startY;
      let i = 0;
      while (i < stamp.length) {
        const currentChar = stamp.charAt(i);
        if (currentChar !== ' ') {
          rV.text(currentChar, currentX, currentY, { color: '#ff0000', font: 0.8, opacity: 0.5, scale: 3 });
        }
        i++;
        stepsTakenInDirection++;
        if (stepsTakenInDirection >= stepsInDirection) {
          direction = (direction + 1) % 4;
          stepsTakenInDirection = 0;
          if (direction % 2 === 0) {
            stepsInDirection++;
          }
        }
        currentX += directions[direction].x;
        currentY += directions[direction].y;
      }
    }

    const drawSpiral2 = (start, str, rv) => {
      const x = start.x, y = start.y;
      let dx = 0, dy = -1, len = 0, posX = x, posY = y, index = 0;
      while (index < str.length) {
        for (let i = 0; i < len; i++) {
          if (index < str.length) {
            const c = str.charAt(index);
            if (c !== " ") {
              rV.text(c, posX, posY, {opacity: 0.8, font: 0.5});
            }
            index++;
          }
          posX += dx;
          posY += dy;
        }
        [dx, dy] = [-dy, dx];
        if (dy === 0) {
          len++;
        }
      }
    }

    const spawn = Game.spawns[Object.keys(Game.spawns)[0]];
    const rV = new RoomVisual(spawn.room.name);
    // drawSpiral(spiral, spawn.pos.x, spawn.pos.y, rV)
    drawSpiral2(spawn.pos, spiral, rV)
  }

}
module.exports = structures;
