import loadStylesheet from '../loadStylesheet.js';
import * as DLM from '../droneLinkMsg.mjs';
import { getParamValueFromChannel, getParamObjFromChannel } from '../droneLinkUtils.js';

// shortcut
const e = React.createElement;

loadStylesheet('./css/modules/interfaces/Joystick.css');


export default class Joystick extends React.Component {
	constructor(props) {
		super(props);
    this.canvasRef = React.createRef();
	}

  componentDidUpdate() {
    // redraw canvas

    // X=8, Y=9, Z=10, Button=11

    // 10 = turnRate
    var joy = {
      x: getParamValueFromChannel(this.props.channelObj, 10, [0])[0],
      y: getParamValueFromChannel(this.props.channelObj, 11, [0])[0],
      z: getParamValueFromChannel(this.props.channelObj, 12, [0])[0],
      button: getParamValueFromChannel(this.props.channelObj, 13, [0])[0]
    }

    var c = this.canvasRef.current;
    var ctx = c.getContext("2d");
    ctx.fillStyle = '#343a40';
    ctx.fillRect(0,0,200,200);

    // background cross-hair
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0,100);
    ctx.lineTo(200,100);
    ctx.moveTo(100,0);
    ctx.lineTo(100,200);
    ctx.stroke();

    // current settings
    ctx.strokeStyle = '#5F5';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(100,100);
    ctx.lineTo(100 + joy.x*100, 100 - joy.y*100);
    ctx.stroke();


    // z indicator
    var a1 = -Math.PI/2;
    var a2 = a1 + joy.z * Math.PI;
    ctx.strokeStyle = '#5F5';
    ctx.lineWidth=5;
    ctx.beginPath();
    ctx.arc(100 + joy.x*100, 100 - joy.y*100, 25, Math.min(a1,a2), Math.max(a1,a2));
    ctx.stroke();

    // button indicator
    ctx.fillStyle = (joy.button > 0 ? '#5F5' : '#F55');
    ctx.beginPath();
    ctx.arc(100 + joy.x*100, 100 - joy.y*100, 20, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = '#343a40';
    ctx.lineWidth = 2;
    ctx.stroke();

  }

  componentDidMount() {
    // prep canvas
    var c = this.canvasRef.current;
    c.width = 200;
    c.height = 200;
  }

	render() {
    return e('div', {className:'Joystick'},
      e('canvas', {
        ref: this.canvasRef
      })
    );
  }
}
