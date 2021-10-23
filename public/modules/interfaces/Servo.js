import loadStylesheet from '../loadStylesheet.js';
import * as DLM from '../droneLinkMsg.mjs';
import { getParamValueFromChannel, getParamObjFromChannel } from '../droneLinkUtils.js';

// shortcut
const e = React.createElement;

loadStylesheet('./css/modules/interfaces/Servo.css');


export default class Servo extends React.Component {
	constructor(props) {
		super(props);
    this.ref = React.createRef();
	}

  componentDidUpdate() {
    // update meter
		var v = (getParamValueFromChannel(this.props.channelObj, 8, [0])[0]);

    // transition points on the background gradient
    var t1 = (v > 0 ? 50 : 50 * (1+v) );
    var t2 = (v < 0 ? 50 : 50 + 50 * v);
    var s = 'background-image: linear-gradient(90deg, #343a40 0%,';
    // t1
    s += '#343a40 '+t1+'%, #5F5 '+t1+'%, ';

    // t2
    s += '#5F5 '+t2+'%, #343a40 '+t2+'%, ';

    // end
    s += '#343a40 100%);';

    this.ref.current.style = s;
  }

	render() {
    return e('div', {
			className:'Servo',
			ref:this.ref,
			onClick: (e) => {

				var offsetX = $( e.target ).offset().left;
				var w = $(e.target).innerWidth();

				var x = e.pageX - offsetX;

				var v = 2*(x / w) - 1;

				DLM.sendDroneLinkMsg({
					addr: this.props.node + '>' + this.props.channel + '.8',
					msgType: DLM.DRONE_LINK_MSG_TYPE_FLOAT,
					values: [ v ]
				});
			}
		});
  }
}
