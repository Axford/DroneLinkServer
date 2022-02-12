
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
  content: '[q]'.green + 'Quit   '+'[l]'.green+'Log   '+'[d]'.green+'Diagnostics   '+'[p]'.green+'Pause Log   '+'[f]'.green+'Firmware',
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


var firmwareBox = blessed.box({
  parent: screen,
  top: 2,
  left: 0,
  bottom:2,
  width: '100%',
  content: '',
  hidden:true,
  tags: true,
  style: {
    fg: 'white',
    bg: '#242a30'
  }
});


var firmwarePrimeButton = blessed.button({
  parent: firmwareBox,
  top: 0,
  left: '5%',
  width: '40%',
  height:3,
  content: '{center}Prime{/center}',
  tags: true,
  style: {
    fg: 'white',
    bg: '#242a30',
    hover: {
      bg: '#5f5',
      fg: 'black',
      border: {
        fg: '#5f5'
      }
    },
    border: {
      fg: '#545a60',
      bg: '#242a30'
    },
  },
  border: {
    type: 'line'
  },
});

var firmwareStartButton = blessed.button({
  parent: firmwareBox,
  top: 0,
  left: '55%',
  width: '40%',
  height:3,
  content: '{center}Start{/center}',
  tags: true,
  style: {
    fg: 'white',
    bg: '#242a30',
    hover: {
      bg: '#5f5',
      fg: 'black',
      border: {
        fg: '#5f5'
      }
    },
    border: {
      fg: '#545a60',
      bg: '#242a30'
    },
  },
  border: {
    type: 'line'
  },
});


var firmwareStatusBox = blessed.box({
  parent: firmwareBox,
  top: 10,
  left: '5%',
  bottom: 2,
  width: '90%',
  content: '',
  tags: true,
  style: {
    fg: 'white',
    bg: '#242a30'
  }
});

var firmwareProgressBox = blessed.ProgressBar({
  parent: firmwareBox,
  top: 5,
  left: '5%',
  height:3,
  width: '90%',
  orientation: 'horizontal',
  content: '',
  tags: true,
  style: {
    fg: 'white',
    bg: '#242a30',
    bar: {
      bg:'#5f5'
    },
    border: {
      fg: '#545a60',
      bg: '#242a30'
    },
  },
  border: {
    type: 'line'
  }
});


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
  firmwareBox.hide();
  screen.render();
});

screen.key(['d'], function(ch, key) {
  logBox.hide();
  logOptionsBox.hide();
  diagnosticsBox.show();
  firmwareBox.hide();
  screen.render();
});

screen.key(['p'], function(ch, key) {
  pauseLog = !pauseLog;
});

screen.key(['f'], function(ch, key) {
  logBox.hide();
  logOptionsBox.hide();
  diagnosticsBox.hide();
  firmwareBox.show();
  screen.render();
});

firmwarePrimeButton.on('click', ()=>{
  dlm.primeFirmwareUpdate();
})

firmwareStartButton.on('click', ()=>{
  dlm.startFirmwareUpdate();
})

screen.render();


function durationToStr(dur) {
  var s = '';
  var minutes = Math.floor(dur/60);
  var seconds = dur - minutes*60;
  s += (minutes > 0 ? minutes.toFixed(0) + 'm ' : '') + seconds.toFixed(0) + 's';
  return s;
}


// update firmware status box
// TODO - make this not a crappy hack
setInterval(()=>{
  var s = '';

  s += 'Firmware: ' + dlm.firmwarePath + '\n\n';
  s += 'Firmware size: ' + dlm.firmwareSize + '\n';
  if (dlm.firmwareSending && dlm.firmwarePos < dlm.firmwareSize) {
    var dur = (Date.now() - dlm.firmwareStartTime)/1000;
    var totalDur =  dlm.firmwarePos > 0 ? dlm.firmwareSize * dur / dlm.firmwarePos : 0;
    s += 'Duration: ' + durationToStr(dur) + '\n';
    s += 'Est. total Duration: ' + durationToStr(totalDur) + '\n';
    s += 'Pos: ' + dlm.firmwarePos + '('+ (100 * dlm.firmwarePos / dlm.firmwareSize).toFixed(1) +'%)\n';
    s += 'Write rate: '+ (dlm.firmwarePos / dur).toFixed(1) + ' bytes/s\n';
    s += 'Packets Sent: ' + dlm.firmwarePacketsSent + '\n';
    s += 'Target transmit rate: ' + dlm.firmwareTransmitRate.toFixed(0) + ' packets/sec\n';
    s += 'Average transmit rate: ' + (dlm.firmwarePacketsSent / dur).toFixed(0) + ' packets/sec\n';
    s += 'Rewinds: ' + dlm.firmwareRewinds + '('+(dlm.rewindRate).toFixed(1) +' /s)\n';
  }

  s += '\n';

  s += '{bold}Nodes primed to receive:{/bold}\n';

  for (const [key, node] of Object.entries(dlm.firmwareNodes)) {
    s += '  '+ key + ' - '+ (node.ready == 1 ? 'Ready' : 'Error') +'\n';
  }

  firmwareStatusBox.content = s;
  firmwareProgressBox.setProgress(100 * dlm.firmwarePos / dlm.firmwareSize);
  screen.render();
}, 1000);


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

var firmwarePath = config[env].firmwarePath;
clog('Firmware path: ' + firmwarePath);

// init DLM
var dlm = new DroneLinkManager(sourceId, clog);
dlm.firmwarePath = firmwarePath;

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
      s += ', Age: ' + durationToStr((Date.now()-nodeInfo.lastHeard)/1000);
      s += ', Uptime: '+durationToStr(nodeInfo.uptime/1000);
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
  res.sendfile(firmwarePath);
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
