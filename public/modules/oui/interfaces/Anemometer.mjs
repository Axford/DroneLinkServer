import ModuleInterface from "./ModuleInterface.mjs";
import loadStylesheet from "../../loadStylesheet.js";
import * as DLM from "../../droneLinkMsg.mjs";

export default class Anemometer extends ModuleInterface {
  constructor(channel, state) {
    super(channel, state);

    this.histo = [];
    this.maxHisto = 0;
    for (var i=0; i < 31; i++) {
        this.histo.push(0);
    }

    /*
    setInterval(()=>{
        this.onParamValue({
            param: 10,
            msgType: DLM.DRONE_LINK_MSG_TYPE_FLOAT,
            values: [ Math.random() * 16  ] 
        });
    },1000)
    */
  }

  onParamValue(data) {
    if (!this.built) return;

    if (data.param == 10 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_FLOAT) {
      var v = Math.round(data.values[0] * 1.94384) ;  // knots
      if (v >=0 && v< this.histo.length) {
        this.histo[v]++;
        if (this.histo[v] > this.maxHisto) this.maxHisto = this.histo[v];
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
    var speed = this.state.getParamValues(node, channel, 10, [0])[0];
    var knots = speed * 1.94384;
    var kv = Math.round(knots);

    // render
    // -------------------------------------------------------------------------
    var padding = 5;
    var offset = 70;
    var w1 = w - padding - offset;
    var h1 = h - padding - 20;
    var bw = w1 / (this.histo.length-1);

    // background
    ctx.fillStyle = "#343a40";
    ctx.fillRect(0, 0, w, h);

    // plot histogram
    // -------------------------------------------------------------------------

    // frame
    ctx.strokeStyle = '#888';
    ctx.beginPath();
    ctx.rect(offset-1, padding-1, w1+2, h1+2);
    ctx.stroke();

    // axis labels
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.textAlign = 'left';
    ctx.font = '12px serif';
    ctx.fillText('0 kts', offset-5, padding + h1 + 12);
    ctx.textAlign = 'right';
    ctx.fillText( (this.histo.length-1) + ' kts', w-padding, padding + h1 + 12);

    // major gridlines
    ctx.textAlign = 'left';
    ctx.setLineDash([5, 5]);
    for (var i=10; i<this.histo.length-1; i+=10 ) {
        var x1 = i*bw;
        ctx.beginPath();
        ctx.moveTo(offset + x1, padding);
        ctx.lineTo(offset + x1, padding + h1);
        ctx.stroke();
        ctx.fillText(i + ' kts', offset + x1-5, padding + h1 + 12);
    }
    ctx.setLineDash([]);

    // data bars
    if (this.maxHisto > 0) {
        for (var i=0; i<this.histo.length-1; i++) {
            var x1 = i*bw;
            var h2 = h1 * this.histo[i] / this.maxHisto;
            ctx.fillStyle = i == kv ? "#8f8" : "#55f";
            ctx.fillRect(offset + x1, padding + h1-h2, bw, h2);
        }

     }

    // -------------------------------------------------------------------------
    this.drawValue(5, 0, 'Speed (m/s)',speed.toFixed(1), '#8f8');
    this.drawValue(5, 40, 'Speed (kts)',(knots).toFixed(1), '#8f8');
  }

  build() {
    super.build("Anemometer");

    this.canvas = $("<canvas height=100 />");

    this.ui.append(this.canvas);

    super.finishBuild();
  }
}
