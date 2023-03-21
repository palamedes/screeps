const sHarvest  = require('skaven.harvest');
const sBuild    = require('skaven.build');
const sStore    = require('skaven.store');
const sRepair   = require('skaven.repair');

let skavenActions = {
  harvest:  sHarvest,
  build:    sBuild,
  store:    sStore,
  repair:   sRepair,

  skitter: rat => {
    if (rat.memory.activity === 'harvest')  { skavenActions.harvest.using(rat); }
    if (rat.memory.activity === 'build')    { skavenActions.build.using(rat); }
    if (rat.memory.activity === 'repair')   { skavenActions.repair.using(rat); }
    if (rat.memory.activity === 'store')    { skavenActions.store.using(rat); }
  }
};

module.exports = skavenActions;
