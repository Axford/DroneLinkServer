import loadStylesheet from '../../loadStylesheet.js';
import * as DLM from '../../droneLinkMsg.mjs';

loadStylesheet('./css/modules/oui/interfaces/Management.css');


export default class Management {
	constructor(channel, state) {
    this.channel = channel;
    this.state = state;
    this.built = false;
	}

	update() {

	}


	updateIP() {
		var node = this.channel.node.id;
    var channel = this.channel.channel;

		var ipAddress = this.state.getParamValues(node, channel, 12, [0,0,0,0]);
		console.log('ip', ipAddress);
		if (ipAddress[0] != 0) {
			var ipString = ipAddress.join('.');
			this.ipAddress.html('IP: '+ipString);

			//this.updateMacros(ipString);
		}
	}

	onParamValue(data) {
    if (data.param == 13 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_UINT32_T) {
			var uptime = data.values[0];
			if (uptime == undefined) uptime = 0;

			var s = '';

			var days = Math.floor(uptime / (3600*24));
			uptime = uptime - (days * 3600*24);
			var hours = Math.floor(uptime / (3600));
			uptime = uptime - (hours * 3600);
			var minutes = Math.floor(uptime / 60);
			var seconds = uptime - (minutes * 60);

			if (days > 0) {
				s += days + 'd ';
			}
			if (hours > 0) {
				s += String(hours).padStart(2, '0') + ':';
			}
			s += String(minutes).padStart(2, '0') + ':';
			s += String(seconds).padStart(2, '0');

			this.uptime.html('Uptime: ' + s);
		}

		if (data.param == 12 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_UINT8_T) {
			// ip
			this.updateIP();
		}
  }


	build() {
    var node = this.channel.node.id;
    var channel = this.channel.channel;

		this.ui = $('<div class="Management"></div>');

    // uptime
		this.uptime = $('<div class="uptime">Uptime: ?</div>');
    this.ui.append(this.uptime);

		// uptime
		this.ipAddress = $('<div class="ipAddress">IP: ?</div>');
    this.ui.append(this.ipAddress);


		this.config = $('<button class="btn btn-sm btn-primary mb-2 ml-1 mr-1">Config</button>');
		this.config.on('click', ()=>{
			// get node IP address
			var ipAddress = this.state.getParamValues(node, channel, 12, [0,0,0,0]);
			var ipString = ipAddress.join('.');

			window.open('http://' + ipString);
		});
		this.ui.append(this.config);

		this.reset = $('<button class="btn btn-sm btn-danger mb-2 mr-3">Reset</button>');
		this.reset.on('click', ()=>{
			var qm = new DLM.DroneLinkMsg();
			qm.source = this.state.localAddress;
			qm.node = this.channel.node.id;
			qm.channel = 1;
			qm.param = 10;
			qm.setUint8([ 1 ]);
			this.state.send(qm);
		});
		this.ui.append(this.reset);

		this.macroButtons = $('<div class="macros"></div>');
		this.ui.append(this.macroButtons);

		this.updateIP();


		this.channel.interfaceTab.append(this.ui);

    this.built = true;

    this.update();
  }
}
