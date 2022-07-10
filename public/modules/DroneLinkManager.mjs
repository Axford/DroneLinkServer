
/*

Equivalent to DroneLinkManager firmware class.
Manages the mesh network link over local network interfaces (routing table, etc)

*/

import * as DLM from './droneLinkMsg.mjs';
import * as DMM from './DroneMeshMsg.mjs';
import * as DMRE from './DroneMeshRouteEntry.mjs';
import * as DMR from './DroneMeshRouter.mjs';
import * as DMTB from './DroneMeshTxBuffer.mjs';
import * as DMFS from './DroneMeshFS.mjs';
import DroneLinkMeshMsgSequencer from './DroneLinkMeshMsgSequencer.mjs';
import fs from 'fs';


const DRONE_LINK_MANAGER_MAX_ROUTE_AGE = 60000;

const SUB_STATE_PENDING = 0;
const SUB_STATE_REQUESTED = 1;
const SUB_STATE_CONFIRMED = 2;

const DRONE_LINK_MANAGER_MAX_TX_QUEUE    = 32;

const DRONE_LINK_MANAGER_HELLO_INTERVAL  = 5000;
const DRONE_LINK_MANAGER_SEQ_INTERVAL    = 30000;

const DRONE_LINK_MANAGER_MAX_RETRY_INTERVAL   =2000;
const DRONE_LINK_MANAGER_MAX_RETRIES          =10;
const DRONE_LINK_MANAGER_MAX_ACK_INTERVAL     =250;

const DRONE_LINK_MANAGER_LINK_CHECK_INTERVAL  = 2000;

const DRONE_LINK_MANAGER_AVG_SAMPLES          = 16;

function constrain(v, minv, maxv) {
  return Math.max(Math.min(v, maxv), minv);
}


function getFilesizeInBytes(filename) {
    var stats = fs.statSync(filename);
    var fileSizeInBytes = stats.size;
    return fileSizeInBytes;
}

export default class DroneLinkManager {

  constructor(node, clog) {
    this.node = node;
    this.clog = clog;

    this.routeMap = {};

    this.interfaces = [];

    this.bootTime = Date.now();

    this.helloSeq = 0;
    this.txQueue = [];  // collection of DroneMeshTxBuffers
    this.helloTimer = 0;
    this.seqTimer = 0;
    this.gSeq = 0;

    this.choked = 0;
    this.kicked = 0;
    this.kickRate = 0;
    this.chokeRate = 0;

    this.firmwareNodes = {};
    this.firmwarePos = 0;
    this.firmwareSize = 0;
    this.firmwarePath = '';
    this.firmwareSending = false;
    this.firmwarePacketsSent = 0;
    this.firmwareRewinds = 0;
    this.firmwareLastRewinds = 0;
    this.firmwareTransmitRate = 100;  // packets per second
    this.firmwareLastTransmitted = 0;
    this.firmwareRewindTimer = 0;
    this.rewindRate = 0;

    this.logOptions = {
      Hello:true,
      DroneLinkMsg: true,
      RouteEntry: true,
      Transmit: true,
      Subscription: true,
      Router: true,
      Traceroute: true,
      LinkCheck: true,
      FS: true
    };

    this.logFilePath = '';
    this.logToFile = false;
    this.logStream = null;

    this.clog('DroneLinkManager started');

    // slow process timer
    setInterval( ()=>{
      try {
        this.checkForOldRoutes();
        this.checkDirectLinks();
        this.updateSubscriptions();
      } catch (err) {
        this.clog('ERROR: ' + err);
      }
    }, 1000);

    // transmit timer
    setInterval( ()=>{
      try {
        this.processTransmitQueue();
      } catch (err) {
        this.clog('ERROR: ' + err);
      }

    }, 1);

    // hello Timer
    setInterval( ()=>{
      try {
        this.generateHellos();
      } catch (err) {
        this.clog('ERROR: ' + err);
      }
    }, DRONE_LINK_MANAGER_HELLO_INTERVAL);

    // firmware transmission, max 1000 per second
    setInterval( ()=>{
      this.transmitFirmware();
    }, 1);
  }


  setLogToFile(nv) {
    if (nv) {
      // delete existing log file
      fs.statSync(this.logFilePath, function (err, stats) {

       if (err) {
         clog('ERROR deleting log file: '+err);
       }

       fs.unlinkSync(this.logFilePath,function(err){
          if(err) clog('ERROR deleting log file: '+err);
          clog('log file deleted successfully'.green);
       });
      });

      // open file
      this.logStream = fs.createWriteStream(this.logFilePath, {flags:'a'});
    } else {
      // close file
      if (this.logStream) {
        this.logStream.end();
        this.logStream = null;
      }
    }

    this.logToFile = nv;
  }


  getTxQueueSize() {
    return this.txQueue.length;
  }


  getTransmitBuffer(ni, priority) {
    var buffer = null;
    var isKicked = false;
    var isChoked = false;

    // see if we have an empty transmit buffer than can be used
    for (var i=0; i<this.txQueue.length; i++) {
      var b = this.txQueue[i];
      if (b.state == DMTB.DRONE_MESH_MSG_BUFFER_STATE_EMPTY) {
        buffer = b;
        break;
      }
    }

    // if none available, see if we have space to create one
    if (!buffer && this.txQueue.length < DRONE_LINK_MANAGER_MAX_TX_QUEUE) {
      var buffer = new DMTB.DroneMeshTxBuffer();
      this.txQueue.push(buffer);
    }

    // failing that, lets see if there's one of lower priority we can repurpose
    if (!buffer) {
      for (var i=0; i<this.txQueue.length; i++) {
        var b = this.txQueue[i];
        // if not an Ack and lower priority
        if (b.msg.getPriority() < priority &&
            !b.msg.isAck()) {
          buffer = b;
          this.kicked++;
          isKicked = true;
          break;
        }
      }
    }


    if (buffer) {
      // update state
      buffer.state = DMTB.DRONE_MESH_MSG_BUFFER_STATE_READY;
      buffer.netInterface = ni;
      buffer.msg.netInterface = ni;
      buffer.created = Date.now();
      buffer.attempts = 0;
    } else {
      this.choked++;
      isChoked = true;
    }

    this.kickRate = (this.kickRate * 99 + (isKicked ? 1 : 0)) / 100;
    this.chokeRate = (this.chokeRate * 99 + (isChoked ? 1 : 0)) / 100;

    return buffer;
  }


