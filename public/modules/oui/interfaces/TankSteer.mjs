import loadStylesheet from '../../loadStylesheet.js';
import * as DLM from '../../droneLinkMsg.mjs';

import { degreesToRadians, radiansToDegrees } from '../../navMath.mjs';


export default class TankSteer {
	constructor(channel, state) {
    this.channel = channel;
    this.state = state;
    this.built = false;
	}

	onParamValue(data) {
    // heading
		if (data.param == 22 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_FLOAT) {
			// pass onto node for mapping
		  this.channel.node.updateMapParam('heading', 2, data.values, this.channel.channel, 22);
		}

    this.update();
  }

  update() {
		if (!this.built || this.ui.height()<=0) return;

    var node = this.channel.node.id;
    var channel = this.channel.channel;

    // fetch params
		var left =  this.state.getParamValues(node, channel, 8, [0])[0];
    var right =  this.state.getParamValues(node, channel, 9, [0])[0];
		var distance =  this.state.getParamValues(node, channel, 24, [0])[0];
    var targetHeading = this.state.getParamValues(node, channel, 20, [0])[0];
    var currentHeading = this.state.getParamValues(node, channel, 22, [0])[0];

    // prep canvas
		var c = this.canvas[0];
		var ctx = c.getContext("2d");

		// keep width updated
		var w = this.ui.width();
		ctx.canvas.width = w;
		var cx = w/2;
    var h = this.ui.height()-15;

		ctx.fillStyle = '#343a40';
		ctx.fillRect(0,0,w,h);

    var bw = 20; // barwidth
    var bh = h - 20;
    var cw = w - 2*(bw + 20); // center width
    var ch = bh;

    // left
    ctx.strokeStyle = "#aaa";
    var x1 = 10;
    var x2 = x1+bw;
    var y1 = 10;
    var y2 = y1 + bh;
    ctx.strokeStyle = "#aaa";
    ctx.lineWidth = "1";
    ctx.beginPath();
    ctx.rect(x1,y1,bw,bh);
    ctx.stroke();
    // fill to show level
    ctx.strokeStyle = "#5f5";
    ctx.fillStyle = "#5f5";
    ctx.beginPath();
    var by1 = (y1+bh/2) - left * (bh/2);
    var by2 = (y1+bh/2);
    ctx.fillRect(x1,by1,bw,by2-by1);

    // right
    ctx.strokeStyle = "#aaa";
    x1 = w-10-bw;
    x2 = x1+bw;
    ctx.strokeStyle = "#aaa";
    ctx.lineWidth = "1";
    ctx.beginPath();
    ctx.rect(x1,y1,bw,bh);
    ctx.stroke();
    // fill to show level
    ctx.strokeStyle = "#5f5";
    ctx.fillStyle = "#5f5";
    ctx.beginPath();
    by1 = (y1+bh/2) - right * (bh/2);
    by2 = (y1+bh/2);
    ctx.fillRect(x1,by1,bw,by2-by1);

    // calc scaling for radius
    var rMax = Math.min(w/2, h/2) * 0.9;
    var r = rMax * (Math.min(distance,50) / 50);

    // center vector plot
    // -------------------------------------------------
    // draw current bounds
    var bx1 = w/2 - rMax;
    var bx2 = w/2 + rMax;
    var by1 = h/2 - rMax;
    var by2 = h/2 + rMax;
    
    // cross hair
    ctx.strokeStyle = '#aaa';
    ctx.lineWidth = 1;
    // x
    ctx.beginPath();
    ctx.moveTo(bx1, (by1+by2)/2);
    ctx.lineTo(bx2, (by1+by2)/2);
    ctx.stroke();
    // y
    ctx.beginPath();
    ctx.moveTo((bx1+bx2)/2, by1);
    ctx.lineTo((bx1+bx2)/2, by2);
    ctx.stroke();
    

    // outer ring
    ctx.strokeStyle = "#aaa";
    ctx.lineWidth = "1";
    ctx.beginPath();
    ctx.arc(w/2, h/2, rMax, 0, 2*Math.PI);
    ctx.stroke();

    // draw current vector
    var ang = currentHeading;
    var vx = w/2 + r * Math.cos(degreesToRadians(ang-90));
    var vy = h/2 + r * Math.sin(degreesToRadians(ang-90));

    //var vx = w/2 + turnRate * cw/2;
    //var vy = h/2 - speed * ch/2;

    ctx.strokeStyle = '#5f5';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo((bx1+bx2)/2, (by1+by2)/2);
    ctx.lineTo(vx, vy);
    ctx.stroke();

    // draw target vector
    ang = targetHeading;
    vx = w/2 + r * Math.cos(degreesToRadians(ang-90));
    vy = h/2 + r * Math.sin(degreesToRadians(ang-90));

    //var vx = w/2 + turnRate * cw/2;
    //var vy = h/2 - speed * ch/2;

    ctx.strokeStyle = '#5ff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo((bx1+bx2)/2, (by1+by2)/2);
    ctx.lineTo(vx, vy);
    ctx.stroke();

    ctx.fillStyle = '#FFF';
    ctx.font = '12px serif';
		ctx.textAlign = 'left';
    ctx.fillText(distance.toFixed(0) + 'm', vx+5, vy);

  }

