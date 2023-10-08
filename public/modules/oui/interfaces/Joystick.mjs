import ModuleInterface from "./ModuleInterface.mjs";
import loadStylesheet from "../../loadStylesheet.js";
import * as DLM from "../../droneLinkMsg.mjs";
import { degreesToRadians } from "../../navMath.mjs";

export default class Joystick extends ModuleInterface {
  constructor(channel, state) {
    super(channel, state);

    this.xAxis = 0;
    this.yAxis = 0;
    this.zAxis = 0;
    this.button = 0;
  }

  onParamValue(data) {
    if (!this.built) return;

    if (data.param == 10 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_FLOAT) {
        this.xAxis = parseFloat(data.values[0]);
    }

    if (data.param == 11 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_FLOAT) {
        this.yAxis = parseFloat(data.values[0]);
    }

    if (data.param == 12 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_FLOAT) {
        this.zAxis = parseFloat(data.values[0]);
    }

    if (data.param == 13 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_FLOAT) {
        this.button = parseFloat(data.values[0]);
    }

    this.update(); // draw immediately
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
    var h = 200;

    // keep size updated
    var h1 = Math.max(ctx.canvas.height, 200);

    // fetch params
    /*
    var xAxis = this.state.getParamValues(node, channel, 10, [0])[0];
    var yAxis = this.state.getParamValues(node, channel, 11, [0])[0];
    var zAxis = this.state.getParamValues(node, channel, 12, [0])[0];
    var button = this.state.getParamValues(node, channel, 13, [0])[0];
    */

    // render vector view
    // -------------------------------------------------------------------------
    
    ctx.fillStyle = "#343a40";
    ctx.fillRect(0, 0, w, h);

    var minAxis = w;
    if (h < w) minAxis = h;

    // calc dimensions for joystick area
    var cx = w/2;
    var cy = h/2;
    var r1 = 20; // radius of button

    var w2 = minAxis - 2*r1;
    var h2 = w2;
    var bl = w2/2;

    var x1 = cx - w2/2;
    var y1 = cy - h2/2;

    // draw cross hairs
    // axes
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 1;
    // x
    ctx.beginPath();
    ctx.moveTo(x1, cy);
    ctx.lineTo(x1 + w2, cy);
    ctx.stroke();
    // y
    ctx.beginPath();
    ctx.moveTo(cx, y1);
    ctx.lineTo(cx, y1+h2);
    ctx.stroke();


    var bx = cx + this.xAxis * bl;
    var by = cy - this.yAxis * bl;


    // draw line to button
    ctx.strokeStyle = '#aaa';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(cx,cy);
    ctx.lineTo(bx,by);
    ctx.fill();

    // draw button, positive value indicates pressed
    ctx.fillStyle = this.button > 0 ? '#8f8' : '#555';
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(bx, by, r1, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();

    // draw Z
    ctx.strokeStyle = '#8f8';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(bx, by, r1, -Math.PI/2, -Math.PI/2 + this.zAxis * Math.PI, this.zAxis < 0 ? true : false);
    ctx.fill();
    ctx.stroke();
  }

  build() {
    super.build("Joystick");
    var me = this;

    var w = Math.max(this.ui.width(), 200);
    var h = Math.max(this.ui.height(), 200);

    this.canvas = $("<canvas height=200 />");

    this.ui.append(this.canvas);

    super.finishBuild();
  }
}
