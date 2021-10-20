
import loadStylesheet from '../loadStylesheet.js';
import * as DLM from '../droneLinkMsg.js';
import { colorArray, paleColorArray } from '../colors.js';

import SparkContainer from './SparkContainer.js';
import { HexControl, NumberControl, StringControl, FloatControl } from './Controls.js';
import {IntInputControl, FloatInputControl, AddrInputControl } from './InputControls.js';

// shortcut
const e = React.createElement;

loadStylesheet('./css/modules/ui/ParameterContainer.css');


export default class ParameterContainer extends React.Component {
  constructor(props) {
    super(props);
  }

  render() {
    var valueControls = [];

    // this.props.value contains the param state info:
    // "msgType":0,"bytesPerValue":1,"numValues":1,"values":{"0":1},"name":"status"
    //console.log(this.props);

    var addr = this.props.node + '>' + this.props.channel + '.' + this.props.id;


    // iterate over values, build an appropriate control for each

    if (this.props.value.msgType == DLM.DRONE_LINK_MSG_TYPE_ADDR) {
      valueControls.push(e(AddrInputControl, {key:'addr'+addr, values: this.props.value.values, addr:addr, cs:this.props.cs }));

    } else if (this.props.value.values && this.props.value.values.length > 0) {

      this.props.value.values.forEach((v, i)=> {
				if (this.props.value.writable && this.props.value.values.length == 1) {
					// writable
					switch(this.props.value.msgType) {
	          case DLM.DRONE_LINK_MSG_TYPE_UINT8_T:  valueControls.push(e(IntInputControl, {key:'int'+addr+i, value: this.props.value, addr:addr })); break;
            case DLM.DRONE_LINK_MSG_TYPE_FLOAT:  valueControls.push(e(FloatInputControl, {key:'float'+addr+i, value: this.props.value, addr:addr })); break;

	        default:
	          valueControls.push(e('div',{key:'control'+addr+i}, this.props.value.values));
	        }
				} else {
					// read-only

					switch(this.props.value.msgType) {
	          case DLM.DRONE_LINK_MSG_TYPE_CHAR:  valueControls.push(e(StringControl, {key:'string'+addr+i, value: v, color: colorArray[i] })); break;
	          case DLM.DRONE_LINK_MSG_TYPE_FLOAT:  valueControls.push(e(FloatControl, {key:'float'+addr+i, value: v, color: colorArray[i] })); break;
	        default:
	          valueControls.push(e(NumberControl, {key:'num'+addr+i, value: v, color: colorArray[i] }));
	        }
				}
      });
    }

    // sparkline
    var spark = '';
    if (this.props.value.sparkLine) {
      //console.log('Spark for ' + addr);
      spark = e(SparkContainer, {key: 'spark:'+addr, sparkLine: this.props.value.sparkLine });
    }

    //  valueControls.push(e(HexControl, {key:'hex', value: this.props.value, msg: this.props.value.msg}));

/*
    // bonus controls
    if (this.props.value.ui == 'toggle')
      valueControls.push(e(ToggleControl, {key:'toggle', channel:this.props.channel, param:this.props.id}));

    if (this.props.value.ui == 'slider')
      valueControls.push(e(SliderControl, {key:'slider', channel:this.props.channel, param:this.props.id}));
*/
		var title = (this.props.value.name ? this.props.value.name : '?');
		var subtitle = this.props.channel + '.' + this.props.id + ' ';
		switch(this.props.value.msgType) {
			case DLM.DRONE_LINK_MSG_TYPE_UINT8_T: subtitle += 'u8'; break;
			case DLM.DRONE_LINK_MSG_TYPE_ADDR: subtitle += 'a'; break;
			case DLM.DRONE_LINK_MSG_TYPE_UINT32_T: subtitle += 'u32'; break;
			case DLM.DRONE_LINK_MSG_TYPE_FLOAT: subtitle += 'f'; break;
			case DLM.DRONE_LINK_MSG_TYPE_CHAR: subtitle += 'c'; break;
		}

    var items = [
      spark,
      e('div', {key:'sparkOverlay', className:'sparkOverlay' }, ''),
      e(ReactBootstrap.Card.Title, {key: 'title' }, [title,
				e('span',{ key:'addrspan', className: 'addr' }, subtitle)
			]),
      //e(ReactBootstrap.Card.Subtitle, {key: 'subtitle' }, this.props.channel + '.' + this.props.id),
      e('div', {key: 'valueContainer', className: 'paramValueContainer'}, valueControls)
      //e('div', {key: 'floatFix', className: 'floatFix'}),
    ];

    return e(ReactBootstrap.Card, {
      key: this.props.id, className: 'ParameterContainer ' + (this.props.value.writable ? 'writable' : '')
    }, items);
  }
}
