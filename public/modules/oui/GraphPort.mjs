import * as DLM from '../droneLinkMsg.mjs';
import Vector from '../Vector.mjs';
import GraphWire from './GraphWire.mjs';

/*

GraphPorts are synonomous with Module Params
They provide an editing interface for setting configuration values

UI is arranged in columns, managed via the parent GraphBlock
*/


export default class GraphPort {
  constructor(mgr, block, param) {
    this.mgr = mgr;
    this.block = block;
    this.param = param;
    this.name = param.name;
    this.subName;  //  same as name but without the $ sign
    this.isAddr = false;

    this.sortOrder = 0; // sort order
    this.y = 0;  // relative to block
    this.height = 16;

    this.wire = null;
    this.numOutputs = 0;
    this.outputs = [];

    this.font = '';
    this.padding = 2;

    this.cellsNeedUpdate = true;

    // cells in the ui table
    this.cellFixedWidth = [];  // 0 for dynamic, or a fixed value
    this.cells = []; // strings for each cell
    this.cellMinWidths = [ ];


    // check type
    if (param.type == 'addr') {
      this.isAddr = true;
      this.subName = this.name.substring(1, this.name.length);

      this.findAndHideSub();
    }

    /*
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
    */
  }

  findAndHideSub() {
    // find matching port with same name and hide
    if (this.subName != '') {
      for (const [key, port] of Object.entries(this.block.ports)) {
        if (port != this && this.subName == port.name) {
          port.height = 0;
          this.block.updatePortPositions();
        }
      }
    }
  }

  updateCells(ctx) {
    if (!this.cellsNeedUpdate) return;

    this.font = this.mgr.uiRoot.css('font');
    this.font.replace(/\d+\.?\d*px/, "8px");
    ctx.font = this.font;

    this.cellFixedWidth = [
      0,
      0,
      this.height
    ];

    this.cells = [
      this.param.address,
      this.name,
      ''
    ];

    this.cellMinWidths = [];
    
    // calc widths
    for (var i=0; i<this.cells.length; i++) {
      if (this.cellFixedWidth[i] == 0) {
        var tm = ctx.measureText(this.cells[i]);
        this.cellMinWidths.push(tm.width + 2*this.padding);
      } else {
        this.cellMinWidths.push(this.cellFixedWidth[i]);
      }
    }

    this.cellsNeedUpdate = false;
    this.block.needsPortResize = true;
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

    this.updateCells(ctx);

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
      ctx.fillStyle = this.param.writeable ? '#848ac0' : '#848a90';
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

    // render cells
    var x2 = 0;
    for(var i=0; i<this.cells.length; i++) {
      
      if (i == 2) {
        // draw a circle for Publish status
        ctx.fillStyle = this.param.published ? '#0f0' : '#555';
        ctx.beginPath();
        ctx.arc(px + x1 + x2 + this.block.columns[i]/2, py + y1 + h/2, this.height/2-this.padding, 0, 2*Math.PI);
        ctx.fill();
      } else {
        ctx.fillStyle = '#000';
        ctx.font = this.font;
        ctx.textAlign = 'left';
        ctx.fillText(this.cells[i], px + x1 + x2 + this.padding, py + y1 + h/2 + 4);
      }
      x2 += this.block.columns[i];
    }


  }

  drawWire() {
    // draw wire
    if (this.wire) this.wire.draw();
  }


}
