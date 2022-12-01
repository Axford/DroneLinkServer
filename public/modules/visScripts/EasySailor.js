// ensure persistent vars are defined
this.lastPosition = this.lastPosition ? this.lastPosition : [0,0,0];
this.lastPositionTime = this.lastPositionTime ? this.lastPositionTime : (new Date()).getTime();

var node = 65;
var channel = 10;

var target = state.getParamValues(node, channel, 8, [0])[0];
var t2 = (target - 90) * Math.PI / 180;

var heading = state.getParamValues(node, channel, 10, [0])[0];
var h2 = (heading - 90) * Math.PI / 180;

var wind = state.getParamValues(node, channel, 12, [0])[0];

var crosstrack = state.getParamValues(node, channel, 14, [0])[0];

var course = state.getParamValues(node, channel, 16, [0])[0];

var wind = state.getParamValues(node, channel, 12, [0])[0];

var wing = state.getParamValues(node, channel, 22, [0])[0];

var wingCompass = state.getParamValues(64, 4, 11, [0])[0];

var rudder = state.getParamValues(node, 13, 8, [0])[0];

var gybeMode = state.getParamValues(node, 11, 19, [0])[0];

var crosstrack = state.getParamValues(node, 10, 14, [0])[0];

var turnRateThreshold = state.getParamValues(node, 11, 17, [20])[0];

var distanceToWaypoint = state.getParamValues(node, 9, 9, [0])[0];

var newLast = state.getParamValues(node, 9, 15, [0,0,0]);
var position = state.getParamValues(node, 7, 8, [0,0,0]);

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
    //console.log('distance travelled:', this.lastPosition, position, d);
    speed = d / ((now - this.lastPositionTime)/1000);
} 

drawLabel(ctx, speed.toFixed(1), 'Speed m/s', 10, 10, '#5f5');

drawLabel(ctx, (speed * 1.94384).toFixed(1), 'Knots', 80, 10, '#5f5');

drawLabel(ctx, (crosstrack).toFixed(1), 'Crosstrack', 10, 60, Math.abs(crosstrack) > 1 ? '#f55' : '#5f5');


// course threshold
var ang1 = (course -turnRateThreshold - 90) * Math.PI / 180;
var ang2 = (course +turnRateThreshold - 90) * Math.PI / 180;
ctx.fillStyle = '#066';
ctx.beginPath();
ctx.arc(cx,cy, 180, ang1, ang2, false);
ctx.arc(cx,cy, 100, ang2, ang1, true);
ctx.fill();


drawTickedCircle(ctx, cx, cy, 140, '#555');

var arrowVector = [
    [-1,-0.2],
    [0,-0.1],
    [1,-0.2],
    [1,-1],
    [-1,-1],
    [-1,-0.2]
];
drawVector(ctx, arrowVector, cx, cy, wind+180, 40, 500, 'rgba(80,80,255,0.5)', true);


// visualise hull 
drawVector(ctx, boatHullVector, cx, cy, heading, 30, 100, '#888', true);


// hands
drawLabelledHand(ctx, heading, '', 30 ,140, '#5F5');

var distLabel = distanceToWaypoint.toFixed(0) + 'm';
if (distanceToWaypoint > 999) {
    distLabel = (distanceToWaypoint / 1000).toFixed(0) + 'km';
}
drawLabelledHand(ctx, target,  distLabel, 140, 220, '#FF5');
drawLabelledHand(ctx, course, '', 100, 180, '#5FF');
//drawLabelledHand(ctx, wind, '', 40, 400, '#55F');




// draw estimated wing orientation
if (wing != 0) {
    var wingAng = wind + 180 - wing * 30;
    drawLabelledHand(ctx, wingAng, '', 0, 110, '#A00');

    drawVector(ctx, wingVector, cx, cy, wingCompass, 15, 110, '#F55', true);


    // draw tail
    var ang = (wingCompass +180 - 90) * Math.PI / 180;
    var x1 = cx + 130*Math.cos(ang);
    var y1 = cy + 130*Math.sin(ang);
    var tailAng = wingCompass + wing * 30;
    drawVector(ctx, wingVector, x1, y1, tailAng, 4, 40, '#F55', true);
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
var x1 = cx + 100*Math.cos(ang);
var y1 = cy + 100*Math.sin(ang);
var rudderAng = heading - rudder * 45;
drawVector(ctx, wingVector, x1, y1, rudderAng, 4, 40, '#FFF', true);


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
drawPill(ctx, controlModeStr, cx, 10, 70, controlModeClr);

