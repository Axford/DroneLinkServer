/*

Manage a LineChart

*/

import Chart from "./Chart.mjs";
import ChartScale from "./ChartScale.mjs";
import { clamp } from "../../navMath.mjs";
import { format } from "https://cdn.jsdelivr.net/npm/date-fns@3.6.0/+esm";
import Vector from "../../Vector.mjs";

export default class LineChart extends Chart {

    constructor(parent, y) {
        super(parent, 'line',y);

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
            maxParams:10,
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
    
        // draw data!
        for (const [key, col] of Object.entries(this.axes.y.params)) {
          var pd = this.parent.paramData[col.addr];
    
          if (this.parent.dragLabel || this.parent.hoverLabel) {
            this.ctx.strokeStyle =
              col == this.parent.dragLabel || col == this.parent.hoverLabel
                ? col.style
                : col.dimStyle;
          } else this.ctx.strokeStyle = col.style;
          this.ctx.beginPath();
    
          // find range to draw
          var i = 0;
          var startIndex = 0;
          var endIndex = pd.filteredData.length - 1;
    
          if (pd.filteredData.length > 0) {
            var lpy = 0;
            var lpx = 0;
            var lt = 0;
            for (var i = startIndex; i < endIndex + 1; i++) {
              var pde = pd.filteredData[i];
              var px = x1 + (cw * (pde.t - this.parent.selectedStartTime)) / timeRange;
              col.lastY = h1 - (h1 * (pde.v - this.axes.y.scale.getMin())) / this.axes.y.scale.getRange();
              var py = y1 + col.lastY; // invert y drawing
    
              var td = pde.t - lt;
    
              if (i == startIndex) {
                this.ctx.moveTo(px, py);
              } else {
                if (td > 1000 * 10) this.ctx.lineTo(px, lpy);
                this.ctx.lineTo(px, py);
              }
              lpx = px;
              lpy = py;
              lt = pde.t;
            }
            // was the last sample ages ago?
            if (lpx < x1 + cw - 1) this.ctx.lineTo(x1 + cw, lpy);
          }
    
          this.ctx.stroke();
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
        if (this.parent.mx > x1 && this.parent.mx < x1 + cw) {
            this.ctx.strokeStyle = "#fff";
            this.ctx.beginPath();
            this.ctx.moveTo(this.parent.mx, this.y);
            this.ctx.lineTo(
              this.parent.mx,
              this.y + this.height
            );
            this.ctx.stroke();
      
            if (this.parent.my > this.y && this.parent.my < this.y+this.height) {
                // draw time value
                var tv = this.parent.selectedStartTime + ((this.parent.mx - x1) * timeRange) / cw;
                this.ctx.fillStyle = "#fff";
                this.ctx.font = this.parent.font;
                this.ctx.textAlign = "left";
                var ty = clamp(
                    this.parent.my - 5,
                    this.y,
                    this.y+this.height
                );
        
                this.ctx.fillText(format(tv, "HH:mm:ss"), this.parent.mx + 4, ty);
            }
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