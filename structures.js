
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
    const plan = structures.basePlan();
    const startSpawn = { x:-6, y:-8 };
    for(let y in plan) {
      let line = plan[y].replace(/ /g,'');
      for(let x in line) {
        console.log(spawn.pos.x + " " + startSpawn.x + " "+ x);
        let placeX = spawn.pos.x + startSpawn.x + x;
        let placeY = spawn.pos.y + startSpawn.y + y;
        rV.text(line[x], placeX, placeY, { color: '#ff0000', font: 0.8, opacity: 0.5, scale: 3 });
      }
    }
    // rV.text("#", spawn.pos.x, spawn.pos.y, { color: '#ff0000', font: 0.8, opacity: 0.5, scale: 3 });
    // visual.drawIcon(RESOURCE_ENERGY, 3, 11, {scale: 1.5, opacity: 0.8, color: '#ff0000'});
  },

  basePlan: () => {
    // RESOURCE_*, MINERAL_*, CREEP, TOWER, SOURCE, CONTROLLER, POWER_BANK, POWER_SPAWN,
    // RUIN, PORTAL, LAB, SPAWN, LINK, WALL, EXTENSION, RAMPART, ROAD.
    // @ = SPAWN,  # = ROAD,  T = TOWER,  e = EXTENSION
    let basePlan = {}
    basePlan[0]  = "# # # # # # # # # # # # # # #";
    basePlan[1]  = "# # · · · · · · · · · · · # #"
    basePlan[2]  = "# · # · · · · @ · · · · # · #"
    // basePlan[3]  = "# · · # · · · # · · · # · · #"
    // basePlan[4]  = "# · · · # · # # # · # · · · #"
    // basePlan[5]  = "# · · · · # e # e # · · · · #"
    // basePlan[6]  = "# · · · # e e # e e # · · · #"
    // basePlan[7]  = "# e e # e e T # T e e # e e #"
    // basePlan[8]  = "# · · · # e @ T · e # · · · #"
    // basePlan[9]  = "# · · · · # e e e # · · · · #"
    // basePlan[10] = "# · · · # · # e # · # · · · #"
    // basePlan[11] = "# · · # · · · # · · · # · · #"
    // basePlan[12] = "# · # · · · · @ · · · · # · #"
    // basePlan[13] = "# # · · · · · · · · · · · # #"
    // basePlan[14] = "# # # # # # # # # # # # # # #"
    return basePlan;
  }




}
module.exports = structures;
