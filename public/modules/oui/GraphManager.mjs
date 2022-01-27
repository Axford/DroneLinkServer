import loadStylesheet from '../loadStylesheet.js';
import * as DLM from '../droneLinkMsg.mjs';
import GraphBlock from './GraphBlock.mjs';
import Vector from '../Vector.mjs';

loadStylesheet('./css/modules/oui/GraphManager.css');


export default class GraphManager {
  constructor(node, uiRoot) {
    this.node = node;
    this.uiRoot = uiRoot;

    this.needsRedraw = true;
    this.frame = 0;

    this.blocks = [];

    // create canvas
    this.canvas = $('<canvas />');
    this.uiRoot.append(this.canvas);

    this.resize(); // will trigger a redraw

    this.update();
  }

  update() {
    this.updatePositions();
    this.draw();

    window.requestAnimationFrame(this.update.bind(this));
  }

  getBlockById(channel) {
    for (var i=0; i<this.blocks.length; i++) {
      var b = this.blocks[i];
      if (b.channel == channel) return b;
    }
    return null;
  }

  resize() {
    var c = this.canvas[0];
    var ctx = c.getContext("2d");

    // keep width updated
    var w = this.uiRoot.width();
    ctx.canvas.width = w;
    var h = this.uiRoot.height();
    ctx.canvas.height = h;

    this.needsRedraw = true;
    //this.draw();
  }

  draw() {
    if (!this.needsRedraw) return;

    this.frame++;

    var c = this.canvas[0];
    var ctx = c.getContext("2d");

    var w = ctx.canvas.width;
    var cx = w/2;

    var h = ctx.canvas.height;
    var cy = h/2;

    ctx.fillStyle = '#343a40';
    ctx.fillRect(0,0,w,h);

    // draw all blocks
    for (var i=0; i<this.blocks.length; i++) {
      this.blocks[i].draw();
    }

    // frame counter
    ctx.fillStyle = '#5F5';
    ctx.font = '10px bold sans-serif';
		ctx.textAlign = 'left';
    ctx.fillText(this.frame, 5, 10);

    this.needsRedraw = false;
  }

  updatePositions() {
    // adjust positions of all blocks

    var c = this.canvas[0];
    var ctx = c.getContext("2d");

    var w = ctx.canvas.width;
    var h = ctx.canvas.height;
    var cv = new Vector(w/2, h/2);

    var blockSpacing = 150;
    var blockYSpacing = 50;

    var padding = 40;

    // reset accel vectors
    for (var i=0; i<this.blocks.length; i++) {
      var b = this.blocks[i];
      b.av.x = 0;
      b.av.y = 0;
    }

    // update accelerations
    for (var i=0; i<this.blocks.length; i++) {
      var b = this.blocks[i];

      // check wiring
      for (const [key, wire] of Object.entries(b.wires)) {
        if (wire.oblock) {
          // check this block is to the right of oblock
          var ol = (wire.oblock.x2 + padding) - b.x1;
          if (ol > 0) {
            b.av.x += ol * 10;
            wire.oblock.av.x += -ol * 10;
          }

          // gently pull into vertical alignment
          ol = b.y1 - wire.oblock.y1;

          b.av.y += -ol;
          wire.oblock.av.y += ol;

        }
      }


      // for each block... calculate vector to all other blocks
      for (var j=0; j<this.blocks.length; j++) {
        if (j != i) {
          var ob = this.blocks[j];

          // see if blocks are colliding, allow for padding
          // overlap is a vector in direction of minimum overlap
          var overlap = b.collidingWith(ob, padding);
          if (overlap.length() > 0) {
            overlap.multiply(10);
            b.av.add(overlap);
          }
        }
      }

      // pull wired blocks towards the centre
      if (b.numWires > 0) {
        var temp = cv.clone();
        temp.subtract(b.position);
        temp.multiply(0.1);
        b.av.add(temp);
      } else {
        // everything else toward the top
        var temp = cv.clone();
        temp.y /= 2;
        temp.subtract(b.position);
        temp.multiply(0.05);
        b.av.add(temp);
      }

    }

    // apply accelerations
    for (var i=0; i<this.blocks.length; i++) {
      var b = this.blocks[i];

      // accelerate in net direction
      b.av.multiply(0.01);
      b.velocity.add(b.av);

      // clamp velocity
      var bv = b.velocity.length();
      if (bv > 50) {
        b.velocity.multiply(10 / bv);
      }

      // apply drag
      b.velocity.multiply(0.8);

      // update position
      b.addToPosition(b.velocity);

      // trigger redraw if movement is significant
      if (bv > 0.1) this.needsRedraw = true;
    }
  }

  addBlock(state, data) {
    // add a new block representing a module
    var b = new GraphBlock(this, state, data);
    this.blocks.push( b );
  }
}
