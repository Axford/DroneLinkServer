import ModuleInterface from './ModuleInterface.mjs';
import loadStylesheet from '../../loadStylesheet.js';
import * as DLM from '../../droneLinkMsg.mjs';


export default class Servo extends ModuleInterface {
	constructor(channel, state) {
    super(channel, state);
    
    this.map = [0,0,1,1];
    this.cp = [ [0,0], [0,0], [0,0], [0,0]];
    this.position = 0;
    this.centre = 0;
    this.output = 0;
    this.gotCP = false;
    this.dragCP = -1;
	}

  calcControlPoints() {
    var c = this.canvas[0];
    var ctx = c.getContext("2d");

    // gutter
    var g = 30;

    // keep width updated
    var w = this.ui.width();
    var iw = w - 2*g;
    var h = this.ui.height();
    var ih = h - 2*g;

    for (var i=0; i<4; i++) {
      this.cp[i] = [
        g + this.map[i]/180 * iw,
        h - g - (i*ih/3)
      ];
    }
  }


	onParamValue(data) {
    if (!this.built) return;

    if (data.msgType == DLM.DRONE_LINK_MSG_TYPE_FLOAT) {
      if (data.param == 8) {
        this.position = data.values[0];
      } else if (data.param == 13) {
        this.centre = data.values[0];
      } else if (data.param == 14) {
        this.output = data.values[0];
      }
    }

    this.updateNeeded = true;
  }


