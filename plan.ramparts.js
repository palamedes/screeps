/**
 * plan.ramparts.js
 *
 * Places rampart construction sites over critical structures.
 * A rampart on top of a structure makes it unkillable until the rampart
 * is destroyed first — even a 1-HP rampart protects the structure underneath.
 *
 * Placement priority:
 *   1. Spawn tile   — most critical. Losing spawn = game over.
 *   2. Tower tile(s) — protecting the tower protects our defense.
 *
 * One rampart site at a time — consistent with all other planners.
 * No energy ratio guard — defense placement is always worth it.
 * The build cost (1 energy for the site) is negligible.
 *
 * Called by: warren.act.js (when plan.buildRamparts is true)
 * Reads:     room structures, construction sites
 * Writes:    one rampart construction site (at most)
 */

Room.prototype.planRamparts = function () {
  if (!this.controller) return;

  const spawn = this.find(FIND_MY_SPAWNS)[0];
  if (!spawn) return;

  // One rampart site at a time — wait for it to complete before placing the next.
  const existingSites = this.find(FIND_MY_CONSTRUCTION_SITES, {
    filter: s => s.structureType === STRUCTURE_RAMPART
  });
  if (existingSites.length > 0) return;

  // Helper: returns true if a built rampart already exists at this tile.
  const hasRampart = (x, y) =>
    this.lookForAt(LOOK_STRUCTURES, x, y)
      .some(s => s.structureType === STRUCTURE_RAMPART);

  // Priority 1: Rampart on spawn tile.
  // A rampart directly on the spawn means attackers must chew through it
  // before the spawn takes a single point of damage.
  if (!hasRampart(spawn.pos.x, spawn.pos.y)) {
    const result = this.createConstructionSite(
      spawn.pos.x, spawn.pos.y, STRUCTURE_RAMPART
    );
    if (result === OK) {
      console.log(
        `[warren:${this.name}] rampart site placed on spawn at ${spawn.pos.x},${spawn.pos.y}`
      );
      return;
    }
  }

  // Priority 2: Rampart on each tower tile.
  // A protected tower keeps shooting even while under heavy attack.
  const towers = this.find(FIND_MY_STRUCTURES, {
    filter: s => s.structureType === STRUCTURE_TOWER
  });

  for (const tower of towers) {
    if (!hasRampart(tower.pos.x, tower.pos.y)) {
      const result = this.createConstructionSite(
        tower.pos.x, tower.pos.y, STRUCTURE_RAMPART
      );
      if (result === OK) {
        console.log(
          `[warren:${this.name}] rampart site placed on tower at ${tower.pos.x},${tower.pos.y}`
        );
        return;
      }
    }
  }
};