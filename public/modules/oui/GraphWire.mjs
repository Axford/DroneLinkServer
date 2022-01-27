import * as DLM from '../droneLinkMsg.mjs';
import Vector from '../Vector.mjs';


export default class GraphWire {
  constructor(mgr, state, port, onode, ochannel, oparam) {
    this.mgr = mgr;
    this.state = state;
    this.port = port;
    this.oport = null; // other port
    this.onode = onode;
    this.ochannel = ochannel;
    this.oparam = oparam;
  }


  updateOtherPort() {
    // find matching port
    this.oport = this.mgr.getPortByAddress(this.ochannel, this.oparam);
    if (this.oport) {
      this.oport.numOutputs += 1;
      this.oport.outputs.push(this.port);
      this.mgr.needsRedraw = true;
    }
  }


  draw() {
    var c = this.mgr.canvas[0];
    var ctx = c.getContext("2d");

    var px = this.mgr.panPosition.x;
    var py = this.mgr.panPosition.y;

    var p = this.port;

    if (this.oport == null) {
      // attempt to locate port info
      this.updateOtherPort();
    }

    var op = this.oport;

    var dim = false;
    if ( this.mgr.dragBlock ) {
      dim = this.mgr.dragBlock != p.block;

      // check other end
      if (op && op.block == this.mgr.dragBlock) dim = false;
    }

    ctx.strokeStyle = dim ? '#606060' : this.port.block.fillStyle;
    ctx.lineWidth = dim ? 1 : 6;

    var x1 = p.block.x1;
    var y1 = (p.block.y1 + p.y + p.height/2);
    var x2 = op ? op.block.x2 : x1 - 20;
    var y2 = op ? (op.block.y1 + op.y + op.height/2) : y1;


    var hsize = (op && p.block == op.block) ? 50 : 20;

    ctx.beginPath();
    ctx.moveTo(px + x1, py + y1);
    ctx.bezierCurveTo(px + x1 - hsize, py + y1 , px + x2 + hsize, py + y2 , px + x2, py + y2);
    ctx.stroke();
  }


}
