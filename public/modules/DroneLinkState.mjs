
/*

  Synchronises and maintains state with the server over socket.io

*/

import io from '../libs/socketio/socket.io.esm.min.mjs';
import * as DLM from './droneLinkMsg.mjs';
import DroneLinkMsgQueue from './DroneLinkMsgQueue.mjs';


function arraysEqual(a,b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (a.length !== b.length) return false;

  // If you don't care about the order of the elements inside
  // the array, you should sort both arrays here.
  // Please note that calling sort on an array will modify that array.
  // you might want to clone your array first.

  //console.log(a,b);

  for (var i = 0; i < a.length; ++i) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}


export default class DroneLinkState {

  constructor() {
    var me = this;
    this.state = {};
    this.socket = io();
    this.discoveryQueue = new DroneLinkMsgQueue();
    this.callbacks = {}; // each key is an event type, values are an array of callback functions
    this.liveMode = false;  // set to false to stop using the socket (i.e. log playback mode)

    this.socket.on('DLM.msg',function(msgBuffer) {
      if (!me.liveMode) return;

      var msg = new DLM.DroneLinkMsg(msgBuffer);
      //if (msg.node == 2 && msg.channel == 7)
      //  console.log('DLM.msg: ' + msg.asString());
      me.handleLinkMsg(msg);

      me.trigger('raw', msg);
    });

    setInterval( ()=>{
      me.discovery();
    }, 1000);

    setInterval( ()=>{
      me.processDiscoveryQueue();
    }, 200);
  }


  reset() {
    // TODO
  }


  goLive() {
    this.liveMode =true;
  }


  handleLinkMsg(msg) {
    var me = this;
    var now = (new Date()).getTime();
    //console.log('hLM', msg.asString());

    // new node?
    if (!me.state.hasOwnProperty(msg.node)) {
      // trigger node.new event
      me.trigger('node.new', msg.node);

      // speculative hostname query
      var qm = new DLM.DroneLinkMsg();
      qm.source = 253;
      qm.node = msg.node;
      qm.channel = 1;
      qm.param = 8;
      qm.msgType = DLM.DRONE_LINK_MSG_TYPE_QUERY;
      qm.msgLength = 1;
      me.send(qm);

      // speculative Nav type query
      /*
      qm = new DLM.DroneLinkMsg();
      qm.source = 253;
      qm.node = msg.node;
      qm.channel = 7;
      qm.param = DLM.DRONE_MODULE_PARAM_TYPE;
      qm.msgType = DLM.DRONE_LINK_MSG_TYPE_QUERY;
      qm.msgLength = 1;
      me.send(qm);
      */
    }

    //console.log(msg.channel, mvalue);
    // new channel (module) ?
    if (!me.state.hasOwnProperty(msg.node) ||
        !me.state[msg.node].channels.hasOwnProperty(msg.channel)) {
      me.trigger('module.new', { node: msg.node, channel:msg.channel });

      // queue a type query
      var qm = new DLM.DroneLinkMsg();
      qm.source = 253;
      qm.node = msg.node;
      qm.channel = msg.channel;
      qm.param = DLM.DRONE_MODULE_PARAM_TYPE;
      qm.msgType = DLM.DRONE_LINK_MSG_TYPE_QUERY;
      qm.msgLength = 1;
      me.send(qm);

      // queue a name query
      qm = new DLM.DroneLinkMsg();
      qm.source = 253;
      qm.node = msg.node;
      qm.channel = msg.channel;
      qm.param = DLM.DRONE_MODULE_PARAM_NAME;
      qm.msgType = DLM.DRONE_LINK_MSG_TYPE_QUERY;
      qm.msgLength = 1;
      me.send(qm);
    } else {
      // heard module
      me.trigger('module.heard', { node: msg.node, channel:msg.channel });
    }


    var newParam = false;

    // new param?
    if (!me.state.hasOwnProperty(msg.node) ||
        !me.state[msg.node].channels.hasOwnProperty(msg.channel) ||
        (!me.state[msg.node].channels[msg.channel].params.hasOwnProperty(msg.param))) {

      // make sure we only trigger on proper data types
      if (msg.msgType <= DLM.DRONE_LINK_MSG_TYPE_NAME) {
        //console.log('param.new: ' + msg.node + '>' + msg.channel + '.' + msg.param);
        me.trigger('param.new', { node: msg.node, channel:msg.channel, param:msg.param });
        newParam = true;

        if (msg.msgType <= DLM.DRONE_LINK_MSG_TYPE_CHAR) {
          // new module type?
          if (msg.param == DLM.DRONE_MODULE_PARAM_TYPE) {
            console.log('module.type: ' + msg.valueArray()[0]);
            me.trigger('module.type', { node: msg.node, channel:msg.channel, type:msg.valueArray()[0] });
          }

          // new module name?
          if (msg.param == DLM.DRONE_MODULE_PARAM_NAME) {
            console.log('module.name: ' + msg.valueArray()[0]);
            me.trigger('module.name', { node: msg.node, channel:msg.channel, name:msg.valueArray()[0] });
          }
        }
      }
    }

    // normal value?
    if (msg.msgType <= DLM.DRONE_LINK_MSG_TYPE_NAME) {
      // new value?
      if (newParam ||
          !arraysEqual(me.state[msg.node].channels[msg.channel].params[msg.param].values, Array.from(msg.valueArray()) )) {
        //console.log('param.value: ' + msg.node + '>' + msg.channel + '.' + msg.param, msg[msg.node].channels[msg.channel].params[msg.param].values);
        me.trigger('param.value', { node: msg.node, channel:msg.channel, param: msg.param, msgType: msg.msgType, values:Array.from(msg.valueArray()) });
      }
    }

    // create newState object and merge
    var newState ={};
    newState[msg.node] = {
      channels: {},
      lastHeard: now,
      interface: 'socket',
      lastHeard:now
    }
    newState[msg.node].channels[msg.channel] = {
      params: {},
      lastHeard: now
    }

    if (msg.msgType != DLM.DRONE_LINK_MSG_TYPE_QUERY && msg.msgType != DLM.DRONE_LINK_MSG_TYPE_NAMEQUERY) {
      newState[msg.node].channels[msg.channel].params[msg.param] = { };

      if (msg.msgType == DLM.DRONE_LINK_MSG_TYPE_NAME) {
        newState[msg.node].channels[msg.channel].params[msg.param].name = msg.payloadToString();
        console.log('param name', newState[msg.node].channels[msg.channel].params[msg.param].name);
        me.trigger('param.name', { node: msg.node, channel:msg.channel, param: msg.param, msgType: msg.msgType, name: msg.payloadToString() });
      } else {
        // update channel state
        newState[msg.node].channels[msg.channel].params[msg.param].msgType = msg.msgType;
        newState[msg.node].channels[msg.channel].params[msg.param].bytesPerValue = msg.bytesPerValue();
        newState[msg.node].channels[msg.channel].params[msg.param].numValues = msg.numValues();
        newState[msg.node].channels[msg.channel].params[msg.param].values = Array.from(msg.valueArray());
        newState[msg.node].channels[msg.channel].params[msg.param].writable = msg.writable;

        // is this a module name?
        if (msg.msgType == DLM.DRONE_LINK_MSG_TYPE_CHAR && msg.param == 2) {
          newState[msg.node].channels[msg.channel].name = msg.payloadToString();
        }

        // is this a node name (hostname)?
        if (msg.msgType == DLM.DRONE_LINK_MSG_TYPE_CHAR && msg.channel == 1 && msg.param == 8) {
          newState[msg.node].name = msg.payloadToString();
        }
      }
    }

    _.merge(me.state, newState);


  }


