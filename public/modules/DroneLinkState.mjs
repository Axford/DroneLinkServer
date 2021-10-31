
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


    this.socket.on('DLM.msg',function(msgBuffer) {
      var msg = new DLM.DroneLinkMsg(msgBuffer);
      //if (msg.node == 2 && msg.channel == 7)
      //  console.log('DLM.msg: ' + msg.asString());
      me.handleLinkMsg(msg);
    });


    /*
    this.socket.on('DLM.value', function(msg) {
        //console.log('DLM.value', JSON.stringify(msg, null, 2));

        // iterate over event nodes
        for (const [key, value] of Object.entries(msg)) {

          // new node?
          if (!me.state.hasOwnProperty(key)) {
            // trigger node.new event
            me.trigger('node.new', key);

            // speculative hostname query
            var qm = new DLM.DroneLinkMsg();
            qm.source = 253;
            qm.node = key;
            qm.channel = 1;
            qm.param = 8;
            qm.msgType = DLM.DRONE_LINK_MSG_TYPE_QUERY;
            qm.msgLength = 1;
            me.send(qm);

            // speculative Nav type query
            qm = new DLM.DroneLinkMsg();
            qm.source = 253;
            qm.node = key;
            qm.channel = 7;
            qm.param = DLM.DRONE_MODULE_PARAM_TYPE;
            qm.msgType = DLM.DRONE_LINK_MSG_TYPE_QUERY;
            qm.msgLength = 1;
            me.send(qm);
          }

          // iterate over event channels
          for (const [mkey, mvalue] of Object.entries(msg[key].channels)) {
            //console.log(mkey, mvalue);
            // new channel (module) ?
            if (!me.state.hasOwnProperty(key) ||
                (me.state.hasOwnProperty(key) &&
                 !me.state[key].channels.hasOwnProperty(mkey))) {
              //console.log('module.new: ' + key + '>' + mkey);
              //me.trigger('module.new', { node: key, channel:mkey });

              // queue a type query
              var qm = new DLM.DroneLinkMsg();
              qm.source = 253;
              qm.node = key;
              qm.channel = mkey;
              qm.param = DLM.DRONE_MODULE_PARAM_TYPE;
              qm.msgType = DLM.DRONE_LINK_MSG_TYPE_QUERY;
              qm.msgLength = 1;
              me.send(qm);

              // queue a name query
              qm = new DLM.DroneLinkMsg();
              qm.source = 253;
              qm.node = key;
              qm.channel = mkey;
              qm.param = DLM.DRONE_MODULE_PARAM_NAME;
              qm.msgType = DLM.DRONE_LINK_MSG_TYPE_QUERY;
              qm.msgLength = 1;
              me.send(qm);
            }

            // iterate over event params
            for (const [pkey, pvalue] of Object.entries(msg[key].channels[mkey].params)) {
              var newParam = false;

              // new param?
              if (!me.state.hasOwnProperty(key) ||
                  !me.state[key].channels.hasOwnProperty(mkey) ||
                  (!me.state[key].channels[mkey].params.hasOwnProperty(pkey))) {
                //console.log('param.new: ' + key + '>' + mkey + '.' + pkey);
                me.trigger('param.new', { node: key, channel:mkey, param:pkey });
                newParam = true;

                // new module type?
                if (pkey == DLM.DRONE_MODULE_PARAM_TYPE) {
                  //console.log('module.type: ' + pvalue.values);
                  me.trigger('module.type', { node: key, channel:mkey, type:pvalue.values[0] });
                }

                // new module name?
                if (pkey == DLM.DRONE_MODULE_PARAM_NAME) {
                  //console.log('module.name: ' + pvalue.values);
                  me.trigger('module.name', { node: key, channel:mkey, name:pvalue.values[0] });
                }
              }

              // normal value?
              if (pvalue.msgType <= DLM.DRONE_LINK_MSG_TYPE_CHAR) {
                // new value?
                if (newParam ||
                    !arraysEqual(me.state[key].channels[mkey].params[pkey].values,
                                msg[key].channels[mkey].params[pkey].values) ) {
                  //console.log('param.value: ' + key + '>' + mkey + '.' + pkey, msg[key].channels[mkey].params[pkey].values);
                  me.trigger('param.value', { node: key, channel:mkey, param: pkey, msgType: pvalue.msgType, values:pvalue.values });
                }
              }


            };
          };
        }

        _.merge(me.state, msg);
      });
      */

    setInterval( ()=>{
      me.discovery();
      me.processDiscoveryQueue();
    }, 1000);
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
      qm = new DLM.DroneLinkMsg();
      qm.source = 253;
      qm.node = msg.node;
      qm.channel = 7;
      qm.param = DLM.DRONE_MODULE_PARAM_TYPE;
      qm.msgType = DLM.DRONE_LINK_MSG_TYPE_QUERY;
      qm.msgLength = 1;
      me.send(qm);
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

    // normal value?
    if (msg.msgType <= DLM.DRONE_LINK_MSG_TYPE_CHAR) {
      // new value?
      if (newParam ||
          !arraysEqual(me.state[msg.node].channels[msg.channel].params[msg.param].values, Array.from(msg.valueArray()) ) ) {
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
    newState[msg.node].channels[msg.channel].params[msg.param] = { };

    if (msg.msgType != DLM.DRONE_LINK_MSG_TYPE_QUERY && msg.msgType != DLM.DRONE_LINK_MSG_TYPE_NAMEQUERY) {
      if (msg.msgType == DLM.DRONE_LINK_MSG_TYPE_NAME) {
        newState[msg.node].channels[msg.channel].params[msg.param].name = msg.payloadToString();;
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
    this.discoveryQueue.add(msg);
  }

  discovery() {
    // look for missing names and types

  }


  processDiscoveryQueue() {
    this.discoveryQueue.process(this.socket);
  }





}
