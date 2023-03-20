const sHarvest = require('skaven.harvest');
const sBuild = require('skaven.build');
const sStore = require('skaven.store');
const sRepair = require('skaven.repair');

let skavenActions = {
  harvest: sHarvest,
  build: sBuild,
  store: sStore,
  repair: sRepair
};

module.exports = skavenActions;
