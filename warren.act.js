/**
 * warren.act.js
 *
 * Executes the plan produced by warren.decide.js.
 * This is the ONLY phase in the OODA loop where side effects occur.
 * All spawning, building, and job publishing happens here.
 *
 * Called by: warren.js (OODA step 5 of 5)
 * Reads:     this._plan
 * Delegates: SpawnDirector, JobBoard, planners
 */

const JobBoard     = require('job.board');
const SpawnDirector = require('spawn.director');
require('plan.spawn');
require('plan.extensions');
require('plan.containers');

Room.prototype.act = function () {

  JobBoard.reset(this.name);

  const plan = this._plan;

  // Spawn placement fires first — without a spawn nothing else can happen.
  // The planner self-guards: no-ops if spawn or spawn site already exists.
  if (plan.buildSpawn) {
    this.planSpawn();
  }

  if (plan.buildExtensions) {
    this.planExtensions();
  }

  if (plan.buildControllerContainer) {
    this.planControllerContainer();
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