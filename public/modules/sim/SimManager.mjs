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


export default class SimManager {
  constructor(socket) {
    this.nodes = [];
    this.config = {};
    this.socket = socket;
  }


  diagnosticString() {
    var s='';

    for (var i=0; i<this.nodes.length; i++) {
      var node = this.nodes[i];

      s += node.node + ': ' + node.name + '\n';
      s += ' v: ' + node.physics.v.x.toFixed(1) + ', ' + node.physics.v.y.toFixed(1) + '\n';
      s += ' angV: ' + node.physics.angV.toFixed(1) + '\n';
      s += ' heading: ' + node.heading.toFixed(1) + '\n';
      s += ' angToWind: ' + node.angToWind.toFixed(1) + '\n';
      s += ' polarIndex: ' + node.polarIndex + '\n';
      s += ' sailForce: ' + node.sailForce.toFixed(2) + '\n';
      s += ' rudderForce: ' + node.rudderForce.toFixed(2) + '\n';

        
      s += '\n';
    
    }
  
    return s;
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
        } else if (nodeConfig.type == 'SailBoat') {
          // create a new instance of SailBoat
          var node = new SimSailBoat(nodeConfig, this);
          this.nodes.push(node);
        } else {
          console.error('Unknown type');
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
    
    //console.log(('[SimMgr.hLM] ' + msg.asString()).grey);
    this.nodes.forEach((node)=>{
      node.handleLinkMessage(msg);
    });
  }

  send(msg) {
    //console.log( ('[SimMgr.send] '+ msg.asString()).yellow );
    this.socket.emit('sendMsg', msg.encodeUnframed());
  }

  update() {
    // call update on all nodes
    this.nodes.forEach((node)=>{
      node.update();
    });
  }
}
