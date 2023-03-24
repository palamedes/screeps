
const sTower  = require('structure.tower');

let structures = {
  tower: sTower,

  findHabitrail: () => {
    const roomVisual = new RoomVisual('W24S37');
    roomVisual.line(10, 10, 40, 40, { color: 'blue' });
  }

}
module.exports = structures;
