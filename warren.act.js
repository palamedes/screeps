/**
 * warren.act.js
 *
 * Executes the plan produced by warren.decide.js.
 * This is the ONLY phase in the OODA loop where side effects occur.
 *
 * Tower logic runs independently of plan flags — it fires whenever towers
 * and hostiles are present, regardless of room state.
 *
 * TOWER REPAIR GUARD: Tower only runs discretionary repairs when above 50% energy.
 * A tower burning its last 29% on ramparts is a tower that can't defend when
 * something actually attacks. Attack always fires regardless of energy level.
 * Repair is discretionary and gates on energy > 50%.
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

// Tower must be above this energy fraction before spending on discretionary repair.
// Matches the thrall emergency threshold in rat.thrall.js — they cooperate to
// keep towers topped up before either side spends energy.
const TOWER_REPAIR_ENERGY_THRESHOLD = 0.5;

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
      // Attack ALWAYS fires regardless of tower energy — defense is sacred.
      // Focus fire on the lowest-HP hostile (kill one fast > chip many).
      const target = snap.hostiles.reduce((a, b) => a.hits < b.hits ? a : b);
      for (const tower of snap.towers) {
        tower.attack(target);
      }
    } else {
      // Idle repair: only run when tower has enough energy to be useful.
      // A tower at 30% spending on ramparts leaves nothing for a surprise attack
      // and will drain to zero faster than thralls can refill it.
      // Let thralls top the tower up first (they now have a 50% emergency threshold),
      // then repair once the tower is healthy.
      const towerEnergyOk = snap.towers.some(t =>
        t.store[RESOURCE_ENERGY] / t.store.getCapacity(RESOURCE_ENERGY) >= TOWER_REPAIR_ENERGY_THRESHOLD
      );

      if (towerEnergyOk) {
        // Tiered rampart repair: 20k → 75k → 250k floors.
        // Tower won't advance to next floor until every rampart clears the current one.
        // Within each floor: lowest HP first (triage the most exposed).
        const RAMPART_FLOORS = [20000, 75000, 250000];
        const allRamparts = this.find(FIND_MY_STRUCTURES, {
          filter: s => s.structureType === STRUCTURE_RAMPART
        });

        let rampartTarget = null;
        for (const floor of RAMPART_FLOORS) {
          const below = allRamparts
            .filter(s => s.hits < floor)
            .sort((a, b) => a.hits - b.hits);
          if (below.length > 0) {
            rampartTarget = below[0];
            break;
          }
        }

        const repairTarget =
          rampartTarget
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
  }

  // --- Planners ---
  if (plan.buildExtensions) {
    this.planExtensions();
  }

  if (plan.buildControllerContainer) {
    this.planControllerContainer();
  }

  if (plan.buildSourceContainers) {
    this.planSourceContainers();
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