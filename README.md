# Screeps - Skaven

Skitter-skitter, hear-hear! The Skaven have entered the Screeps universe, and we will rule-rule with a mighty claw-paw! The Screeps shall learn-know the power of the Skaven, for we are the mighty-strongest and most smart-cunning race in all the realms.

With the guidance of the Great Grey Seer Thanquol and the blessing of the Great Horned Rat, we have secured our future with powerful brain-codes that make us unbeatable-unbeatable! We will take-seize everything we set our eyes on, and our enemies shall cringe-cringe in terror at the might of the Skaven Empire.

No one will stand-stand against us, for we are the Skaven! Our armies will swarm-swarm over the Screeps like a horde of rats, leaving nothing behind but the destruction of our foes. Tremble-tremble, for the Skaven Empire has come to claim-take its rightful place as the leader-rulers of this universe!

### In all seriousness

This is a place for me to learn how to play screeps and I thought it would be amusing to do so as my favorite Warhammer Fantasy race; The Skaven.  Know-fear us!  

### Features
- Dynamic creep creation based on power levels
- Slaves are Creeps that know how to Harvest, Store, Upgrade, Repair and Renew

#### TODO
- Add ability to "specialize" skaven to only do certain things and build them as such
- Get dynamic creation of extensions working via createConstructionSite
- Put pathfinding in the rats head to lessen the demand on the cpu
- Make Max Slaves dynamic based on max power and the possible body part size?
- Remove name of spawn entirely from system
- Rat should know where it spawned and always know how to get back to it
- Figure out how to harvest from gravestones and dropped energy (it's not working for me for some reason)
- Turn on RoomBinding for rats so they stay in the room they are assigned to
- Make the system allow for multiple rooms and spawn points (right now it's one room only)
- Create a better path finding system that considers roads
- Change system to know "skaven" as "slaves".  role.skaven should just be skaven. 
  - slaves = workers/builders/harvesters/repair
  - rat ogres = beefcake physical damage, slow brutes hardy
  - gutter runners = super fast ninja with some ranged
  - jezzail = high dps ranged
- Figure out how to be smart about ranging into other rooms
- If a rat gets done with a task and has more than 50% power, go store it first.
  - this means I need to refactor the sleep/think/reset code somewhere..