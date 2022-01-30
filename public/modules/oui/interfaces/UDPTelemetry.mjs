import loadStylesheet from '../../loadStylesheet.js';
import * as DLM from '../../droneLinkMsg.mjs';


export default class UDPTelemetry {
	constructor(channel, state) {
    this.channel = channel;
    this.state = state;
    this.built = false;
	}

  drawValue(x,y,label,v) {
    var c = this.canvas[0];
		var ctx = c.getContext("2d");

    ctx.fillStyle = '#FFF';
		ctx.textAlign = 'left';
    ctx.font = '12px serif';
    ctx.fillText(label, x, y+15);
    ctx.fillStyle = '#5f5';
    ctx.font = '20px bold serif';
    ctx.fillText(v, x, y+35);
  }

	onParamValue(data) {

    this.update();
  }

  update() {
		if (!this.built) return;

    var node = this.channel.node.id;
    var channel = this.channel.channel;


		var c = this.canvas[0];
		var ctx = c.getContext("2d");

		// keep width updated
		var w = this.ui.width();
		ctx.canvas.width = w;
    var h = this.ui.height();

    // fetch params
    var packets = this.state.getParamValues(node, channel, 10, [0,0,0]);
		var rates = this.state.getParamValues(node, channel, 11, [0,0,0]);

    // render graph
    // -------------------------------------------------------------------------
    var w1 = w;
		var cx = w1/2;

		ctx.fillStyle = '#343a40';
		ctx.fillRect(0,0,w1,h);

    // overlay packet counters
    this.drawValue(5,0,'Sent', packets[0].toFixed(0));
    this.drawValue(5,40,'', rates[0].toFixed(1) + '/s');

    this.drawValue(w/4,0,'Received', packets[1].toFixed(0));
    this.drawValue(w/4,40,'', rates[1].toFixed(1) + '/s');

    this.drawValue(w/2,0,'Rejected', packets[2].toFixed(0));
		this.drawValue(w/2,40,'', rates[2].toFixed(1) + '/s');
  }

	build() {
		this.built = true;

		this.ui = $('<div class="UDPTelemetry text-center"></div>');
    this.canvas = $('<canvas height=100 />');

		this.ui.append(this.canvas);
    this.channel.interfaceTab.append(this.ui);

    this.built = true;

    this.update();
  }
}
