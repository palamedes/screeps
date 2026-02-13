Room.prototype.planExtensions = function () {
  const extensions = this.find(FIND_MY_STRUCTURES, {
    filter: s => s.structureType === STRUCTURE_EXTENSION
  });

  const sites = this.find(FIND_MY_CONSTRUCTION_SITES, {
    filter: s => s.structureType === STRUCTURE_EXTENSION
  });

  const total = extensions.length + sites.length;
  if (total >= 5) return;

  const spawn = this.find(FIND_MY_SPAWNS)[0];
  if (!spawn) return;

  const x = spawn.pos.x + 1 + extensions.length;
  const y = spawn.pos.y;

  this.createConstructionSite(x, y, STRUCTURE_EXTENSION);
};
