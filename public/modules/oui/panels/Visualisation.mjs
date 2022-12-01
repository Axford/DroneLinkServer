import Panel from './Panel.mjs';
import loadStylesheet from '../../loadStylesheet.js';

loadStylesheet('./css/modules/oui/panels/Visualisation.css');



function radiansToDegrees(a) {
    return a * 180 / Math.PI;
  }
  
  function degreesToRadians(a) {
    return a * Math.PI / 180;
  }
  

  function calculateDistanceBetweenCoordinates(lon1, lat1, lon2, lat2) {
    const R = 6371e3; // metres
    var lat1r = lat1 * Math.PI/180; // φ, λ in radians
    var lat2r = lat2 * Math.PI/180;
    var lon1r = lon1 * Math.PI/180; // φ, λ in radians
    var lon2r = lon2 * Math.PI/180;
  
    var x = (lon2r-lon1r) * Math.cos((lat1r+lat2r)/2);
    var y = (lat2r-lat1r);
    var d = Math.sqrt(x*x + y*y) * R;
  
    return d;
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

    if (label > '') {
        ctx.fillStyle = color;
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';

        var x1 = cx  + r2*Math.cos(angR);
        var y1 = cy + r2*Math.sin(angR);
    
        ctx.beginPath();
        ctx.arc(x1, y1, 25, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = '#000';
        //ctx.fillText(ang.toFixed(0) + '°', 10, 25);
        ctx.fillText(label, x1, y1 + 4);
    }
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

    this.lastPosition = [0,0,0];
    this.lastPositionTime = (new Date()).getTime();

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
    if (!this.node.focused || !this.visible) return;

    if (this.node.id != 65) {

        // check for visualisation script
        if (this.node.state.state[this.node.id] && 
            this.node.state.state[this.node.id].visualisation) {
            var vis = this.node.state.state[this.node.id].visualisation;
            if (vis > '') {
                console.log('Custom Vis:');
                try {
                    eval(vis);
                } catch(e) {
                    console.error(e);
                }
            }
        }

        return;
    }

    var now = (new Date()).getTime();

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

    var turnRateThreshold = this.node.state.getParamValues(node, 11, 17, [20])[0];

    var distanceToWaypoint = this.node.state.getParamValues(node, 9, 9, [0])[0];

    var newLast = this.node.state.getParamValues(node, 9, 15, [0,0,0]);
    var position = this.node.state.getParamValues(node, 7, 8, [0,0,0]);

    if (newLast[0] != this.lastPosition[0] || newLast[1] != this.lastPosition[1]) {
        // last position changed
        console.log('last position changed', newLast);

        this.lastPosition = newLast;
        this.lastPositionTime = now;
    }

    // calc effective speed
    var speed = 0;
    if (this.lastPosition[0] != 0) {
        var d = calculateDistanceBetweenCoordinates(this.lastPosition[0], this.lastPosition[1], position[0], position[1] );
        console.log('distance travelled:', this.lastPosition, position, d);
        speed = d / ((now - this.lastPositionTime)/1000);
    } 

    // keep width updated
    var w = this.ui.panel.width();
    ctx.canvas.width = w;
    var h = 500;
    ctx.canvas.height = h;
    var cx = w/2;
    var cy = h/2;

    ctx.fillStyle = '#040a20';
    ctx.fillRect(0,0,w,h);

    drawLabel(ctx, speed.toFixed(1), 'Speed m/s', 10, 10, '#fff');

    //1.94384
    drawLabel(ctx, (speed * 1.94384).toFixed(1), 'Speed knots', 10, 60, '#fff');

    // course threshold
    var ang1 = (course -turnRateThreshold - 90) * Math.PI / 180;
    var ang2 = (course +turnRateThreshold - 90) * Math.PI / 180;
    ctx.fillStyle = '#066';
    ctx.beginPath();
    ctx.arc(cx,cy, 200, ang1, ang2, false);
    ctx.arc(cx,cy, 100, ang2, ang1, true);
    ctx.fill();


    // outer circle
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 140, 0, 2 * Math.PI);
    ctx.stroke();

    // outer ticks
    ctx.beginPath();
    for (var i =0; i<12; i++) {
      var ang = (i*30) * Math.PI / 180;
      ctx.moveTo(cx + 140*Math.cos(ang), cy + 140*Math.sin(ang));
      ctx.lineTo(cx + 150*Math.cos(ang), cy + 150*Math.sin(ang) );
    }
    ctx.stroke();

    // visualise hull 
    ctx.fillStyle = '#aaa';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 100, 30, h2, 0, 2 * Math.PI);
    ctx.fill();


	// hands
    drawLabelledHand(ctx, heading, '', 30 ,140, '#5F5');
    drawLabelledHand(ctx, target,  distanceToWaypoint.toFixed(0) + 'm', 140, 250, '#FF5');
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

    // draw rudder... positive values are rudder to the right., valid range -1 to 1
    if (rudder > 1) rudder = 1;
    if (rudder < -1) rudder = -1;
    var ang = (heading + 180 - 90) * Math.PI / 180;
    var rang = (heading + 180 - 90 - rudder * 45) * Math.PI / 180;
    var x1 = cx + 100*Math.cos(ang);
    var y1 = cy + 100*Math.sin(ang)
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 5;
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
