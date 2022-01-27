import loadStylesheet from '../../loadStylesheet.js';
import * as DLM from '../../droneLinkMsg.mjs';


export default class RFM69 {
	constructor(channel, state) {
    this.channel = channel;
    this.state = state;
    this.built = false;

    this.RSSI = [];
    this.lastPackets = [0,0,0];
    this.sendRate = 0;
    this.receiveRate = 0;
    this.lastPacketTime = Date.now();
	}

  drawValue(x,y,label,v) {
    var c = this.canvas[0];
		var ctx = c.getContext("2d");

    ctx.fillStyle = '#FFF';
		ctx.textAlign = 'left';
    ctx.font = '12px serif';
    ctx.fillText(label, x, y+15);
    ctx.fillStyle = '#5f5';
    ctx.font = '20px bold serif';
    ctx.fillText(v, x, y+35);
  }

	onParamValue(data) {
    if (data.param == 8 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_FLOAT) {
      this.RSSI.push(data.values[0]);

      // if too many vectors, lose one
      if (this.RSSI.length > 100) this.RSSI.shift();
    }

    if (data.param == 9 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_UINT32_T) {
      // update packet rate info
      var t = Date.now();
      var dt = (t - this.lastPacketTime) / 1000;
      this.sendRate = (data.values[0] - this.lastPackets[0]) / dt;
      this.receiveRate = (data.values[1] - this.lastPackets[1]) / dt;

      this.lastPackets = data.values;

      this.lastPacketTime = t;
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
    var rssi = this.state.getParamValues(node, channel, 8, [0])[0];
    var packets = this.state.getParamValues(node, channel, 9, [0,0,0]);


    // render graph
    // -------------------------------------------------------------------------
    var w1 = w;
		var cx = w1/2;

		ctx.fillStyle = '#343a40';
		ctx.fillRect(0,0,w1,h);

    if (this.RSSI.length > 0) {
      ctx.strokeStyle = "#ff5";
      ctx.strokeWidth = "2";
      for (var i=0; i<this.RSSI.length; i++) {
        var x = i * w1 / this.RSSI.length;
        var y = h * this.RSSI[i] / 100 ;

        if (i==0) {
          ctx.moveTo(x,y);
        } else {
          ctx.lineTo(x,y);
        }

      }
      ctx.stroke();
    }

    // overlay packet counters
    this.drawValue(5,0,'Sent', packets[0].toFixed(0));
    this.drawValue(5,40,'', this.sendRate.toFixed(1) + '/s');

    this.drawValue(w/4,0,'Received', packets[1].toFixed(0));
    this.drawValue(w/4,40,'', this.receiveRate.toFixed(1) + '/s');

    this.drawValue(w/2,0,'Rejected', packets[2].toFixed(0));
    this.drawValue(3*w/4,0,'RSSI', -rssi.toFixed(0));

  }

	build() {
		this.built = true;

		this.ui = $('<div class="RFM69 text-center"></div>');
    this.canvas = $('<canvas height=100 />');

		this.ui.append(this.canvas);
    this.channel.interfaceTab.append(this.ui);

    this.built = true;

    this.update();
  }
}
