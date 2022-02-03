
import CRC8 from './CRC.mjs';
const crc8 = CRC8();

import * as DMM from './DroneMeshMsg.mjs';


const NETWORK_INTERFACE_MAX_TX_QUEUE    = 8;

const NETWORK_INTERFACE_HELLO_INTERVAL  = 5000;
const NETWORK_INTERFACE_SEQ_INTERVAL    = 30000;


export default class NetworkInterface {

  constructor(dlm) {
    this.dlm = dlm;
    this.state = false;
    this.helloSeq = 0;
    this.txQueue = [];  // collection of DroneMeshMsg, with additional state property
    this.helloTimer = 0;
    this.seqTimer = 0;

    // start process timer
    setInterval( ()=>{
      var loopTime = Date.now();

      if (loopTime > this.helloTimer + NETWORK_INTERFACE_HELLO_INTERVAL || this.helloTimer == 0) {
        this.genHello();
        this.helloTimer = loopTime;
      }

      this.processTransmitQueue();

    }, 10);
  }


  getTxQueueSize() {
    return this.txQueue.length;
  }


  getTransmitBuffer() {
    if (this.txQueue.length < NETWORK_INTERFACE_MAX_TX_QUEUE) {
      var msg = new DMM.DroneMeshMsg();
      this.txQueue.push(msg);
      //console.log(' txQueue size: ' + this.txQueue.length);
      return msg;
    }
    return null;
  }


  processTransmitQueue() {
    if (this.txQueue.length ==0 ) return;

    var msg = this.txQueue.shift();
    this.sendPacket(msg);
  }


  genHello() {
    console.log('gH');
    if (this.state) {
      if (this.generateHello(this.dlm.node, this.helloSeq, 0)) {
        var loopTime = Date.now();
        if (loopTime > this.seqTimer + NETWORK_INTERFACE_SEQ_INTERVAL) {
          this.helloSeq++;
          this.seqTimer = loopTime;
        }
      }
    }
  }


  generateHello(src, seq, metric) {
    if (!this.state) return;

    var msg = this.getTransmitBuffer();

    if (msg) {
      // populate hello packet
      msg.modeGuaranteeSize = DMM.DRONE_MESH_MSG_MODE_MULTICAST | DMM.DRONE_MESH_MSG_NOT_GUARANTEED | 0 ;  // payload is 1 byte... sent as n-1
      msg.txNode = this.dlm.node;
      msg.srcNode = src;
      msg.nextNode = 0;
      msg.destNode = 0;
      msg.seq = seq;
      msg.typeDir = DMM.DRONE_MESH_MSG_TYPE_HELLO | DMM.DRONE_MESH_MSG_REQUEST;
      msg.metric = metric;

      return true;
    }

    return false;
  }


}
