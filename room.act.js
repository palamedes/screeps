const JobBoard = require('job.board');
const Publishers = require('job.board.publish');
const SpawnDirector = require('director.spawn');
require('planner.extensions');

Room.prototype.act = function () {

  JobBoard.reset(this.name);

  const plan = this._plan;

  if (plan.buildExtensions) {
    this.planExtensions();
  }

  if (plan.publishHarvest) {
    Publishers.publishHarvestJobs(JobBoard, this);
  }

  if (plan.publishBuild) {
    Publishers.publishBuildJobs(JobBoard, this);
  }

  if (plan.publishUpgrade) {
    Publishers.publishUpgradeJobs(JobBoard, this);
  }

  if (plan.publishDefense) {
    Publishers.publishDefenseJobs(JobBoard, this);
  }

  SpawnDirector.run(this);
};
