import loadStylesheet from '../loadStylesheet.js';
import * as DLM from '../droneLinkMsg.mjs';

loadStylesheet('./css/modules/oui/Parameter.css');


export default class Parameter {
	constructor(channel, param, state) {
    this.channel = channel;
    this.param = param;
    this.state = state;
    this.built = false;
    this.addr = this.channel.node.id + '>' + this.channel.channel + '.' + param;
    this.title = '?';
    this.msgType = 255;
		this.addrResolved = false;
		this.addrValues = [0,0,0,0];

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
		var obj = this.state.getObjectsForAddress(this.addrValues[1], this.addrValues[2], this.addrValues[3]);

		var resolved = false;
		var addrString = '';
		if (obj.node && obj.node.name != undefined) {
			addrString += obj.node.name;
			resolved = true;
		}  else {
			addrString += this.addrValues[1];
		}
		addrString += ' > ';

		if (obj.channel && obj.channel.name != undefined) {
			addrString += obj.channel.name;
			resolved = resolved && true;
		}  else {
			addrString += this.addrValues[2];
			resolved = false;
		}
		addrString += ' .';

		if (obj.param && obj.param.name != undefined) {
			addrString += obj.param.name;
			resolved = resolved && true;
		}  else {
			addrString += this.addrValues[3];
			resolved = false;
		}

		this.addrResolved = resolved;

		this.uiValues.children().eq(0).html(addrString);
	}

  updateAddrValues(data) {

		this.addrValues = data.values;

		this.resolveAddr();
  }


	onParamValue(data) {

    if (data.msgType <= DLM.DRONE_LINK_MSG_TYPE_CHAR) {

      if (this.msgType == 255) {
        this.msgType = data.msgType;
        this.uiAddr.html(this.addr + ' ' +  DLM.DRONE_LINK_MSG_TYPE_NAMES[this.msgType]);
        this.ui.addClass('type_' + DLM.DRONE_LINK_MSG_TYPE_NAMES[this.msgType]);
      }

      // make sure we have enough value containers
      while (this.uiValues.children().length < (data.msgType == DLM.DRONE_LINK_MSG_TYPE_ADDR ? 1 : data.values.length)) {
        this.uiValues.append('<div class="value">?</div>')
      }

      // update values
      switch(data.msgType) {
        case DLM.DRONE_LINK_MSG_TYPE_UINT8_T:
        case DLM.DRONE_LINK_MSG_TYPE_UINT32_t:
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
        console.log(this.addr + ' name query');
        var qm = new DLM.DroneLinkMsg();
        qm.source = 252;
        qm.node = this.channel.node.id;
        qm.channel = this.channel.channel;
        qm.param = this.param;
        qm.msgType = DLM.DRONE_LINK_MSG_TYPE_NAMEQUERY;
        qm.msgLength = 1;
        this.state.send(qm);
      }

      // check writable
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
        console.log(this.addr + ' name query');
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
}
