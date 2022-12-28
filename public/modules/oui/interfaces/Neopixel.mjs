import ModuleInterface from './ModuleInterface.mjs';
import loadStylesheet from '../../loadStylesheet.js';
import * as DLM from '../../droneLinkMsg.mjs';


export default class Neopixel extends ModuleInterface {
	constructor(channel, state) {
    super(channel, state);
	}

  update() {
		if (!super.update()) return;

    var node = this.channel.node.id;
    var channel = this.channel.channel;


		var c = this.canvas[0];
		var ctx = c.getContext("2d");

		// keep width updated
		var w = this.ui.width();
		ctx.canvas.width = w;
    var h = this.ui.height();

    // fetch params
    var scene = this.state.getParamValues(node, channel, 8, [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]);


    // render pixels
    // -------------------------------------------------------------------------
    var w1 = w;
		var cx = w1/2;

		ctx.fillStyle = '#343a40';
		ctx.fillRect(0,0,w1,h);

    var pw = w/4;

    for (var i=0; i<4; i++) {
      var r = scene[4 + (i*3)];
      var g = scene[5 + (i*3)];
      var b = scene[6 + (i*3)];

      var x = i * pw;
      ctx.fillStyle = 'rgba('+r+','+g+','+b+',1)';
      ctx.strokeStyle = "#888";
      ctx.strokeWidth = "2";
      ctx.fillRect(x,0,x+pw,h);
      ctx.rect(x,0,x+pw,h);
      ctx.stroke();
    }
  }

	build() {
		super.build('Neopixel');
    this.canvas = $('<canvas height=50 />');

		this.ui.append(this.canvas);
    
    super.finishBuild();
  }
}
