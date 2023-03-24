
const sTower  = require('structure.tower');

let structures = {
  tower: sTower,

  findHabitrail: () => {
    if (!Memory.testVisual) {
      const roomVisual = new RoomVisual('W24S37');
      roomVisual.line(10, 10, 40, 40, { color: 'blue' });
      Memory.testVisual = roomVisual;
    }
  }

}
module.exports = structures;
