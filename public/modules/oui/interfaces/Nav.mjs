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

export default class Nav {
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

    var heading = this.state.getParamValues(node, channel, 8, [0])[0];

    var adjHeading = this.state.getParamValues(node, channel, 20, [0])[0];

    var wind = this.state.getParamValues(node, channel, 21, [0])[0];

    var crosstrack = this.state.getParamValues(node, channel, 17, [0])[0];


    var c = this.canvas[0];
    var ctx = c.getContext("2d");

    // keep width updated
    var w = this.ui.width();
    ctx.canvas.width = w;
    var cx = w/2;

    ctx.fillStyle = '#343a40';
    ctx.fillRect(0,0,w,200);


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
    drawLabelledHand(ctx, adjHeading, '', 30, 90, '#FF5');
    drawLabelledHand(ctx, wind, '', 60, 110, '#55F');

    // legend - top right
		ctx.textAlign = 'right';
    ctx.font = '12px serif';
    ctx.fillStyle = '#5F5';
    ctx.fillText('Heading', w-5, 12);
    ctx.fillStyle = '#FF5';
    ctx.fillText('Adj. Heading', w-5, 26);
    ctx.fillStyle = '#55F';
    ctx.fillText('Wind', w-5, 40);



    // crosstrack  -top left
    ctx.fillStyle = '#FFF';
		ctx.textAlign = 'left';
    ctx.font = '12px serif';
    ctx.fillText('Crosstrack', 5, 12);
    ctx.font = '20px bold serif';
    ctx.fillText(crosstrack.toFixed(1), 5, 35);
  }


  onParamValue(data) {
    // mode
    if (data.param == 14 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_UINT8_T) {
      this.modeSelect.val(data.values[0]);
    }

    this.update();
  }


	build() {
    this.ui = $('<div class="Sailor text-center"></div>');

    this.modeSelect = $('<select class="navModeSelect"></select>');
    // add mode options
    this.modeSelect.append($('<option value="0">Idle</option>'));
    this.modeSelect.append($('<option value="1">Goto</option>'));
    this.modeSelect.append($('<option value="2">AbsCourse</option>'));
    this.modeSelect.append($('<option value="3">RelCourse</option>'));
    this.modeSelect.append($('<option value="4">Backaway</option>'));
    this.modeSelect.append($('<option value="5">Orbit</option>'));
    this.modeSelect.change((e)=>{
      // get value
      var newMode = this.modeSelect.val();

      DLM.sendDroneLinkMsg({
        addr: this.channel.node.id + '>' + this.channel.channel + '.14',
        msgType: DLM.DRONE_LINK_MSG_TYPE_UINT8_T,
        values: [ newMode ]
      });
    });

    this.ui.append(this.modeSelect);

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
