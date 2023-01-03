
import loadStylesheet from '../loadStylesheet.js';
import * as DLM from '../droneLinkMsg.mjs';

import Parameter from './Parameter.mjs';

// interfaces
import CMPS12 from './interfaces/CMPS12.mjs';
import Depth from './interfaces/Depth.mjs';
import HMC5883L from './interfaces/HMC5883L.mjs';
import INA219 from './interfaces/INA219.mjs';
import INA3221 from './interfaces/INA3221.mjs';
import LSM9DS1 from './interfaces/LSM9DS1.mjs';
import Management from './interfaces/Management.mjs';
import MPU6050 from './interfaces/MPU6050.mjs';
import Nav from './interfaces/Nav.mjs';
import Neopixel from './interfaces/Neopixel.mjs';
import NMEA from './interfaces/NMEA.mjs';
import Polar from './interfaces/Polar.mjs';
import Proa from './interfaces/Proa.mjs';
import Receiver from './interfaces/Receiver.mjs';
import RFM69 from './interfaces/RFM69.mjs';
import Sailor from './interfaces/Sailor.mjs';
import SerialTelemetry from './interfaces/SerialTelemetry.mjs';
import Servo from './interfaces/Servo.mjs';
import TankSteer from './interfaces/TankSteer.mjs';
import TurnRate from './interfaces/TurnRate.mjs';
import UDPTelemetry from './interfaces/UDPTelemetry.mjs';
import Waypoint from './interfaces/Waypoint.mjs';
import Wind from './interfaces/Wind.mjs';
import WindFromWing from './interfaces/WindFromWing.mjs';


loadStylesheet('./css/modules/oui/Channel.css');


