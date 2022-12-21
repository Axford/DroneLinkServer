
/*

  Synchronises and maintains state with the server over socket.io

*/

import * as DLM from './droneLinkMsg.mjs';
import DroneLinkMsgQueue from './DroneLinkMsgQueue.mjs';

import { getFirestore,  collection, doc, setDoc, query, onSnapshot, where, deleteField, updateDoc } from "https://www.gstatic.com/firebasejs/9.14.0/firebase-firestore.js";



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

  constructor(socket, db) {
    var me = this;
    this.state = {};
    this.socket = socket;
    this.db = db;
    this.localAddress = 250; // default, overriden in observer.js
    this.discoveryQueue = new DroneLinkMsgQueue();
    this.callbacks = {}; // each key is an event type, values are an array of callback functions
    this.liveMode = false;  // set to false to stop using the socket (i.e. log playback mode)

    this.socket.on('DLM.msg',function(msgBuffer) {
      if (!me.liveMode) return;

      var msg = new DLM.DroneLinkMsg(msgBuffer);
      //if (msg.node == 2 && msg.channel == 7)
      //  console.log('DLM.msg: ' + msg.asString());
      me.handleLinkMsg(msg, true, 'socket');

      me.trigger('raw', msg);
    });

    // create firestore snapshot and thereby gather an initial state 
    const q = query(collection(me.db, "nodes"), where("id", "<", 255 ));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added" || change.type == "modified") {
          //console.log('firebase change', change);
          // use to build initial state, if not heard before
          var nodeId = parseInt(change.doc.id);

          if (!me.state.hasOwnProperty(nodeId)) {

            console.log("Firebase, New node");
            var docData = change.doc.data();
            me.processNewNodeState(docData);
          } 

          // do we sync the visScript?
          console.log('checking visScript', nodeId);
          if (me.state.hasOwnProperty(nodeId) &&
              !me.state[nodeId].visScriptLoaded) {
            
              me.state[nodeId].visScriptLoaded = true;

              var docData = change.doc.data();

              // extract visualisation if present
              if (docData.visualisation > '' && me.state[nodeId].visualisation == '') {
                console.log('updating visScript', docData.visualisation);
                //console.log('updating vis:',nodeState.visualisation );
                me.state[nodeId].visualisation = docData.visualisation;

                me.trigger('node.visualisation', nodeId);
              }
          }
        }
        if (change.type === "removed") {
          //console.log("Firebase, Removed node: ", change.doc.data());
        }
      });
    });


    setInterval( ()=>{
      me.discovery();
    }, 1000);

    setInterval( ()=>{
      me.processDiscoveryQueue();
    }, 50);

    setInterval( ()=>{
      me.updateFirebase();
    }, 1000);
  }


  reset() {
    // TODO
  }


  goLive() {
    this.liveMode =true;
  }


  processNewNodeState(nodeState) {
    var me = this;

    if (!nodeState.hasOwnProperty('channels')) return;

    // convert nodeState into equivalent droneLink messages and feed to normal handler
    var qm = new DLM.DroneLinkMsg();
    qm.source = this.localAddress;

    // for each channel
    Object.keys(nodeState.channels).forEach(channelKey => {
      var channel = nodeState.channels[channelKey]; 

      console.log('channel: ' + channelKey);
    
      // for each param  
      Object.keys(channel.params).forEach(paramKey => {
        var param = channel.params[paramKey];

        console.log('param: ' + paramKey + ', ', param.values);

        // generate the value message
        qm.node = nodeState.id;
        qm.channel = channelKey;
        qm.param = paramKey;
        
        switch(param.msgType) {
          case DLM.DRONE_LINK_MSG_TYPE_UINT8_T: qm.setUint8(param.values); break;
          case DLM.DRONE_LINK_MSG_TYPE_UINT32_T: qm.setUint32(param.values); break;
          case DLM.DRONE_LINK_MSG_TYPE_FLOAT: qm.setFloat(param.values); break;
          case DLM.DRONE_LINK_MSG_TYPE_CHAR: qm.setString(param.values[0]); break;
        }

        qm.writable = param.writable;
        me.handleLinkMsg(qm, false, 'firebase');

        // and then the "name" message
        if (param.name > '') {
          console.log('updating name: ' + param.name);
          qm.setName(param.name);
          me.handleLinkMsg(qm, false, 'firebase');
        }
      });
    });
  }


  updateVisualisation(id, visScript) {
    // update visualisation script for node id
     // update firebase
     try {
      var nodeInfo = {};
      nodeInfo.visualisation = visScript;
      const docRef = doc(this.db, 'nodes', id.toString());
      setDoc(docRef, nodeInfo, { merge: true });

      console.log("Firebase, node vis script updated: " + id);
    } catch (e) {
      console.error("Firebase, Error updating vis script: ", e);
    }
  }


  handleLinkMsg(msg, queryNames, interfaceName) {
    var me = this;
    var now = (new Date()).getTime();
    //console.log('hLM', msg.asString());

    // new node?
    if (!me.state.hasOwnProperty(msg.node)) {
      // trigger node.new event
      me.trigger('node.new', msg.node);

      // speculative hostname query
      if (queryNames) {
        var qm = new DLM.DroneLinkMsg();
        qm.source = this.localAddress;
        qm.node = msg.node;
        qm.channel = 1;
        qm.param = 8;
        qm.msgType = DLM.DRONE_LINK_MSG_TYPE_QUERY;
        qm.msgLength = 1;
        me.send(qm);

        // speculative Nav type query
        /*
        qm = new DLM.DroneLinkMsg();
        qm.source = this.localAddress;
        qm.node = msg.node;
        qm.channel = 7;
        qm.param = DLM.DRONE_MODULE_PARAM_TYPE;
        qm.msgType = DLM.DRONE_LINK_MSG_TYPE_QUERY;
        qm.msgLength = 1;
        me.send(qm);
        */
      }
      
    }

    //console.log(msg.channel, mvalue);
    // new channel (module) ?
    if (!me.state.hasOwnProperty(msg.node) ||
        !me.state[msg.node].channels.hasOwnProperty(msg.channel)) {
      me.trigger('module.new', { node: msg.node, channel:msg.channel });

      if (queryNames) {
        // queue a type query
        var qm = new DLM.DroneLinkMsg();
        qm.source = this.localAddress;
        qm.node = msg.node;
        qm.channel = msg.channel;
        qm.param = DLM.DRONE_MODULE_PARAM_TYPE;
        qm.msgType = DLM.DRONE_LINK_MSG_TYPE_QUERY;
        qm.msgLength = 1;
        me.send(qm);

        // queue a name query
        qm = new DLM.DroneLinkMsg();
        qm.source = this.localAddress;
        qm.node = msg.node;
        qm.channel = msg.channel;
        qm.param = DLM.DRONE_MODULE_PARAM_NAME;
        qm.msgType = DLM.DRONE_LINK_MSG_TYPE_QUERY;
        qm.msgLength = 1;
        me.send(qm);
      }
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
        me.trigger('param.value', { node: msg.node, channel:msg.channel, param: msg.param, msgType: msg.msgType, values:Array.from(msg.valueArray()), priority: msg.priority });
      }
    }

    // create newState object and merge
    var newState ={};
    newState[msg.node] = {
      channels: {},
      lastHeard: now,
      interface: interfaceName,
      lastHeard:now,
      visualisation:'',
      visScriptLoaded:false
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
    // update source
    msg.source = this.localAddress;
    this.discoveryQueue.add(msg);
  }

  discovery() {
    // look for missing names and types

  }


  processDiscoveryQueue() {
    this.discoveryQueue.process(this.socket);
  }

  updateFirebase() {
    var now = (new Date()).getTime();

    // check each node for last time it changed vs when we last updated firebase
    Object.keys(this.state).forEach(key => {
      var node = this.state[key]; 
    
      if (!node.firebaseLastUpdated ||
          (node.lastHeard > node.firebaseLastUpdated) && (node.firebaseLastUpdated + 60000 < now)) {

        // create a document object with key info to merge into firebase

        // for each channel
        var nodeInfo = {
          id: parseInt(node.id ? node.id : key),
          interface:node.interface ? node.interface : '',
          lastHeard:node.lastHeard ? node.lastHeard : 0,
          name: node.name ? node.name : '',
          channels: {}
        };

        Object.keys(node.channels).forEach(channelKey => {
          var channel = node.channels[channelKey]; 
          nodeInfo.channels[channelKey] = {
            name: channel.name ? channel.name : '',
            params: {}
          };
          
          // for each param  
          Object.keys(channel.params).forEach(paramKey => {
            var param = channel.params[paramKey];

            if (param.bytesPerValue) {
              nodeInfo.channels[channelKey].params[paramKey] = {
                bytesPerValue: param.bytesPerValue ? param.bytesPerValue : 0,
                msgType: param.msgType ? param.msgType : 0,
                writable: param.writable,
                name: param.name ? param.name : ''
              };
  
              if (param.values && param.values.length > 0 ) {
                nodeInfo.channels[channelKey].params[paramKey].values = _.clone(param.values)
              }
            }
          });
        });

        // update firebase
        try {
          //console.log('Firebase nodeinfo', nodeInfo);
          const docRef = doc(this.db, 'nodes', key.toString());
          setDoc(docRef, nodeInfo, { merge: true });

          //console.log("Firebase, node updated: " + key);
        } catch (e) {
          console.error("Firebase, Error updating document: ", e);
        }
        
        node.firebaseLastUpdated = now;
      }
    });
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

  async rebuildNode(id) {
    // remove all channel state info
    this.state[id].channels = {};


    // erase state info from firestore
    try {
      const docRef = doc(this.db, 'nodes', id.toString());
   
      // remove channel info
      await updateDoc(docRef, {
          channels: deleteField()
      });

      console.log("Firebase, node channel info deleted: " + id);
    } catch (e) {
      console.error("Firebase, Error deleting node channel info: ", e);
    }
  }


}
