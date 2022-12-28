import ModuleInterface from './ModuleInterface.mjs';
import loadStylesheet from '../../loadStylesheet.js';
import * as DLM from '../../droneLinkMsg.mjs';


export default class RFM69 extends ModuleInterface {
	constructor(channel, state) {
    super(channel, state);

    this.RSSI = [];
	}


	onParamValue(data) {
    if (!this.built) return;

    if (data.param == 8 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_FLOAT) {
			var d = data.values[0];
      this.RSSI.push(d);

			this.widgetText.html('-' + d.toFixed(0) + 'db');
			if (d > 40) {
				this.widget.removeClass('warning');
				this.widget.addClass('danger');
			} else if (d > 30) {
				this.widget.removeClass('danger');
				this.widget.addClass('warning');
			} else {
				this.widget.removeClass('danger');
				this.widget.removeClass('warning');
			}

      // if too many vectors, lose one
      if (this.RSSI.length > 100) this.RSSI.shift();
    }

		if (data.param == 11 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_FLOAT) {
			var p = Math.round(data.values[0]);
			this.powerSelect.val(p);
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
    var rssi = this.state.getParamValues(node, channel, 8, [0])[0];
    var packets = this.state.getParamValues(node, channel, 9, [0,0,0]);
		var rates = this.state.getParamValues(node, channel, 10, [0,0,0]);

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
    this.drawValue(5,40,'', rates[0].toFixed(1) + '/s');

    this.drawValue(w/4,0,'Received', packets[1].toFixed(0));
    this.drawValue(w/4,40,'', rates[1].toFixed(1) + '/s');

    this.drawValue(w/2,0,'Rejected', packets[2].toFixed(0));
		this.drawValue(w/2,40,'', rates[2].toFixed(1) + '/s');

    this.drawValue(3*w/4,0,'RSSI', -rssi.toFixed(0));
  }

	build() {
		super.build('RFM69');

		// power select
		this.powerSelect = $('<select class="RFMPowerSelect"></select>');
    // add power options
		for (var i=-14; i<=20; i++) {
			this.powerSelect.append($('<option value="'+i+'">'+i+'</option>'));
		}
    this.powerSelect.change((e)=>{
      // get value
      var newPower = this.powerSelect.val();

			var qm = new DLM.DroneLinkMsg();
			qm.node = this.channel.node.id;
			qm.channel = this.channel.channel;
			qm.param = 11;
			qm.setFloat([ newPower ]);
			this.state.send(qm);
    });

    this.ui.append(this.powerSelect);

		// canvas
    this.canvas = $('<canvas height=100 />');

		this.ui.append(this.canvas);

		// widget
		this.widget = $('<div class="widget"><i class="fas fa-broadcast-tower"></i></div>');
		this.channel.node.addWidget(this.widget);

		this.widgetText = $('<span>?db</span>');
		this.widget.append(this.widgetText);

    super.finishBuild();
  }
}
