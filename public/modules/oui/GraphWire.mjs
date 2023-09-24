import * as DLM from "../droneLinkMsg.mjs";
import Vector from "../Vector.mjs";

export default class GraphWire {
  constructor(mgr, port, onode, ochannel, oparam) {
    this.mgr = mgr;
    this.port = port;
    this.oport = null; // other port
    this.onode = onode;
    this.ochannel = ochannel;
    this.oparam = oparam;
    this.mass = 1;
    this.rewiring = false;
    this.lastUpdate = Date.now();

    this.points = [];
    for (var i = 0; i < 8; i++) {
      this.points.push({
        p: new Vector(0, 0),
        v: new Vector(0, 0),
        av: new Vector(0, 0),
      });
    }

    this.updateOtherPort();

    this.pointsBuilt = false;
  }

  isConnected() {
    return this.oport !== null;
  }

  updateAddress(onode, ochannel, oparam) {
    this.onode = onode;
    this.ochannel = ochannel;
    this.oparam = oparam;
    return this.updateOtherPort();
  }

  updateOtherPort() {
    // disconnect existing port if we have one
    if (this.oport) {
      this.oport.disconnect(this.port);
      this.oport = null;
    }

    // find matching port
    if (this.onode == this.mgr.nodeId) {
      this.oport = this.mgr.getPortByAddress(this.ochannel, this.oparam);
      if (this.oport) {
        this.oport.connect(this.port);
        this.mgr.needsRedraw = true;
        return true;
      }
    }
    return false;
  }

  startRewire() {
    this.rewiring = true;
  }

  moveRewire(x,y) {
    // update end point of wire
    this.points[this.points.length - 1].p.x = x;
    this.points[this.points.length - 1].p.y = y;
  }

  endRewire() {
    this.rewiring = false;
  }

  rebuildPoints() {
    this.pointsBuilt = false;
  }

  buildPoints() {
    if (this.pointsBuilt) return;

    // calc vector from start to end
    var v = this.points[this.points.length - 1].p.clone();
    v.subtract(this.points[0].p);

    // get length
    var len = v.length();
    // normalise v as a reference
    v.normalize();

    // position all other points evenly along the line
    for (var i = 1; i < this.points.length - 1; i++) {
      var f = i / (this.points.length - 1);

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
    var loopTime = Date.now();
    var dt = (loopTime - this.lastUpdate) / 1000;  // in seconds
    if (dt > 0.1) dt = 0.1;
    this.lastUpdate = loopTime;

    // calc vector from start to end
    var v = this.points[this.points.length - 1].p.clone();
    v.subtract(this.points[0].p);

    // update mass
    this.mass = v.length();

    // reset accel vectors
    for (var i = 0; i < this.points.length; i++) {
      var p = this.points[i];
      p.av.x = 0;
      p.av.y = 0;
    }

    var padding = 20;
    var g = new Vector(0, 0.03 * this.mass);

    // for each point, calc the forces acted on by its neighbours
    for (var i = 1; i < this.points.length-1; i++) {
      var n1 = this.points[i - 1];
      var p = this.points[i];
      var n2 = this.points[i + 1];

      // n1
      var f = n1.p.clone();
      f.subtract(p.p);
      f.capLength(500);
      f.multiply(2);
      p.av.add(f);

      // n2
      f = n2.p.clone();
      f.subtract(p.p);
      f.capLength(500);
      f.multiply(2);
      p.av.add(f);

      // apply gravity
      p.av.add(g);

      // also hit test against blocks and apply collision forces
      /*
      for (var j = 0; j < this.mgr.blocks.length; j++) {
        var b = this.mgr.blocks[j];

        if (b != this.port.block && (this.oport && b != this.oport.block)) {
          
          if (b.hit(p.p.x, p.p.y)) {
            // add extra gravity
            //p.av.add(g2);
          }
          

          
          var overlap = b.collidingWithPoint(p.p, padding);
          if (overlap.length() > 0) {
            //overlap.capLength(10);
            //overlap.multiply(-1);
            //p.av.add(overlap);

            // add extra gravity
            p.av.add(g2);
          }
          
        }
        
        
      }
      */
    
    }

    // apply forces
    for (var i = 1; i < this.points.length - 1; i++) {
      var p = this.points[i];

      p.av.multiply(10);
      p.v.add(p.av);

      // clamp velocity
      p.v.capLength(1500);

      // apply drag
      p.v.multiply(0.99);

      // apply time delta
      p.v.multiply(dt);

      // update position
      p.p.add(p.v);

      // trigger redraw if movement is significant
      if (p.v.dot(p.v) > 0.001) this.mgr.needsRedraw = true;
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
    if (this.mgr.dragBlock) {
      dim = this.mgr.dragBlock != p.block;

      // check other end
      if (op && op.block == this.mgr.dragBlock) dim = false;
    } else if (this.mgr.hoverBlock) {
      dim = this.mgr.hoverBlock != p.block;

      // check other end
      if (op && op.block == this.mgr.hoverBlock) dim = false;
    }

    ctx.strokeStyle = dim ? "#606060" : (this.oport ? this.oport.block.fillStyle : ( this.rewiring ? '#00ff00' : '#606060'));
    ctx.lineWidth = dim ? 1 : 6;

    var x1 = p.block.x1 - 8;
    var y1 = p.block.y1 + p.y + 8;
    var x2 = op ? op.block.x2 + 8 : x1 - 20;
    var y2 = op ? op.block.y1 + op.y + 8 : y1;

    // ensure ends stay connected
    // source node (p)
    this.points[0].p.x = x1;
    this.points[0].p.y = y1;

    // dest node (op)
    if (!this.rewiring) {
      this.points[this.points.length - 1].p.x = x2;
      this.points[this.points.length - 1].p.y = y2;
    }

    this.buildPoints();

    // draw a stubby handle if not connected
    if (!op && !this.rewiring) {
      var hsize = op && p.block == op.block ? 50 : 20;

      ctx.beginPath();
      ctx.moveTo(px + x1, py + y1);
      ctx.bezierCurveTo(
        px + x1 - hsize,
        py + y1,
        px + x2 + hsize,
        py + y2,
        px + x2,
        py + y2
      );
      ctx.stroke();
    } else {
      // draw line segments
      ctx.beginPath();
      ctx.moveTo(px + this.points[0].p.x, py + this.points[0].p.y);
      for (var i = 1; i < this.points.length; i++) {
        ctx.lineTo(px + this.points[i].p.x, py + this.points[i].p.y);

        //ctx.arc(px + this.points[i].p.x, py + this.points[i].p.y, 4, 0, 2*Math.PI);
      }
      ctx.stroke();
    }
  }
}