  processTransmitQueue() {

    var loopTime = Date.now();

    // sort txQueue
    this.txQueue.sort((a, b) => {
      return a.created - b.created;
    } );


    // a negative return value means item a is sorted before b
    this.txQueue.sort( (a,b) => {
      // only need to sort non-empty packets
      if (a.state > DMM.DRONE_MESH_MSG_BUFFER_STATE_EMPTY && b.state > DMM.DRONE_MESH_MSG_BUFFER_STATE_EMPTY) {
        // send Acks before new packets
        var a1 = a.msg.isAck() ? 0 : 1;
        var b1 = b.msg.isAck() ? 0 : 1;
        if (a1 == 0 && b1 == 1) {
          return -1;
        } else if (a1 == 1 && b1 == 0) {
          return 1;
        } else {
          // send higher priority items first
          a1 = a.msg.getPriority();
          b1 = b.msg.getPriority();
          if (a1 != b1) {
            return b1 - a1;
          }
          // send older items first (FIFO)
          return a.created - b.created;
        }
      } else {
        if (a.state > DMM.DRONE_MESH_MSG_BUFFER_STATE_EMPTY) {
          return -1;
        } else if (b.state > DMM.DRONE_MESH_MSG_BUFFER_STATE_EMPTY) {
          return 1;
        }
      }
      return 0;
    } );


    // look through txQueue
    for (var i=0; i<this.txQueue.length; i++) {
      var b = this.txQueue[i];

      // check for packets ready to send
      if (b.state == DMTB.DRONE_MESH_MSG_BUFFER_STATE_READY) {
        // get nodeInfo for the nextHop... and thus the interfaceAddress
        // update stats
        var interfaceAddress = null;
        var nextNodeInfo = this.getNodeInfo(b.msg.nextNode, false);
        if (nextNodeInfo) {
          interfaceAddress = nextNodeInfo.interfaceAddress;
        }

        // send via appropriate interface
        if (b.netInterface &&
            b.netInterface.sendPacket(b.msg, interfaceAddress)) {
          if (this.logOptions.Transmit)
            this.clog(('Send by '+b.netInterface.typeName+': ' + b.msg.toString()).yellow);

          this.packetsSent++;

          // if this is guaranteed, then flag to wait for a reply
          if (!b.msg.isAck() &&
              b.msg.isGuaranteed()) {
            b.state = DMTB.DRONE_MESH_MSG_BUFFER_STATE_WAITING;
            b.sent = loopTime;
          } else {
            // otherwise set to empty
            b.state = DMTB.DRONE_MESH_MSG_BUFFER_STATE_EMPTY;
            if (nextNodeInfo) {
              nextNodeInfo.avgTxTime = (nextNodeInfo.avgTxTime * 49 + (loopTime - b.created)) / 50;
            }
          }

          // just the one Mrs Wemberley
          return;
        } else {
          this.clog('send fail'.red);
          // send failed, see how long we've been trying for
          if (loopTime > b.created + DRONE_LINK_MANAGER_MAX_RETRY_INTERVAL) {

            // update stats on nextNode
            var nextNodeInfo = this.getNodeInfo(b.msg.nextNode, false);
            if (nextNodeInfo) {
              nextNodeInfo.avgAttempts = (nextNodeInfo.avgAttempts * (DRONE_LINK_MANAGER_AVG_SAMPLES-1) + b.attempts) / DRONE_LINK_MANAGER_AVG_SAMPLES;
              nextNodeInfo.givenUp++;
            }

            // give up and release the buffer
            b.state = DMTB.DRONE_MESH_MSG_BUFFER_STATE_EMPTY;
          }
        }
      } else if (b.state == DMTB.DRONE_MESH_MSG_BUFFER_STATE_WAITING) {
        // or things that have been waiting too long
        if (loopTime > b.sent + DRONE_LINK_MANAGER_MAX_ACK_INTERVAL) {

          //increment the attempts counter
          b.attempts++;
          if (b.attempts >= DRONE_LINK_MANAGER_MAX_RETRIES) {
            // give up and release the buffer
            b.state = DMTB.DRONE_MESH_MSG_BUFFER_STATE_EMPTY;

            // update stats on nextNode
            var nextNodeInfo = this.getNodeInfo(b.msg.nextNode, false);
            if (nextNodeInfo) {
              nextNodeInfo.avgAttempts = (nextNodeInfo.avgAttempts * (DRONE_LINK_MANAGER_AVG_SAMPLES-1) + b.attempts) / DRONE_LINK_MANAGER_AVG_SAMPLES;
              nextNodeInfo.givenUp++;
            }
          } else {
            // reset to ready to trigger retransmission
            b.state = DMTB.DRONE_MESH_MSG_BUFFER_STATE_READY;

            // TODO - check/update route?
          }
        }
      }
    }
  }


  generateHellos() {
    //this.clog('gH');
    var loopTime = Date.now();

    // generate a hello for each active interface
    for (var i=0; i<this.interfaces.length; i++) {
      var ni = this.interfaces[i];

      if (ni.state) {
        this.generateHello(ni, this.node, this.helloSeq, 0, loopTime - this.bootTime);
      } else {
        if (this.logOptions.Hello)
          this.clog(('Cant generate hello - interface down: ' + ni.typeName).yellow);
      }
    }

    // generate a new hello seq number every now and again
    if (loopTime > this.seqTimer + DRONE_LINK_MANAGER_SEQ_INTERVAL) {
      this.helloSeq++;
      this.seqTimer = loopTime;
    }
  }


  generateHello(ni, src, seq, metric, uptime) {
    var buffer = this.getTransmitBuffer(ni, DMM.DRONE_MESH_MSG_PRIORITY_CRITICAL);

    if (buffer) {
      var msg = buffer.msg;
      this.clog('generating hello on interface: ' + ni.typeName);
      // populate hello packet
      msg.typeGuaranteeSize =  DMM.DRONE_MESH_MSG_NOT_GUARANTEED | (5-1) ;  // payload is 1 byte... sent as n-1
      msg.txNode = this.node;
      msg.srcNode = src;
      msg.nextNode = 0;
      msg.destNode = 0;
      msg.seq = seq;
      msg.setPriorityAndType(DMM.DRONE_MESH_MSG_PRIORITY_CRITICAL, DMM.DRONE_MESH_MSG_TYPE_HELLO);
      msg.uint8_tPayload[0] = metric;
      // little endian byte order
      msg.uint8_tPayload[4] = (uptime >> 24) & 0xFF;
      msg.uint8_tPayload[3] = (uptime >> 16) & 0xFF;
      msg.uint8_tPayload[2] = (uptime >> 8) & 0xFF;
      msg.uint8_tPayload[1] = (uptime ) & 0xFF;

      return true;
    }

    return false;
  }


  generateSubscriptionRequest(ni, src, next, dest, channel, param) {
    var buffer = this.getTransmitBuffer(ni, DMM.DRONE_MESH_MSG_PRIORITY_MEDIUM);

    if (buffer) {
      var msg = buffer.msg;
      // populate with a subscription request packet
      msg.typeGuaranteeSize = DMM.DRONE_MESH_MSG_GUARANTEED | 1 ;  // payload is 2 byte... sent as n-1
      msg.txNode = src;
      msg.srcNode = this.node;
      msg.nextNode = next;
      msg.destNode = dest;
      msg.seq = 0;
      msg.setPriorityAndType(DMM.DRONE_MESH_MSG_PRIORITY_HIGH, DMM.DRONE_MESH_MSG_TYPE_SUBSCRIPTION_REQUEST);

      // populate payload = channel, param
      msg.uint8_tPayload[0] = channel;
      msg.uint8_tPayload[1] = param;

      return true;
    }

    return false;
  }


