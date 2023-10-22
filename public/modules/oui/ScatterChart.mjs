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

    this.axesHeight = 20;

    this.configurableAxes = 2;

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

    // label X Axis
    this.ctx.fillStyle = "#888";
    this.ctx.font = this.parent.font;
    this.ctx.textAlign = "left";
    this.ctx.fillText(this.axes.x.scale.minV.toFixed(0), x1, y1 + h1+10);
    this.ctx.textAlign = "right";
    this.ctx.fillText(this.axes.x.scale.maxV.toFixed(0), x1 + cw, y1 + h1+10);

    // draw zero
    this.ctx.strokeStyle = "#666";
    this.ctx.beginPath();
    // X
    var y2 = y1 + h1 - (h1 * (0 - this.axes.y.scale.minV)) / this.axes.y.scale.range;
    this.ctx.moveTo(x1, y2);
    this.ctx.lineTo(x1 + cw, y2);
    this.ctx.stroke();
    // Y
    var x2 = x1 + (cw * (0 - this.axes.x.scale.minV)) / this.axes.x.scale.range;
    this.ctx.moveTo(x2, y1);
    this.ctx.lineTo(x2, y1 + h1);
    this.ctx.stroke();
    
    // draw Y axis
    this.ctx.strokeStyle = "#888";
    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x1, y1 + h1);
    this.ctx.stroke();

    // label Y Axis
    this.ctx.fillStyle = "#888";
    this.ctx.font = this.parent.font;
    this.ctx.textAlign = "right";
    this.ctx.fillText(this.axes.y.scale.maxV.toFixed(0), x1 - 2, y1 + 10);
    this.ctx.fillText(this.axes.y.scale.minV.toFixed(0), x1 - 2, y1 + h1);

    // dont bother trying to draw unless we have both x and y params set
    if (this.axes.x.numParams == 0 || this.axes.y.numParams == 0) {
        this.ctx.textAlign = "left";
        this.ctx.fillText('Confgiure both axes', x1 + 10, y1 + this.height/2);
        return;
    }

    // determine params to use for axes
    var xAxis, yAxis;
    for (const [key, col] of Object.entries(this.axes.x.params)) {
        xAxis = col;
    }
    for (const [key, col] of Object.entries(this.axes.y.params)) {
        yAxis = col;
    }

    var pdx = this.parent.paramData[xAxis.addr];
    var pdy = this.parent.paramData[yAxis.addr];

    // ensure we have data to draw with!
    if (pdx.data.length == 0 || pdy.data.length == 0) {
        this.ctx.textAlign = "left";
        this.ctx.fillText('Waiting for data', x1 + 10, y1 + this.height/2);
        return;
    }

    // find ranges to draw
    var xi = this.getIndicesForTimeRange(pdx, this.parent.selectedStartTime, this.parent.selectedEndTime);

    var yi = this.getIndicesForTimeRange(pdy, this.parent.selectedStartTime, this.parent.selectedEndTime);

    // set clip region
    this.ctx.save();

    this.ctx.beginPath();
    this.ctx.rect(x1, y1, w - this.legendWidth - x1, h1);
    this.ctx.clip();

    // draw data

    this.ctx.fillStyle = 'rgba(0,255,0,0.2)';

    // use Y axis as basis for timing
    var i = xi.start;
    var px = x1 + (cw * (pdx.data[i].v - this.axes.x.scale.minV)) / this.axes.x.scale.range;

    for (var j = yi.start; j < yi.end + 1; j++) {
        // do we need to advance through x axis to keep time in sync with y axis item
        while (i < xi.end && (pdx.data[i].t < pdy.data[j].t)) {
            i++;
            px = x1 + (cw * (pdx.data[i].v - this.axes.x.scale.minV)) / this.axes.x.scale.range;
        }

        var py = y1 + h1 - (h1 * (pdy.data[j].v - this.axes.y.scale.minV)) / this.axes.y.scale.range; // invert y drawing
        
        this.ctx.beginPath();
        this.ctx.arc(px, py, 2, 0, 2*Math.PI);
        this.ctx.fill();
    }
  


    this.ctx.restore();
  }
}
