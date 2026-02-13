JobBoard.rolePreference = function (creep, job) {

  const role = creep.memory.role;
  if (!role) return 0;

  switch (role) {

    case 'slave':
      if (job.type === 'HARVEST') return 200;
      if (job.type === 'UPGRADE') return 50;
      return 0;

    case 'miner':
      if (job.type === 'HARVEST') return 500;
      return -200;

    case 'hauler':
      if (job.type === 'HAUL') return 500;
      return -200;

    case 'worker':
      if (job.type === 'BUILD') return 300;
      if (job.type === 'UPGRADE') return 100;
      if (job.type === 'REPAIR') return 150;
      return -50;

    default:
      return 0;
  }
};
