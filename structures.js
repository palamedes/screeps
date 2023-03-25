const sTower  = require('structure.tower');

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



  drawBaseplan: room => {
    const spawn = room.find(FIND_MY_SPAWNS)[0];
    const roomName = room.name;
    const rV = new RoomVisual(roomName);
    // Plan the room and store it in memory
    structures.basePlan(room);
    // Function to take the spiral string, and draw it back to the map.
    // Save the sprial map (string of characters) to the rooms memory.. this is our base plan!
    const drawSpiral = (start, str, rv, checkForWalls) => {
      const x = start.x, y = start.y;
      let dx = 0, dy = -1, len = 0, posX = x, posY = y, index = 0;
      while (index < str.length) {
        for (let i = 0; i < len; i++) {
          if (index < str.length) {
            let c = str.charAt(index);
            let terrain = Game.map.getRoomTerrain(roomName);
            if (terrain.get(posX, posY) !== TERRAIN_MASK_WALL) {
              if (checkForWalls && hasWallInAdjacentSquares(posX, posY, terrain)) {
                str[index] = '%'
                c = '%';
              }
              rV.text(c, posX, posY, {opacity: 0.8, font: 0.5, color: 'red'});
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
      return str
    }
    // Check cardinal directions for walls
    let hasWallInAdjacentSquares = (x,y,terrain) => {
      return (terrain.get(x-1, y) === TERRAIN_MASK_WALL) ||
        (terrain.get(x+1, y) === TERRAIN_MASK_WALL) ||
        (terrain.get(x, y-1) === TERRAIN_MASK_WALL) ||
        (terrain.get(x, y+1) === TERRAIN_MASK_WALL)
    }
    // Draw the beast on the map
    console.log(drawSpiral(spawn.pos, Memory.rooms[room.name].spiralStamp, rV, true));
  } ,

  // Okay this may seem heavy handed but this is a good way for me to get my brain around what I think the base should
  // sorta look like.  this is a stamp, but only in that it's a rough guess as to what it should look like and it will
  // dynamically alter itself during the spiral draw to fit the terrain and then the bot itself will add what it wants
  // over time.  # are roads, e are extensions, T are towers, · can be anything..etc..
  basePlan: room => {
    const roomName = room.name;
    // RESOURCE_*, MINERAL_*, CREEP, TOWER, SOURCE, CONTROLLER, POWER_BANK, POWER_SPAWN,
    // RUIN, PORTAL, LAB, SPAWN, LINK, WALL, EXTENSION, RAMPART, ROAD.
    // @ = SPAWN,  # = ROAD,  T = TOWER,  e = EXTENSION, · = {dynamic anything}
    const basePlan = [];
    basePlan[0] = "###############";
    basePlan[1] = "##·····#·····##";
    basePlan[2] = "#·#····#····#·#";
    basePlan[3] = "#··#···#···#··#";
    basePlan[4] = "#···#e###e#···#";
    basePlan[5] = "#···e#e#e#e···#";
    basePlan[6] = "#··e#··#··#e··#";
    basePlan[7] = "####··T*T··####";
    basePlan[8] = "#··e#·###·#e··#";
    basePlan[9] = "#···e#e#e#e···#";
    basePlan[10]= "#···#e###e#···#";
    basePlan[11]= "#··#···#···#··#";
    basePlan[12]= "#·#····#····#·#";
    basePlan[13]= "##·····#·····##";
    basePlan[14]= "###############";
    // Convert the above stamp, to a spiral starting at the main base "*" (6,8)
    // *eeT#Tee#·#e#ee#eT·e#e#·... etc.. around and around expanding outwards.  This allows us to dynamically change as we draw.
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
        if (x < 0 || y < 0 || y > basePlan.length || x > basePlan[y].length) {
          isDone = true;
        }
      }
      return plan;
    };
    Memory.rooms[room.name].spiralStamp = Memory.rooms[room.name].spiralStamp || spiralStamp(basePlan,7, 7);
  }

}
module.exports = structures;
