import ModuleInterface from './ModuleInterface.mjs';
import loadStylesheet from '../../loadStylesheet.js';
import * as DLM from '../../droneLinkMsg.mjs';

import { degreesToRadians, radiansToDegrees } from '../../navMath.mjs';


export default class TankSteer extends ModuleInterface {
	constructor(channel, state) {
    super(channel, state);

    this.commandDistance = 0;
    this.commandHeading = 0;
	}

	onParamValue(data) {
    if (!this.built) return;

    // heading
		if (data.param == 22 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_FLOAT) {
			// pass onto node for mapping
		  this.channel.node.updateMapParam('heading', 2, data.values, this.channel.channel, 22);
		}

    // mode
    if (data.param == 10 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_UINT8_T) {
      this.modeSelect.val(data.values[0]);
    }

    this.updateNeeded = true;
  }

  update() {
		if (!super.update() || this.ui.height()<=0) return;

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
    var h = ctx.canvas.height;

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
    var vx = w/2 + rMax * Math.cos(degreesToRadians(ang-90));
    var vy = h/2 + rMax * Math.sin(degreesToRadians(ang-90));

    //var vx = w/2 + turnRate * cw/2;
    //var vy = h/2 - speed * ch/2;

    ctx.strokeStyle = '#5f5';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo((bx1+bx2)/2, (by1+by2)/2);
    ctx.lineTo(vx, vy);
    ctx.stroke();


    // draw command vector
    ang = this.commandHeading;
    var r = rMax * (Math.min(this.commandDistance,20) / 20);
    vx = w/2 + r * Math.cos(degreesToRadians(ang-90));
    vy = h/2 + r * Math.sin(degreesToRadians(ang-90));

    //var vx = w/2 + turnRate * cw/2;
    //var vy = h/2 - speed * ch/2;

    ctx.strokeStyle = 'rgba(64,255,255,0.4)';
    ctx.lineWidth = 4;
    ctx.setLineDash([8, 4]);
    ctx.beginPath();
    ctx.moveTo((bx1+bx2)/2, (by1+by2)/2);
    ctx.lineTo(vx, vy);
    ctx.stroke();


    // draw target vector
    ang = targetHeading;
    r = rMax * (Math.min(distance,20) / 20);
    vx = w/2 + r * Math.cos(degreesToRadians(ang-90));
    vy = h/2 + r * Math.sin(degreesToRadians(ang-90));

    //var vx = w/2 + turnRate * cw/2;
    //var vy = h/2 - speed * ch/2;

    ctx.strokeStyle = '#5ff';
    ctx.lineWidth = 4;
    ctx.setLineDash([]);
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
		super.build('TankSteer');
    var me = this;

    var controlsContainer = $('<div class="form-row mr-1 ml-1" />');

		this.modeSelect = $('<select class="col-8 custom-select tankSteerModeSelect"></select>');
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
    controlsContainer.append(this.modeSelect);


    this.stopBtn = $('<button class="col-4 btn btn-sm btn-danger">Stop</button>');
    this.stopBtn.on('click', ()=>{
      this.setAndQueryFloatParam(24, 0);
      this.commandDistance = 0;
      this.update();
    });
    controlsContainer.append(this.stopBtn);


    this.ui.append(controlsContainer);

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

      //var currentHeading = this.state.getParamValues(node, channel, 22, [0])[0];

      // convert to angle / distance
      var ang = radiansToDegrees(Math.atan2(y,x)) + 90;
      var targetHeading = ang;

      var distance = 20 * Math.sqrt(x*x + y*y) / rMax;

      var s = '';
      s += 'x: ' + x.toFixed(0)+ '<br/>';
      s += 'y: ' + y.toFixed(0)+ '<br/>';
      s += 'Heading: ' + targetHeading.toFixed(0) + '<br/>';
      s += 'Distance: ' + distance.toFixed(1) + 'm<br/>';
      this.uiOverlay.html(s);

      // 20 = target, 24 = distance

			this.setAndQueryFloatParam(20, targetHeading);

      this.setAndQueryFloatParam(24, distance);
      
      this.commandDistance = distance;
      this.commandHeading = targetHeading;
      this.update();
		});

    this.uiOverlay = $('<div style="position:absolute; z-index:1000; padding: 4px 8px; color:white; display:none;">.</div>');
    this.ui.append(this.uiOverlay);

		this.ui.append(this.canvas);

    // see if we already know key params
    var node = this.channel.node.id;
    var channel = this.channel.channel;

    // mode
    var mode = this.state.getParamValues(node, channel, 10, [0])[0];
    this.modeSelect.val(mode);
    
    super.finishBuild();
  }
}
