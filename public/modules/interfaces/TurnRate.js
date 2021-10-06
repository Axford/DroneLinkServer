import loadStylesheet from '../loadStylesheet.js';
import * as DLM from '../droneLinkMsg.js';
import { getParamValueFromChannel, getParamObjFromChannel } from '../droneLinkUtils.js';

// shortcut
const e = React.createElement;

loadStylesheet('./css/modules/interfaces/HMC5883L.css');


export default class HMC5883L extends React.Component {
	constructor(props) {
		super(props);
    this.canvasRef = React.createRef();
	}

  componentDidUpdate() {
    // redraw canvas

		var turnRate = (getParamValueFromChannel(this.props.channelObj, 16, [0])[0])

		var target = (getParamValueFromChannel(this.props.channelObj, 10, [0])[0]);
    var t2 = (target - 90) * Math.PI / 180;

    var heading = (getParamValueFromChannel(this.props.channelObj, 12, [0])[0]);
    var h2 = (heading - 90) * Math.PI / 180;

    var c = this.canvasRef.current;
    var ctx = c.getContext("2d");
    ctx.fillStyle = '#343a40';
    ctx.fillRect(0,0,200,200);

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(100, 100, 80, 0, 2 * Math.PI);
    ctx.stroke();
		ctx.beginPath();
    ctx.arc(100, 100, 30, 0, 2 * Math.PI);
    ctx.stroke();

    ctx.beginPath();
    for (var i =0; i<12; i++) {
      var ang = (i*30) * Math.PI / 180;
      ctx.moveTo(100 + 80*Math.cos(ang), 100 + 80*Math.sin(ang));
      ctx.lineTo(100 + 90*Math.cos(ang), 100 + 90*Math.sin(ang) );
    }
    ctx.stroke();

		// heading
    ctx.strokeStyle = '#5F5';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(100 + 30*Math.cos(h2), 100 + 30*Math.sin(h2));
    ctx.lineTo(100 + 90*Math.cos(h2), 100 + 90*Math.sin(h2) );
    ctx.stroke();

		// target
    ctx.strokeStyle = '#FF5';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(100 + 30*Math.cos(t2), 100 + 30*Math.sin(t2));
    ctx.lineTo(100 + 90*Math.cos(t2), 100 + 90*Math.sin(t2) );
    ctx.stroke();

    ctx.fillStyle = '#8F8';
    ctx.font = '20px serif';
		ctx.textAlign = 'left';
    ctx.fillText(heading.toFixed(0) + '°', 10, 25);

		ctx.fillStyle = '#FF8';
    ctx.font = '20px serif';
		ctx.textAlign = 'right';
    ctx.fillText(target.toFixed(0) + '°', 190, 25);

		ctx.fillStyle = '#FFF';
    ctx.font = '20px bold serif';
		ctx.textAlign = 'center';
    ctx.fillText(turnRate.toFixed(0), 100, 105);
  }

  componentDidMount() {
    // prep canvas
    var c = this.canvasRef.current;
    c.width = 200;
    c.height = 200;
  }

	render() {


    return e('div', {className:'HMC5883L'},
      e('canvas', { ref: this.canvasRef })
    );
  }
}
