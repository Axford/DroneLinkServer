import ModuleInterface from "./ModuleInterface.mjs";
import loadStylesheet from "../../loadStylesheet.js";
import * as DLM from "../../droneLinkMsg.mjs";

loadStylesheet("./css/modules/oui/interfaces/Management.css");

export default class Management extends ModuleInterface {
  constructor(channel, state) {
    super(channel, state);
	
	this.lastUptime = 0;
  }

  update() {
	if (!this.built) return;
	
	var node = this.channel.node.id;
    var channel = this.channel.channel;

	var uptime = this.state.getParamValues(node, channel, 13, [0])[0];

	if (uptime < this.lastUptime) {
		$(this.channel.node.ui).notify("Node "+this.channel.node.id + ' > ' + this.channel.node.name+" appears to have rebooted",  {
			className: 'error',
			autoHide:false,
			arrowShow:false,
			position:'right'
		});
	}
	this.lastUptime = uptime;

    if (!super.update()) return;

    var c = this.canvas[0];
    var ctx = c.getContext("2d");

    // keep width updated
    var w = this.ui.width();
    ctx.canvas.width = w;
    var h = this.ui.height();

    var mw = w / 3;

    ctx.fillStyle = "#343a40";
    ctx.fillRect(0, 0, w, 200);

    /*
		Uptime
		*/

    var s = "";

    var days = Math.floor(uptime / (3600 * 24));
    uptime = uptime - days * 3600 * 24;
    var hours = Math.floor(uptime / 3600);
    uptime = uptime - hours * 3600;
    var minutes = Math.floor(uptime / 60);
    var seconds = uptime - minutes * 60;

    if (days > 0) {
      s += days + "d ";
    }
    if (hours > 0) {
      s += String(hours).padStart(2, "0") + ":";
    }
    s += String(minutes).padStart(2, "0") + ":";
    s += String(seconds).padStart(2, "0");

    this.drawLabel("Uptime", 0, 0, mw, 20);
    this.drawMeterValueScaled(s, 0, 25, mw, 30, "#8f8");

    /*
		Firmware version
		*/

    if (
      this.channel.node.firmwareVersion != "" &&
      this.channel.node.latestFirmwareVersion != ""
    ) {
      var diffVersions =
        this.channel.node.firmwareVersion !=
        this.channel.node.latestFirmwareVersion;

      this.drawLabel("Firmware", mw, 0, mw, 20);
      var s = this.channel.node.firmwareVersion;
      this.drawMeterValueScaled(
        s,
        mw,
        25,
        mw,
        30,
        diffVersions ? "#f55" : "#8f8"
      );
    }

    /*
		IP address
		*/

    this.drawLabel("IP", 2 * mw, 0, mw, 20);
    var ipAddress = this.state.getParamValues(node, channel, 12, [0, 0, 0, 0]);
    if (ipAddress[0] != 0) {
      var ipString = ipAddress.join(".");
      this.drawMeterValueScaled(ipString, 2 * mw, 25, mw, 30, "#8f8");
    }
  }

  onParamValue(data) {
    //if (!this.built) return;

    if (data.param == 13 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_UINT32_T) {
      this.updateNeeded = true;
    }

    if (data.param == 12 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_UINT8_T) {
      // IP
      this.updateNeeded = true;
    }

    // firmware version?
    if (data.param == 9 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_CHAR) {
      this.channel.node.firmwareVersion = data.values[0];
      this.updateNeeded = true;
    }

    //this.updateNeeded = true;
  }

  build() {
    super.build("Management");

    var node = this.channel.node.id;
    var channel = this.channel.channel;

    this.canvas = $('<canvas height=70 class="mb-2" />');

    this.ui.append(this.canvas);

    this.config = $(
      '<button class="btn btn-sm btn-primary mb-2 ml-1 mr-1">Web Mgmt</button>'
    );
    this.config.on("click", () => {
      // get node IP address
      var ipAddress = this.state.getParamValues(
        node,
        channel,
        12,
        [0, 0, 0, 0]
      );
      var ipString = ipAddress.join(".");

      window.open("http://" + ipString);
    });
    this.ui.append(this.config);

    this.saveConfigBut = $(
      '<button class="btn btn-sm btn-primary mb-2 mr-3">Save Config</button>'
    );
    this.saveConfigBut.on("click", () => {
      var qm = new DLM.DroneLinkMsg();
      qm.source = this.state.localAddress;
      qm.node = this.channel.node.id;
      qm.channel = 1;
      qm.param = 17;
      qm.setUint8([1]);
      this.state.send(qm);
    });
    this.ui.append(this.saveConfigBut);

    this.reset = $(
      '<button class="btn btn-sm btn-danger mb-2 mr-3">Reset</button>'
    );
    this.reset.on("click", () => {
      var qm = new DLM.DroneLinkMsg();
      qm.source = this.state.localAddress;
      qm.node = this.channel.node.id;
      qm.channel = 1;
      qm.param = 10;
      qm.setUint8([1]);
      this.state.send(qm);
    });
    this.ui.append(this.reset);

    super.finishBuild();
  }
}
