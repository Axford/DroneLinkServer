/*

Manages a chart object

*/

import roundRect from "../../RoundedRect.mjs";

export default class Chart {
  constructor(parent, type, y) {
    this.parent = parent;
    this.type = type;
    this.height = 300; // height
    this.y = y;
    this.axes = {};
    this.configurableAxes = 0;
    this.ctx = parent.ctx;

    this.lastUpdate = 0;

    // dimension defaults
    this.axesWidth = 65; // area for labelling axis
    this.axesHeight = 1;
    this.legendWidth = 160;
    this.legendLabelHeight = 40;
    this.legendSpacing = 10;
  }

  resize() {
    // called after height changes or other layout changes

    // resize axes areas
    var k = 0;
    var lh = this.height / this.configurableAxes;
    for (const [ak, axis] of Object.entries(this.axes)) {
        if (axis.maxParams > 0) {
            axis.y = k * lh;
            axis.height = lh - this.legendSpacing;
            k++;
        }
    }
  }

  getAxisAt(y) {
    var match;
    for (const [ak, axis] of Object.entries(this.axes)) {
        if (axis.maxParams > 0) {
            if (y >= this.y + axis.y && y<= this.y + axis.y + axis.height) {
                return axis;
            }
        }
    }
    return null;
  }

  getLabelAt(x, y) {
    var w = this.ctx.canvas.width;
    var x1 = this.axesWidth;
    var cw = w - this.legendWidth - x1; // chart area

    if (x < w - this.legendWidth + 40) return null;

    var match = null;
    for (const [ak, axis] of Object.entries(this.axes)) {
      for (const [pk, param] of Object.entries(axis.params)) {
        var y2 = this.y + axis.y + param.position;

        if (y >= y2 && y <= y2 + this.legendLabelHeight) {
          match = param;
        }
      }
    }
    return match;
  }

  updateAxes() {
    // update / calc axes
    for (const [ak, axis] of Object.entries(this.axes)) {
      for (const [pk, param] of Object.entries(axis.params)) {
        var pd = this.parent.paramData[param.addr];
        axis.scale.updateMinMax(pd.minValue, pd.maxValue);
      }
    }
  }

  addParam(y, paramData) {

    // determine axis
    var axis = this.getAxisAt(y);

    if (!axis) return;

    // check we haven't exceeded maxParams
    if (axis.numParams >= axis.maxParams) return;

    if (!axis.params.hasOwnProperty(paramData.addr)) {
      axis.numParams++;

      var hue = paramData.hue;

      axis.params[paramData.addr] = {
        chart: this,
        axis:axis,
        title: paramData.getTitle(),
        addr: paramData.addr,
        style: "hsl(" + hue + "," + "100%, 75%)",
        dimStyle: "hsla(" + hue + "," + "100%, 75%, 30%)",
        position:
          (axis.numParams - 1) *
          (this.legendLabelHeight + this.legendSpacing),
        velocity: 0,
        av: 0,
        lastY: null
      };
    }
    console.log(this.axes);
  }

  removeParam(param) {
    param.axis.numParams--;
    if(param.axis.numParams < 0) param.axis.numParams = 0; // sanity
    delete param.axis.params[param.addr];

    param.axis.scale.reset();
  }

  zoomExtents() {
    for (const [ak, axis] of Object.entries(this.axes)) {
        axis.scale.zoomExtents();
    }
  }

  onMousedown(x,y) {

    return null;
  }

  onContextmenu(x,y) {
    // reset zoom
    this.zoomExtents();
  }


  legendOverlap(b, ob, padding) {
    var v = 0;
    // overlap values will be positive if overlapping
    var yo1 = ob.position + this.legendLabelHeight + padding - b.position;
    var yo2 = b.position + +this.legendLabelHeight + padding - ob.position;
    if (yo1 > 0 && yo2 > 0) {
      if (yo1 < yo2) {
        v = yo1;
      } else {
        v = -yo2;
      }
    }
    return v;
  }