  generateRouteEntryRequest(ni, target, subject, nextHop) {
    var buffer = this.getTransmitBuffer(ni, DMM.DRONE_MESH_MSG_PRIORITY_HIGH);

    if (buffer) {
      var msg = buffer.msg;
      if (this.logOptions.RouteEntry)
        this.clog(('generateRouteEntryRequest for '+target+', '+subject));
      // populate with a subscription request packet
      msg.typeGuaranteeSize = DMM.DRONE_MESH_MSG_GUARANTEED | 10;  // payload is 1 byte... sent as n-1
      msg.txNode = this.node;
      msg.srcNode = this.node;
      msg.nextNode = nextHop;
      msg.destNode = target;
      msg.seq = 0;
      msg.setPriorityAndType(DMM.DRONE_MESH_MSG_PRIORITY_HIGH, DMM.DRONE_MESH_MSG_TYPE_ROUTEENTRY_REQUEST);
      msg.metric = 0;

      // populate payload
      msg.uint8_tPayload[0] = subject;

      return true;
    }

    return false;
  }


  generateTracerouteRequestFor(target) {
    var nodeInfo = this.getNodeInfo(target, false);
    if (nodeInfo) {
      this.generateTracerouteRequest(nodeInfo.netInterface, target, nodeInfo.nextHop);
    }
  }


  generateTracerouteRequest(ni, target, nextHop) {
    var buffer = this.getTransmitBuffer(ni, DMM.DRONE_MESH_MSG_PRIORITY_HIGH);

    if (buffer) {
      var msg = buffer.msg;
      if (this.logOptions.Traceroute)
        this.clog(('generate Traceroute Request for '+target));

      // populate
      msg.typeGuaranteeSize = DMM.DRONE_MESH_MSG_GUARANTEED | 0;  // payload is 1 bytes... sent as n-1
      msg.txNode = this.node;
      msg.srcNode = this.node;
      msg.nextNode = nextHop;
      msg.destNode = target;
      msg.seq = this.gSeq;
      msg.setPriorityAndType(DMM.DRONE_MESH_MSG_PRIORITY_HIGH, DMM.DRONE_MESH_MSG_TYPE_TRACEROUTE_REQUEST);

      // padding
      msg.uint8_tPayload[0] = this.node;

      this.gSeq++;
      if (this.gSeq > 255) this.gSeq = 0;

      return true;
    }

    return false;
  }


  generateRouterRequestFor(target) {
    var nodeInfo = this.getNodeInfo(target, false);
    if (nodeInfo) {
      this.generateRouterRequest(nodeInfo.netInterface, target, nodeInfo.nextHop);
    }
  }


  generateRouterRequest(ni, target, nextHop) {
    var buffer = this.getTransmitBuffer(ni, DMM.DRONE_MESH_MSG_PRIORITY_HIGH);

    if (buffer) {
      var msg = buffer.msg;
      if (this.logOptions.Router)
        this.clog(('generateRouterRequest for '+target));

      // populate
      msg.typeGuaranteeSize = DMM.DRONE_MESH_MSG_GUARANTEED | (DMM.DRONE_MESH_MSG_HEADER_SIZE + DMR.DRONE_MESH_ROUTER_SIZE - 1);  // payload is 1 byte... sent as n-1
      msg.txNode = this.node;
      msg.srcNode = this.node;
      msg.nextNode = nextHop;
      msg.destNode = target;
      msg.seq = this.gSeq;
      msg.setPriorityAndType(DMM.DRONE_MESH_MSG_PRIORITY_HIGH, DMM.DRONE_MESH_MSG_TYPE_ROUTER_REQUEST);

      // padding
      msg.uint8_tPayload[0] = 0;

      this.gSeq++;
      if (this.gSeq > 255) this.gSeq = 0;

      return true;
    }

    return false;
  }


  generateLinkCheckRequest(ni, target, nextHop) {
    var buffer = this.getTransmitBuffer(ni, DMM.DRONE_MESH_MSG_PRIORITY_LOW);

    if (buffer) {
      var msg = buffer.msg;
      if (this.logOptions.LinkCheck)
        this.clog(('generate Link Check Request for '+target));

      // populate
      msg.typeGuaranteeSize = DMM.DRONE_MESH_MSG_GUARANTEED | 0;  // payload is 1 bytes... sent as n-1
      msg.txNode = this.node;
      msg.srcNode = this.node;
      msg.nextNode = nextHop;
      msg.destNode = target;
      msg.seq = this.gSeq;
      msg.setPriorityAndType(DMM.DRONE_MESH_MSG_PRIORITY_LOW, DMM.DRONE_MESH_MSG_TYPE_LINK_CHECK_REQUEST);

      // padding
      msg.uint8_tPayload[0] = 0;

      this.gSeq++;
      if (this.gSeq > 255) this.gSeq = 0;

      return true;
    }

    return false;
  }


  generateDroneLinkMessage(ni, dlmMsg, nextHop) {
    var p = DMM.DRONE_MESH_MSG_PRIORITY_MEDIUM;
    var g = DMM.DRONE_MESH_MSG_NOT_GUARANTEED;
    if (dlmMsg.msgType < DLM.DRONE_LINK_MSG_TYPE_NAME) {
      // we want stuff coming from teh server to take top priority
      //this.clog('high priority'.blue);
      p = DMM.DRONE_MESH_MSG_PRIORITY_CRITICAL;
      g = DMM.DRONE_MESH_MSG_GUARANTEED;
    }

    var buffer = this.getTransmitBuffer(ni, p);
    if (buffer) {
      var msg = buffer.msg;
      var payloadSize = dlmMsg.totalSize();

      // populate with a subscription request packet
      msg.typeGuaranteeSize = g | (payloadSize-1);  // payload is 2 byte... sent as n-1
      msg.txNode = this.node;
      msg.srcNode = this.node;
      msg.nextNode = nextHop;
      msg.destNode = dlmMsg.node;
      msg.seq = this.gSeq;
      msg.setPriorityAndType(p, DMM.DRONE_MESH_MSG_TYPE_DRONELINKMSG);

      this.gSeq++;
      if (this.gSeq > 255) this.gSeq = 0;

      // populate payload
      var buffer = dlmMsg.encodeUnframed();
      for (var i=0; i<payloadSize; i++) {
        msg.uint8_tPayload[i] = buffer[i];
      }

      if (this.logOptions.DroneLinkMsg)
        this.clog( ('  DLM: ' + msg.toString()));

      return true;
    }

    return false;
  }


  sendFSFileRequest(data) {
    // msg.node = target, msg.payload = DMFS request

    // hydrate payload
    data.payload = new DMFS.DroneMeshFSFileRequest(data.payload);

    this.clog('fs.file.request: '+data.node + '=> '+data.payload.toString());

    var nodeInfo = this.getNodeInfo(data.node, false);
    if (!nodeInfo) return;

    var p = DMM.DRONE_MESH_MSG_PRIORITY_CRITICAL;
    var g = DMM.DRONE_MESH_MSG_GUARANTEED;

    var buffer = this.getTransmitBuffer(nodeInfo.netInterface, p);
    if (buffer) {
      var msg = buffer.msg;
      var payloadSize = DMFS.DRONE_MESH_MSG_FS_FILE_REQUEST_SIZE;

      msg.typeGuaranteeSize = g | (payloadSize-1);
      msg.txNode = this.node;
      msg.srcNode = this.node;
      msg.nextNode = nodeInfo.nextHop;
      msg.destNode = data.node;
      msg.seq = this.gSeq;
      msg.setPriorityAndType(p, DMM.DRONE_MESH_MSG_TYPE_FS_FILE_REQUEST);

      this.gSeq++;
      if (this.gSeq > 255) this.gSeq = 0;

      // populate payload
      var buffer = data.payload.encode();
      for (var i=0; i<payloadSize; i++) {
        msg.uint8_tPayload[i] = buffer[i];
      }

      return true;
    }

    return false;
  }


