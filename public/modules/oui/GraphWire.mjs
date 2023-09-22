import * as DLM from '../droneLinkMsg.mjs';
import Vector from '../Vector.mjs';


export default class GraphWire {
  constructor(mgr, port, onode, ochannel, oparam) {
    this.mgr = mgr;
    this.port = port;
    this.oport = null; // other port
    this.onode = onode;
    this.ochannel = ochannel;
    this.oparam = oparam;

    this.points = [];
    for (var i=0; i<8; i++) {
      this.points.push({
        p: new Vector(0,0),
        v: new Vector(0,0),
        av: new Vector(0,0)
      })
    }

    this.pointsBuilt = false;
  }

  updateAddress(onode, ochannel, oparam) {
    this.onode = onode;
    this.ochannel = ochannel;
    this.oparam = oparam;
    this.updateOtherPort();
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

  rebuildPoints() {
    this.pointsBuilt = false;
  }


  buildPoints() {
    if (this.pointsBuilt) return;

    // calc vector from start to end
    var v = this.points[this.points.length-1].p.clone();
    v.subtract(this.points[0].p);

    // get length
    var len = v.length();
    // normalise v as a reference
    v.normalize();
 
    // position all other points evenly along the line
    for (var i=1; i<this.points.length-1; i++) {
      var f = i / (this.points.length-1);

      var v1 = v.clone();
      v1.multiply(f * len);
      this.points[i].p = this.points[0].p.clone();
      this.points[i].p.add(v1);
    }

    this.pointsBuilt = true;
  }

  updatePosition() {
    // update wire points based on physics model
    // calc forces on each point along the wire and iterate to move them

    // reset accel vectors
    for (var i=0; i<this.points.length; i++) {
      var p = this.points[i];
      p.av.x = 0;
      p.av.y = 0;
    }

    // for each point, calc the forces acted on by its neighbours
    for (var i=1; i<this.points.length-1; i++) {
      var n1 = this.points[i-1];
      var p = this.points[i];
      var n2 = this.points[i+1];

      // n1
      var f = n1.p.clone();
      f.subtract(p.p);
      f.capLength(100);
      p.av.add(f);

      // n2
      f = n2.p.clone();
      f.subtract(p.p);
      f.capLength(100);
      p.av.add(f);
    }

    // apply forces
    for (var i=1; i<this.points.length-1; i++) {
      var p = this.points[i];

      p.av.multiply(0.1);
      p.v.add(p.av);

      // clamp velocity
      p.v.capLength(100);

      // apply drag
      p.v.multiply(0.8);

      // update position
      p.p.add(p.v);

      // trigger redraw if movement is significant
      if (p.v.dot(p.v) > 0.01) this.mgr.needsRedraw = true;
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

    var x1 = p.block.x1-8;
    var y1 = (p.block.y1 + p.y + 8);
    var x2 = op ? op.block.x2 : x1 - 20;
    var y2 = op ? (op.block.y1 + op.y + 8) : y1;

    // ensure ends stay connected
    // source node (p)
    this.points[0].p.x = x1;
    this.points[0].p.y = y1;

    // dest node (op)
    this.points[this.points.length-1].p.x = x2;
    this.points[this.points.length-1].p.y = y2;

    this.buildPoints();


    // draw a stubby handle if not connected
    if (!op) {
      var hsize = (op && p.block == op.block) ? 50 : 20;

      ctx.beginPath();
      ctx.moveTo(px + x1, py + y1);
      ctx.bezierCurveTo(px + x1 - hsize, py + y1 , px + x2 + hsize, py + y2 , px + x2, py + y2);
      ctx.stroke();
    } else {
      // draw line segments
      ctx.beginPath();
      ctx.moveTo(px + this.points[0].p.x, py + this.points[0].p.y);
      for (var i=1; i<this.points.length; i++) {
        ctx.lineTo(px + this.points[i].p.x, py + this.points[i].p.y);
      }
      ctx.stroke();
    }
    
  }


}
