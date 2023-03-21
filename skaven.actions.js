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

  skitter: rat => {
    if (rat.memory.activity === 'harvest')  { skavenActions.harvest.using(rat); }
    if (rat.memory.activity === 'build')    { skavenActions.build.using(rat); }
    if (rat.memory.activity === 'repair')   { skavenActions.repair.using(rat); }
    if (rat.memory.activity === 'upgrade')  { skavenActions.upgrade.using(rat); }
    if (rat.memory.activity === 'store')    { skavenActions.store.using(rat); }
  }
};

module.exports = skavenActions;