  sendFSReadRequest(data) {
    // msg.node = target, msg.payload = DMFS request

    // hydrate payload
    data.payload = new DMFS.DroneMeshFSReadRequest(data.payload);

    this.clog('fs.read.request: '+data.node + '=> '+data.payload.toString());

    var nodeInfo = this.getNodeInfo(data.node, false);
    if (!nodeInfo) return;

    var p = DMM.DRONE_MESH_MSG_PRIORITY_CRITICAL;
    var g = DMM.DRONE_MESH_MSG_GUARANTEED;

    var buffer = this.getTransmitBuffer(nodeInfo.netInterface, p);
    if (buffer) {
      var msg = buffer.msg;
      var payloadSize = DMFS.DRONE_MESH_MSG_FS_READ_REQUEST_SIZE;

      msg.typeGuaranteeSize = g | (payloadSize-1);
      msg.txNode = this.node;
      msg.srcNode = this.node;
      msg.nextNode = nodeInfo.nextHop;
      msg.destNode = data.node;
      msg.seq = this.gSeq;
      msg.setPriorityAndType(p, DMM.DRONE_MESH_MSG_TYPE_FS_READ_REQUEST);

      this.gSeq++;
      if (this.gSeq > 255) this.gSeq = 0;

      // populate payload
      var buffer = data.payload.encode();
      for (var i=0; i<payloadSize; i++) {
        msg.uint8_tPayload[i] = buffer[i];
      }

      return true;
    }

    return false;
  }


  sendFSResizeRequest(data) {
    // msg.node = target, msg.payload = DMFS request

    // hydrate payload
    data.payload = new DMFS.DroneMeshFSResizeRequest(data.payload);

    this.clog('fs.resize.request: '+data.node + '=> '+data.payload.toString());

    var nodeInfo = this.getNodeInfo(data.node, false);
    if (!nodeInfo) return;

    var p = DMM.DRONE_MESH_MSG_PRIORITY_CRITICAL;
    var g = DMM.DRONE_MESH_MSG_GUARANTEED;

    var buffer = this.getTransmitBuffer(nodeInfo.netInterface, p);
    if (buffer) {
      var msg = buffer.msg;
      var payloadSize = DMFS.DRONE_MESH_MSG_FS_RESIZE_REQUEST_SIZE;

      msg.typeGuaranteeSize = g | (payloadSize-1);
      msg.txNode = this.node;
      msg.srcNode = this.node;
      msg.nextNode = nodeInfo.nextHop;
      msg.destNode = data.node;
      msg.seq = this.gSeq;
      msg.setPriorityAndType(p, DMM.DRONE_MESH_MSG_TYPE_FS_RESIZE_REQUEST);

      this.gSeq++;
      if (this.gSeq > 255) this.gSeq = 0;

      // populate payload
      var buffer = data.payload.encode();
      for (var i=0; i<payloadSize; i++) {
        msg.uint8_tPayload[i] = buffer[i];
      }

      return true;
    }

    return false;
  }


  sendFSWriteRequest(data) {
    // msg.node = target, msg.payload = DMFS request

    // hydrate payload
    data.payload = new DMFS.DroneMeshFSWriteRequest(data.payload);

    this.clog('fs.write.request: '+data.node + '=> '+data.payload.toString());

    var nodeInfo = this.getNodeInfo(data.node, false);
    if (!nodeInfo) return;

    var p = DMM.DRONE_MESH_MSG_PRIORITY_CRITICAL;
    var g = DMM.DRONE_MESH_MSG_GUARANTEED;

    var buffer = this.getTransmitBuffer(nodeInfo.netInterface, p);
    if (buffer) {
      var msg = buffer.msg;
      var payloadSize = DMFS.DRONE_MESH_MSG_FS_WRITE_REQUEST_SIZE;

      msg.typeGuaranteeSize = g | (payloadSize-1);
      msg.txNode = this.node;
      msg.srcNode = this.node;
      msg.nextNode = nodeInfo.nextHop;
      msg.destNode = data.node;
      msg.seq = this.gSeq;
      msg.setPriorityAndType(p, DMM.DRONE_MESH_MSG_TYPE_FS_WRITE_REQUEST);

      this.gSeq++;
      if (this.gSeq > 255) this.gSeq = 0;

      // populate payload
      var buffer = data.payload.encode();
      for (var i=0; i<payloadSize; i++) {
        msg.uint8_tPayload[i] = buffer[i];
      }

      return true;
    }

    return false;
  }


  getRoutesFor(target, subject) {
    if (this.logOptions.RouteEntry)
      this.clog(('getRoutesFor: '+ target +', '+ subject).yellow);

    // check for routes from ourself
    if (target == this.node) {
      // publish
      if (this.io &&
          this.routeMap[subject] &&
          this.routeMap[subject].heard)
          this.io.emit('route.update', this.routeMap[subject].encode());
      return;
    }

    var nodeInfo = this.getNodeInfo(target, false);
    if (nodeInfo && nodeInfo.heard) {
      var ni = nodeInfo.netInterface;
      if (ni) {
        this.generateRouteEntryRequest(ni, target, subject, nodeInfo.nextHop);
      }
    }
  }


  removeRoute(node) {
    var nodeInfo = this.getNodeInfo(node, false);
    if (nodeInfo) {
      nodeInfo.heard = false;
      if (nodeInfo.subState > SUB_STATE_PENDING) {
        // so a fresh sub is requested if this route becomes available again
        nodeInfo.subState = SUB_STATE_PENDING;
        nodeInfo.metric = 255;
      }

      if (this.io) this.io.emit('route.removed', nodeInfo.encode());
    }
  }


  checkForOldRoutes() {
    var loopTime = Date.now();
    for (const [node, nodeInfo] of Object.entries(this.routeMap)) {
      if (nodeInfo.heard && loopTime > nodeInfo.lastHeard + DRONE_LINK_MANAGER_MAX_ROUTE_AGE) {
        this.clog(('  Removing route to '+nodeInfo.node).orange);
        this.removeRoute(node);
      }
    }
  }


