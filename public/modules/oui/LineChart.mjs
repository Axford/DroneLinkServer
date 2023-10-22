/*

Manage a LineChart

*/

import Chart from "./Chart.mjs";
import ChartScale from "./ChartScale.mjs";
import { clamp } from "../navMath.mjs";
import { format } from "https://cdn.skypack.dev/date-fns";

export default class LineChart extends Chart {

    constructor(parent, y) {
        super(parent, 'line',y);

        this.configurableAxes = 1;

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




    draw() {
        super.draw();

        var me = this;
        var y1 = this.y;
        var h1 = this.height - this.axesHeight; // chart area`
    
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
          var endIndex = pd.data.length - 1;
    
          pd.data.forEach((pde, pi) => {
            if (pde.t < this.parent.selectedStartTime) startIndex = pi;
    
            if (pde.t <= this.parent.selectedEndTime) endIndex = pi + 1;
          });
          if (endIndex > pd.data.length - 1) endIndex = pd.data.length - 1;
    
          if (pd.data.length > 0) {
            var lpy = 0;
            var lpx = 0;
            var lt = 0;
            for (var i = startIndex; i < endIndex + 1; i++) {
              var pde = pd.data[i];
              var px = x1 + (cw * (pde.t - this.parent.selectedStartTime)) / timeRange;
              col.lastY = h1 - (h1 * (pde.v - this.axes.y.scale.niceMin)) / this.axes.y.scale.range;
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
          var v = this.axes.y.scale.niceMin + (-(this.parent.my - y1 - h1) * this.axes.y.scale.range) / h1;
    
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
      }
}