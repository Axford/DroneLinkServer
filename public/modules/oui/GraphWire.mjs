import * as DLM from '../droneLinkMsg.mjs';
import Vector from '../Vector.mjs';


export default class GraphWire {
  constructor(mgr, state, block, onode, ochannel, oparam) {
    this.mgr = mgr;
    this.state = state;
    this.block = block;
    this.oblock = null; // other block
    this.onode = onode;
    this.ochannel = ochannel;
    this.oparam = oparam;

  }


  updateOtherBlock() {
    // find matching block
    this.oblock = this.mgr.getBlockById(this.ochannel);
  }


  draw() {
    var c = this.mgr.canvas[0];
    var ctx = c.getContext("2d");

    ctx.strokeStyle = '#5f5';
    ctx.lineWidth = 3;

    var b = this.block;

    if (this.oblock == null) {
      // attempt to locate info for other block
      this.updateOtherBlock();
    }

    var ob = this.oblock;

    var x1 = b.x1;
    var y1 = (b.y1 + b.y2)/2;
    var x2 = ob ? ob.x2 : x1 - 20;
    var y2 = ob ? (ob.y1 + ob.y2) /2 : y1;

    var y3 = (ob == b) ? 50 : 0;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.bezierCurveTo(x1 - 50, y1 + y3, x2 + 50, y2 + y3, x2, y2);
    ctx.stroke();
  }


}
