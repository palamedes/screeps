module.exports = {

  publishHarvestJobs(JobBoard, room) {
    room.find(FIND_SOURCES).forEach(source => {
      JobBoard.publish(room.name, {
        type: 'HARVEST',
        targetId: source.id,
        priority: 100,
        slots: 1
      });
    });
  },

  publishUpgradeJobs(JobBoard, room) {
    JobBoard.publish(room.name, {
      type: 'UPGRADE',
      targetId: room.controller.id,
      priority: 50,
      slots: 2
    });
  },

  publishBuildJobs(JobBoard, room) {
    room.find(FIND_MY_CONSTRUCTION_SITES).forEach(site => {
      JobBoard.publish(room.name, {
        type: 'BUILD',
        targetId: site.id,
        priority: 800,
        slots: 2
      });
    });
  },

  publishDefenseJobs(JobBoard, room) {
    room.find(FIND_HOSTILE_CREEPS).forEach(hostile => {
      JobBoard.publish(room.name, {
        type: 'DEFEND',
        targetId: hostile.id,
        priority: 200,
        slots: 3
      });
    });
  }

};
