Room.prototype.observe = function () {
  this._snapshot = {
    rcl: this.controller ? this.controller.level : 0,
    energyAvailable: this.energyAvailable,
    energyCapacity: this.energyCapacityAvailable,
    sources: this.find(FIND_SOURCES),
    structures: this.find(FIND_MY_STRUCTURES),
    constructionSites: this.find(FIND_MY_CONSTRUCTION_SITES),
    hostiles: this.find(FIND_HOSTILE_CREEPS),
  };
};
