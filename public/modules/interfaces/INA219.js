import loadStylesheet from '../loadStylesheet.js';
import * as DLM from '../droneLinkMsg.js';
import { getParamValueFromChannel, getParamObjFromChannel } from '../droneLinkUtils.js';

// shortcut
const e = React.createElement;

loadStylesheet('./css/modules/interfaces/INA219.css');


export default class INA219 extends React.Component {
	constructor(props) {
		super(props);
    this.canvasRef = React.createRef();
	}

  drawMeter(ctx, v, label, x1,y1,x2,y2) {
    ctx.strokeStyle = '#343a40';
    ctx.strokeRect(x1+5, y1+5, x2-5, y2-5);

    ctx.fillStyle = '#ccc';
    ctx.font = '20px serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, (x1+x2)/2, (y1+y2)/2 - 15);

    ctx.fillStyle = '#8F8';
    ctx.font = '35px serif';
    ctx.fillText(v, (x1+x2)/2, (y1+y2)/2 + 20);
  }

  componentDidUpdate() {
    // redraw canvas

    // Current =32, Power= 64, LoadV=128

    // 10 = turnRate
    var ina = {
      current: getParamValueFromChannel(this.props.channelObj, 32, [0])[0],
      power: getParamValueFromChannel(this.props.channelObj, 64, [0])[0],
      loadV: getParamValueFromChannel(this.props.channelObj, 128, [0])[0]
    }

    var c = this.canvasRef.current;
    var ctx = c.getContext("2d");
    ctx.fillStyle = '#343a40';
    ctx.fillRect(0,0,300,200);

    this.drawMeter(ctx, ina.loadV.toFixed(1), 'V', 0,0,100,100);

    this.drawMeter(ctx, ina.current.toFixed(1), 'A', 100,0,200,100);

    this.drawMeter(ctx, ina.power.toFixed(1), 'W', 200,0,300,100);

/*
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

    ctx.fillStyle = '#8F8';
    ctx.font = '20px serif';
    ctx.fillText(heading.toFixed(0) + '°', 10, 25);*/
  }

  componentDidMount() {
    // prep canvas
    var c = this.canvasRef.current;
    c.width = 300;
    c.height = 100;
  }

	render() {
    return e('div', {className:'INA219'},
      e('canvas', {
        ref: this.canvasRef
      })
    );
  }
}
