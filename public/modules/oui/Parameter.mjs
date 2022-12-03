import loadStylesheet from '../loadStylesheet.js';
import * as DLM from '../droneLinkMsg.mjs';

loadStylesheet('./css/modules/oui/Parameter.css');


export default class Parameter {
	
	constructor(channel, param, state) {
		var me = this;
		this.channel = channel;
		this.param = param;
		this.state = state;
		this.built = false;
		this.addr = this.channel.node.id + '>' + this.channel.channel + '.' + param;
		this.title = '?';
		this.msgType = 255;
		this.addrResolved = false;
		this.paramValues = [0,0,0,0];
		this.writable = false;

		this.editor = null;

		this.state.on('param.name', (data)=>{
			//console.log('pn', data);
			if (data.node != me.channel.node.id ||
			data.channel != me.channel.channel ||
			data.param != me.param) return;
			
			me.title = data.name;
			me.uiName.html(me.title);
		});

		this.build();
	}


  updateIntValues(data) {
    var c = this.uiValues.children();
    for (var i=0; i<data.values.length; i++) {
      c.eq(i).html( data.values[i].toLocaleString() );
    }
  }

  updateFloatValues(data) {
    var c = this.uiValues.children();
    for (var i=0; i<data.values.length; i++) {
      c.eq(i).html( data.values[i].toFixed(4) );
    }
  }

	resolveAddr() {

		// query param obj for target address
		var obj = this.state.getObjectsForAddress(this.paramValues[1], this.paramValues[2], this.paramValues[3]);

		var resolved = false;
		var addrString = '';
		if (obj.node && obj.node.name != undefined) {
			addrString += obj.node.name;
			resolved = true;
		}  else {
			addrString += this.paramValues[1];
		}
		addrString += ' > ';

		if (obj.channel && obj.channel.name != undefined) {
			addrString += obj.channel.name;
			resolved = resolved && true;
		}  else {
			addrString += this.paramValues[2];
			resolved = false;
		}
		addrString += ' .';

		if (obj.param && obj.param.name != undefined) {
			addrString += obj.param.name;
			resolved = resolved && true;
		}  else {
			addrString += this.paramValues[3];
			resolved = false;
		}

		this.addrResolved = resolved;

		this.uiValues.children().eq(0).html(addrString);
	}

  updateAddrValues(data) {

		this.resolveAddr();
  }


	onParamValue(data) {

    if (data.msgType <= DLM.DRONE_LINK_MSG_TYPE_CHAR) {
			this.paramValues = data.values;

      if (this.msgType == 255) {
        this.msgType = data.msgType;
        this.uiAddr.html(this.addr + ' ' +  DLM.DRONE_LINK_MSG_TYPE_NAMES[this.msgType] + ' p' + data.priority);
        this.ui.addClass('type_' + DLM.DRONE_LINK_MSG_TYPE_NAMES[this.msgType]);
      }

      // make sure we have enough value containers
      while (this.uiValues.children().length < (data.msgType == DLM.DRONE_LINK_MSG_TYPE_ADDR ? 1 : data.values.length)) {
        this.uiValues.append('<div class="value">?</div>')
      }

      // update values
      switch(data.msgType) {
        case DLM.DRONE_LINK_MSG_TYPE_UINT8_T:
        case DLM.DRONE_LINK_MSG_TYPE_UINT32_T:
          this.updateIntValues(data);
          break;

        case DLM.DRONE_LINK_MSG_TYPE_ADDR:
          this.updateAddrValues(data);
          break;

        case DLM.DRONE_LINK_MSG_TYPE_FLOAT:
          this.updateFloatValues(data);
          break;

        case DLM.DRONE_LINK_MSG_TYPE_CHAR:
          this.uiValues.children().eq(0).html(data.values[0])
          break;
      }

    }

    this.update();
  }

  update() {
		if (!this.built) return;

    var obj = this.state.getParamObj(this.channel.node.id, this.channel.channel, this.param);

    if (obj) {
      // update name
      if (obj.name && this.title == '?') {
        this.title = obj.name;
        this.uiName.html(this.title);

        //if (this.namecheckInterval) clearInterval(this.namecheckInterval);
      } else if (this.title == '?') {
        // fire a name query
        //console.log(this.addr + ' name query');
		/*
        var qm = new DLM.DroneLinkMsg();
        qm.source = this.state.localAddress;
        qm.node = this.channel.node.id;
        qm.channel = this.channel.channel;
        qm.param = this.param;
        qm.msgType = DLM.DRONE_LINK_MSG_TYPE_NAMEQUERY;
        qm.msgLength = 1;
        this.state.send(qm);
		*/
      }

      // check writable
			this.writable = obj.writable;
      if (obj.writable) {
        this.ui.addClass('writable');
      } else {
        this.ui.removeClass('writable');
      }
    }
  }

