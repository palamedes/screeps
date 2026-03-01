/**
 * rat.thrall.js
 *
 * Thrall behavior — picks up dropped energy and delivers it to consumers.
 * Thralls are bound servants of the warren: no fighting, no building, pure transport.
 * They have no WORK parts. They only move energy around.
 *
 * Pickup priority:   tombstones → ruins → dropped pile (largest first) → source containers
 *
 * Delivery priority:
 *   1. Spawn
 *   2. Controller container EMPTY — warlock is idle without this. Beats tower top-up.
 *   3. Tower emergency (<50%)
 *   4. Extensions
 *   5. Towers (normal top-up)
 *   6. Controller container (normal top-up)
 *
 * COMMITTED DELIVERY + GATHER:
 *   Once a thrall selects a target (delivery or gather) it commits to it via
 *   memory.deliveryTarget / memory.gatherTarget. Priority selection only runs
 *   when there is no committed target, or when the committed target is invalid.
 *
 *   Committed targets store their priority level (memory.deliveryPriority).
 *   A lower-priority commitment CAN be overridden if spawn (P1) suddenly needs
 *   energy — spawn is the only override allowed mid-trip. Everything else
 *   completes before re-evaluating. This prevents the thrash where a thrall
 *   heading to the controller container (P6) ignores a hungry spawn, but also
 *   prevents the controller container from being skipped forever because it
 *   always has free capacity.
 *
 * TOWER EMERGENCY THRESHOLD: 50%.
 *
 * All movement routed through Traffic.requestMove — no direct moveTo calls.
 */

const Traffic = require('traffic');

const CONTROLLER_CONTAINER_RANGE = 3; // must match plan.container.controller.js
const TOWER_EMERGENCY_THRESHOLD  = 0.5;