  updateLegendPositions() {
    // adjust positions of all blocks
    var loopTime = Date.now();
    var dt = (loopTime - this.lastUpdate) / 1000; // in seconds
    if (dt > 1 / 50) dt = 1 / 50;
    this.lastUpdate = loopTime;

    var h1 = this.height;

    for (const [ak, axis] of Object.entries(this.axes)) {
      for (const [pk, param] of Object.entries(axis.params)) {
        if (param.lastY !== undefined) {
          var err = param.lastY - (param.position + this.legendLabelHeight / 2);
          param.av = err * 1;
        }

        for (const [opk, otherParam] of Object.entries(axis.params)) {
          if (otherParam != param) {
            var overlap = this.legendOverlap(
              param,
              otherParam,
              this.legendSpacing
            );
            if (Math.abs(overlap) > 0) {
              overlap *= 30;
              param.av += overlap;
            }
          }
        }
      }
    }

    // apply accelerations
    var maxBvs = 0;

    var h1 = this.height;

    for (const [ak, axis] of Object.entries(this.axes)) {
      for (const [pk, param] of Object.entries(axis.params)) {
        if (param != this.parent.dragLabel) {
          // accelerate in net direction
          param.velocity += param.av;

          // clamp velocity
          if (param.velocity > 20) param.velocity = 20;

          // apply drag
          param.velocity *= 0.97;

          // correct for fraction of time
          param.velocity *= dt;

          // update position
          param.position += param.velocity;

          // clamp position
          if (param.position < 0) param.position = 0;
          if (param.position > h1 - this.legendLabelHeight)
          param.position = h1 - this.legendLabelHeight;

          // trigger redraw if movement is significant
          var bvs = param.velocity;
          if (bvs > maxBvs) maxBvs = bvs;
        }
      }
    }

    return maxBvs > 0.1;
  }

  getIndicesForTimeRange(pd, start,end) {
    var yStartIndex = 0;
    var yEndIndex = pd.data.length - 1;

    pd.data.forEach((pde, pi) => {
        if (pde.t < start) yStartIndex = pi;
        if (pde.t <= end) yEndIndex = pi + 1;
    });
    if (yEndIndex > pd.data.length - 1) yEndIndex = pd.data.length - 1;
    return {
        start: yStartIndex,
        end: yEndIndex
    }
  }

  drawHorizontalTicks() {
    var y1 = this.y;
    var h1 = this.height - this.axesHeight; // chart area`
    var w = this.ctx.canvas.width;
    var h = this.ctx.canvas.height;

    var x1 = this.axesWidth;
    var cw = w - this.legendWidth - x1; // chart area
    
    // draw horizontal ticks
    this.ctx.fillStyle = "#888";
    this.ctx.font = this.parent.font;
    this.ctx.textAlign = "right";
    // use un-zoomed values and then crop to fit the viewport
    var v = this.axes.y.scale.niceMin;
    while (v <= this.axes.y.scale.niceMax) {
        var y2 = y1 + h1 - this.axes.y.scale.valueToPixel(v, h1);

        this.ctx.lineWidth = (v == 0) ? 2: 1;
        this.ctx.strokeStyle = (v == 0) ? '#555' : "#333";

        if (y2 >=y1 && y2 <= y1 + h1) {
            this.ctx.beginPath();
            this.ctx.moveTo(x1, y2);
            this.ctx.lineTo(x1 + cw, y2);
            this.ctx.stroke();

            var y3 = y2 + 5;
            if (v == this.axes.y.scale.niceMin) y3 = y2;
            if (v >= this.axes.y.scale.niceMax) y3 = y2+10;

            this.ctx.fillText(v.toFixed(this.axes.y.scale.tickPrecision), x1 - 2, y3);
        }

        v += this.axes.y.scale.tickSpacing;
        v = Math.round((v + Number.EPSILON) * 100) / 100;
    }
    this.ctx.lineWidth = 1;
  }

  drawVerticalTicks() {
    var y1 = this.y;
    var h1 = this.height - this.axesHeight; // chart area`
    var w = this.ctx.canvas.width;
    var h = this.ctx.canvas.height;

    var x1 = this.axesWidth;
    var cw = w - this.legendWidth - x1; // chart area
    
    // draw vertical ticks
    this.ctx.fillStyle = "#888";
    this.ctx.font = this.parent.font;
    this.ctx.textAlign = "center";
    // use un-zoomed values and then crop to fit the viewport
    var v = this.axes.x.scale.niceMin;
    while (v <= this.axes.x.scale.niceMax) {
        var x2 = x1 + this.axes.x.scale.valueToPixel(v, cw);

        this.ctx.lineWidth = (v == 0) ? 2: 1;
        this.ctx.strokeStyle = (v == 0) ? '#555' : "#333";

        if (x2 >= x1 && x2 <= x1+cw) {
            this.ctx.beginPath();
            this.ctx.moveTo(x2, y1);
            this.ctx.lineTo(x2, y1 + h1);
            this.ctx.stroke();

            this.ctx.fillText(v.toFixed(this.axes.x.scale.tickPrecision), x2, y1 + h1 + 12);
        }

        v += this.axes.x.scale.tickSpacing;
        v = Math.round((v + Number.EPSILON) * 100) / 100;
    }
    this.ctx.lineWidth = 1;
  }

