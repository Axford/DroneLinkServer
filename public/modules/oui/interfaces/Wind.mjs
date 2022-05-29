import loadStylesheet from '../../loadStylesheet.js';
import * as DLM from '../../droneLinkMsg.mjs';


function drawPill(ctx, label, x, y, w, color) {
  ctx.fillStyle = color;
	// draw pill
	var r = 8;
	var x1 = x - w/2 + r;
	var x2 = x + w/2 - r;

	ctx.beginPath();
	ctx.arc(x1, y+r, r, 0, 2 * Math.PI);
	ctx.fill();

	ctx.beginPath();
	ctx.fillRect(x1,y, w - 2*r, 2*r);

	ctx.beginPath();
	ctx.arc(x2, y + r, r, 0, 2 * Math.PI);
	ctx.fill();

	// draw label
  ctx.textAlign = 'center';
  ctx.font = '12px sans-serif';
	ctx.fillStyle = '#fff';
  ctx.fillText(label, x, y+12);
}


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

		// wind in local coordinates
		var localWind = this.state.getParamValues(node, channel, 10, [0])[0];
    var localWind2 = (localWind - 90) * Math.PI / 180;


    // render world compass
    // -------------------------------------------------------------------------
    var w1 = w/2;
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

		drawPill(ctx, 'World', cx, 5, w1*0.8, '#585');


		// render local compass
    // -------------------------------------------------------------------------
    w1 = w/2;
		cx = w/2 + w1/2;

		ctx.fillStyle = '#343a40';
		ctx.fillRect(w1,0,w,h);

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
    ctx.moveTo(cx + 30*Math.cos(localWind2), 100 + 30*Math.sin(localWind2));
    ctx.lineTo(cx + 90*Math.cos(localWind2), 100 + 90*Math.sin(localWind2) );
    ctx.stroke();

    ctx.fillStyle = '#5F5';
    ctx.font = '20px bold serif';
		ctx.textAlign = 'center';
    ctx.fillText(localWind.toFixed(0) + '°', cx, 106);

		drawPill(ctx, 'Local', cx, 5, w1*0.8, '#558');
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
