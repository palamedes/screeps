const JobBoard = require('job.board');
const Publishers = require('job.board.publish');
const SpawnDirector = require('director.spawn');
require('planner.extensions');

JobBoard.reset(this.name);

Publishers.publishBuildJobs(JobBoard, this);

Room.prototype.act = function () {
  JobBoard.reset(this.name);

  const plan = this._plan;

  if (plan.buildExtensions) {
    this.planExtensions();
  }

  if (plan.publishHarvest) {
    JobBoard.publishHarvestJobs(this);
  }

  if (plan.publishBuild) {
    JobBoard.publishBuildJobs(this);
  }

  if (plan.publishUpgrade) {
    JobBoard.publishUpgradeJobs(this);
  }

  if (plan.publishDefense) {
    JobBoard.publishDefenseJobs(this);
  }

  SpawnDirector.run(this);
};
