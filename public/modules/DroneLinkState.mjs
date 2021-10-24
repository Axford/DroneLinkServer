
/*

  Synchronises and maintains state with the server over socket.io

*/

import io from '../libs/socketio/socket.io.esm.min.js';
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

    this.socket.on('DLM.name', function(msg) {
        //console.log('DLM.name', JSON.stringify(msg, null, 2));
        //_.merge(me.state, msg);
      });

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

    setInterval( ()=>{
      me.discovery();
      me.processDiscoveryQueue();
    }, 1000);


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
