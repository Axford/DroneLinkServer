import loadStylesheet from '../../loadStylesheet.js';
import * as DLM from '../../droneLinkMsg.mjs';


export default class Depth {
	constructor(channel, state) {
    this.channel = channel;
    this.state = state;
    this.built = false;

    this.depth = [];
	}

	onParamValue(data) {
    if (data.param == 14 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_FLOAT) {
      this.depth.push(data.values[2]);

      // if too many vectors, lose one
      if (this.depth.length > 100) this.depth.shift();
    }

    this.update();
  }

  update() {
		if (!this.built) return;

    var node = this.channel.node.id;
    var channel = this.channel.channel;


		var c = this.canvas[0];
		var ctx = c.getContext("2d");

		// keep width updated
		var w = this.ui.width();
		ctx.canvas.width = w;
    var h = this.ui.height();

    // fetch params
    //var depth = this.state.getParamValues(node, channel, 13, [0])[0];


    // render
    // -------------------------------------------------------------------------
    var w1 = w;
		var cx = w1/2;

		ctx.fillStyle = '#343a40';
		ctx.fillRect(0,0,w1,h);

    if (this.depth.length > 0) {
      ctx.strokeStyle = "#5f5";
      ctx.strokeWidth = "2";
      for (var i=0; i<this.depth.length; i++) {
        var x = i * w1 / this.depth.length;
        var y = h * this.depth[i] / 10 ;

        if (i==0) {
          ctx.moveTo(x,y);
        } else {
          ctx.lineTo(x,y);
        }

      }
      ctx.stroke();
    }

  }

	build() {
		this.built = true;

		this.ui = $('<div class="Depth text-center"></div>');
    this.canvas = $('<canvas height=100 />');

		this.ui.append(this.canvas);
    this.channel.interfaceTab.append(this.ui);

    this.built = true;

    this.update();
  }
}
