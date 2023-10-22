/*

    Manage a scale for a chart axis

*/


export default class ChartScale {
    constructor(type) {
        this.type = type;

        this.minV = 0;
        this.maxV = 1;
        this.range = 1;
    }

    updateMinMax(minV, maxV) {
        this.minV = Math.min(minV, this.minV);
        this.maxV = Math.max(maxV, this.maxV);

        this.maxV = Math.ceil(this.maxV);
        this.minV = Math.floor(this.minV);

        this.range = this.maxV - this.minV;
        if (this.range == 0) this.range = 1;
    }


}