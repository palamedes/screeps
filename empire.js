/**
 * empire.js
 *
 * Global tick. Multi-room coordination.
 *
 * Current responsibilities:
 *   - Watch for "Claim" flags placed by the player
 *   - When a Claim flag is found in a room we have vision of and own,
 *     trigger spawn site placement via plan.spawn.js
 *   - Remove the flag once the spawn site is placed (it's done its job)
 *
 * How to use:
 *   1. Find a room you want to settle
 *   2. Place a flag named exactly "Claim" anywhere in that room
 *   3. Walk away — the code scores the room and places the spawn site
 *   4. The flag is removed automatically once the site is placed
 *
 * Note: At this stage you still need to manually claim the controller
 * and seed one creep to build the spawn site. That's the Grey Seer's
 * job in Layer 3. For now the flag is your only manual act.
 *
 * Future responsibilities (Layer 3+):
 *   - Multi-room coordination
 *   - Expansion planning and Grey Seer dispatch
 *   - Global threat level tracking
 *   - CPU profiling
 */

require('plan.spawn');

global.Empire = {

  tick() {
    if (!Memory.empire) {
      Memory.empire = {};
    }

    this.watchClaimFlags();
  },

  /**
   * Check for "Claim" flags. When found in a visible, owned room with no
   * spawn and no spawn site, trigger spawn placement and remove the flag.
   *
   * The flag can be placed anywhere in the room — placement position is
   * ignored. plan.spawn.js scores the entire room independently.
   */
  watchClaimFlags() {
    const claimFlags = Object.values(Game.flags).filter(f => f.name === 'Claim');

    for (const flag of claimFlags) {
      const room = flag.room;

      // No vision of the room yet — wait
      if (!room) continue;

      // Room not owned yet — wait for manual controller claim
      // (Grey Seer will handle this automatically in Layer 3)
      if (!room.controller || !room.controller.my) continue;

      // Spawn already exists — flag is stale, clean it up
      const hasSpawn = room.find(FIND_MY_SPAWNS).length > 0;
      if (hasSpawn) {
        flag.remove();
        continue;
      }

      // Spawn site already placed — flag is stale, clean it up
      const hasSpawnSite = room.find(FIND_MY_CONSTRUCTION_SITES, {
        filter: s => s.structureType === STRUCTURE_SPAWN
      }).length > 0;

      if (hasSpawnSite) {
        flag.remove();
        continue;
      }

      // All conditions met — place the spawn site
      console.log(`[empire] Claim flag detected in ${room.name} — placing spawn site`);
      room.planSpawn();

      // Check if placement succeeded before removing flag
      const sitePlaced = room.find(FIND_MY_CONSTRUCTION_SITES, {
        filter: s => s.structureType === STRUCTURE_SPAWN
      }).length > 0;

      if (sitePlaced) {
        flag.remove();
        console.log(`[empire] Claim flag removed from ${room.name}`);
      } else {
        console.log(`[empire] spawn placement failed in ${room.name} — flag retained, will retry`);
      }
    }
  }

};