/*
SimManager

* Manages a collection of simulated nodes
* Takes care of loading from config file

*/
import fs from 'fs';
import colors from 'colors';

// node sim types
import SimTankSteerBoat from './SimTankSteerBoat.mjs';


export default class SimManager {
  constructor(socket) {
    this.nodes = [];
    this.config = {};
    this.socket = socket;
  }


  load(path) {
    console.log('[SimManager.load]'.blue );
    this.config = JSON.parse( fs.readFileSync(path) );

    // process nodes
    this.config.nodes.forEach((nodeConfig)=>{
      console.log(('[SimManager.load] node: '+ nodeConfig.name + ' ('+nodeConfig.node+')').blue );
      if (nodeConfig.enabled) {
        if (nodeConfig.type == 'TankSteerBoat') {
          // create a new instance of TankSteerBoat
          var node = new SimTankSteerBoat(nodeConfig, this);
          this.nodes.push(node);
        } else {
          console.erorr('Unknown type');
        }
      } else {
        console.log('Node disabled!');
      }
      
    });

    console.log(('[SimManager.load] loaded '+this.nodes.length + ' nodes').blue );
  }


  handleLinkMessage(msg) {
    // ignore stuff that originated from us
    if (msg.source == 253) return;
    
    console.log(('[SimMgr.hLM] ' + msg.asString()).grey);
    this.nodes.forEach((node)=>{
      node.handleLinkMessage(msg);
    });
  }

  send(msg) {
    console.log( ('[SimMgr.send] '+ msg.asString()).yellow );
    this.socket.emit('sendMsg', msg.encodeUnframed());
  }

  update() {
    // call update on all nodes
    this.nodes.forEach((node)=>{
      node.update();
    });
  }
}
