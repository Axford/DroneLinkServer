import loadStylesheet from '../loadStylesheet.js';
import * as DLM from '../droneLinkMsg.js';
import { getObjectsForAddress } from '../droneLinkUtils.js';

// shortcut
const e = React.createElement;

loadStylesheet('./css/modules/ui/InputControls.css');




//<Form.Control size="sm" type="text" placeholder="Small text" />
export class IntInputControl extends React.Component {
  constructor(props) {
    super(props);
		this.state = {
			val: 0
		}
  }

  render() {
    return e(ReactBootstrap.Form, { className: 'form-inline'},
			e(ReactBootstrap.Form.Control, {
						key:'addrControl',
						type:'text',
						size:'sm',
						placeholder:this.props.value.values[0],
						onChange: e => { this.setState({ val: e.target.value }); }
				}
	    ),
			e(ReactBootstrap.Button, {
						key:'submit',
						variant:'outline-success',
						type:'submit',
						size:'sm',
						onClick: (e) => {
							// send change
							// where to?
							//console.log(this.props, this.state);
							e.preventDefault();

							var v = parseInt(this.state.val);
							if (!isNaN(v)) {
								DLM.sendDroneLinkMsg({
									addr: this.props.addr,
									msgType: this.props.value.msgType,
								 	values: [ v ]
								});
							}

						}
				},
				'OK'
	    ),
		)
  }
}


export class FloatInputControl extends React.Component {
  constructor(props) {
    super(props);
		this.state = {
			val: 0
		}
  }

  render() {
    return e(ReactBootstrap.Form, { className: 'form-inline'},
			e(ReactBootstrap.Form.Control, {
						key:'floatControl',
						type:'text',
						size:'sm',
						placeholder:this.props.value.values[0],
						onChange: e => { this.setState({ val: e.target.value }); }
				}
	    ),
			e(ReactBootstrap.Button, {
						key:'submit',
						variant:'outline-success',
						type:'submit',
						size:'sm',
						onClick: (e) => {
							// send change
							// where to?
							//console.log(this.props, this.state);
							e.preventDefault();

							var v = parseFloat(this.state.val);
							if (!isNaN(v) && v != undefined) {
								DLM.sendDroneLinkMsg({
									addr: this.props.addr,
									msgType: this.props.value.msgType,
									values: [ v ]
								});
							} else {
								console.error(v);
							}
						}
				},
				'OK'
	    ),
		)
  }
}



export class AddrInputControl extends React.Component {
  constructor(props) {
    super(props);
  }

  render() {
    var obj = getObjectsForAddress(this.props.cs, this.props.values);
    //console.log(this.props.values, obj);

    return e(
      'span',
      { key: 'num', className: 'value valueAddr'},
      obj ? (this.props.values[0] + '> ' + obj.channel.name + ' .' + obj.param.name) : 'not connected'
    );
  }
}
