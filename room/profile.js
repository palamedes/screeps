Room.prototype.profile = function () {
  if (this.memory.profile) return;

  const terrain = this.getTerrain();
  const sources = this.find(FIND_SOURCES);

  const sourceProfiles = sources.map(source => {
    let openSpots = 0;

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;

        const x = source.pos.x + dx;
        const y = source.pos.y + dy;

        if (terrain.get(x, y) !== TERRAIN_MASK_WALL) {
          openSpots++;
        }
      }
    }

    return { id: source.id, openSpots };
  });

  this.memory.profile = {
    sourceCount: sources.length,
    exitCount: this.find(FIND_EXIT).length,
    sources: sourceProfiles
  };
};
