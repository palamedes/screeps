const sTower  = require('structure.tower');

let structures = {
  tower: sTower,

  // Build something!
  buildSomething: room => {
    if (_.size(Game.constructionSites) === 0) {
      // @TODO and the room containers are more than 50% full...
      // TOWER ~ If we can build a tower, we should..
      let towersAllowed = CONTROLLER_STRUCTURES['tower'][room.controller.level];
      let towersBuilt = room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_TOWER } }).length;
      if ((towersAllowed - towersBuilt) > 0 && _.size(Game.constructionSites) === 0) { structures.buildTower(room); }
      // CONTAINER ~ If we can build a container, we should..
      let containersAllowed = CONTROLLER_STRUCTURES['container'][room.controller.level];
      let containersBuilt = room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_CONTAINER } }).length;
      if ((containersAllowed - containersBuilt) > 0 && _.size(Game.constructionSites) === 0) { structures.buildContainer(room); }
      // EXTENSION ~ If we can build an extension, we should..
      let extensionsAllowed = CONTROLLER_STRUCTURES['extension'][room.controller.level];
      let extensionsBuilt = room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_EXTENSION } }).length;
      if ((extensionsAllowed - extensionsBuilt) > 0 && _.size(Game.constructionSites) === 0) { structures.buildExtension(room); }
      // STORAGE ~ if we can build a storage, we should..
      let storagesAllowed = CONTROLLER_STRUCTURES['storage'][room.controller.level];
      let storagesBuilt = room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_STORAGE } }).length;
      if ((storagesAllowed - storagesBuilt) > 0 && _.size(Game.constructionSites) === 0) { structures.buildStorage(room); }
      // ROAD ~ Build a road if there are no construction sites
      if (room.controller.level > 3 && _.size(Game.constructionSites) === 0) { structures.buildRoad(room); }
      // RAMPART ~ Build a rampart if there are no construction sites
      if (room.controller.level > 4 && _.size(Game.constructionSites) === 0) { structures.buildRampart(room); }
      // WALL ~ Build a wall if there are no construction sites
      if (room.controller.level > 5 && _.size(Game.constructionSites) === 0) { structures.buildWall(room); }
    }
  },

  buildStructure: (room, buildPos, structure, updatePlanCharacter) => {
    if (!buildPos) return;
    if (!updatePlanCharacter) updatePlanCharacter = ' ';
    let results = room.createConstructionSite(buildPos.x, buildPos.y, structure);
    if (results === OK || results === ERR_RCL_NOT_ENOUGH) {
      structures.updateBasePlan(room, buildPos.index, updatePlanCharacter);
    } else if (results === ERR_INVALID_TARGET) {
      structures.updateBasePlan(room, buildPos.index, updatePlanCharacter);
      console.log("We can't place the '" + structure + "' at the location requested: ["+buildPos.x+","+buildPos.y+"] ~ Assuming it was already built and clearing character.");
    } else {
      console.log("we couldn't build " + structure + " for some reason. somethings wrong. Results:" + results)
    }
  },

  // Place one of the road sections around the base
  buildRoad: room => {
    const spawn = room.find(FIND_MY_SPAWNS)[0]; if (!spawn) return false;
    const roadsBeingBuilt = room.find(FIND_CONSTRUCTION_SITES, {filter: {structureType: STRUCTURE_ROAD}}).length;
    if (roadsBeingBuilt === 0) {
      // Pull the room base plan and translate the first "#" to a x,y position and build there.
      let buildPos = structures.findBuildLocationFromPlan(spawn.pos, Memory.rooms[room.name].basePlan, STRUCTURE_ROAD);
      structures.buildStructure(room, buildPos, STRUCTURE_ROAD);
    }
  },

  // Place one of the road sections around the base
  buildRampart: room => {
    const spawn = room.find(FIND_MY_SPAWNS)[0]; if (!spawn) return false;
    const rampartsBeingBuilt = room.find(FIND_CONSTRUCTION_SITES, {filter: {structureType: STRUCTURE_RAMPART}}).length;
    if (rampartsBeingBuilt === 0) {
      // Pull the room base plan and translate the first "%" to a x,y position and build there, then set the symbol to '#'
      let buildPos = structures.findBuildLocationFromPlan(spawn.pos, Memory.rooms[room.name].basePlan, STRUCTURE_RAMPART);
      structures.buildStructure(room, buildPos, STRUCTURE_RAMPART, '#');
    }
  },

  // Place an extension around the base
  buildExtension: room => {
    const spawn = room.find(FIND_MY_SPAWNS)[0]; if (!spawn) return false;
    const extensionsBeingBuilt = room.find(FIND_CONSTRUCTION_SITES, {filter: {structureType: STRUCTURE_EXTENSION}}).length;
    if (extensionsBeingBuilt === 0) {
      // Pull the room base plan and translate the first "e" to a x,y position and build there.
      let buildPos = structures.findBuildLocationFromPlan(spawn.pos, Memory.rooms[room.name].basePlan, STRUCTURE_EXTENSION);
      structures.buildStructure(room, buildPos, STRUCTURE_EXTENSION);
    }
  },

  // Place a tower around the base
  buildTower: room => {
    const spawn = room.find(FIND_MY_SPAWNS)[0]; if (!spawn) return false;
    const towersBeingBuilt = room.find(FIND_CONSTRUCTION_SITES, {filter: {structureType: STRUCTURE_TOWER}}).length;
    if (towersBeingBuilt === 0) {
      // Pull the room base plan and translate the first "T" to a x,y position and build there.
      let buildPos = structures.findBuildLocationFromPlan(spawn.pos, Memory.rooms[room.name].basePlan, STRUCTURE_TOWER);
      structures.buildStructure(room, buildPos, STRUCTURE_TOWER);
    }
  },

  // Place a container around the base
  buildContainer: room => {
    const spawn = room.find(FIND_MY_SPAWNS)[0]; if (!spawn) return false;
    const containersBeingBuilt = room.find(FIND_CONSTRUCTION_SITES, {filter: {structureType: STRUCTURE_CONTAINER}}).length;
    if (containersBeingBuilt === 0) {
      // Pull the room base plan and translate the first "e" to a x,y position and build there.
      let buildPos = structures.findBuildLocationFromPlan(spawn.pos, Memory.rooms[room.name].basePlan, STRUCTURE_CONTAINER);
      structures.buildStructure(room, buildPos, STRUCTURE_CONTAINER);
    }
  },

  // Place a storage around the base
  buildStorage: room => {
    const spawn = room.find(FIND_MY_SPAWNS)[0]; if (!spawn) return false;
    const storagesBeingBuilt = room.find(FIND_CONSTRUCTION_SITES, {filter: {structureType: STRUCTURE_STORAGE}}).length;
    if (storagesBeingBuilt === 0) {
      // Pull the room base plan and translate the first "S" to a x,y position and build there.
      let buildPos = structures.findBuildLocationFromPlan(spawn.pos, Memory.rooms[room.name].basePlan, STRUCTURE_STORAGE);
      structures.buildStructure(room, buildPos, STRUCTURE_STORAGE);
    }
  },

  // Place a storage around the base
  buildWall: room => {
    const spawn = room.find(FIND_MY_SPAWNS)[0]; if (!spawn) return false;
    const wallsBeingBuilt = room.find(FIND_CONSTRUCTION_SITES, {filter: {structureType: STRUCTURE_WALL}}).length;
    if (wallsBeingBuilt === 0) {
      // Pull the room base plan and translate the first "#" to a x,y position and build there.
      let buildPos = structures.findBuildLocationFromPlan(spawn.pos, Memory.rooms[room.name].basePlan, STRUCTURE_WALL);
      structures.buildStructure(room, buildPos, STRUCTURE_WALL);
    }
  },

  // This method draws the base plan on the map in real time for me to see..
  drawBaseplan: room => {
    const spawn = room.find(FIND_MY_SPAWNS)[0]; if (!spawn) return false;
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
    const spawn = room.find(FIND_MY_SPAWNS)[0]; if (!spawn) return false;
    const roomName = room.name;
    const basePlan = structures.baseStamp();
    // Convert the above stamp, to a spiral starting at the main base "*" (8,8)
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

    let starLocation = structures.findStarLocation();
    let unmodifiedBasePlan = spiralStamp(basePlan, starLocation.x, starLocation.y);
    return modifyDrawnSpiral(unmodifiedBasePlan, spawn.pos.x, spawn.pos.y);
  },

  // Get our starting location for this base
  findStarLocation: () => {
    for (let y = 0; y < structures.baseStamp().length; y++) {
      const row = structures.baseStamp()[y];
      const starIndex = row.indexOf('*');
      if (starIndex !== -1) {
        const x = starIndex;
        return { x, y };
      }
    }
    return null; // '*' not found
  },

  // In the same way we spiral around and draw the base, find our next build site based on the sent structure.
  findBuildLocationFromPlan: (start, str, structure) => {
    let findSymbol = '·';
    if (structure === STRUCTURE_EXTENSION) { findSymbol = 'e'; }
    if (structure === STRUCTURE_CONTAINER) { findSymbol = 'c'; }
    if (structure === STRUCTURE_ROAD)      { findSymbol = '#'; }
    if (structure === STRUCTURE_RAMPART)   { findSymbol = '%'; }
    if (structure === STRUCTURE_TOWER)     { findSymbol = 'T'; }
    if (structure === STRUCTURE_STORAGE)   { findSymbol = 'S'; }
    const x = start.x, y = start.y;
    let dx = 0, dy = -1, len = 0, posX = x, posY = y, index = 0;
    while (index < str.length) {
      for (let i = 0; i < len; i++) {
        if (index < str.length) {
          if (str.charAt(index) === findSymbol) {
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
  updateBasePlan: (room, index, updateCharacter) => {
    if (!updateCharacter) { updateCharacter = ' '; }
    // if index is set, then just update that one location
    let replaceChar = (str, index, replacement) => {
      return str.slice(0, index) + replacement + str.slice(index + 1);
    }
    Memory.rooms[room.name].basePlan = replaceChar(Memory.rooms[room.name].basePlan, index, updateCharacter);
  },

  // RESOURCE_*, MINERAL_*, CREEP, TOWER, SOURCE, CONTROLLER, POWER_BANK, POWER_SPAWN,
  // RUIN, PORTAL, LAB, SPAWN, LINK, WALL, EXTENSION, RAMPART, ROAD.
  // @ = SPAWN,  # = ROAD,  T = TOWER,  e = EXTENSION, · = {dynamic anything}
  // c = RESOURCE_CONTAINER, L = LINK, S = Storage, w = Wall
  baseStamp: () => {
    const stamp = [];
    stamp[0]  = ", , w w w w w w % w w w w w w , ,".replace(/ /g, '');
    stamp[1]  = ", % w # # # # # # # # # # # w % ,".replace(/ /g, '');
    stamp[2]  = "w w # · · · · · # · · · · · # w w".replace(/ /g, '');
    stamp[3]  = "w # · # · # · e # e · # · # · # w".replace(/ /g, '');
    stamp[4]  = "w # · · # · e e % e e · # · · # w".replace(/ /g, '');
    stamp[5]  = "w # · # · # e % T % e # · # · # w".replace(/ /g, '');
    stamp[6]  = "w # · · e e % e # e % e e · · # w".replace(/ /g, '');
    stamp[7]  = "w # · e e % c # # # c % e e · # w".replace(/ /g, '');
    stamp[8]  = "% # # # % S · T * T L c % # # # %".replace(/ /g, '');
    stamp[9]  = "w # · e e % c # # # c % e e · # w".replace(/ /g, '');
    stamp[10] = "w # · · e e % e # e % e e · · # w".replace(/ /g, '');
    stamp[11] = "w # · # · # e % T % e # · # · # w".replace(/ /g, '');
    stamp[12] = "w # · · # · e e % e e · # · · # w".replace(/ /g, '');
    stamp[13] = "w # · # · # · e # e · # · # · # w".replace(/ /g, '');
    stamp[14] = "w w # · · · · · # · · · · · # w w".replace(/ /g, '');
    stamp[15] = ", % w # # # # # # # # # # # w % ,".replace(/ /g, '');
    stamp[16] = ", , w w w w w w % w w w w w w , ,".replace(/ /g, '');
    return stamp;
  }
}
module.exports = structures;
