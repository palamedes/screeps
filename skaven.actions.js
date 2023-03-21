const sHarvest  = require('skaven.harvest');
const sBuild    = require('skaven.build');
const sStore    = require('skaven.store');
const sRepair   = require('skaven.repair');
const sUpgrade  = require('skaven.upgrade');

let skavenActions = {
  harvest:  sHarvest,
  build:    sBuild,
  store:    sStore,
  repair:   sRepair,
  upgrade:  sUpgrade,

  // What ever we have decided to do.. go do that.
  skitter: rat => {
    if (rat.memory.task === 'harvest')  { skavenActions.harvest.using(rat); }
    if (rat.memory.task === 'build')    { skavenActions.build.using(rat); }
    if (rat.memory.task === 'repair')   { skavenActions.repair.using(rat); }
    if (rat.memory.task === 'upgrade')  { skavenActions.upgrade.using(rat); }
    if (rat.memory.task === 'store')    { skavenActions.store.using(rat); }
  },
  // Number of rats actively doing a give task
  numActive: task => {
    return _.filter(Game.creeps, rat => rat.memory.task === task).length;
  }

};

module.exports = skavenActions;
