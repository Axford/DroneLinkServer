import * as DLM from '../droneLinkMsg.mjs';
import Vector from '../Vector.mjs';
import NetWire from './NetWire.mjs';
import NetPort from './NetPort.mjs';



export default class NetBlock {
  constructor(mgr, addr) {
    this.mgr = mgr;
    //this.state = state;
    this.node = addr;
    //this.channel = data.channel; // channel id
    this.name = '';

    // a wire to each next hop node
    this.nextHops = {};

    this.fillStyle = "hsl(" + 360 * Math.random() + ',' +
             '100%,' +
             (65 + 20 * Math.random()) + '%)';

    var c = this.mgr.canvas[0];
    var ctx = c.getContext("2d");
    var w = ctx.canvas.width;
    if (w < 200) w = 200;
    var h = ctx.canvas.height;

    this.headerHeight = 20;

    this.position = new Vector(w * Math.random(), h * Math.random());
    this.velocity = new Vector(0,0);
    this.width = 100;
    this.radius = 20;
    this.height = this.headerHeight;
    this.av = new Vector(0,0);
    this.updatePosition(this.position);
  }

  hit(x,y) {
    var v = new Vector(x,y);
    v.subtract(this.position);

    return v.length() < this.radius;
  }

  collidingWith(ob, padding) {
    // return overlap vector (or zero if not colliding)

    var v = ob.position.clone();
    v.subtract(this.position);

    if (v.length() < this.radius + ob.radius + padding) {
      // colliding
      v.multiply(-0.2);
    } else {
      v.x = 0;
      v.y = 0;
    }

    return v;
  }

  updatePosition(newPos) {
    this.position.set(newPos);
    this.updateCorners();
  }

  updateCorners() {
    // calculate corner points
    this.x1 = this.position.x - this.width/2;
    this.y1 = this.position.y - this.height/2;
    this.x2 = this.position.x + this.width/2;
    this.y2 = this.position.y + this.height/2;
  }

  addToPosition(v) {
    this.position.add(v);
    this.updateCorners();
  }

  draw() {
    var c = this.mgr.canvas[0];
    var ctx = c.getContext("2d");

    var w = this.width;
    var w2 = w/2;
    var h = this.height;
    var h2 = h/2;
    var px = this.mgr.panPosition.x;
    var py = this.mgr.panPosition.y;

    var dim = (this.mgr.dragBlock && this.mgr.dragBlock != this);
    ctx.fillStyle = dim ? '#505050' : this.fillStyle;
    ctx.strokeStyle = '#505050';
    ctx.lineWidth = 1;
    //roundRect(ctx, px + this.position.x - w2, py + this.position.y - h2, w, h, 6, true);
    ctx.beginPath();
    ctx.arc(px + this.position.x, py + this.position.y, this.radius, 0, 2 * Math.PI);
    ctx.fill();

    // label
    ctx.fillStyle = '#000';
    ctx.font = this.mgr.uiRoot.css('font');
		ctx.textAlign = 'center';
    ctx.fillText(this.node, px + this.position.x, py + this.y1 + this.headerHeight - 6);

  }

  drawWires() {
    // draw ports
    for (const [key, nextHop] of Object.entries(this.nextHops)) {
      nextHop.draw();
    }
  }

  addHop(dest, metric) {
    if (dest == this) return;

    if (!this.nextHops.hasOwnProperty(dest.node)) {
      this.nextHops[dest.node] = new NetWire(this.mgr, this, dest);
    }

    if (metric < this.nextHops[dest.node].metric)
        this.nextHops[dest.node].metric = metric;
  }

}
