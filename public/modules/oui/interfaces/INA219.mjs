import ModuleInterface from './ModuleInterface.mjs';
import loadStylesheet from '../../loadStylesheet.js';
import * as DLM from '../../droneLinkMsg.mjs';

//loadStylesheet('./css/modules/interfaces/INA219.css');

// capacity curve... approximate
// ref: https://blog.ampow.com/lipo-voltage-chart/
// voltages for capacities from 0 to 100
//                                0     10    20    30    40   50    60    70    80    90    100
const batteryCapacityCurve = [3.27, 3.69, 3.73, 3.77, 3.8, 3.84, 3.87, 3.95, 4.02, 4.11, 4.2];



export default class INA219 extends ModuleInterface {
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

	onParamValue(data) {
		if (!this.built) return;

		if (data.param == 15 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_FLOAT) {
      // cellV
      var d = data.values[0];

			if (d < 3.3) {
				this.widget.removeClass('warning');
				this.widget.addClass('danger');
			} else if (d < 3.6) {
				this.widget.removeClass('danger');
				this.widget.addClass('warning');
			} else {
				this.widget.removeClass('danger');
				this.widget.removeClass('warning');
			}
      this.widgetText.html(d.toFixed(1) + 'v');
    }

    this.updateNeeded = true;
  }

  update() {
		if (!super.update()) return;

    var node = this.channel.node.id;
    var channel = this.channel.channel;

		var ina = {
      current: this.state.getParamValues(node, channel, 12, [0])[0],
      power: this.state.getParamValues(node, channel, 13, [0])[0],
      loadV: this.state.getParamValues(node, channel, 14, [0])[0],
			cellV: this.state.getParamValues(node, channel, 15, [0])[0],
			alarm: this.state.getParamValues(node, channel, 16, [0])[0]
    }
		ina.capacity = this.estimateCellCapacity(ina.cellV);

    // redraw canvas
		var c = this.canvas[0];
		var ctx = c.getContext("2d");

		// keep width updated
		var w = this.ui.width();
		ctx.canvas.width = w;

		ctx.fillStyle = '#343a40';
		ctx.fillRect(0,0,w,200);

		var mw = w/4;

		if (ina.cellV) {
			this.drawMeter(ina.cellV.toFixed(1), 'Cell V', 0, 0, mw,100);

			// capacity
			var clr = ina.capacity<20 ? '#f55' : '#8f8';
      this.drawMeterValue(ina.capacity.toFixed(0) + '%', 0, 80, mw, 20, clr, 16);
		}

		if (ina.loadV)
			this.drawMeter(ina.loadV.toFixed(1), 'V', mw, 0, mw,100);

		if (ina.current)
	    this.drawMeter(ina.current.toFixed(1), 'A', 2*mw, 0, mw,100);

		if (ina.power)
	    this.drawMeter(ina.power.toFixed(1), 'W', 3*mw, 0, mw,100);
  }

	build() {
		super.build('INA219');

    this.canvas = $('<canvas height=100 />');

		this.ui.append(this.canvas);

		// widget
		this.widget = $('<div class="widget"><i class="fas fa-car-battery"></i></div>');
		this.channel.node.addWidget(this.widget);

		this.widgetText = $('<span>?v</span>');
		this.widget.append(this.widgetText);


    super.finishBuild();
  }
}
