import ModuleInterface from './ModuleInterface.mjs';
import loadStylesheet from '../../loadStylesheet.js';
import * as DLM from '../../droneLinkMsg.mjs';


export default class UDPTelemetry extends ModuleInterface {
	constructor(channel, state) {
    super(channel, state);
	}


  update() {
		if (!super.update()) return;

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
		super.build('UDPTelemetry');
    this.canvas = $('<canvas height=100 />');

		this.ui.append(this.canvas);
    
    super.finishBuild();
  }
}
