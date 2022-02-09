
/*

Equivalent to DroneLinkManager firmware class.
Manages the mesh network link over local network interfaces (routing table, etc)

*/

import * as DLM from './droneLinkMsg.mjs';
import * as DMM from './DroneMeshMsg.mjs';
import * as DMRE from './DroneMeshRouteEntry.mjs';

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

    this.clog('DroneLinkManager started');

    // slow process timer
    setInterval( ()=>{
      this.checkForOldRoutes();
      this.updateSubscriptions();
    }, 1000);

    // transmit timer
    setInterval( ()=>{
      this.processTransmitQueue();
    }, 10);

    // hello Timer
    setInterval( ()=>{
      this.generateHellos();
    }, DRONE_LINK_MANAGER_HELLO_INTERVAL);
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
    if (msg.interface)
      msg.interface.sendPacket(msg);
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
        this.clog('interface down');
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
      msg.metric = 0;

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
      this.clog(('generateRouteEntryRequest for '+target+', '+subject).blue);
      // populate with a subscription request packet
      msg.typeGuaranteeSize = DMM.DRONE_MESH_MSG_GUARANTEED | 10;  // payload is 1 byte... sent as n-1
      msg.txNode = this.node;
      msg.srcNode = this.node;
      msg.nextNode = nextHop;
      msg.destNode = target;
      msg.seq = 0;
      msg.setPriorityAndType(DMM.DRONE_MESH_MSG_PRIORITY_LOW, DMM.DRONE_MESH_MSG_TYPE_ROUTEENTRY_REQUEST);
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
      msg.setPriorityAndType(DMM.DRONE_MESH_MSG_PRIORITY_HIGH, DMM.DRONE_MESH_MSG_TYPE_DRONELINKMSG);

      this.gSeq++;
      if (this.gSeq > 255) this.gSeq = 0;

      // populate payload
      var buffer = dlmMsg.encodeUnframed();
      for (var i=0; i<payloadSize; i++) {
        msg.uint8_tPayload[i] = buffer[i];
      }

      this.clog( ('  ' + msg.toString()).blue);

      return true;
    }

    return false;
  }




  getRoutesFor(target, subject) {
    this.clog(('getRoutesFor: '+ target +', '+ subject).red);
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
        nodeInfo.subState = SUB_STATE_REQUESTED;
        nodeInfo.metric = 255;
      }

      if (this.io) this.io.emit('route.removed', nodeInfo.encode());
    }
  }


  checkForOldRoutes() {
    var loopTime = Date.now();
    for (const [node, nodeInfo] of Object.entries(this.routeMap)) {
      if (nodeInfo.heard && loopTime > nodeInfo.lastHeard + DRONE_LINK_MANAGER_MAX_ROUTE_AGE) {
        this.clog(('  Removing route to '+nodeInfo.node).red);
        this.removeRoute(node);
      }
    }
  }


  updateSubscriptions() {
    var loopTime = Date.now();
    for (const [node, nodeInfo] of Object.entries(this.routeMap)) {
      if (nodeInfo.heard && (loopTime > nodeInfo.subTimer + 10000)) {
        var ni = nodeInfo.netInterface;
        this.clog(('  Refreshing sub to '+nodeInfo.node).blue);
        if (ni && this.generateSubscriptionRequest(ni,nodeInfo.node, nodeInfo.nextHop, nodeInfo.node, 0,0)) {
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
      nodeInfo.leastHeard = Date.now();
      nodeInfo.heard = true;
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

      default:
        this.clog(('Unknown payload type: '+ msg.toString()).red);
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
      // populate with a subscription request packet
      amsg.typeGuaranteeSize = DMM.DRONE_MESH_MSG_GUARANTEED | 0 ;  // payload is 1 byte... sent as n-1
      // set Ack
      amsg.setPacketType(DMM.DRONE_MESH_MSG_ACK);
      amsg.txNode = this.node;
      amsg.srcNode = msg.destNode;
      amsg.nextNode = msg.txNode;
      amsg.destNode = msg.srcNode;
      amsg.seq = msg.seq;
      amsg.setPriorityAndType(msg.getPriority(), msg.getPayloadType());

      // populate payload = channel, param
      amsg.uint8_tPayload[0] = 0;

      return true;
    }

    return false;
  }


  receiveHello(netInterface, msg, metric) {

    var loopTime = Date.now();

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
          this.clog("  New seq " + msg.seq);
        }

        // or is it the same, but with a better metric
        if (msg.seq == nodeInfo.seq &&
            newMetric < nodeInfo.metric) {
          feasibleRoute = true;
          this.clog("  Better metric " + newMetric);
        }
      }

      if (feasibleRoute) {
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
    this.clog('  Sub Response from '+msg.srcNode + ' to '+msg.destNode);

    // check if we are the destination
    if (msg.destNode == this.node) {
      // update sub state
      var nodeInfo = this.getNodeInfo(msg.srcNode, false);
      if (nodeInfo && nodeInfo.heard) {
        nodeInfo.subState = SUB_STATE_CONFIRMED;
        nodeInfo.subTimer = Date.now();
        this.clog(('  Sub to '+msg.srcNode + ' confirmed').green);
      }

    }

  }


  receiveDroneLinkMsg(netInterface, msg, metric) {
    var loopTime = Date.now();

    this.clog('  DLM from '+msg.srcNode + ' tx by '+msg.txNode);

    // check if we're the next node - otherwise ignore it
    if (msg.nextNode == this.node) {
      // are we the destination?
      if (msg.destNode == this.node) {

        // unwrap contained DLM
        var dlmMsg = new DLM.DroneLinkMsg( msg.rawPayload );

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

    this.clog('  Route Entry Response from '+msg.srcNode + ' tx by '+msg.txNode);

    // check if we're the next node - otherwise ignore it
    if (msg.nextNode == this.node) {
      // are we the destination?
      if (msg.destNode == this.node) {

        // unwrap contained RouteEntry
        var dmre = new DMRE.DroneMeshRouteEntry( msg.rawPayload );

        // publish
        if (this.io) this.io.emit('route.update', dmre.encode());

      } else {
        // pass along to next hop
        //TODO
        // hopAlong(msg)
      }
    }
  }


  sendDroneLinkMessage(msg) {
    //update source
    msg.source = this.node;
    //console.log(msg);
    this.clog('Sending DLM: ' + msg.asString());
    var nodeInfo = this.getNodeInfo(msg.node, false);
    if (nodeInfo && nodeInfo.heard) {
      var ni = nodeInfo.netInterface;
      if (ni) {
        if (this.generateDroneLinkMessage(ni, msg, nodeInfo.nextHop)) {
          //this.clog('  sent'.green);
        } else {
          this.clog('  failed to send'.red);
        }
      } else {
        this.clog('  Unknown interface'.red);
      }
    } else {
      this.clog(('  No route to node: ' + msg.node).red);
      console.log(nodeInfo);
    }
  }


  emitAllRoutes() {
    this.clog(('Emitting all routes').red)
    for (const [node, nodeInfo] of Object.entries(this.routeMap)) {
      if (nodeInfo.heard) {
        if (this.io) this.io.emit('route.update', nodeInfo.encode());
      }
    }
  }


}
