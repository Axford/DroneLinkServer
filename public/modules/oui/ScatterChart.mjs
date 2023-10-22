/*

Manage a Scatter Chart

*/

import Chart from "./Chart.mjs";
import ChartScale from "./ChartScale.mjs";
import { clamp } from "../navMath.mjs";
import { format } from "https://cdn.skypack.dev/date-fns";

export default class ScatterChart extends Chart {
  constructor(parent, y) {
    super(parent, "scatter", y);

    this.axesHeight = 30;

    this.configurableAxes = 3;

    this.axes.x = {
      title:'X',
      numParams: 0,
      maxParams:1,
      scale: new ChartScale("linear"),
      params: {},
    };
    this.axes.y = {
      title:'Y',
      numParams: 0,
      maxParams:1,
      scale: new ChartScale("linear"),
      params: {},
    };
    this.axes.colour = {
        title:'Colour',
        numParams: 0,
        maxParams:1,
        scale: new ChartScale("linear"),
        params: {},
      };

    this.resize();
  }

  draw() {
    super.draw();

    var me = this;
    var y1 = this.y;
    var h1 = this.height - this.axesHeight; // chart area`

    var w = this.ctx.canvas.width;
    var cx = w / 2;

    var h = this.ctx.canvas.height;
    var cy = h / 2;

    var x1 = this.axesWidth;
    var cw = w - this.legendWidth - x1; // chart area

    // draw X axis
    this.ctx.strokeStyle = "#888";
    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1 + h1);
    this.ctx.lineTo(x1 + cw, y1 + h1);
    this.ctx.stroke();

    this.drawVerticalTicks();
    
    // draw Y axis
    this.ctx.strokeStyle = "#888";
    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x1, y1 + h1);
    this.ctx.stroke();

    this.drawHorizontalTicks();



    // dont bother trying to draw unless we have both x and y params set
    if (this.axes.x.numParams == 0 || this.axes.y.numParams == 0) {
        this.ctx.textAlign = "left";
        this.ctx.fillText('Confgiure both axes', x1 + 10, y1 + this.height/2);
        return;
    }

    // determine params to use for axes
    var xAxis, yAxis, colourAxis = null;
    for (const [key, col] of Object.entries(this.axes.x.params)) {
        xAxis = col;
    }
    for (const [key, col] of Object.entries(this.axes.y.params)) {
        yAxis = col;
    }
    for (const [key, col] of Object.entries(this.axes.colour.params)) {
        colourAxis = col;
    }

    var pdx = this.parent.paramData[xAxis.addr];
    var pdy = this.parent.paramData[yAxis.addr];

    var pdc;
    if (colourAxis) pdc = this.parent.paramData[colourAxis.addr];

    // title X axis
    this.ctx.fillStyle = "#888";
    this.ctx.font = this.parent.font;
    this.ctx.textAlign = "center";
    this.ctx.fillText(xAxis.title, x1 + cw/2, y1 + this.height-5);

    // title Y axis
    this.ctx.fillStyle = "#888";
    this.ctx.font = this.parent.font;
    this.ctx.textAlign = "center";
    this.ctx.save();
    this.ctx.translate(15, y1 + h1/2);
    this.ctx.rotate(-Math.PI/2);
    this.ctx.fillText(yAxis.title, 0, 0);
    this.ctx.restore();


    // ensure we have data to draw with!
    if (pdx.data.length == 0 || pdy.data.length == 0) {
        this.ctx.textAlign = "left";
        this.ctx.fillText('Waiting for data', x1 + 10, y1 + this.height/2);
        return;
    }

    // find ranges to draw
    var xi = this.getIndicesForTimeRange(pdx, this.parent.selectedStartTime, this.parent.selectedEndTime);

    var yi = this.getIndicesForTimeRange(pdy, this.parent.selectedStartTime, this.parent.selectedEndTime);

    var ci;
    if (colourAxis) {
        ci = this.getIndicesForTimeRange(pdc, this.parent.selectedStartTime, this.parent.selectedEndTime);
    }

    // set clip region
    this.ctx.save();

    this.ctx.beginPath();
    this.ctx.rect(x1, y1, w - this.legendWidth - x1, h1);
    this.ctx.clip();

    // draw data
    // set default fill style
    this.ctx.fillStyle = 'hsla(0, 0%, 100%, 0.2)';

    // use Y axis as basis for timing
    var i = xi.start;
    var j = yi.start;
    var k = (colourAxis) ? ci.start : 0;
    while (i <= xi.end && j <= yi.end) {
        var px = x1 + (cw * (pdx.data[i].v - this.axes.x.scale.minV)) / this.axes.x.scale.range;
        
        var py = y1 + h1 - (h1 * (pdy.data[j].v - this.axes.y.scale.niceMin)) / this.axes.y.scale.range; // invert y drawing

        if (colourAxis && (k < pdc.data.length)) {
            var hue =  240 + 120 * (pdc.data[k].v - this.axes.colour.scale.niceMin) / this.axes.colour.scale.range;
            this.ctx.fillStyle = 'hsla('+hue.toFixed(0)+', 100%, 60%, 0.3)';
        }
    
        this.ctx.beginPath();
        this.ctx.arc(px, py, 2, 0, 2*Math.PI);
        this.ctx.fill();
    
        // advance colour
        if (colourAxis) {
            while (k < pdc.data.length-1 && pdc.data[k].t < pdy.data[j].t) {
                k++;
            }
        }

        if (pdx.data[i].t < pdy.data[j].t) {
            i++;
        } else {
            j++;
        }
    }

    this.ctx.restore();

    // draw horizontal cross-hair
    if (this.parent.mx < x1 + cw && this.parent.my > this.y && this.parent.my < this.y + this.height) {
        this.ctx.strokeStyle = "#fff";
        this.ctx.beginPath();
        this.ctx.moveTo(x1, this.parent.my);
        this.ctx.lineTo(x1 + cw, this.parent.my);
        this.ctx.stroke();
  
        // draw y value
        var v = this.axes.y.scale.niceMin + (-(this.parent.my - y1 - h1) * this.axes.y.scale.range) / h1;
  
        this.ctx.fillStyle = "#fff";
        this.ctx.font = this.parent.font;
        this.ctx.textAlign = "right";
        this.ctx.fillText(v.toFixed(1), x1 - 4, this.parent.my);
      }

    // draw vertical cross-hair
    if (this.parent.mx > x1 && this.parent.mx < x1 + cw && this.parent.my > this.y && this.parent.my < this.y + this.height) {
        this.ctx.strokeStyle = "#fff";
        this.ctx.beginPath();
        this.ctx.moveTo(this.parent.mx, this.y);
        this.ctx.lineTo(this.parent.mx, this.y + h1);
        this.ctx.stroke();
  
        // draw x value
        var v = this.axes.x.scale.minV + ((this.parent.mx - x1) * this.axes.x.scale.range) / cw;
  
        this.ctx.fillStyle = "#fff";
        this.ctx.font = this.parent.font;
        this.ctx.textAlign = "right";
        this.ctx.fillText(v.toFixed(1), this.parent.mx, this.y + h1 + 15);
      }
  }
}
