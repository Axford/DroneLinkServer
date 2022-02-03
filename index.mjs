
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

/*
function bufferToHex (buffer) {
    return [...new Uint8Array (buffer)]
        .map (b => b.toString (16).padStart (2, "0"))
        .join (" ");
}
*/

// -------------------------------------------------------------------------

/*
function handleLinkMsg(msg, networkInterface) {

  var doStore = false;

  var newState = {};

  var now = (new Date()).getTime();

  // emit raw
  if (networkInterface != 'socket') {
    //if (msg.node == 2 && msg.channel == 7) console.log(('emit: ' + msg.asString()).red);
    io.emit('DLM.msg', msg.encodeUnframed());
  } else {
    // rewrite networkInterface to existing value
    if (channelState[msg.node] && channelState[msg.node].networkInterface) {
      networkInterface = channelState[msg.node].networkInterface;
    } else {
      networkInterface = '';
    }
  }

  // decide which networkInterface to listen to
  if (channelState[msg.node] && channelState[msg.node].networkInterface) {
    // we already have an active networkInterface...
    // Priority is UDP, then Telemetry
    var networkInterfaceAge = now - channelState[msg.node].lastHeard;
    //console.log('age', networkInterfaceAge);

    // switch to telemetry
    if (networkInterface == 'Telemetry' && channelState[msg.node].networkInterface == 'UDP') {
      if (networkInterfaceAge < 5000) {
        // UDP still seems to be active, so stick with it and ignore this msg
        return;
      } else {
        console.log('Switch to '+networkInterface);
      }
    }

    // switch to UDP
    if (networkInterface == 'UDP' && channelState[msg.node].networkInterface != 'UDP') {
      // yup...  lets stick with this msg and let it override the active networkInterface
      console.log('Switch to '+networkInterface);
    }

  }

  console.log(networkInterface + ': '+ msg.asString());

  if (msg.msgType !=DLM.DRONE_LINK_MSG_TYPE_QUERY && msg.msgType !=DLM.DRONE_LINK_MSG_TYPE_NAMEQUERY) {
    newState[msg.node] = {
      channels: {},
      lastHeard: now,
      networkInterface: networkInterface,
      lastHeard:now
    }
    newState[msg.node].channels[msg.channel] = {
      params: {},
      lastHeard: now
    }
    newState[msg.node].channels[msg.channel].params[msg.param] = {

    };
  }


  // handle param types
  if (msg.msgType ==DLM.DRONE_LINK_MSG_TYPE_NAME) {
    const paramName = msg.payloadToString();
    //console.log('Received param name: ', paramName)
    newState[msg.node].channels[msg.channel].params[msg.param].name = paramName;
    io.emit('DLM.name', newState);
    //console.log('DLN.name');

  } else if (msg.msgType ==DLM.DRONE_LINK_MSG_TYPE_QUERY || msg.msgType ==DLM.DRONE_LINK_MSG_TYPE_NAMEQUERY) {
    // do nothing
  } else {
    // update channel state
    newState[msg.node].channels[msg.channel].params[msg.param].msgType = msg.msgType;
    newState[msg.node].channels[msg.channel].params[msg.param].bytesPerValue = msg.bytesPerValue();
    newState[msg.node].channels[msg.channel].params[msg.param].numValues = msg.numValues();
    newState[msg.node].channels[msg.channel].params[msg.param].values = Array.from( msg.valueArray() );
    newState[msg.node].channels[msg.channel].params[msg.param].writable = msg.writable;

    doStore = false;

    // is this a module name?
    if (msg.msgType ==DLM.DRONE_LINK_MSG_TYPE_CHAR && msg.param == 2) {
      newState[msg.node].channels[msg.channel].name = msg.payloadToString();
    }

    // send state fragment by socket.io
    if (newState[msg.node].channels[msg.channel].params[msg.param].values.length > 0) {
      io.emit('DLM.value', newState);
      //console.log('DLM.value');
    }

  }


  _.merge(channelState, newState);

  var paramName = '';
  if (channelState[msg.node] &&
    channelState[msg.node].channels[msg.channel] &&
    channelState[msg.node].channels[msg.channel].params[msg.param] &&
     channelState[msg.node].channels[msg.channel].params[msg.param].name)
    paramName += channelState[msg.node].channels[msg.channel].params[msg.param].name;

  if (doStore) msg.store(writeApi, Point, paramName);
}
*/

