
import CRC8 from './CRC.mjs';
const crc8 = CRC8();

import * as DMM from './DroneMeshMsg.mjs';


const NETWORK_INTERFACE_MAX_TX_QUEUE    = 8;

const NETWORK_INTERFACE_HELLO_INTERVAL  = 5000;
const NETWORK_INTERFACE_SEQ_INTERVAL    = 30000;


export default class NetworkInterface {

  constructor(dlm, id) {
    this.id = id;
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
      // we dont want the server to be used for routing, so set a high source metric
      if (this.generateHello(this.dlm.node, this.helloSeq, 20, Date.now() - this.dlm.bootTime)) {
        var loopTime = Date.now();
        if (loopTime > this.seqTimer + NETWORK_INTERFACE_SEQ_INTERVAL) {
          this.helloSeq++;
          this.seqTimer = loopTime;
        }
      }
    }
  }


  generateHello(src, seq, metric, uptime) {
    if (!this.state) return;

    var msg = this.getTransmitBuffer();

    if (msg) {
      // populate hello packet
      msg.modeGuaranteeSize = DMM.DRONE_MESH_MSG_MODE_MULTICAST | DMM.DRONE_MESH_MSG_NOT_GUARANTEED | (5-1) ;  // payload is 1 byte... sent as n-1
      msg.txNode = this.dlm.node;
      msg.srcNode = src;
      msg.nextNode = 0;
      msg.destNode = 0;
      msg.seq = seq;
      msg.typeDir = DMM.DRONE_MESH_MSG_TYPE_HELLO | DMM.DRONE_MESH_MSG_REQUEST;
      msg.metric = metric;
      msg.uint8_tPayload[0] = 0;
      // little endian byte order
      msg.uint8_tPayload[4] = (uptime >> 24) & 0xFF;
      msg.uint8_tPayload[3] = (uptime >> 16) & 0xFF;
      msg.uint8_tPayload[2] = (uptime >> 8) & 0xFF;
      msg.uint8_tPayload[1] = (uptime ) & 0xFF;

      return true;
    }

    return false;
  }


  generateSubscriptionRequest(src, next, dest, channel, param) {
    if (!this.state) return;

    var msg = this.getTransmitBuffer();

    if (msg) {
      // populate with a subscription request packet
      msg.modeGuaranteeSize = DMM.DRONE_MESH_MSG_MODE_UNICAST | DMM.DRONE_MESH_MSG_GUARANTEED | 1 ;  // payload is 2 byte... sent as n-1
      msg.txNode = src;
      msg.srcNode = this.dlm.node;
      msg.nextNode = next;
      msg.destNode = dest;
      msg.seq = 0;
      msg.typeDir = DMM.DRONE_MESH_MSG_TYPE_SUBSCRIPTION | DMM.DRONE_MESH_MSG_REQUEST;
      msg.metric = 0;

      // populate payload = channel, param
      msg.uint8_tPayload[0] = channel;
      msg.uint8_tPayload[1] = param;

      return true;
    }

    return false;
  }


  sendDroneLinkMessage(dlmMsg, nextHop) {
    if (!this.state) return;

    var msg = this.getTransmitBuffer();

    if (msg) {

      var payloadSize = dlmMsg.totalSize();


      // populate with a subscription request packet
      msg.modeGuaranteeSize = DMM.DRONE_MESH_MSG_MODE_UNICAST | DMM.DRONE_MESH_MSG_GUARANTEED | (payloadSize-1);  // payload is 2 byte... sent as n-1
      msg.txNode = this.dlm.node;
      msg.srcNode = this.dlm.node;
      msg.nextNode = nextHop;
      msg.destNode = dlmMsg.node;
      msg.seq = 0;
      msg.typeDir = DMM.DRONE_MESH_MSG_TYPE_DRONELINKMSG | DMM.DRONE_MESH_MSG_REQUEST;
      msg.metric = 0;

      // populate payload
      var buffer = dlmMsg.encodeUnframed();
      for (var i=0; i<payloadSize; i++) {
        msg.uint8_tPayload[i] = buffer[i];
      }

      console.log( ('  ' + msg.toString()).blue);

      return true;
    }

    return false;
  }


}
