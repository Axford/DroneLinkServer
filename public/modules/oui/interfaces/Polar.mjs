import loadStylesheet from '../../loadStylesheet.js';
import * as DLM from '../../droneLinkMsg.mjs';


//loadStylesheet('./css/modules/interfaces/Polar.css');

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

export default class Polar {
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
    var polar = this.state.getParamValues(node, channel, 11, [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]);
    var samples = this.state.getParamValues(node, channel, 12, [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]);


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
      var ang = (180/32) + (i*(180/16)) - 90;
      ang = ang * Math.PI / 180;
      if ( i<16) {
        r = 30 + 50 * polar[i] /255;
      } else {
        r = 30 + 50 * polar[31-i] /255;
      }
      ctx.lineTo(cx + r*Math.cos(ang), 100 + r*Math.sin(ang) );
    }
    ctx.moveTo(cx,100);
    ctx.stroke();

    // draw samples bargraphs
    ctx.strokeStyle = '#5f5';
    ctx.lineWidth = 2;
    // calc max samples
    var maxSample = 0;
    for (var i =0; i<16; i++) {
      if (samples[i] > maxSample) maxSample = samples[i];
    }
    ctx.beginPath();
    ctx.moveTo(cx,100);
    var r = 0;
    for (var i =0; i<32; i++) {
      var ang = (180/32) + (i*(180/16)) - 90;
      ang = ang * Math.PI / 180;
      if ( i<16) {
        r = 30 * samples[i] / maxSample;
      } else {
        r = 30 * samples[31-i] /maxSample;
      }
      ctx.lineTo(cx + r*Math.cos(ang), 100 + r*Math.sin(ang) );
    }
    ctx.stroke();

    // circles
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

  }


  onParamValue(data) {
    this.update();
  }


	build() {
    this.ui = $('<div class="Polar text-center"></div>');
    this.canvas = $('<canvas height=200 />');

    this.ui.append(this.canvas);
    this.channel.interfaceTab.append(this.ui);

    this.built = true;

    this.update();
  }
}
