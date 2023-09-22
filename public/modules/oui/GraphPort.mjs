import * as DLM from '../droneLinkMsg.mjs';
import Vector from '../Vector.mjs';
import GraphWire from './GraphWire.mjs';

import moduleInfo from "/moduleInfo.json" assert { type: "json" };

/*

GraphPorts are synonomous with Module Params
They provide an editing interface for setting configuration values

UI is arranged in columns, managed via the parent GraphBlock
*/


export default class GraphPort {
  constructor(mgr, block, param) {
    this.mgr = mgr;
    this.block = block;
    this.param = param;
    this.name = param.name;
    this.subName;  //  same as name but without the $ sign
    this.isAddr = false;
    this.enabled = true; // rendered
    this.param.alwaysPublished = false;

    this.sortOrder = 0; // sort order
    this.y = 0;  // relative to block
    this.height = 16;
    this.shrink = 1;  // a scale factor from 0..1 used to animate shrinkage of unhovered elements

    this.connected = false; // true if numOutputs > 0 || has a wire
    this.wire = null;
    this.numOutputs = 0;
    this.outputs = [];

    this.font = '10px '+this.mgr.baseFont;
    this.padding = [4,2];

    this.cellsNeedUpdate = true;

    // cells in the ui table
    this.cellFixedWidth = [];  // 0 for dynamic, or a fixed value
    this.cells = []; // strings for each cell
    this.cellMinWidths = [ ];

    // input area
    this.inputMinWidth = 0;


    // look for additional tags in moduleInfo 
    this.checkForPublishTags(this.block.module.type);

    // check type
    if (param.type == 'addr') {
      this.isAddr = true;
      this.subName = this.name.substring(1, this.name.length);

      this.findAndHideSub();
    }

    this.unhover();
  }

  resolveAddress() {
    if (!this.isAddr) return;

    // parse and resolve address
    this.addr = [0,0,0];
    if (this.param.values && this.param.values.length > 0) {
      var gPos = this.param.values[0].indexOf('>');
      var pPos = this.param.values[0].indexOf('.');
      if (gPos > -1 && pPos > -1) {
        var n = this.param.values[0].substring(0,gPos);
        var m = this.param.values[0].substring(gPos+1,pPos);
        var p = this.param.values[0].substring(pPos+1, this.param.values[0].length);
        console.log(this.param.values[0], n,m,p);

        // convert to numeric values
        if (n == '@') {
          n = this.mgr.nodeId;
        } else {
          n = parseInt(n);
        }

        var mv = parseInt(m);
        if (!isNaN(mv)) {
          m = mv;
        } else {
          // attempt to resolve module name
          var b = this.mgr.getBlockByName(m);
          if (b) {
            m = b.channel;
          }
        }

        var pv = parseInt(p);
        if (!isNaN(pv)) {
          p = pv;
        } else {
          // attempt to resolve param name
          // first get block by id
          var b = this.mgr.getBlockById(m);
          if (b) {
            var port = b.getPortByName(p);
            if (port) {
              p = port.param.address;
            }
          }
        }

        this.addr = [n,m,p];
        //console.log(this.addr);

        // try to locate matching block using numeric address
        if (this.addr[0] == this.mgr.nodeId) {
          if (this.wire) {
            this.wire.updateAddress(n,m,p);
          } else {
            this.wire = new GraphWire(this.mgr, this, n,m,p);
          }
          this.connected = true; 
        }
      }
    }
  }

  hover() {
    if (this.enabled) this.shrink = 1;
  }

  unhover() {
    // shrink if not configured or published (excluding alwaysPublished)
    if (this.param.configured) {
      // do nothing
    } else {
      if (!this.param.published || this.param.alwaysPublished ) this.shrink = 1; //0;
    }
  }

  hit(x,y) {
    var x1 = this.block.x1;
    var y1 = this.block.y1 + this.y;
    var w = this.block.width;
    var h = this.height;

    return (x > x1 && x < x1+w &&
      y > y1 && y < y1+h);
  }

