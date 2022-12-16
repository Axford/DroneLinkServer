
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
import colors from 'colors';
import * as DLM from './public/modules/droneLinkMsg.mjs';

import SimManager from './public/modules/sim/SimManager.mjs';


import blessed from 'neo-blessed';

// setup screen interface
const screen = blessed.screen({
  smartCSR: true,
  title: 'DroneLink Sim'
});

var pauseLog = false;

function footerContent() {
  return '[q]'.green + 'Quit   '+'[l]'.green+'Log   '+'[d]'.green+'Diagnostics   '+'[p]'.green+'Pause Log ';
}

let logBox = blessed.log({
  parent: screen,
  top: 5,
  left: 0,
  bottom:2,
  width: '100%',
  style: {
    fg: 'white',
    bg: '#141a20',
    border: {
      fg: '#343a40'
    },
  },
  border: {
    type: 'line'
  },
  keys: true,
  vi: true,
  hidden:true,
  alwaysScroll:true,
  scrollable: true,
  scrollbar: {
    style: {
      bg: 'yellow'
    }
  },
  scrollback:100,
  scrollOnInput:false
});

var diagnosticsBox = blessed.box({
  parent: screen,
  top: 2,
  left: 0,
  bottom:2,
  width: '100%',
  content: '',
  tags: true,
  style: {
    fg: 'white',
    bg: '#242a30'
  }
});

var titleBox = blessed.box({
  parent: screen,
  top: 0,
  left: 'center',
  width: '100%',
  height: 1,
  content: '{bold}DroneLink Sim{/bold}',
  tags: true,
  style: {
    fg: 'white',
    bg: '#005bdf'
  }
});

var footerBox = blessed.box({
  parent: screen,
  bottom: 0,
  left: 'center',
  width: '100%',
  height: 1,
  content: footerContent(),
  tags: true,
  style: {
    fg: 'white',
    bg: '#242a30'
  }
});

var logOptionsBox = blessed.box({
  parent: screen,
  top: 1,
  left: 'center',
  width: '100%',
  height: 4,
  content: '',
  hidden:true,
  mouse: true,
  keys:true,
  vi: true,
  tags: true,
  style: {
    fg: 'white',
    bg: '#242a30'
  }
});


// Quit on Escape, q, or Control-C.
screen.key(['escape', 'q', 'C-c'], function(ch, key) {
  return process.exit(0);
});

screen.key(['p'], function(ch, key) {
  pauseLog = !pauseLog;
});

screen.key(['l'], function(ch, key) {
  logBox.show();
  diagnosticsBox.hide();
  screen.render();
});

screen.key(['d'], function(ch, key) {
  logBox.hide();
  diagnosticsBox.show();
  screen.render();
});

screen.render();


function clog(v) {
  if (!pauseLog) {
    var s = '';
    if (typeof this == 'object') {
      s += '['+ this.constructor.name +'] ';
    }
    s += v;
    logBox.add(s);
  }
  logBox.screen.render();
  //console.log(v);
}


clog(('Starting DroneLink Server...').green);



// -------------------- create socket.io client --------------------------------

import client from "socket.io-client";
var socket = client.connect("http://localhost:8002");
var _socketReady = false;

socket.on('connect',function() {
    clog('[] Connected to server'.green);
    _socketReady = true;
});

socket.on('DLM.msg',function(msgBuffer) {
  try {
    var msg = new DLM.DroneLinkMsg(msgBuffer);
    mgr.handleLinkMessage(msg);
  } catch(err) {
    clog(err.message.red);
  }
});


// -------------------- setup SimManager ---------------------------------------


var mgr = new SimManager(socket);
mgr.onError = (err) => { clog(err.red); };
mgr.onLog = (err) => { clog(err); };
try {
  mgr.load('./sim.json');
} catch(e) {
  clog((e.message).red);
}

// create update tick
setInterval(()=>{
  try {
    if (_socketReady) mgr.update();
  } catch(e) {
    clog((e.message).red);
  }
}, 50);


// -----------------------------------------------------------

setInterval(()=>{
  try {
    diagnosticsBox.content = mgr.diagnosticString();
  } catch(e) {
    diagnosticsBox.content = 'ERROR: '+ e.message;
  }
  

  diagnosticsBox.screen.render();
}, 1000);