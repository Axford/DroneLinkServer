import loadStylesheet from '../../loadStylesheet.js';
import * as DLM from '../../droneLinkMsg.mjs';

//loadStylesheet('./css/modules/interfaces/INA3221.css');

export default class INA3221 {
	constructor(channel, state) {
    this.channel = channel;
    this.state = state;
    this.built = false;
	}

  drawLabel(ctx, label, x1,y1,w,h) {
    ctx.strokeStyle = '#343a40';
    ctx.strokeRect(x1, y1, x1+w, y1+h);

    ctx.fillStyle = '#ccc';
    ctx.font = '14px serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, x1+w/2, y1+h);
  }

	drawMeter(ctx, v, x1,y1,w,h) {
    ctx.strokeStyle = '#343a40';
    ctx.strokeRect(x1, y1, x1+w, y1+h);

    ctx.fillStyle = '#8F8';
    ctx.font = '35px serif';
    ctx.fillText(v, x1+w/2, y1+h);
  }

	onParamValue(data) {
    this.update();
  }

  update() {
		if (!this.built) return;

    var node = this.channel.node.id;
    var channel = this.channel.channel;

		var ina = {
      current: this.state.getParamValues(node, channel, 12, [0,0,0]),
      power: this.state.getParamValues(node, channel, 13, [0,0,0]),
      loadV: this.state.getParamValues(node, channel, 14, [0,0,0]),
			cellV: this.state.getParamValues(node, channel, 15, [0,0,0]),
			alarm: this.state.getParamValues(node, channel, 16, [0,0,0])
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

		var mw = w/4;

    var h1 = h - 20;
    var hm = h1/3;

    this.drawLabel(ctx, 'Cell V', 0, 0, mw, 20);
    this.drawLabel(ctx, 'V', mw, 0, mw, 20);
    this.drawLabel(ctx, 'A', 2*mw, 0, mw, 20);
    this.drawLabel(ctx, 'W', 3*mw, 0, mw, 20);

    for (var i=0; i<3; i++) {
      var y1 = hm * i;
      // 'Cell V'
      this.drawMeter(ctx, ina.cellV[i].toFixed(2), 0, y1, mw,hm);

      // V
  		this.drawMeter(ctx, ina.loadV[i].toFixed(2), w, y1, mw,hm);

      // A
  		this.drawMeter(ctx, ina.current[i].toFixed(2), 2*mw, y1, mw,hm);

      // W
  		this.drawMeter(ctx, ina.power[i].toFixed(2), 3*mw, y1, mw,hm);
    }

  }

	build() {
		this.built = true;

		this.ui = $('<div class="INA3221 text-center"></div>');
    this.canvas = $('<canvas height=200 />');

		this.ui.append(this.canvas);
    this.channel.interfaceTab.append(this.ui);

    this.built = true;

    this.update();
  }
}
