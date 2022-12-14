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


export default class TurnRate {
	constructor(channel, state) {
    this.channel = channel;
    this.state = state;
    this.built = false;
	}

	onParamValue(data) {
		// heading
		if (data.param == 12 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_FLOAT) {
			// pass onto node for mapping
			this.channel.node.updateMapParam('heading', 1, data.values, this.channel, 12);
		}

    this.update();
  }

  update() {
		if (!this.built) return;

    var node = this.channel.node.id;
    var channel = this.channel.channel;

    // redraw canvas

		var turnRate =  this.state.getParamValues(node, channel, 16, [0])[0];

		var target =  this.state.getParamValues(node, channel, 10, [0])[0];
    var t2 = (target - 90) * Math.PI / 180;

    var heading = this.state.getParamValues(node, channel, 12, [0])[0];
    var h2 = (heading - 90) * Math.PI / 180;

		var mode =  this.state.getParamValues(node, channel, 19, [0])[0];

		var turnRateThreshold = this.state.getParamValues(node, channel, 17, [20])[0]

		var c = this.canvas[0];
		var ctx = c.getContext("2d");

		// keep width updated
		var w = this.ui.width();
		ctx.canvas.width = w;
		var cx = w/2;
		var h = 200;

		// background
		ctx.fillStyle = '#343a40';
		ctx.fillRect(0,0,w,200);

		// draw giant turnRate arrow
		/*
		var x1 = (w/2) * turnRate;
		ctx.fillStyle = '#0a0';
    ctx.beginPath();
    ctx.moveTo(cx,h/2-40);
		ctx.lineTo(cx + x1*0.7, h/2-40);
		ctx.lineTo(cx + x1, h/2);
		ctx.lineTo(cx + x1*0.7, h/2+40);
		ctx.lineTo(cx, h/2+40);
		ctx.lineTo(cx, h/2-40);
    ctx.fill();
*/

		// target threshold
		var ang1 = (target -turnRateThreshold - 90) * Math.PI / 180;
		var ang2 = (target +turnRateThreshold - 90) * Math.PI / 180;
		ctx.fillStyle = '#660';
		ctx.beginPath();
		ctx.arc(cx,100, 90, ang1, ang2, false);
		ctx.arc(cx,100, 30, ang2, ang1, true);
		ctx.fill();

		// turn rate arc
		ctx.beginPath();
		ctx.arc(cx, 100, 80, h2, h2 + turnRate, turnRate < 0);
		ctx.lineTo(cx + 65*Math.cos(h2+1.1*turnRate), 100 + 65*Math.sin(h2+1.1*turnRate));
		ctx.arc(cx, 100, 50, h2 + turnRate, h2, turnRate > 0);
		ctx.fillStyle = mode == 2 ? '#c55' : '#0a0';
		ctx.fill();

		// background circles (axes)
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, 100, 80, 0, 2 * Math.PI);
    ctx.stroke();
		ctx.beginPath();
    ctx.arc(cx, 100, 30, 0, 2 * Math.PI);
    ctx.stroke();
		ctx.fillStyle = 'rgba(40,40,50,0.6)';
		ctx.fill();

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

		// target
    ctx.strokeStyle = '#FF5';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(cx + 30*Math.cos(t2), 100 + 30*Math.sin(t2));
    ctx.lineTo(cx + 90*Math.cos(t2), 100 + 90*Math.sin(t2) );
    ctx.stroke();


		ctx.fillStyle = '#8F8';
		ctx.textAlign = 'left';
    ctx.font = '12px serif';
    ctx.fillText('Heading', 5, 12);
    ctx.font = '20px bold serif';
    ctx.fillText(heading.toFixed(0) + '°', 5, 35);

		ctx.fillStyle = '#FF8';
		ctx.textAlign = 'right';
		ctx.font = '12px serif';
    ctx.fillText('Target', w-5, 12);
		ctx.font = '20px serif';
    ctx.fillText(target.toFixed(0) + '°', w-5, 35);

		ctx.fillStyle = '#FFF';
    ctx.font = '20px bold serif';
		ctx.textAlign = 'center';
    ctx.fillText(turnRate.toFixed(1), cx, 105);

		// draw controlMode
    var controlModeStr = 'Normal';
    var controlModeClr = '#585';
    if (mode == 2) {
      controlModeStr = 'Gybe';
      controlModeClr = '#a55';
    } else if (mode == 1) {
      controlModeStr = 'Gybe?';
      controlModeClr = '#885';
    }
    drawPill(ctx, controlModeStr, w-40, h-20, 70, controlModeClr);
  }

  build() {
	this.built = true;

	this.ui = $('<div class="TurnRate text-center"></div>');

	var normalButton = $('<button class="btn btn-sm btn-success mr-2 mb-2">Normal</button>');
    normalButton.on('click', ()=>{
      var qm = new DLM.DroneLinkMsg();
			qm.node = this.channel.node.id;
			qm.channel = this.channel.channel;
			qm.param = 19;
			qm.setUint8([ 0 ]);
			this.state.send(qm);
    });
    this.ui.append(normalButton);


    var gybeButton = $('<button class="btn btn-sm btn-danger mr-2 mb-2">Gybe</button>');
    gybeButton.on('click', ()=>{
      var qm = new DLM.DroneLinkMsg();
			qm.node = this.channel.node.id;
			qm.channel = this.channel.channel;
			qm.param = 19;
			qm.setUint8([ 2 ]);
			this.state.send(qm);
    });
    this.ui.append(gybeButton);


    this.canvas = $('<canvas height=200 />');
    this.canvas.on('click', (e)=>{
			var offsetX = $( e.target ).offset().left;
			var offsetY = $( e.target ).offset().top;
			var w = $(e.target).innerWidth();
			var h = $(e.target).innerHeight();

			var x = (e.pageX - offsetX) - w/2;
			var y = (e.pageY - offsetY) - h/2;

			var ang = 90 + Math.atan2(y,x) * 180 / Math.PI;

			console.log(x,y, ang);


			var qm = new DLM.DroneLinkMsg();
			qm.node = this.channel.node.id;
			qm.channel = this.channel.channel;
			qm.param = 10;
			qm.setFloat([ ang ]);
			this.state.send(qm);

      var qm = new DLM.DroneLinkMsg();
			qm.node = this.channel.node.id;
			qm.channel = this.channel.channel;
			qm.param = 10;
			qm.setUint8([ ang ]);
      qm.msgType = DLM.DRONE_LINK_MSG_TYPE_QUERY;
			this.state.send(qm);
		});

		this.ui.append(this.canvas);
    this.channel.interfaceTab.append(this.ui);

    this.built = true;

    this.update();
  }
}
