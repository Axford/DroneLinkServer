import loadStylesheet from '../../loadStylesheet.js';
import * as DLM from '../../droneLinkMsg.mjs';


export default class INA219 {
	constructor(channel, state) {
    this.channel = channel;
    this.state = state;
    this.built = false;
    this.visible = false;
    this.updateNeeded = false;
	}


  drawValue(x,y,label,v) {
    var c = this.canvas[0];
		var ctx = c.getContext("2d");

    ctx.fillStyle = '#FFF';
		ctx.textAlign = 'left';
    ctx.font = '12px serif';
    ctx.fillText(label, x, y+15);
    ctx.font = '20px bold serif';
		ctx.fillStyle = '#5f5';
    ctx.fillText(v, x, y+35);
  }


  drawLabel(label, x1,y1,w,h) {
    var c = this.canvas[0];
		var ctx = c.getContext("2d");

    ctx.strokeStyle = '#343a40';
    ctx.strokeRect(x1, y1, x1+w, y1+h);

    ctx.fillStyle = '#ccc';
    ctx.font = '14px serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, x1+w/2, y1+h);
  }

  drawMeterValue(v, x1,y1,w,h, clr = '#8F8', s=35) {
    var c = this.canvas[0];
		var ctx = c.getContext("2d");

    ctx.strokeStyle = '#343a40';
    ctx.strokeRect(x1, y1, x1+w, y1+h);

    ctx.fillStyle = clr;
    ctx.font = s + 'px serif';
    ctx.fillText(v, x1+w/2, y1+h);
  }

	drawMeter(v, label, x1,y1,w,h, clr = '#8F8', s=35) {
    var c = this.canvas[0];
		var ctx = c.getContext("2d");

    ctx.strokeStyle = '#343a40';
    ctx.strokeRect(x1, y1, x1+w, y1+h);

    ctx.fillStyle = '#ccc';
    ctx.font = '20px serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, x1+w/2, y1+h/2 - 15);

    ctx.fillStyle = clr;
    ctx.font = s + 'px serif';
    ctx.fillText(v, x1+w/2, y1+h/2 + 20);
  }


  drawPill(label, x, y, w, color) {
    var c = this.canvas[0];
		var ctx = c.getContext("2d");

    ctx.fillStyle = color;
    // draw pill
    var r = 8;
    var x1 = x - w/2 + r;
    var x2 = x + w/2 - r;
  
    ctx.beginPath();
    ctx.arc(x1, y+r, r, 0, 2 * Math.PI);
    ctx.fill();
  
    ctx.beginPath();
    ctx.fillRect(x1,y, w - 2*r, 2*r);
  
    ctx.beginPath();
    ctx.arc(x2, y + r, r, 0, 2 * Math.PI);
    ctx.fill();
  
    // draw label
    ctx.textAlign = 'center';
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(label, x, y+12);
  }


  drawLabelledHand(ang, label, r1, r2, color) {
    var c = this.canvas[0];
		var ctx = c.getContext("2d");

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


  queryParam(param) {
    var qm = new DLM.DroneLinkMsg();
    qm.node = this.channel.node.id;
    qm.channel = this.channel.channel;
    qm.param = param;
    qm.setUint8([ 0 ]);
    qm.msgType = DLM.DRONE_LINK_MSG_TYPE_QUERY;
    this.state.send(qm);
  }

  setAndQueryUint8Param(param, value) {
    var qm = new DLM.DroneLinkMsg();
    qm.node = this.channel.node.id;
    qm.channel = this.channel.channel;
    qm.param = param;
    qm.setUint8([ value ]);
    this.state.send(qm);

    this.queryParam(param);
  }


	onParamValue(data) {
    this.updateNeeded = true;
  }


  updateIfNeeded() {
    if (this.updateNeeded) this.update();
  }

  update() {
		if (!this.built || !this.visible) return false;

    this.updateNeeded = false;

    return true;
  }


	build(className) {
    this.ui = $('<div class="'+className+' text-center"></div>');
    this.channel.interfaceTab.append(this.ui);
		this.built = true;
  }


  finishBuild() {
    this.updateNeeded = true;
  }


  show() {
    if (!this.built) this.build();
    this.visible = true;
    this.update();
  }


  hide() {
    this.visible = false;
  }
}
