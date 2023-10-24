import ChartFilter from "./ChartFilter.mjs";
import ChartDropZone from "./ChartDropZone.mjs";
import Chart from "./Chart.mjs";

export default class ParamChartFilter extends ChartFilter {

    constructor(parent, y) {
        super(parent, y);

        this.dropZone = new ChartDropZone(parent, this, parent.width - this.legendWidth+5, 0, this.legendWidth-5, this.height);
        this.dropZone.title = 'Filter';
    }

    resize() {
        super.resize();
        this.dropZone.x = this.parent.width - this.legendWidth + 5;
    }

    draw() {
        super.draw();

        this.ctx.fillStyle = "#fff";
        this.ctx.font = "14px normal, " + this.parent.baseFont;
        this.ctx.textAlign = "left";
        this.ctx.fillText('Param Filter', 5, this.y + 15);

        this.dropZone.draw();
    }
}