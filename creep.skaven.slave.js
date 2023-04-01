console.log('creep.skaven.slave was required in')
Creep.prototype.skaven = { slave: {} }
Creep.prototype.skaven.slave.sayHello = function() {
    console.log('Foobar', (this instanceof Creep));
}