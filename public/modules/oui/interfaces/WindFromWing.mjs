import ModuleInterface from './ModuleInterface.mjs';
import loadStylesheet from '../../loadStylesheet.js';
import * as DLM from '../../droneLinkMsg.mjs';



export default class WindFromWing extends ModuleInterface {
	constructor(channel, state) {
    super(channel, state);

    this.receivedWind = false;

    this.numBins = 24;
    this.histoBins = [];
    // init histogram bins
    for (var i=0; i<this.numBins; i++) {
      this.histoBins.push(0);
    }

    // start sampling timer
    setInterval(()=>{
      if (!this.receivedWind) return;

      var wind = this.state.getParamValues(this.channel.node.id, this.channel.channel, 15, [0])[0];

      // add to bin
      var bin = Math.floor((wind / (360 / this.numBins))) % this.numBins;
      this.histoBins[bin]++;
    }, 1000)
	}

	onParamValue(data) {
    if (!this.built) return;

		// global wind
		if (data.param == 15 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_FLOAT) {
      this.receivedWind = true;

			// pass onto node for mapping
			this.channel.node.updateMapParam('wind', 4, data.values, this.channel.channel, 15);
		}

    this.updateNeeded = true;
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

    // fetch params - wind in global coords
    var wind = this.state.getParamValues(node, channel, 15, [0])[0];
    var wind2 = (wind - 90) * Math.PI / 180;



    // render world compass
    // -------------------------------------------------------------------------
    var w1 = w;
		var cx = w1/2;

		ctx.fillStyle = '#343a40';
		ctx.fillRect(0,0,w1,h);

    if (this.receivedWind) {

      // histogram
      var maxBin = 1;
      for (var i=0; i<this.numBins; i++) {
        if (this.histoBins[i] > maxBin) maxBin = this.histoBins[i];
      }

      for (var i=0; i<this.numBins; i++) {
        var a1 = 2 * Math.PI * i / this.numBins - Math.PI/2;
        var a2 = a1 + 2 * Math.PI / this.numBins;
        var r = 30 + 50 * this.histoBins[i] / maxBin;

        ctx.fillStyle = '#55f';
        ctx.beginPath();
        ctx.arc(cx, 100, r, a1, a2);
        ctx.lineTo(cx,100);
        ctx.fill();
      }


      // rings
      ctx.strokeStyle = '#fff';
      ctx.fillStyle = '#343a40';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, 100, 80, 0, 2 * Math.PI);
      ctx.stroke();
  		ctx.beginPath();
      ctx.arc(cx, 100, 30, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();

      // ticks
      ctx.beginPath();
      for (var i =0; i<12; i++) {
        var ang = (i*30) * Math.PI / 180;
        ctx.moveTo(cx + 80*Math.cos(ang), 100 + 80*Math.sin(ang));
        ctx.lineTo(cx + 90*Math.cos(ang), 100 + 90*Math.sin(ang) );
      }
      ctx.stroke();


      // wind
      ctx.strokeStyle = '#5F5';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(cx + 30*Math.cos(wind2), 100 + 30*Math.sin(wind2));
      ctx.lineTo(cx + 90*Math.cos(wind2), 100 + 90*Math.sin(wind2) );
      ctx.stroke();

      // text
      ctx.fillStyle = '#5F5';
      ctx.font = '20px bold serif';
  		ctx.textAlign = 'center';
      ctx.fillText(wind.toFixed(0) + '°', cx, 106);
    }

		this.drawPill('World', cx, 5, w1*0.8, '#585');


  }


	build() {
		super.build('WindFromWing');

    this.canvas = $('<canvas height=200 />');

		this.ui.append(this.canvas);
    
    super.finishBuild();

  }
}
