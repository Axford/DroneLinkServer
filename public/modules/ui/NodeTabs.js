

import loadStylesheet from '../loadStylesheet.js';
import * as DLM from '../droneLinkMsg.js';

import NodeContainer from './NodeContainer.js';

// shortcut
const e = React.createElement;

loadStylesheet('./css/modules/ui/NodeTabs.css');


export default class NodeTabs extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
			key: 'node1',
		};
  }

  render() {
    var items = [];

    for (const [key, value] of Object.entries(this.props.cs)) {

			var title = key + '> ';
			if (value.channels[1] &&
				  value.channels[1].params[8] &&
					value.channels[1].params[8].values) {
				title += value.channels[1].params[8].values[0];
			}

      items.push(
        e(ReactBootstrap.Tab,
           {key: 'node'+key, eventKey: 'node'+key, title: title },
           e(NodeContainer, {key:key, id:key, value:value, cs:this.props.cs})
         )
      );
    }

    return e(ReactBootstrap.Tabs, {
      defaultActiveKey: this.state.key,
      id:'nodeTabs',
      className:'',
      onSelect: key => this.setState({ key })
    },
    items );
  }
}
