
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


  drawBaseplan: () => {
    // let visual = new RoomVisual('W24S37');
    new RoomVisual('W24S37').text("💥", 3, 11, {color: 'red', font: 0.8});
    // visual.drawIcon(RESOURCE_ENERGY, 3, 11, {scale: 1.5, opacity: 0.8, color: '#ff0000'});
  }
  // RESOURCE_*, MINERAL_*, CREEP, TOWER, SOURCE, CONTROLLER, POWER_BANK, POWER_SPAWN,
  // RUIN, PORTAL, LAB, SPAWN, LINK, WALL, EXTENSION, RAMPART, ROAD.
  /* Base Plan
   # # # # # # # # # # # # # # #
   # # · · · · · · · · · · · # #
   # · # · · · · @ · · · · # · #
   # · · # · · · # · · · # · · #
   # · · · # · # # # · # · · · #
   # · · · · # e # e # · · · · #
   # · · · # e e # e e # · · · #
   # · · # e e T # T e e # · · #
   # · · · # e @ T · e # · · · #
   # · · · · # e e e # · · · · #
   # · · · # · # e # · # · · · #
   # · · # · · · # · · · # · · #
   # · # · · · · @ · · · · # · #
   # # · · · · · · · · · · · # #
   # # # # # # # # # # # # # # #
   */



}
module.exports = structures;
