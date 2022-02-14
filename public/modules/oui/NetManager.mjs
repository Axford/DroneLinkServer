import loadStylesheet from '../loadStylesheet.js';
import * as DLM from '../droneLinkMsg.mjs';
import * as DMRE from '../DroneMeshRouteEntry.mjs';
import NetBlock from './NetBlock.mjs';
import Vector from '../Vector.mjs';

//loadStylesheet('./css/modules/oui/NetManager.css');

function constrain(v, minv, maxv) {
  return Math.max(Math.min(v, maxv), minv);
}

export default class NetManager {
  constructor(socket, uiRoot) {
    this.uiRoot = uiRoot;
    this.socket = socket;

    this.needsRedraw = true;
    this.frame = 0;

    this.nodes = {};

    this.blocks = [];

    this.lastDraw = 0;

    this.callbacks = {};

    this.focusNode = 0;
    this.localAddress = 0;

    this.pan = false;
    this.panPosition = new Vector(0,0);
    this.panStart = new Vector(0,0);
    this.dragStart = new Vector(0,0);
    this.dragBlock = null;
    this.dragBlockPos = new Vector(0,0);  // starting pos

    this.discoveryTarget = 0;  // the node we're going to request route entries from
    this.discoverySubject = 0;    // the node we're going to reqest route info about


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
          this.focus(b.node);
          this.trigger('focus',b.node);
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

    // register for socket events
    this.socket.on('route.update', (msg)=>{
      console.log('route.update', msg);
      var re = new DMRE.DroneMeshRouteEntry(msg);
      console.log('route entry', re);
      this.routeUpdate(re);
    });

    this.socket.on('route.removed', (msg)=>{
      console.log('route.removed', msg);
    });


    // query existing routes to speed initial network build
    this.socket.emit('getRoutes', 0);

    setInterval(()=>{
      // cycle through building route entry info
      this.discoverRouteEntries();
    }, 200);


    this.resize(); // will trigger a redraw

    this.update();
  }


  focus(node) {
    // focus node, blur all other nodes
    this.focusNode = node;
    for (var i=0; i<this.blocks.length; i++) {
      if (this.blocks[i].node == node) {
        this.blocks[i].focus()
      } else {
        this.blocks[i].blur();
      }
    }
  }


  on(name, cb) {
    if (!this.callbacks.hasOwnProperty(name)) {
      this.callbacks[name] = [];
    }
    this.callbacks[name].push(cb);
  }


  trigger(name, param) {
    if (this.callbacks[name]) {
      this.callbacks[name].forEach((cb)=>{
        //console.log('trigger('+name+'): ', param);
        cb(param);
      })
    }
  }


  discoverRouteEntries() {
    // cycle through each node and query all other nodes for route entries

    // the blocks array as the basis for the discovery process
    if (this.discoveryTarget < this.blocks.length) {
      var target = this.blocks[this.discoveryTarget].node;

      if (this.discoverySubject < this.blocks.length) {
        if (this.discoverySubject != this.discoveryTarget) {
          var subject = this.blocks[this.discoverySubject].node;

          // generate route entry request
          console.log('getRoutesFor', target, subject);
          this.socket.emit('getRoutesFor', {
            target: target,
            subject: subject
          });
        }

        this.discoverySubject++;
      } else {
        this.discoverySubject = 0;
        this.discoveryTarget++;
      }
    } else {
      this.discoveryTarget = 0;
      this.discoverySubject = 0;
    }

  }


  update() {
    this.updatePositions();
    this.draw();

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
    var loopTime = Date.now();
    if (loopTime - this.lastDraw > 1000) this.needsRedraw = true;
    if (!this.needsRedraw) return;

    this.lastDraw = loopTime;

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

    var padding = 20;

    // get server block
    var sb = this.nodes[this.localAddress];

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
      for (const [key, hop] of Object.entries(b.nextHops)) {
        // calc vector from this node to hop
        var hv = hop.dest.position.clone();
        hv.subtract(b.position);

        // compare it to the target length based on metric
        var hvl = hv.length();
        var targetLen = constrain(hop.metric * 20, 20, 300) + 50;
        var hvr = (hvl - targetLen) / 10;

        // update accel vector
        hv.normalize();
        hv.multiply(hvr);
        b.av.add(hv);

        // invert and add to hop as well
        hv.multiply(-1);
        hop.dest.av.add(hv);
      }


      // for each block... calculate vector to all other blocks
      for (var j=0; j<this.blocks.length; j++) {
        if (j != i) {
          var ob = this.blocks[j];

          if (ob == b) continue;

          // see if blocks are colliding, allow for padding
          // overlap is a vector in direction of minimum overlap
          var overlap = b.collidingWith(ob, padding);
          if (overlap.length() > 0) {
            overlap.multiply(20);
            b.av.add(overlap);

          } else {
            // otherwise add a gentle repulsion
            var temp = ob.position.clone();
            temp.subtract(b.position);
            temp.normalize();
            temp.multiply(1);
            ob.av.add(temp);

            temp.multiply(-1);
            b.av.add(temp);
          }



        }
      }

      // pull blocks gently towards the centre
      /*
      var temp = cv.clone();
      temp.subtract(b.position);
      temp.multiply(0.01);
      b.av.add(temp);
      */
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

    if (sb) {
      // zero out accelerations
      sb.av.subtract(sb.av);
      // force position to centre
      sb.position.x = w/2;
      sb.position.y = h/2;
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

  addBlock(addr, updateLastHeard) {
    if (!this.nodes.hasOwnProperty(addr)) {
      // add a new block representing a module
      var b = new NetBlock(this, addr);
      this.blocks.push( b );
      this.nodes[addr] = b;
    }

    if (updateLastHeard)
      this.nodes[addr].lastHeard = Date.now();

    return this.nodes[addr];
  }


  updateBlock(addr, re) {
    // TODO

    this.draw();
  }


  routeUpdate(re) {
    // check src and dest exist
    var src = this.addBlock(re.src, true);
    var next = this.addBlock(re.nextHop, false);
    var dest = this.addBlock(re.node, false);

    src.addHop(next, dest,
      next == dest ? re.metric : 255,
      re.netInterface,
      next == dest ? re.avgAttempts : -1,
      next == dest ? re.avgAckTime : -1
    );
    //next.addHop(dest, re.metric);

    this.draw();
  }
}
