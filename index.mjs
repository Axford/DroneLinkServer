
import _ from 'lodash';
import path from 'path';
import colors from 'colors';
//import { Server } from "socket.io";
import socket_io from 'socket.io';
const { Server} = socket_io;

import * as DLM from './public/modules/droneLinkMsg.mjs';
import DroneLinkMsgQueue from './public/modules/DroneLinkMsgQueue.mjs';
import DroneLinkManager from './public/modules/DroneLinkManager.mjs';
import UDPInterface from './public/modules/UDPInterface.mjs';

//const broadcastAddress = require('broadcast-address');

import SerialPort from 'serialport';

import blessed from 'neo-blessed';

// setup screen interface
const screen = blessed.screen({
  smartCSR: true
});

var pauseLog = false;

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
  content: '{bold}DroneLinkServer{/bold}',
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
  content: '[q]'.green + 'Quit   '+'[l]'.green+'Log   '+'[d]'.green+'Diagnostics   '+'[p]'.green+'Pause Log',
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

var checkStyle = {
  fg: '#fff',
  bg: '#242a30',
  hover: {
    fg: '#5f5'
  },
  focus: {
    border: {
      fg: 'blue'
    }
  }
};

var showDLMCheck = blessed.checkbox({
  parent: logOptionsBox,
  top: 0,
  left: '5%',
  width: '40%',
  height: 1,
  text: 'DroneLinkMsg',
  tags: true,
  mouse: true,
  keys:true,
  vi: true,
  style: checkStyle,
  checked:true
});
showDLMCheck.on('click', ()=>{ updateLogOptions(); });


var showRouteEntryCheck = blessed.checkbox({
  parent: logOptionsBox,
  top: 0,
  left: '55%',
  width: '40%',
  height: 1,
  text: 'RouteEntry',
  tags: true,
  mouse: true,
  keys:true,
  vi: true,
  style: checkStyle,
  checked:true
});
showRouteEntryCheck.on('click', ()=>{ updateLogOptions(); });

var showTransmitCheck = blessed.checkbox({
  parent: logOptionsBox,
  top: 1,
  left: '5%',
  width: '40%',
  height: 1,
  text: 'Transmit',
  tags: true,
  mouse: true,
  keys:true,
  vi: true,
  style: checkStyle,
  checked:true
});
showTransmitCheck.on('click', ()=>{ updateLogOptions(); });

var showHelloCheck = blessed.checkbox({
  parent: logOptionsBox,
  top: 1,
  left: '55%',
  width: '40%',
  height: 1,
  text: 'Hello',
  tags: true,
  mouse: true,
  keys:true,
  vi: true,
  style: checkStyle,
  checked:true
});
showHelloCheck.on('click', ()=>{ updateLogOptions(); });

var showSubscriptionCheck = blessed.checkbox({
  parent: logOptionsBox,
  top: 2,
  left: '5%',
  width: '40%',
  height: 1,
  text: 'Subscription',
  tags: true,
  mouse: true,
  keys:true,
  vi: true,
  style: checkStyle,
  checked:true
});
showSubscriptionCheck.on('click', ()=>{ updateLogOptions(); });


function updateLogOptions() {
  dlm.logOptions.DroneLinkMsg = showDLMCheck.checked;
  dlm.logOptions.RouteEntry = showRouteEntryCheck.checked;
  dlm.logOptions.Transmit = showTransmitCheck.checked;
  dlm.logOptions.Hello = showHelloCheck.checked;
  dlm.logOptions.Subscription = showSubscriptionCheck.checked;

}

// Quit on Escape, q, or Control-C.
screen.key(['escape', 'q', 'C-c'], function(ch, key) {
  return process.exit(0);
});

screen.key(['l'], function(ch, key) {
  logBox.show();
  logOptionsBox.show();
  diagnosticsBox.hide();
  screen.render();
});

screen.key(['d'], function(ch, key) {
  logBox.hide();
  logOptionsBox.hide();
  diagnosticsBox.show();
  screen.render();
});

screen.key(['p'], function(ch, key) {
  pauseLog = !pauseLog;
});

screen.render();


function clog(v) {
  if (!pauseLog) logBox.add(v);
  logBox.screen.render();
  //console.log(v);
}

clog(('Starting DroneLink Server...').green);

import os from "os";
var hostname = os.hostname();
clog('Hostname: '+hostname);

//clog('broadcast address: ', broadcastAddress('en0'));

import fs from 'fs';
import express from 'express';
const app = express();
const router = express.Router();
import cors from 'cors';
import http from 'http';
const httpServer = http.createServer(app);


