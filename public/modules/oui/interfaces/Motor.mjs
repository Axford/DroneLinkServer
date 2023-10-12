import ModuleInterface from "./ModuleInterface.mjs";
import loadStylesheet from "../../loadStylesheet.js";
import * as DLM from "../../droneLinkMsg.mjs";

export default class Motor extends ModuleInterface {
  constructor(channel, state) {
    super(channel, state);
  }

  onParamValue(data) {
    if (!this.built) return;

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
    var speed = this.state.getParamValues(node, channel, 8, [0])[0];
    var limits = this.state.getParamValues(node, channel, 12, [-1,1]);
    var deadband = this.state.getParamValues(node, channel, 13, [0])[0];

    // calcs
    var range = limits[1] - limits[0];

    // render
    // -------------------------------------------------------------------------
    var padding = 5;
    var w1 = w - 2*padding;
    var h1 = h - 2*padding;
    var cx = w / 2;
    var cy = h/2;

    // centre line
    var clx = padding + w1 * -limits[0] / range;

    // background
    ctx.fillStyle = "#343a40";
    ctx.fillRect(0, 0, w, h);

    // frame
    ctx.strokeStyle = '#888';
    ctx.beginPath();
    ctx.rect(padding, padding, w1, h1);
    ctx.moveTo(clx,padding);
    ctx.lineTo(clx, h-padding);
    ctx.stroke();

    // current speed
    ctx.fillStyle = Math.abs(speed) < deadband ? '#885' : '#8f8';
    var w2 = Math.abs(w1*speed/range);
    if (speed > 0) {
        ctx.fillRect(clx, padding+1, w2, h1-2);
    } else {
        ctx.fillRect(clx - w2, padding+1, w2, h1-2);
    }

    // deadband
    w2 = w1 * deadband/range;
    ctx.fillStyle = "rgba(128,128,128,0.3)";
    ctx.fillRect(clx - w2, padding+1, 2*w2, h1-2);

    // speed
    this.drawValue(padding+5,padding,'Speed',speed.toFixed(1), '#8f8');
    
  }

  build() {
    super.build("Motor");

    this.canvas = $("<canvas height=100 />");

    this.ui.append(this.canvas);

    super.finishBuild();
  }
}
