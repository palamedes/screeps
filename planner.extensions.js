const Scoring = require('planner.scoring');

Room.prototype.planExtensions = function () {

  const spawn = this.find(FIND_MY_SPAWNS)[0];
  if (!spawn) return;

  const existing = this.find(FIND_MY_STRUCTURES, {
    filter: s => s.structureType === STRUCTURE_EXTENSION
  });

  const sites = this.find(FIND_MY_CONSTRUCTION_SITES, {
    filter: s => s.structureType === STRUCTURE_EXTENSION
  });

  const total = existing.length + sites.length;

  const max = CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][this.controller.level];
  if (total >= max) return;

  const candidates = Scoring.getBuildableTiles(this, spawn.pos, 8);

  const scored = candidates.map(tile => ({
    ...tile,
    score: Scoring.scoreExtensionTile(this, tile, spawn)
  }));

  const sorted = _.sortBy(scored, t => -t.score);

  for (const tile of sorted) {
    if (this.createConstructionSite(tile.x, tile.y, STRUCTURE_EXTENSION) === OK) {
      break;
    }
  }
};