  on(name, cb) {
    if (!this.callbacks.hasOwnProperty(name)) {
      this.callbacks[name] = [];
    }
    this.callbacks[name].push(cb);
  }

  trigger(name, param) {
    if (this.callbacks[name]) {
      this.callbacks[name].forEach((cb)=>{
        //console.log('trigger('+name+'): ', param);
        cb(param);
      })
    }
  }

  send(msg) {
    if(!this.liveMode) return; // sending disabled if not live
    this.discoveryQueue.add(msg);
  }

  discovery() {
    // look for missing names and types

  }


  processDiscoveryQueue() {
    this.discoveryQueue.process(this.socket);
  }


  getParamValues(node, channel, param, def) {
    var obj = this.getParamObj(node, channel, param);
    if (obj != null && obj.values && obj.values.length == def.length) {
      return obj.values;
    }
    return def;
  }

  getParamObj(node, channel, param) {
    if (this.state.hasOwnProperty(node) &&
        this.state[node].channels.hasOwnProperty(channel) &&
        this.state[node].channels[channel].params.hasOwnProperty(param))
    {
      return this.state[node].channels[channel].params[param];
    } else
      return null;
  }

  getObjectsForAddress(node, channel, param) {
    var ret = {
      node: null,
      channel: null,
      param: null
    }

    if (this.state.hasOwnProperty(node)) {
      ret.node = this.state[node];

      if (this.state[node].channels.hasOwnProperty(channel)) {
        ret.channel = this.state[node].channels[channel];

        if (this.state[node].channels[channel].params.hasOwnProperty(param)) {
          ret.param = this.state[node].channels[channel].params[param];
        }
      }
    }

    return ret;
  }


  exportAsJSON() {
    var json = JSON.stringify(this.state, null, ' ');
    console.log(json);
    return json;
  }

  importFromJSON(json) {
    // TODO
  }


}
