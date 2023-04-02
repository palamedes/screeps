/** Creep.skaven extensions
 * The purpose of this file is to give us a place to put all of the comment methods that are specific to the "Skaven race"..
 * The idea being we might later implement other "races" of Creeps that do things very differently.
 * Think code optimization, and code "personality" in which different creeps can behave differently based on a common factor.
 * It also allows us to further namespace out code segements for caste members of each individual race.
 * Think Worker versus Attacker. etc...
 *
 * example:
 *   Creep.skaven.slave.{method}(); vs Creep.skaven.ogre.{method}(); vs Creep.human.explorer.{method}();
 * Could be the same method, but the slave would do it differently than the ogre.. etc.
 * The parent namespace runs all the children, where as the child runs all of that type.
 *
 * Note; When calling anything that isn't directly root to the Creep prototype we must bind "this";
 *   this.skaven.slave.shouldWeUpgrade.bind(this)();
 */

// This method iterates through all the different skaven type and runs them based on their role.
Creep.prototype.run = function(slaves) {
  // If we are a Skaven Slave, and we have been spawned...
  if (this.memory.role === 'slave' && !this.spawning) { this.skaven.slave.skitter.bind(this)(slaves); }
}


