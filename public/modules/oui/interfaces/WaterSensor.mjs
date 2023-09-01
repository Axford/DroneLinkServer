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
      data.param == 9 &&
      (data.msgType == DLM.DRONE_LINK_MSG_TYPE_UINT8_T ||
        data.msgType == DLM.DRONE_LINK_MSG_TYPE_FLOAT)
    ) {
      // 9 - satellites
      var d = data.values[0];
      if (d < 4) {
        this.widget.removeClass("warning");
        this.widget.addClass("danger");
      } else if (d < 9) {
        this.widget.removeClass("danger");
        this.widget.addClass("warning");
      } else {
        this.widget.removeClass("danger");
        this.widget.removeClass("warning");
      }
      this.widgetText.html(d.toFixed(0));
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
    ctx.fillStyle = '#55f';
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
