Room.prototype.observe = function () {
  this._snapshot = {
    rcl:              this.controller ? this.controller.level : 0,
    energyAvailable:  this.energyAvailable,
    energyCapacity:   this.energyCapacityAvailable,
    sources:          this.find(FIND_SOURCES),
    structures:       this.find(FIND_MY_STRUCTURES),
    constructionSites: this.find(FIND_MY_CONSTRUCTION_SITES),
    hostiles:         this.find(FIND_HOSTILE_CREEPS),
    towers:           this.find(FIND_MY_STRUCTURES, {
      filter: s => s.structureType === STRUCTURE_TOWER
    }),
    spawns:           this.find(FIND_MY_SPAWNS),
    safeMode: this.controller ? {
      active:    !!this.controller.safeMode,
      available: this.controller.safeModeAvailable,
      cooldown:  this.controller.safeModeCooldown || 0
    } : null
  };
};