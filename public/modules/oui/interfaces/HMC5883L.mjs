import loadStylesheet from '../../loadStylesheet.js';
import * as DLM from '../../droneLinkMsg.mjs';


export default class HMC5883L {
	constructor(channel, state) {
    this.channel = channel;
    this.state = state;
    this.built = false;

    this.rawVectors = [];  // history of raw vector values
	}

	onParamValue(data) {

		// heading
		if (data.param == 11 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_FLOAT) {
			// pass onto node for mapping
			this.channel.node.updateMapParam('heading', 3, data.values, this.channel.channel, 11);
		}

    if (data.param == 10 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_FLOAT) {

			this.rawVectors.push(data.values);

      //console.log('new compass vector: ',this.rawVectors);

      // if too many vectors, lose one
      if (this.rawVectors.length > 200) this.rawVectors.shift();
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

    // fetch params
    var heading = this.state.getParamValues(node, channel, 11, [0])[0];
    var h2 = (heading - 90) * Math.PI / 180;

    var rawVector = this.state.getParamValues(node, channel, 10, [0]);
    var calibX = this.state.getParamValues(node, channel, 13, [0,0,0]);
    var calibY = this.state.getParamValues(node, channel, 14, [0,0,0]);
		var limits = this.state.getParamValues(node, channel, 18, [0,0,0,0]);
		var samples = this.state.getParamValues(node, channel, 19, [0,0,0,0]);
		var trim = this.state.getParamValues(node, channel, 15, [0]);

    // render vector view
    // -------------------------------------------------------------------------
    var w2 = w/2;
    var x2 = w2;
    var cx2 = x2 + w2/2;

    ctx.fillStyle = '#343a40';
		ctx.fillRect(x2,0,w2,h);

    // axes
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 1;
    // x
    ctx.beginPath();
    ctx.moveTo(x2, h/2);
    ctx.lineTo(x2 + w2, h/2);
    ctx.stroke();
    // y
    ctx.beginPath();
    ctx.moveTo(cx2, 0);
    ctx.lineTo(cx2, h);
    ctx.stroke();


    // draw rawVectors
    ctx.fillStyle = '#55f';
    ctx.strokeStyle = "#aaf";

		// update maxVal
		var maxVal = 1;
		maxVal = Math.max(maxVal, Math.abs(calibX[0]));
		maxVal = Math.max(maxVal, Math.abs(calibX[2]));
		maxVal = Math.max(maxVal, Math.abs(calibY[0]));
		maxVal = Math.max(maxVal, Math.abs(calibY[2]));

    var scaling = 1;
		if (w2 < h) {
			scaling = 0.8 * (w2/2) / maxVal;
		} else {
			scaling = 0.8 * (h/2) / maxVal;
		}

    for (var i=0; i<this.rawVectors.length; i++) {
      if (i == this.rawVectors.length-1) {
        ctx.fillStyle = '#afa';
        ctx.strokeStyle = "#afa";
      }
      var x = cx2 + this.rawVectors[i][0] * scaling;
      var y = h/2 - this.rawVectors[i][1] * scaling;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
    }

		//
		var bcx = cx2 + calibX[1] * scaling;
		var bcy = h/2 - calibY[1] * scaling;

    // draw limits
    var bx1 = cx2 + limits[3] * scaling;
    var bx2 = cx2 + limits[1] * scaling;
    var by1 = h/2 - limits[0] * scaling;
    var by2 = h/2 - limits[2] * scaling;
    // x
    ctx.strokeStyle = "#f00";
    ctx.lineWidth = "2";
    ctx.beginPath();
    //ctx.rect(bx1,by1,bx2-bx1,by2-by1);
		ctx.ellipse((bx1+bx2)/2, (by1+by2)/2, (bx2-bx1)/2, (by2-by1)/2, 0, 0, 2 * Math.PI);
    ctx.stroke();

		// draw bounds
     bx1 = cx2 + calibX[0] * scaling;
     bx2 = cx2 + calibX[2] * scaling;
     by1 = h/2 - calibY[0] * scaling;
     by2 = h/2 - calibY[2] * scaling;
    // x
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = "1";
    ctx.beginPath();
    ctx.rect(bx1,by1,bx2-bx1,by2-by1);
    ctx.stroke();

    // draw centre of bounds
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    // x
    ctx.beginPath();
    ctx.moveTo(bx1, bcy);
    ctx.lineTo(bx2, bcy);
    ctx.stroke();
    // y
    ctx.beginPath();
    ctx.moveTo(bcx, by1);
    ctx.lineTo(bcx, by2);
    ctx.stroke();


    // draw latest vector
    if (this.rawVectors.length > 0) {
      var vx = cx2 + this.rawVectors[this.rawVectors.length-1][0] * scaling;
      var vy = h/2 - this.rawVectors[this.rawVectors.length-1][1] * scaling;
      ctx.strokeStyle = '#afa';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(bcx, bcy);
      ctx.lineTo(vx, vy);
      ctx.stroke();
    }


    // render compass
    // -------------------------------------------------------------------------
    var w1 = w/2;
		var cx = w1/2;

		ctx.fillStyle = '#343a40';
		ctx.fillRect(0,0,w1,h);

		// calibration markers (based on samples)
		for (var i=0; i<4; i++) {
			var ang = ((trim + 360-i*90) - 90) * Math.PI / 180;

			ctx.strokeStyle = samples[i] > 100 ? '#0a0' : '#555';
	    ctx.lineWidth = Math.min(samples[i], 100) / 5;
	    ctx.beginPath();
	    ctx.arc(cx, 100, 90, ang-0.4, ang+0.4);
	    ctx.stroke();
		}

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
