Creep.prototype.runHauler = function () {

  if (this.store.getFreeCapacity() > 0) {
    const dropped = this.room.find(FIND_DROPPED_RESOURCES).sort((a, b) => b.amount - a.amount)[0];

    if (dropped) {
      if (this.pickup(dropped) === ERR_NOT_IN_RANGE) {
        this.moveTo(dropped);
      }
    }
    return;
  }

  const spawn = this.room.find(FIND_MY_SPAWNS)[0];

  if (spawn.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
    if (this.transfer(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
      this.moveTo(spawn);
    }
  }
};
