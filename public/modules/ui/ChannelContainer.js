
import loadStylesheet from '../loadStylesheet.js';
import * as DLM from '../droneLinkMsg.js';
import { colorArray, paleColorArray } from '../colors.js';
import { getParamValueFromChannel } from '../droneLinkUtils.js';

// Module specific UI
import BasicNav from '../interfaces/BasicNav.js';
import HMC5883L from '../interfaces/HMC5883L.js';
import Management from '../interfaces/Management.js';
import Motor from '../interfaces/Motor.js';
import NMEA from '../interfaces/NMEA.js';
import Servo from '../interfaces/Servo.js';
import TurnRate from '../interfaces/TurnRate.js';
import WaypointNav from '../interfaces/WaypointNav.js';
import TankSteer from '../interfaces/TankSteer.js';
import Joystick from '../interfaces/Joystick.js';
import INA219 from '../interfaces/INA219.js';

// Generic UI
import ParameterContainer from './ParameterContainer.js';

// shortcut
const e = React.createElement;

loadStylesheet('./css/modules/ui/ChannelContainer.css');



export default class ChannelContainer extends React.Component {
  constructor(props) {
    super(props);
		this.state = {
			show: true,
      tab: 'params'
		}
  }

  render() {
    var items = [];

    var customUI = [];

		var now = (new Date()).getTime();

    var co = this.props.value;

    if (this.props.value.params) {
			// ------------------ custom UI ------------------

      // get type name
      var modType = getParamValueFromChannel(co, DLM.DRONE_MODULE_PARAM_TYPE, [''])[0];
      //console.log(modType);


			if (modType == 'BasicNav') {
				customUI.push(e(BasicNav, { key:'BasicNav', zoom:15, channelObj: this.props.value, addr: this.props.node + '>' + this.props.id + '.8'  }));
			}

      if (modType == 'HMC5883L') {
				customUI.push(e(HMC5883L, { key:'HMC5883L', node: this.props.node, channelObj: this.props.value, cs:this.props.cs  }));
			}

      if (modType == 'INA219') {
				customUI.push(e(INA219, { key:'INA219', node: this.props.node, channel: this.props.id, channelObj: this.props.value  }));
			}

      if (modType == 'Joystick') {
				customUI.push(e(Joystick, { key:'Joystick', node: this.props.node, channel: this.props.id, channelObj: this.props.value  }));
			}


      if (modType == 'Management') {
				customUI.push(e(Management, { key:'Management', node: this.props.node, channelObj: this.props.value, cs:this.props.cs  }));
			}

      if (modType == 'Motor') {
				customUI.push(e(Motor, { key:'Motor', node: this.props.node, channel: this.props.id, channelObj: this.props.value  }));
			}

      if (modType == 'NMEA') {
				customUI.push(e(NMEA, { key:'NMEA', zoom:15, channelObj: this.props.value  }));
			}

      if (modType == 'Servo') {
				customUI.push(e(Servo, { key:'Servo', node: this.props.node, channel: this.props.id, channelObj: this.props.value  }));
			}

      if (modType == 'TankSteer') {
				customUI.push(e(TankSteer, { key:'TankSteer', node: this.props.node, channel: this.props.id, channelObj: this.props.value  }));
			}

      if (modType == 'TurnRate') {
				customUI.push(e(TurnRate, { key:'TurnRate', node: this.props.node, channel: this.props.id, channelObj: this.props.value  }));
			}

			if (modType == 'WaypointNav') {
				customUI.push(e(WaypointNav, { key:'WaypointNav', value: this.props.value, node: this.props.node, channel: this.props.id, addr: this.props.node + '>' + this.props.id + '.8'  }));
			}


      // ------------------  Generic parameter UI ------------------
      for (const [key, value] of Object.entries(this.props.value.params)) {
				var hideMe = false;

				if (this.props.value.name == 'BasicNav' && key == 8) hideMe = true;
				//if (this.props.value.name == 'WaypointNav' && key == 8) hideMe = true;

        if (key > DLM.DRONE_MODULE_PARAM_RESETCOUNT && !hideMe)
          items.push(e(ParameterContainer, {key:key, node: this.props.node, channel: this.props.id, id:key, value:value, cs:this.props.cs}));
      }

    }

    // fetch key info from params

    var error = getParamValueFromChannel(co, DLM.DRONE_MODULE_PARAM_ERROR, [0])[0];

    var status = getParamValueFromChannel(co, DLM.DRONE_MODULE_PARAM_STATUS, [1])[0];

		var resetCount = getParamValueFromChannel(co, DLM.DRONE_MODULE_PARAM_RESETCOUNT, [0])[0];

    var title = this.props.id + '. '+ (this.props.value.name ? this.props.value.name : '?');

		var age = ((now - this.props.value.lastHeard)/1000);


    var tabs = [];

    if (customUI.length > 0) {
      tabs.push(
        e(ReactBootstrap.Tab,
           {key: 'custom', eventKey: 'custom', title: 'Interface' },
           customUI
         )
      );

      this.state.tab  = 'custom';
    }

    tabs.push(
      e(ReactBootstrap.Tab,
         {key: 'params', eventKey: 'params', title: 'Parameters' },
         e('div',{className:'params'}, items)
       )
    );


    var children = [
      e(ReactBootstrap.FormCheck, {
          key: 'status',
          id: 'statusCheck'+this.props.id,
          type:'switch',
          checked: (status > 0),
          className: 'status',
          onChange: (e)=>{
            DLM.sendDroneLinkMsg({
              addr: this.props.node + '>' + this.props.id + '.1',
              msgType: DLM.DRONE_LINK_MSG_TYPE_UINT8_T,
              values: [ e.target.checked ? 1 : 0 ]
            });
					},
          label: 'Enable'
        }),
      e('h1', {
				key: 'title',
				className: (this.state.show ? 'open' : 'closed'),
				onClick: ()=>{ this.setState({show: !this.state.show}); }
			}, [
				title,
				e('span', {key:'resetCount', className: 'resetCount ' + (resetCount > 0 ? 'bg-danger' : '')}, resetCount),
				e('span', {key:'lastHeard', className: 'lastHeard ' + (age > 60 ? 'bg-warning' : '')}, age.toFixed(0)+ 's')
			]),
      (this.state.show ?
          e('div',
            {key:'params', className:'channelTabs'},
            e(ReactBootstrap.Tabs, {
                defaultActiveKey: this.state.tab,
                id:'channelTabs' + title ,
                className:'',
                onSelect: tab => this.setState({ tab })
              },
              tabs )
            ) : null)
    ];


    return e(
      'div',
      { key: this.props.id, className: 'ChannelContainer ' + (status > 0 ? 'enabled' : '') + (error > 0 ? 'warning' : '') },
      children
    );
  }
}
