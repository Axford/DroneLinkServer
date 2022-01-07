import loadStylesheet from '../../loadStylesheet.js';
import * as DLM from '../../droneLinkMsg.mjs';


//loadStylesheet('./css/modules/interfaces/Proa.css');

function radiansToDegrees(a) {
  return a * 180 / Math.PI;
}

function degreesToRadians(a) {
  return a * Math.PI / 180;
}


function drawLabelledHand(ctx, ang, label, r1, r2, color) {
  var angR = (ang - 90) * Math.PI / 180;

  var cx = ctx.canvas.width / 2;
  var cy = ctx.canvas.height / 2;

  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(cx + r1*Math.cos(angR), cy + r1*Math.sin(angR));
  ctx.lineTo(cx + r2*Math.cos(angR), cy + r2*Math.sin(angR) );
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.font = '15px Arial';
  ctx.textAlign = 'left';
  //ctx.fillText(ang.toFixed(0) + '°', 10, 25);
  ctx.fillText(label, cx + 4 + r2*Math.cos(angR), cy + r2*Math.sin(angR));
}

function drawLabel(ctx, v, label, x, y, color) {
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.font = '12px serif';
  ctx.fillText(label, x, y+12);
  ctx.font = '20px bold serif';
  ctx.fillText(v, x, y+35);
}


export default class Proa {
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

    var left = this.state.getParamValues(node, channel, 22, [0])[0];
    left *= 90;
    var right = this.state.getParamValues(node, channel, 23, [0])[0];
    right *= 90;
    var wing = this.state.getParamValues(node, channel, 17, [0])[0];
    wing *= 90;
    var cow = this.state.getParamValues(node, channel, 24, [0])[0];

    var frameOffset = this.state.getParamValues(node, channel, 28, [0])[0];


    var c = this.canvas[0];
    var ctx = c.getContext("2d");

    // keep width updated
    var w = this.ui.width();
    ctx.canvas.width = w;
    var cx = w/2;

    var h = ctx.canvas.height;
    var cy = h/2;

    var rInner = (h/2)-40;
    var rOuter = (h/2)-10;
    var rOuter2 = rOuter + 10;