export default class Channel {
  constructor(node, state, data, container) {
    var me = this;
    this.node = node;
    this.state = state;
    this.channel = data.channel;
    this.name = '?';
    this.type = '';
    this.lastHeard = (new Date()).getTime();
    this.interface = null;
    this.params = {};
    this.uiState = 'parameters';
    this.visible = false;

    this.ui = $('<div class="Channel"/>');
    this.ui.data('channel', data.channel);
    container.append(this.ui);

    // status buttons
    this.uiEnable = $('<button class="btn btn-tiny btn-success float-right" style="display:none">Enable</button>');
    this.uiEnable.on('click',()=>{
      var qm = new DLM.DroneLinkMsg();
      qm.source = this.state.localAddress;
      qm.node = me.node.id;
      qm.channel = me.channel;
      qm.param = DLM.DRONE_MODULE_PARAM_STATUS;
      qm.setUint8([1]);
      this.state.send(qm);

      qm = new DLM.DroneLinkMsg();
      qm.source = this.state.localAddress;
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
      qm.source = this.state.localAddress;
      qm.node = me.node.id;
      qm.channel = me.channel;
      qm.param = DLM.DRONE_MODULE_PARAM_STATUS;
      qm.setUint8([0]);
      this.state.send(qm);

      qm = new DLM.DroneLinkMsg();
      qm.source = this.state.localAddress;
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
      me.changeUIState('interface');
    });
    this.ui.append(this.interfaceButton);

    this.parametersButton = $('<button class="btn btn-tiny btn-light float-right mr-1" style="display:none">Parameters</button>');
    this.parametersButton.on('click',()=>{
      me.changeUIState('parameters');
    });
    this.ui.append(this.parametersButton);

    // help button
    this.helpButton = $('<button class="btn btn-tiny btn-dark float-right mr-1" style="display:none"><i class="fas fa-info"></i></button>');
    this.helpButton.on('click',()=>{
      showHelp(this.type);
    });
    this.ui.append(this.helpButton);


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

      // trigger updateIfNeeded
      if (this.interface) {
        this.interface.updateIfNeeded();
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

      this.type = data.type;

      this.helpButton.show();
      //console.log(data);

      // instance an interface if available
      if (data.type == 'CMPS12') {
        this.interface = new CMPS12(this, state);
      } else if (data.type == 'Depth') {
        this.interface = new Depth(this, state);
      } else if (data.type == 'HMC5883L' || data.type == 'QMC5883L') {
        this.interface = new HMC5883L(this, state);
      } else if (data.type == 'INA219') {
        this.interface = new INA219(this, state);
      } else if (data.type == 'INA3221') {
        this.interface = new INA3221(this, state);
      } else if (data.type == 'LSM9DS1') {
        this.interface = new LSM9DS1(this, state);
      } else if (data.type == 'Management') {
        this.interface = new Management(this, state);
      } else if (data.type == 'MPU6050') {
        this.interface = new MPU6050(this, state);
      } else if (data.type == 'Nav') {
        this.interface = new Nav(this, state);
      } else if (data.type == 'Neopixel') {
        this.interface = new Neopixel(this, state);
      } else if (data.type == 'NMEA') {
        this.interface = new NMEA(this, state);
      } else if (data.type == 'Polar') {
        this.interface = new Polar(this, state);
      } else if (data.type == 'Proa') {
        this.interface = new Proa(this, state);
      } else if (data.type == 'Receiver') {
        this.interface = new Receiver(this, state);
      } else if (data.type == 'RFM69Telemetry') {
        this.interface = new RFM69(this, state);
      } else if (data.type == 'Sailor') {
        this.interface = new Sailor(this, state);
      } else if (data.type == 'SerialTelemetry') {
        this.interface = new SerialTelemetry(this, state);
      } else if (data.type == 'Servo') {
        this.interface = new Servo(this, state);
      } else if (data.type == 'TankSteer') {
        this.interface = new TankSteer(this, state);
      } else if (data.type == 'TurnRate') {
        this.interface = new TurnRate(this, state);
      } else if (data.type == 'UDPTelemetry') {
        this.interface = new UDPTelemetry(this, state);
      } else if (data.type == 'Waypoint') {
        this.interface = new Waypoint(this, state);
      } else if (data.type == 'Wind') {
        this.interface = new Wind(this, state);
      } else if (data.type == 'WindFromWing') {
        this.interface = new WindFromWing(this, state);
      }


      // and render / show the new interface
      if (this.interface) {
        this.uiState = 'interface';
        this.expand();

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
      if (data.param == DLM.DRONE_MODULE_PARAM_STATUS && data.msgType == DLM.DRONE_LINK_MSG_TYPE_UINT8_T) {
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
      if (data.param == DLM.DRONE_MODULE_PARAM_NAME&& data.msgType == DLM.DRONE_LINK_MSG_TYPE_CHAR) {
        this.name = data.values[0];
        this.uiTitle.html(data.channel + '. ' + this.name);
      }

      // resetCount
      if (data.param == DLM.DRONE_MODULE_PARAM_RESETCOUNT&& data.msgType == DLM.DRONE_LINK_MSG_TYPE_UINT8_T) {
        this.uiResetCount.html(data.values[0]);
        if (data.values[0] > 0) {
          this.uiResetCount.addClass('bg-danger');
        } else {
          this.uiResetCount.removeClass('bg-danger');
        }
      }
    });
  }


  changeUIState(s) {
    if (s == 'interface') {
      this.interfaceButton.hide();
      this.parametersButton.show();
      this.interfaceTab.show();
      this.parametersTab.hide();
      if (this.interface && (typeof this.interface.show === 'function')) {
        if (this.visible)
          this.interface.show();
      }
    } else if (s == 'parameters') {
      this.interfaceButton.show();
      this.parametersButton.hide();
      this.interfaceTab.hide();
      this.parametersTab.show();
      if (this.interface && (typeof this.interface.hide === 'function')) {
        this.interface.hide();
      }
    }
    this.uiState = s;
  }

  collapse() {
    this.isOpen = false;
    this.uiTitleContainer.removeClass('open');
    this.uiTitleContainer.addClass('closed');
    this.uiChannelTabs.hide();
    this.hide();
  }

  expand() {
    this.isOpen = true;
    this.uiTitleContainer.addClass('open');
    this.uiTitleContainer.removeClass('closed');
    this.uiChannelTabs.show(); 
    this.changeUIState(this.uiState);
  }

  show() {
    this.visible = true;
    this.changeUIState(this.uiState);
  }

  hide() {
    this.visible = false;
    if (this.interface) {
      this.interface.hide();
    }
  }
}
