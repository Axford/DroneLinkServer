
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

function constrain(v, minv, maxv) {
  return Math.max(Math.min(v, maxv), minv);
}


export default class DroneLinkManager {

  constructor(node) {
    this.node = node;

    this.routeMap = {};

    this.interfaces = [];

    this.bootTime = Date.now();

    setInterval( ()=>{
      this.checkForOldRoutes();
      this.updateSubscriptions();
    }, 1000);
  }


  getRoutesFor(target, subject) {
    console.log(('getRoutesFor: '+ target +', '+ subject).red);
    var nodeInfo = this.getNodeInfo(target, false);
    if (nodeInfo && nodeInfo.heard) {
      var ni = this.getInterfaceById(nodeInfo.netInterface);
      if (ni) {
        ni.generateRouteEntryRequest(target, subject, nodeInfo.nextHop);
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
        console.log(('  Removing route to '+nodeInfo.node).red);
        this.removeRoute(node);
      }
    }
  }


  updateSubscriptions() {
    var loopTime = Date.now();
    for (const [node, nodeInfo] of Object.entries(this.routeMap)) {
      if (nodeInfo.heard && (loopTime > nodeInfo.subTimer + 10000)) {
        var ni = this.getInterfaceById(nodeInfo.netInterface);
        console.log(('  Refreshing sub to '+nodeInfo.node).blue);
        if (ni && ni.generateSubscriptionRequest(nodeInfo.node, nodeInfo.nextHop, nodeInfo.node, 0,0)) {
          //console.log(('request sent').green);
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

    // pass to appropriate receive handler
    switch (msg.getType()) {
      case DMM.DRONE_MESH_MSG_TYPE_HELLO: this.receiveHello(netInterface, msg, metric); break;
      case DMM.DRONE_MESH_MSG_TYPE_SUBSCRIPTION: this.receiveSubscription(netInterface, msg, metric); break;
      case DMM.DRONE_MESH_MSG_TYPE_DRONELINKMSG: this.receiveDroneLinkMsg(netInterface, msg, metric); break;
      //case DMM.DRONE_MESH_MSG_TYPE_TRACEROUTE: this.receiveTraceroute(netInterface, msg, metric); break;
      case DMM.DRONE_MESH_MSG_TYPE_ROUTEENTRY: this.receiveRouteEntry(netInterface, msg, metric); break;
    }
  }


  receiveHello(netInterface, msg, metric) {
    // check this is a request
    if (!msg.isRequest()) return;

    // ignore hello's from us
    if (msg.srcNode == this.node) return;

    var loopTime = Date.now();

    console.log('  Hello from '+msg.srcNode + ' tx by '+msg.txNode + ', metric='+metric+', seq='+msg.seq);

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
          console.log("  New seq " + msg.seq);
        }

        // or is it the same, but with a better metric
        if (msg.seq == nodeInfo.seq &&
            newMetric < nodeInfo.metric) {
          feasibleRoute = true;
          console.log("  Better metric " + newMetric);
        }
      }

      if (feasibleRoute) {
        console.log("  Updating route info");
        nodeInfo.seq = msg.seq;
        nodeInfo.metric = newMetric;
        nodeInfo.netInterface = netInterface;
        nodeInfo.nextHop = msg.txNode;
        nodeInfo.uptime = newUptime;

        // generate subscription?
        if (nodeInfo.subState == SUB_STATE_PENDING) {
          var ni = this.getInterfaceById(nodeInfo.netInterface);
          if (ni) {
            if (ni.generateSubscriptionRequest(this.node, nodeInfo.nextHop, nodeInfo.node, 0,0)) {
              nodeInfo.subTimer = Date.now();
            }

          }
        }

        if (this.io) this.io.emit('route.update', nodeInfo.encode());

        console.log(this.routeMap);
      } else {
        console.log("  New route infeasible, existing metric=" + nodeInfo.metric + ", seq=" + nodeInfo.seq);
        newMetric = nodeInfo.metric;
      }

      // if metric < 255 then retransmit the Hello on all interfaces
      // subject to timer
      if (loopTime > nodeInfo.lastBroadcast + 5000) {
        if (newMetric < 255) {
          for (var i=0; i < this.interfaces.length; i++) {
            this.interfaces[i].generateHello(msg.srcNode, msg.seq, newMetric);
          }
          nodeInfo.lastBroadcast = loopTime;
        }
      }

    }
  }


  receiveSubscription(netInterface, msg, metric) {
    console.log('  Sub from '+msg.srcNode + ' to '+msg.destNode);

    if (msg.isRequest()) {
      console.log('  Request');

      // TODO

    } else {

      // check if we are the destination
      if (msg.destNode == this.node) {
        console.log('  Response');

        // update sub state
        var nodeInfo = this.getNodeInfo(msg.srcNode, false);
        if (nodeInfo && nodeInfo.heard) {
          nodeInfo.subState = SUB_STATE_CONFIRMED;
          nodeInfo.subTimer = Date.now();
          console.log(('  Sub to '+msg.srcNode + ' confirmed').green);
        }

      }
    }
  }


  receiveDroneLinkMsg(netInterface, msg, metric) {
    // check this is a request
    if (!msg.isRequest()) return;

    var loopTime = Date.now();

    console.log('  DLM from '+msg.srcNode + ' tx by '+msg.txNode);

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


  receiveRouteEntry(netInterface, msg, metric) {
    // check this is a request
    if (!msg.isRequest()) return;

    var loopTime = Date.now();

    console.log('  Route Entry from '+msg.srcNode + ' tx by '+msg.txNode);

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
    console.log(('Sending DLM').blue)
    //update source
    msg.source = this.node;
    var nodeInfo = this.getNodeInfo(msg.node, false);
    if (nodeInfo && nodeInfo.heard) {
      var ni = this.getInterfaceById(nodeInfo.netInterface);
      if (ni) {
        ni.sendDroneLinkMessage(msg, nodeInfo.nextHop);
      }
    }
  }


  emitAllRoutes() {
    console.log(('Emitting all routes').red)
    for (const [node, nodeInfo] of Object.entries(this.routeMap)) {
      if (nodeInfo.heard) {
        if (this.io) this.io.emit('route.update', nodeInfo.encode());
      }
    }
  }


}
