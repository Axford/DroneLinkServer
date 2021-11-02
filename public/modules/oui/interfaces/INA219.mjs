import loadStylesheet from '../../loadStylesheet.js';
import * as DLM from '../../droneLinkMsg.mjs';

//loadStylesheet('./css/modules/interfaces/INA219.css');

export default class INA219 {
	constructor(channel, state) {
    this.channel = channel;
    this.state = state;
    this.built = false;
	}

	drawMeter(ctx, v, label, x1,y1,w,h) {
    ctx.strokeStyle = '#343a40';
    ctx.strokeRect(x1, y1, x1+w, y1+h);

    ctx.fillStyle = '#ccc';
    ctx.font = '20px serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, x1+w/2, y1+h/2 - 15);

    ctx.fillStyle = '#8F8';
    ctx.font = '35px serif';
    ctx.fillText(v, x1+w/2, y1+h/2 + 20);
  }

	onParamValue(data) {
    this.update();
  }

  update() {
		if (!this.built) return;

    var node = this.channel.node.id;
    var channel = this.channel.channel;

		var ina = {
      current: this.state.getParamValues(node, channel, 12, [0])[0],
      power: this.state.getParamValues(node, channel, 13, [0])[0],
      loadV: this.state.getParamValues(node, channel, 14, [0])[0],
			cellV: this.state.getParamValues(node, channel, 15, [0])[0],
			alarm: this.state.getParamValues(node, channel, 16, [0])[0]
    }

    // redraw canvas
		var c = this.canvas[0];
		var ctx = c.getContext("2d");

		// keep width updated
		var w = this.ui.width();
		ctx.canvas.width = w;

		ctx.fillStyle = '#343a40';
		ctx.fillRect(0,0,w,200);

		var mw = w/4;

		if (ina.cellV)
			this.drawMeter(ctx, ina.cellV.toFixed(1), 'Cell V', 0, 0, mw,100);

		if (ina.loadV)
			this.drawMeter(ctx, ina.loadV.toFixed(1), 'V', mw, 0, mw,100);

		if (ina.current)
	    this.drawMeter(ctx, ina.current.toFixed(1), 'A', 2*mw, 0, mw,100);

		if (ina.power)
	    this.drawMeter(ctx, ina.power.toFixed(1), 'W', 3*mw, 0, mw,100);
  }

	build() {
		this.built = true;

		this.ui = $('<div class="INA219 text-center"></div>');
    this.canvas = $('<canvas height=100 />');

		this.ui.append(this.canvas);
    this.channel.interfaceTab.append(this.ui);

    this.built = true;

    this.update();
  }
}
