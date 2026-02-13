require('job.board.publish');
require('job.board.scoring');
require('job.board.util');

const JobBoard = {

  _rooms: {},

  reset(roomName) {
    this._rooms[roomName] = [];
  },

  publish(roomName, job) {
    if (!this._rooms[roomName]) {
      this._rooms[roomName] = [];
    }

    this._rooms[roomName].push({
      type: job.type,
      targetId: job.targetId,
      priority: job.priority !== undefined ? job.priority : 0,
      slots: job.slots !== undefined ? job.slots : 1,
      assigned: []
    });
  },

  getJobs(roomName) {
    return this._rooms[roomName] || [];
  },

  assignJob(creep) {
    const jobs = this.getJobs(creep.room.name);
    if (!jobs.length) return null;

    let bestJob = null;
    let bestScore = -Infinity;

    for (const job of jobs) {

      if (job.assigned.length >= job.slots) continue;
      if (!this.canDo(creep, job)) continue;

      const target = Game.getObjectById(job.targetId);
      if (!target) continue;

      const distance = creep.pos.getRangeTo(target);
      const baseScore = this.score(job, distance);
      const roleWeight = this.rolePreference(creep, job);
      const score = baseScore + roleWeight;

      if (score > bestScore) {
        bestScore = score;
        bestJob = job;
      }
    }

    if (bestJob) {
      bestJob.assigned.push(creep.name);
      return bestJob;
    }

    return null;
  }

};

module.exports = JobBoard;
