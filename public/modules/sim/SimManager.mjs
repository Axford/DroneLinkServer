/*
SimManager

* Manages a collection of simulated nodes
* Takes care of loading from config file

*/
import fs from 'fs';
import colors from 'colors';

// node sim types
import SimTankSteerBoat from './SimTankSteerBoat.mjs';
import SimSailBoat from './SimSailBoat.mjs';
import SimAISBoat from './SimAISBoat.mjs';


export default class SimManager {
  constructor(socket) {
    this.nodes = [];
    this.config = {};
    this.socket = socket;
    this.onError = null;
    this.onLog = null;
  }


  diagnosticString() {
    var s='';

    for (var i=0; i<this.nodes.length; i++) {
      var node = this.nodes[i];

      s += node.getDiagnosticString();

      s += '\n';
    }
  
    return s;
  }

  load(path) {
    this.onLog('[SimManager.load]' );
    this.config = JSON.parse( fs.readFileSync(path) );

    // process nodes
    this.config.nodes.forEach((nodeConfig)=>{
      this.onLog(('[SimManager.load] node: '+ nodeConfig.name + ' ('+nodeConfig.node+')') );
      if (nodeConfig.enabled) {
        if (nodeConfig.type == 'TankSteerBoat') {
          // create a new instance of TankSteerBoat
          var node = new SimTankSteerBoat(nodeConfig, this);
          this.nodes.push(node);

        } else if (nodeConfig.type == 'SailBoat') {
          // create a new instance of SailBoat
          this.onLog('SailBoat');
          var node = new SimSailBoat(nodeConfig, this);
          this.nodes.push(node);

        } else if (nodeConfig.type == 'AISBoat') {
          this.onLog('AISBoat');
          var node = new SimAISBoat(nodeConfig, this);
          this.nodes.push(node);
          
        } else {
          this.onError('Unknown type');
        }
      } else {
        this.onLog('Node disabled!');
      }
      
    });

    this.onLog(('[SimManager.load] loaded '+this.nodes.length + ' nodes').blue );
  }


  handleLinkMessage(msg) {
    // ignore stuff that originated from us
    if (msg.source == 253) return;
    
    //console.log(('[SimMgr.hLM] ' + msg.asString()).grey);
    this.nodes.forEach((node)=>{
      node.handleLinkMessage(msg);
    });
  }

  send(msg) {
    //console.log( ('[SimMgr.send] '+ msg.asString()).yellow );
    this.socket.emit('sendMsg', msg.encodeUnframed());
  }

  sendAIS(msg) {
    this.socket.emit('AIS', msg);
  }

  update() {
    // call update on all nodes
    this.nodes.forEach((node)=>{
      try {
        node.update();
      } catch (e) {
        this.onError(('[SimManager.update] error: ' + e.message).red );
      }
      
    });
  }
}
