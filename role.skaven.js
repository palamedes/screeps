const skavenActions = require('skaven.actions');
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
      // @TODO If we don't have enough rats, dont build.. just harvest and store
      if(construction_targets.length > 0) {
        rat.memory.activity = 'build';
        rat.say('🚧Build');
      }
      // else if (repair_targets.length > 0) {
      //     rat.memory.activity = 'repair';
      //     rat.say('🔧Repair');
      // }
      else {
        rat.memory.activity = 'store';
        rat.say('⚡Store');
      }
    }
    if(rat.memory.activity === 'harvest')    { skavenActions.harvest.using(rat); }
    if(rat.memory.activity === 'build')      { skavenActions.build.using(rat); }
    // if(rat.memory.activity == 'repair')     { roleSkaven.repair(rat); }
    if(rat.memory.activity === 'store')      { skavenActions.store.using(rat); }
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

}
module.exports = roleSkaven;
