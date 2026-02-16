/**
 * warren.act.js
 *
 * Executes the plan produced by warren.decide.js.
 * This is the ONLY phase in the OODA loop where side effects occur.
 *
 * Tower logic runs independently of plan flags — it fires whenever towers
 * and hostiles are present, regardless of room state.
 *
 * Called by: warren.js (OODA step 5 of 5)
 * Reads:     this._plan, this._snapshot
 * Delegates: SpawnDirector, JobBoard, planners
 */

const JobBoard      = require('job.board');
const SpawnDirector = require('spawn.director');
require('plan.extensions');
require('plan.container.controller');
require('plan.container.source');
require('plan.roads');
require('plan.ramparts');
require('plan.tower');

Room.prototype.act = function () {

  JobBoard.reset(this.name);

  const plan = this._plan;
  const snap = this._snapshot;

  // --- Safe Mode ---
  if (plan.activateSafeMode) {
    this.controller.activateSafeMode();
    console.log(`[warren:${this.name}] ⚠️  SAFE MODE ACTIVATED — hostiles detected!`);
  }

  // --- Tower Logic ---
  // Runs independently of plan flags — towers act every tick they have targets.
  if (snap.towers.length > 0) {
    if (snap.hostiles.length > 0) {
      // Attack: focus fire on the lowest-HP hostile (kill one fast > chip many)
      const target = snap.hostiles.reduce((a, b) => a.hits < b.hits ? a : b);
      for (const tower of snap.towers) {
        tower.attack(target);
      }
    } else {
      // Idle repair: keep ramparts healthy, then fix other damaged structures.
      // Ramparts below 20k are priority — they're our armor layer.
      const repairTarget =
        this.find(FIND_MY_STRUCTURES, {
          filter: s =>
            s.structureType === STRUCTURE_RAMPART &&
            s.hits < 20000
        }).sort((a, b) => a.hits - b.hits)[0]
        ||
        this.find(FIND_MY_STRUCTURES, {
          filter: s =>
            s.hits < s.hitsMax * 0.5 &&
            s.structureType !== STRUCTURE_WALL &&
            s.structureType !== STRUCTURE_RAMPART
        }).sort((a, b) => a.hits - b.hits)[0];

      if (repairTarget) {
        for (const tower of snap.towers) {
          tower.repair(repairTarget);
        }
      }
    }
  }

  // --- Planners ---
  if (plan.buildExtensions) {
    this.planExtensions();
  }

  if (plan.buildControllerContainer) {
    this.planControllerContainer();
  }

  if (plan.buildRoads) {
    this.planRoads();
  }

  if (plan.buildRamparts) {
    this.planRamparts();
  }

  if (plan.buildTower) {
    this.planTower();
  }

  // --- Job Publishing ---
  if (plan.publishHarvest) {
    JobBoard.publishHarvestJobs(this);
  }

  if (plan.publishBuild) {
    JobBoard.publishBuildJobs(this);
  }

  if (plan.publishUpgrade) {
    JobBoard.publishUpgradeJobs(this);
  }

  if (plan.publishRepair) {
    JobBoard.publishRepairJobs(this);
  }

  if (plan.publishDefense) {
    JobBoard.publishDefenseJobs(this);
  }

  SpawnDirector.run(this);
};