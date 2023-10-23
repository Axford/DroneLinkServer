/*

Manage a LineChart

*/

import Chart from "./Chart.mjs";
import ChartScale from "./ChartScale.mjs";
import { clamp } from "../navMath.mjs";
import { format } from "https://cdn.skypack.dev/date-fns";
import Vector from "../Vector.mjs";

export default class ViolinChart extends Chart {

    constructor(parent, y) {
        super(parent, 'violin',y);

        this.configurableAxes = 1;

        this.zooming = false;
        this.zoomStart = new Vector(0,0);
        this.zoomEnd = new Vector(0,0);

        this.axes.x = {
            numParams: 0,
            maxParams:0,
            scale: new ChartScale('time'),
            params: {}
        };
        this.axes.y = {
            title:'Y',
            numParams: 0,
            maxParams:5,
            scale: new ChartScale('linear'),
            params: {}
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
            this.axes.y.scale.zoomTo(
                this.axes.y.scale.pixelToValue(h1-this.zoomEnd.y, h1),
                this.axes.y.scale.pixelToValue(h1-this.zoomStart.y, h1)
            );
        }
    }


    draw() {
        super.draw();

        var me = this;
        var y1 = this.y;
        var h1 = this.height - this.axesHeight; // chart area
    
        var w = this.ctx.canvas.width;
        var cx = w / 2;
    
        var h = this.ctx.canvas.height;
        var cy = h / 2;
        var timeRange = this.parent.selectedEndTime - this.parent.selectedStartTime;
        if (timeRange == 0) timeRange = 1;
    
        var x1 = this.axesWidth;
        var cw = w - this.legendWidth - x1; // chart area

        // check for config
        if (this.axes.y.numParams == 0) return;
    
        // draw Y axis
        this.ctx.strokeStyle = "#888";
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x1, y1 + h1);
        this.ctx.stroke();
    
        this.drawHorizontalTicks();
    
        // set clip region
        this.ctx.save();
    
        this.ctx.beginPath();
        this.ctx.rect(x1, y1, w - this.legendWidth - x1, h1 + this.axesHeight);
        this.ctx.clip();
   
        // calculate drawing offsets
        var vSpacing = cw / (this.axes.y.numParams+1);
        var vWidth = vSpacing * 0.8;
        var vi = 1;

        // draw data!
        for (const [key, col] of Object.entries(this.axes.y.params)) {
          var pd = this.parent.paramData[col.addr];
    
          this.ctx.fillStyle = col.dimStyle;
    
          // find range to draw
          var i = 0;
          var startIndex = 0;
          var endIndex = pd.data.length - 1;
    
          pd.data.forEach((pde, pi) => {
            if (pde.t < this.parent.selectedStartTime) startIndex = pi;
    
            if (pde.t <= this.parent.selectedEndTime) endIndex = pi + 1;
          });
          if (endIndex > pd.data.length - 1) endIndex = pd.data.length - 1;
    
          if (pd.data.length > 0) {
            for (var i = startIndex; i < endIndex + 1; i++) {
              var pde = pd.data[i];
              var hv = pd.data[i].t % vWidth;
              var px = x1 + (vi * vSpacing) + (hv) - (vWidth/2);
              var py = y1 + h1 - (h1 * (pde.v - this.axes.y.scale.getMin())) / this.axes.y.scale.getRange(); // invert y drawing

              this.ctx.beginPath();
              this.ctx.arc(px, py, 3, 0, 2*Math.PI);
              this.ctx.fill();
              
            }
          }

          vi++;
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

        // show zoom area
        if (this.zooming) {
            this.ctx.strokeStyle = "rgba(255,255,0,0.7)";
            this.ctx.beginPath();
            this.ctx.rect(x1, this.y + this.zoomStart.y, 
                cw, this.zoomEnd.y - this.zoomStart.y);
            this.ctx.stroke();
        }
      }
}