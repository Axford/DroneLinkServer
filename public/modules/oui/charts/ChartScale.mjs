/*

    Manage a scale for a chart axis

*/

export default class ChartScale {
  constructor(type) {
    this.type = type;

    this.updated = false;

    this.minV = 0;
    this.maxV = 1;
    this.range = 1;
    this.tickSpacing = 1;
    this.niceMin = 0;
    this.niceMax = 1;
    this.maxTicks = 10;
    this.tickPrecision = 0;
    this.zoomed = false;
    this.zoomMin = 0;
    this.zoomMax = 1;
  }

  reset() {
    this.minV = 0;
    this.maxV = 1;
    this.updated = false;
    this.calculate();
  }

  updateMinMax(minV, maxV) {
    if (!this.updated) {
        this.minV = minV;
        this.maxV = maxV;
    } else {
        this.minV = Math.min(minV, this.minV);
        this.maxV = Math.max(maxV, this.maxV);
    }

    this.updated = true;

    this.calculate(); // update intervals, etc
  }

  calculate() {
    // based on: https://erison.blogspot.com/2011/07/algorithm-for-optimal-scaling-on-chart.html

    this.range = this.niceNum(this.maxV - this.minV, false);
    this.tickSpacing = this.niceNum(this.range / (this.maxTicks-1), true);
    this.niceMin = Math.floor(this.minV / this.tickSpacing) * this.tickSpacing;
    this.niceMax = Math.ceil(this.maxV / this.tickSpacing) * this.tickSpacing;
    this.range = this.niceMax - this.niceMin;
    this.tickPrecision = this.tickSpacing < 1 ? 1 : 0;
  }

  niceNum(range, doRound) {
    var exponent = Math.floor(Math.log10(range));
    var fraction = range / Math.pow(10, exponent);
    var niceFraction = 1;

    if (doRound) {
      if (fraction < 1.5) niceFraction = 1;
      else if (fraction < 3) niceFraction = 2;
      else if (fraction < 7) niceFraction = 5;
      else niceFraction = 10;
    } else {
      if (fraction <= 1) niceFraction = 1;
      else if (fraction <= 2) niceFraction = 2;
      else if (fraction <= 5) niceFraction = 5;
      else niceFraction = 10;
    }

    return niceFraction * Math.pow(10, exponent);
  }

  getMin() {
    return this.zoomed ? this.zoomMin : this.niceMin;
  }

  getMax() {
    return this.zoomed ? this.zoomMax : this.niceMax;
  }

  getRange() {
    return this.zoomed ? (this.zoomMax - this.zoomMin) : this.range;
  }

  pixelToValue(p, pixRange) {
    return this.getMin() + (p / pixRange) * this.getRange();
  }

  valueToPixel(v, pixRange) {
    return pixRange * (v - this.getMin()) / this.getRange();
  }

  zoomTo(minV, maxV) {
    this.zoomed = true;
    this.zoomMin = minV;
    this.zoomMax = maxV;

    console.log('zooming to ', minV, maxV, this);
  }

  zoomExtents() {
    this.zoomed = false;
  }


}
