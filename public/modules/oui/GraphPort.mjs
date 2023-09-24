import * as DLM from '../droneLinkMsg.mjs';
import Vector from '../Vector.mjs';
import GraphWire from './GraphWire.mjs';

import moduleInfo from "/moduleInfo.json" assert { type: "json" };

/*

GraphPorts are synonomous with Module Params
They provide an editing interface for setting configuration values

UI is arranged in columns, managed via the parent GraphBlock
*/


// valid char maps by param type

var validKeyMap = {
  c: 'zxcvbnm,./asdfghjkl;qwertyuiop[]\`1234567890-=ZXCVBNM<>?ASDFGHJKL:"QWERTYUIOP{}|~!@£$%^&*()_+ ',
  u8: '1234567890 ',
  u32: '1234567890 ',
  f: '1234567890-. ',
  addr: '1234567890@>.zxcvbnmasdfghjklqwertyuiopZXCVBNMASDFGHJKLQWERTYUIOP '
};

var maxInputLengthMap = {
  c: 12,
  u8: 3,
  u32: 10,
  f: 9,
  addr: 32
};


export default class GraphPort {
  constructor(mgr, block, param) {
    this.mgr = mgr;
    this.block = block;
    this.param = param;
    this.subParam = null;
    this.name = param.name;
    this.subName;  //  same as name but without the $ sign
    this.isAddr = false;
    this.enabled = true; // rendered
    this.param.alwaysPublished = false;

    this.sortOrder = 0; // sort order
    this.y = 0;  // relative to block
    this.titleHeight = 16;
    this.inputHeight = 20;
    this.height = this.titleHeight;
    this.shrink = 1;  // a scale factor from 0..1 used to animate shrinkage of unhovered elements

    this.connected = false; // true if numOutputs > 0 || has a wire
    this.wire = null;
    this.numOutputs = 0;
    this.outputs = [];
    
    this.inputType = param.type;

    this.font = '10px '+this.mgr.baseFont;
    this.padding = [4,2];

    this.cellsNeedUpdate = true;

    this.nubbinHover = false; // true if hovering over nubbin

    this.rewiring = false;

    // populate values if missing
    if (!this.param.values) {
      this.param.values = [];
      if (this.param.type == 'c') {
        if (this.param.defaultValues) {
          this.param.values.push(this.param.defaultValues[0]);
        } else 
          this.param.values.push('');
      } else {
        if (this.param.defaultValues) {
          for (var i=0; i<this.param.defaultValues.length; i++) {
            this.param.values.push( this.param.defaultValues[i] ); 
          }
        } else {
          for (var i=0; i<this.param.numValues; i++) {
            this.param.values.push('0'); 
          }
        }
        
      }
    }

    // cells in the ui table
    this.cellFixedWidth = [];  // 0 for dynamic, or a fixed value
    this.cells = []; // strings for each cell
    this.cellWidths = [ ];

    // input cells
    this.inputCells = []; // strings for each input cell
    this.inputCellWidths = [];
    this.inputCellValid = []; // booleans to indicate correct syntax
    this.selectedInputCell = -1;

    // populate input cells
    if (this.param.type == 'c') {
      this.inputCells.push(this.param.values[0]);
    } else {
      this.param.values.forEach((v)=>{
        this.inputCells.push(v);
      });
    }
  
    // populate inputCellValid
    this.inputCells.forEach((c)=>{
      this.inputCellValid.push( this.checkInputIsValid(c) );
    });

    // input area
    this.inputMinWidth = 0;


    // look for additional tags in moduleInfo 
    this.checkForPublishTags(this.block.module.type);

    // check type
    if (param.type == 'addr') {
      this.isAddr = true;
      this.subName = this.name.substring(1, this.name.length);

      // init wire
      this.wire = new GraphWire(this.mgr, this, 0,0,0);

      this.findAndHideSub();
    }

    this.unhover();
  }

  connect(oport) {
    this.connected =true;
    this.outputs.push(oport);
    this.numOutputs = this.outputs.length;
    // make sure params with subscribers are published and enabled
    this.enabled = true;
    this.param.published = true;
    this.shrink = 1;
    this.cellsNeedUpdate = true;
  }

  disconnect(oport) {
    this.outputs = _.without(this.outputs, oport);
    this.numOutputs = this.outputs.length;
    this.connected = this.numOutputs > 0;
    if (!this.connected) this.cellsNeedUpdate = true;
  }

