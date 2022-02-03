
/*

Equivalent to DroneLinkManager firmware class.
Manages the mesh network link over local network interfaces (routing table, etc)

*/

import * as DLM from './droneLinkMsg.mjs';
import * as DMM from './DroneMeshMsg.mjs';


const DRONE_LINK_MANAGER_MAX_ROUTE_AGE = 60000;


function constrain(v, minv, maxv) {
  return Math.max(Math.min(v, maxv), minv);
}


export default class DroneLinkManager {

  constructor(node) {
    this.node = node;

    this.routeMap = {};

    this.interfaces = [];
  }


  registerInterface(netInterface) {
    this.interfaces.push(netInterface);
  }


  getNodeInfo(node, heard) {
    // see if node already exists in routeMap
    var routeExists = (this.routeMap.hasOwnProperty(node));

    if (!routeExists && heard) {
      // create new route entry
      this.routeMap[node] = {
        heard: true,
        seq: 0,
        metric: 255,
        name: '',
        netInterface: null,
        nextHop: 0,
        lastHeard: Date.now(),
        lastBroadcast: 0
      };
      routeExists = true;
    }

    if (routeExists) {
      return this.routeMap[node];
    }
    return null;
  }


  receivePacket(netInterface, msg, metric) {
    // update lastHeard for tx node
    var txNodeInfo = this.getNodeInfo(msg.txNode, false);
    if (txNodeInfo) txNodeInfo.lastHeard = Date.now();

    // pass to appropriate receive handler
    switch (msg.getType()) {
      case DMM.DRONE_MESH_MSG_TYPE_HELLO: this.receiveHello(netInterface, msg, metric); break;
      /*case DMM.DRONE_MESH_MSG_TYPE_SUBSCRIPTION: this.receiveSubscription(netInterface, msg, metric); break;
      case DMM.DRONE_MESH_MSG_TYPE_DRONELINKMSG: this.eceiveDroneLinkMsg(netInterface, msg, metric); break;
      case DMM.DRONE_MESH_MSG_TYPE_TRACEROUTE: this.receiveTraceroute(netInterface, msg, metric); break;*/
    }
  }


  receiveHello(netInterface, msg, metric) {
    // check this is a request
    if (!msg.isRequest()) return;

    // ignore hello's from us
    if (msg.srcNode == this.node) return;

    var loopTime = Date.now();

    console.log('  Hello from '+msg.srcNode + ' tx by '+msg.txNode);

    // calc total metric inc RSSI to us
    var newMetric = constrain(msg.uint8_tPayload[0] + metric, 0, 255);

    // fetch/create routing entry
    var nodeInfo = this.getNodeInfo(msg.srcNode, true);
    if (nodeInfo) {
      // if its a brand new route entry it will have metric 255... so good to overwrite
      var feasibleRoute = nodeInfo.metric == 255;

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

        console.log(this.routeMap);
      } else {
        console.log("  New route infeasible");
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


}
