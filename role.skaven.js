/** Skaven! These are your harvester and builders */
let roleSkaven = {

  skitter: rat => {
    // If we have no energy, go find some
    if (rat.store[RESOURCE_ENERGY] === 0 && rat.memory.activity !== 'harvest') {
      rat.memory.myTargetId = null;
      rat.memory.activity = 'harvest';
      rat.say('⛏️Harvest');
    }
    // If we have energy, go use it.
    if (rat.store.getFreeCapacity() === 0 && rat.memory.activity === 'harvest') {

      let construction_targets = rat.room.find(FIND_CONSTRUCTION_SITES);
      let repair_targets = rat.room.find(FIND_STRUCTURES, {
        filter: (structure) => {
          return (structure.structureType === STRUCTURE_WALL || structure.structureType === STRUCTURE_RAMPART) && structure.hits < structure.hitsMax;
        }
      });

      // If there are sites to be built, do that.
      if(construction_targets.length > 0) {
        rat.memory.activity = 'build';
        rat.say('🚧 Build');
      }

        // @TODO add upgrading so we know how to go upgrade something


        // else if (repair_targets.length > 0) {
        //     rat.memory.activity = 'repair';
        //     rat.say('🔧Repair');
      // }
      else {
        rat.memory.activity = 'store';
        rat.say('⚡Store');
      }
    }

    if(rat.memory.activity === 'harvest')    { roleSkaven.harvest(rat); }
    if(rat.memory.activity === 'build')      { roleSkaven.build(rat); }
    // if(rat.memory.activity == 'repair')     { roleSkaven.repair(rat); }
    if(rat.memory.activity === 'store')      { roleSkaven.store(rat); }
  },

  // If skaven get's in a weird state, reset it.. (wipe it's memory and let it figure it out)
  reset: (rat, activity) => {
    rat.say('💤');
    rat.memory.myTargetId = null;
    rat.memory.activity = activity;
    rat.memory.slept++;
  },

  // Spawn us a rat!
  summonRat: (role, energySize, memory) => {
    let ratRole = ['skaven', 'upgrader'].includes(role) ? role : 'skaven';
    let ratName = ratRole + Game.time;
    let ratParts = [WORK, CARRY, MOVE, MOVE, MOVE];
    let ratBrain = { memory: { role: ratRole, slept: 0, attempted: 0, ...memory } };

    // @TODO Change this to summon differently based on ratRole
    if (energySize >= 350 && energySize < 400) { ratParts.push(CARRY);
    } else if (energySize >= 400 && energySize < 450) { ratParts.push(WORK);
    } else if (energySize >= 450 && energySize < 500) { ratParts.push(...[WORK, CARRY]);
    } else if (energySize >= 500 && energySize < 550) { ratParts.push(...[WORK, CARRY, MOVE]);
    } else if (energySize >= 550 && energySize < 600) { ratParts.push(...[WORK, CARRY, CARRY, MOVE]);
    }
    Game.spawns["Toiletduck's Nest"].spawnCreep(ratParts, ratName, ratBrain);
  },

  // Get a dynamic number of body parts based on the power available
  getSkavenBodyParts: size => {
    return [WORK, CARRY, MOVE, MOVE, MOVE];
  },

  // Harvest energy from sources, ruins, tombstones, and dropped resources
  harvest: rat => {
    // let roomBounds = Game.rooms[creep.room.name].getBounds();
    let harvestTargets = rat.room.find(FIND_SOURCES);

    // var ruins = creep.room.find(FIND_RUINS, {
    //     filter: (ruin) => ruin.store.getUsedCapacity(RESOURCE_ENERGY) > 0
    // });
    // var tombstones = rat.room.find(FIND_TOMBSTONES, {
    //     filter: (tombstone) => tombstone.store.getUsedCapacity(RESOURCE_ENERGY) > 0
    // });
    // var droppedEnergy = rat.room.find(FIND_DROPPED_RESOURCES, {
    //     filter: (dropped) => dropped.resourceType == RESOURCE_ENERGY
    // });

    // If the creep doesn't know where to go..
    if(!rat.memory.myTargetId) {
      var closestTarget = rat.pos.findClosestByRange(harvestTargets);
      if(closestTarget) {
        rat.memory.myTargetId = closestTarget.id;
      }
    }

    var target = Game.getObjectById(rat.memory.myTargetId);
    if(target) {
      if(rat.harvest(target) === ERR_NOT_IN_RANGE) {
        rat.moveTo(target, { visualizePathStyle: {stroke: '#ffaa00'} });
      }
    }
  },

  // Go store the energy
  store: rat => {
    var targets = rat.room.find(FIND_STRUCTURES, {
      filter: (structure) => {
        return (structure.structureType === STRUCTURE_EXTENSION ||
                structure.structureType === STRUCTURE_SPAWN ||
                structure.structureType === STRUCTURE_TOWER) &&
                structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
      }
    });
    if(targets.length > 0) {
      var target = rat.pos.findClosestByRange(targets);
      if(rat.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        rat.moveTo(target, {visualizePathStyle: {stroke: '#aaffff'}});
      }
    } else {
      roleSkaven.reset(rat, 'build');
    }
  },

  // Go find something to build and go build it, if there is nothing or we have finished building something, reset.
  build: rat => {
    var targets = rat.room.find(FIND_CONSTRUCTION_SITES);
    if(targets.length > 0) {
      if(rat.build(targets[0]) === ERR_NOT_IN_RANGE) {
        rat.moveTo(targets[0], {visualizePathStyle: {stroke: '#ffffff'}});
      }
    } else {
      roleSkaven.reset(rat, 'store');
    }

  },

  // Go find something to repair
  repair: rat => {
    let repairTargets = rat.room.find(FIND_STRUCTURES, {
      filter: (structure) => {
        return (structure.structureType === STRUCTURE_WALL || structure.structureType === STRUCTURE_RAMPART) && structure.hits < structure.hitsMax;
      }
    });
    if (repair_targets.length > 0) {
      let closestTarget = rat.pos.findClosestByRange(repairTargets);
      if(closestTarget) {
        rat.memory.myTargetId = closestTarget.id;
      }

      var target = Game.getObjectById(rat.memory.myTargetId);
      if(target) {
        if(rat.repair(target) === ERR_NOT_IN_RANGE) {
          rat.moveTo(target, { visualizePathStyle: {stroke: '#ff0000'} });
        }
      }
    }
  }

}
module.exports = roleSkaven;