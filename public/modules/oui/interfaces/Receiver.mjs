import loadStylesheet from '../../loadStylesheet.js';
import * as DLM from '../../droneLinkMsg.mjs';


export default class Receiver {
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
		var inputVals = new Array(4);
		var outputVals = new Array(4);
		for (var i=0; i<4; i++) {
			inputVals[i] =  this.state.getParamValues(node, channel, 21+i, [0])[0];
			outputVals[i] =  this.state.getParamValues(node, channel, 11+i, [0])[0];
		}

		var switchVal = this.state.getParamValues(node, channel, 29, [0])[0];


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

		// mode display
		var modeH = 30;
		ctx.fillStyle = "#aaa";
		ctx.lineWidth = "1";
		ctx.beginPath();
		//ctx.fillRect(5,5,w-10,modeH-10);
		ctx.fillStyle = switchVal < 0.5 ? '#55F' : '#5F5';
    ctx.font = '20px bold serif';
		ctx.textAlign = 'center';
		var modeText = switchVal < 0.5 ? 'Passthrough' : 'Active';
    ctx.fillText(modeText, w/2, modeH/2 + 5);

    var bw = w/4; // barwidth
    var bh = h - 20 - modeH;

    // output bars
		for (var i=0; i<4; i++) {
			ctx.strokeStyle = "#aaa";
	    var x1 = i*bw;
	    var x2 = x1+bw - 4;
	    var y1 = modeH;
	    var y2 = y1 + bh;
	    ctx.strokeStyle = "#aaa";
	    ctx.lineWidth = "1";
	    ctx.beginPath();
	    ctx.rect(x1,y1,bw,bh);
	    ctx.stroke();
	    // fill to show level
	    ctx.strokeStyle = switchVal < 0.5 ? '#55F' : '#5F5';
	    ctx.fillStyle = switchVal < 0.5 ? '#55F' : '#5F5';
	    ctx.beginPath();
	    var by1 = (y1+bh/2) - outputVals[i] * (bh/2);
	    var by2 = (y1+bh/2);
	    ctx.fillRect(x1,by1,bw,by2-by1);
		}

  }

	build() {
		this.built = true;

		this.ui = $('<div class="Receiver text-center"></div>');
    this.canvas = $('<canvas height=200 />');

		this.ui.append(this.canvas);
    this.channel.interfaceTab.append(this.ui);

    this.built = true;

    this.update();
  }
}
