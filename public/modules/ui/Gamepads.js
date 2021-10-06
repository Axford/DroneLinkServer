
import * as DLM from '../droneLinkMsg.js';
import loadStylesheet from '../loadStylesheet.js';

// shortcut
const e = React.createElement;

loadStylesheet('./css/modules/ui/Gamepads.css');


class GamepadAxis extends React.Component {
  constructor(props) {
    super(props);
    this._lastValueSent = 100; // nonsense value
    this.state = {
      addrTemp:'',
      addr: ''
    };
  }


  componentDidUpdate() {
    // round to two decimal places
    var v = Math.round((this.props.value + Number.EPSILON) * 100) / 100;

    if (!isNaN(v) && (v != this._lastValueSent) && (this.state.addr != '')) {
      //console.log(v);
      this._lastValueSent = v;
      DLM.sendDroneLinkMsg({
        addr: this.state.addr,
        msgType: DLM.DRONE_LINK_MSG_TYPE_FLOAT,
        values: [ v ]
      });
    }
  }

  render() {

    var meter = e('meter', {
      key:'meter',
      className:'axis',
      min:-1,
      max:1,
      value:this.props.value,
      addr: ''
    } );

    var inputs = e(ReactBootstrap.Form, { className: 'form-inline', key:'form'},
			e(ReactBootstrap.Form.Control, {
						key:'intControl',
						type:'text',
						size:'sm',
						placeholder:'',
						onChange: e => { this.setState({ addrTemp: e.target.value }); }
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

              this.setState({ addr: this.state.addrTemp });

              console.log('wiring to: '+ this.state.addrTemp);
						}
				},
				'OK'
	    ),
		)


    return e('div',{
      className:'card'
    }, e('div', {
      className:'card-body'
    }, [
      e('h5', {key:'title', className:'card-title'}, this.props.title),
      meter,
      inputs
    ])
    );
  }
}




export default class Gamepads extends React.Component {
  constructor(props) {
    super(props);
    this.state = {};
  }

  render() {
    var items = [];

    for (const [key, value] of Object.entries(this.props.controllers)) {

      var axes = [];

      for(var i=0; i<value.axes.length; i++) {
        axes.push(e(GamepadAxis, {
          key:'axis'+i,
          value: value.axes[i],
          title: 'Axis: '+i
        }))
      }

      items.push(
        e('div', {
            key: 'gamepad'+key,
            className: 'gamepad'
          },
           [
             e('div', {key:'title', className:'title'}, value.id),
             e('div', {key:'axes', className:'axes'}, axes)
           ]
         )
      );

    }

    return e('div', {
      className:'gamepads'
    },
    items );
  }
}
