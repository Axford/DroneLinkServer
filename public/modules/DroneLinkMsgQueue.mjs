/*

Manages a transmission queue of DroneLinkMsg

 * ensures no two messages of same signature are in the queue (by overwrite)

*/


import * as DLM from './droneLinkMsg.mjs';

export default class DroneLinkMsgQueue {
  constructor() {
    this.queue = [];
  }

  add(msg) {
    var found =false;
    for (var i=0; i<this.queue.length; i++) {
      if (this.queue[i].sameSignature(msg)) {
        // update message in queue
        this.queue[i].copy(msg);
        return;
      }
    }
    this.queue.push(msg);
  }

  length() {
    return this.queue.length;
  }

  shift() {
    return this.queue.shift();
  }

  process(socket) {
    if (this.queue.length > 0) {
      var msg = this.queue.shift();
      console.log('emit ['+this.queue.length+']', msg.asString());
      socket.emit('sendMsg', msg.encodeUnframed());
    }
  }

}
