const JobBoard = require('job.board');

JobBoard.publishHarvestJobs = function (room) {
  room.find(FIND_SOURCES).forEach(source => {
    JobBoard.publish(room.name, {
      type: 'HARVEST',
      targetId: source.id,
      priority: 100,
      slots: 1
    });
  });
};

JobBoard.publishUpgradeJobs = function (room) {
  JobBoard.publish(room.name, {
    type: 'UPGRADE',
    targetId: room.controller.id,
    priority: 50,
    slots: 2
  });
};

JobBoard.publishBuildJobs = function (room) {
  room.find(FIND_MY_CONSTRUCTION_SITES).forEach(site => {
    JobBoard.publish(room.name, {
      type: 'BUILD',
      targetId: site.id,
      priority: JobBoard.buildPriority(site.structureType),
      slots: 2
    });
  });
};

JobBoard.publishDefenseJobs = function (room) {
  room.find(FIND_HOSTILE_CREEPS).forEach(hostile => {
    JobBoard.publish(room.name, {
      type: 'DEFEND',
      targetId: hostile.id,
      priority: 200,
      slots: 3
    });
  });
};
