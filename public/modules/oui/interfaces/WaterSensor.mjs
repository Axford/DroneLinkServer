import ModuleInterface from "./ModuleInterface.mjs";
import loadStylesheet from "../../loadStylesheet.js";
import * as DLM from "../../droneLinkMsg.mjs";

export default class WaterSensor extends ModuleInterface {
  constructor(channel, state) {
    super(channel, state);
  }

  onParamValue(data) {
    if (!this.built) return;

    // raw
    if (
      data.param == 11 &&
      (data.msgType == DLM.DRONE_LINK_MSG_TYPE_UINT32_T)
    ) {
      var d = data.values[0];

      // see if we have a valid threshold
      var node = this.channel.node.id;
      var channel = this.channel.channel;
      var threshold = this.state.getParamValues(node, channel, 12, [0])[0];

      if (threshold > 0) {
        var ratio = d / threshold;
        this.widgetText.html((100 * ratio).toFixed(0) + '%');

        if (ratio > 0.5 && ratio < 1) {
            this.widget.addClass("warning");
        } else {
            this.widget.removeClass("warning");
        }
      } else {
        this.widgetText.html(d);
      }
    }

    // alarm
    if (
        data.param == 13 &&
        (data.msgType == DLM.DRONE_LINK_MSG_TYPE_FLOAT)
      ) {
        var d = data.values[0];
        if (d >= 1) {
          this.widget.removeClass("warning");
          this.widget.addClass("danger");
        } else {
          this.widget.removeClass("danger");
          this.widget.removeClass("warning");
        }
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
    var raw = this.state.getParamValues(node, channel, 11, [0])[0];
    var threshold = this.state.getParamValues(node, channel, 12, [0])[0];
    var alarm = this.state.getParamValues(node, channel, 13, [0])[0];

    ctx.fillStyle = '#343a40';
    ctx.fillRect(0,0,w,h);

    // raw
    this.drawValue(5, 0, "Raw", raw.toFixed(0));

    // threshold
    this.drawValue(5, 40, "Threshold", threshold.toFixed(0));

    // threshold
    this.drawValue(5, 80, "Alarm", alarm.toFixed(0));

    // draw bar graph
    var x1 = w/2;
    var y1 = 10;

    ctx.strokeStyle = '#aaa';
    ctx.beginPath();
    ctx.rect(x1, y1, w/3, h-20);
    ctx.stroke();

    var h2 = (h-20) * raw / 4096;
    ctx.fillStyle = alarm > 0 ? '#f55' : '#55f';
    ctx.fillRect(0,h-20-h2,w,h2);

    if (threshold > 0) {
        var h3 = (h-20) * threshold / 4096;
        ctx.strokeStyle = '#f55';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x1-5, h-20-h3);
        ctx.lineTo(x1+w/3+5, h-20-h3);
        ctx.stroke();
    }
  }

  build() {
    super.build("WaterSensor");

    this.canvas = $("<canvas height=120 />");

    this.ui.append(this.canvas);

    // widget
    this.widget = $(
      '<div class="widget"><i class="fas fa-water"></i></div>'
    );
    this.channel.node.addWidget(this.widget);

    this.widgetText = $("<span>?</span>");
    this.widget.append(this.widgetText);

    super.finishBuild();
  }
}
