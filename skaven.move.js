let sMove = {

  // have our rat move to a location
  moveTo: (rat, target, stroke) => {
    let options = { noPathFinding: true, visualizePathStyle: { stroke: stroke } }
    let path = sMove.memorizePath(rat, target);
    let res = rat.moveByPath(path, options)
    console.log(res);
    if (res === ERR_NOT_FOUND) {
      rat.memory.path = null;
    }
  },

  // Compute a path to target, and store that path in the rats memory so we don't recalculate it every time
  memorizePath: (rat, target) => {
    if (!rat.memory.path || rat.memory.myTargetId !== target.id) {
      rat.memory.path = rat.room.findPath(rat.pos, target.pos, {
        ignoreCreeps: false,
        maxRooms: 1,
      });
    }
    return rat.memory.path.path;
  },

}
module.exports = sMove;
