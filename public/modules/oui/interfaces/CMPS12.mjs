import ModuleInterface from './ModuleInterface.mjs';
import loadStylesheet from '../../loadStylesheet.js';
import * as DLM from '../../droneLinkMsg.mjs';
import {degreesToRadians} from '../../navMath.mjs';

export default class CMPS12 extends ModuleInterface {
	constructor(channel, state) {
    super(channel, state);

    this.numBins = 24;
    this.pitchHistoBins = [];
    this.rollHistoBins = [];
    // init histogram bins
    for (var i=0; i<this.numBins; i++) {
      this.pitchHistoBins.push(0);
      this.rollHistoBins.push(0);
    }

    this.receivedVector = false;

    // start sampling timer
    setInterval(()=>{
      if (!this.receivedVector) return;

      var vector = this.state.getParamValues(this.channel.node.id, this.channel.channel, 13, [0,0]);

      // add to bins
      var pitchBin = Math.floor((vector[0] / (360 / this.numBins))) % this.numBins;
      if (pitchBin < 0) pitchBin += this.numBins;
      if (pitchBin >= this.numBins) pitchBin = 0;
      this.pitchHistoBins[pitchBin]++;

      var rollBin = Math.floor((vector[1] / (360 / this.numBins))) % this.numBins;
      if (rollBin < 0) rollBin += this.numBins;
      if (rollBin >= this.numBins) rollBin = 0;
      this.rollHistoBins[rollBin]++;
    }, 1000);
	}


  drawCompassIndicator(cx, cy, outerR, innerR, v, label) {
    var c = this.canvas[0];
		var ctx = c.getContext("2d");

    // background circles
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, 2 * Math.PI);
    ctx.stroke();
		ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, 2 * Math.PI);
    ctx.stroke();

		// ticks
    ctx.beginPath();
    for (var i =0; i<12; i++) {
      var ang = (i*30) * Math.PI / 180;
      ctx.moveTo(cx + outerR*Math.cos(ang), cy + outerR*Math.sin(ang));
      ctx.lineTo(cx + (outerR+10)*Math.cos(ang), cy + (outerR+10)*Math.sin(ang) );
    }
    ctx.stroke();

		// heading
    ctx.strokeStyle = '#5F5';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(cx + innerR*Math.cos(v), cy + innerR*Math.sin(v));
    ctx.lineTo(cx + (outerR+10)*Math.cos(v), cy + (outerR+10)*Math.sin(v) );
    ctx.stroke();

    ctx.fillStyle = '#5F5';
    ctx.font = '20px bold serif';
		ctx.textAlign = 'center';
    ctx.fillText(label + '°', cx, cy+6);
  }

	onParamValue(data) {
    if (!this.built) return;

		// heading
		if (data.param == 10 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_FLOAT) {
			// pass onto node for mapping
			this.channel.node.updateMapParam('heading', 3, data.values, this.channel.channel, 10);
		}

    // pitch/roll vector
    if (data.param == 13 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_FLOAT) {
			this.receivedVector = true;
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
    var h = this.ui.height();

    if (w == 0 || h == 0) return;

    ctx.canvas.width = w;

    // fetch params
    var heading = this.state.getParamValues(node, channel, 10, [0])[0];
    var h2 = (heading - 90) * Math.PI / 180;

    var rawVector = this.state.getParamValues(node, channel, 13, [0,0]);
		var trim = this.state.getParamValues(node, channel, 12, [0]);


    // render compass
    // -------------------------------------------------------------------------
    var w1 = w/2;
		var cx = w1/2;
    var cy = h/2;

		ctx.fillStyle = '#343a40';
		ctx.fillRect(0,0,w1,h);

		
    this.drawCompassIndicator(cx, cy, 80, 30, h2, heading.toFixed(0));


    // render artificial horizons
    // -------------------------------------------------------------------------
    w1 = w/2;
		cx = w/2 + w1/2;

		ctx.fillStyle = '#343a40';
		ctx.fillRect(w/2,0,w1,h);

    // pitch
    // positive pitch is up, negative is down
    var cx1 = w1 + w1/4;
    var r1 = w/8-5;

    if (this.receivedVector) {
      // histogram
      var maxBin = 1;
      for (var i=0; i<this.numBins; i++) {
        if (this.pitchHistoBins[i] > maxBin) maxBin = this.pitchHistoBins[i];
      }

      for (var i=0; i<this.numBins; i++) {
        var a1 = -2 * Math.PI * i / this.numBins; // - Math.PI/2;
        var a2 = a1 + 2 * Math.PI / this.numBins;
        var r = 20 + (r1-20) * this.pitchHistoBins[i] / maxBin;

        ctx.fillStyle = '#55f';
        ctx.beginPath();
        ctx.arc(cx1, cy, r, a1, a2);
        ctx.arc(cx1, cy, 20, a2, a1, true);
        //ctx.lineTo(cx1,cy);
        ctx.fill();
      }
    }

    var pitchAng = degreesToRadians(-rawVector[0]); 
    this.drawCompassIndicator(cx1, cy, r1, 20, pitchAng, rawVector[0].toFixed(0));

    this.drawPill('Pitch', cx1, 15, 50, '#555');

    // roll
    // positive roll is to the right, negative to the left

    cx1 = w1 + 3*w1/4

    if (this.receivedVector) {
      // histogram
      var maxBin = 1;
      for (var i=0; i<this.numBins; i++) {
        if (this.rollHistoBins[i] > maxBin) maxBin = this.rollHistoBins[i];
      }

      for (var i=0; i<this.numBins; i++) {
        var a1 = 2 * Math.PI * i / this.numBins - Math.PI/2;
        var a2 = a1 + 2 * Math.PI / this.numBins;
        var r = 20 + (r1-20) * this.rollHistoBins[i] / maxBin;

        ctx.fillStyle = '#55f';
        ctx.beginPath();
        ctx.arc(cx1, cy, r, a1, a2);
        ctx.arc(cx1, cy, 20, a2, a1, true);
        //ctx.lineTo(cx1,cy);
        ctx.fill();
      }
    }
    var rollAng = degreesToRadians(rawVector[1] - 90);  // zero roll is a vector pointing straight up
    this.drawCompassIndicator(cx1, cy, r1, 20, rollAng, rawVector[1].toFixed(0));

    this.drawPill('Roll', cx1, 15, 50, '#555');

  }

	build() {
		super.build('CMPS12');
    this.canvas = $('<canvas height=200 />');

		this.ui.append(this.canvas);

    super.finishBuild();
  }
}
