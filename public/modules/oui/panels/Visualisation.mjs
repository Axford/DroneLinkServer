import Panel from './Panel.mjs';
import loadStylesheet from '../../loadStylesheet.js';

loadStylesheet('./css/modules/oui/panels/Visualisation.css');



function radiansToDegrees(a) {
    return a * 180 / Math.PI;
  }
  
  function degreesToRadians(a) {
    return a * Math.PI / 180;
  }
  
  
  function drawLabelledHand(ctx, ang, label, r1, r2, color) {
    var angR = (ang - 90) * Math.PI / 180;
  
    var cx = ctx.canvas.width / 2;
    var cy = ctx.canvas.height / 2;
  
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(cx + r1*Math.cos(angR), cy + r1*Math.sin(angR));
    ctx.lineTo(cx + r2*Math.cos(angR), cy + r2*Math.sin(angR) );
    ctx.stroke();
  
    ctx.fillStyle = color;
    ctx.font = '15px Arial';
    ctx.textAlign = 'left';
    //ctx.fillText(ang.toFixed(0) + '°', 10, 25);
    ctx.fillText(label, cx + 4 + r2*Math.cos(angR), cy + r2*Math.sin(angR));
  }
  
  function drawLabel(ctx, v, label, x, y, color) {
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.font = '12px serif';
    ctx.fillText(label, x, y+12);
    ctx.font = '20px bold serif';
    ctx.fillText(v, x, y+35);
  }

  function drawPill(ctx, label, x, y, w, color) {
    ctx.fillStyle = color;
      // draw pill
      var r = 8;
      var x1 = x - w/2 + r;
      var x2 = x + w/2 - r;
  
      ctx.beginPath();
      ctx.arc(x1, y+r, r, 0, 2 * Math.PI);
      ctx.fill();
  
      ctx.beginPath();
      ctx.fillRect(x1,y, w - 2*r, 2*r);
  
      ctx.beginPath();
      ctx.arc(x2, y + r, r, 0, 2 * Math.PI);
      ctx.fill();
  
      // draw label
    ctx.textAlign = 'center';
    ctx.font = '12px sans-serif';
      ctx.fillStyle = '#fff';
    ctx.fillText(label, x, y+12);
  }



export default class Visualisation extends Panel {

  constructor(node, tabs, panels) {
    super(node, tabs, panels);

    this.tabName = 'Visualisation';
    this.title = 'Visualisation';
    this.icon = 'fas fa-eye';

    this.build();
  }


  build() {
    super.build();

    // container for mapParams
    this.ui.canvas = $('<canvas height=400 />');
    this.ui.panel.append(this.ui.canvas);

    console.log(this.canvas);

    setInterval(()=>{
        this.update();
    }, 1000);
  }

  update() {

    var c = this.ui.canvas[0];
    var ctx = c.getContext("2d");

    var node = 65;
    var channel = 10;

    var target = this.node.state.getParamValues(node, channel, 8, [0])[0];
    var t2 = (target - 90) * Math.PI / 180;

    var heading = this.node.state.getParamValues(node, channel, 10, [0])[0];
    var h2 = (heading - 90) * Math.PI / 180;

    var wind = this.node.state.getParamValues(node, channel, 12, [0])[0];

    var crosstrack = this.node.state.getParamValues(node, channel, 14, [0])[0];

    var course = this.node.state.getParamValues(node, channel, 16, [0])[0];

    var wind = this.node.state.getParamValues(node, channel, 12, [0])[0];

    var wing = this.node.state.getParamValues(node, channel, 22, [0])[0];

    var wingCompass = this.node.state.getParamValues(64, 4, 11, [0])[0];

    var rudder = this.node.state.getParamValues(node, 13, 8, [0])[0];

    var gybeMode = this.node.state.getParamValues(node, 11, 19, [0])[0];

    // keep width updated
    var w = this.ui.panel.width();
    ctx.canvas.width = w;
    var h = 400;
    var cx = w/2;
    var cy = h/2;

    ctx.fillStyle = '#343a40';
    ctx.fillRect(0,0,w,h);

    // fill central region
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 140, 0, 2 * Math.PI);
    ctx.stroke();

    // draw ticks
    ctx.beginPath();
    for (var i =0; i<12; i++) {
      var ang = (i*30) * Math.PI / 180;
      ctx.moveTo(cx + 140*Math.cos(ang), cy + 140*Math.sin(ang));
      ctx.lineTo(cx + 150*Math.cos(ang), cy + 150*Math.sin(ang) );
    }
    ctx.stroke();

	// hands
    drawLabelledHand(ctx, heading, '', 30 ,140, '#5F5');
    drawLabelledHand(ctx, target, '', 140, 400, '#FF5');
    drawLabelledHand(ctx, course, '', 100, 200, '#5FF');
    drawLabelledHand(ctx, wind, '', 40, 400, '#55F');
    

    // draw estimated wing orientation
    if (wing != 0) {
        var wingAng = wind + 180 - wing * 30;
        drawLabelledHand(ctx, wingAng, '', 0, 110, '#A00');

        drawLabelledHand(ctx, wingCompass + 180, '', 0, 110, '#F55');

        // draw tail
        var ang = (wingCompass +180 - 90) * Math.PI / 180;
        var rang = (wingCompass + 180 + wing * 30 - 90) * Math.PI / 180;
        var x1 = cx + 120*Math.cos(ang);
        var y1 = cy + 120*Math.sin(ang);
        ctx.strokeStyle = '#F99';
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1 + 50*Math.cos(rang), y1 + 50*Math.sin(rang) );
        ctx.stroke();
    }
  
    // legend - top right
    ctx.textAlign = 'right';
    ctx.font = '12px serif';
    ctx.fillStyle = '#5F5';
    ctx.fillText('Heading', w-5, 12);
    ctx.fillStyle = '#FF5';
    ctx.fillText('Target', w-5, 26);
    ctx.fillStyle = '#5FF';
    ctx.fillText('Course', w-5, 40);
    ctx.fillStyle = '#55F';
    ctx.fillText('Wind', w-5, 54);
    if (wing != 0) {
        ctx.fillStyle = '#F55';
        ctx.fillText('Wing', w-5, 68);
    }

    // visualise hull 
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 100, 30, h2, 0, 2 * Math.PI);
    ctx.stroke();

    // draw rudder... positive values are rudder to the right., valid range -1 to 1
    var ang = (heading + 180 - 90) * Math.PI / 180;
    var rang = (heading + 180 - 90 - rudder * 45) * Math.PI / 180;
    var x1 = cx + 100*Math.cos(ang);
    var y1 = cy + 100*Math.sin(ang)
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 + 50*Math.cos(rang), y1 + 50*Math.sin(rang) );
    ctx.stroke();

    // draw controlMode
    var controlModeStr = 'Normal';
    var controlModeClr = '#585';
    if (gybeMode == 2) {
      controlModeStr = 'Gybe';
      controlModeClr = '#a55';
    } else if (gybeMode == 1) {
      controlModeStr = 'Gybe?';
      controlModeClr = '#885';
    }
    drawPill(ctx, controlModeStr, w-40, h-20, 70, controlModeClr);
  }

  resize() {
    this.update();
  }

}
