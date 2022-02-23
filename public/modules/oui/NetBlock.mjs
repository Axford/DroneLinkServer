import * as DLM from '../droneLinkMsg.mjs';
import Vector from '../Vector.mjs';
import NetWire from './NetWire.mjs';
import NetPort from './NetPort.mjs';


function constrain(v, minv, maxv) {
  return Math.max(Math.min(v, maxv), minv);
}


export default class NetBlock {
  constructor(mgr, addr) {
    this.mgr = mgr;
    //this.state = state;
    this.node = addr;
    //this.channel = data.channel; // channel id
    this.name = '';
    this.lastHeard = Date.now();
    this.focused = false;
    this.connected = false;
    this.txQueueSize = 0;
    this.txQueueActive = 0;
    this.kicked = 0;
    this.choked = 0;
    this.kickRate = 0;
    this.chokeRate = 0;
    this.utilisation = 0;

    // a wire to each next hop node
    this.nextHops = {};

    // ultimate destinations, entries point to the next hop block
    this.destinations = {};

    //this.hue = 360 * Math.random();
    this.hue = 0;
    this.saturation = 0;
    //this.lightness = (65 + 20 * Math.random());
    this.lightness = 90;

    this.fillStyle = this.getStyle( this.getAlpha() );

    var c = this.mgr.canvas[0];
    var ctx = c.getContext("2d");
    var w = ctx.canvas.width;
    if (w < 200) w = 200;
    var h = ctx.canvas.height;

    this.headerHeight = 20;

    this.position = new Vector(w * Math.random(), h * Math.random());
    this.velocity = new Vector(0,0);
    this.width = 100;
    this.radius = 25;
    this.height = this.headerHeight;
    this.av = new Vector(0,0);
    this.updatePosition(this.position);
  }

  focus() {
    this.focused = true;
    this.mgr.needsRedraw = true;
  }

  blur() {
    this.focused = false;
    this.mgr.needsRedraw = true;
  }

  getStyle(alpha) {
    return "hsl(" + this.hue + ',' +
             this.saturation + '%,' +
             this.lightness + '%, '+alpha+'%)';
  }

  getAlpha() {
    return 100 - 100 * constrain((Date.now() - this.lastHeard)/1000, 0, 60)/60;
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

  checkForOldRoutes() {
    var activeHops = 0;
    for (const [key, nextHop] of Object.entries(this.nextHops)) {
      if (Date.now() - nextHop.lastHeard > 60000) {
        delete this.nextHops[key];
      } else {
        activeHops++;
      }
    }
    this.connected = activeHops > 0;
  }

  draw() {
    this.checkForOldRoutes();

    if (this.getAlpha() < 0.01) return;

    var c = this.mgr.canvas[0];
    var ctx = c.getContext("2d");

    var w = this.width;
    var w2 = w/2;
    var h = this.height;
    var h2 = h/2;
    var px = this.mgr.panPosition.x;
    var py = this.mgr.panPosition.y;

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.arc(px + this.position.x+1, py + this.position.y+2, this.radius+2, 0, 2 * Math.PI);
    ctx.fill();

    // update fillStyle
    this.fillStyle = this.getStyle( this.getAlpha() );

    var dim = (this.mgr.dragBlock && this.mgr.dragBlock != this);
    ctx.fillStyle = dim ? '#505050' : this.fillStyle;
    ctx.strokeStyle = '#505050';
    ctx.lineWidth = 1;
    //roundRect(ctx, px + this.position.x - w2, py + this.position.y - h2, w, h, 6, true);
    ctx.beginPath();
    ctx.arc(px + this.position.x, py + this.position.y, this.radius, 0, 2 * Math.PI);
    ctx.fill();

    // focus ring
    if (this.focused) {
      ctx.strokeStyle = '#007bff';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(px + this.position.x, py + this.position.y, this.radius, 0, 2 * Math.PI);
      ctx.stroke();
    }

    // node id label
    ctx.fillStyle = '#000';
    //ctx.font = this.mgr.uiRoot.css('font');
    ctx.font = '1rem bold Arial,sans-serif';
    //console.log('font: ', ctx.font);
		ctx.textAlign = 'center';
    //ctx.fillText(this.node, px + this.position.x, py + this.y1 + this.headerHeight - 6);
    ctx.fillText(this.node, px + this.position.x, py + this.y1 + this.headerHeight - 17);

    // utilisation bargraph
    ctx.fillStyle = '#555';
    var bw = this.radius * 2 - 8;
    var bh = 12;
    ctx.fillRect(px + this.position.x - bw/2, py + this.position.y - 3, bw, bh);

    ctx.fillStyle = "hsl(" + (135 * (1-this.utilisation)) + ',' +
                     '100%,' +
                     '70%, 100%)';
    ctx.fillRect(px + this.position.x - bw/2, py + this.position.y - 2, bw * this.utilisation, bh-2);


    // stats label
    /*
    var s = (100 * this.utilisation).toFixed(0) + '%';
    //var s = this.kickRate.toFixed(1)+', '+ this.chokeRate.toFixed(1);
    //var s = this.txQueueSize;
    ctx.font = '0.9rem Arial,sans-serif';
    ctx.fillText(s, px + this.position.x, py + this.y1 + this.headerHeight - 4);
    */

    // queue size
    ctx.fillStyle = '#000';
    ctx.font = '0.9rem Arial,sans-serif';
    ctx.fillText(this.txQueueSize, px + this.position.x, py + this.y1 + this.headerHeight + 10);
  }

  drawWires() {
    // draw ports
    for (const [key, nextHop] of Object.entries(this.nextHops)) {
      nextHop.draw();
    }
  }

  addHop(next, dest, metric, netInterface, avgAttempts, avgAckTime) {
    if (dest == this) return;

    if (!this.nextHops.hasOwnProperty(next.node)) {
      this.nextHops[next.node] = new NetWire(this.mgr, this, next, netInterface);
    }

    // update destinations (point to the next block)
    this.destinations[dest.node] = next;

    this.nextHops[next.node].lastHeard = Date.now();

    this.connected = true;

    // only update metric if this is a direct route
    if (next == dest) {
      this.nextHops[next.node].avgAttempts = avgAttempts;
      this.nextHops[next.node].avgAckTime = avgAckTime;

      if (metric < this.nextHops[next.node].metric) {
        this.nextHops[next.node].metric = metric;
        this.nextHops[next.node].netInterface = netInterface;
      }
    }
  }

}
