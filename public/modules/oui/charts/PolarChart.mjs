/*

Manage a Scatter Chart

*/

import Chart from "./Chart.mjs";
import ChartScale from "./ChartScale.mjs";
import { clamp, degreesToRadians } from "../../navMath.mjs";
import { format } from "https://cdn.skypack.dev/date-fns";

export default class PolarChart extends Chart {
  constructor(parent, y) {
    super(parent, "polar", y);

    this.axesWidth = 1;
    this.axesHeight = 1;

    this.configurableAxes = 2;

    this.axes.x = {
      title:'Angle',
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

    // overall dimensions are set by the Y axis maxV

    var cx = x1 + cw/2;
    var cy = y1 + h1/2;

    var r = cw/2;
    if (h1/2 < r) r = h1/2;

    // draw X axis
    this.ctx.strokeStyle = "#888";
    this.ctx.beginPath();
    this.ctx.moveTo(x1, cy);
    this.ctx.lineTo(x1 + cw, cy);
    this.ctx.stroke();

    // label X Axis
    this.ctx.fillStyle = "#888";
    this.ctx.font = this.parent.font;
    this.ctx.textAlign = "left";
    this.ctx.fillText(this.axes.y.scale.maxV.toFixed(0), cx + r + 5, cy - 4);
    
    // draw Y axis
    this.ctx.strokeStyle = "#888";
    this.ctx.beginPath();
    this.ctx.moveTo(cx, y1);
    this.ctx.lineTo(cx, y1 + h1);
    this.ctx.stroke();

    this.ctx.beginPath();
    this.ctx.arc(cx, cy, r, 0, 2*Math.PI);
    this.ctx.stroke();


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
    if (pdx.filteredData.length == 0 || pdy.filteredData.length == 0) {
        this.ctx.textAlign = "left";
        this.ctx.fillText('Waiting for data', x1 + 10, y1 + this.height/2);
        return;
    }

    // set clip region
    this.ctx.save();

    this.ctx.beginPath();
    this.ctx.rect(x1, y1, w - this.legendWidth - x1, h1);
    this.ctx.clip();

    // draw data

    this.ctx.fillStyle = 'rgba(80,255,80,0.3)';

    // use Y axis as basis for timing
    var i = 0;
    var j = 0;
    while (i < pdx.filteredData.length && j < pdy.filteredData.length) {
        var ang = degreesToRadians(pdx.filteredData[i].v);
        
        if (pdy.filteredData[j].v >= 0) {
            var r1 = (r * pdy.filteredData[j].v) / this.axes.y.scale.getRange();

            var px = cx + r1 * Math.cos(ang-Math.PI/2);
            var py = cy + r1 * Math.sin(ang-Math.PI/2);
        
            this.ctx.beginPath();
            this.ctx.arc(px, py, 2, 0, 2*Math.PI);
            this.ctx.fill();
        }

        if (pdx.filteredData[i].t < pdy.filteredData[j].t) {
            i++;
        } else {
            j++;
        }
    }
  
    this.ctx.restore();
  }
}
