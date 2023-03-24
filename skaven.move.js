let sMove = {

  // have our rat move to a location
  moveTo: (rat, target, stroke) => {
    let options = { noPathFinding: false, visualizePathStyle: { stroke: stroke } }
    let path = sMove.memorizePath(rat, target);
    let res = rat.moveByPath(path, options)
    if (res === ERR_NOT_FOUND) {
      rat.memory.path = null;
    }
  },

  // Compute a path to target, and store that path in the rats memory so we don't recalculate it every time
  memorizePath: (rat, target) => {
    if (!rat.memory.path || rat.memory.path.target !== target.id) {
      const path = rat.room.findPath(rat.pos, target.pos, {
        ignoreCreeps: true,
        maxRooms: 1,
      });
      rat.memory.path = {
        target: target.id,
        path: path //.map((step) => ({x: step.x, y: step.y})),
      };
    }
    return rat.memory.path.path;
  },

}
module.exports = sMove;
