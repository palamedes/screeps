const sHarvest = require('skaven.harvest');
const sBuild = require('skaven.build');
const sStore = require('skaven.store');

let skavenActions = {
  harvest: sHarvest,
  build: sBuild,
  store: sStore
};

module.exports = skavenActions;
