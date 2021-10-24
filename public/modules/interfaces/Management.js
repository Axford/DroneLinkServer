import loadStylesheet from '../loadStylesheet.js';
import * as DLM from '../droneLinkMsg.mjs';
import { getParamValueFromChannel, getParamObjFromChannel } from '../droneLinkUtils.js';

// shortcut
const e = React.createElement;

loadStylesheet('./css/modules/interfaces/Management.css');


export default class Management extends React.Component {
	constructor(props) {
		super(props);
		this.state = {
			showLog: false,
			logfile:{
				__html: '... loading log ...'
			}
		}
	}

	render() {
    var items = [];

		// get node IP address
		var ipAddress = getParamValueFromChannel(this.props.channelObj, 12, [0,0,0,0]);
		var ipString = ipAddress.join('.');

    // uptime
    var uptime = getParamValueFromChannel(this.props.channelObj, 13, [0])[0];
		if (uptime == undefined) uptime = '0';
    uptime = new Date(uptime * 1000).toISOString().substr(11, 8);
    items.push(e('div',{key:'uptime', className:'uptime'}, 'Uptime: '+uptime));

		// startup log button
    items.push(e(ReactBootstrap.Button, {
        key:'startupLogButton',
        variant:'primary',
        className:'startupLogButton',
        onClick: (e) => {
					this.setState({ showLog: true });

					// fetch log file
					fetch('http://' + ipString + '/startup.log')
					  .then(response => response.text() )
					  .then(data => {
							//console.log(data);
							data = data.replace(/(?:\r\n|\r|\n)/g, '<br>');
							this.setState({ logfile: { __html: data } });
						});
        }
    }, 'Startup Log'));

		// config button
		/*
    items.push(e(ReactBootstrap.Button, {
        key:'configButton',
        variant:'primary',
        className:'configButton',
        onClick: (e) => {
					window.open('/configurator.htm?address=' + ipString);
        }
    }, 'Configurator'));*/

		// config button
    items.push(e(ReactBootstrap.Button, {
        key:'configButton',
        variant:'primary',
        className:'configButton',
        onClick: (e) => {
					window.open('http://' + ipString);
        }
    }, 'Node Mgmt'));

    // reset button
    items.push(e(ReactBootstrap.Button, {
        key:'resetButton',
        variant:'danger',
        className:'resetButton',
        type:'submit',
        size:'',
        onClick: (e) => {
          e.preventDefault();

          DLM.sendDroneLinkMsg({
            addr: this.props.node + '>1.10',
            msgType: DLM.DRONE_LINK_MSG_TYPE_UINT8_T,
            values: [ 1 ]
          });
        }
    }, 'Reset Node'));

		// re-run main button
    items.push(e(ReactBootstrap.Button, {
        key:'mainButton',
        variant:'primary',
        className:'mainButton',
        size:'',
        onClick: (e) => {
          e.preventDefault();

          DLM.sendDroneLinkMsg({
            addr: this.props.node + '>1.17',
            msgType: DLM.DRONE_LINK_MSG_TYPE_CHAR,
            values: '/main.txt'
          });
        }
    }, 'Re-run Main'));

		// modal
		items.push(e(ReactBootstrap.Modal,{
			key:'modal',
			show: this.state.showLog,
			onHide: (e)=>{ this.setState({ showLog:false}) }
		}, [
			e(ReactBootstrap.Modal.Header, { key:'header' },
				e(ReactBootstrap.Modal.Title, {}, 'Startup Log')
			),
			e(ReactBootstrap.Modal.Body, { key:'body' },
				e('div',{ dangerouslySetInnerHTML: this.state.logfile })
			),
			e(ReactBootstrap.Modal.Footer, { key:'footer' },
				e(ReactBootstrap.Button, {
					key:'closeButton',
					variant:'secondary',
					onClick: (e)=>{ this.setState({ showLog:false }) }
				}, 'Close')
			),
		]));

    return e('div', { className:'Management'  },
      items
    );
  }
}
