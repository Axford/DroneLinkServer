import loadStylesheet from '../../loadStylesheet.js';
import * as DLM from '../../droneLinkMsg.mjs';


export default class NMEA {
	constructor(channel, state) {
    this.channel = channel;
    this.state = state;
    this.built = false;

    this.rawVectors = [];  // history of raw correction vector values
	}

	onParamValue(data) {

		// location
		if (data.param == 8 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_FLOAT) {
			// pass onto node for mapping
			this.channel.node.updateMapParam('location', 3, data.values, this.channel.channel, 8);
		}


    if (data.param == 20 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_FLOAT) {

			this.rawVectors.push(data.values);

      // if too many vectors, lose one
      if (this.rawVectors.length > 200) this.rawVectors.shift();
		}

		// num satellites
		if (data.param == 9 &&  (data.msgType == DLM.DRONE_LINK_MSG_TYPE_UINT8_T || data.msgType == DLM.DRONE_LINK_MSG_TYPE_FLOAT)) {
      // 9 - satellites
      var d = data.values[0];
			if (d < 4) {
				this.widget.removeClass('warning');
				this.widget.addClass('danger');
			} else if (d < 10) {
				this.widget.removeClass('danger');
				this.widget.addClass('warning');
			} else {
				this.widget.removeClass('danger');
				this.widget.removeClass('warning');
			}
      this.widgetText.html(d.toFixed(0));
    }

    this.update();
  }

  drawValue(x,y,label,v) {
    var c = this.canvas[0];
		var ctx = c.getContext("2d");

    ctx.fillStyle = '#FFF';
		ctx.textAlign = 'left';
    ctx.font = '12px serif';
    ctx.fillText(label, x, y+15);
    ctx.font = '20px bold serif';
		ctx.fillStyle = '#5f5';
    ctx.fillText(v, x, y+35);
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
    var location = this.state.getParamValues(node, channel, 8, [0,0,0]);
    var satellites = this.state.getParamValues(node, channel, 9, [0])[0];
		var speed = this.state.getParamValues(node, channel, 11, [0])[0];
		var HDOP = this.state.getParamValues(node, channel, 12, [0])[0];
    var correction = this.state.getParamValues(node, channel, 20, [0,0,0,0]);


    // render vector view
    // -------------------------------------------------------------------------
    var w2 = w/2;
    var x2 = w2;
    var cx2 = x2 + w2/2;

    ctx.fillStyle = '#343a40';
		ctx.fillRect(0,0,w,h);

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
    const scaling = (w2/2) / 0.0002;
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

    // draw latest vector
    if (this.rawVectors.length > 0) {
      var vx = cx2 + this.rawVectors[this.rawVectors.length-1][0] * scaling;
      var vy = h/2 - this.rawVectors[this.rawVectors.length-1][1] * scaling;
      ctx.strokeStyle = '#afa';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx2, h/2);
      ctx.lineTo(vx, vy);
      ctx.stroke();
    }

    // locatiion
    this.drawValue(5,0,'Location', location[0].toFixed(6) + '   '+location[1].toFixed(6));

    // correction (left)
    this.drawValue(5,40,'Satellites', satellites.toFixed(0));

		// speed (left)
    this.drawValue(w/4,40,'Speed (m/s)', speed.toFixed(1));
		this.drawValue(w/4,80,'Speed (knots)', (speed * 1.94384).toFixed(1));

    // correction (left)
    this.drawValue(5,80,'HDOP', HDOP);

    // correction (left)
    this.drawValue(5,120,'Correction (m)', correction[3].toFixed(1));
  }

	build() {
		this.built = true;

		this.ui = $('<div class="NMEA text-center"></div>');
    this.canvas = $('<canvas height=160 />');

		this.ui.append(this.canvas);
    this.channel.interfaceTab.append(this.ui);

		// widget
		this.widget = $('<div class="widget"><i class="fas fa-satellite-dish"></i></div>');
		this.channel.node.addWidget(this.widget);

		this.widgetText = $('<span>?</span>');
		this.widget.append(this.widgetText);

    this.built = true;

    this.update();
  }
}
