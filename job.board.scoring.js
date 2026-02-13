const JobBoard = require('job.board');

JobBoard.score = function (job, distance) {
  const priorityWeight = job.priority * 100;
  const distancePenalty = distance * 2;
  return priorityWeight - distancePenalty;
};

JobBoard.rolePreference = function (creep, job) {

  const role = creep.memory.role;
  if (!role) return 0;

  switch (role) {

    case 'slave':
      if (job.type === 'HARVEST') return 200;
      if (job.type === 'UPGRADE') return 50;
      return 0;

    case 'packmaster':
      if (job.type === 'HAUL') return 300;
      return -100;

    case 'warlock':
      if (job.type === 'BUILD') return 250;
      if (job.type === 'REPAIR') return 200;
      return -50;

    case 'warlord':
      if (job.type === 'DEFEND') return 400;
      return -500;

    default:
      return 0;
  }
};
