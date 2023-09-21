import * as DLM from '../droneLinkMsg.mjs';
import Vector from '../Vector.mjs';
import GraphWire from './GraphWire.mjs';
import GraphPort from './GraphPort.mjs';

/**
 * Draws a rounded rectangle using the current state of the canvas.
 * If you omit the last three params, it will draw a rectangle
 * outline with a 5 pixel border radius
 * @param {CanvasRenderingContext2D} ctx
 * @param {Number} x The top left x coordinate
 * @param {Number} y The top left y coordinate
 * @param {Number} width The width of the rectangle
 * @param {Number} height The height of the rectangle
 * @param {Number} [radius = 5] The corner radius; It can also be an object
 *                 to specify different radii for corners
 * @param {Number} [radius.tl = 0] Top left
 * @param {Number} [radius.tr = 0] Top right
 * @param {Number} [radius.br = 0] Bottom right
 * @param {Number} [radius.bl = 0] Bottom left
 * @param {Boolean} [fill = false] Whether to fill the rectangle.
 * @param {Boolean} [stroke = true] Whether to stroke the rectangle.
 */
function roundRect(ctx, x, y, width, height, radius, fill, stroke) {
  if (typeof stroke === 'undefined') {
    stroke = true;
  }
  if (typeof radius === 'undefined') {
    radius = 5;
  }
  if (typeof radius === 'number') {
    radius = {tl: radius, tr: radius, br: radius, bl: radius};
  } else {
    var defaultRadius = {tl: 0, tr: 0, br: 0, bl: 0};
    for (var side in defaultRadius) {
      radius[side] = radius[side] || defaultRadius[side];
    }
  }
  ctx.beginPath();
  ctx.moveTo(x + radius.tl, y);
  ctx.lineTo(x + width - radius.tr, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius.tr);
  ctx.lineTo(x + width, y + height - radius.br);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius.br, y + height);
  ctx.lineTo(x + radius.bl, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius.bl);
  ctx.lineTo(x, y + radius.tl);
  ctx.quadraticCurveTo(x, y, x + radius.tl, y);
  ctx.closePath();
  if (fill) {
    ctx.fill();
  }
  if (stroke) {
    ctx.stroke();
  }

}



export default class GraphBlock {
  constructor(mgr, data) {
    this.mgr = mgr;
    this.channel = data.id; // channel id
    // check for name
    this.name = '';
    if (data.params.hasOwnProperty(2)) this.name = data.params[2].values[0];
    this.module = data;

    this.hovering = false;

    this.numPorts = 0;
    this.numConnectedPorts = 0;
    this.ports = {};

    this.columns = [];  // a set of column widths, used to manage UI layout of GraphPorts

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
    this.height = this.headerHeight;
    this.av = new Vector(0,0);
    this.updatePosition(this.position);

    // setup params
    for (const id in this.module.params) {
      var param = this.module.params[id];

      var p = new GraphPort(this.mgr, this, param);
      this.ports[param.address] = p;
    }

    this.needsPortResize = true;

    this.mgr.needsRedraw = true;
  }

  resolveAddresses() {
    for (const [key, port] of Object.entries(this.ports)) {
      port.resolveAddress();
    }
  }

  getPortByName(name) {
    for (const [key, port] of Object.entries(this.ports)) {
      if (port.name == name) {
        return port;
      }
    }
    return null;
  }

  hover() {
    if (this.hovering) return;

    // show stuff
    for (const [key, port] of Object.entries(this.ports)) {
      port.hover();
    };
    this.needsPortResize = true;
    this.mgr.needsRedraw = true;

    this.hovering = true;
  }

  unhover() {
    if (!this.hovering) return;

    // hide stuff
    for (const [key, port] of Object.entries(this.ports)) {
      port.unhover();
    };
    this.needsPortResize = true;
    this.mgr.needsRedraw = true;

    this.hovering = false;
  }

  mousedown(x,y) {
    // x,y should already have been hit tested and fall within our bounds
    // should return true if this causes an interaction

    // pass the hit on to ports
    for (const [key, port] of Object.entries(this.ports)) {
      if (port.hit(x,y)) {
        return port.mousedown(x,y);
      }
    };

    return false;
  }

  hit(x,y) {
    return (x > this.x1 && x < this.x2 &&
            y > this.y1 && y < this.y2);
  }

  collidingWith(ob, padding) {
    var v = new Vector(0,0);
    // overlap values will be positive if overlapping
    var xo1 = (ob.x2 + padding) - this.x1;
    var xo2 = (this.x2 + padding) - ob.x1;
    var yo1 = (ob.y2 + padding) - this.y1;
    var yo2 = (this.y2 + padding) - ob.y1;
    if (xo1 > 0 && xo2 > 0 && yo1 > 0 && yo2 > 0) {
      if (Math.min(xo1,xo2) > Math.min(yo1,yo2)) {
        if (yo1 < yo2) {
          v.y = yo1;
        } else {
          v.y = -yo2;
        }
      } else {
        if (xo1 < xo2) {
          v.x = xo1;
        } else {
          v.x = -xo2;
        }
      }
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

  updatePortPositions() {
    if (!this.needsPortResize) return;

    var y = this.headerHeight;
    var i = 0;
    this.numConnectedPorts = 0;
    for (const [key, port] of Object.entries(this.ports)) {
      port.sortOder = i;
      port.y = y;
      y += port.height * port.shrink;
      i++;
      if (port.connected) this.numConnectedPorts++;

      // update column widths
      for (var j=0; j<port.cellMinWidths.length; j++) {
        if (j >= this.columns.length) {
          this.columns.push(port.cellMinWidths[j]);
        } else {
          if (this.columns[j] < port.cellMinWidths[j]) this.columns[j] = port.cellMinWidths[j];
        }
      }
    }
    this.height = y;

    // recalc width
    this.width = 0;
    this.columns.forEach((c)=>{
      this.width += c;
    });

    this.updateCorners();

    this.needsPortResize = false;
  }

  draw() {
    this.updatePortPositions();

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
    roundRect(ctx, px + this.position.x - w2, py + this.position.y - h2, w, h, 6, true);

    // label
    ctx.fillStyle = '#000';
    ctx.font = this.mgr.uiRoot.css('font');
		ctx.textAlign = 'center';
    ctx.fillText(this.channel +'. '+ this.name, px + this.position.x, py + this.y1 + this.headerHeight - 6);

    // draw ports
    for (const [key, port] of Object.entries(this.ports)) {
      port.draw();
    }
  }

  drawWires() {
    // draw ports
    for (const [key, port] of Object.entries(this.ports)) {
      port.drawWire();
    }
  }

}