  disconnectWire() {
    // clear addresses on wire
    if (this.param.type == 'addr') {
      this.wire.updateAddress(255,255,255);
    }
  }

  getAddress() {
    // return address in friendly syntax
    var str = '@>' + this.block.name + '.' + this.name;
    return str;
  }

  resolveAddress() {
    if (!this.isAddr) return false;
    this.connected = false;

    var n = 0;
    var m = 0;
    var p = 0;
  
    var gPos = this.inputCells[0].indexOf('>');
    var pPos = this.inputCells[0].indexOf('.');
    if (gPos > -1 && pPos > -1) {
      n = this.inputCells[0].substring(0,gPos);
      m = this.inputCells[0].substring(gPos+1,pPos);
      p = this.inputCells[0].substring(pPos+1, this.inputCells[0].length);
      //console.log(this.param.values[0], n,m,p);

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
    }

    this.addr = [n,m,p];
    
    // try to locate matching block using numeric address
    if (this.wire) {
      this.wire.updateAddress(n,m,p);
    }
    this.connected = this.wire.isConnected();

    return this.connected;
  }

  hover() {
    if (this.enabled) this.shrink = 1;
  }

  unhover() {
    // shrink if not configured or published (excluding alwaysPublished)
    if (this.param.configured) {
      // do nothing
    } else {
      if (this.enabled && (!this.param.published || this.param.alwaysPublished )) this.shrink = 1; //0;
    }
    this.nubbinHover = false;
  }

  startRewire() {
    this.rewiring = true;

    this.wire.startRewire();

    this.mgr.startRewire(this);
  }

  moveRewire(x,y) {
    // move end of wire to follow cursor
    this.wire.moveRewire(x,y);
  }

  endRewire(destPort) {
    if (destPort) {
      this.inputCells[0] = destPort.getAddress();
      this.resolveAddress();
      this.param.configured = true;
      this.inputCellValid[0] = true;
      this.cellsNeedUpdate = true;
      this.shrink = 1;
    }
    this.wire.endRewire();
    this.rewiring = false;
  }

  isSuitableRewireSource() {
    return (this.mgr.rewiring != this) && 
           (this.mgr.rewiring.subParam.type == this.param.type) &&
           (this.param.numValues <= this.mgr.rewiring.subParam.numValues);
  }

  hit(x,y) {
    if (!this.enabled) return false;
    var x1 = this.block.x1;  
    var y1 = this.block.y1 + this.y;
    var w = this.block.width + ((this.numOutputs > 0) ? 16 : 0); // allow for output nubbin
    var h = this.height;

    return (x > (x1 - (this.isAddr ? 16 : 0)) && x < x1+w &&  
      y > y1 && y < y1 + h*this.shrink);  // allow for input nubbin
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

    // check nubbin
    if (this.isAddr && x < x1 && y >= y1 && y < y1 + 16) {
      // initiate re-wiring
      this.startRewire();

    } else if (y <= y1 + this.titleHeight) {
      // check title area
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
            if (this.param.writeable) {
              // toggle configured
              this.param.configured = !this.param.configured;
              // update cell sizes
              this.cellsNeedUpdate = true;
            }
          }
        }
        
