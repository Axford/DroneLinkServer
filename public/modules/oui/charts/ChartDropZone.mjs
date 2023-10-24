/*

Area where parameters can be dropped to bind them to charts, filters, etc

*/

import roundRect from "../../RoundedRect.mjs";

export default class ChartDropZone {
  constructor(mgr, parent, x, y, w, h) {
    this.mgr = mgr; // reference to ChartManager
    this.parent = parent;
    // x and y are relative to parent
    // parent must expose x and y values
    this.x = x;  
    this.y = y;
    this.height = h;
    this.width = w;
    this.ctx = parent.ctx;

    this.numParams = 0;
    this.maxParams = 1;
    this.params = {};
    this.title = '';

    // register dropZone with mgr
    mgr.addDropZone(this);
  }

  
  addParam(y, paramData) {
    
  }

  removeParam(param) {
    
  }

  onMousedown(x, y) {
    return null;
  }

  onContextmenu(x, y) {
    
  }

  draw() {
    var x1 = this.parent.x + this.x;
    var y1 = this.parent.y + this.y;
    var w = this.width;

    // show drop region
    this.ctx.strokeStyle =
      this.mgr.dragLabel ? "#fc5" : "#555";
    roundRect(this.ctx, x1, y1, this.width, this.height, 4, false, true);

    // axis title
    this.ctx.fillStyle = "#888";
    this.ctx.font = "14px bold, " + this.mgr.baseFont;
    this.ctx.textAlign = "left";
    this.ctx.fillText(this.title, x1+5, y1+15);

    // numParams vs max
    this.ctx.textAlign = "right";
    this.ctx.font = "10px normal, " + this.mgr.baseFont;
    this.ctx.fillText(this.numParams + '/' + this.maxParams, x1 + w - 5, y1+12);

    var w3 = 40;
    var x2 = w - this.legendWidth + w3;
    var h2 = this.legendLabelHeight;
    var w2 = this.legendWidth - w3;
    
    for (const [key, col] of Object.entries(this.params)) {
        var pd = this.parent.paramData[col.addr];

        var y2 = y1 + col.position;

        if (this.mgr.dragLabel || this.mgr.hoverLabel) {
        this.ctx.fillStyle =
            col == this.mgr.dragLabel || col == this.mgr.hoverLabel
            ? col.style
            : col.dimStyle;
        } else this.ctx.fillStyle = col.style;

        /*
        if (col.lastY !== undefined) {
            // draw arrow thing
            this.ctx.beginPath();
            this.ctx.moveTo(w - this.legendWidth, y1 + col.lastY);
            this.ctx.lineTo(x2, y2);
            this.ctx.lineTo(x2, y2 + h2);
            this.ctx.fill();
        }
        */

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

