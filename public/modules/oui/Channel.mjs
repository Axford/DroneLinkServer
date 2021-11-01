
import loadStylesheet from '../loadStylesheet.js';
import * as DLM from '../droneLinkMsg.mjs';

import Parameter from './Parameter.mjs';

// interfaces
import Management from './interfaces/Management.mjs';
import Sailor from './interfaces/Sailor.mjs';
import TurnRate from './interfaces/TurnRate.mjs';


loadStylesheet('./css/modules/oui/Channel.css');


export default class Channel {
  constructor(node, state, data) {
    var me = this;
    this.node = node;
    this.state = state;
    this.channel = data.channel;
    this.name = '?';
    this.type = '';
    this.lastHeard = (new Date()).getTime();
    this.interface = null;
    this.params = {};

    this.ui = $('<div class="Channel"/>');
    this.ui.data('channel', data.channel);
    this.node.mui.append(this.ui);

    // status buttons
    this.uiEnable = $('<button class="btn btn-tiny btn-success float-right" style="display:none">Enable</button>');
    this.uiEnable.on('click',()=>{
      var qm = new DLM.DroneLinkMsg();
      qm.source = 252;
      qm.node = me.node.id;
      qm.channel = me.channel;
      qm.param = DLM.DRONE_MODULE_PARAM_STATUS;
      qm.setUint8([1]);
      this.state.send(qm);

      qm = new DLM.DroneLinkMsg();
      qm.source = 252;
      qm.node = me.node.id;
      qm.channel = me.channel;
      qm.param = DLM.DRONE_MODULE_PARAM_STATUS;
      qm.msgType = DLM.DRONE_LINK_MSG_TYPE_QUERY;
      this.state.send(qm);
    });
    this.ui.append(this.uiEnable);

    this.uiDisable = $('<button class="btn btn-tiny btn-secondary float-right" style="display:none">Disable</button>');
    this.uiDisable.on('click',()=>{
      var qm = new DLM.DroneLinkMsg();
      qm.source = 252;
      qm.node = me.node.id;
      qm.channel = me.channel;
      qm.param = DLM.DRONE_MODULE_PARAM_STATUS;
      qm.setUint8([0]);
      this.state.send(qm);

      qm = new DLM.DroneLinkMsg();
      qm.source = 252;
      qm.node = me.node.id;
      qm.channel = me.channel;
      qm.param = DLM.DRONE_MODULE_PARAM_STATUS;
      qm.msgType = DLM.DRONE_LINK_MSG_TYPE_QUERY;
      this.state.send(qm);
    });
    this.ui.append(this.uiDisable);

    // tab buttons
    this.interfaceButton = $('<button class="btn btn-tiny btn-light float-right mr-1" style="display:none">Interface</button>');
    this.interfaceButton.on('click',()=>{
      this.interfaceButton.hide();
      this.parametersButton.show();
      this.interfaceTab.show();
      this.parametersTab.hide();
    });
    this.ui.append(this.interfaceButton);

    this.parametersButton = $('<button class="btn btn-tiny btn-light float-right mr-1" style="display:none">Parameters</button>');
    this.parametersButton.on('click',()=>{
      this.interfaceButton.show();
      this.parametersButton.hide();
      this.interfaceTab.hide();
      this.parametersTab.show();
    });
    this.ui.append(this.parametersButton);

    // title
    this.uiTitleContainer = $('<h1 class="closed"/>');
    this.isOpen = false;
    this.uiTitle = $('<span>' +data.channel + '. ?'+ '</span>');
    this.uiTitleContainer.append(this.uiTitle);
    this.uiTitleContainer.on('click', ()=>{
      if (me.isOpen) {
        this.collapse();
      } else {
        this.expand();
      }
    });
    this.ui.append(this.uiTitleContainer);

    // resetCount
    this.uiResetCount = $('<span class="resetCount">0</span>');
    this.uiTitleContainer.append(this.uiResetCount);

    // lastHeard
    this.uiLastHeard = $('<span class="lastHeard">0s</span>');
    this.uiTitleContainer.append(this.uiLastHeard);

    setInterval( () =>{
      // update lastHeard
      var now = (new Date()).getTime();
      var age = ((now - this.lastHeard)/1000);
      this.uiLastHeard.html(age.toFixed(0) + 's');
      if (age > 60) { this.uiLastHeard.addClass('bg-warning'); } else {
        this.uiLastHeard.removeClass('bg-warning');
      }
    }, 1000);


    // create tab nav for interface and params
    this.uiChannelTabs = $('<div class="channelTabs" style="display:none"/>');
    this.ui.append(this.uiChannelTabs);

    // tabs - these will be populated as params are detected, etc
    this.interfaceTab = $('<div class="tab-pane interfaceTab" style="display:none"></div>');
    this.uiChannelTabs.append(this.interfaceTab);

    this.parametersTab = $('<div class="tab-pane parametersTab"></div>');
    this.uiChannelTabs.append(this.parametersTab);


    // listen for module name
    this.state.on('module.name', (data)=>{
      if (data.node != this.node.id ||
         data.channel != this.channel) return;

      this.name = data.name;
      this.uiTitle.html(data.channel + '. ' + this.name);
    });

    // listen for module heard
    this.state.on('module.heard', (data)=>{
      if (data.node != this.node.id ||
         data.channel != this.channel) return;

      this.lastHeard = (new Date()).getTime();
    });

    // listen for key node types
    this.state.on('module.type', (data)=>{
      if (data.node != this.node.id ||
         data.channel != this.channel) return;

      console.log(data);

      // instance an interface if available
      if (data.type == 'Management') {
        this.interface = new Management(this, state);
      } else if (data.type == 'Sailor') {
        this.interface = new Sailor(this, state);
      } else if (data.type == 'TurnRate') {
        this.interface = new TurnRate(this, state);
      }


      // and render / show the new interface
      if (this.interface) {
        this.interface.build();

        this.uiChannelTabs.show();

        this.interfaceButton.hide();
        this.parametersButton.show();
        this.interfaceTab.show();
        this.parametersTab.hide();
      }
    });


    // listen for new params
    this.state.on('param.new', (data)=>{
      if (data.node != this.node.id ||
         data.channel != this.channel) return;

     // construct Parameter (ignore system parameters)
     if (data.param >= 8) {
       var p = new Parameter(this, data.param, state);
       this.params[data.param] = p;

       // sort
       var children = this.parametersTab.children();
       var sortList = Array.prototype.sort.bind(children);

       sortList((a,b)=>{
         return $(a).data('param') - $(b).data('param');
       });

       this.parametersTab.append(children);
     }
    });


    // listen for values
    this.state.on('param.value', (data)=>{
      if (data.node != this.node.id ||
         data.channel != this.channel) return;

      // pass to interface
      if (this.interface) {
        this.interface.onParamValue(data);
      }

      // pass to parameter
      if (this.params[data.param]) {
        this.params[data.param].onParamValue(data);
      }

      // status
      if (data.param == DLM.DRONE_MODULE_PARAM_STATUS) {
        if (data.values[0] > 0) {
          this.ui.addClass('enabled');
          this.uiEnable.hide();
          this.uiDisable.show();
        } else {
          this.ui.removeClass('enabled');
          this.collapse();
          this.uiEnable.show();
          this.uiDisable.hide();
        }
      }

      // name
      if (data.param == DLM.DRONE_MODULE_PARAM_NAME) {
        this.name = data.values[0];
        this.uiTitle.html(data.channel + '. ' + this.name);
      }

      // resetCount
      if (data.param == DLM.DRONE_MODULE_PARAM_RESETCOUNT) {
        this.uiResetCount.html(data.values[0]);
        if (data.values[0] > 0) {
          this.uiResetCount.addClass('bg-danger');
        } else {
          this.uiResetCount.removeClass('bg-danger');
        }
      }
    });


  }

  collapse() {
    this.isOpen = false;
    this.uiTitleContainer.removeClass('open');
    this.uiTitleContainer.addClass('closed');
    this.uiChannelTabs.hide();
  }

  expand() {
    this.isOpen = true;
    this.uiTitleContainer.addClass('open');
    this.uiTitleContainer.removeClass('closed');
    this.uiChannelTabs.show();
  }

}
