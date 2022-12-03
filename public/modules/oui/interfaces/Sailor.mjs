import loadStylesheet from '../../loadStylesheet.js';
import * as DLM from '../../droneLinkMsg.mjs';


//loadStylesheet('./css/modules/interfaces/Sailor.css');

function radiansToDegrees(a) {
  return a * 180 / Math.PI;
}

function degreesToRadians(a) {
  return a * Math.PI / 180;
}


function drawLabelledHand(ctx, ang, label, r1, r2, color) {
  var angR = (ang - 90) * Math.PI / 180;

  var cx = ctx.canvas.width / 2;

  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(cx + r1*Math.cos(angR), 100 + r1*Math.sin(angR));
  ctx.lineTo(cx + r2*Math.cos(angR), 100 + r2*Math.sin(angR) );
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.font = '15px Arial';
  ctx.textAlign = 'left';
  //ctx.fillText(ang.toFixed(0) + '°', 10, 25);
  ctx.fillText(label, cx + 4 + r2*Math.cos(angR), 100 + r2*Math.sin(angR));
}

function drawLabel(ctx, v, label, x, y, color) {
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.font = '12px serif';
  ctx.fillText(label, x, y+12);
  ctx.font = '20px bold serif';
  ctx.fillText(v, x, y+35);
}

export default class Sailor {
	constructor(channel, state) {
    this.channel = channel;
    this.state = state;
    this.built = false;
	}

  update() {
    if (!this.built) return;

    var node = this.channel.node.id;
    var channel = this.channel.channel;

    // redraw canvas
		var target = this.state.getParamValues(node, channel, 8, [0])[0];
    var t2 = (target - 90) * Math.PI / 180;

    var heading = this.state.getParamValues(node, channel, 10, [0])[0];
    var h2 = (heading - 90) * Math.PI / 180;

    var wind = this.state.getParamValues(node, channel, 12, [0])[0];

    var crosstrack = this.state.getParamValues(node, channel, 14, [0])[0];

    var course = this.state.getParamValues(node, channel, 16, [0])[0];

    var polar = this.state.getParamValues(node, channel, 18, [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0])


    var speed1 = this.state.getParamValues(node, channel, 19, [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0])
    var speed2 = this.state.getParamValues(node, channel, 20, [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0])

    var sheet = this.state.getParamValues(node, channel, 17, [0])[0];
    var flags = this.state.getParamValues(node, channel, 21, [0,0,0]);

    var wing = this.state.getParamValues(node, channel, 22, [0])[0];

    var c = this.canvas[0];
    var ctx = c.getContext("2d");

    // keep width updated
    var w = this.ui.width();
    ctx.canvas.width = w;
    var cx = w/2;

    ctx.fillStyle = '#343a40';
    ctx.fillRect(0,0,w,200);

    // draw polar
    ctx.strokeStyle = '#55f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx,100);
    var r = 0;
    for (var i =0; i<32; i++) {
      var ang = wind + (180/32) + (i*(180/16)) - 90;
      ang = ang * Math.PI / 180;
      if ( i<16) {
        r = 30 + 50 * polar[i] /255;
      } else {
        r = 30 + 50 * polar[31-i] /255;
      }
      ctx.lineTo(cx + r*Math.cos(ang), 100 + r*Math.sin(ang) );
    }
    ctx.stroke();

    // draw speed
    ctx.strokeStyle = '#ff0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx,100);
    var r = 0;
    for (var i =0; i<32; i++) {
      var ang = wind + (180/32) + (i*(180/16)) - 90;
      ang = ang * Math.PI / 180;
      if ( i<16) {
        r = 30 + 50 * speed1[i] /255;
      } else {
        r = 30 + 50 * speed2[i-16] /255;
      }
      ctx.lineTo(cx + r*Math.cos(ang), 100 + r*Math.sin(ang) );
    }
    ctx.stroke();

    // fill central region
    ctx.beginPath();
    ctx.arc(cx, 100, 30, 0, 2 * Math.PI);
    ctx.fill();

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, 100, 80, 0, 2 * Math.PI);
    ctx.stroke();
		ctx.beginPath();
    ctx.arc(cx, 100, 30, 0, 2 * Math.PI);
    ctx.stroke();

    // draw ticks
    ctx.beginPath();
    for (var i =0; i<12; i++) {
      var ang = (i*30) * Math.PI / 180;
      ctx.moveTo(cx + 80*Math.cos(ang), 100 + 80*Math.sin(ang));
      ctx.lineTo(cx + 90*Math.cos(ang), 100 + 90*Math.sin(ang) );
    }
    ctx.stroke();

		// hands
    drawLabelledHand(ctx, heading, '', 30,90, '#5F5');
    drawLabelledHand(ctx, target, '', 30, 90, '#FF5');
    drawLabelledHand(ctx, course, '', 30, 90, '#5FF');
    drawLabelledHand(ctx, wind, '', 60, 110, '#55F');

    // draw estimated wing orientation
    if (wing != 0) {
      var wingAng = wind + 180 - wing * 30;
      drawLabelledHand(ctx, wingAng, '', 30, 110, '#F55');
    }

    // legend - top right
		ctx.textAlign = 'right';
    ctx.font = '12px serif';
    ctx.fillStyle = '#5F5';
    ctx.fillText('Heading', w-5, 12);
    ctx.fillStyle = '#FF5';
    ctx.fillText('Target', w-5, 26);
    ctx.fillStyle = '#5FF';
    ctx.fillText('Course', w-5, 40);
    ctx.fillStyle = '#55F';
    ctx.fillText('Wind', w-5, 54);
    if (wing != 0) {
      ctx.fillStyle = '#F55';
      ctx.fillText('Wing', w-5, 68);
    }
    

    // sheet - center
    ctx.fillStyle = '#FFF';
    ctx.font = '20px bold serif';
		ctx.textAlign = 'center';
    ctx.fillText(sheet.toFixed(1), cx, 110);
    ctx.font = '12px serif';
    ctx.fillText('Sheet', cx, 92);

    // crosstack  -top left
    drawLabel(ctx, crosstrack.toFixed(1), 'Crosstrack', 5, 0, '#fff');

    // flags
    drawLabel(ctx, flags[0] > 0 ? 'Starboard' : 'Port', 'Tack', 5, 50, '#fff');
    drawLabel(ctx, flags[1] > 0 ? 'Y' : 'N', 'Locked?', 5, 100, '#fff');
    drawLabel(ctx, flags[2] > 0 ? 'Y' : 'N', 'Last CT+', 5, 150, '#fff');

  }


  onParamValue(data) {

    // heading
		if (data.param == 10 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_FLOAT) {
			// pass onto node for mapping
		  this.channel.node.updateMapParam('heading', 2, data.values, this.channel.channel, 10);
		}

    // heading
		if (data.param == 12 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_FLOAT) {
			// pass onto node for mapping
		  this.channel.node.updateMapParam('wind', 2, data.values, this.channel.channel, 12);
		}

    this.update();
  }


	build() {
    this.ui = $('<div class="Sailor text-center"></div>');
    this.canvas = $('<canvas height=200 />');
    this.canvas.on('click', (e)=>{
      //  manually adjust target on click

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
			qm.param = 8;
			qm.setFloat([ ang ]);
			this.state.send(qm);

      var qm = new DLM.DroneLinkMsg();
			qm.node = this.channel.node.id;
			qm.channel = this.channel.channel;
			qm.param = 8;
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
