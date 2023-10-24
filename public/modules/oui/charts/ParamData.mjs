/*

non-visible element that manages the storage, filtering and analysis of data associated with a single param

hosted by ChartManager

*/

export default class ParamData {
  constructor(mgr, node, channel, param, valueIndex, y, hue) {
    this.mgr = mgr;
    this.hue = hue;
    this.addr =
      node.id + ">" + channel.channel + "." + param.param + "." + valueIndex;
    this.nodeObj = node;
    this.channelObj = channel;
    this.paramObj = param;
    this.node = node.id;
    this.channel = channel.channel;
    this.param = param.param;
    this.valueIndex = valueIndex;
    this.filteredData = [];
    this.minValue = 0;
    this.maxValue = 0;
    
    this.filterMin = 0;
    this.filterMax = 0;
    this.trackMax = true;
    this.trackMin = true;

    this.filterHandle = '';

    this.filtering = false; // has last value fallen outside filter range

    this.y = y;
    this.height = 40;
    this.x = 0;
    this.ctx = mgr.ctx;

    this.histoBins = 50;
    this.histo = new Array(this.histoBins).fill(0);
    this.histoMax = 0;

    this.axesWidth = 65; // area for labelling axis
    this.legendWidth = 160;
    this.handleWidth = 10;
  }

  getTitle() {
    var title = "";
    title += this.node.name != "" ? this.node.name : this.node.id;
    title += ">";
    title +=
      this.channel.name != "?" ? this.channel.name : this.channel.channel;
    title += ".";
    title += this.param.title != "?" ? this.param.name : this.param.param;
    return title;
  }

  clear() {
    this.filteredData = [];
    this.histo = new Array(this.histoBins).fill(0);
    this.histoMax = 0;
    this.filtering = 0;
  }

  haveFilteredData() {
    return this.filteredData.length > 0;
  }

  getRange() {
    return this.maxValue - this.minValue;
  }

  getHistoBin(v) {
    var range = this.getRange();
    if (range > 0) {
        return Math.round((this.histoBins-1) * ((v - this.minValue) / (range)));
    }
    return 0;
  }

  addToHisto(v) {
    var b = this.getHistoBin(v);
    if (b >=0 && b < this.histoBins) {
        this.histo[b]++;
        if (this.histo[b] > this.histoMax) this.histoMax = this.histo[b];
    } else {
        console.error('out of range', v, this.minValue, this.maxValue);
    }
  }

  rebuildHisto() {
    this.histo = new Array(this.histoBins).fill(0);
    this.histoMax = 0;

    this.filteredData.forEach((pd)=>{
        this.addToHisto(pd.v);
    });
  }

  addData(t, v, protectLimits=false) {
    // called with fresh data that is within filtered time range
    
    // update ranges
    if (this.filteredData.length == 0 && !protectLimits) {
      this.minValue = v;
      this.maxValue = v;
      this.filterMin = v;
      this.filterMax = v;
    } else {
        var rebuild = false;
        if (v < this.minValue) {
            this.minValue = v;
            rebuild = true;
        }
        if (v > this.maxValue) {
            this.maxValue = v;
            rebuild = true;
        }
        if (rebuild) {
            this.rebuildHisto();
        } else {
            // add to histo
            this.addToHisto(v);
        }
    }

    if (v > this.filterMax && this.trackMax) this.filterMax = v;
    if (v < this.filterMin && this.trackMin) this.filterMin = v;

    // see if we are filtering, update mgr
    var newF = !(v >= this.filterMin && v <= this.filterMax);
    if (newF != this.filtering) {
        this.filtering = newF;
        if (newF) { this.mgr.filter(); }
        else { this.mgr.unfilter(); }
    }

    // eval filters... 
    if (!this.mgr.isFiltering()) {
        this.filteredData.push({
            t:t,
            v:v
        });
    }

  }

  trim(start, end) {
    var startIndex = 0;
    var endIndex = this.filteredData.length;
    for (var i = 0; i < this.filteredData.length; i++) {
      if (this.filteredData[i].t < start) {
        startIndex = i;
      } else if (this.filteredData[i].t > end) {
        endIndex = i + 1;
        break;
      }
    }
    this.filteredData = this.filteredData.slice(startIndex, endIndex);
    this.rebuildHisto();
  }

  reset() {
    // reset filter
    this.filtering = false;
    this.filterMax = this.maxValue;
    this.filterMin = this.minValue;
    this.trackMax = true;
    this.trackMin = true;
  }

  onMousedown(x, y) {
    return this.filterHandleMouseDown(x,y);
  }

  onContextmenu(x, y) {
    // reset zoom
    this.reset();
  }

