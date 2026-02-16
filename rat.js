require('rat.clanrat');
require('rat.miner');
require('rat.thrall');
require('rat.slave');
require('rat.warlock');
require('rat.stormvermin');
require('rat.gutterrunner');
require('rat.jezzail');
require('rat.ratogre');

const Traffic  = require('traffic');
const JobBoard = require('job.board');

Creep.prototype.tick = function () {
  switch (this.memory.role) {
    case 'miner':        return this.runMiner();
    case 'thrall':       return this.runThrall();
    case 'clanrat':      return this.runClanrat();
    case 'worker':       return this.runClanrat(); // ← backward compat: promoted slaves
    case 'slave':        return this.runSlave();
    case 'warlock':      return this.runWarlock();
    case 'stormvermin':  return this.runStormvermin();
    case 'gutterrunner': return this.runGutterRunner();
    case 'jezzail':      return this.runJezzail();
    case 'ratogre':      return this.runRatOgre();
  }
};

Creep.prototype.findJob = function () {
  return JobBoard.assignJob(this);
};

Creep.prototype.runJob = function () {
  const job    = this.memory.job;
  const target = Game.getObjectById(job.targetId);

  if (!target) {
    this.memory.job = null;
    return;
  }

  switch (job.type) {
    case 'UPGRADE':
      if (this.upgradeController(target) === ERR_NOT_IN_RANGE) {
        Traffic.requestMove(this, target, { range: 3 });
      }
      break;

    case 'BUILD':
      if (this.build(target) === ERR_NOT_IN_RANGE) {
        Traffic.requestMove(this, target);
      }
      break;

    case 'REPAIR': {
      const result = this.repair(target);
      if (result === ERR_NOT_IN_RANGE) {
        Traffic.requestMove(this, target);
      } else if (result !== OK) {
        this.memory.job = null;
      }
      break;
    }
  }
};