  drawCurve() {
    var c = this.canvas[0];
		var ctx = c.getContext("2d");

    var node = this.channel.node.id;
    var channel = this.channel.channel;

    // gutter
    var g = 30;

    // keep width updated
    var w = this.ui.width();
    var iw = w - 2*g;
    ctx.canvas.width = w;
    var cx = w/2;
    var h = this.ui.height();
    var ih = h - 2*g;

    this.map = this.state.getParamValues(node, channel, 12, [0,0,0,0]);
    this.gotCP = this.map[0] > 0 || this.map[1] > 0 || this.map[2] > 0 || this.map[3] > 0;

    this.calcControlPoints();

    ctx.fillStyle = '#343a40';
		ctx.fillRect(0,0,w,200);

    // draw axes
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    // x
    ctx.moveTo(g,h-g);
    ctx.lineTo(w-g,h-g);
    // y
    ctx.moveTo(g,h-g);
    ctx.lineTo(g,g);
    ctx.stroke();

    // x ticks (0..180)
    ctx.font = '12px bold serif';
		ctx.textAlign = 'center';
    ctx.fillStyle = '#FFF';
    for (var i=0; i<=180; i+=90 ) {
      var x = (i/180) * iw + g;
      ctx.beginPath();
      ctx.moveTo(x, h-g+5);
      ctx.lineTo(x, h-g);
      ctx.stroke();
      ctx.fillText(i.toFixed(0), x, h-10);
    }

    // y mid tick  0..1
    ctx.textAlign = 'left';
    for (var i=-1; i<=1; i+=1 ) {
      var y = (i+1)/2 * ih + g;
      ctx.beginPath();
      ctx.moveTo(g-5, h-y);
      ctx.lineTo(g, h-y);
      ctx.stroke();
      ctx.fillText(i.toFixed(1), 5, h-y +6);
    }

    if (this.gotCP) {
      // draw map curve
      ctx.strokeStyle = '#F88';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (var i =0; i<=20; i++) {
        var t = i/20;
        var t2 = t * t;
        var t3 = t2 * t;
        var mt = 1 - t;
        var mt2 = mt * mt;
        var mt3 = mt2 * mt;
        var v = this.map[0] * mt3 +
            this.map[1] * 3 * mt2 * t +
            this.map[2] * 3 * mt * t2 +
            this.map[3] * t3;
        v = (v) + this.centre;
        if (v > 180) v = 180;
        if (v < 0) v = 0;

        var y = t * ih + g;
        var x = ((v)/180) * (iw) + g;

        if (i==0) ctx.moveTo(x, h-y);
        ctx.lineTo( x, h-y );
      }
      ctx.stroke();

      // draw control points
      ctx.strokeStyle = '#ff5';
      for (var i=0; i<4; i++) {
        ctx.beginPath();
        ctx.arc(this.cp[i][0], this.cp[i][1], 5, 0, 2*Math.PI);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(this.cp[0][0], this.cp[0][1]);
      ctx.lineTo(this.cp[1][0], this.cp[1][1]);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(this.cp[2][0], this.cp[2][1]);
      ctx.lineTo(this.cp[3][0], this.cp[3][1]);
      ctx.stroke();
    }

    var py = ((this.position+1)/2) * ih + g;
    var px = ((this.output)/180) * iw + g;

    // draw output position on X (0 to 180)
    ctx.strokeStyle = '#5f5';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(px,h-g);
    ctx.lineTo(px,h-py);
    ctx.stroke();

    ctx.fillStyle = '#0F0';
    ctx.beginPath();
    ctx.moveTo(px, h-g);
    ctx.lineTo(px-6, h-g-8);
    ctx.lineTo(px+6, h-g-8);
    ctx.lineTo(px, h-g);
    ctx.fill();

    ctx.fillRect(px-g/2, h-g, g, 18);

    ctx.fillStyle = '#000';
    ctx.font = '13px bold serif';
		ctx.textAlign = 'center';
    ctx.fillText(this.output.toFixed(0), px, h-g+14);

    // draw control position on Y (-1 to 1)
    ctx.strokeStyle = '#5f5';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(g,h - py);
    ctx.lineTo(px,h - py);
    ctx.stroke();

    ctx.fillStyle = '#0F0';
    ctx.fillRect(0,h-py-9,g,18);

    ctx.fillStyle = '#000';
    ctx.font = '13px bold serif';
		ctx.textAlign = 'left';
    ctx.fillText(this.position.toFixed(1), 5, h-py+5);
  }


  update() {
		if (!super.update()) return;

    this.drawCurve();
  }


	build() {
		super.build('Servo');
    this.canvas = $('<canvas height=200 />');

    var me = this;
    this.canvas.on('mousedown', (e)=>{
      if (this.gotCP) {
        var offsetX = $( e.target ).offset().left;
  			var offsetY = $( e.target ).offset().top;
  			var w = $(e.target).innerWidth();
  			var h = $(e.target).innerHeight();

  			var x = (e.pageX - offsetX);
  			var y = (e.pageY - offsetY);

        this.calcControlPoints();

        if (x < 30) {
          // manual position input
          this.dragCP = 4;

        } else {
          // see if this intersects a control point
          for (var i=0; i<4; i++) {
            var dx = this.cp[i][0] - x;
            var dy = this.cp[i][1] - y;
            var d = Math.sqrt(dx*dx + dy*dy);
            if (d < 6) {
              console.log('hit', i);
              this.dragCP = i;
            }
          }
        }
        this.drawCurve();
      }
		});

    this.canvas.on('mousemove', (e)=>{

      var offsetX = $( e.target ).offset().left;
      var offsetY = $( e.target ).offset().top;
      var w = $(e.target).innerWidth();
      var h = $(e.target).innerHeight();
      var g = 30;

      var x = (e.pageX - offsetX);
      var y = (e.pageY - offsetY);

      if (x < g) x = g;
      if (x > w-g ) x = w-g;

      if (this.dragCP == 4) {
        // set position
        this.position = -(((y - g) / (h-2*g)) *2 - 1);
        if (this.position > 1) this.position = 1;
        if (this.position < -1) this.position = -1;
        this.drawCurve();

      } else if (this.dragCP > -1) {
        // update and redraw curve
        this.map[this.dragCP] = 180 * (x - g) / (w - 2*g);
        this.cp[this.dragCP][0] = x;

        this.drawCurve();
      }
		});

    this.canvas.on('mouseup', (e)=>{
      if (this.dragCP == 4) {
        this.dragCP = -1;
        // send new position

        // send new map
        var qm = new DLM.DroneLinkMsg();
        qm.source = 252;
        qm.node = this.channel.node.id;
        qm.channel = this.channel.channel;
        qm.param = 8;
        qm.setFloat([this.position]);
        this.state.send(qm);

      } else if (this.dragCP > -1) {
        this.dragCP = -1;

        // send new map
        var qm = new DLM.DroneLinkMsg();
        qm.source = 252;
        qm.node = this.channel.node.id;
        qm.channel = this.channel.channel;
        qm.param = 12;
        qm.setFloat(this.map);
        this.state.send(qm);
      }
		});

		this.ui.append(this.canvas);
    

    // query map
    var qm = new DLM.DroneLinkMsg();
    qm.source = 252;
    qm.node = this.channel.node.id;
    qm.channel = this.channel.channel;
    qm.param = 12;
    qm.msgType = DLM.DRONE_LINK_MSG_TYPE_QUERY;
    this.state.send(qm);

    super.finishBuild();
  }
}