  filterHandleMouseDown(x, y) {
    var w = this.ctx.canvas.width;
    var x1 = this.axesWidth;
    var cw = w - this.legendWidth - x1; // chart area

    var th1 = 20;

    var range = this.getRange();
    var sx1 =
      x1 + (cw * (this.filterMin - this.minValue) / range);
    var sx2 =
      x1 + (cw * (this.filterMax - this.minValue) / range);

    if (y < this.y + th1) {
      // left handle
      if (x >= sx1 - this.handleWidth && x <= sx1) {
        this.filterHandle = "start";
        this.trackMin = false;
        return this.filterHandleInteractionHandler.bind(this);
      } else if (x >= sx2 && x <= sx2 + this.handleWidth) {
        this.filterHandle = "end";
        this.trackMax = false;
        return this.filterHandleInteractionHandler.bind(this);
      }
    }
    this.filterHandle = "";
    return null;
  }

  filterHandleInteractionHandler(type, x, y) {
    var w = this.ctx.canvas.width;
    var x1 = this.axesWidth;
    var cw = w - this.legendWidth - x1; // chart area

    if (type == "move") {

      var th1 = 20;

      var range = this.getRange();
      var sx1 =
      x1 + (cw * (this.filterMin - this.minValue) / range);
      var sx2 =
      x1 + (cw * (this.filterMax - this.minValue) / range);

      if (this.filterHandle == "start") {
        var v = this.minValue + ((x - x1) * range) / cw;
        if (v < this.minValue) v = this.minValue;
        if (v > this.filterMax) v = this.filterMax;
        if (v != this.filterMin) {
          this.filterMin = v;
          this.mgr.replay();
        }

      } else if (this.filterHandle == "end") {
        var v = this.minValue + ((x - x1) * range) / cw;
        if (v < this.filterMin) v = this.filterMin;
        if (v >= this.maxValue) {
          v = this.maxValue;
        }
        if (v != this.filterMax) {
          this.filterMax = v;
          this.mgr.replay();
        }

      }
    } else if (type == "up") {
      // enable autotrack?
      if (x <= x1) {
        this.trackMin = true;
      }
      if (x >= x1 + cw) {
        this.trackMax = true;
      }
    }
  }

  resize() {
    
  }

  draw() {
    var me = this;
    var y1 = this.y;
    var h1 = this.height;

    var w = this.ctx.canvas.width;
    var x1 = this.axesWidth;
    var cw = w - this.legendWidth - x1; // chart area

    // background
    this.ctx.fillStyle = "#141a20";
    this.ctx.fillRect(x1, y1, cw, h1);

    if (this.filtering) {
      // show filter indicator
      this.ctx.fillStyle = "#800";
      this.ctx.fillRect(0, y1, 10, h1);
    }

    var w3 = 40;
    var x2 = w - this.legendWidth + w3;
    var w2 = this.legendWidth - w3;

    this.ctx.fillStyle = "hsl(" + this.hue + "," + "100%, 75%)";

    // draw label
    this.ctx.fillRect(x2, y1, w2, h1);

    this.ctx.fillStyle = "#000";
    this.ctx.font = "10px normal, " + this.mgr.baseFont;
    this.ctx.textAlign = "left";
    // node name
    this.ctx.fillText(this.nodeObj.name, x2 + 5, y1 + 15);

    // draw data size top right
    this.ctx.textAlign = "right";
    this.ctx.fillText(this.filteredData.length, x2+w2-5, y1 + 15);
    // channel / param
    this.ctx.textAlign = "left";
    this.ctx.font = "12px bold, " + this.mgr.baseFont;
    this.ctx.fillText(
        this.channelObj.name + "." + this.paramObj.name + "." + this.valueIndex,
        x2 + 5,
        y1 + 32
    );

    if (!this.haveFilteredData()) return;


    // min label
    this.ctx.fillStyle = "#888";
    this.ctx.font = this.font;
    this.ctx.textAlign = "right";
    this.ctx.fillText(this.filterMin.toFixed(1), x1 - 2, y1 + h1-5);

    // max label
    this.ctx.textAlign = "left";
    this.ctx.fillText(
      this.filterMax.toFixed(1),
      w - this.legendWidth + 2,
      y1 + h1-5
    );

    var range = this.getRange();
    var sx1 =
      x1 + (cw * (this.filterMin - this.minValue) / range);
    var sx2 =
      x1 + (cw * (this.filterMax - this.minValue) / range);

    this.ctx.fillStyle = "#242a40";
    this.ctx.fillRect(sx1, y1, sx2 - sx1, h1);
    
    // draw histo
    // draw histobins
    if (this.histoMax > 0) {
        this.ctx.fillStyle = "#555";
        var bw = cw/this.histoBins;
        for (var bi = 0; bi<this.histoBins; bi++) {
            var bx = x1 + bi * bw;
            var bh = h1 * this.histo[bi]/this.histoMax;
            this.ctx.beginPath();
            this.ctx.rect(bx, y1 + h1 - bh, bw, bh);
            this.ctx.fill();
        }
    }

    // drag handles
    var th1 = 20;

    this.ctx.fillStyle = this.trackMin ? "#007bff" : "#fff";
    this.ctx.fillRect(sx1 - this.handleWidth, y1, this.handleWidth, th1);

    this.ctx.fillStyle = this.trackMax ? "#007bff" : "#fff";
    this.ctx.fillRect(sx2, y1, this.handleWidth, th1);

  }

}