  mousedown(x,y) {
    // should already be hit tested
    var c = this.mgr.canvas[0];
    var ctx = c.getContext("2d");

    var w = this.block.width;
    var h = this.height;

    var px = this.mgr.panPosition.x;
    var py = this.mgr.panPosition.y;

    var x1 = this.block.x1;
    var y1 = this.block.y1 + this.y;

    var h1 = 16;  // title
    var h2 = 20;  // input area

    var x2 = 0;
    for(var i=0; i<this.cells.length; i++) {

      // see if mouse is down in this cell
      if (x > x1 + x2 && x < x1 + x2 + this.block.columns[i]) {
        // decide what todo with the hit
        if (i == 3) {
          // toggle published, assuming not alwaysPublished
          if (!this.param.alwaysPublished) {
            this.param.published = !this.param.published;
          }
        } else if (i == 4) {
          // toggle configured
          this.param.configured = !this.param.configured;

          this.cellsNeedUpdate = true;
        }
      }
      
      x2 += this.block.columns[i];
    }

    return true;
  }

  checkForPublishTags(moduleType) {
    if (moduleInfo.hasOwnProperty(moduleType)) {
      var m = moduleInfo[moduleType];

      // check for relevant publish entry
      if (m.hasOwnProperty('publish')) {
        var i = _.indexOf(m.publish, this.name);
        if (i > -1) {

          this.param.published = true;
          this.param.alwaysPublished = true;

          return;  // to avoid further searching
        }
      }
      
      // check parent class
      if (m.hasOwnProperty('inherits') && m.inherits.length > 0) this.checkForPublishTags(m.inherits[0]);
    }
  }

  findAndHideSub() {
    // find matching port with same name and hide
    if (this.subName != '') {
      for (const [key, port] of Object.entries(this.block.ports)) {
        if (port != this && this.subName == port.name) {
          port.enabled = false;
          port.shrink = 0;
          this.block.updatePortPositions();
        }
      }
    }
  }

  updateCells() {
    if (!this.cellsNeedUpdate) return;

    var c = this.mgr.canvas[0];
    var ctx = c.getContext("2d");

    ctx.font = this.font;

    this.cellFixedWidth = [
      0,
      0,
      0,
      16,
      16
    ];

    this.cells = [
      this.param.address,
      this.name,
      this.param.numValues + ':' + this.param.type,
      '',
      ''
    ];

    var totalWidth = 0;
    this.cellMinWidths = [];
    
    // calc widths
    for (var i=0; i<this.cells.length; i++) {
      if (this.cellFixedWidth[i] == 0) {
        var tm = ctx.measureText(this.cells[i]);
        this.cellMinWidths.push(tm.width + 2*this.padding[0]);
      } else {
        this.cellMinWidths.push(this.cellFixedWidth[i]);
      }
      totalWidth += this.cellMinWidths[i];
    }

    // sense check vs inputarea
    var extraForInput = this.inputMinWidth - (totalWidth - this.cellMinWidths[0]);
    if (extraForInput > 0 ) {
      // add extra to "name" cell
      this.cellMinWidths[1] += extraForInput;
    }


    // calc height
    this.height = this.param.configured ? 16 + 20 : 16;

    this.cellsNeedUpdate = false;
    this.block.needsPortResize = true;
    this.mgr.needsRedraw = true;
  }

  updateWirePosition() {
    if (this.wire) {
      this.wire.updatePosition();
    }
  }


