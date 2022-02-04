import * as DLM from '../droneLinkMsg.mjs';
import Vector from '../Vector.mjs';
import NetWire from './NetWire.mjs';

export default class NetPort {
  constructor(mgr, state, block, param) {
    this.mgr = mgr;
    this.state = state;
    this.block = block;
    this.param = param;
    this.name = '';
    this.isAddr = false;

    this.sortOrder = 0; // sort order
    this.y = 0;  // relative to block
    this.height = 16;

    this.wire = null;
    this.numOutputs = 0;
    this.outputs = [];

    // listen for names
    this.state.on('param.name', (data)=>{
      if (data.node != this.block.node ||
         data.channel != this.block.channel ||
         data.param != this.param) return;

      //console.log('portName', data);
      this.name = data.name;

      if (this.isAddr) this.findAndHideSub();
    });

    // listen for values
    this.state.on('param.value', (data)=>{
      if (data.node != this.block.node ||
         data.channel != this.block.channel ||
         data.param != this.param) return;

      if (data.msgType == DLM.DRONE_LINK_MSG_TYPE_ADDR) {
        console.log('portWire', data);
        var onode = data.values[1];
        var ochannel = data.values[2];
        var oparam = data.values[3];
        var addr = onode +'>' + ochannel + '.' + oparam;

        this.isAddr = true;

        this.findAndHideSub();

        // ignore subs to other nodes
        if (onode != this.block.node) return;

        if (!this.wire) {
          this.wire = new GraphWire(this.mgr, this.state, this, onode, ochannel, oparam);
        }

      }

      this.mgr.needsRedraw = true;

    });
  }

  findAndHideSub() {
    // find matching port with same name and hide
    if (this.name != '') {
      for (const [key, port] of Object.entries(this.block.ports)) {
        if (port != this && this.name == port.name) {
          port.height = 0;
          this.block.updatePortPositions();
        }
      }
    }
  }


  draw() {
    if (this.height == 0) return;

    var c = this.mgr.canvas[0];
    var ctx = c.getContext("2d");

    var w = this.block.width;
    var h = this.height;

    var px = this.mgr.panPosition.x;
    var py = this.mgr.panPosition.y;

    var x1 = this.block.x1;
    var y1 = this.block.y1 + this.y;

    var dim = false;
    if ( this.mgr.dragBlock ) {
      dim = this.mgr.dragBlock != this.block;

      // check inputs
      if (this.wire && this.wire.oport && this.wire.oport.block == this.mgr.dragBlock) dim = false;

      // check outputs
      for (var i=0; i < this.outputs.length; i++) {
        if (this.outputs[i].block == this.mgr.dragBlock) dim = false;
      }

    }

    ctx.beginPath();
    if (dim) {
      ctx.fillStyle = '#606060';
    } else
    if (this.wire) {
      ctx.fillStyle = this.block.fillStyle;
    } else if (this.numOutputs == 1) {
      ctx.fillStyle = this.outputs[0].block.fillStyle;
    } else if (this.numOutputs > 1) {
      ctx.fillStyle = '#fff';
    } else {
      ctx.fillStyle = '#848a90';
    }

    ctx.fillRect(px + x1, py + y1, w, h);
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.rect(px + x1, py + y1, w, h);
    ctx.stroke();

    if (this.isAddr) {
      // draw input nubbin
      ctx.beginPath();
      ctx.arc(px + x1, py + y1 + h/2, 4, 0, 2 * Math.PI);
      ctx.fill();
    }

    // label
    ctx.fillStyle = '#000';
    ctx.font = this.mgr.uiRoot.css('font');
    ctx.font.replace(/\d+\.?\d*px/, "8px");
    ctx.textAlign = 'center';
    ctx.fillText(this.param + ': ' + this.name, px + x1 + w/2, py + y1 + h/2 + 4);


  }

  drawWire() {
    // draw wire
    if (this.wire) this.wire.draw();
  }


}