        x2 += this.block.columns[i];
      }
    } else {
      // check input area
      var x2 = this.cellWidths[0];
      this.selectedInputCell = -1;
      for(var i=0; i<this.inputCells.length; i++) {

        // see if mouse is down in this cell
        if (x > x1 + x2 && x < x1 + x2 + this.inputCellWidths[i]) {
          this.selectedInputCell = i;
          break;
        }
        
        x2 += this.inputCellWidths[i];
      }
    }

    return true;
  }

  mousemove(x,y) {
    var y2 = this.block.y1 + this.y;
    var hovering =  (this.isAddr && x < this.block.x1 && y >= y2 && y < y2 + 16);
    if (hovering != this.nubbinHover) {
      this.nubbinHover = hovering
      this.mgr.needsRedraw = true;
    }
  }


  checkInputIsValid(s) {
    switch(this.param.type) {
      case 'u8':
        var v = parseInt(s);
        return !isNaN(v) && (v >= 0) && (v <= 255);
      case 'u32':
        var v = parseInt(s);
        return !isNaN(v) && (v >= 0) && (v <= 4294967295);
        break;
      case 'f':
        return !isNaN(parseFloat(s));
        break;
      case 'addr':
      case 'c':
          return true;
          break;
    }
  }
  
  keydown(e) {
    if (this.selectedInputCell > -1) {

      if (e.which == 9) { // tab
        this.selectedInputCell++;
        if (this.selectedInputCell >= this.inputCells.length) this.selectedInputCell = 0;

      } else {
        if (e.which == 8) {  // backspace
          this.inputCells[this.selectedInputCell] = this.inputCells[this.selectedInputCell].slice(0, -1);
        } else if (e.which >= 48 && e.which <=221) {  // everything else
          // check keymap
          if (validKeyMap[this.param.type].indexOf(e.key) > -1) {
            // check for max input length
            if (this.inputCells[this.selectedInputCell].length < maxInputLengthMap[this.param.type]) {
              this.inputCells[this.selectedInputCell] += e.key;
            }
              
          }    
        }

        this.cellsNeedUpdate = true;

        // is this the module name?
        if (this.name == 'name') {
          this.block.updateName(this.inputCells[this.selectedInputCell]);
        }

        // is this the node address? 
        if (this.name == 'node' && this.block.channel == 0) {
          // update the internal node address value
          this.mgr.nodeId = parseInt(this.inputCells[this.selectedInputCell]);

          // update all addresses
          this.mgr.resolveAddresses();
        }
  
        this.inputCellValid[this.selectedInputCell] = this.checkInputIsValid(this.inputCells[this.selectedInputCell]);
        
        if (this.param.type == 'addr') {
          // update internal value
          this.param.values[0] = this.inputCells[this.selectedInputCell];
  
          // rewire
          this.inputCellValid[this.selectedInputCell] = this.resolveAddress();
        }
      }

      e.preventDefault();
    }

    this.mgr.needsRedraw = true;
  }

  updateValues(v) {
    this.param.configured = true;
    this.shrink = 1;

    // update with new values, e.g. from I2C detection in graph manager
    for (var i=0; i<this.inputCells.length; i++) {
      if (i<v.length) this.inputCells[i] = v[i];
    }
    this.cellsNeedUpdate = true;
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
          // store params for wiring
          this.subParam = port.param;

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
    this.cellWidths = [];
    
    // calc widths - for header
    for (var i=0; i<this.cells.length; i++) {
      if (this.cellFixedWidth[i] == 0) {
        var tm = ctx.measureText(this.cells[i]);
        this.cellWidths.push(tm.width + 2*this.padding[0]);
      } else {
        this.cellWidths.push(this.cellFixedWidth[i]);
      }
      totalWidth += this.cellWidths[i];
    }

    // calc widths for input area
    this.inputCellWidths = [];
    this.inputMinWidth = 0;
    if (this.param.configured) {
      for (var i=0; i<this.inputCells.length; i++) {
        var tm = ctx.measureText(this.inputCells[i]);
        this.inputCellWidths.push(tm.width + 2*this.padding[0]);
        this.inputMinWidth += this.inputCellWidths[i];
      }
    }

    // sense check vs inputarea
    var extraForInput = this.inputMinWidth - (totalWidth - this.cellWidths[0]);
    if (extraForInput > 0 ) {
      // add extra to "name" cell
      this.cellWidths[1] += extraForInput;
    } 

    // calc height
    this.height = this.param.configured ? this.titleHeight + this.inputHeight : this.titleHeight;

    this.cellsNeedUpdate = false;
    this.block.needsPortResize = true;
    this.mgr.needsRedraw = true;
  }


  updateColumnWidths() {
    // parent block has finished resizing, we should now adapt our cell widths to match
    for (var i=0; i<this.cells.length; i++) {
      this.cellWidths[i] = this.block.columns[i];
    }

    // update inputs
    if (this.param.configured) {
      // spare space available... distribute over all input cells
      var extraForInput = (this.block.width - this.cellWidths[0]) - this.inputMinWidth;
      if (extraForInput > 0) {
        var ew = extraForInput / this.inputCells.length;
        for (var i=0; i<this.inputCells.length; i++) {
          this.inputCellWidths[i] += ew;
        }
        this.inputMinWidth += extraForInput;
      }
    }
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

    ctx.beginPath();
    var bkc;
    if (this.mgr.rewiring) {
      if (this.isSuitableRewireSource()) {
        // do the param names match? 
        bkc = (this.param.name == this.mgr.rewiring.subParam.name) ? '#0f0' : '#995';
      } else {
        bkc =  '#606060';
      }
    } else if (this.block.selectedPort == this) {
      bkc = '#c4ccd0';
    } else if (dim) {
      bkc= '#606060';
    } else if (this.wire && this.wire.oport) {
      //bkc = this.block.fillStyle;
      bkc = this.wire.oport.block.fillStyle;
    } else if (this.numOutputs == 1) {
      bkc = this.block.fillStyle;
      //bkc = this.outputs[0].block.fillStyle;
    } else if (this.numOutputs > 1) {
      bkc = this.block.fillStyle;
      //bkc = '#fff';
    } else {
      bkc = (this.param.configured || this.param.published || this.param.alwaysPublished) ? '#a4b7b0' : '#8a8890';
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
      ctx.fillStyle = (this.nubbinHover || this.rewiring) ? '#5f5' : '#555';
      ctx.arc(px + x1 - r, py + y1 + this.titleHeight/2, r, 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = bkc;
      ctx.stroke();
    }

    // draw output nubbin?
    if (this.numOutputs > 0) {
      ctx.beginPath();
      var r = 6;
      ctx.fillStyle = '#555';
      ctx.arc(px + this.block.x2 + r, py + y1 + this.titleHeight/2, r, 0, 2 * Math.PI);
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
        ctx.arc(px + x1 + x2 + this.block.columns[i]/2, py + y1 + this.titleHeight/2, this.titleHeight/2-this.padding[1], 0, 2*Math.PI);
        ctx.fill();

        // place a P in the circle
        ctx.fillStyle = this.param.alwaysPublished ? '#5f5' : '#aaa';
        ctx.font = this.font;
        ctx.textAlign = 'center';
        ctx.fillText('P', px + x1 + x2 + this.block.columns[i]/2, py + y1 + this.titleHeight/2+4);

      } else if (i == 4) {
        if (this.param.writeable) {
          // draw a circle for Configured status
          ctx.fillStyle = this.param.configured ? (dim ? '#5a5' : '#5f5') : '#555';
          ctx.beginPath();
          ctx.arc(px + x1 + x2 + this.block.columns[i]/2, py + y1 + this.titleHeight/2, this.titleHeight/2-this.padding[1], 0, 2*Math.PI);
          ctx.fill();

          // place a C in the circle
          ctx.fillStyle = '#aaa';
          ctx.font = this.font;
          ctx.textAlign = 'center';
          ctx.fillText('C', px + x1 + x2 + this.block.columns[i]/2, py + y1 + this.titleHeight/2+4);
        }
      } else {
        if (this.block.selectedPort == this) {
          ctx.fillStyle = (i == 2 || i == 0) ? '#555' : '#000';
        } else 
          ctx.fillStyle = (i == 2 || i == 0) ? '#444' : '#000';
        ctx.font = this.font + (i==1 ? ' bold' : '');
        ctx.textAlign = 'left';
        ctx.fillText(this.cells[i], px + x1 + x2 + this.padding[0], py + y1 + this.titleHeight/2 + 4);
      }
      x2 += this.block.columns[i];
    }

    // render input - start from cell 1 onward
    if (this.param.configured) {

      var x2 = px + x1 + this.block.columns[0];
      var w1 = w - this.block.columns[0];

      // for each value
      var x3 = x2;
      for (var i=0; i<this.inputCells.length; i++) {
        // background
        if (this.inputCellValid[i]) {
          ctx.fillStyle = this.selectedInputCell == i ? '#33c' : '#555';
        } else {
          ctx.fillStyle = '#c33';
        }
        
        ctx.fillRect(x3, py + y1 + this.titleHeight + 2, this.inputCellWidths[i]-2, this.inputHeight-4);

        // values
        ctx.fillStyle = '#fff';
        ctx.font = this.font;
        ctx.textAlign = 'left';
        ctx.fillText(this.inputCells[i], x3 + this.padding[0], py + y1 + h - 6);

        x3 += this.inputCellWidths[i];
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
        if (this.inputCells[i] !== undefined) {
          if (i>0) str += ', ';
          str += this.inputCells[i];
        }
      }
      if (this.param.type == 'c') str += '"';

      str += '\n';
    }

    return str;
  }


}
