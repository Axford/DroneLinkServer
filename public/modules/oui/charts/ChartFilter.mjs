import roundRect from "../../RoundedRect.mjs";

export default class ChartFilter {
  constructor(parent, y) {
    this.parent = parent;
    this.height = 40;
    this.x = 0;
    this.y = y;
    this.ctx = parent.ctx;

    this.axesWidth = 65; // area for labelling axis
    this.legendWidth = 160;
    this.legendLabelHeight = 40;
  }

  reset() {
    // reset filter
    // TODO
  }

  onMousedown(x, y) {
    return null;
  }

  onContextmenu(x, y) {
    // reset zoom
    this.reset();
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
    this.ctx.fillRect(0, y1, w - this.legendWidth, h1);

  }

}
