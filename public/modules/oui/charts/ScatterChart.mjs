/*

Manage a Scatter Chart

*/

import Chart from "./Chart.mjs";
import ChartScale from "./ChartScale.mjs";
import { clamp } from "../../navMath.mjs";
import { format } from "https://cdn.jsdelivr.net/npm/date-fns@3.6.0/+esm";
import Vector from "../../Vector.mjs";

export default class ScatterChart extends Chart {
  constructor(parent, y) {
    super(parent, "scatter", y);

    this.axesHeight = 30;

    this.configurableAxes = 3;

    this.zooming = false;
    this.zoomStart = new Vector(0,0);
    this.zoomEnd = new Vector(0,0);

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

  onMousedown(x,y) {
    var x1 = this.axesWidth;
    var w = this.ctx.canvas.width;
    var cw = w - this.legendWidth - x1; // chart area
    var h1 = this.height - this.axesHeight; // chart area

    if (x > x1 && x < x1 + cw && y < this.y + h1) {
        this.zoomStart.x = x - x1;
        this.zoomStart.y = y - this.y;
        this.zoomEnd.x = this.zoomStart.x;
        this.zoomEnd.y = this.zoomStart.y;
        this.zooming = true;
        return this.zoomInteractionHandler.bind(this);
    }
    return null;
}

zoomInteractionHandler(type, x, y) {
    var x1 = this.axesWidth;
    var w = this.ctx.canvas.width;
    var cw = w - this.legendWidth - x1; // chart area
    var h1 = this.height - this.axesHeight; // chart area

    var x2 = clamp(x - x1, this.zoomStart.x+1, cw);
    var y2 = clamp(y - this.y, this.zoomStart.y+1, h1);

    this.zoomEnd.x = x2;
    this.zoomEnd.y = y2;

    if (type == "move") {
        
    } else if (type == "up") {
        console.log(this, 'up');
        this.zooming = false;

        // apply zoom
        this.axes.x.scale.zoomTo(
            this.axes.x.scale.pixelToValue(this.zoomStart.x, cw),
            this.axes.x.scale.pixelToValue(this.zoomEnd.x, cw)
        );

        this.axes.y.scale.zoomTo(
            this.axes.y.scale.pixelToValue(h1-this.zoomEnd.y, h1),
            this.axes.y.scale.pixelToValue(h1-this.zoomStart.y, h1)
        );
    }
}

valueToHue(v) {
    return 240 + 120 * (v - this.axes.colour.scale.getMin()) / this.axes.colour.scale.getRange();
}

drawLegendBackground(axis) {
    if (axis == this.axes.colour && axis.numParams == 1) {
        var y1 = this.y;
        var h1 = this.height - this.axesHeight; // chart area`

        var w = this.ctx.canvas.width;
        var cx = w / 2;

        var h = this.ctx.canvas.height;
        var cy = h / 2;

        var x1 = this.axesWidth;
        var cw = w - this.legendWidth - x1; // chart area

        // visualise colour scale

        var w1 = this.legendWidth-5;
        var steps = 20;
        var stepWidth = w1/steps;
        for (var i=0; i<steps; i++) {
            var v = this.axes.colour.scale.getMin() + (i/steps) * this.axes.colour.scale.getRange();
            var hue = this.valueToHue(v);
            this.ctx.fillStyle = 'hsla('+hue.toFixed(0)+', 100%, 60%, 1)';
            var x2 = (i/steps) * w1;

            this.ctx.fillRect(x1+cw+5+x2, this.y + axis.y + axis.height/2, stepWidth, axis.height/2);
        }

        // label min/max
        this.ctx.fillStyle = "#fff";
        this.ctx.font = this.parent.font;
        this.ctx.textAlign = "left";
        this.ctx.fillText(this.axes.colour.scale.getMin().toFixed(this.axes.colour.tickPrecision), x1 + cw + 10, this.y + axis.y + axis.height-10);
        this.ctx.textAlign = "right";
        this.ctx.fillText(this.axes.colour.scale.getMax().toFixed(this.axes.colour.tickPrecision), w-5, this.y + axis.y + axis.height-10);
    }
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
    if (pdx.filteredData.length == 0 || pdy.data.length == 0) {
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
    // set default fill style
    this.ctx.fillStyle = 'hsla(0, 0%, 100%, 0.2)';

    // use Y axis as basis for timing
    var i = 0;
    var j = 0;
    var k = 0;
    while (i < pdx.filteredData.length && j < pdy.filteredData.length) {
        var px = x1 + (cw * (pdx.filteredData[i].v - this.axes.x.scale.getMin())) / this.axes.x.scale.getRange();
        
        var py = y1 + h1 - (h1 * (pdy.filteredData[j].v - this.axes.y.scale.getMin())) / this.axes.y.scale.getRange(); // invert y drawing

        if (colourAxis && (k < pdc.filteredData.length)) {
            var hue =  this.valueToHue(pdc.filteredData[k].v);
            this.ctx.fillStyle = 'hsla('+hue.toFixed(0)+', 100%, 60%, 0.4)';
        }
    
        this.ctx.beginPath();
        this.ctx.arc(px, py, 3, 0, 2*Math.PI);
        this.ctx.fill();
    
        // advance colour
        if (colourAxis) {
            while (k < pdc.filteredData.length-1 && pdc.filteredData[k].t < pdy.data[j].t) {
                k++;
            }
        }

        if (pdx.filteredData[i].t < pdy.filteredData[j].t) {
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
        var v = this.axes.y.scale.getMin() + (-(this.parent.my - y1 - h1) * this.axes.y.scale.getRange()) / h1;
  
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
        var v = this.axes.x.scale.getMin() + ((this.parent.mx - x1) * this.axes.x.scale.getRange()) / cw;
  
        this.ctx.fillStyle = "#fff";
        this.ctx.font = this.parent.font;
        this.ctx.textAlign = "right";
        this.ctx.fillText(v.toFixed(1), this.parent.mx, this.y + h1 + 15);
      }

    // show zoom area
    if (this.zooming) {
        this.ctx.strokeStyle = "rgba(255,255,0,0.7)";
        this.ctx.beginPath();
        this.ctx.rect(x1 + this.zoomStart.x, this.y + this.zoomStart.y, 
            this.zoomEnd.x - this.zoomStart.x, this.zoomEnd.y - this.zoomStart.y);
        this.ctx.stroke();
    }
  }
}
