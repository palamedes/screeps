const JobBoard = require('job.board');

JobBoard.canDo = function (creep, job) {

  switch (job.type) {

    case 'HARVEST':
      return creep.getActiveBodyparts(WORK) > 0;

    case 'BUILD':
    case 'UPGRADE':
    case 'REPAIR':
      return creep.getActiveBodyparts(WORK) > 0 &&
        creep.getActiveBodyparts(CARRY) > 0;

    case 'HAUL':
      return creep.getActiveBodyparts(CARRY) > 0;

    case 'DEFEND':
      return creep.getActiveBodyparts(ATTACK) > 0 ||
        creep.getActiveBodyparts(RANGED_ATTACK) > 0;

    default:
      return true;
  }
};

JobBoard.buildPriority = function (type) {
  switch (type) {
    case STRUCTURE_CONTAINER: return 900;
    case STRUCTURE_EXTENSION: return 800;
    case STRUCTURE_TOWER: return 700;
    case STRUCTURE_STORAGE: return 600;
    case STRUCTURE_ROAD: return 400;
    case STRUCTURE_RAMPART: return 300;
    case STRUCTURE_WALL: return 200;
    default: return 500;
  }
};
