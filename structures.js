const sTower  = require('structure.tower');

let structures = {
  tower: sTower,

  // Build something!
  buildSomething: room => {
    if (_.size(Game.constructionSites) === 0) {
      let extensionsAllowed = CONTROLLER_STRUCTURES['extension'][room.controller.level];
      // If we can build an extension, we should..
      if (extensionsAllowed > 0) { structures.buildExtension(room); }



    }
  },

  // Place one of the road sections around the base
  buildRoad: room => {

  },

  // Place an extension around the base
  buildExtension: room => {
    const spawn = room.find(FIND_MY_SPAWNS)[0];
    let extensionsBeingBuilt = room.find(FIND_CONSTRUCTION_SITES, {filter: {structureType: STRUCTURE_EXTENSION}}).length;
    if (extensionsBeingBuilt === 0) {
      // Pull the room base plan and translate the first "e" to a x,y position and build there.
      let buildPos = structures.findBuildLocationFromPlan(spawn.pos, Memory.rooms[room.name].basePlan, STRUCTURE_EXTENSION);
      let results = room.createConstructionSite(buildPos.x, buildPos.y, STRUCTURE_EXTENSION);
      if (results === OK) {
        structures.updateBasePlan(room, buildPos.index);
      } else {
        console.log("we couldnt build for some reason. somethings wrong. " + results)
      }
    }
  },

  // findHabitrails: () => {
  //   //
  //   const roomVisual = new RoomVisual('W24S37');
  //   roomVisual.line(10, 10, 40, 40, { color: 'blue' });
  // },

  drawBaseplan: room => {
    const spawn = room.find(FIND_MY_SPAWNS)[0];
    // Plan the room and store it in memory
    Memory.rooms[room.name].basePlan = Memory.rooms[room.name].basePlan || structures.basePlan(room);
    // Function to take the spiral string, and actually draw it out on the map.
    const drawSpiral = (start, str, rV) => {
      const x = start.x, y = start.y;
      let dx = 0, dy = -1, len = 0, posX = x, posY = y, index = 0;
      while (index < str.length) {
        for (let i = 0; i < len; i++) {
          if (index < str.length) {
            let c = str.charAt(index);
            let terrain = Game.map.getRoomTerrain(room.name);
            if (terrain.get(posX, posY) !== TERRAIN_MASK_WALL) {
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
    }
    // Draw the beast on the map!
    drawSpiral(spawn.pos, Memory.rooms[room.name].basePlan, new RoomVisual(room.name));
  },

  // Okay this may seem heavy handed but this is a good way for me to get my brain around what I think the base should
  // sorta look like.  this is a stamp, but only in that it's a rough guess as to what it should look like and it will
  // dynamically alter itself during the spiral draw to fit the terrain and then the bot itself will add what it wants
  // over time.  # are roads, e are extensions, T are towers, · can be anything..etc..
  basePlan: room => {
    console.log('called');
    const spawn = room.find(FIND_MY_SPAWNS)[0];
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
    // Convert the above stamp, to a spiral starting at the main base "*" (7,8)
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
    // Check cardinal directions for walls so we add roads here
    let hasWallInAdjacentSquares = (x,y,terrain) => {
      return (terrain.get(x-1, y) === TERRAIN_MASK_WALL) ||
        (terrain.get(x+1, y) === TERRAIN_MASK_WALL) ||
        (terrain.get(x, y-1) === TERRAIN_MASK_WALL) ||
        (terrain.get(x, y+1) === TERRAIN_MASK_WALL)
    }
    // Function to take the spiral string created in spiralStamp, and draw it back to the map once to test the fit, and to modify it.
    // Modifications will not try to put things in walls, for example.. or be smarter about roads near walls..etc..
    // Save the new spiralStamp map (string of characters) to the rooms memory.. this is our base plan for this room.  Neat huh?
    // (okay I'll admit this is likely VERY heavy handed and stupid, but it was amusing to create.. )
    const modifyDrawnSpiral = (basePlan, x, y) => {
      let results = ""
      let dx = 0, dy = -1, len = 0, posX = x, posY = y, index = 0;
      while (index < basePlan.length) {
        for (let i = 0; i < len; i++) {
          if (index < basePlan.length) {
            let c = basePlan.charAt(index);
            let terrain = Game.map.getRoomTerrain(roomName);
            // If we are hitting a wall.. well dont do that..
            if (terrain.get(posX, posY) !== TERRAIN_MASK_WALL) {
              // if there is an adjacent wall, road it.
              if (hasWallInAdjacentSquares(posX, posY, terrain)) { c = '#'; }
              results += c;
            } else {
              results += ' ';
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
      return results;
    }
    let unmodifiedBasePlan = spiralStamp(basePlan,7, 7);
    return modifyDrawnSpiral(unmodifiedBasePlan, spawn.pos.x, spawn.pos.y);
  },

  // In the same way we spiral around and draw the base, find our next build site based on the sent structure.
  findBuildLocationFromPlan: (start, str, structure) => {
    let findSymbol = '·';
    if (structure === STRUCTURE_EXTENSION) { findSymbol = 'e'; }
    const x = start.x, y = start.y;
    let dx = 0, dy = -1, len = 0, posX = x, posY = y, index = 0;
    while (index < str.length) {
      for (let i = 0; i < len; i++) {
        if (index < str.length) {
          let c = str.charAt(index);
          if (c === findSymbol) {
            return {x: posX, y: posY, index: index};
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
  },

  // Look at what is actually placed.. and update the base plan accordingly to remove those items from the plan.
  updateBasePlan: (room, index) => {
    // if index is set, then just update that one location
    let replaceChar = (str, index, replacement) => {
      return str.slice(0, index) + replacement + str.slice(index + 1);
    }
    Memory.rooms[room.name].basePlan = replaceChar(Memory.rooms[room.name].basePlan, index, ' ');
  }
}
module.exports = structures;
