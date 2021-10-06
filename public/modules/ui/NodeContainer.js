
import loadStylesheet from '../loadStylesheet.js';
import * as DLM from '../droneLinkMsg.js';

import ChannelContainer from './ChannelContainer.js';

// shortcut
const e = React.createElement;

loadStylesheet('./css/modules/ui/NodeContainer.css');



export default class NodeContainer extends React.Component {
  constructor(props) {
    super(props);
  }

  render() {
    // this.props contains: {key:key, id:key, value:value}
    // for a specific node

		// sort channels by status
		var channels = this.props.value.channels;
		var keys = Object.keys(channels);
		keys.sort((a,b)=>{
			var s1 = 0, s2 = 0;
			if (channels[a].params[DLM.DRONE_MODULE_PARAM_STATUS] && channels[a].params[DLM.DRONE_MODULE_PARAM_STATUS].values)
	      s1 = channels[a].params[DLM.DRONE_MODULE_PARAM_STATUS].values[0];

			if (channels[b].params[DLM.DRONE_MODULE_PARAM_STATUS] && channels[b].params[DLM.DRONE_MODULE_PARAM_STATUS].values)
	      s2 = channels[b].params[DLM.DRONE_MODULE_PARAM_STATUS].values[0];


			if (s1 == s2) {
				return Object.keys(channels[b].params).length - Object.keys(channels[a].params).length
			} else
				return s2-s1;
		});

    var items = [];
    keys.forEach( (key) => {
			var value = channels[key];
      //console.log('channel', key);
			// check if valid channel
			if (value.params) {
				items.push(e(ChannelContainer, {key:key, id:key, node:this.props.id, value:value, cs:this.props.cs}));
			}
    });

    return e(
      'div',
      { key: this.props.id, className: 'NodeContainer' },
      [
        e('div', {key: 'interfaceInfo', className:'interfaceInfo'}, this.props.value.interface),
				e('div', {key:'nodeBody', className:'nodeBody'}, items)
      ]
    );
  }
}
