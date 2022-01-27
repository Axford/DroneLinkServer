import * as DLM from '../droneLinkMsg.mjs';
import Vector from '../Vector.mjs';
import GraphWire from './GraphWire.mjs';

export default class GraphPort {
  constructor(mgr, state, block, param) {
    this.mgr = mgr;
    this.state = state;
    this.block = block;
    this.param = param;
    this.name = '';

    this.sortOrder = 0; // sort order
    this.y = 0;  // relative to block
    this.height = 16;

    this.wire = null;
    this.connected = false;

    // listen for names
    this.state.on('param.name', (data)=>{
      if (data.node != this.block.node ||
         data.channel != this.block.channel ||
         data.param != this.param) return;

      //console.log('portName', data);
      this.name = data.name;
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

        // ignore subs to other nodes
        if (onode != this.block.node) return;

        if (!this.wire) {
          this.wire = new GraphWire(this.mgr, this.state, this, onode, ochannel, oparam);
        }

      }

      this.mgr.needsRedraw = true;

    });
  }


  draw() {
    var c = this.mgr.canvas[0];
    var ctx = c.getContext("2d");

    var w = this.block.width;
    var h = this.height;

    var x1 = this.block.x1;
    var y1 = this.block.y1 + this.y;

    ctx.beginPath();
    ctx.fillStyle = this.connected ? '#fff' : (this.wire ? this.block.fillStyle : '#848a90');
    ctx.fillRect(x1, y1, w, h);
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.rect(x1, y1, w, h);
    ctx.stroke();

    // label
    ctx.fillStyle = '#000';
    ctx.font = this.mgr.uiRoot.css('font');
    ctx.font.replace(/\d+\.?\d*px/, "8px");
    ctx.textAlign = 'center';
    ctx.fillText(this.param + ': ' + this.name, x1 + w/2, y1 + h/2 + 4);
  }

  drawWire() {
    // draw wire
    if (this.wire) this.wire.draw();
  }


}