  checkDirectLinks() {
    var loopTime = Date.now();
    for (const [node, nodeInfo] of Object.entries(this.routeMap)) {
      // see if this is a directly connected
      if (loopTime < nodeInfo.lastHello + 10 * DRONE_LINK_MANAGER_HELLO_INTERVAL) {
        // see how long since we last had an Ack from this node?
        if (loopTime > nodeInfo.lastAck + DRONE_LINK_MANAGER_LINK_CHECK_INTERVAL) {
          if (nodeInfo.helloInterface) {
            this.generateLinkCheckRequest(nodeInfo.helloInterface, nodeInfo.node, nodeInfo.node);
            // update lastAck so we don't try again too soon... add a bit of randomisation to avoid synchronous link checks
            nodeInfo.lastAck = loopTime + Math.random()*100;
          }
        }
      } else {
        // taper off avgAttempts info ready for potential future connection?
        nodeInfo.avgAttempts *= 0.9;
      }
    }
  }



  updateSubscriptions() {
    var loopTime = Date.now();
    for (const [node, nodeInfo] of Object.entries(this.routeMap)) {
      if (nodeInfo.heard && (loopTime > nodeInfo.subTimer + 10000)) {
        var ni = nodeInfo.netInterface;
        if (this.logOptions.Subscription)
          this.clog(('  Refreshing sub to '+nodeInfo.node).yellow);
        if (ni && this.generateSubscriptionRequest(ni, this.node, nodeInfo.nextHop, nodeInfo.node, 0,0)) {
          //this.clog(('request sent').green);
          nodeInfo.subTimer = Date.now();
        }
      }
    }
  }


  registerInterface(netInterface) {
    this.interfaces.push(netInterface);
  }


  getInterfaceById(id) {
    for (var i=0; i<this.interfaces.length; i++) {
      if (this.interfaces[i].id == id) return this.interfaces[i];
    }
    return null;
  }


  getNodeInfo(node, heard) {
    // see if node already exists in routeMap
    var routeExists = (this.routeMap.hasOwnProperty(node));

    if (!routeExists && heard) {
      // create new route entry
      this.routeMap[node] = new DMRE.DroneMeshRouteEntry();

      var nodeInfo = this.routeMap[node];

      // set values and elaborate
      nodeInfo.src = this.node;
      nodeInfo.node = node;
      nodeInfo.heard = true;
      nodeInfo.lastBroadcst = 0;
      nodeInfo.subState = SUB_STATE_PENDING;
      nodeInfo.subTimer = 0;
      nodeInfo.uptime = 0;
      nodeInfo.avgAttempts = 0;
      nodeInfo.avgTxTime = 0;
      nodeInfo.avgActTime = 0;
      nodeInfo.givenUp = 0;
      nodeInfo.lastHello = 0;
      nodeInfo.helloInterface = null;
      nodeInfo.lastAck = 0;
      nodeInfo.gSequencer = new DroneLinkMeshMsgSequencer();

      routeExists = true;
    }

    if (routeExists) {
      nodeInfo = this.routeMap[node];
      if (heard) {
        if (!nodeInfo.heard) {
          nodeInfo.gSequencer.clear();
        }
        nodeInfo.lastHeard = Date.now();
        nodeInfo.heard = true;
      }
      return this.routeMap[node];
    }
    return null;
  }


  getMetricFromNodeInfo(nodeInfo) {
    var metric = 20;
    if (nodeInfo) {
      metric = Math.min(20, Math.ceil (2 * nodeInfo.avgAttempts + 0.1));
    }
    return constrain(metric, 1, 20);
  }


  receivePacket(netInterface, msg, metric, interfaceAddress) {
    try {

          // update lastHeard for tx node
          var txNodeInfo = this.getNodeInfo(msg.txNode, false);
          if (txNodeInfo && txNodeInfo.heard) {
            txNodeInfo.lastHeard = Date.now();
            txNodeInfo.interfaceAddress = interfaceAddress;
          }

          // log to file
          if (this.logToFile && this.logStream) {
            this.logStream.write(msg.encodeForLog());
          }

          if (msg.isAck()) {
            this.receiveAck(msg);

          } else {
            if (msg.isGuaranteed()) {
              this.generateAck(netInterface, msg);

              // check to see if we've already received this packet
              var srcNodeInfo = this.getNodeInfo(msg.srcNode, false);
              if (srcNodeInfo) {
                if (srcNodeInfo.gSequencer.isDuplicate(msg.seq)) {
                  this.clog(('SEEMS LIKE A DUP ' + msg.seq + ', ' + msg.toString()).red);
                  return;
                }
              }
            }


            // pass to appropriate receive handler
            switch (msg.getPayloadType()) {
              case DMM.DRONE_MESH_MSG_TYPE_HELLO: this.receiveHello(netInterface, msg, metric); break;

              case DMM.DRONE_MESH_MSG_TYPE_SUBSCRIPTION_RESPONSE: this.receiveSubscriptionResponse(netInterface, msg, metric); break;

              case DMM.DRONE_MESH_MSG_TYPE_DRONELINKMSG: this.receiveDroneLinkMsg(netInterface, msg, metric); break;

              case DMM.DRONE_MESH_MSG_TYPE_TRACEROUTE_RESPONSE: this.receiveTracerouteResponse(netInterface, msg, metric); break;

              case DMM.DRONE_MESH_MSG_TYPE_ROUTEENTRY_RESPONSE: this.receiveRouteEntryResponse(netInterface, msg, metric); break;

              case DMM.DRONE_MESH_MSG_TYPE_ROUTER_RESPONSE: this.receiveRouterResponse(netInterface, msg, metric); break;

              case DMM.DRONE_MESH_MSG_TYPE_LINK_CHECK_REQUEST: this.receiveLinkCheckRequest(netInterface, msg, metric); break;

              // filesystem
              case DMM.DRONE_MESH_MSG_TYPE_FS_FILE_RESPONSE: this.receiveFSFileResponse(netInterface, msg, metric); break;

              case DMM.DRONE_MESH_MSG_TYPE_FS_READ_RESPONSE: this.receiveFSReadResponse(netInterface, msg, metric); break;

              case DMM.DRONE_MESH_MSG_TYPE_FS_RESIZE_RESPONSE: this.receiveFSResizeResponse(netInterface, msg, metric); break;

              case DMM.DRONE_MESH_MSG_TYPE_FS_WRITE_RESPONSE: this.receiveFSWriteResponse(netInterface, msg, metric); break;

              // firmware

              case DMM.DRONE_MESH_MSG_TYPE_FIRMWARE_START_RESPONSE: this.receiveFirmwareStartResponse(netInterface, msg, metric, interfaceAddress); break;

              case DMM.DRONE_MESH_MSG_TYPE_FIRMWARE_REWIND: this.receiveFirmwareRewind(netInterface, msg, metric); break;

            default:
              this.clog(('Unknown payload type: '+ msg.toString()).orange);
            }
          }
    } catch (err) {
      this.clog(('ERROR in receivePacket: ' + err).red);
    }
  }


