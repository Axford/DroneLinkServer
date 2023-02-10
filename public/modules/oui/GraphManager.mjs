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
    this.visible = false;

    this.blocks = [];

    this.pan = false;
    this.panPosition = new Vector(0,0);
    this.panStart = new Vector(0,0);
    this.dragStart = new Vector(0,0);
    this.dragBlock = null;
    this.dragBlockPos = new Vector(0,0);  // starting pos

    // create canvas
    this.canvas = $('<canvas />');
    this.uiRoot.append(this.canvas);

    // event handlers
    this.canvas.on('mousedown', (e)=>{

			var offsetX = $( e.target ).offset().left;
			var offsetY = $( e.target ).offset().top;
			var w = $(e.target).innerWidth();
			var h = $(e.target).innerHeight();

      this.dragStart.x = (e.pageX - offsetX);
      this.dragStart.y = (e.pageY - offsetY);

      // check if we're clicking on a block...
      // calc un-panned coordinates
      var x1 = this.dragStart.x - this.panPosition.x;
      var y1 = this.dragStart.y - this.panPosition.y;

      this.dragBlock = null;
      //console.log('hit', x1, y1);
      for (var i=0; i<this.blocks.length; i++) {
        var b = this.blocks[i];
        //console.log('hit', b);
        if (b.hit(x1,y1)) {
          console.log('hit',b);
          this.dragBlock = b;
          this.dragBlockPos.set(b.position);
          continue;
        }
      }

      if (!this.dragBlock) {
        // otherwise its a pan
        this.panStart.x = this.panPosition.x;
        this.panStart.y = this.panPosition.y;

        this.pan = true;
      }

    });

    this.canvas.on('mousemove', (e)=>{
      var offsetX = $( e.target ).offset().left;
      var offsetY = $( e.target ).offset().top;
      var w = $(e.target).innerWidth();
      var h = $(e.target).innerHeight();

      var dx = (e.pageX - offsetX) - this.dragStart.x;
      var dy = (e.pageY - offsetY) - this.dragStart.y;

      if (this.dragBlock) {
        var newPos = this.dragBlockPos.clone();
        newPos.x += dx;
        newPos.y += dy;
        this.dragBlock.updatePosition(newPos);

      } else if (this.pan) {
        this.panPosition.x = this.panStart.x + dx;
        this.panPosition.y = this.panStart.y + dy;
        this.needsRedraw = true;
      }

    });

    this.canvas.on('mouseup', (e)=>{

			this.pan = false;
      this.dragBlock = null;
    });

    this.resize(); // will trigger a redraw

    this.update();
  }


  show() {
    this.visible = true;
  }

  hide() {
    this.visible = false;
  }


  update() {
    if (this.visible) {
      this.updatePositions();
      this.draw();
    }
    
    window.requestAnimationFrame(this.update.bind(this));
  }

  getPortByAddress(channel, param) {
    for (var i=0; i<this.blocks.length; i++) {
      var b = this.blocks[i];
      if (b.channel == channel) {
        // check ports
        if (b.ports[param]) return b.ports[param];
      }
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

    // draw wires
    for (var i=0; i<this.blocks.length; i++) {
      this.blocks[i].drawWires();
    }

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

      for (const [key, port] of Object.entries(b.ports)) {
        if (port.wire && port.wire.oport) {
          // check this block is to the right of oblock
          var ol = (port.wire.oport.block.x2 + padding) - b.x1;
          if (ol > 0) {
            b.av.x += ol * 10;
            port.wire.oport.block.av.x += -ol * 10;
          } else {
            b.av.x += -1;
            port.wire.oport.block.av.x += 1;
          }

          // gently pull into vertical alignment
          ol = (b.y1 + port.y) - (port.wire.oport.block.y1 + port.wire.oport.y);

          b.av.y += -ol;
          port.wire.oport.block.av.y += ol;

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
            overlap.multiply(20);
            b.av.add(overlap);
          }
        }
      }

      // pull blocks gently towards the centre
      var temp = cv.clone();
      temp.subtract(b.position);
      temp.multiply(0.01);
      b.av.add(temp);
      /*
      if (b.numConnectedPorts > 0) {
        var temp = cv.clone();
        temp.subtract(b.position);
        temp.multiply(0.1);
        b.av.add(temp);
      } else {
        // everything else toward the top
        var temp = cv.clone();
        temp.y /= 2;
        temp.subtract(b.position);
        temp.multiply(0.1);
        b.av.add(temp);
      }
      */

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
