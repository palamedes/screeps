const skavenActions = require('skaven.actions');
const utility = require('utility');
/** Skaven! These are your harvester and builders */
var roleSkaven = {

  skitter: rat => {
    let skaven = _.filter(Game.creeps, (rat) => rat.memory.role === 'skaven');
    let constructionTargets = rat.room.find(FIND_CONSTRUCTION_SITES);
    let repairTargets = skavenActions.repair.getRepairTargets(rat);
    let upgradeTarget = rat.room.controller;

    // Determine what we should be doing...
    if (rat.memory.task === null) {
      if (rat.store.getFreeCapacity() === 0) {
        if (constructionTargets.length > 0 && skaven.length >= 5 && skavenActions.numActive('build') <= 5) {
          rat.memory.task = 'build';
          rat.say('🚧Build');
        }
        else if (repairTargets.length > 0 && skaven.length >= 5 && skavenActions.numActive('repair') <= 2) {
          rat.say('🔧Repair');
          rat.memory.task = 'repair';
        }
        else if (upgradeTarget && skaven.length >= 8 && skavenActions.numActive('upgrade') <= 4) {
          rat.memory.task = 'upgrade';
          rat.say('🔧Upgrade');
        }
        else {
          rat.memory.task = 'store';
          rat.say('⚡Store');
        }
      } else {
        rat.memory.task = 'harvest';
        rat.memory.myTargetId = null;
        rat.say('⛏️Harvest');
      }
    }

    // Okay rat... Do something..
    skavenActions.skitter(rat);
  },

  // If skaven get's in a weird state, reset it.. (wipe it's memory and let it figure it out)
  reset: (rat, task) => {
    rat.say('💤');
    rat.memory.myTargetId = null;
    rat.memory.task = task;
    rat.memory.slept++;
  },

  // Spawn us a rat ~ Standard Skaven worker rat
  summonRat: (energySize, memory) => {
    let ratName = 'Skaven-' + Game.time;
    let ratParts = [WORK, CARRY, MOVE, MOVE, MOVE];
    let ratBrain = { memory: { role: 'skaven', slept: 0, attempted: 0, ...memory } };
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