  receiveAck(msg) {
    // search tx queue for a matching waiting buffer
    for (var i=0; i< this.txQueue.length; i++) {
      var b = this.txQueue[i];

      // find waiting buffers
      if (b.state == DMTB.DRONE_MESH_MSG_BUFFER_STATE_WAITING) {
        // see if this matches the Ack we've received
        // dest should equal src, and src equal dest
        // same seq number

        if ( b.msg.seq == msg.seq &&
             b.msg.srcNode == msg.destNode &&
             b.msg.destNode == msg.srcNode) {
          // clear waiting buffer
          b.state = DMTB.DRONE_MESH_MSG_BUFFER_STATE_EMPTY;

          // update stats on nextNode
          var nextNodeInfo = this.getNodeInfo(msg.txNode, false);
          if (nextNodeInfo) {
            nextNodeInfo.lastAckTime = Date.now();
            //this.clog('ack ok'.green);
            nextNodeInfo.avgAttempts = (nextNodeInfo.avgAttempts * (DRONE_LINK_MANAGER_AVG_SAMPLES-1) + b.attempts) / DRONE_LINK_MANAGER_AVG_SAMPLES;
            nextNodeInfo.avgAckTime = (nextNodeInfo.avgAckTime * (DRONE_LINK_MANAGER_AVG_SAMPLES-1) + (Date.now() - b.created)) / DRONE_LINK_MANAGER_AVG_SAMPLES;
          }
        }
      }
    }
  }


  generateAck(netInterface, msg) {
    // treat Acks as critical so we can clear them fast
    var buffer = this.getTransmitBuffer(netInterface, DMM.DRONE_MESH_MSG_PRIORITY_CRITICAL);

    if (buffer) {
      var amsg = buffer.msg;
      //this.clog('Generating Ack to ' + msg.srcNode);
      // populate with a subscription request packet
      amsg.typeGuaranteeSize = DMM.DRONE_MESH_MSG_GUARANTEED | 0 ;
      // set Ack
      amsg.setPacketType(DMM.DRONE_MESH_MSG_ACK);
      amsg.txNode = this.node;
      amsg.srcNode = msg.destNode;
      amsg.nextNode = msg.txNode;
      amsg.destNode = msg.srcNode;
      amsg.seq = msg.seq;
      amsg.priorityType = msg.priorityType;

      // populate payload
      amsg.uint8_tPayload[0] = 0;

      return true;
    }

    return false;
  }


  receiveHello(netInterface, msg, metric) {

    var loopTime = Date.now();

    var helloMetric = msg.uint8_tPayload[0];

    // set an initial new total metric, inc RSSI to us
    var newMetric = constrain(helloMetric + metric, 0, 255);

    // lookup info on tx Node... to calc a better metric than RSSI
    var txNodeInfo = this.getNodeInfo(msg.txNode, false);
    if (txNodeInfo) {
      // use avgAttempts to txNode to update total metric
      txNodeInfo.lastHello = Date.now();
      txNodeInfo.helloInterface = netInterface;
      newMetric = constrain(helloMetric + this.getMetricFromNodeInfo(txNodeInfo), 0, 255);
    }

    // little endian byte order
    var newUptime = (msg.uint8_tPayload[4] << 24) +
                    (msg.uint8_tPayload[3] << 16) +
                    (msg.uint8_tPayload[2] << 8) +
                    (msg.uint8_tPayload[1]);

    if (this.logOptions.Hello)
      this.clog('  Hello from '+msg.srcNode + ' tx by '+msg.txNode + ', Metric: '+newMetric+', Sq: '+msg.seq+', Up: ' + newUptime);


    // fetch/create routing entry
    var nodeInfo = this.getNodeInfo(msg.srcNode, true);
    if (nodeInfo) {
      // if its a brand new route entry it will have metric 255... so good to overwrite
      var feasibleRoute = false;
      if (nodeInfo.metric == 255) {
        feasibleRoute = true;
      } else {
        // update existing metric info based on latest link quality
        var nextHopInfo = this.getNodeInfo(nodeInfo.nextHop, false);
        if (nextHopInfo) {
          // use avgAttempts to nexthop to update total metric
          nodeInfo.metric = constrain(nodeInfo.helloMetric + this.getMetricFromNodeInfo(nextHopInfo), 0, 255);
        }
      }

      // if new uptime is less than current uptime
      if (newUptime < nodeInfo.uptime) feasibleRoute = true;

      if (netInterface != nodeInfo.netInterface && newMetric < nodeInfo.metric) {
        feasibleRoute = true;
      } else {
        // is this a new sequence (allow for wrap-around)
        if ((msg.seq > nodeInfo.seq) || (nodeInfo.seq > 128 && (msg.seq < nodeInfo.seq - 128))) {
          feasibleRoute = true;
          if (this.logOptions.Hello)
            this.clog("  New seq " + msg.seq);
        }

        // or is it the same, but with a better metric
        if (msg.seq == nodeInfo.seq &&
            newMetric < nodeInfo.metric) {
          feasibleRoute = true;
          if (this.logOptions.Hello)
            this.clog("  Better metric " + newMetric);
        }
      }

      if (feasibleRoute) {
        if (this.logOptions.Hello)
          this.clog("  Updating route info");
        nodeInfo.seq = msg.seq;
        nodeInfo.metric = newMetric;
        nodeInfo.helloMetric = helloMetric;
        nodeInfo.netInterface = netInterface;
        nodeInfo.nextHop = msg.txNode;
        nodeInfo.uptime = newUptime;

        // generate subscription?
        if (nodeInfo.subState == SUB_STATE_PENDING) {
          var ni = nodeInfo.netInterface;
          if (ni) {
            if (this.generateSubscriptionRequest(ni,this.node, nodeInfo.nextHop, nodeInfo.node, 0,0)) {
              nodeInfo.subTimer = Date.now();
              nodeInfo.subState = SUB_STATE_REQUESTED;
            }
          }
        }

        if (this.io) this.io.emit('route.update', nodeInfo.encode());

        //this.clog(this.routeMap);
      } else {
        if (this.logOptions.Hello)
          this.clog("  New route infeasible, existing metric=" + nodeInfo.metric + ", seq=" + nodeInfo.seq);
        newMetric = nodeInfo.metric;
      }

      /* don't retransmit, as we don't want to be a router
      // if metric < 255 then retransmit the Hello on all interfaces
      // subject to timer
      if (loopTime > nodeInfo.lastBroadcast + 5000) {
        if (newMetric < 255) {
          for (var i=0; i < this.interfaces.length; i++) {
            this.generateHello(this.interfaces[i], msg.srcNode, msg.seq, newMetric);
          }
          nodeInfo.lastBroadcast = loopTime;
        }
      }
      */

    }
  }


  receiveSubscriptionResponse(netInterface, msg, metric) {
    if (this.logOptions.Subscription)
      this.clog('  Sub Response from '+msg.srcNode + ' to '+msg.destNode);

    // check if we are the destination
    if (msg.destNode == this.node) {
      // update sub state
      var nodeInfo = this.getNodeInfo(msg.srcNode, false);
      if (nodeInfo && nodeInfo.heard) {
        nodeInfo.subState = SUB_STATE_CONFIRMED;
        nodeInfo.subTimer = Date.now();
        if (this.logOptions.Subscription)
          this.clog(('  Sub to '+msg.srcNode + ' confirmed').green);
      }

    }

  }


