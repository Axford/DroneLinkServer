import * as DLM from '../droneLinkMsg.mjs';
import Vector from '../Vector.mjs';


export default class NetWire {

  // src and dest are block objects
  constructor(mgr, src, dest) {
    this.mgr = mgr;
    this.src = src;
    this.dest = dest;
    this.metric = 255;
  }


  draw() {
    var c = this.mgr.canvas[0];
    var ctx = c.getContext("2d");

    var px = this.mgr.panPosition.x;
    var py = this.mgr.panPosition.y;

    var dim = false;
    /*
    if ( this.mgr.dragBlock ) {
      dim = this.mgr.dragBlock != p.block;

      // check other end
      if (op && op.block == this.mgr.dragBlock) dim = false;
    }
    */

    var style = dim ? '#606060' : this.src.fillStyle;

    ctx.strokeStyle = style;
    //ctx.strokeStyle = '#606060';
    ctx.lineWidth = dim ? 1 : 6;

    var x1 = this.src.position.x;
    var y1 = this.src.position.y;
    var x2 = this.dest.position.x;
    var y2 = this.dest.position.y;

    ctx.beginPath();
    ctx.moveTo(px + x1, py + y1);
    ctx.lineTo(px + x2, py + y2);
    ctx.stroke();

    var cx = (x1 + x2)/2;
    var cy = (y1 + y2)/2;

    // label background
    ctx.fillStyle = style;
    ctx.beginPath();
    ctx.arc(px + cx, py + cy, 10, 0, 2 * Math.PI);
    ctx.fill();

    // label
    ctx.fillStyle = '#000';
    ctx.font = this.mgr.uiRoot.css('font');
		ctx.textAlign = 'center';
    ctx.fillText(this.metric, px + cx, py + cy + 4);
  }


}
