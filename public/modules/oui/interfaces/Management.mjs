import loadStylesheet from '../../loadStylesheet.js';
import * as DLM from '../../droneLinkMsg.mjs';

loadStylesheet('./css/modules/interfaces/Management.css');


export default class Management {
	constructor(channel, state) {
    this.channel = channel;
    this.state = state;
    this.built = false;
	}

	update() {

	}

	updateMacros(ip) {
		// fetch new
    fetch('http://' + ip + '/listfiles?json')
      .then(response => {
        if (!response.ok) {
          throw new Error('Network response was not OK');
        }
        return response.json();
      })
      .then(data => {
				console.log('[Management.mjs] Received files');
        console.log(data);
				// delete existing
				this.macroButtons.empty();

        //this.cuiFilesOnNodeTitle.html( data.files.length +' Files on Node');
        //this.cuiFilesOnNodeFiles.empty();
        data.files.forEach((f)=>{

					if (f.name.slice(-4) == '.txt' &&
				      f.name != '/config.txt' &&
						  f.name != '/main.txt') {
						var newBut =  $('<button class="btn btn-sm btn-success mb-2 mr-1">'+f.name.slice(1,-4)+'</button>');
						var filename = f.name;
						newBut.on('click', ()=>{
							var qm = new DLM.DroneLinkMsg();
				      qm.source = this.state.localAddress;
				      qm.node = this.channel.node.id;
				      qm.channel = 1;
				      qm.param = 17;
							qm.setString(filename);
				      this.state.send(qm);
						});
						this.macroButtons.append(newBut);
					}


					/*
          var sizeStr =  '';
          if (f.size < 1000) {
            sizeStr = f.size.toFixed(0);
          } else {
            sizeStr = (f.size/1024).toFixed(1) + 'k';
          }
          var fe = $('<div class="file clearfix">'+f.name+' <span class="size float-right">'+sizeStr+'</span></div>');
          fe.data('name',f.name);
          fe.on('click',()=>{
            this.cuiFilesOnNodeFiles.children().removeClass('selected');
            this.selectedNodeFilename = fe.data('name');
            fe.addClass('selected');
            this.cuiGetFileBut.show();
          });
          this.cuiFilesOnNodeFiles.append(fe);*/
        });
      })
      .catch(error => {
        //this.cuiFilesOnNodeFiles.html('Error fetching files: '+error);
        console.error('There has been a problem with your fetch operation:', error);
        //this.cuiGetFileBut.hide();
      });
  }

	updateIP() {
		var node = this.channel.node.id;
    var channel = this.channel.channel;

		var ipAddress = this.state.getParamValues(node, channel, 12, [0,0,0,0]);
		console.log('ip', ipAddress);
		if (ipAddress[0] != 0) {
			var ipString = ipAddress.join('.');
			this.ipAddress.html('IP: '+ipString);

			this.updateMacros(ipString);
		}
	}

	onParamValue(data) {
    if (data.param == 13 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_UINT32_T) {
			var uptime = data.values[0];
			if (uptime == undefined) uptime = '0';
	    uptime = new Date(uptime * 1000).toISOString().substr(11, 8);
			this.uptime.html('Uptime: ' + uptime);
		}

		if (data.param == 12 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_UINT8_T) {
			// ip
			this.log.show();
			this.updateIP();
		}
  }

	showLog(data) {

		this.modal.find('.modal-body').html(data);
		this.modal.show();
	}

	build() {
    var node = this.channel.node.id;
    var channel = this.channel.channel;

		this.ui = $('<div class="Management"></div>');

    // uptime
		this.uptime = $('<div class="uptime">Uptime: ?</div>');
    this.ui.append(this.uptime);

		// uptime
		this.ipAddress = $('<div class="ipAddress">IP: ?</div>');
    this.ui.append(this.ipAddress);

		this.log = $('<button class="btn btn-sm btn-primary mb-2 ml-1" style="display:none">Log</button>');
		this.log.on('click', ()=>{
			// fetch log file
			var ipAddress = this.state.getParamValues(node, channel, 12, [0,0,0,0]);
			if (ipAddress[0] == 0) {
				console.log(ipAddress);
				return;
			}

			var ipString = ipAddress.join('.');

			fetch('http://' + ipString + '/startup.log')
				.then(response => response.text() )
				.then(data => {
					console.log(data);
					data = data.replace(/(?:\r\n|\r|\n)/g, '<br>');
					this.showLog(data);
				});
		});
		this.ui.append(this.log);

		this.config = $('<button class="btn btn-sm btn-primary mb-2 ml-1 mr-1">Config</button>');
		this.config.on('click', ()=>{
			// get node IP address
			var ipAddress = this.state.getParamValues(node, channel, 12, [0,0,0,0]);
			var ipString = ipAddress.join('.');

			window.open('http://' + ipString);
		});
		this.ui.append(this.config);

		this.reset = $('<button class="btn btn-sm btn-danger mb-2 mr-3">Reset</button>');
		this.reset.on('click', ()=>{
			var qm = new DLM.DroneLinkMsg();
			qm.source = this.state.localAddress;
			qm.node = this.channel.node.id;
			qm.channel = 1;
			qm.param = 10;
			qm.setUint8([ 1 ]);
			this.state.send(qm);
		});
		this.ui.append(this.reset);

		this.macroButtons = $('<div class="macros"></div>');
		this.ui.append(this.macroButtons);

		this.updateIP();

/*
		this.main = $('<button class="btn btn-sm btn-primary mb-2 mr-1">Main</button>');
		this.main.on('click', ()=>{
			DLM.sendDroneLinkMsg({
				addr: this.channel.node.id + '>1.17',
				msgType: DLM.DRONE_LINK_MSG_TYPE_CHAR,
				values: '/main.txt'
			});
		});
		this.ui.append(this.main);

		this.arm = $('<button class="btn btn-sm btn-success mb-2 mr-1">Arm</button>');
		this.arm.on('click', ()=>{
			DLM.sendDroneLinkMsg({
				addr: this.channel.node.id + '>1.17',
				msgType: DLM.DRONE_LINK_MSG_TYPE_CHAR,
				values: '/arm.txt'
			});
		});
		this.ui.append(this.arm);

		this.disarm = $('<button class="btn btn-sm btn-secondary mb-2">Disarm</button>');
		this.disarm.on('click', ()=>{
			DLM.sendDroneLinkMsg({
				addr: this.channel.node.id + '>1.17',
				msgType: DLM.DRONE_LINK_MSG_TYPE_CHAR,
				values: '/disarm.txt'
			});
		});
		this.ui.append(this.disarm);
*/

		// log modal
		this.modal = $('<div class="modal" style="display:none;"> <div class="modal-dialog modal-dialog-centered" ><div class="modal-content"> <div class="modal-header"> <div class="modal-title h4">Startup Log</div> </div> <div class="modal-body"></div> <div class="modal-footer"> <button class="btn btn-secondary">Close</button> </div> </div> </div> </div>');
		this.modal.prependTo($(document.body));

		this.modal.find('.btn').on('click', ()=>{
			this.modal.hide();
		});

/*

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
		*/

		this.channel.interfaceTab.append(this.ui);

    this.built = true;

    this.update();
  }
}
