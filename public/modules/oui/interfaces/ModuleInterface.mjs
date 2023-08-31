import loadStylesheet from '../../loadStylesheet.js';
import * as DLM from '../../droneLinkMsg.mjs';
import { degreesToRadians } from '../../navMath.mjs';

export default class INA219 {
	constructor(channel, state) {
    this.channel = channel;
    this.state = state;
    this.built = false;
    this.visible = false;
    this.updateNeeded = false;
	}


  drawValue(x,y,label,v, fillColor) {
    var c = this.canvas[0];
		var ctx = c.getContext("2d");

    ctx.fillStyle = '#FFF';
		ctx.textAlign = 'left';
    ctx.font = '12px serif';
    ctx.fillText(label, x, y+15);
    ctx.font = '20px bold serif';
		ctx.fillStyle = fillColor ? fillColor : '#8f8';
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


  drawCompassIndicator(cx, cy, outerR, innerR, v, label, fontSize) {
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
    ctx.strokeStyle = '#8f8';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(cx + innerR*Math.cos(v), cy + innerR*Math.sin(v));
    ctx.lineTo(cx + (outerR+10)*Math.cos(v), cy + (outerR+10)*Math.sin(v) );
    ctx.stroke();

    ctx.fillStyle = '#8f8';
    ctx.font = (fontSize ? fontSize : 20) + 'px bold serif';
		ctx.textAlign = 'center';
    ctx.fillText(label + '°', cx, cy+6);
  }


  drawArtificialHorizon(pitch, roll, x, y, w, h) {
    var c = this.canvas[0];
		var ctx = c.getContext("2d");

    // draw horizon
    // calculate centre point based on pitch
    var cx = x + w/2;
    var cy = y + h/2;

    // positive pitches are up
    var y1 = cy + h * Math.sin(degreesToRadians(pitch));
  
    var r=2*w;

    // calculate roll offset, at radius w
    // positive roll is to the left
    var yOffset = r * Math.sin(degreesToRadians(roll));
    var xOffset = r * Math.cos(degreesToRadians(roll));
    
    ctx.fillStyle = '#558';
    ctx.beginPath();
    ctx.moveTo(cx-xOffset, y1-yOffset);
    ctx.lineTo(cx+xOffset, y1+yOffset);
    ctx.arc(cx,y1, r, degreesToRadians(roll), degreesToRadians(roll+180));
    ctx.fill();

    // draw pitch lines
    // centre line
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    var x1 = x + w * 0.25;
    var x2 = x + w * 0.4;
    ctx.moveTo(x1,cy);
    ctx.lineTo(x2,cy);
    x1 = x + w * 0.6;
    x2 = x + w * 0.75;
    ctx.moveTo(x1,cy);
    ctx.lineTo(x2,cy);

    // +-10 degree lines
    x1 = x + w * 0.25;
    x2 = x + w * 0.75;
    for (var i=1; i < 3; i++) {
      var y2 = h * Math.sin(degreesToRadians(i * 10));
      ctx.moveTo(x1,cy + y2);
      ctx.lineTo(x2,cy + y2);

      ctx.moveTo(x1,cy - y2);
      ctx.lineTo(x2,cy - y2);

      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.textAlign = 'left';
      ctx.font = '12px serif';
      ctx.fillText(i*10, x2+4, cy+y2+4);
      ctx.fillText(i*10, x2+4, cy-y2+4);
    }
    ctx.stroke();
  }


  drawDialIndicator(label, vStr, v, vMin, vMax, x, y, w, h, clr, padding=5) {
    var c = this.canvas[0];
      var ctx = c.getContext("2d");
  
    var ratio = (v - vMin)/(vMax - vMin);
    if (ratio > 1) ratio = 1;
    if (ratio < 0) ratio = 0;
  
    var cx = x + w/2;
    var cy = y + h/2;
    var rOuter = Math.min(w,h) / 2 - padding;
    var rInner = rOuter - 5;
    var a1 = degreesToRadians(135);
    var a2 = degreesToRadians(45);
  
    // background
    ctx.fillStyle = '#888';
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, rInner, a1, a2);
    ctx.arc(cx, cy, rOuter, a2, a1, true);
    ctx.stroke();
  
    // foreground
    var a2 = degreesToRadians(135 + 270 * ratio);
    ctx.fillStyle = clr;
    ctx.beginPath();
    ctx.arc(cx, cy, rInner, a1, a2);
    ctx.arc(cx, cy, rOuter, a2, a1, true);
    ctx.fill();
  
    // central value
    ctx.font = '20px bold serif';
  
    // measure text at default size
    var tm = ctx.measureText(vStr);
    // rescale font 
    var fs = 20 * (rInner * 2 - 20) / tm.width;
    ctx.font = fs.toFixed(0)+'px bold serif';
    tm = ctx.measureText(vStr);
  
    ctx.fillStyle = '#8f8';
    ctx.textAlign = 'center';
    ctx.fillText(vStr, cx, cy + tm.actualBoundingBoxAscent/2);
  
    ctx.fillStyle = '#aaa';
    ctx.font = '12px serif';
    ctx.fillText(label, cx, cy + rInner);
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

    // check to see if ui has been initialised

    if (this.ui.width() < 1) return;

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
    if (this.visible) this.update();
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
