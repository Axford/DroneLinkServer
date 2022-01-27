import * as DLM from '../droneLinkMsg.mjs';
import Vector from '../Vector.mjs';
import GraphWire from './GraphWire.mjs';

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
  constructor(mgr, state, data) {
    this.mgr = mgr;
    this.state = state;
    this.node = data.node; // node id
    this.channel = data.channel; // channel id
    this.name = '';

    this.numWires = 0;
    this.wires = {};

    var c = this.mgr.canvas[0];
    var ctx = c.getContext("2d");
    var w = ctx.canvas.width;
    var h = ctx.canvas.height;

    this.position = new Vector(w * Math.random(), h * Math.random());
    this.velocity = new Vector(0,0);
    this.width = 100;
    this.height = 40;
    this.av = new Vector(0,0);
    this.updatePosition(this.position);

    // listen for module name
    this.state.on('module.name', (data)=>{
      if (data.node != this.node ||
         data.channel != this.channel) return;

      this.name = data.name;
    });

    // listen for values
    this.state.on('param.value', (data)=>{
      if (data.node != this.node ||
         data.channel != this.channel) return;

      if (data.msgType == DLM.DRONE_LINK_MSG_TYPE_ADDR) {
        //console.log('blockVal', data);
        var onode = data.values[1];
        var ochannel = data.values[2];
        var oparam = data.values[3];
        var addr = onode +'>' + ochannel + '.' + oparam;

        // ignore subs to other nodes
        if (onode != this.node) return;

        if (!this.wires.hasOwnProperty(addr)) {
          this.wires[addr] = new GraphWire(this.mgr, this.state, this, onode, ochannel, oparam);
          this.numWires++;
        }

      }


    });
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

  draw() {
    var c = this.mgr.canvas[0];
    var ctx = c.getContext("2d");

    var w = this.width;
    var w2 = w/2;
    var h = this.height;
    var h2 = h/2;

    ctx.fillStyle = this.numWires > 0 ? '#a4aab0' : '#808080';
    ctx.strokeStyle = '#505050';
    ctx.lineWidth = 1;
    roundRect(ctx, this.position.x - w2, this.position.y - h2, w, h, 6, true);

    // label
    ctx.fillStyle = '#000';
    ctx.font = this.mgr.uiRoot.css('font');
		ctx.textAlign = 'center';
    ctx.fillText(this.channel +'. '+ this.name, this.position.x, this.position.y + 4);

    // draw wires
    for (const [key, value] of Object.entries(this.wires)) {
      value.draw();
    }
  }

}