	build() {
		this.built = true;

		this.ui = $('<div class="TankSteer text-center"></div>');

		this.modeSelect = $('<select class="tankSteerModeSelect"></select>');
    // add mode options
    this.modeSelect.append($('<option value="0">Manual</option>'));
    this.modeSelect.append($('<option value="1">Automatic</option>'));
    this.modeSelect.change((e)=>{
      // get value
      var newMode = this.modeSelect.val();

			var qm = new DLM.DroneLinkMsg();
			qm.node = this.channel.node.id;
			qm.channel = this.channel.channel;
			qm.param = 10;
			qm.setUint8([ newMode ]);
			this.state.send(qm);

      var qm = new DLM.DroneLinkMsg();
			qm.node = this.channel.node.id;
			qm.channel = this.channel.channel;
			qm.param = 10;
      qm.msgType = DLM.DRONE_LINK_MSG_TYPE_QUERY;
			this.state.send(qm);
    });

    this.ui.append(this.modeSelect);

    this.canvas = $('<canvas height=200 />');
    this.canvas.on('click', (e)=>{

      var node = this.channel.node.id;
      var channel = this.channel.channel;

			var offsetX = $( e.target ).offset().left;
			var offsetY = $( e.target ).offset().top;
			var w = $(e.target).innerWidth();
			var h = $(e.target).innerHeight();

      var rMax = Math.min(w/2, h/2) * 0.9;

			var x = (e.pageX - offsetX) - w/2;
			var y = (e.pageY - offsetY) - h/2;

      var currentHeading = this.state.getParamValues(node, channel, 22, [0])[0];

      // convert to angle / distance
      var ang = radiansToDegrees(Math.atan2(y,x)) + 90;
      var targetHeading = ang;

      var distance = 50 * Math.sqrt(x*x, y*y) / rMax;

      // 20 = target, 24 = distance

			var qm = new DLM.DroneLinkMsg();
			qm.node = this.channel.node.id;
			qm.channel = this.channel.channel;
			qm.param = 20;
			qm.setFloat([ targetHeading ]);
			this.state.send(qm);

      var qm = new DLM.DroneLinkMsg();
			qm.node = this.channel.node.id;
			qm.channel = this.channel.channel;
			qm.param = 20;
      qm.msgType = DLM.DRONE_LINK_MSG_TYPE_QUERY;
			this.state.send(qm);

			var qm = new DLM.DroneLinkMsg();
			qm.node = this.channel.node.id;
			qm.channel = this.channel.channel;
			qm.param = 24;
			qm.setFloat([ distance ]);
			this.state.send(qm);

      var qm = new DLM.DroneLinkMsg();
			qm.node = this.channel.node.id;
			qm.channel = this.channel.channel;
			qm.param = 24;
      qm.msgType = DLM.DRONE_LINK_MSG_TYPE_QUERY;
			this.state.send(qm);
      
		});

		this.ui.append(this.canvas);
    this.channel.interfaceTab.append(this.ui);

    this.built = true;

    this.update();
  }
}
