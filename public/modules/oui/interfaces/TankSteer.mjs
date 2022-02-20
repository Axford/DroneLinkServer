import loadStylesheet from '../../loadStylesheet.js';
import * as DLM from '../../droneLinkMsg.mjs';


export default class TankSteer {
	constructor(channel, state) {
    this.channel = channel;
    this.state = state;
    this.built = false;
	}

	onParamValue(data) {
    this.update();
  }

  update() {
		if (!this.built) return;

    var node = this.channel.node.id;
    var channel = this.channel.channel;

    // fetch params
		var left =  this.state.getParamValues(node, channel, 8, [0])[0];
    var right =  this.state.getParamValues(node, channel, 9, [0])[0];
		var turnRate =  this.state.getParamValues(node, channel, 10, [0])[0];
    var speed = this.state.getParamValues(node, channel, 12, [0])[0];

    // prep canvas
		var c = this.canvas[0];
		var ctx = c.getContext("2d");

		// keep width updated
		var w = this.ui.width();
		ctx.canvas.width = w;
		var cx = w/2;
    var h = this.ui.height();

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


    // center vector plot
    // -------------------------------------------------
    // draw current bounds
    var bx1 = w/2 - cw/2;
    var bx2 = w/2 + cw/2;
    var by1 = h/2 - ch/2;
    var by2 = h/2 + ch/2;
    // outer rect
    ctx.strokeStyle = "#aaa";
    ctx.lineWidth = "1";
    ctx.beginPath();
    ctx.rect(bx1,by1,bx2-bx1,by2-by1);
    ctx.stroke();

    // draw centre of bounds
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

    // draw current vector

    var vx = w/2 + turnRate * cw/2;
    var vy = h/2 - speed * ch/2;
    ctx.strokeStyle = '#5f5';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo((bx1+bx2)/2, (by1+by2)/2);
    ctx.lineTo(vx, vy);
    ctx.stroke();


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
			qm.param = 16;
			qm.setUint8([ newMode ]);
			this.state.send(qm);
    });

    this.ui.append(this.modeSelect);

    this.canvas = $('<canvas height=200 />');
    this.canvas.on('click', (e)=>{

			var offsetX = $( e.target ).offset().left;
			var offsetY = $( e.target ).offset().top;
			var w = $(e.target).innerWidth();
			var h = $(e.target).innerHeight();

			var x = (e.pageX - offsetX) - w/2;
			var y = (e.pageY - offsetY) - h/2;

      // convert to speed / turnRate
      var speed = (-y) / (h/2);
      var turnRate = x / (w/2);

      console.log('tankSteer update: ',speed, turnRate);

			var qm = new DLM.DroneLinkMsg();
			qm.node = this.channel.node.id;
			qm.channel = this.channel.channel;
			qm.param = 12;
			qm.setFloat([ speed ]);
			this.state.send(qm);

			var qm = new DLM.DroneLinkMsg();
			qm.node = this.channel.node.id;
			qm.channel = this.channel.channel;
			qm.param = 10;
			qm.setFloat([ turnRate ]);
			this.state.send(qm);

		});

		this.ui.append(this.canvas);
    this.channel.interfaceTab.append(this.ui);

    this.built = true;

    this.update();
  }
}