// -------------------- telemetry decoder --------------------
/*
class TelemetryDecoder {
  constructor() {
    this.msgBuffer = new Uint8Array(16+5+2);
    this.msgSize = 0;
    this.payloadLength = 0;
    this.state = 0;
    this.CRC = CRC8();

    //0 = waiting for start
    //1 = found start, waiting to confirm length
    //2 = reading payload
    //3 = checking CRC
  }

  decode(buffer) {
    for (var i=0; i<buffer.length; i++) {
      switch(this.state) {
        case 0: // waiting for start
          if (buffer[i] == 0xFE) {
            this.state = 1;
            this.msgSize = 0;
            this.payloadLength = 0;
          }
          break;

        case 1: // found start, waiting to confirm length
          // we skip the start byte, so we're filling the buffer from node
          // node  chan  param  paramTypeLen
          this.msgBuffer[this.msgSize] = buffer[i];
          if (this.msgSize == 4) {
            // made it to the payload type/length byte
            this.payloadLength = (buffer[i] & 0x0F)+1;
            //console.log('payload length:' + this.payloadLength);
            this.state = 2;
          }
          this.msgSize++;
          break;

        case 2: // reading payload
          this.msgBuffer[this.msgSize] = buffer[i];
          if (this.msgSize == (this.payloadLength + 3)) {
            this.state = 3;
          }
          this.msgSize++;

          break;

        case 3: // reached checksum byte
          //console.log('received: '+this.msgSize);
          //console.log(bufferToHex(this.msgBuffer));
          const crc = this.CRC.calc(this.msgBuffer, this.msgSize);
          //console.log('CRC: ' + crc + ' vs ' + buffer[i]);
          if (crc == buffer[i]) {
            //console.log('CRC matches');
            var newMsg = new DLM.DroneLinkMsg(this.msgBuffer);
            handleLinkMsg(newMsg, 'Telemetry');
            //console.log(newMsg);
          } else {
            console.log('CRC fail');
          }
          this.state = 0;
          break;
      }
    }
  }
}

const decoder = new TelemetryDecoder();
*/


// --------------------creating a serial networkInterface --------------------
/*
async function list() {
  return SerialPort.list();
 }

function attemptToOpenSerial() {
  //
  try {
    ///dev/tty.SLAB_USBtoUART
    const port = new SerialPort(influxConfig[env].telemetryPort, {
      baudRate: 57600
    });

    // Open errors will be emitted as an error event
    port.on('error', function(err) {
      console.log('Error: ', err.message);

      openSerialPort = null;

      // wait a while, then try to open port again
      setTimeout(attemptToOpenSerial, 10000);
    })

    port.on('readable', function () {
      openSerialPort = port;

      decoder.decode(port.read());
    })
  } catch(err) {
    console.err(err);
  }
}

if (!fakeMode && (influxConfig[env].telemetryPort && (influxConfig[env].telemetryPort != ""))) attemptToOpenSerial();
*/

// --------------------creating a udp server --------------------
/*
var UDPReadyToTransit = false;

// creating a udp server
var server = udp.createSocket('udp4');

// emits when any error occurs
server.on('error',function(error){
  console.log('Error: ' + error);
  server.close();
});

// emits on new datagram msg
server.on('message',function(msg,info){
  UDPReadyToTransit = true;

  //console.log('Data received from client : ' + msg.toString());
  console.log('Received %d bytes from %s:%d\n',msg.length, info.address, info.port);
});

//emits when socket is ready and listening for datagram msgs
server.on('listening',function(){
  var address = server.address();
  var port = address.port;
  var family = address.family;
  var ipaddr = address.address;
  console.log('Server is listening at port' + port);
  console.log('Server ip :' + ipaddr);
  console.log('Server is IP4/IP6 : ' + family);
});

//emits after the socket is closed using socket.close();
server.on('close',function(){
  console.log('Socket is closed !');
});

if (!fakeMode) {
  server.bind(8007, () => {
    server.setBroadcast(true);
  });
}
*/

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
    //queueMsg(msg);
  });
});


// -----------------------------------------------------------


function queueMsg(msg) {
  msgQueue.add(msg);
}

