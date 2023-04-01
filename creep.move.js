

// Have our rat move to a location using custom code
Creep.prototype.moveCreepTo = function(target, stroke) {
  this.moveTo(target, { visualizePathStyle: {stroke: '#ffaa00'}, reusePath: 4 });

  // let options = { noPathFinding: true, visualizePathStyle: { stroke: stroke } }
  // let path = sMove.memorizePath(rat, target);
  // let res = rat.moveByPath(path, options)
  // if (res === ERR_NOT_FOUND || res === ERR_INVALID_ARGS || (rat.memory.attempted + 3) > rat.memory.path.length) {
  //   rat.memory.path = null;
  //   rat.memory.attempted = 0;
  // }
}

Creep.prototype.moveCreepToXY = function(x, y, stroke) {

}

// Compute a path to target, and store that path in the rats memory so we don't recalculate it every time
Creep.prototype.memorizePath = function(target) {
  if (!this.memory.path || this.memory.myTargetId !== target.id) {
    this.memory.path = this.room.findPath(this.pos, target.pos, {
      ignoreCreeps: false,
      maxRooms: 1,
    });
  }
  return this.memory.path;
}
