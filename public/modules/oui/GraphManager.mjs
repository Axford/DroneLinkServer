import loadStylesheet from '../loadStylesheet.js';
import * as DLM from '../droneLinkMsg.mjs';
import GraphBlock from './GraphBlock.mjs';
import Vector from '../Vector.mjs';
import SparkLine from '../SparkLine.mjs';

loadStylesheet('./css/modules/oui/GraphManager.css');

function constrain(v, minV, maxV) {
  if (v > maxV) return maxV;
  if (v < minV) return minV;
  return v;
}

export default class GraphManager {
  constructor(editor, uiRoot) {
    this.editor = editor;
    this.uiRoot = uiRoot;

    this.needsRedraw = true;
    this.frame = 0;
    this.lastUpdate = Date.now();
    this.visible = false;

    this.blocks = [];

    this.nodeId = 0;

    this.baseFont = '-apple-system, "system-ui", "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"';

    this.pan = false;
    this.panPosition = new Vector(0,0);
    this.panStart = new Vector(0,0);
    this.dragStart = new Vector(0,0);
    this.dragBlock = null;
    this.dragBlockPos = new Vector(0,0);  // starting pos
    this.hoverBlock = null;

    this.rewiring = null; // port we are rewiring

    // create sparklines
    var d1 = $('<div style="width:60px; height:25px; position:absolute; top:80px; left:8px;"></div>');
    this.uiRoot.append(d1);
    var d2 = $('<div style="width:60px; height:25px; position:absolute; top:110px; left:8px;"></div>');
    this.uiRoot.append(d2);
    
    this.updatePositionsSpark = new SparkLine(d1, { label: 'Up', precision:1});
    this.drawSpark = new SparkLine(d2, { label: 'Dr', precision:1});

    // create canvas
    this.canvas = $('<canvas tabindex=1 />');
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
      var hitBlock = null;

      // check to see if we have a hoverBlock to speed up the search
      if (this.hoverBlock) {
        // see if we're still over it, seems most likely
        if (this.hoverBlock.hit(x1,y1)) {
          hitBlock = this.hoverBlock;
        }
      }

      // if we aren't over the hoverBlock, search everything else
      if (!hitBlock) {
        for (var i=0; i<this.blocks.length; i++) {
          var b = this.blocks[i];
          if (!b) continue;
          //console.log('hit', b);
          if (b.hit(x1,y1)) {
            console.log('hit',b);
            hitBlock = b;
            continue;
          }
        }
      }

      // if we've hit a block...
      if (hitBlock) {
        if (this.rewiring) {
          // get port at hit location
          var p = hitBlock.getPortAtLocation(x1,y1);
          if (p && p.isSuitableRewireSource()) {
            // complete rewire
            this.endRewire(p);

            this.blocks.forEach((b)=> { 
              b.needsRedraw = true;
            });

          }

        } else {
          hitBlock.bright();
          // dim other blocks
          this.blocks.forEach((b)=> { 
            if (b != hitBlock) b.dim();
          });
          // pass the hit onto the block to see if it interacts with a control
          if (hitBlock.mousedown(x1,y1)) {
            this.needsRedraw = true;  // in case something changed
            this.blocks.forEach((b)=> { 
              b.needsRedraw = true;
            });
          } else {
            // if it's not interacting with a block control, then we must be dragging the block header
            this.dragBlock = hitBlock;
            this.dragBlockPos.set(hitBlock.position);
          }
        }
      } else if (!this.dragBlock) {
        if (this.rewiring) {
          // we've clicked in free space, so end the wiring attempt
          this.endRewire(null);
        } else {
          // otherwise its a pan
          this.panStart.x = this.panPosition.x;
          this.panStart.y = this.panPosition.y;

          this.pan = true;
        }
      }

    });

    this.canvas.on('mousemove', (e)=>{
      var offsetX = $( e.target ).offset().left;
      var offsetY = $( e.target ).offset().top;
      var w = $(e.target).innerWidth();
      var h = $(e.target).innerHeight();

      var dx = (e.pageX - offsetX) - this.dragStart.x;
      var dy = (e.pageY - offsetY) - this.dragStart.y;

      var x1 = (e.pageX - offsetX) - this.panPosition.x;
      var y1 = (e.pageY - offsetY) - this.panPosition.y;

      if (this.rewiring) {
        // pass movement to wire
        this.rewiring.moveRewire(x1,y1);

      } else if (this.dragBlock) {
        var newPos = this.dragBlockPos.clone();
        newPos.x += dx;
        newPos.y += dy;
        this.dragBlock.updatePosition(newPos);

      } else if (this.pan) {
        this.panPosition.x = this.panStart.x + dx;
        this.panPosition.y = this.panStart.y + dy;
        this.needsRedraw = true;
      } else {
        // check for hover
        if (this.hoverBlock) {
          // see if we're still over it, seems most likely
          if (!this.hoverBlock.hit(x1,y1)) {
            this.hoverBlock = null;
          }
        }
        
        if (!this.hoverBlock) {
          for (var i=0; i<this.blocks.length; i++) {
            var b = this.blocks[i];
            if (!b) continue;
            if (b.hit(x1,y1)) {
              this.hoverBlock = b;
              b.hover();
            } else {
              b.unhover();
            }
          }
        }

        if (this.hoverBlock) {
          this.hoverBlock.mousemove(x1,y1);
          this.hoverBlock.bright();
        }

        
        // dim or bright other blocks
        this.blocks.forEach((b)=> { 
          if (this.hoverBlock) {
            if (b != this.hoverBlock) b.dim();
          } else {
            b.bright();
          }
        });
      }

    });

    this.canvas.on('mouseup', (e)=>{

			this.pan = false;
      this.dragBlock = null;
    });


    // use global keydown messages to avoid focus issues
    $(document).keydown((e)=>{
      // if we are active...
      if (this.visible) {
        // pass to hover block if available
        if (this.hoverBlock) {
          this.hoverBlock.keydown(e);
        }
      }
    });

    this.resize(); // will trigger a redraw

    this.update();
  }


  startRewire(port) {
    this.rewiring = port;
  }

  endRewire(port) {
    if (this.rewiring) this.rewiring.endRewire(port);
    this.rewiring = null;
  }


  clear() {
    this.blocks = [];
    this.dragBlock = null;
  }

  show() {
    this.visible = true;
    this.frame = 0;
    this.drawn = 0;
    this.drawTime = 0;
    this.updatePositionsTime = 0;
    this.startTime = Date.now();
    this.sparkTimer = Date.now();
    
    this.resize();
    this.update();
  }

  hide() {
    this.visible = false;
  }


  update() {
    if (this.visible) {
      this.frame++;
      var loopTime = Date.now();
      this.fps = this.frame / ((loopTime - this.startTime) / 1000);

      var t1 = performance.now();
      
      this.updatePositions();
      var t2 = performance.now();
      var dt1 = (t2 - t1);
      this.updatePositionsTime = (9*this.updatePositionsTime + dt1)/10;

      if (this.draw()) {
        this.drawn++;
        var t3 = performance.now();
        var dt2 = (t3 - t2);
        this.drawTime = (9*this.drawTime + dt2)/10;
      }

      if (loopTime > this.sparkTimer + 1000) {
        this.updatePositionsSpark.addSample(this.updatePositionsTime);
        this.drawSpark.addSample(this.drawTime);

        this.sparkTimer = loopTime;
      }
      
    }
    
    window.requestAnimationFrame(this.update.bind(this));
  }

  resolveAddresses() {
    for (var i=0; i<this.blocks.length; i++) {
      var b = this.blocks[i];
      if (b) b.resolveAddresses(); 
    }
  }

  getBlockByName(name) {
    // search for a block (module) based on name
    for (var i=0; i<this.blocks.length; i++) {
      var b = this.blocks[i];
      if (b && b.name == name) {
        return b;
      }
    }
    return null;
  }

  getBlockById(id) {
    // search for a block (module) based on id
    for (var i=0; i<this.blocks.length; i++) {
      var b = this.blocks[i];
      if (b && b.channel == id) {
        return b;
      }
    }
    return null;
  }

  getBlocksByType(type) {
    var res = [];
    for (var i=0; i<this.blocks.length; i++) {
      var b = this.blocks[i];
      if (b && b.module.type == type) {
        res.push(b);
      }
    }
    return res;
  }

  getPortByAddress(channel, param) {
    var b = this.getBlockById(channel);
    if (b) {
      // check ports
      if (b.ports[param]) return b.ports[param];
    }     
    return null;
  }

  getNextBlockId() {
    // return the next free block id
    for (var i =0; i<255; i++) {
      var b = this.getBlockById(i);
      if (!b) return i;
    }
  }

  removeBlock(block) {
    if (block.channel == 0) return;  // can't delete Node block

    this.hoverBlock = null;
    this.dragBlock = null;

    block.disconnectAll();

    // delete block from array
    _.pull(this.blocks, block);

    // check for disconnected addresses
    this.resolveAddresses();

    // also remove from config
    this.editor.removeBlock(block);

    // ensure we redraw
    this.needsRedraw = true;
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
    if (!this.needsRedraw) return false;
    this.needsRedraw = false;

    var c = this.canvas[0];
    var ctx = c.getContext("2d");

    var w = ctx.canvas.width;
    var cx = w/2;

    var h = ctx.canvas.height;
    var cy = h/2;

    ctx.fillStyle = '#343a40';
    ctx.fillRect(0,0,w,h);

    // draw cross hairs
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, this.panPosition.y + cy);
    ctx.lineTo(w, this.panPosition.y + cy);
    ctx.moveTo(this.panPosition.x + cx, 0);
    ctx.lineTo(this.panPosition.x + cx, h);
    ctx.stroke();

    // draw wires, except rewiring wire
    for (var i=0; i<this.blocks.length; i++) {
      if (!this.blocks[i]) continue;
      this.blocks[i].drawWires();
    }

    // draw all blocks, except hoverBlock
    for (var i=0; i<this.blocks.length; i++) {
      if (!this.blocks[i]) continue;
      if (this.blocks[i] != this.hoverBlock) this.blocks[i].draw();
    }
    if (this.hoverBlock) this.hoverBlock.draw();

    // draw rewiring wire
    if (this.rewiring) this.rewiring.drawWire();

    // frame counter
    var fy = 70;
    ctx.fillStyle = '#5F5';
    ctx.font = '10px ' + this.baseFont;
		ctx.textAlign = 'left';
    ctx.fillText('F: '+this.frame + ', D: ' + (100*this.drawn / this.frame).toFixed(0) +'%', 5, fy + 10);

    // FPS
    ctx.fillText('FPS: '+this.fps.toFixed(1), 5, fy + 25);

    // update time
    ctx.fillText('UpT: '+this.updatePositionsTime.toFixed(2) + 'ms', 5, fy + 40);

    // draw time
    ctx.fillText('DrT: '+this.drawTime.toFixed(2)+'ms', 5, fy + 55);


    return true;
  }

  updatePositions() {
    // adjust positions of all blocks
    var loopTime = Date.now();
    var dt = (loopTime - this.lastUpdate) / 1000;  // in seconds
    if (dt > 1/50) dt = 1/50;
    this.lastUpdate = loopTime;

    var c = this.canvas[0];
    var ctx = c.getContext("2d");

    var w = ctx.canvas.width;
    var h = ctx.canvas.height;
    var cv = new Vector(w/2, h/2);

    var blockSpacing = 150;
    var blockYSpacing = 50;

    var padding = 80;

    // reset accel vectors
    for (var i=0; i<this.blocks.length; i++) {
      var b = this.blocks[i];
      if (!b) continue;
      b.av.x = 0;
      b.av.y = 0;
    }

    // update accelerations
    for (var i=0; i<this.blocks.length; i++) {
      var b = this.blocks[i];
      if (!b) continue;

      // check wiring
      for (const [key, port] of Object.entries(b.ports)) {
        if (port.wire && port.wire.oport) {
          // check this block is to the right of oblock
          var ol = (port.wire.oport.block.x2 + padding) - b.x1;
          if (ol > 0) {
            b.av.x += ol * 10;  // 10 
            port.wire.oport.block.av.x += -ol * 10;  // 10
          } else {
            b.av.x += -1;
            port.wire.oport.block.av.x += 1;
          }

          // gently pull into vertical alignment
          ol = (b.y1 + port.y) - (port.wire.oport.block.y1 + port.wire.oport.y);

          b.av.y += -ol / 10;
          port.wire.oport.block.av.y += ol/10;

        }
      }



      // for each block... calculate vector to all other blocks
      for (var j=0; j<this.blocks.length; j++) {
        if (j != i) {
          var ob = this.blocks[j];
          if (!ob) continue;

          // see if blocks are colliding, allow for padding
          // overlap is a vector in direction of minimum overlap
          var overlap = b.collidingWith(ob, padding);
          if (overlap.length() > 0) {
            overlap.capLength(100);
            overlap.multiply(10);
            b.av.add(overlap);
          }
        }
      }

      // pull blocks gently towards the centre in x
      var olx = constrain(b.position.x - cv.x, -10, 10);
      b.av.x -= 10 * olx;
      

      if (b.numConnectedPorts == 0) {
        // put unconnected blocks below the centreline
        var ol = (cv.y + padding/2 + 5) - b.y1;
        if (ol > 0) {
          b.av.y += 5 * ol;
        } else {
          b.av.y += ol/2;
        }

      } else {
        // put connected blocks above the centreline
        var ol = b.y2 - (cv.y - padding/2 - 5);
        if (ol > 0) { 
          b.av.y -= 5 * ol;
        } else {
          b.av.y -= ol/2;
        }
      }

    }

    // apply accelerations
    for (var i=0; i<this.blocks.length; i++) {
      var b = this.blocks[i];
      if (!b) continue;

      if (b.hovering) {
        b.velocity.x = 0;
        b.velocity.y = 0;
      } else {
        // accelerate in net direction
        b.av.multiply(1);
        b.velocity.add(b.av);

        // clamp velocity
        b.velocity.capLength(1200);

        // apply drag
        b.velocity.multiply(0.97);

        // correct for fraction of time
        b.velocity.multiply(dt);

        // update position
        b.addToPosition(b.velocity);

        // trigger redraw if movement is significant
        if (b.velocity.dot(b.velocity) > 0.01) this.needsRedraw = true;
      }
    }

    // update wires
    for (var i=0; i<this.blocks.length; i++) {
      var b = this.blocks[i];
      if (!b) continue;
      b.updateWirePositions();
    }
  }

  addBlock(data) {
    // add a new block representing a module
    var b = new GraphBlock(this, data);
    this.blocks.push( b );
  }

  generateConfig() {
    var str = '';

    // export node id from dummy block
    str += 'node = ' + this.nodeId + '\n';
    str += '\n';

    // then generate the rest
    for (var i=0; i<this.blocks.length; i++) {
      var b = this.blocks[i];
      if (!b) continue;
      if (b.channel != 0) {
        str += b.generateConfig();
      }
    }

    return str;
  }
}