var config = JSON.parse( fs.readFileSync('./config.json') );
//console.log(config);

var env = hostname;
//clog('Env: ' + env);

clog('Using config: ', env);

// network id
var sourceId = config[env].id ? config[env].id : 254;
clog('Using server node address: ' + sourceId);

// init DLM
var dlm = new DroneLinkManager(sourceId, clog);

// prep msgQueue
var msgQueue = new DroneLinkMsgQueue();

// create interfaces
var udpi = new UDPInterface(dlm, 1, clog);


// -----------------------------------------------------------

setInterval(()=>{
  // update diagnostics
  var s = '';

  s += 'txQueue = ' + dlm.txQueue.length + '\n\n';

  s += '{bold}Interfaces{/bold}\n';
  for (var i=0; i<dlm.interfaces.length; i++) {
    var ni = dlm.interfaces[i];
    s+= ' '+ni.typeName.yellow + ': Sent: '+ni.packetsSent+', Received: '+ni.packetsReceived+', Rejected: '+ni.packetsRejected+'\n';
  }

  s+= '\n';
  s += '{bold}Routing table{/bold}\n';

  for (const [node, nodeInfo] of Object.entries(dlm.routeMap)) {
    if (nodeInfo.heard) {
      s += (' ' + nodeInfo.node).yellow;
      s += ': Seq: '+nodeInfo.seq;
      s += ', Metric: '+nodeInfo.metric;
      s += ', Next: '+nodeInfo.nextHop;
      s += ', Age: ' + ((Date.now()-nodeInfo.lastHeard)/1000).toFixed(0)+'s';
      s += ', Uptime: '+(nodeInfo.uptime/1000).toFixed(0)+'s';
      s += ', Int: '+nodeInfo.netInterface.typeName;
      s += '\n';
    }
  }

  diagnosticsBox.content = s;

  diagnosticsBox.screen.render();
}, 1000);

// -----------------------------------------------------------

const webPort = 8002;

app.use(express.json());
app.use(cors());

app.get('/', function(req, res){
  res.sendfile('./public/observer.htm');
});

app.get('/routes', function(req, res){
  res.json(dlm.routeMap);
});

app.get('/firmware', function(req, res){
  clog('Serving firmware to: '+req.ip);
  res.sendfile(path.resolve('../DroneNode/.pio/build/esp32doit-devkit-v1/firmware.bin'));
});

app.get('/file', (req, res) => {
  res.json(channelState);
});

app.get('/nodeFiles', (req, res) => {
  // return a json directory listing of /nodes
  var dirList = { };

  // get directories (i.e. nodes)
  fs.readdirSync('./public/nodes/').forEach(file => {
    clog(file);
    dirList[file] = {
      files: []
    }
  });

  // iterate back over directories and fetch files
  for (const [node, value] of Object.entries(dirList)) {
    fs.readdirSync('./public/nodes/' + node).forEach(file => {
      clog(file);
      dirList[node].files.push(file);
    });
  }

  res.json(dirList);
});


app.use(express.static('public'));

httpServer.listen(webPort, () => {
  clog(`Web UI available at http://localhost:${webPort}`)
})

// -----------------------------------------------------------
// Socket.IO
// -----------------------------------------------------------

const io = new Server(httpServer);
dlm.io = io;

io.on('connection', (socket) => {
  clog('Web UI client connected');

  // if we receive a message from a client for onward transmission
  socket.on('sendMsg', (msgBuffer)=>{
    var msg = new DLM.DroneLinkMsg(msgBuffer);
    //clog(('[.sM] recv: ' + msg.asString()).green );
    //handleLinkMsg(msg, 'socket');

    // queue for retransmission
    queueMsg(msg);
  });

  // query for existing routes
  socket.on('getRoutes', (msg)=>{
    // ask dlm to emit all existing routes
    dlm.emitAllRoutes();
  });

  // generate a RouteEntry request
  socket.on('getRoutesFor', (msg)=>{

    // ask dlm to query route entries
    dlm.getRoutesFor(msg.target, msg.subject);
  });
});



// -----------------------------------------------------------


function queueMsg(msg) {
  msgQueue.add(msg);
}


function sendMessages() {
  if (msgQueue.length() > 0) {
    var msg = msgQueue.shift();

    // dont send messages addressed to ourself!
    if (msg.node == sourceId) return;

    // hand to DLM to managge
    dlm.sendDroneLinkMessage(msg);
  }
}


setInterval(sendMessages, 50);
