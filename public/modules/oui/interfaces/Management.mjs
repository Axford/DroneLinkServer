import ModuleInterface from "./ModuleInterface.mjs";
import loadStylesheet from "../../loadStylesheet.js";
import * as DLM from "../../droneLinkMsg.mjs";

loadStylesheet("./css/modules/oui/interfaces/Management.css");

import moduleInfo from "/moduleInfo.json" assert { type: "json" };

function decimalToHex(d, padding) {
  var hex = Number(d).toString(16);
  padding = typeof (padding) === "undefined" || padding === null ? padding = 2 : padding;

  while (hex.length < padding) {
      hex = "0" + hex;
  }

  return hex;
}


function resetCodeToString(code) {
  var rs = "";
    switch (code) {
      case 1:
        rs = "POWERON";
        break; /**<1, Vbat power on reset*/
      case 3:
        rs = "SW";
        break; /**<3, Software reset digital core*/
      case 4:
        rs = "OWDT";
        break; /**<4, Legacy watch dog reset digital core*/
      case 5:
        rs = "DEEPSLEEP";
        break; /**<5, Deep Sleep reset digital core*/
      case 6:
        rs = "SDIO";
        break; /**<6, Reset by SLC module, reset digital core*/
      case 7:
        rs = "TG0WDT_SYS";
        break; /**<7, Timer Group0 Watch dog reset digital core*/
      case 8:
        rs = "TG1WDT_SYS";
        break; /**<8, Timer Group1 Watch dog reset digital core*/
      case 9:
        rs = "RTCWDT_SYS";
        break; /**<9, RTC Watch dog Reset digital core*/
      case 10:
        rs = "INTRUSION";
        break; /**<10, Instrusion tested to reset CPU*/
      case 11:
        rs = "TGWDT_CPU";
        break; /**<11, Time Group reset CPU*/
      case 12:
        rs = "SW_CPU";
        break; /**<12, Software reset CPU*/
      case 13:
        rs = "RTCWDT_CPU";
        break; /**<13, RTC Watch dog Reset CPU*/
      case 14:
        rs = "EXT_CPU";
        break; /**<14, for APP CPU, reseted by PRO CPU*/
      case 15:
        rs = "RTCWDT_BROWN_OUT";
        break; /**<15, Reset when the vdd voltage is not stable*/
      case 16:
        rs = "RTCWDT_RTC";
        break; /**<16, RTC Watch dog reset digital core and rtc module*/
      default:
        rs = "Unknown";
    }
    return rs;
}


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
      $(this.channel.node.ui).notify(
        "Node " +
          this.channel.node.id +
          " > " +
          this.channel.node.name +
          " appears to have rebooted",
        {
          className: "error",
          autoHide: false,
          arrowShow: false,
          position: "right",
        }
      );
    }
    this.lastUptime = uptime;

    if (!super.update()) return;

    var reset = this.state.getParamValues(node, channel, 10, [0, 0, 0]);

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

    // horizontal line
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 62);
    ctx.lineTo(w, 62);
    ctx.stroke();
    

    this.drawValue(10, 60, "Reset Code 0", resetCodeToString(reset[1]), "#8f8");
    this.drawValue(w/2, 60, "Reset Code 1", resetCodeToString(reset[2]), "#8f8");
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

  getIpString() {
    var node = this.channel.node.id;
    var channel = this.channel.channel;

    // get node IP address
    var ipAddress = this.state.getParamValues(node, channel, 12, [0, 0, 0, 0]);

    // if ip address is 0 ... then send a query for it
    if (ipAddress[0] == 0) this.queryParam(12);

    return ipAddress.join(".");
  }

  showNodeInfo() {
    var me = this;
    me.vTitle.html("Network Info");
    me.vBody.html('Loading...');

    $.getJSON("http://" + me.getIpString() + "/nodeInfo", function (data) {
      //var s = JSON.stringify(data);
      var s = "";

      // interfaces
      s += "<h4>Interfaces</h4>";
      s += '<table class="table table-sm table-bordered">';
      s += '<thead class="thead-dark">';
      s += "<tr>";
      s += "<th>ID</th>";
      s += "<th>Type</th>";
      s += "<th>State</th>";
      s += "<th>Link</th>";
      s += "</tr>";
      s += '</thead>';
      data.interfaces.forEach((obj) => {
        s += "<tr>";
        s += "<td>" + obj.id + "</td>";
        s += "<td>" + obj.type + "</td>";
        s += '<td class="'+ (obj.state == 'Up' ? 'bg-success text-white' : '') +'">' + obj.state + "</td>";
        s += "<td>" + obj.link + "</td>";
        s += "</tr>";
      });
      s += "</table>";

      // routes
      s += "<h4>Routes</h4>";
      s += '<table class="table table-sm table-bordered">';
      s += '<thead class="thead-dark">';
      s += "<tr>";
      s += "<th>ID</th>";
      s += "<th>Name</th>";
      s += "<th>Seq</th>";
      s += "<th>Metric</th>";
      s += "<th>Next Hop</th>";
      s += "<th>Age</th>";
      s += "<th>Uptime</th>";
      s += "<th>Interface</th>";
      s += "<th>Int. Type</th>";
      s += "<th>Avg Attempts</th>";
      s += "<th>Avg Tx</th>";
      s += "<th>Avg Ack</th>";
      s += "<th>Given Up</th>";
      s += "</tr>";
      s += '</thead>';
      data.routes.forEach((obj) => {
        s += "<tr>";
        s += "<td>" + obj.id + "</td>";
        s += "<td>" + obj.name + "</td>";
        s += "<td>" + obj.seq + "</td>";
        s += "<td>" + obj.metric + "</td>";
        s += "<td>" + obj.nextHop + "</td>";
        s += "<td>" + obj.age + " s</td>";
        s += "<td>" + obj.up + "</td>";
        s += "<td>" + obj.iName + "</td>";
        s += "<td>" + obj.iType + "</td>";
        s += "<td>" + obj.avgAt + "</td>";
        s += "<td>" + obj.avgTx + " ms</td>";
        s += "<td>" + obj.avgAck + " ms</td>";
        s += "<td>" + obj.gU + "</td>";
        s += "</tr>";
      });
      s += "</table>";

      // queue
      s += "<h4>Tx Queue</h4>";

      s += '<dl class="row">';
      s += '<dt class="col-sm-3">Utilisation</dt>';
      s += '<dd class="col-sm-9">'+data.queue.utilisation+' %</dd>';
      s += '<dt class="col-sm-3">Size</dt>';
      s += '<dd class="col-sm-9">'+data.queue.size+'</dd>';
      s += '<dt class="col-sm-3">Kicked (rate)</dt>';
      s += '<dd class="col-sm-9">'+data.queue.kicked+ ' (' + data.queue.kickRate.toFixed(1) + ')</dd>';
      s += '<dt class="col-sm-3">Choked (rate)</dt>';
      s += '<dd class="col-sm-9">'+data.queue.choked+ ' (' + data.queue.chokeRate.toFixed(1) + ')</dd>';
      s += '</dl>';

      s += '<table class="table table-sm table-bordered">';
      s += '<thead class="thead-dark">';
      s += "<tr>";
      s += "<th>Index</th>";
      s += "<th>State</th>";
      s += "<th>Int</th>";
      s += "<th>Info</th>";
      s += "</tr>";
      s += '</thead>';
      data.queue.items.forEach((obj) => {
        s += "<tr>";
        s += "<td>" + obj.i + "</td>";
        s += "<td>" + obj.state + "</td>";
        s += "<td>" + obj.int + "</td>";
        s += "</tr>";
      });
      s += "</table>";

      me.vBody.html(s);
    });
  }


  paramToRow(param, incReceived) {
    // return html table row
    var s = '';
    s += "<tr>";
    s += "<td>" + param.id + "</td>";
    s += '<td class="'+ (param.publish ? 'bg-success text-white' : '') +'">' + param.name + "</td>";
    //s += "<td>" + param.publish + "</td>";
    s += "<td>" + DLM.DRONE_LINK_MSG_TYPE_NAMES[param.type] + "</td>";
    //s += "<td>" + param.writeable + "</td>";
    s += "<td>" + param.size + "</td>";
    s += '<td class="'+ (param.writeable ? 'bg-info text-white' : '') +'">';
    if (Array.isArray(param.value)) {
      param.value.forEach((v, index)=>{
        if (index > 0) s += ', ';
        s += v;
      });
    } else {
      s += param.value;
    }
    s += "</td>";
    if (incReceived) {
      s += '<td class="'+ (param.received ? 'bg-success text-white' : '') +'">' + (param.received ? 'Y' : 'N') + "</td>";
    }
    s += "</tr>";
    return s;
  }



  showModuleInfo() {
    var me = this;
    me.vTitle.html("Loaded Modules");
    me.vBody.html('Loading...');

    $.getJSON("http://" + me.getIpString() + "/modules", function (data) {
      //var s = JSON.stringify(data);
      var s = "";

      // count up params across all modules
      var totalParams = 0;
      data.forEach((module) => {
        totalParams += module.mgmt.length;
        totalParams += module.params.length;
        totalParams += module.subs.length;
      });

      s += '<h1>' + data[0].params[0].value +': ' +data.length+' <span class="text-muted font-weight-light"> Modules, </span> ' +totalParams+'<span class="text-muted font-weight-light"> Parameters</span> </h1>';



      data.forEach((module) => {
        s += '<h2 class=mt-4>'+module.id+'. '+ module.mgmt[1].value +'</h2>';

        s += '<div class="row">';

        s += '<div class="col-sm-4">';
        s += '<dl class="row">';
        s += '<dt class="col-sm-8">HandleLinkMsg Duration</dt>';
        s += '<dd class="col-sm-4">'+module.HLMDuration+' ms</dd>';
        s += '<dt class="col-sm-8">Loop Duration (rate)</dt>';
        s += '<dd class="col-sm-4">'+module.loopDuration+ ' ms (' + (module.loopRate ? module.loopRate.toFixed(1) : '') + ' / sec)</dd>';
        s += '</dl>';
        s += '</div>';

        s += '<div class="col-sm-8">';

        // mgmt params
        s += '<table class="table table-sm table-bordered">';
        s += '<thead class="thead-dark">';
        s += "<tr>";
        s += "<th>ID</th>";
        s += "<th>Name</th>";
        s += "<th>Type</th>";
        s += "<th>Size</th>";
        s += "<th>Value</th>";
        s += "</tr>";
        s += '</thead>';
        module.mgmt.forEach((param)=>{
          s += me.paramToRow(param, false);
        });

        // params
        module.params.forEach((param)=>{
          s += me.paramToRow(param, false);
        });
        s += "</table>";

        // subs
        if (module.subs.length > 0) {
          s += '<p><b>Subs</b></p>'
          s += '<table class="table table-sm table-bordered">';
          s += '<thead class="thead-dark">';
          s += "<tr>";
          s += "<th>ID</th>";
          s += "<th>Name</th>";
          s += "<th>Type</th>";
          s += "<th>Size</th>";
          s += "<th>Value</th>";
          s += "<th>Received</th>";
          s += "</tr>";
          s += '</thead>';
          module.subs.forEach((param)=>{
            s += me.paramToRow(param, true);
          });
          s += "</table>";
        }
        s += '</div>';
        s += '</div>';

      });

      me.vBody.html(s);
    });
  }


  showChannelInfo() {
    var me = this;
    me.vTitle.html("Channel Info");
    me.vBody.html('Loading...');

    $.getJSON("http://" + me.getIpString() + "/channelInfo", function (data) {
      //var s = JSON.stringify(data);
      var s = "";

      data.forEach((channel) => {
        s += '<h2 class=mt-4>'+channel.node+' &gt; '+ channel.channel +'</h2>';

        s += '<div class="row">';

        s += '<div class="col-sm-3">';
        s += '<dl class="row">';
        s += '<dt class="col-sm-8">Size (peak)</dt>';
        s += '<dd class="col-sm-4">'+channel.size+' ('+channel.peakSize+')</dd>';
        s += '</dl>';
        s += '</div>';

        s += '<div class="col-sm-9">';

        s += '<table class="table table-sm table-bordered">';
        s += '<thead class="thead-dark">';
        s += "<tr>";
        s += "<th>Param</th>";
        s += "<th>Sub</th>";
        s += "</tr>";
        s += '</thead>';
        channel.subs.forEach((sub)=>{
          s += "<tr>";
          s += "<td>" + sub.param + "</td>";
          s += "<td>" + sub.sub + "</td>";
          s += "</tr>";
        });
        s += "</table>";

        s += '</div>';
        s += '</div>';
      });

      me.vBody.html(s);
    });
  }


  showPinInfo() {
    var me = this;
    me.vTitle.html("Pin Assignments");
    me.vBody.html('Loading...');

    $.getJSON("http://" + me.getIpString() + "/pins", function (data) {
      //var s = JSON.stringify(data);
      var s = "";

      s += '<table class="table table-sm table-bordered">';
      s += '<thead class="thead-dark">';
      s += "<tr>";
      s += "<th>Pin</th>";
      s += "<th>State</th>";
      s += "<th>Module</th>";
      s += "<th>Output</th>";
      s += "<th>Input</th>";
      s += "<th>Analog</th>";
      s += "<th>Serial</th>";
      s += "<th>LED</th>";
      s += "<th>Strip</th>";
      s += "</tr>";
      s += '</thead>';
      data.forEach((pin)=>{
        s += "<tr>";
        s += "<td>" + pin.id + "</td>";
        s += '<td class="'+ (pin.state == 1 ? 'bg-success text-white' : '') +'">' + (pin.state == 1 ? 'Available' : 'Assigned') + "</td>";
        s += "<td>" + (pin.module ? pin.module : '') + "</td>";
        s += '<td class="'+ (pin.output ? 'bg-info text-white' : '') +'">' + (pin.output ? 'Y' : 'N') + "</td>";
        s += '<td class="'+ (pin.input ? 'bg-info text-white' : '') +'">' + (pin.input ? 'Y' : 'N') + "</td>";
        s += '<td class="'+ (pin.analog ? 'bg-info text-white' : '') +'">' + (pin.analog ? 'Y' : 'N') + "</td>";
        s += '<td class="'+ (pin.serial ? 'bg-info text-white' : '') +'">' + (pin.serial ? 'Y' : 'N') + "</td>";
        s += '<td class="'+ (pin.LED ? 'bg-info text-white' : '') +'">' + (pin.LED ? 'Y' : 'N') + "</td>";
        s += '<td class="'+ (pin.strip ? 'bg-info text-white' : '') +'">' + (pin.strip ? 'Y' : 'N') + "</td>";        
        s += "</tr>";
      });
      s += "</table>";

      me.vBody.html(s);
    });
  }


  showI2CInfo() {
    var me = this;
    me.vTitle.html("I2C Scan");
    me.vBody.html('Loading...');

    $.getJSON("http://" + me.getIpString() + "/i2c", function (data) {
      //var s = JSON.stringify(data);
      var s = "";

      data.forEach((bus)=>{

        if (bus.addresses.length > 0) {
          s += '<h2><span class="text-muted font-weight-light">Bus </span> ' +bus.channel+'</h2>';

          s += '<table class="table table-sm table-bordered">';
          s += '<thead class="thead-dark">';
          s += "<tr>";
          s += "<th>Address</th>";
          s += "<th>Possible Module(s)</th>";
          s += "</tr>";
          s += '</thead>';
          bus.addresses.forEach((address)=>{
            var v = parseInt(address);
            var hexV = '0X' + decimalToHex(v,2).toUpperCase();
            s += "<tr>";
            s += "<td>" + address + ' ('+hexV+')' + "</td>";
            s += '<td><ul>';
            // look for potential module matches
            for (const moduleName in moduleInfo) {
              var m = moduleInfo[moduleName];
              if (m.I2CAddress) {
                // check each entry in array
                m.I2CAddress.forEach((addr)=>{
                  if (addr.toUpperCase() == hexV) {
                    s += '<li>' + m.type + ': ' + m.description + '</li>';
                  }
                });
              }  
            }
            s += '</ul></td>';
            s += "</tr>";
          });
          s += "</table>";
        }
      });

      me.vBody.html(s);
    });
  }


  build() {
    var me = this;
    super.build("Management");

    var node = this.channel.node.id;
    var channel = this.channel.channel;

    this.updateNodeInfoInterval = null;

    this.canvas = $('<canvas height=100 class="mb-2" />');

    this.ui.append(this.canvas);

    

    /*
    --------------  Info btn group ----------------------------
    */
    this.infoBtnGroup = $('<div class="btn-group mr-3"></div>');
    this.ui.append(this.infoBtnGroup);

    this.config = $(
      '<button class="btn btn-sm btn-secondary mb-2"><i class="fas fa-info-circle"></i></button>'
    );
    this.config.on("click", () => {
      window.open("http://" + me.getIpString());
    });
    this.infoBtnGroup.append(this.config);

    this.nodeInfoBut = $(
      '<button class="btn btn-sm btn-primary mb-2">Network</button>'
    );
    this.nodeInfoBut.on("click", () => {
      me.showNodeInfo();
      
      me.updateNodeInfoInterval = setInterval(()=>{
        me.showNodeInfo();
      },5000);

      me.viewer.show();
    });
    this.infoBtnGroup.append(this.nodeInfoBut);

    this.moduleInfoBut = $(
      '<button class="btn btn-sm btn-primary mb-2">Modules</button>'
    );
    this.moduleInfoBut.on("click", () => {
      me.showModuleInfo();
      me.viewer.show();
    });
    this.infoBtnGroup.append(this.moduleInfoBut);

    this.channelInfoBut = $(
      '<button class="btn btn-sm btn-primary mb-2">Channels</button>'
    );
    this.channelInfoBut.on("click", () => {
      me.showChannelInfo();
      me.viewer.show();
    });
    this.infoBtnGroup.append(this.channelInfoBut);

    this.pinInfoBut = $(
      '<button class="btn btn-sm btn-primary mb-2">Pins</button>'
    );
    this.pinInfoBut.on("click", () => {
      me.showPinInfo();
      me.viewer.show();
    });
    this.infoBtnGroup.append(this.pinInfoBut);

    this.i2cInfoBut = $(
      '<button class="btn btn-sm btn-primary mb-2">I2C</button>'
    );
    this.i2cInfoBut.on("click", () => {
      me.showI2CInfo();
      me.viewer.show();
    });
    this.infoBtnGroup.append(this.i2cInfoBut);

    /*
    --------------  Reset btn  ----------------------------------
    */

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

    /*
    --------------  Wifi btn group  ----------------------------------
    */

    this.wifiBtnGroup = $('<div class="btn-group mr-3 mb-2"><button class="btn btn-sm btn-secondary" disabled><i class="fas fa-wifi"></i></button></div>');
    this.ui.append(this.wifiBtnGroup);

    this.wifiOffBtn = $(
      '<button class="btn btn-sm btn-dark">Off</button>'
    );
    this.wifiOffBtn.on("click", () => {
      var qm = new DLM.DroneLinkMsg();
      qm.source = this.state.localAddress;
      qm.node = this.channel.node.id;
      qm.channel = 1;
      qm.param = 18;
      qm.setUint8([0]);
      this.state.send(qm);
    });
    this.wifiBtnGroup.append(this.wifiOffBtn);

    this.wifiOnBtn = $(
      '<button class="btn btn-sm btn-success mr-3">On</button>'
    );
    this.wifiOnBtn.on("click", () => {
      var qm = new DLM.DroneLinkMsg();
      qm.source = this.state.localAddress;
      qm.node = this.channel.node.id;
      qm.channel = 1;
      qm.param = 18;
      qm.setUint8([1]);
      this.state.send(qm);
    });
    this.wifiBtnGroup.append(this.wifiOnBtn);

    /*
    --------------  Save btn ----------------------------------
    */
    this.saveConfigBut = $(
      '<button class="btn btn-sm btn-warning mb-2 mr-3">Save Live Config</button>'
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
    

    /*
    ------------------------------------------------------------
    */


    // json viewer widget
    this.viewer = $('<div class="modal Management-modal" role="dialog" style="display:none;">');

    this.vDialog = $(
      '<div class="modal-dialog modal-dialog-centered" role="document">'
    );
    this.viewer.append(this.vDialog);

    this.vContent = $('<div class="modal-content">');
    this.vDialog.append(this.vContent);

    this.vHeader = $('<div class="modal-header">');
    this.vContent.append(this.vHeader);

    this.vTitle = $('<div class="modal-title h4"></div>');
    this.vHeader.append(this.vTitle);

    this.vBody = $('<div class="modal-body Management-viewer"></div>');
    this.vContent.append(this.vBody);

    this.vFooter = $('<div class="modal-footer">');
    this.vContent.append(this.vFooter);

    this.vCancel = $('<button class="btn btn-danger">Close</button>');
    this.vCancel.on("click", () => {
      if (me.updateNodeInfoInterval) clearInterval(me.updateNodeInfoInterval);
      this.viewer.hide();
    });
    this.vFooter.append(this.vCancel);

    this.viewer.prependTo($(document.body));

    this.viewer.draggable({
      cancel: "input,textarea,button,select,option",
    });

    super.finishBuild();
  }
}
