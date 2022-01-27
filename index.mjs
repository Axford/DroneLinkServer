import udp from 'dgram';
import _ from 'lodash';
import path from 'path';
import colors from 'colors';
//import { Server } from "socket.io";
import socket_io from 'socket.io';
const { Server} = socket_io;

import * as DLM from './public/modules/droneLinkMsg.mjs';
import DroneLinkMsgQueue from './public/modules/DroneLinkMsgQueue.mjs';

//const broadcastAddress = require('broadcast-address');

import SerialPort from 'serialport';

import os from "os";
var hostname = os.hostname();
console.log(hostname);

//console.log('broadcast address: ', broadcastAddress('en0'));

import fs from 'fs';
import express from 'express';
const app = express();
const router = express.Router();
import cors from 'cors';
import http from 'http';
const httpServer = http.createServer(app);

import influxdb_client from '@influxdata/influxdb-client';
const  { InfluxDB } = influxdb_client;

var influxConfig = JSON.parse( fs.readFileSync('./influx.json') );

var env = hostname;
console.log('env: ' + env);

var fakeMode = influxConfig[env].mode == 'fake';
var fakeState = JSON.parse( fs.readFileSync('./fakeState.json') );

// network id
var sourceId = influxConfig[env].id ? influxConfig[env].id : 254;

if (fakeMode) console.log('Operating in fakeMode!!!');

// You can generate a Token from the "Tokens Tab" in the UI
const token = influxConfig[env].token;
const org = influxConfig[env].org;
const bucket = influxConfig[env].bucket;

const client = new InfluxDB({url: 'http://localhost:8086', token: token})


const { Point } = influxdb_client;
const writeApi = client.getWriteApi(org, bucket)

const queryApi = client.getQueryApi(org);

var channelState = {
  254: {
    networkInterface:'UDP'
  }
};
var msgQueue = new DroneLinkMsgQueue();

var lastDiscovered;

var openSerialPort;


const poly_tab = [
    0x00,0x07,0x0E,0x09,0x1C,0x1B,0x12,0x15,0x38,0x3F,0x36,0x31,0x24,0x23,0x2A,0x2D,
    0x70,0x77,0x7E,0x79,0x6C,0x6B,0x62,0x65,0x48,0x4F,0x46,0x41,0x54,0x53,0x5A,0x5D,
    0xE0,0xE7,0xEE,0xE9,0xFC,0xFB,0xF2,0xF5,0xD8,0xDF,0xD6,0xD1,0xC4,0xC3,0xCA,0xCD,
    0x90,0x97,0x9E,0x99,0x8C,0x8B,0x82,0x85,0xA8,0xAF,0xA6,0xA1,0xB4,0xB3,0xBA,0xBD,
    0xC7,0xC0,0xC9,0xCE,0xDB,0xDC,0xD5,0xD2,0xFF,0xF8,0xF1,0xF6,0xE3,0xE4,0xED,0xEA,
    0xB7,0xB0,0xB9,0xBE,0xAB,0xAC,0xA5,0xA2,0x8F,0x88,0x81,0x86,0x93,0x94,0x9D,0x9A,
    0x27,0x20,0x29,0x2E,0x3B,0x3C,0x35,0x32,0x1F,0x18,0x11,0x16,0x03,0x04,0x0D,0x0A,
    0x57,0x50,0x59,0x5E,0x4B,0x4C,0x45,0x42,0x6F,0x68,0x61,0x66,0x73,0x74,0x7D,0x7A,
    0x89,0x8E,0x87,0x80,0x95,0x92,0x9B,0x9C,0xB1,0xB6,0xBF,0xB8,0xAD,0xAA,0xA3,0xA4,
    0xF9,0xFE,0xF7,0xF0,0xE5,0xE2,0xEB,0xEC,0xC1,0xC6,0xCF,0xC8,0xDD,0xDA,0xD3,0xD4,
    0x69,0x6E,0x67,0x60,0x75,0x72,0x7B,0x7C,0x51,0x56,0x5F,0x58,0x4D,0x4A,0x43,0x44,
    0x19,0x1E,0x17,0x10,0x05,0x02,0x0B,0x0C,0x21,0x26,0x2F,0x28,0x3D,0x3A,0x33,0x34,
    0x4E,0x49,0x40,0x47,0x52,0x55,0x5C,0x5B,0x76,0x71,0x78,0x7F,0x6A,0x6D,0x64,0x63,
    0x3E,0x39,0x30,0x37,0x22,0x25,0x2C,0x2B,0x06,0x01,0x08,0x0F,0x1A,0x1D,0x14,0x13,
    0xAE,0xA9,0xA0,0xA7,0xB2,0xB5,0xBC,0xBB,0x96,0x91,0x98,0x9F,0x8A,0x8D,0x84,0x83,
    0xDE,0xD9,0xD0,0xD7,0xC2,0xC5,0xCC,0xCB,0xE6,0xE1,0xE8,0xEF,0xFA,0xFD,0xF4,0xF3
];

function CRC8() {
  return {
    calc: function(buf, len) {
      var pos = 0;
      var crc = 0;
      var i;
      while(len--) {
        i = (crc ^ buf[pos++]) & 0xFF;
        //crc = (poly_tab[i] ^ (crc << 8)) & 0xFF;
        crc = poly_tab[i];
      };
      return crc & 0xFF;
    }
  };
};

