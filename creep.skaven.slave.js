Creep.prototype.skaven = {slave: {}}
Creep.prototype.skaven.slave.sayHello = function() {
    console.log('Foobar', (this instanceof Creep));
}

// Skitter!  Run the slave
Creep.prototype.skaven.slave.skitter = function() {
    if (this.getTask() === 'harvest')         { this.harvestTask(); }
    if (this.getTask() === 'store')           { if (!this.storeTask())   { this.sleep(); } }
    if (this.getTask() === 'storeUntilEmpty') { this.storeTask(); }
    if (this.getTask() === 'renew')           { if (!this.renewTask())   { this.sleep(); } }
    if (this.getTask() === 'upgrade')         { if (!this.upgradeTask()) { this.sleep(); } }
    if (this.getTask() === 'build')           { if (!this.buildTask())   { this.sleep(); } }
    if (this.getTask() === 'repair')          { if (!this.repairTask())  { this.sleep(); } }
}
