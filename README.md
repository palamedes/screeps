# Screeps - Skaven

Skitter-skitter, hear-hear! The Skaven have entered the Screeps universe, and we will rule-rule with a mighty claw-paw! The Screeps shall learn-know the power of the Skaven, for we are the mighty-strongest and most smart-cunning race in all the realms.

With the guidance of the Great Grey Seer Thanquol and the blessing of the Great Horned Rat, we have secured our future with powerful brain-codes that make us unbeatable-unbeatable! We will take-seize everything we set our eyes on, and our enemies shall cringe-cringe in terror at the might of the Skaven Empire.

No one will stand-stand against us, for we are the Skaven! Our armies will swarm-swarm over the Screeps like a horde of rats, leaving nothing behind but the destruction of our foes. Tremble-tremble, for the Skaven Empire has come to claim-take its rightful place as the leader-rulers of this universe!

### In all seriousness

This is a place for me to learn how to play screeps and I thought it would be amusing to do so as my favorite Warhammer Fantasy race; The Skaven.  Know-fear us!  

I am leaving this repo completely open and letting everyone see how I'm doing things.  I figure I don't know anything and someone might be able to point out stupid mistakes or ways to improve things.  You're welcome to take-steal any of the code you see here in but if you do make improvements please let me know so I can learn.  Thanks!

### Features
- Dynamic creep creation based on power levels
- Slaves are Creeps that know how to Harvest, Store, Upgrade, Repair and Renew.  They are also dynamically smart in that they will change their behavior based on the number of harvest suckle points. 
- Rat Ogres are Creeps with high physical damage & Toughness @TODO
- Gutter Runners are Creeps with high toughness, fast, with some ranged and physical attack @TODO
- Jezzails are Creeps with high ranged attack attack @TODO
- Towers know how to Attack, Heal and Repair

#### TODO
- Only build the number of creeps we need initially
- Fix build order.  We don't need to build storage immediately. Create a build order system?
- FIX RENEWS COUNT somethings up there... 
- When a Hauler goes to pick up energy at a source, if there is no road.. track that and maybe add a road?
- Make hauler transfer from ruins and enemy creep tomb stones ALL things.. not just energy
- Add "homeRoom" to rat memory and "currentRoom" and get roomBound working
  - Turn on RoomBinding for rats so they stay in the room they are assigned to
- Set what the controller level was at the time a slave is spawned, such that later if we go up in controller level we allow that slave to die off and generate a new better one.  Think, version numbers.  This prevents ups from renewing old janky creeps.
- If there is no energy available in the room, range to another room
  - If that room is dangerous, add it to the danger list until we can deal with the danger
- Get dynamic creation of extensions working via createConstructionSite
- Put pathfinding in the rats head to lessen the demand on the cpu
  - Make rats use roads if there is a road path available
- Make Max Slaves dynamic based on max power and the possible body part size?
- Make the system allow for multiple rooms and spawn points (right now it's one room only)
- Figure out how to be smart about ranging into other rooms
- If a rat gets done with a task and has more than 50% power, go store it first.
  - this means I need to refactor the sleep/think/reset code somewhere..

#### New Room Thoughts
- Find exits
- Send scout creep (all moves and one claim) to each room to see if there is anything in the room
- 

#### Known Bugs
- Right now if not careful rats will stack up at a power source and clog the area.  This is why I think I need to go to a harvest and drop model so no one is trapped.
- The road creation methodology is a little zealous.. so much so I have commented it out.. cause dang.. 

For technical architecture and developer documentation, see [architecture/ARCHITECTURE.md](architecture/ARCHITECTURE.md).