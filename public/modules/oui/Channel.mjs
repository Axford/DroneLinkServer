
import loadStylesheet from '../loadStylesheet.js';
import * as DLM from '../droneLinkMsg.mjs';


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

    // title
    this.uiTitleContainer = $('<h1 class="open"/>');
    this.isOpen = true;
    this.uiTitle = $('<span>' +data.channel + '. ?'+ '</span>');
    this.uiTitleContainer.append(this.uiTitle);
    this.uiTitleContainer.on('click', ()=>{
      if (me.isOpen) {
        this.collapse();
      } else {
        me.isOpen = true;
        me.uiTitleContainer.addClass('open');
        me.uiTitleContainer.removeClass('closed');
        me.uiChannelTabs.show();
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
    this.uiChannelTabs = $('<div class="channelTabs"/>');
    this.ui.append(this.uiChannelTabs);

    this.uiTabs = $('<ul class="nav nav-tabs">');
    this.uiChannelTabs.append(this.uiTabs);

    var itab = $('<li class="nav-item" style="display:none"></li>');
    this.uiTabs.append(itab);
    this.interfaceButton = $('<button class="nav-link">Interface</button>');
    this.interfaceButton.on('click',()=>{
      this.interfaceButton.addClass('active');
      this.parametersButton.removeClass('active');
      this.interfaceTab.show();
      this.parametersTab.hide();
    });
    itab.append(this.interfaceButton);

    var ptab = $('<li class="nav-item"></li>');
    this.uiTabs.append(ptab);
    this.parametersButton = $('<button class="nav-link active">Parameters</button>');
    this.parametersButton.on('click',()=>{
      this.interfaceButton.removeClass('active');
      this.parametersButton.addClass('active');
      this.interfaceTab.hide();
      this.parametersTab.show();
    });
    ptab.append(this.parametersButton);


    // tabs - these will be populated as params are detected, etc
    this.interfaceTab = $('<div class="tab-pane" style="display:none"></div>');
    this.uiChannelTabs.append(this.interfaceTab);

    this.parametersTab = $('<div class="tab-pane"></div>');
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


      // instance an interface if available


      // and show the new interface
      this.interfaceButton.parent().show();
      this.interfaceButton.addClass('active');
      this.parametersButton.removeClass('active');
      this.interfaceTab.show();
      this.parametersTab.hide();
    });


    // listen for values
    this.state.on('param.value', (data)=>{
      if (data.node != this.node.id ||
         data.channel != this.channel) return;

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



}
