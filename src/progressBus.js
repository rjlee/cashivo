const EventEmitter = require('events');
const progressBus = new EventEmitter();
// Allow unlimited listeners for concurrent jobs
progressBus.setMaxListeners(0);
module.exports = progressBus;
