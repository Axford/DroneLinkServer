import ModuleInterface from './ModuleInterface.mjs';
import loadStylesheet from '../../loadStylesheet.js';
import * as DLM from '../../droneLinkMsg.mjs';


export default class NMEA extends ModuleInterface {
	constructor(channel, state) {
    super(channel, state);

    this.rawVectors = [];  // history of raw correction vector values
	}

	onParamValue(data) {
    if (!this.built) return;

		// location
		if (data.param == 8 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_FLOAT) {
			// pass onto node for mapping
			this.channel.node.updateMapParam('location', 3, data.values, this.channel.channel, 8);
		}

    // location2
		if (data.param == 18 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_FLOAT) {
			// pass onto node for mapping
			this.channel.node.updateMapParam('location2', 3, data.values, this.channel.channel, 18);
		}

    // heading
		if (data.param == 10 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_FLOAT) {
			// pass onto node for mapping
			this.channel.node.updateMapParam('heading', 1, data.values, this.channel.channel, 10);
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
    var location = this.state.getParamValues(node, channel, 8, [0,0,0]);
    var satellites = this.state.getParamValues(node, channel, 9, [0])[0];
		var speed = this.state.getParamValues(node, channel, 11, [0])[0];
		var HDOP = this.state.getParamValues(node, channel, 12, [0])[0];
    var correction = this.state.getParamValues(node, channel, 20, [0,0,0,0]);
    var heading = this.state.getParamValues(node, channel, 10, [0])[0];
    var h2 = (heading - 90) * Math.PI / 180;



    /*

      Render heading view... i.e. GPS Compass

    */
      var w1 = w/2;
      var cx = w1 + w1/2;
      var cy = h / 2;

      var r1 = h/2 - 30;
      var r2 = 0.4*r1;
      
      ctx.fillStyle = '#343a40';
      ctx.fillRect(0,0,w,h);
  
      // background circles
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, r1, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, r2, 0, 2 * Math.PI);
      ctx.stroke();
  
      // ticks
      ctx.beginPath();
      for (var i =0; i<12; i++) {
        var ang = (i*30) * Math.PI / 180;
        ctx.moveTo(cx + r1*Math.cos(ang), cy + r1*Math.sin(ang));
        ctx.lineTo(cx + (r1+10)*Math.cos(ang), cy + (r1+10)*Math.sin(ang) );
      }
      ctx.stroke();
  
      // heading
      ctx.strokeStyle = '#5F5';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(cx + r2*Math.cos(h2), cy + r2*Math.sin(h2));
      ctx.lineTo(cx + (r1+10)*Math.cos(h2), cy + (r1+10)*Math.sin(h2) );
      ctx.stroke();
  
      ctx.fillStyle = '#5F5';
      ctx.font = '20px bold serif';
      ctx.textAlign = 'center';
      ctx.fillText(heading.toFixed(0) + '°', cx, cy+6);
    


    // render vector view
    // -------------------------------------------------------------------------
    /*
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
    */

    // locatiion
    this.drawValue(5,0,'Location', location[0].toFixed(6) + '   '+location[1].toFixed(6));

    // correction (left)
    this.drawValue(5,40,'Satellites', satellites.toFixed(0));

		// speed (left)
    this.drawValue(w/4,40,'Speed (m/s)', (speed / 1.94384).toFixed(1));
		this.drawValue(w/4,80,'Speed (knots)', (speed).toFixed(1));

    // correction (left)
    this.drawValue(5,80,'HDOP', HDOP);

    // correction (left)
    this.drawValue(5,120,'Correction (m)', correction[3].toFixed(1));
    
  }

	build() {
		super.build('NMEA');

    this.canvas = $('<canvas height=160 />');

		this.ui.append(this.canvas);

		// widget
		this.widget = $('<div class="widget"><i class="fas fa-satellite-dish"></i></div>');
		this.channel.node.addWidget(this.widget);

		this.widgetText = $('<span>?</span>');
		this.widget.append(this.widgetText);

    super.finishBuild();
  }
}