const crc8 = CRC8();


function bufferToHex (buffer) {
    return [...new Uint8Array (buffer)]
        .map (b => b.toString (16).padStart (2, "0"))
        .join (" ");
}

// -------------------------------------------------------------------------

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

// -------------------- telemetry decoder --------------------

class TelemetryDecoder {
  constructor() {
    this.msgBuffer = new Uint8Array(16+5+2);
    this.msgSize = 0;
    this.payloadLength = 0;
    this.state = 0;
    this.CRC = CRC8();
    /*
    0 = waiting for start
    1 = found start, waiting to confirm length
    2 = reading payload
    3 = checking CRC
    */
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



// --------------------creating a serial networkInterface --------------------

async function list() {
  return SerialPort.list();
 }

/*
list()
  .then((json)=> {
    console.log(json);
  });
*/

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


// --------------------creating a udp server --------------------

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
  var newMsg = new DLM.DroneLinkMsg(msg);

  // ignore messages from ourself!
  if (newMsg.source != 254) handleLinkMsg(newMsg, 'UDP');

  UDPReadyToTransit = true;

  //console.log('Data received from client : ' + msg.toString());
  //console.log('Received %d bytes from %s:%d\n',msg.length, info.address, info.port);
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


// -----------------------------------------------------------

const webPort = 8002;

app.use(express.json());
app.use(cors());

app.get('/', function(req, res){
  res.sendfile('./public/observer.htm');
});

app.get('/firmware', function(req, res){
  res.sendfile(path.resolve(__dirname+'/../.pio/build/esp32doit-devkit-v1/firmware.bin'));
});

app.get('/state', (req, res) => {
  res.json(fakeMode ? fakeState : channelState);
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

// TODO - retire /send
app.post('/send', (req, res) => {
  //res.json(channelState);
  console.log('Send got json: ',req.body);      // your JSON

  var newMsg = new DLM.DroneLinkMsg();
  newMsg.source = sourceId;
  newMsg.setAddress(req.body.addr);
  newMsg.msgType = req.body.msgType;
  newMsg.writable = false;
  newMsg.msgLength =DLM.DRONE_LINK_MSG_TYPE_SIZES[req.body.msgType] * req.body.values.length;

  if (newMsg.msgType ==DLM.DRONE_LINK_MSG_TYPE_CHAR) {
    newMsg.setString(req.body.values);

  } else if (newMsg.msgType ==DLM.DRONE_LINK_MSG_TYPE_UINT8_T) {
    for (var i=0; i<req.body.values.length; i++)
      newMsg.uint8_tPayload[i] = req.body.values[i];
  } else {
    var va = newMsg.valueArray();
    for (var i=0; i<req.body.values.length; i++)
      va[i] = req.body.values[i];
  }

  console.log('Queuing: ' + newMsg.asString() );

  queueMsg(newMsg);

  res.sendStatus(200);
});


app.get('/query', (req, res) => {

  if (fakeMode) {

    res.json([]);

  } else {
    var addr = req.query.addr;
    var start = req.query.start ? req.query.start : '15m';
    var aggr = req.query.aggr ? req.query.aggr : '1m';
    var valueName = req.query.valueName ? req.query.valueName : 'value0';
    var name = req.query.name ? req.query.name : 'location';

    var fluxQuery = 'from(bucket: "dronelink") |> range(start: -'+start+') |> filter(fn: (r) => r["addr"] == "'+addr+'") |> filter(fn: (r) => r["_field"] == "'+valueName+'") |> filter(fn: (r) => r["name"] == "'+name+'")|> aggregateWindow(every: '+aggr+', fn: last, createEmpty: false) |> yield(name: "last")';

    //console.log(fluxQuery);

    queryApi
       .collectRows(fluxQuery /*, you can specify a row mapper as a second arg */)
       .then(data => {
         //data.forEach(x => console.log(JSON.stringify(x)))
         var data2 = [];
         data.forEach(x => data2.push(_.pick(x, ['_time', '_value'])));
         res.json(data2);
         //console.log('\nCollect ROWS SUCCESS')
     })
     .catch(error => {
       console.error(error)
       console.log('\nCollect ROWS ERROR')
     })
  }
});

app.use(express.static('public'));

httpServer.listen(webPort, () => {
  console.log(`Listening at http://localhost:${webPort}`)
})

// -----------------------------------------------------------
// Socket.IO
// -----------------------------------------------------------

const io = new Server(httpServer);

io.on('connection', (socket) => {
  console.log('a user connected');

  socket.on('sendMsg', (msgBuffer)=>{
    var msg = new DLM.DroneLinkMsg(msgBuffer);
    console.log(('[.sM] recv: ' + msg.asString()).green );
    handleLinkMsg(msg, 'socket');

    // queue for retransmission
    queueMsg(msg);
  });
});



/*
httpServer.listen(8003, () => {
  console.log('listening on *:8003');
});
*/


// -----------------------------------------------------------


function queueMsg(msg) {
  msgQueue.add(msg);
}


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

setInterval(discovery, 500);

setInterval(sendMessages, 100);
