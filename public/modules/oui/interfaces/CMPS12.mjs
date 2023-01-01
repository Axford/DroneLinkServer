import ModuleInterface from './ModuleInterface.mjs';
import loadStylesheet from '../../loadStylesheet.js';
import * as DLM from '../../droneLinkMsg.mjs';


export default class CMPS12 extends ModuleInterface {
	constructor(channel, state) {
    super(channel, state);
	}

	onParamValue(data) {
    if (!this.built) return;

		// heading
		if (data.param == 10 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_FLOAT) {
			// pass onto node for mapping
			this.channel.node.updateMapParam('heading', 3, data.values, this.channel.channel, 10);
		}

    this.updateNeeded = true;
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
    var heading = this.state.getParamValues(node, channel, 10, [0])[0];
    var h2 = (heading - 90) * Math.PI / 180;

    var rawVector = this.state.getParamValues(node, channel, 13, [0,0]);
		var trim = this.state.getParamValues(node, channel, 12, [0]);


    // render compass
    // -------------------------------------------------------------------------
    var w1 = w/2;
		var cx = w1/2;

		ctx.fillStyle = '#343a40';
		ctx.fillRect(0,0,w1,h);

		// background circles
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, 100, 80, 0, 2 * Math.PI);
    ctx.stroke();
		ctx.beginPath();
    ctx.arc(cx, 100, 30, 0, 2 * Math.PI);
    ctx.stroke();

		// ticks
    ctx.beginPath();
    for (var i =0; i<12; i++) {
      var ang = (i*30) * Math.PI / 180;
      ctx.moveTo(cx + 80*Math.cos(ang), 100 + 80*Math.sin(ang));
      ctx.lineTo(cx + 90*Math.cos(ang), 100 + 90*Math.sin(ang) );
    }
    ctx.stroke();

		// heading
    ctx.strokeStyle = '#5F5';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(cx + 30*Math.cos(h2), 100 + 30*Math.sin(h2));
    ctx.lineTo(cx + 90*Math.cos(h2), 100 + 90*Math.sin(h2) );
    ctx.stroke();

    ctx.fillStyle = '#5F5';
    ctx.font = '20px bold serif';
		ctx.textAlign = 'center';
    ctx.fillText(heading.toFixed(0) + '°', cx, 106);


    // render artificial horizons
    // -------------------------------------------------------------------------
    w1 = w/2;
		cx = w/2 + w1/2;

		ctx.fillStyle = '#343a40';
		ctx.fillRect(w/2,0,w1,h);

    this.drawLabel( 'Pitch', w/2, 0, w1, 20);
    this.drawMeterValue(rawVector[0].toFixed(0), w/2, 25, w1, 30, '#5f5', 24);

    this.drawLabel( 'Roll', w/2, h/2, w1, 20);
    this.drawMeterValue(rawVector[1].toFixed(0), w/2, h/2+25, w1, 30, '#5f5', 24);
  }

	build() {
		super.build('CMPS12');
    this.canvas = $('<canvas height=200 />');

		this.ui.append(this.canvas);

    super.finishBuild();
  }
}
