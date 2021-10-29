import loadStylesheet from '../loadStylesheet.js';
import * as DLM from '../droneLinkMsg.mjs';
import { getParamValueFromChannel, getParamObjFromChannel } from '../droneLinkUtils.js';

// shortcut
const e = React.createElement;

loadStylesheet('./css/modules/interfaces/Sailor.css');


function drawLabelledHand(ctx, ang, label, r1, r2, color) {
  var angR = (ang - 90) * Math.PI / 180;

  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(100 + r1*Math.cos(angR), 100 + r1*Math.sin(angR));
  ctx.lineTo(100 + r2*Math.cos(angR), 100 + r2*Math.sin(angR) );
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.font = '15px Arial';
  ctx.textAlign = 'left';
  //ctx.fillText(ang.toFixed(0) + '°', 10, 25);
  ctx.fillText(label, 100 + 4 + r2*Math.cos(angR), 100 + r2*Math.sin(angR));
}

export default class Sailor extends React.Component {
	constructor(props) {
		super(props);
    this.canvasRef = React.createRef();
	}

  componentDidUpdate() {
    // redraw canvas
		var target = (getParamValueFromChannel(this.props.channelObj, 8, [0])[0]);
    var t2 = (target - 90) * Math.PI / 180;

    var heading = (getParamValueFromChannel(this.props.channelObj, 10, [0])[0]);
    var h2 = (heading - 90) * Math.PI / 180;

    var wind = (getParamValueFromChannel(this.props.channelObj, 12, [0])[0]);

    var crosstrack = (getParamValueFromChannel(this.props.channelObj, 14, [0])[0]);

    var course = (getParamValueFromChannel(this.props.channelObj, 16, [0])[0]);

    var polar = (getParamValueFromChannel(this.props.channelObj, 18, [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]));

    var speed1 = (getParamValueFromChannel(this.props.channelObj, 19, [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]));
    var speed2 = (getParamValueFromChannel(this.props.channelObj, 20, [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]));

    var sheet = (getParamValueFromChannel(this.props.channelObj, 17, [0])[0]);

    var c = this.canvasRef.current;
    var ctx = c.getContext("2d");
    ctx.fillStyle = '#343a40';
    ctx.fillRect(0,0,200,200);

    // draw polar
    ctx.strokeStyle = '#55f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(100,100);
    var r = 0;
    for (var i =0; i<32; i++) {
      var ang = wind + (180/32) + (i*(180/16)) - 90;
      ang = ang * Math.PI / 180;
      if ( i<16) {
        r = 80 * polar[i] /255;
      } else {
        r = 80 * polar[31-i] /255;
      }
      ctx.lineTo(100 + r*Math.cos(ang), 100 + r*Math.sin(ang) );
    }
    ctx.stroke();

    // draw speed
    ctx.strokeStyle = '#ff0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(100,100);
    var r = 0;
    for (var i =0; i<32; i++) {
      var ang = (180/32) + (i*(180/16)) - 90;
      ang = ang * Math.PI / 180;
      if ( i<16) {
        r = 80 * speed1[i] /255;
      } else {
        r = 80 * speed2[i-16] /255;
      }
      ctx.lineTo(100 + r*Math.cos(ang), 100 + r*Math.sin(ang) );
    }
    ctx.stroke();

    // fill central region
    ctx.beginPath();
    ctx.arc(100, 100, 30, 0, 2 * Math.PI);
    ctx.fill();

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(100, 100, 80, 0, 2 * Math.PI);
    ctx.stroke();
		ctx.beginPath();
    ctx.arc(100, 100, 30, 0, 2 * Math.PI);
    ctx.stroke();

    // draw ticks
    ctx.beginPath();
    for (var i =0; i<12; i++) {
      var ang = (i*30) * Math.PI / 180;
      ctx.moveTo(100 + 80*Math.cos(ang), 100 + 80*Math.sin(ang));
      ctx.lineTo(100 + 90*Math.cos(ang), 100 + 90*Math.sin(ang) );
    }
    ctx.stroke();

		// hands
    drawLabelledHand(ctx, heading, 'Heading', 30,90, '#5F5');
    drawLabelledHand(ctx, target, 'Target', 30, 90, '#FF5');
    drawLabelledHand(ctx, course, 'Course', 30, 90, '#5FF');

    drawLabelledHand(ctx, wind, 'Wind', 60, 90, '#55F');


    ctx.fillStyle = '#FFF';
    ctx.font = '20px bold serif';
		ctx.textAlign = 'center';
    ctx.fillText(sheet.toFixed(1), 100, 110);
    ctx.font = '12px serif';
    ctx.fillText('Sheet', 100, 92);

    ctx.fillStyle = '#FFF';
		ctx.textAlign = 'left';
    ctx.font = '12px serif';
    ctx.fillText('Crosstrack', 5, 10);
    ctx.font = '20px bold serif';
    ctx.fillText(crosstrack.toFixed(1), 5, 30);
  }

  componentDidMount() {
    // prep canvas
    var c = this.canvasRef.current;
    c.width = 200;
    c.height = 200;
  }

	render() {


    return e('div', {className:'Sailor'},
      e('canvas', {
				ref: this.canvasRef
			})
    );
  }
}
