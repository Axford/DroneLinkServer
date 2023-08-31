import ModuleInterface from './ModuleInterface.mjs';
import loadStylesheet from '../../loadStylesheet.js';
import * as DLM from '../../droneLinkMsg.mjs';

//loadStylesheet('./css/modules/interfaces/INA3221.css');

// capacity curve... approximate
// ref: https://blog.ampow.com/lipo-voltage-chart/
// voltages for capacities from 0 to 100
//                                0     10    20    30    40   50    60    70    80    90    100
const batteryCapacityCurve = [3.27, 3.69, 3.73, 3.77, 3.8, 3.84, 3.87, 3.95, 4.02, 4.11, 4.2];


export default class INA3221 extends ModuleInterface {
	constructor(channel, state) {
    super(channel, state);
	}

  estimateCellCapacity(v) {
    // find nearest reading in capacity curve
    var cap = 0;

    // check voltage is above minimum
    if (v < batteryCapacityCurve[0]) return 0;

    // find which region of the battery curve we're in
    for (var i=0; i < 11; i++) {
      if (v >= batteryCapacityCurve[i]) {
        cap = i;
      }
    }

    // lerp between battery levels to calc final percentage
    if (cap < 10) {
      // calc fractional compenent
      var f = ( v - batteryCapacityCurve[cap]) / (batteryCapacityCurve[cap+1] - batteryCapacityCurve[cap]);
      cap = cap*10 + f*10;
    } else {
      cap = 100;
    }
    
    return cap;
  }



  update() {
		if (!super.update()) return;

    var node = this.channel.node.id;
    var channel = this.channel.channel;

		var ina = {
      current: this.state.getParamValues(node, channel, 12, [0,0,0]),
      power: this.state.getParamValues(node, channel, 13, [0,0,0]),
      loadV: this.state.getParamValues(node, channel, 14, [0,0,0]),
			cellV: this.state.getParamValues(node, channel, 15, [0,0,0]),
			alarm: this.state.getParamValues(node, channel, 16, [0,0,0]),
      usage: this.state.getParamValues(node, channel, 20, [0,0,0]),
      capacity: [0,0,0]
    }

    // calc capacities
    for (var i=0; i<3; i++) {
      ina.capacity[i] = this.estimateCellCapacity(ina.cellV[i]);
    }

    // redraw canvas
		var c = this.canvas[0];
		var ctx = c.getContext("2d");

		// keep width updated
		var w = this.ui.width();
		ctx.canvas.width = w;
    var h = this.ui.height();

		ctx.fillStyle = '#343a40';
		ctx.fillRect(0,0,w,200);

		var mw = w/3;
    var h2 = 70;
    var h1 = h - h2;
    var hm = (h2-8)/3;

    for (var i=0; i<3; i++) {
      var x1 = mw * i;
      var clr = ina.capacity < 20 ? "#f55" : (ina.capacity[i]<50 ? '#fa5' : '#8f8');

      this.drawDialIndicator('cellV', ina.cellV[i].toFixed(1), ina.capacity[i], 0, 100, x1, 0, mw, h1 + 10, clr, 8);
      // 'Cell V'
      //this.drawMeterValue(ina.cellV[i].toFixed(2), 0, y1, mw,hm, clr);

      // capacity
      //this.drawMeterValue(ina.capacity[i].toFixed(0) + '%', 0, y1+20, mw,hm, clr, 16);

      ctx.textAlign = 'center';
      //if (ina.loadV[i]) this.drawMeterValue(ina.loadV[i].toFixed(1) + ' V', x1, h1, mw, hm-2, '#8F8', 20);
      if (ina.current[i]) this.drawMeterValue(ina.current[i].toFixed(2) + ' A', x1, h1 , mw, hm-2, '#8F8', 20);
      if (ina.usage[i]) this.drawMeterValue(ina.usage[i].toFixed(2) + ' Ah', x1, h1 +hm , mw, hm-2, '#8F8', 20);
      if (ina.power[i]) this.drawMeterValue(ina.power[i].toFixed(2) + ' W', x1, h1 + 2*hm, mw, hm-2, '#8F8', 20);

      // V
  		//this.drawMeterValue(ina.loadV[i].toFixed(2), w, y1, mw,hm);

      // A
  		//this.drawMeterValue(ina.current[i].toFixed(2), 2*mw, y1, mw,hm);

      // W
  		//this.drawMeterValue(ina.power[i].toFixed(2), 3*mw, y1, mw,hm);
    }

  }

	build() {
		super.build('INA3221');

    this.canvas = $('<canvas height=150 />');

		this.ui.append(this.canvas);

    super.finishBuild();
  }
}