Creep.prototype.runThrall = function () {

  const spawn = this.room.find(FIND_MY_SPAWNS)[0];

  const controllerContainer = this.room.find(FIND_STRUCTURES, {
    filter: s =>
      s.structureType === STRUCTURE_CONTAINER &&
      s.pos.inRangeTo(this.room.controller, CONTROLLER_CONTAINER_RANGE)
  })[0];

  // ─────────────────────────────────────────────── State Toggle ──

  if (!this.memory.delivering && this.store.getFreeCapacity() === 0) {
    this.memory.delivering   = true;
    this.memory.gatherTarget = null; // clear gather commitment on full
  }

  if (this.store[RESOURCE_ENERGY] === 0) {
    this.memory.delivering     = false;
    this.memory.deliveryTarget   = null; // clear delivery commitment on empty
    this.memory.deliveryPriority = null;
  }

  // Full but not yet delivering — check if anything actually needs energy
  if (!this.memory.delivering && this.store.getFreeCapacity() === 0) {
    const needsEnergy =
      (spawn && spawn.store.getFreeCapacity(RESOURCE_ENERGY) > 0) ||
      this.room.find(FIND_MY_STRUCTURES, {
        filter: s =>
          (s.structureType === STRUCTURE_EXTENSION ||
            s.structureType === STRUCTURE_TOWER) &&
          s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
      }).length > 0;

    if (needsEnergy) {
      this.memory.delivering = true;
    }
  }

  // ─────────────────────────────────────────────── Delivery Phase ──

  if (this.memory.delivering) {

    // Committed target — honor an in-progress delivery.
    // Exception: if spawn (P1) needs energy and we're committed to something
    // lower priority, override immediately. Spawn is the warren's heartbeat —
    // nothing else matters if the spawn can't fire.
    if (this.memory.deliveryTarget) {
      const committed         = Game.getObjectById(this.memory.deliveryTarget);
      const committedPriority = this.memory.deliveryPriority || 99;

      // Spawn override: if committed to P2+ and spawn needs energy, pivot now
      const spawnHungry = spawn && spawn.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
      if (committedPriority > 1 && spawnHungry) {
        this.memory.deliveryTarget   = null;
        this.memory.deliveryPriority = null;
        // fall through to priority selection
      } else if (committed && committed.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
        // Still valid — complete the delivery
        if (this.transfer(committed, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
          Traffic.requestMove(this, committed);
        }
        return;
      } else {
        // Gone or full — clear and re-evaluate
        this.memory.deliveryTarget   = null;
        this.memory.deliveryPriority = null;
      }
    }

    // ── Priority selection (only runs without a committed target) ──

    const _commit = (target, priority) => {
      this.memory.deliveryTarget   = target.id;
      this.memory.deliveryPriority = priority;
      if (this.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        Traffic.requestMove(this, target);
      }
    };

    // P1: Spawn
    if (spawn && spawn.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
      _commit(spawn, 1);
      return;
    }

    // P2: Controller container EMPTY
    // Warlock is idle every tick this is empty — higher ROI than tower top-up.
    if (controllerContainer &&
      controllerContainer.store[RESOURCE_ENERGY] === 0 &&
      controllerContainer.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
      _commit(controllerContainer, 2);
      return;
    }

    // P3: Tower emergency (<50%)
    const emergencyTowers = this.room.find(FIND_MY_STRUCTURES, {
      filter: s =>
        s.structureType === STRUCTURE_TOWER &&
        s.store[RESOURCE_ENERGY] / s.store.getCapacity(RESOURCE_ENERGY) < TOWER_EMERGENCY_THRESHOLD
    });

    if (emergencyTowers.length > 0) {
      _commit(this.pos.findClosestByRange(emergencyTowers), 3);
      return;
    }

    // P4: Extensions
    const extensions = this.room.find(FIND_MY_STRUCTURES, {
      filter: s =>
        s.structureType === STRUCTURE_EXTENSION &&
        s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    });

    if (extensions.length > 0) {
      _commit(this.pos.findClosestByRange(extensions), 4);
      return;
    }

    // P5: Towers (normal top-up)
    const towers = this.room.find(FIND_MY_STRUCTURES, {
      filter: s =>
        s.structureType === STRUCTURE_TOWER &&
        s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    });

    if (towers.length > 0) {
      _commit(this.pos.findClosestByRange(towers), 5);
      return;
    }

    // P6: Controller container (normal top-up)
    // Fills when below 50%, or below 80% with no warlock actively draining it.
    // Note: we do NOT commit this to memory — it re-evaluates every cycle so
    // higher priorities can reclaim thralls as needs change. The container is
    // large and always has free capacity, so a committed target would stick
    // forever and block spawn/extensions from getting served next cycle.
    if (controllerContainer) {
      const energyPct = controllerContainer.store[RESOURCE_ENERGY] /
        controllerContainer.store.getCapacity(RESOURCE_ENERGY);

      const warlock = this.room.find(FIND_MY_CREEPS, {
        filter: c => c.memory.role === 'warlock'
      })[0];

      const warlockActive = warlock &&
        warlock.pos.getRangeTo(controllerContainer) <= 1 &&
        warlock.store[RESOURCE_ENERGY] < warlock.store.getCapacity(RESOURCE_ENERGY);

      const shouldFill = energyPct < 0.5 || (energyPct < 0.8 && !warlockActive);

      if (shouldFill && controllerContainer.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
        // No memory commit — re-evaluate next cycle
        if (this.transfer(controllerContainer, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
          Traffic.requestMove(this, controllerContainer);
        }
        return;
      }
    }

    // Everything satisfied — return to gathering
    this.memory.delivering     = false;
    this.memory.deliveryTarget   = null;
    this.memory.deliveryPriority = null;
    return;
  }

  // ─────────────────────────────────────────────── Gathering Phase ──

  // Committed gather target — keep pulling from the same source until
  // it's empty or we're full. Prevents oscillation between two containers
  // that are close in fill level.
  if (this.memory.gatherTarget) {
    const committed = Game.getObjectById(this.memory.gatherTarget);

    const hasEnergy = committed && (
      committed.store  ? committed.store[RESOURCE_ENERGY] > 0  :  // containers, tombstones, ruins
        committed.amount ? committed.amount > 0 : false               // dropped resources
    );

    if (hasEnergy) {
      const result = committed.store
        ? this.withdraw(committed, RESOURCE_ENERGY)
        : this.pickup(committed);

      if (result === ERR_NOT_IN_RANGE) {
        Traffic.requestMove(this, committed);
      }
      return;
    }

    // Gone or empty — clear and fall through to selection
    this.memory.gatherTarget = null;
  }

  // ── Gather source selection (only runs without a committed target) ──

  const _commitGather = (target) => {
    this.memory.gatherTarget = target.id;
  };

  // Tombstones first — free energy, recover losses
  const tombstone = this.room.find(FIND_TOMBSTONES, {
    filter: t => t.store[RESOURCE_ENERGY] > 0
  })[0];

  if (tombstone) {
    _commitGather(tombstone);
    if (this.withdraw(tombstone, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
      Traffic.requestMove(this, tombstone);
    }
    return;
  }

  // Ruins
  const ruin = this.room.find(FIND_RUINS, {
    filter: r => r.store[RESOURCE_ENERGY] > 0
  })[0];

  if (ruin) {
    _commitGather(ruin);
    if (this.withdraw(ruin, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
      Traffic.requestMove(this, ruin);
    }
    return;
  }

  // Largest dropped pile — decays if not collected
  const dropped = this.room.find(FIND_DROPPED_RESOURCES, {
    filter: r => {
      if (r.resourceType !== RESOURCE_ENERGY) return false;
      if (r.amount < 50) return false;
      const dist = this.pos.getRangeTo(r);
      return dist === 0 || (r.amount / dist) >= 2;
    }
  }).sort((a, b) => b.amount - a.amount)[0];

  if (dropped) {
    _commitGather(dropped);
    if (this.pickup(dropped) === ERR_NOT_IN_RANGE) {
      Traffic.requestMove(this, dropped);
    }
    return;
  }

  // Source containers — steady-state buffer, no decay.
  const sources = this.room.find(FIND_SOURCES);
  const sourceContainers = this.room.find(FIND_STRUCTURES, {
    filter: s =>
      s.structureType === STRUCTURE_CONTAINER &&
      sources.some(src => s.pos.inRangeTo(src, 2)) &&
      s.store[RESOURCE_ENERGY] > 0
  });

  if (sourceContainers.length > 0) {
    // Pick once and commit — don't re-sort every tick
    sourceContainers.sort((a, b) => {
      const aFill = a.store[RESOURCE_ENERGY] / a.store.getCapacity(RESOURCE_ENERGY);
      const bFill = b.store[RESOURCE_ENERGY] / b.store.getCapacity(RESOURCE_ENERGY);
      if (Math.abs(aFill - bFill) > 0.2) return bFill - aFill;
      return this.pos.getRangeTo(a) - this.pos.getRangeTo(b);
    });

    const container = sourceContainers[0];
    _commitGather(container);
    if (this.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
      Traffic.requestMove(this, container);
    }
    return;
  }

  // Nothing to pick up — wait near closest source
  if (sources.length) {
    Traffic.requestMove(this, this.pos.findClosestByRange(sources), { range: 2 });
  }
};