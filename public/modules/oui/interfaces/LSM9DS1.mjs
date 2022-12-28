import ModuleInterface from './ModuleInterface.mjs';
import loadStylesheet from '../../loadStylesheet.js';
import * as DLM from '../../droneLinkMsg.mjs';


export default class LSM9DS1 extends ModuleInterface {
	constructor(channel, state) {
    super(channel, state);

    this.rawVectors = [];  // history of raw vector values
	}

	onParamValue(data) {
    if (!this.built) return;

		// heading
		if (data.param == 11 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_FLOAT) {
			// pass onto node for mapping
			this.channel.node.updateMapParam('heading', 3, data.values, this.channel.channel, 11);
		}

    if (data.param == 10 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_FLOAT) {

			this.rawVectors.push(data.values);

      //console.log('new compass vector: ',this.rawVectors);

      // if too many vectors, lose one
      if (this.rawVectors.length > 200) this.rawVectors.shift();
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

    // fetch params
    var heading = this.state.getParamValues(node, channel, 11, [0])[0];
    var h2 = (heading - 90) * Math.PI / 180;

    var rawVector = this.state.getParamValues(node, channel, 10, [0,0,0]);
    var calibX = this.state.getParamValues(node, channel, 13, [0,0,0]);
    var calibY = this.state.getParamValues(node, channel, 14, [0,0,0]);
		var limits = this.state.getParamValues(node, channel, 18, [0,0,0,0]);

    // render vector view
    // -------------------------------------------------------------------------
    var w2 = w/2;
    var x2 = w2;
    var cx2 = x2 + w2/2;

    ctx.fillStyle = '#343a40';
		ctx.fillRect(x2,0,w2,h);

    // axes
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 1;
    // x
    ctx.beginPath();
    ctx.moveTo(x2, h/2);
    ctx.lineTo(x2 + w2, h/2);
    ctx.stroke();
    // y
    ctx.beginPath();
    ctx.moveTo(cx2, 0);
    ctx.lineTo(cx2, h);
    ctx.stroke();


    // draw rawVectors
    ctx.fillStyle = '#55f';
    ctx.strokeStyle = "#aaf";

    const scaling = (w2/2) / 100;

    for (var i=0; i<this.rawVectors.length; i++) {
      if (i == this.rawVectors.length-1) {
        ctx.fillStyle = '#afa';
        ctx.strokeStyle = "#afa";
      }
      var x = cx2 + this.rawVectors[i][0] * scaling;
      var y = h/2 - this.rawVectors[i][1] * scaling;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
    }

		//
		var bcx = cx2 + calibX[1] * scaling;
		var bcy = h/2 - calibY[1] * scaling;

    // draw limits
    var bx1 = cx2 + limits[3] * scaling;
    var bx2 = cx2 + limits[1] * scaling;
    var by1 = h/2 - limits[0] * scaling;
    var by2 = h/2 - limits[2] * scaling;
    // x
    ctx.strokeStyle = "#f00";
    ctx.lineWidth = "2";
    ctx.beginPath();
    //ctx.rect(bx1,by1,bx2-bx1,by2-by1);
		ctx.ellipse((bx1+bx2)/2, (by1+by2)/2, (bx2-bx1)/2, (by2-by1)/2, 0, 0, 2 * Math.PI);
    ctx.stroke();

		// draw bounds
     bx1 = cx2 + calibX[0] * scaling;
     bx2 = cx2 + calibX[2] * scaling;
     by1 = h/2 - calibY[0] * scaling;
     by2 = h/2 - calibY[2] * scaling;
    // x
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = "1";
    ctx.beginPath();
    //ctx.rect(bx1,by1,bx2-bx1,by2-by1);
    ctx.moveTo(bx1,by1);
    ctx.lineTo(bx1,by2);
    ctx.lineTo(bx2,by2);
    ctx.lineTo(bx2,by1);
    ctx.lineTo(bx1,by1);
    ctx.stroke();

    // draw centre of bounds
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    // x
    ctx.beginPath();
    ctx.moveTo(bx1, bcy);
    ctx.lineTo(bx2, bcy);
    ctx.stroke();
    // y
    ctx.beginPath();
    ctx.moveTo(bcx, by1);
    ctx.lineTo(bcx, by2);
    ctx.stroke();


    // draw latest vector
    if (this.rawVectors.length > 0) {
      var vx = cx2 + this.rawVectors[this.rawVectors.length-1][0] * scaling;
      var vy = h/2 - this.rawVectors[this.rawVectors.length-1][1] * scaling;
      ctx.strokeStyle = '#afa';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(bcx, bcy);
      ctx.lineTo(vx, vy);
      ctx.stroke();
    }


    // render compass
    // -------------------------------------------------------------------------
    var w1 = w/2;
		var cx = w1/2;

		ctx.fillStyle = '#343a40';
		ctx.fillRect(0,0,w1,h);

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, 100, 80, 0, 2 * Math.PI);
    ctx.stroke();
		ctx.beginPath();
    ctx.arc(cx, 100, 30, 0, 2 * Math.PI);
    ctx.stroke();

    ctx.beginPath();
    for (var i =0; i<12; i++) {
      var ang = (i*30) * Math.PI / 180;
      ctx.moveTo(cx + 80*Math.cos(ang), 100 + 80*Math.sin(ang));
      ctx.lineTo(cx + 90*Math.cos(ang), 100 + 90*Math.sin(ang) );
    }
    ctx.stroke();

		// heading
    ctx.strokeStyle = '#5F5';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(cx + 30*Math.cos(h2), 100 + 30*Math.sin(h2));
    ctx.lineTo(cx + 90*Math.cos(h2), 100 + 90*Math.sin(h2) );
    ctx.stroke();

    ctx.fillStyle = '#5F5';
    ctx.font = '20px bold serif';
		ctx.textAlign = 'center';
    ctx.fillText(heading.toFixed(0) + '°', cx, 106);
  }

	build() {
		super.build('LSM9DS1');
    this.canvas = $('<canvas height=200 />');

		this.ui.append(this.canvas);
    
    super.finishBuild();
  }
}