  receiveDroneLinkMsg(netInterface, msg, metric) {
    var loopTime = Date.now();

    if (this.logOptions.DroneLinkMsg)
      this.clog('  DLM from '+msg.srcNode + ' tx by '+msg.txNode);

    // check if we're the next node - otherwise ignore it
    if (msg.nextNode == this.node) {
      // are we the destination?
      if (msg.destNode == this.node) {

        // unwrap contained DLM
        var dlmMsg = new DLM.DroneLinkMsg( msg.rawPayload );

        if (this.logOptions.DroneLinkMsg)
          this.clog('    ' + dlmMsg.asString());

        // publish dlm
        if (this.io) this.io.emit('DLM.msg', dlmMsg.encodeUnframed());

      } else {
        // pass along to next hop
        //TODO
        // hopAlong(msg)
      }
    }
  }


  receiveTracerouteResponse(netInterface, msg, metric) {
    var loopTime = Date.now();

    if (this.logOptions.Traceroute)
      this.clog(('  Traceroute Response from '+msg.srcNode).green);

    // are we the destination?
    if (msg.destNode == this.node) {

      try {
        // add our receiving metric info to complete the trace
        // tweak buffer to add our traceroute info
        var payloadLen = msg.getPayloadSize();

        if (payloadLen < DMM.DRONE_MESH_MSG_MAX_PAYLOAD_SIZE-2) {
          // calc index of insertion point
          var p = payloadLen;

          // lookup txNode and get avgAttempts value as metric
          var m = metric;

          var txInfo = this.getNodeInfo(msg.txNode, false);
          if (txInfo) {
            m = this.getMetricFromNodeInfo(txInfo.avgAttempts);
          }

          // add our info
          msg.uint8_tPayload[p] = m;
          msg.uint8_tPayload[p+1] = this.node;

          // update payload size
          msg.setPayloadSize(payloadLen+2);
        }


        // unwrap contained RouteEntry
        //var dmre = new DMRE.DroneMeshRouteEntry( msg.rawPayload );

        if (this.logOptions.Traceroute) {
          var s = '';
          var p = 0;
          for (var i=0; i < msg.getPayloadSize(); i++) {
            s += msg.uint8_tPayload[p] + ' -> ';
            p += 1;
          }
          this.clog(s);
        }

        // publish
        if (this.io) this.io.emit('traceroute.response', msg.encode());

      } catch (err) {
        this.clog(('ERROR: receiveTracerouteResponse' + err).red)
      }

    } else {
      // pass along to next hop
      //TODO
      // hopAlong(msg)
    }
  }


  receiveRouteEntryResponse(netInterface, msg, metric) {
    var loopTime = Date.now();

    if (this.logOptions.RouteEntry)
      this.clog(('  RouteEntry Response from '+msg.srcNode + ', tx by '+msg.txNode).green);

    // are we the destination?
    if (msg.destNode == this.node) {

      // unwrap contained RouteEntry
      var dmre = new DMRE.DroneMeshRouteEntry( msg.rawPayload );

      if (this.logOptions.RouteEntry)
        this.clog('    ' + dmre.toString());

      // publish
      if (this.io) this.io.emit('route.update', dmre.encode());

    } else {
      // pass along to next hop
      //TODO
      // hopAlong(msg)
    }
  }


  receiveRouterResponse(netInterface, msg, metric) {
    var loopTime = Date.now();

    if (this.logOptions.Router)
      this.clog(('  Router Response from '+msg.srcNode + ', tx by '+msg.txNode).green);

    // are we the destination?
    if (msg.destNode == this.node) {

      try {
        // unwrap contained Router msg
        var dmr = new DMR.DroneMeshRouter( msg.rawPayload );

        //if (this.logOptions.Router)
        //  this.clog('    ' + dmre.toString());

        // publish
        if (this.io) this.io.emit('router.update', {
          node:msg.srcNode,
          dmr:dmr.encode()
        });
      } catch(err) {
        this.clog(('ERROR: '+err).red);
      }

    } else {
      // pass along to next hop
      //TODO
      // hopAlong(msg)
    }
  }


  receiveLinkCheckRequest(netInterface, msg, metric) {
    var loopTime = Date.now();

    if (this.logOptions.LinkCheck)
      this.clog(('  Link Check Request from '+msg.srcNode + ', tx by '+msg.txNode).green);

    // are we the destination?
    if (msg.destNode == this.node) {
      // nothing to be done, just needed an Ack
    }
  }


  receiveFSFileResponse(netInterface, msg, metric) {
    var loopTime = Date.now();

    if (this.logOptions.FS)
      this.clog(('  FS File Response from '+msg.srcNode + ', tx by '+msg.txNode).green);

    // are we the destination?
    if (msg.destNode == this.node) {
      try {
        // unwrap contained msg
        var fsr = new DMFS.DroneMeshFSFileResponse( msg.rawPayload );

        // publish
        if (this.io) this.io.emit('fs.file.response', {
          node:msg.srcNode,
          payload:fsr.encode()
        });
      } catch(err) {
        this.clog(('ERROR in receiveFSFileResponse: '+err).red);
      }
    }
  }


  receiveFSReadResponse(netInterface, msg, metric) {
    var loopTime = Date.now();

    if (this.logOptions.FS)
      this.clog(('  FS Read Response from '+msg.srcNode + ', tx by '+msg.txNode).green);

    // are we the destination?
    if (msg.destNode == this.node) {
      try {
        // unwrap contained msg
        var fsr = new DMFS.DroneMeshFSReadResponse( msg.rawPayload );

        // publish
        if (this.io) this.io.emit('fs.read.response', {
          node:msg.srcNode,
          payload:fsr.encode()
        });
      } catch(err) {
        this.clog(('ERROR in receiveFSReadResponse: '+err).red);
      }
    }
  }


  receiveFSResizeResponse(netInterface, msg, metric) {
    var loopTime = Date.now();

    if (this.logOptions.FS)
      this.clog(('  FS Resize Response from '+msg.srcNode + ', tx by '+msg.txNode).green);

    // are we the destination?
    if (msg.destNode == this.node) {
      try {
        // unwrap contained msg
        var fsr = new DMFS.DroneMeshFSResizeResponse( msg.rawPayload );

        // publish
        if (this.io) this.io.emit('fs.resize.response', {
          node:msg.srcNode,
          payload:fsr.encode()
        });
      } catch(err) {
        this.clog(('ERROR in receiveFSResizeResponse: '+err).red);
      }
    }
  }


  receiveFSWriteResponse(netInterface, msg, metric) {
    var loopTime = Date.now();

    if (this.logOptions.FS)
      this.clog(('  FS Write Response from '+msg.srcNode + ', tx by '+msg.txNode).green);

    // are we the destination?
    if (msg.destNode == this.node) {
      try {
        // unwrap contained msg
        var fsr = new DMFS.DroneMeshFSWriteResponse( msg.rawPayload );

        // publish
        if (this.io) this.io.emit('fs.write.response', {
          node:msg.srcNode,
          payload:fsr.encode()
        });
      } catch(err) {
        this.clog(('ERROR in receiveFSWriteResponse: '+err).red);
      }
    }
  }



  receiveFirmwareStartResponse(netInterface, msg, metric, interfaceAddress) {
    var loopTime = Date.now();

    this.clog(('  Firmware Start Response from '+msg.srcNode).green);

    // are we the destination?
    if (msg.destNode == this.node) {

      // read the status value
      this.firmwareNodes[msg.srcNode] = {
        ready: msg.uint8_tPayload[0] == 1,
        rewinds: 0,
        rewindOffset:0,
        netInterface:netInterface,
        interfaceAddress:interfaceAddress
      }
    }

  }


