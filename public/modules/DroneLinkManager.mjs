
/*

Equivalent to DroneLinkManager firmware class.
Manages the mesh network link over local network interfaces (routing table, etc)

*/

import * as DLM from './droneLinkMsg.mjs';
import * as DMM from './DroneMeshMsg.mjs';
import * as DMRE from './DroneMeshRouteEntry.mjs';
import fs from 'fs';

const DRONE_LINK_MANAGER_MAX_ROUTE_AGE = 60000;

const SUB_STATE_PENDING = 0;
const SUB_STATE_REQUESTED = 1;
const SUB_STATE_CONFIRMED = 2;

const DRONE_LINK_MANAGER_MAX_TX_QUEUE    = 8;

const DRONE_LINK_MANAGER_HELLO_INTERVAL  = 5000;
const DRONE_LINK_MANAGER_SEQ_INTERVAL    = 30000;

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
    this.txQueue = [];  // collection of DroneMeshMsg, with additional state property
    this.helloTimer = 0;
    this.seqTimer = 0;
    this.gSeq = 0;

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
      Subscription: true
    };

    this.clog('DroneLinkManager started');

    // slow process timer
    setInterval( ()=>{
      this.checkForOldRoutes();
      this.updateSubscriptions();
    }, 1000);

    // transmit timer
    setInterval( ()=>{
      this.processTransmitQueue();
    }, 1);

    // hello Timer
    setInterval( ()=>{
      this.generateHellos();
    }, DRONE_LINK_MANAGER_HELLO_INTERVAL);

    // firmware transmission, max 1000 per second
    setInterval( ()=>{
      this.transmitFirmware();
    }, 1);
  }



  getTxQueueSize() {
    return this.txQueue.length;
  }


  getTransmitBuffer(ni) {
    if (this.txQueue.length < DRONE_LINK_MANAGER_MAX_TX_QUEUE) {
      var msg = new DMM.DroneMeshMsg();
      msg.interface = ni;
      this.txQueue.push(msg);
      //this.clog(' txQueue size: ' + this.txQueue.length);
      return msg;
    }
    return null;
  }


  processTransmitQueue() {
    if (this.txQueue.length ==0 ) return;

    var msg = this.txQueue.shift();

    // send via appropriate interface
    if (msg.interface) {
      if (this.logOptions.Transmit)
        this.clog(('Send by '+msg.interface.typeName+': ' + msg.toString()).yellow);
      msg.interface.sendPacket(msg);
    }
  }


  generateHellos() {
    //this.clog('gH');
    var loopTime = Date.now();

    // generate a hello for each active interface
    for (var i=0; i<this.interfaces.length; i++) {
      var ni = this.interfaces[i];

      if (ni.state) {
        this.generateHello(ni, this.node, this.helloSeq, 15, loopTime - this.bootTime);
      } else {
        if (this.logOptions.Hello)
          this.clog('Cant generate hello - interface down'.orange);
      }
    }

    // generate a new hello seq number every now and again
    if (loopTime > this.seqTimer + DRONE_LINK_MANAGER_SEQ_INTERVAL) {
      this.helloSeq++;
      this.seqTimer = loopTime;
    }
  }


  generateHello(ni, src, seq, metric, uptime) {
    var msg = this.getTransmitBuffer(ni);

    if (msg) {
      //this.clog('generating hello on interface: ' + ni.typeName);
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
    var msg = this.getTransmitBuffer(ni);

    if (msg) {
      // populate with a subscription request packet
      msg.typeGuaranteeSize = DMM.DRONE_MESH_MSG_GUARANTEED | 1 ;  // payload is 2 byte... sent as n-1
      msg.txNode = src;
      msg.srcNode = this.node;
      msg.nextNode = next;
      msg.destNode = dest;
      msg.seq = 0;
      msg.setPriorityAndType(DMM.DRONE_MESH_MSG_PRIORITY_MEDIUM, DMM.DRONE_MESH_MSG_TYPE_SUBSCRIPTION_REQUEST);

      // populate payload = channel, param
      msg.uint8_tPayload[0] = channel;
      msg.uint8_tPayload[1] = param;

      return true;
    }

    return false;
  }


  generateRouteEntryRequest(ni, target, subject, nextHop) {
    var msg = this.getTransmitBuffer(ni);

    if (msg) {
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


  generateDroneLinkMessage(ni, dlmMsg, nextHop) {
    var msg = this.getTransmitBuffer(ni);
    if (msg) {
      var payloadSize = dlmMsg.totalSize();

      // populate with a subscription request packet
      msg.typeGuaranteeSize = DMM.DRONE_MESH_MSG_GUARANTEED | (payloadSize-1);  // payload is 2 byte... sent as n-1
      msg.txNode = this.node;
      msg.srcNode = this.node;
      msg.nextNode = nextHop;
      msg.destNode = dlmMsg.node;
      msg.seq = this.gSeq;
      var p = DMM.DRONE_MESH_MSG_PRIORITY_LOW;
      if (dlmMsg.msgType < DLM.DRONE_LINK_MSG_TYPE_NAME) {
        p = DMM.DRONE_MESH_MSG_PRIORITY_HIGH;
      }

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




  getRoutesFor(target, subject) {
    // don't bother asking for routes from ourself
    if (target == this.node) return;

    if (this.logOptions.RouteEntry)
      this.clog(('getRoutesFor: '+ target +', '+ subject).yellow);
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

      routeExists = true;
    }

    if (routeExists) {
      nodeInfo = this.routeMap[node];
      if (heard) {
        nodeInfo.lastHeard = Date.now();
        nodeInfo.heard = true;
      }
      return this.routeMap[node];
    }
    return null;
  }


  receivePacket(netInterface, msg, metric) {
    // update lastHeard for tx node
    var txNodeInfo = this.getNodeInfo(msg.txNode, false);
    if (txNodeInfo && txNodeInfo.heard) txNodeInfo.lastHeard = Date.now();

    if (msg.isAck()) {
      this.receiveAck(msg);

    } else {
      if (msg.isGuaranteed())
        this.generateAck(netInterface, msg);

      // pass to appropriate receive handler
      switch (msg.getPayloadType()) {
        case DMM.DRONE_MESH_MSG_TYPE_HELLO: this.receiveHello(netInterface, msg, metric); break;

        case DMM.DRONE_MESH_MSG_TYPE_SUBSCRIPTION_RESPONSE: this.receiveSubscriptionResponse(netInterface, msg, metric); break;

        case DMM.DRONE_MESH_MSG_TYPE_DRONELINKMSG: this.receiveDroneLinkMsg(netInterface, msg, metric); break;

        //case DMM.DRONE_MESH_MSG_TYPE_TRACEROUTE: this.receiveTraceroute(netInterface, msg, metric); break;

        case DMM.DRONE_MESH_MSG_TYPE_ROUTEENTRY_RESPONSE: this.receiveRouteEntryResponse(netInterface, msg, metric); break;

        case DMM.DRONE_MESH_MSG_TYPE_FIRMWARE_START_RESPONSE: this.receiveFirmwareStartResponse(netInterface, msg, metric); break;

        case DMM.DRONE_MESH_MSG_TYPE_FIRMWARE_REWIND: this.receiveFirmwareRewind(netInterface, msg, metric); break;

      default:
        this.clog(('Unknown payload type: '+ msg.toString()).orange);
      }
    }
  }


  receiveAck(msg) {
    // search tx queue for a matching waiting buffer
    // TODO
  }


  generateAck(netInterface, msg) {
    var amsg = this.getTransmitBuffer(netInterface);

    if (amsg) {
      this.clog('Generating Ack to ' + msg.srcNode);
      // populate with a subscription request packet
      amsg.typeGuaranteeSize = DMM.DRONE_MESH_MSG_GUARANTEED | (msg.getPayloadSize()-1) ;
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

    if (this.logOptions.Hello)
      this.clog('  Hello from '+msg.srcNode + ' tx by '+msg.txNode + ', metric='+metric+', seq='+msg.seq);

    // calc total metric inc RSSI to us
    var newMetric = constrain(msg.uint8_tPayload[0] + metric, 0, 255);
    // little endian byte order
    var newUptime = (msg.uint8_tPayload[4] << 24) +
                    (msg.uint8_tPayload[3] << 16) +
                    (msg.uint8_tPayload[2] << 8) +
                    (msg.uint8_tPayload[1]);


    // fetch/create routing entry
    var nodeInfo = this.getNodeInfo(msg.srcNode, true);
    if (nodeInfo) {
      // if its a brand new route entry it will have metric 255... so good to overwrite
      var feasibleRoute = nodeInfo.metric == 255;

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

  receiveFirmwareStartResponse(netInterface, msg, metric) {
    var loopTime = Date.now();

    this.clog(('  Firmware Start Response from '+msg.srcNode).green);

    // are we the destination?
    if (msg.destNode == this.node) {

      // read the status value
      this.firmwareNodes[msg.srcNode] = {
        ready: msg.uint8_tPayload[0] == 1,
        rewinds: 0,
        rewindOffset:0
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
        var msg = this.getTransmitBuffer(ni);

        if (msg) {
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

      for (var i=0; i<this.interfaces.length; i++) {
        var ni = this.interfaces[i];

        if (ni.state) {
          var msg = this.getTransmitBuffer(ni);

          if (msg) {
            // populate packet
            msg.typeGuaranteeSize =  DMM.DRONE_MESH_MSG_NOT_GUARANTEED | (payloadSize-1) ;  // payload is 1 byte... sent as n-1
            msg.txNode = this.node;
            msg.srcNode = this.node;
            msg.nextNode = 0;
            msg.destNode = 0;
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
