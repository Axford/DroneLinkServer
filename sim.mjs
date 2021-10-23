
/*

DroneSim

* Instances one, or more, node simulations:
  * Provides a physical simulation of the node
  * Exposes virtual sensors (GPS, Compass) that can be published to navigation modules on the real node
  * Exposes virtual actuators (motor, servo) that can be subscribed to navigation modules on the real node
  * Interacts with DroneLink via socket.io connection to the server
  * Appears as a module "on" the node, just like any other module

* Different simulation classes are available, depending on the physical node:
  * TankSteerBoat
  * SailBoat
  * MotorBoat
  * WingSailBoat

* sim.json defines what nodes to simulate and other parameters

*/

import _ from 'lodash';
import path from 'path';
import * as DLM from './public/modules/droneLinkMsg.mjs';

import SimManager from './public/modules/sim/SimManager.mjs';


// -------------------- create socket.io client --------------------------------

import client from "socket.io-client";
var socket = client.connect("http://localhost:8002");
var _socketReady = false;

socket.on('connect',function() {
    console.log('[] Connected to server'.green);
    _socketReady = true;
});

socket.on('DLM.msg',function(msgBuffer) {
  var msg = new DLM.DroneLinkMsg(msgBuffer);
  mgr.handleLinkMessage(msg);
});


// -------------------- setup SimManager ---------------------------------------

var mgr = new SimManager(socket);
mgr.load('./sim.json');

// create update tick
setInterval(()=>{
  if (_socketReady) mgr.update();
}, 10);