  receiveFirmwareRewind(netInterface, msg, metric) {
    var loopTime = Date.now();

    // are we the destination?
    if (msg.destNode == this.node) {

      // read offset from msg
      var offset    = (msg.uint8_tPayload[3] << 24) +
                      (msg.uint8_tPayload[2] << 16) +
                      (msg.uint8_tPayload[1] << 8) +
                      (msg.uint8_tPayload[0]);

      this.clog(('  Firmware Rewind from '+msg.srcNode+' to: ' + offset).yellow);

      this.firmwarePos = offset;
      this.firmwareRewinds++;
      this.firmwareNodes[msg.srcNode].rewinds++;
      this.firmwareNodes[msg.srcNode].rewindOffset = offset;
    }

  }


  sendDroneLinkMessage(msg) {
    //update source
    msg.source = this.node;
    //console.log(msg);
    if (this.logOptions.DroneLinkMsg)
      this.clog('Sending DLM: ' + msg.asString());
    var nodeInfo = this.getNodeInfo(msg.node, false);
    if (nodeInfo && nodeInfo.heard) {
      var ni = nodeInfo.netInterface;
      if (ni) {
        if (this.generateDroneLinkMessage(ni, msg, nodeInfo.nextHop)) {
          //this.clog('  sent'.green);
        } else {
          if (this.logOptions.DroneLinkMsg)
            this.clog('  failed to send'.orange);
        }
      } else {
        if (this.logOptions.DroneLinkMsg)
          this.clog('  Unknown interface'.orange);
      }
    } else {
      if (this.logOptions.DroneLinkMsg)
        this.clog(('  No route to node: ' + msg.node).orange);
      //console.log(nodeInfo);
    }
  }


  emitAllRoutes() {
    //this.clog(('Emitting all routes').orange)
    for (const [node, nodeInfo] of Object.entries(this.routeMap)) {
      if (nodeInfo.heard) {
        if (this.io) this.io.emit('route.update', nodeInfo.encode());
      }
    }
  }


  primeFirmwareUpdate() {
    // send a firmware start broadcast on all interfaces

    this.firmwarePos = 0;
    this.firmwareRewinds = 0;
    this.firmwareLastRewinds = 0;
    this.firmwareSending = false;
    this.firmwareNodes = {};

    var filepath = this.firmwarePath;
    this.firmwareSize = getFilesizeInBytes(filepath);
    var filesize = this.firmwareSize;

    // preload firmware into memory
    this.firmwareBuffer = fs.readFileSync(filepath);

    this.clog('Starting firmware update, size: ' + filesize);

    for (var i=0; i<this.interfaces.length; i++) {
      var ni = this.interfaces[i];

      if (ni.state) {
        var buffer = this.getTransmitBuffer(ni, DMM.DRONE_MESH_MSG_PRIORITY_CRITICAL);

        if (buffer) {
          var msg = buffer.msg;
          // populate packet
          msg.typeGuaranteeSize =  DMM.DRONE_MESH_MSG_NOT_GUARANTEED | (4-1) ;
          msg.txNode = this.node;
          msg.srcNode = this.node;
          msg.nextNode = 0;
          msg.destNode = 0;
          msg.seq = 0;
          msg.setPriorityAndType(DMM.DRONE_MESH_MSG_PRIORITY_CRITICAL, DMM.DRONE_MESH_MSG_TYPE_FIRMWARE_START_REQUEST);
          // little endian byte order
          msg.uint8_tPayload[3] = (filesize >> 24) & 0xFF;
          msg.uint8_tPayload[2] = (filesize >> 16) & 0xFF;
          msg.uint8_tPayload[1] = (filesize >> 8) & 0xFF;
          msg.uint8_tPayload[0] = (filesize ) & 0xFF;
        }
      }
    }
  }


  startFirmwareUpdate() {
    if (this.firmwareSize > 0) {
      this.firmwareSending = true;
      this.firmwareStartTime = Date.now();
      this.firmwarePacketsSent = 0;
      this.firmwareRewindTimer = Date.now();
    }
  }


  transmitFirmware() {
    // called every ms
    if (this.firmwareSending &&
        this.firmwarePos < this.firmwareSize) {


      var txInterval = 1000 / this.firmwareTransmitRate;

      // has it been long enough since last packet?
      if (Date.now() - this.firmwareLastTransmitted < txInterval) return;
      this.firmwareLastTransmitted = Date.now();


      if (Date.now() > this.firmwareRewindTimer + 1000) {
        // update rewind rate
        this.rewindRate = (this.firmwareRewinds - this.firmwareLastRewinds);

        this.firmwareLastRewinds = this.firmwareRewinds;

        this.firmwareRewindTimer = Date.now();

        // update firmwareTransmitRate to keep rewindRate (rewinds per second) < 6
        if (this.rewindRate  < 5 && this.firmwareTransmitRate < 1000) {
          this.firmwareTransmitRate *= 1.01;
        } else if (this.rewindRate  >
        10) {
          this.firmwareTransmitRate *= 0.98;
        }
      }

      // prep next packet to send, working through this.firmwareBuffer

      // work out how many bytes will be in this next packet
      var payloadSize = constrain(this.firmwareSize - this.firmwarePos, 1, 44) + 4;

      // loop over all primed nodes... and generate a unicast packet for each
      for (const [nodeId, nodeEntry] of Object.entries(this.firmwareNodes)) {
        var ni = nodeEntry.netInterface;

        if (ni.state) {
          var buffer = this.getTransmitBuffer(ni, DMM.DRONE_MESH_MSG_PRIORITY_CRITICAL);

          if (buffer) {
            var msg = buffer.msg;
            // populate packet
            msg.typeGuaranteeSize =  DMM.DRONE_MESH_MSG_NOT_GUARANTEED | (payloadSize-1) ;  // payload is 1 byte... sent as n-1
            msg.txNode = this.node;
            msg.srcNode = this.node;
            msg.nextNode = nodeId; // always one hop for firmware updates
            msg.destNode = nodeId;
            msg.seq = 0;
            msg.setPriorityAndType(DMM.DRONE_MESH_MSG_PRIORITY_CRITICAL, DMM.DRONE_MESH_MSG_TYPE_FIRMWARE_WRITE);

            // populate offset info
            msg.uint8_tPayload[3] = (this.firmwarePos >> 24) & 0xFF;
            msg.uint8_tPayload[2] = (this.firmwarePos >> 16) & 0xFF;
            msg.uint8_tPayload[1] = (this.firmwarePos >> 8) & 0xFF;
            msg.uint8_tPayload[0] = (this.firmwarePos ) & 0xFF;

            // populate payload
            for (var j=0; j < payloadSize-4; j++) {
              msg.uint8_tPayload[4 + j] = this.firmwareBuffer[this.firmwarePos + j];
            }

          }
        }
      }


      // update firmwarePos
      this.firmwarePos += payloadSize-4;
      this.firmwarePacketsSent++;
    }
  }


}
