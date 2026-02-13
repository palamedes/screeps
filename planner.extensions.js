const Utils = require('planner.utils');
const Scoring = require('planner.scoring');

Room.prototype.planExtensions = function () {
  const spawn = this.find(FIND_MY_SPAWNS)[0];
  if (!spawn || !this.controller) return;

  // Only expand when we have economic surplus
  const energyRatio =
    this.energyAvailable / this.energyCapacityAvailable;
  if (energyRatio < 0.7) return;

  const existing = this.find(FIND_MY_STRUCTURES, {
    filter: s => s.structureType === STRUCTURE_EXTENSION
  });

  const sites = this.find(FIND_MY_CONSTRUCTION_SITES, {
    filter: s => s.structureType === STRUCTURE_EXTENSION
  });

  const total = existing.length + sites.length;

  const max =
    CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][this.controller.level] || 0;

  if (total >= max) return;

  const candidates = Utils.getBuildableTiles(this, spawn.pos, 8);

  const scored = candidates.map(tile => ({
    x: tile.x,
    y: tile.y,
    score: Scoring.scoreExtensionTile(this, tile, spawn)
  }));

  const sorted = _.sortBy(scored, t => -t.score);

  for (const tile of sorted) {
    if (this.createConstructionSite(tile.x, tile.y, STRUCTURE_EXTENSION) === OK) {
      break;
    }
  }
};
