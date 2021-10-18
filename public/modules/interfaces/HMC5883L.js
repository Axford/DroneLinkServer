import loadStylesheet from '../loadStylesheet.js';
import * as DLM from '../droneLinkMsg.js';
import { getParamValueFromChannel, getParamObjFromChannel } from '../droneLinkUtils.js';

// shortcut
const e = React.createElement;

loadStylesheet('./css/modules/interfaces/TurnRate.css');


export default class TurnRate extends React.Component {
	constructor(props) {
		super(props);
    this.canvasRef = React.createRef();
	}

  componentDidUpdate() {
    // redraw canvas

    var heading = (getParamValueFromChannel(this.props.channelObj, 11, [0])[0]);
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
    ctx.moveTo(100, 100);
    ctx.lineTo(100 + 90*Math.cos(h2), 100 + 90*Math.sin(h2) );
    ctx.stroke();

    ctx.fillStyle = '#8F8';
    ctx.font = '20px serif';
    ctx.fillText(heading.toFixed(0) + '°', 10, 25);
  }

  componentDidMount() {
    // prep canvas
    var c = this.canvasRef.current;
    c.width = 200;
    c.height = 200;
  }

	render() {


    return e('div', {className:'TurnRate'},
      e('canvas', { ref: this.canvasRef })
    );
  }
}