  drawLegendBackground(axis) {
    // override in sub-classes
  }

  draw() {
    this.updateAxes();

    var me = this;
    var y1 = this.y;
    var h1 = this.height - this.axesHeight; // chart area`

    var w = this.ctx.canvas.width;
    var cx = w / 2;

    var h = this.ctx.canvas.height;
    var cy = h / 2;

    var x1 = this.axesWidth;
    var cw = w - this.legendWidth - x1; // chart area

    // chart background
    this.ctx.fillStyle = "#141a20";
    this.ctx.fillRect(0, y1, w - this.legendWidth, h1 + this.axesHeight);

    // draw separator (at bottom)
    this.ctx.fillStyle =
      this == this.parent.dragSeperator || this == this.parent.hoverSeperator
        ? "#aaa"
        : "#242a30";
    this.ctx.fillRect(0, y1 + this.height, w, this.parent.chartSpacing);


    // draw legend
    // -----------
    var y2 = y1 + 12;
    var w3 = 40;
    var x2 = w - this.legendWidth + w3;
    var h2 = this.legendLabelHeight;
    var w2 = this.legendWidth - w3;
    x1 = w-this.legendWidth;

    for (const [ak, axis] of Object.entries(this.axes)) {

        if (axis.maxParams > 0) {
            y1 = this.y + axis.y;

            this.drawLegendBackground(axis);

            // show drop region
            this.ctx.strokeStyle = (this.parent.dragLabel && axis.numParams < axis.maxParams) ? '#fc5' : '#555';
            roundRect(this.ctx, x1+5, y1, this.legendWidth-5, axis.height, 4, false, true);

            // axis title
            this.ctx.fillStyle = "#888";
            this.ctx.font = "14px bold, " + this.parent.baseFont;
            this.ctx.textAlign = "left";
            this.ctx.fillText(axis.title, x1+10, y1+15);

            // numParams vs max
            this.ctx.textAlign = "right";
            this.ctx.font = "10px normal, " + this.parent.baseFont;
            this.ctx.fillText(axis.numParams + '/' + axis.maxParams, w-5, y1+15);
            

            for (const [key, col] of Object.entries(axis.params)) {
                var pd = this.parent.paramData[col.addr];

                var y2 = y1 + col.position;

                if (this.parent.dragLabel || this.parent.hoverLabel) {
                this.ctx.fillStyle =
                    col == this.parent.dragLabel || col == this.parent.hoverLabel
                    ? col.style
                    : col.dimStyle;
                } else this.ctx.fillStyle = col.style;

                if (col.lastY !== undefined) {
                    // draw arrow thing
                    this.ctx.beginPath();
                    this.ctx.moveTo(w - this.legendWidth, y1 + col.lastY);
                    this.ctx.lineTo(x2, y2);
                    this.ctx.lineTo(x2, y2 + h2);
                    this.ctx.fill();
                }

                // draw label
                this.ctx.fillRect(x2, y2, w2, h2);

                this.ctx.fillStyle = "#000";
                this.ctx.font = "10px normal, " + this.parent.baseFont;
                this.ctx.textAlign = "left";
                // node name
                this.ctx.fillText(pd.nodeObj.name, x2 + 5, y2 + 15);
                // draw data size top right
                this.ctx.textAlign = "right";
                this.ctx.fillText(pd.data.length, x2+w2-5, y2 + 15);
                // channel / param
                this.ctx.textAlign = "left";
                this.ctx.font = "12px bold, " + this.parent.baseFont;
                this.ctx.fillText(
                    pd.channelObj.name + "." + pd.paramObj.name + "." + pd.valueIndex,
                    x2 + 5,
                    y2 + 32
                );

                

            }
        }
    }
  }
}