  draw() {
    if (!this.enabled || this.shrink == 0) return;

    var c = this.mgr.canvas[0];
    var ctx = c.getContext("2d");

    var w = this.block.width;
    var h = this.height;

    var px = this.mgr.panPosition.x;
    var py = this.mgr.panPosition.y;

    var x1 = this.block.x1;
    var y1 = this.block.y1 + this.y;

    var dim = false;
    if ( this.mgr.dragBlock ) {
      dim = this.mgr.dragBlock != this.block;

      // check inputs
      if (this.wire && this.wire.oport && this.wire.oport.block == this.mgr.dragBlock) dim = false;

      // check outputs
      for (var i=0; i < this.outputs.length; i++) {
        if (this.outputs[i].block == this.mgr.dragBlock) dim = false;
      }

    } else if ( this.mgr.hoverBlock ) {
      dim = this.mgr.hoverBlock != this.block;

      // check inputs
      if (this.wire && this.wire.oport && this.wire.oport.block == this.mgr.hoverBlock) dim = false;

      // check outputs
      for (var i=0; i < this.outputs.length; i++) {
        if (this.outputs[i].block == this.mgr.hoverBlock) dim = false;
      }

    }

    this.updateCells();

    var h1 = 16;  // title
    var h2 = 20;  // input area

    ctx.beginPath();
    var bkc;
    if (dim) {
      bkc= '#606060';
    } else
    if (this.wire && this.wire.oport) {
      //bkc = this.block.fillStyle;
      bkc = this.wire.oport.block.fillStyle;
    } else if (this.numOutputs == 1) {
      bkc = this.block.fillStyle;
      //bkc = this.outputs[0].block.fillStyle;
    } else if (this.numOutputs > 1) {
      bkc = this.block.fillStyle;
      //bkc = '#fff';
    } else {
      bkc = '#a4aab0';
    }

    ctx.fillStyle = bkc;

    ctx.fillRect(px + x1, py + y1, w, h);
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.rect(px + x1, py + y1, w, h);
    ctx.stroke();

    if (this.isAddr) {
      // draw input nubbin
      ctx.beginPath();
      var r = 6;
      ctx.fillStyle = '#555';
      ctx.arc(px + x1 - r, py + y1 + h1/2, r, 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = bkc;
      ctx.stroke();
    }

    // draw output nubbin?
    if (this.numOutputs > 0) {
      ctx.beginPath();
      var r = 6;
      ctx.fillStyle = '#555';
      ctx.arc(px + this.block.x2 + r, py + y1 + h1/2, r, 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = bkc;
      ctx.stroke();
    }

    // render cells
    var x2 = 0;
    for(var i=0; i<this.cells.length; i++) {
      
      if (i == 3) {
        // draw a circle for Publish status
        ctx.fillStyle = (this.param.published && !this.param.alwaysPublished) ? (dim ? '#5a5' : '#5f5') : '#555';
        ctx.beginPath();
        ctx.arc(px + x1 + x2 + this.block.columns[i]/2, py + y1 + h1/2, h1/2-this.padding[1], 0, 2*Math.PI);
        ctx.fill();

        // place a P in the circle
        ctx.fillStyle = this.param.alwaysPublished ? '#5f5' : '#aaa';
        ctx.font = this.font;
        ctx.textAlign = 'center';
        ctx.fillText('P', px + x1 + x2 + this.block.columns[i]/2, py + y1 + h1/2+4);

      } else if (i == 4) {
        if (this.param.writeable) {
          // draw a circle for Configured status
          ctx.fillStyle = this.param.configured ? (dim ? '#5a5' : '#5f5') : '#555';
          ctx.beginPath();
          ctx.arc(px + x1 + x2 + this.block.columns[i]/2, py + y1 + h1/2, h1/2-this.padding[1], 0, 2*Math.PI);
          ctx.fill();

          // place a C in the circle
          ctx.fillStyle = '#aaa';
          ctx.font = this.font;
          ctx.textAlign = 'center';
          ctx.fillText('C', px + x1 + x2 + this.block.columns[i]/2, py + y1 + h1/2+4);
        }
      } else {
        ctx.fillStyle = (i == 2 || i == 0) ? '#444' : '#000';
        ctx.font = this.font + (i==1 ? ' bold' : '');
        ctx.textAlign = 'left';
        ctx.fillText(this.cells[i], px + x1 + x2 + this.padding[0], py + y1 + h1/2 + 4);
      }
      x2 += this.block.columns[i];
    }

    // render input - start from cell 1 onward
    if (this.param.configured) {

      var x2 = px + x1 + this.block.columns[0];
      var w1 = w - this.block.columns[0];

      var numValues = this.param.type != 'c' ? this.param.numValues : 1;

      var wi = w1 / numValues;

      // for each value
      var x3 = x2;
      for (var i=0; i<numValues; i++) {
        // background
        ctx.fillStyle = '#555';
        ctx.fillRect(x3, py + y1 + h1 + 2, wi-2, h2-4);

        // values
        ctx.fillStyle = '#fff';
        ctx.font = this.font;
        ctx.textAlign = 'left';
        if (this.param.values && this.param.values.length > i) {
          ctx.fillText(this.param.values[i], x3 + this.padding[0], py + y1 + h - 6);
        }

        x3 += wi;
      }
    }

  }

  drawWire() {
    // draw wire
    if (this.wire) this.wire.draw();
  }


  generateConfig() {
    var str = '';

    if (this.param.configured) {
      // name 
      str += '  ' + this.param.name + ' = ';

      // value
      var numValues = this.param.type != 'c' ? this.param.numValues : 1;

      if (this.param.type == 'c') str += '"';
      for (var i=0; i<numValues; i++) {
        if (this.param.values[i] !== undefined) {
          if (i>0) str += ', ';
          str += this.param.values[i];
        }
      }
      if (this.param.type == 'c') str += '"';

      str += '\n';
    }

    return str;
  }


}
