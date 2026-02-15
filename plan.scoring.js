const PlanScoring = {

  /**
   * Score a candidate tile for extension placement.
   *
   * THE OLD BUG: `nearbyExtensions * 4` was a runaway feedback loop.
   * Once any cluster started, adjacent tiles scored +4 per neighbor,
   * overwhelming the distance term. Extensions greedily filled every gap
   * until they formed a solid impassable wall with no corridors.
   *
   * THE FIX: Replace the clustering bonus with a passability guard.
   * A tile is only valid if at least 2 of its 4 cardinal neighbors remain
   * open after placement. This prevents dead-ends and sealed corridors.
   *
   * Scoring factors (in priority order):
   *   1. HARD REJECT — spawn adjacency (dist ≤ 1)
   *   2. HARD REJECT — fewer than 2 open cardinal neighbors after placement
   *      (would create a movement dead-end; creeps get trapped)
   *   3. Prefer tiles close to spawn  (+10 − dist)
   *   4. Slight bias toward more open neighbors  (+openCardinals)
   *      This discourages filling the last gap in a dense cluster.
   *
   * Rule 2 means extensions will naturally grow in a ring/shell pattern
   * with passable corridors preserved rather than a sealed block.
   */
  scoreExtensionTile(room, tile, spawn) {
    const terrain = room.getTerrain();
    const dist    = spawn.pos.getRangeTo(tile.x, tile.y);

    // Hard reject: never block spawn's immediate neighbors
    if (dist <= 1) return -Infinity;

    // --- Passability guard ---
    // Count cardinal neighbors that are still walkable and unblocked.
    // We are evaluating the tile AS IF we had already placed the extension,
    // so we only count neighbors — the candidate tile itself is not checked.
    const cardinals = [
      { dx:  0, dy: -1 },
      { dx:  0, dy:  1 },
      { dx:  1, dy:  0 },
      { dx: -1, dy:  0 }
    ];

    let openCardinals = 0;

    for (const { dx, dy } of cardinals) {
      const nx = tile.x + dx;
      const ny = tile.y + dy;

      // Out-of-bounds tiles don't count as open
      if (nx < 1 || nx > 48 || ny < 1 || ny > 48) continue;

      // Terrain walls don't count as open
      if (terrain.get(nx, ny) === TERRAIN_MASK_WALL) continue;

      // Check for blocking structures already built
      const structures = room.lookForAt(LOOK_STRUCTURES, nx, ny);
      const siteBlocked = room.lookForAt(LOOK_CONSTRUCTION_SITES, nx, ny);

      // Roads, containers, and ramparts are passable — everything else blocks
      const isBlocked =
        structures.some(s =>
          s.structureType !== STRUCTURE_ROAD      &&
          s.structureType !== STRUCTURE_CONTAINER &&
          s.structureType !== STRUCTURE_RAMPART
        ) ||
        siteBlocked.some(s =>
          s.structureType !== STRUCTURE_ROAD      &&
          s.structureType !== STRUCTURE_CONTAINER &&
          s.structureType !== STRUCTURE_RAMPART
        );

      if (!isBlocked) openCardinals++;
    }

    // Hard reject: placing here would create a movement dead-end.
    // Creeps need at least 2 open cardinal directions to maneuver.
    // 0 open = completely walled in.
    // 1 open = cul-de-sac that traps any creep that enters.
    if (openCardinals < 2) return -Infinity;

    let score = 0;

    // Prefer tiles closer to spawn — shorter hauler round-trips
    score += (10 - dist);

    // Slight preference for tiles with more open neighbors.
    // At equal distance, a tile with 4 open cardinals (isolated) scores
    // higher than one with 2 (last gap in a cluster). This naturally
    // produces a ring/shell pattern rather than a dense blob.
    score += openCardinals;

    return score;
  }

};

module.exports = PlanScoring;