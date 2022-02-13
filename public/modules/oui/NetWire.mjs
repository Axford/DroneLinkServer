import * as DLM from '../droneLinkMsg.mjs';
import Vector from '../Vector.mjs';

function constrain(v, minv, maxv) {
  return Math.max(Math.min(v, maxv), minv);
}


function sqr(x) {  return x * x; }
function cube(x) { return x*x*x; }

export default class NetWire {

  // src and dest are block objects
  constructor(mgr, src, dest, netInterface) {
    this.mgr = mgr;
    this.src = src;
    this.dest = dest;
    this.metric = 255;
    this.lastHeard = Date.now();
    this.netInterface = netInterface;
    this.avgAttempts = 0;
    this.avgAckTime = 0;
  }

  getAlpha() {
    return 100 - 100 * constrain((Date.now() - this.lastHeard)/1000, 1, 60)/60;
  }

  getStyle() {
    return "hsl(" + (this.netInterface == 1 ? '330' : '25') + ',' +
             '100%,' +
             '70%, '+this.getAlpha()+'%)';
  }

  getBezPointOnCurve(p1,p2,p3,p4,t) {
    var v = new Vector(0,0);
    var w1 = cube(1-t);
    var w2 = 3*sqr(1-t)*t;
    var w3 = 3*(1-t)*sqr(t);
    var w4 = cube(t);

    v.x = w1 * p1.x + w2*p2.x + w3*p3.x + w4*p4.x;
    v.y = w1 * p1.y + w2*p2.y + w3*p3.y + w4*p4.y;

    return v;
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


    //var style = dim ? '#606060' : this.src.getStyle(this.getAlpha());
    var style = dim ? '#606060' : this.getStyle();

    // see if this route is a path from src to the focusNode via dest
    if (this.src.destinations[this.mgr.focusNode] == this.dest) {
      style = '#5f5';
    }

    ctx.strokeStyle = style;
    //ctx.strokeStyle = '#606060';
    ctx.lineWidth = dim ? 1 : 6;

    var x1 = this.src.position.x;
    var y1 = this.src.position.y;
    var x2 = this.dest.position.x;
    var y2 = this.dest.position.y;

    // vector from src to dest
    var v = this.dest.position.clone();
    v.subtract(this.src.position);

    var v2 = v.clone();

    // third of the way along
    v.multiply(0.3);

    // rotate clockwise by 20 degrees
    v.rotate(20 * Math.PI / 180);

    var cp1 = this.src.position.clone();
    cp1.add(v);

    var cp2 = this.dest.position.clone();

    ctx.beginPath();
    ctx.moveTo(px + x1, py + y1);
    ctx.bezierCurveTo(px + cp1.x, py + cp1.y , px + cp2.x, py + cp2.y, px + x2, py + y2);
    ctx.stroke();


    // circular attempts background
    var ap = this.getBezPointOnCurve(this.src.position, cp1, cp2, this.dest.position,  0.25);

    ctx.fillStyle = "hsl(" + (135 * (10- this.avgAttempts)/10) + ',' +
                     '100%,' +
                     '70%, '+this.getAlpha()+'%)';

    ctx.beginPath();
    //ctx.arc(px + ap.x, py + ap.y, 15, 0, 2*Math.PI);
    ctx.ellipse(px + ap.x, py + ap.y, 20, 10, 0, 0, 2*Math.PI);
    ctx.fill();

    // attempts label
    ctx.fillStyle = '#000';
    ctx.font = this.mgr.uiRoot.css('font');
		ctx.textAlign = 'center';
    ctx.fillText(
      this.avgAttempts.toFixed(1) + ',' + this.avgAckTime,
      px + ap.x, py + ap.y + 4);


    // triangular label background
    var mp = this.getBezPointOnCurve(this.src.position, cp1, cp2, this.dest.position,  0.35);

    ctx.fillStyle = style;
    /*
    ctx.beginPath();
    ctx.arc(px + cp1.x, py + cp1.y, 10, 0, 2 * Math.PI);
    ctx.fill();
    */
    v2.normalize();
    v2.multiply(15);

    ctx.beginPath();
    ctx.moveTo(px + mp.x + v2.x, py + mp.y + v2.y);
    v2.rotate(120 * Math.PI / 180);
    ctx.lineTo(px + mp.x + v2.x, py + mp.y + v2.y);
    v2.rotate(120 * Math.PI / 180);
    ctx.lineTo(px + mp.x + v2.x, py + mp.y + v2.y);
    v2.rotate(120 * Math.PI / 180);
    ctx.lineTo(px + mp.x + v2.x, py + mp.y + v2.y);
    ctx.fill();

    // label
    ctx.fillStyle = '#000';
    ctx.font = this.mgr.uiRoot.css('font');
		ctx.textAlign = 'center';
    ctx.fillText(this.metric, px + mp.x, py + mp.y + 4);
  }


}