    ctx.fillStyle = '#343a40';
    ctx.fillRect(0,0,w,h);

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
        r = rInner + (rOuter-rInner) * polar[i] /255;
      } else {
        r = rInner + (rOuter-rInner) * polar[31-i] /255;
      }
      ctx.lineTo(cx + r*Math.cos(ang), cy + r*Math.sin(ang) );
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
        r = rInner + (rOuter-rInner) * speed1[i] /255;
      } else {
        r = rInner + (rOuter-rInner) * speed2[i-16] /255;
      }
      ctx.lineTo(cx + r*Math.cos(ang), cy + r*Math.sin(ang) );
    }
    ctx.stroke();

    // fill central region
    ctx.beginPath();
    ctx.arc(cx, cy, rInner, 0, 2 * Math.PI);
    ctx.fill();

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, rOuter, 0, 2 * Math.PI);
    ctx.stroke();
		ctx.beginPath();
    ctx.arc(cx, cy, rInner, 0, 2 * Math.PI);
    ctx.stroke();

    // draw ticks
    ctx.beginPath();
    for (var i =0; i<12; i++) {
      var ang = (i*30) * Math.PI / 180;
      ctx.moveTo(cx + rOuter*Math.cos(ang), cy + rOuter*Math.sin(ang));
      ctx.lineTo(cx + rOuter2*Math.cos(ang), cy + rOuter2*Math.sin(ang) );
    }
    ctx.stroke();

		// hands
    drawLabelledHand(ctx, heading, '', rInner,rOuter2, '#5F5');
    drawLabelledHand(ctx, target, '', rInner, rOuter2, '#FF5');
    drawLabelledHand(ctx, course, '', rInner, rOuter2, '#5FF');
    drawLabelledHand(ctx, wind, '', 10, rOuter2+20, '#55F');

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

    // crosstack  -top left
    drawLabel(ctx, crosstrack.toFixed(1), 'Crosstrack', 5, 0, '#fff');

    // flags
    drawLabel(ctx, flags[0] > 0 ? 'Starboard' : 'Port', 'Tack', 5, 50, '#fff');
    drawLabel(ctx, flags[1] > 0 ? 'Y' : 'N', 'Locked?', 5, 100, '#fff');
    drawLabel(ctx, flags[2] > 0 ? 'Y' : 'N', 'Last CT+', 5, 150, '#fff');

    // draw Proa in inner region
    // -------------------------
    // approx radius of proa pontoons
    var prad = rInner * 0.8;

    // calc position of pontoons
    // bow
    var pb = [ cx + prad*Math.cos(h2), cy + prad*Math.sin(h2)  ];
    // left
    var pl = [ cx + prad*Math.cos(h2 - degreesToRadians(120)), cy + prad*Math.sin(h2 - degreesToRadians(120))  ];
    // right
    var pr = [ cx + prad*Math.cos(h2 + degreesToRadians(120)), cy + prad*Math.sin(h2 + degreesToRadians(120))  ];
    // stern
    var ps = [ (pr[0] + pl[0])/2, (pr[1] + pl[1])/2 ];

    // calc position of wing
    var wp = [ cx + 0.8*prad*Math.cos(h2), cy + 0.8*prad*Math.sin(h2)  ];


    // big T shape
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pb[0], pb[1]);
    ctx.lineTo(ps[0], ps[1]);
    ctx.moveTo(pl[0], pl[1]);
    ctx.lineTo(pr[0], pr[1]);
    ctx.stroke();

    var plen = rInner * 0.3;

    // bow pontoon (COW)
    var x1 = plen * Math.cos(h2 + degreesToRadians(cow));
    var y1 = plen * Math.sin(h2 + degreesToRadians(cow));
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(pb[0] + x1, pb[1] + y1);
    ctx.lineTo(pb[0] - x1, pb[1] - y1);
    ctx.stroke();

    // left pontoon
    x1 = plen * Math.cos(h2 + degreesToRadians(left));
    y1 = plen * Math.sin(h2 + degreesToRadians(left));
    ctx.strokeStyle = '#ffaaaa';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(pl[0] + x1, pl[1] + y1);
    ctx.lineTo(pl[0] - x1, pl[1] - y1);
    ctx.stroke();

    // right pontoon
    x1 = plen * Math.cos(h2 + degreesToRadians(right));
    y1 = plen * Math.sin(h2 + degreesToRadians(right));
    ctx.strokeStyle = '#aaffaa';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(pr[0] + x1, pr[1] + y1);
    ctx.lineTo(pr[0] - x1, pr[1] - y1);
    ctx.stroke();

    // wing
    var wl = rInner * 0.5;
    ctx.strokeStyle = '#aaaaff';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(wp[0], wp[1]);
    ctx.lineTo(wp[0] + wl*Math.cos(h2 + degreesToRadians(wing)), wp[1] + wl*Math.sin(h2 + degreesToRadians(wing)) );
    ctx.stroke();


    // target frame orientation
    // calc position of pontoons
    // bow
    var h3 = course + frameOffset;
    pb = [ cx + prad*Math.cos(h3), cy + prad*Math.sin(h3)  ];
    // left
    pl = [ cx + prad*Math.cos(h3 - degreesToRadians(120)), cy + prad*Math.sin(h3 - degreesToRadians(120))  ];
    // right
    pr = [ cx + prad*Math.cos(h3 + degreesToRadians(120)), cy + prad*Math.sin(h3 + degreesToRadians(120))  ];
    // stern
    ps = [ (pr[0] + pl[0])/2, (pr[1] + pl[1])/2 ];

    // big T shape
    ctx.strokeStyle = '#a00';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pb[0], pb[1]);
    ctx.lineTo(ps[0], ps[1]);
    ctx.moveTo(pl[0], pl[1]);
    ctx.lineTo(pr[0], pr[1]);
    ctx.stroke();

  }


  onParamValue(data) {
    this.update();
  }


	build() {
    this.ui = $('<div class="Proa text-center"></div>');
    this.canvas = $('<canvas height=300 />');
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

      DLM.sendDroneLinkMsg({
        addr: this.channel.node.id + '>' + this.channel.channel + '.8',
        msgType: DLM.DRONE_LINK_MSG_TYPE_FLOAT,
        values: [ ang ]
      });

      DLM.sendDroneLinkMsg({
        addr: this.channel.node.id + '>' + this.channel.channel + '.8',
        msgType: DLM.DRONE_LINK_MSG_TYPE_QUERY,
        values: [ ang ]
      });
    });

    this.ui.append(this.canvas);
    this.channel.interfaceTab.append(this.ui);

    this.built = true;

    this.update();
  }
}
