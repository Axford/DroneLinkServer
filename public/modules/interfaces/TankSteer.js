import loadStylesheet from '../loadStylesheet.js';
import * as DLM from '../droneLinkMsg.js';
import { getParamValueFromChannel, getParamObjFromChannel } from '../droneLinkUtils.js';

// shortcut
const e = React.createElement;

loadStylesheet('./css/modules/interfaces/TankSteer.css');


export default class TankSteer extends React.Component {
	constructor(props) {
		super(props);
    this.canvasRef = React.createRef();
	}

  componentDidUpdate() {
    // redraw canvas

    // 10 = turnRate
    var turnRate = (getParamValueFromChannel(this.props.channelObj, 10, [0])[0]);

    // 12 = speed
    var speed = (getParamValueFromChannel(this.props.channelObj, 12, [0])[0]);

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
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(100,100);
    ctx.lineTo(100 + turnRate*100, 100 - speed*100);
    ctx.stroke();

		// turnRate
    ctx.fillStyle = '#8F8';
    ctx.lineWidth = 5;
    ctx.font = '20px serif';
    ctx.textAlign = 'left';
    ctx.fillText('TR: ' + turnRate.toFixed(1), 10, 25);

    // speed
    ctx.fillStyle = '#8F8';
    ctx.font = '20px serif';
    ctx.textAlign = 'right';
    ctx.fillText('S: '+speed.toFixed(1), 190, 25);
  }

  componentDidMount() {
    // prep canvas
    var c = this.canvasRef.current;
    c.width = 200;
    c.height = 200;
  }

	render() {


    return e('div', {className:'TankSteer'},
      e('canvas', {
        ref: this.canvasRef,
        onClick: (e) => {

  				var offsetX = $( e.target ).offset().left;
  				var w = $(e.target).innerWidth();

          var offsetY = $( e.target ).offset().top;
          var h = $(e.target).innerHeight();

  				var x = e.pageX - offsetX;
          var y = e.pageY - offsetY;

          console.log(x,y);

          var turnRate = 2*(x/w) - 1;
          turnRate *= 1;

          var speed = -(2*(y/h) - 1);

  				DLM.sendDroneLinkMsg({
  					addr: this.props.node + '>' + this.props.channel + '.10',
  					msgType: DLM.DRONE_LINK_MSG_TYPE_FLOAT,
  					values: [ turnRate ]
  				});

          DLM.sendDroneLinkMsg({
  					addr: this.props.node + '>' + this.props.channel + '.12',
  					msgType: DLM.DRONE_LINK_MSG_TYPE_FLOAT,
  					values: [ speed ]
  				});

  			}
      })
    );
  }
}