/*
var discoveryNodeIndex = 0,
    discoveryChannelIndex = 0;

function discovery() {
  if (fakeMode) return;

  //console.log('Discovering...');

  // iterate over all nodes
  _.forOwn(channelState, function(nodeVal, nodeKey) {

    var maxChannel = 0;

    // iterate over channels with node, ignore ourselves
    if (nodeKey != 254)
    _.forOwn(channelState[nodeKey].channels, function(value, key) {

      if (key > maxChannel) maxChannel = key;

      // check status
      if (channelState[nodeKey].channels[key].params[1] == undefined) {
        console.log('Unknown status for: ' + key);

        var newMsg = new DLM.DroneLinkMsg();

        newMsg.source = sourceId;
        newMsg.node = nodeKey;
        newMsg.channel = key;
        newMsg.param = 1;
        newMsg.msgType =DLM.DRONE_LINK_MSG_TYPE_QUERY;
        newMsg.msgLength = 1;
        newMsg.uint8_tPayload[0] = 0;

        if (!newMsg.sameSignature(lastDiscovered)) {
          queueMsg(newMsg);
          lastDiscovered = newMsg;
        }

      }

      // check name
      if (!channelState[nodeKey].channels[key].params[2]) {
        //console.log('Unknown name for: ' + key);

        var newMsg = new DLM.DroneLinkMsg();

        newMsg.source = sourceId;
        newMsg.node = nodeKey;
        newMsg.channel = key;
        newMsg.param = 2;
        newMsg.msgType =DLM.DRONE_LINK_MSG_TYPE_QUERY;
        newMsg.msgLength = 1;
        newMsg.uint8_tPayload[0] = 0;

        if (!newMsg.sameSignature(lastDiscovered)) {
          queueMsg(newMsg);
          lastDiscovered = newMsg;
        }
      }

      // check type
      if (!channelState[nodeKey].channels[key].params[5]) {
        //console.log('Unknown name for: ' + key);

        var newMsg = new DLM.DroneLinkMsg();

        newMsg.source = sourceId;
        newMsg.node = nodeKey;
        newMsg.channel = key;
        newMsg.param = 5;
        newMsg.msgType =DLM.DRONE_LINK_MSG_TYPE_QUERY;
        newMsg.msgLength = 1;
        newMsg.uint8_tPayload[0] = 0;

        if (!newMsg.sameSignature(lastDiscovered)) {
          queueMsg(newMsg);
          lastDiscovered = newMsg;
        }
      }

      // check error
      if (!channelState[nodeKey].channels[key].params[3]) {
        //console.log('Unknown error code for: ' + key);

        var newMsg = new DLM.DroneLinkMsg();

        newMsg.source = sourceId;
        newMsg.node = nodeKey;
        newMsg.channel = key;
        newMsg.param = 3;
        newMsg.msgType =DLM.DRONE_LINK_MSG_TYPE_QUERY;
        newMsg.msgLength = 1;
        newMsg.uint8_tPayload[0] = 0;

        if (!newMsg.sameSignature(lastDiscovered)) {
          queueMsg(newMsg);
          lastDiscovered = newMsg;
        }
      }


      // check params
      _.forOwn(channelState[nodeKey].channels[key].params, function(mvalue, mkey) {

        if (!channelState[nodeKey].channels[key].params[mkey].name) {
          //console.log('Undefined param name for: '+ nodeKey + '>' + key +'.' + mkey);

          var newMsg = new DLM.DroneLinkMsg();

          newMsg.source = sourceId;
          newMsg.node = nodeKey;
          newMsg.channel = key;
          newMsg.param = mkey;
          newMsg.msgType =DLM.DRONE_LINK_MSG_TYPE_NAMEQUERY;
          newMsg.msgLength = 1;
          newMsg.uint8_tPayload[0] = 0;

          if (!newMsg.sameSignature(lastDiscovered)) {
            queueMsg(newMsg);
            lastDiscovered = newMsg;
          }

          //return false; // stop iterating
        }

      });
    });

  });

  // publish own name
  var newMsg = new DLM.DroneLinkMsg();

  newMsg.source = sourceId;
  newMsg.node = sourceId;
  newMsg.channel = 1;
  newMsg.param = 8;
  newMsg.msgType =DLM.DRONE_LINK_MSG_TYPE_CHAR;
  newMsg.setString('Server');

  queueMsg(newMsg);

  //console.log(JSON.stringify(channelState, null, 2));
}
*/


function sendMessages() {
  if (msgQueue.length() > 0) {
    var msg = msgQueue.shift();

    // dont send messages addressed to ourself!
    if (msg.node == 254) return;

    // lookup target node and associated networkInterface
    if (channelState[msg.node] && channelState[msg.node].networkInterface) {


      // emit everything over socket.io
      io.emit('DLM.msg', msg.encodeUnframed());

      if (channelState[msg.node].networkInterface == 'Telemetry') {

        // attempt to send by telemetry
        if (openSerialPort) {
          console.log(('Send by Telemetry: ' + msg.asString()).yellow);
          openSerialPort.write(msg.encode());
        }

      } else if (channelState[msg.node].networkInterface == 'UDP') {

        // attempt to send by UDP
        if (server && UDPReadyToTransit) {
          console.log(('Send by UDP: ' + msg.asString()).yellow);
          server.send(msg.encodeUnframed(), 8007, '255.255.255.255', function(error){
            if(error){
              UDPReadyToTransit = false;
              console.error('BLERGH '+ error);
            }else{
              //console.log('Data sent !!!');
            }

          });
        }
      } else {
        console.log( ('unknwon interface ' + channelState[msg.node].networkInterface + ' for ' + msg.asString()).red );
      }


    } else {
      console.error('Unable to send, node networkInterface undefined');
    }

  }
}

//setInterval(discovery, 500);

setInterval(sendMessages, 100);
