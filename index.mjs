
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

console.log(('Starting DroneLink Server...').green);

import os from "os";
var hostname = os.hostname();
console.log('Hostname: '+hostname);

//console.log('broadcast address: ', broadcastAddress('en0'));

import fs from 'fs';
import express from 'express';
const app = express();
const router = express.Router();
import cors from 'cors';
import http from 'http';
const httpServer = http.createServer(app);


var config = JSON.parse( fs.readFileSync('./config.json') );

var env = hostname;
//console.log('Env: ' + env);

console.log('Using config: ', config[env]);

// network id
var sourceId = config[env].id ? config[env].id : 254;
console.log('Using server node address: ' + sourceId);

// init DLM
var dlm = new DroneLinkManager(sourceId);

// prep msgQueue
var msgQueue = new DroneLinkMsgQueue();

// create interfaces
var udpi = new UDPInterface(dlm, 1);


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
    console.log(file);
    dirList[file] = {
      files: []
    }
  });

  // iterate back over directories and fetch files
  for (const [node, value] of Object.entries(dirList)) {
    fs.readdirSync('./public/nodes/' + node).forEach(file => {
      console.log(file);
      dirList[node].files.push(file);
    });
  }

  res.json(dirList);
});


app.use(express.static('public'));

httpServer.listen(webPort, () => {
  console.log(`Listening at http://localhost:${webPort}`)
})

// -----------------------------------------------------------
// Socket.IO
// -----------------------------------------------------------

const io = new Server(httpServer);
dlm.io = io;

io.on('connection', (socket) => {
  console.log('a user connected');

  // if we receive a message from a client for onward transmission
  socket.on('sendMsg', (msgBuffer)=>{
    var msg = new DLM.DroneLinkMsg(msgBuffer);
    console.log(('[.sM] recv: ' + msg.asString()).green );
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


setInterval(sendMessages, 100);