	build() {
		this.built = true;

		this.ui = $('<div class="card Parameter"></div>');
    this.ui.data('addr', this.addr);
    this.ui.data('param', this.param);
		this.ui.on('click',()=>{
			//if (this.writable) {
				this.showEditor();
			//}
		});

    // Title
    this.uiTitle = $('<div class="card-title"></div>');
    this.ui.append(this.uiTitle);

    // paramName
    this.uiName = $('<span>?</span>');
    this.uiTitle.append(this.uiName);

    // addrInfo
    this.uiAddr = $('<span class="addr">'+this.addr+'</span>');
    this.uiTitle.append(this.uiAddr);

    // valueContainer
    this.uiValues = $('<div class="values"></div>');
    this.ui.append(this.uiValues);



    this.channel.parametersTab.append(this.ui);

    this.built = true;

    this.namecheckInterval = setInterval(()=>{
      if (this.title == '?') {
        // fire a name query
        //console.log(this.addr + ' name query');
        var qm = new DLM.DroneLinkMsg();
        qm.source = 252;
        qm.node = this.channel.node.id;
        qm.channel = this.channel.channel;
        qm.param = this.param;
        qm.msgType = DLM.DRONE_LINK_MSG_TYPE_NAMEQUERY;
        qm.msgLength = 1;
        this.state.send(qm);
      }

			if (this.msgType == DLM.DRONE_LINK_MSG_TYPE_ADDR && !this.addrResolved) {
				this.resolveAddr();
			}
    }, 2000);
  }


	showEditor() {
		if (this.editor == null) {
			this.buildEditor();
		}

		// update
		this.eTitle.html(this.addr + ' ' +  DLM.DRONE_LINK_MSG_TYPE_NAMES[this.msgType] + ': ' + this.title);


		// ensure we have the right number of form inputs
		while (this.eBody.children().length < (this.paramValues.length)) {
			this.eBody.append('<input type="text" class="form-control"/>')
		}

		// pre-populate current values
		for (var i=0; i<this.eBody.children().length; i++) {
			this.eBody.children().eq(i).val( this.paramValues[i] );
		}

		this.editor.show();
	}

	saveParam() {
		this.editor.hide();

		// fetch values from editor dialog
		for (var i=0; i<this.eBody.children().length; i++) {
			var v = this.eBody.children().eq(i).val();
			console.log(i, v);
			// convert to appropriate data type
			switch(this.msgType) {
				case DLM.DRONE_LINK_MSG_TYPE_UINT8_T:
				case DLM.DRONE_LINK_MSG_TYPE_UINT32_T:
					this.paramValues[i] = parseInt(v);
					break;

				case DLM.DRONE_LINK_MSG_TYPE_ADDR:
					this.paramValues[i] = parseInt(v);
					break;

				case DLM.DRONE_LINK_MSG_TYPE_FLOAT:
					this.paramValues[i] = parseFloat(v);
					break;

				case DLM.DRONE_LINK_MSG_TYPE_CHAR:
					this.paramValues[i] = v;
					break;
			}
		}

		// and send
		var qm = new DLM.DroneLinkMsg();
		qm.node = this.channel.node.id;
		qm.channel = this.channel.channel;
		qm.param = this.param;
		qm.writable = false;
		switch(this.msgType) {
			case DLM.DRONE_LINK_MSG_TYPE_UINT8_T:
				qm.setUint8(this.paramValues);
				break;

			case DLM.DRONE_LINK_MSG_TYPE_UINT32_T:
				qm.setUint32(this.paramValues);
				break;

			case DLM.DRONE_LINK_MSG_TYPE_ADDR:
				qm.setUint8(this.paramValues);
				qm.msgType = this.msgType;
				break;

			case DLM.DRONE_LINK_MSG_TYPE_FLOAT:
				qm.setFloat(this.paramValues);
				break;

			case DLM.DRONE_LINK_MSG_TYPE_CHAR:
				qm.setString(this.paramValues[0]);
				break;
		}
		console.log('Sending: ' + qm.asString() );
		this.state.send(qm);

		// now send an immediate query for the new value
		qm = new DLM.DroneLinkMsg();
		qm.node = this.channel.node.id;
		qm.channel = this.channel.channel;
		qm.param = this.param;
		qm.writable = false;
		qm.msgType = DLM.DRONE_LINK_MSG_TYPE_QUERY;
		this.state.send(qm);
	}


	buildEditor() {
		this.editor = $('<div class="modal paramEditor" role="dialog" style="display:none;">');

		this.eDialog = $('<div class="modal-dialog modal-dialog-centered" role="document">');
		this.editor.append(this.eDialog);

		this.eContent = $('<div class="modal-content">');
		this.eDialog.append(this.eContent);

		this.eHeader = $('<div class="modal-header">');
		this.eContent.append(this.eHeader);

		this.eTitle = $('<div class="modal-title h4"></div>');
		this.eHeader.append(this.eTitle);

		this.eBody = $('<div class="modal-body"></div>');
		this.eContent.append(this.eBody);

		this.eFooter = $('<div class="modal-footer">');
		this.eContent.append(this.eFooter);

		this.eCancel = $('<button class="btn btn-danger">Cancel</button>');
		this.eCancel.on('click',()=>{ this.editor.hide(); });
		this.eFooter.append(this.eCancel);

		this.eSave = $('<button class="btn btn-primary">Save</button>');
		this.eSave.on('click',()=>{ this.saveParam(); });
		this.eFooter.append(this.eSave);

		this.editor.prependTo($(document.body));
	}
}
