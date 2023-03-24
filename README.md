# Screeps - Skaven

Skitter-skitter, hear-hear! The Skaven have entered the Screeps universe, and we will rule-rule with a mighty claw-paw! The Screeps shall learn-know the power of the Skaven, for we are the mighty-strongest and most smart-cunning race in all the realms.

With the guidance of the Great Grey Seer Thanquol and the blessing of the Great Horned Rat, we have secured our future with powerful brain-codes that make us unbeatable-unbeatable! We will take-seize everything we set our eyes on, and our enemies shall cringe-cringe in terror at the might of the Skaven Empire.

No one will stand-stand against us, for we are the Skaven! Our armies will swarm-swarm over the Screeps like a horde of rats, leaving nothing behind but the destruction of our foes. Tremble-tremble, for the Skaven Empire has come to claim-take its rightful place as the leader-rulers of this universe!

### In all seriousness

This is a place for me to learn how to play screeps and I thought it would be amusing to do so as my favorite Warhammer Fantasy race; The Skaven.  Know-fear us!  

I am leaving this repo completely open and letting everyone see how I'm doing things.  I figure I don't know anything and someone might be able to point out stupid mistakes or ways to improve things.  You're welcome to take-steal any of the code you see here in but if you do make improvements please let me know so I can learn.  Thanks!

### Features
- Dynamic creep creation based on power levels
- Slaves are Creeps that know how to Harvest, Store, Upgrade, Repair and Renew
- Rat Ogres are Creeps with high physical damage & Toughness @TODO
- Gutter Runners are Creeps with high toughness, fast, with some ranged and physical attack @TODO
- Jezzails are Creeps with high ranged attack attack @TODO
- Towers know how to Attack, Heal and Repair

#### TODO
- Add ability to "specialize" skaven to only do certain things and build them as such
  - If we have just 2 rats running around, they are slaves that do all the things
  - The 3rd rat becomes a hauler only.  And one of the first 2 needs to just harvest and drop energy
  - Eventually body parts can be dynamically altered through new rats to do specific jobs. etc.. 
- Get dynamic creation of extensions working via createConstructionSite
- Put pathfinding in the rats head to lessen the demand on the cpu
  - Make rats use roads if there is a road path available
- Make Max Slaves dynamic based on max power and the possible body part size?
- Turn on RoomBinding for rats so they stay in the room they are assigned to
- Make the system allow for multiple rooms and spawn points (right now it's one room only)
- Figure out how to be smart about ranging into other rooms
- If a rat gets done with a task and has more than 50% power, go store it first.
  - this means I need to refactor the sleep/think/reset code somewhere..
- Create "base buildling" code that plans out a base and slowly builds it over time.

#### Known Bugs
- Right now if not careful rats will stack up at a power source and clog the area.  This is why I think I need to go to a harvest and drop model so no one is trapped.
- The road creation methodology is a little zealous.. so much so I have commented it out.. cause dang.. 