import loadStylesheet from '../../loadStylesheet.js';
import * as DLM from '../../droneLinkMsg.mjs';


export default class Wind {
	constructor(channel, state) {
    this.channel = channel;
    this.state = state;
    this.built = false;

    this.rawVectors = [];  // history of raw vector values
	}

	onParamValue(data) {

		// heading
		if (data.param == 14 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_FLOAT) {
			// pass onto node for mapping
			this.channel.node.updateMapParam('wind', 3, data.values, this.channel.channel, 14);
		}

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

    // fetch params - wind in global coords
    var wind = this.state.getParamValues(node, channel, 14, [0])[0];
    var wind2 = (wind - 90) * Math.PI / 180;


    // render compass
    // -------------------------------------------------------------------------
    var w1 = w;
		var cx = w1/2;

		ctx.fillStyle = '#343a40';
		ctx.fillRect(0,0,w1,h);

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, 100, 80, 0, 2 * Math.PI);
    ctx.stroke();
		ctx.beginPath();
    ctx.arc(cx, 100, 30, 0, 2 * Math.PI);
    ctx.stroke();

    ctx.beginPath();
    for (var i =0; i<12; i++) {
      var ang = (i*30) * Math.PI / 180;
      ctx.moveTo(cx + 80*Math.cos(ang), 100 + 80*Math.sin(ang));
      ctx.lineTo(cx + 90*Math.cos(ang), 100 + 90*Math.sin(ang) );
    }
    ctx.stroke();

		// wind
    ctx.strokeStyle = '#5F5';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(cx + 30*Math.cos(wind2), 100 + 30*Math.sin(wind2));
    ctx.lineTo(cx + 90*Math.cos(wind2), 100 + 90*Math.sin(wind2) );
    ctx.stroke();

    ctx.fillStyle = '#5F5';
    ctx.font = '20px bold serif';
		ctx.textAlign = 'center';
    ctx.fillText(wind.toFixed(0) + '°', cx, 106);
  }

	build() {
		this.built = true;

		this.ui = $('<div class="HMC5883L text-center"></div>');
    this.canvas = $('<canvas height=200 />');

		this.ui.append(this.canvas);
    this.channel.interfaceTab.append(this.ui);

    this.built = true;

    this.update();
  }
}
