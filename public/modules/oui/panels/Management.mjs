import Panel from './Panel.mjs';
import loadStylesheet from '../../loadStylesheet.js';

import Channel from '../Channel.mjs';

loadStylesheet('./css/modules/oui/panels/Management.css');


export default class Management extends Panel {

  constructor(node, tabs, panels) {
    super(node, tabs, panels);

    this.tabName = 'Management';
    this.title = 'Management';
    this.icon = 'fas fa-table';

    this.channels = {};

    // settings stored in firestorage, e.g. channel minimise/maximise settings
    this.settings = {};

    this.settingsChanged = false;

    this.build();
  }


  build() {
    super.build();
    var me = this;

    // set UI to be sortable
    this.ui.panel.sortable();
    this.ui.panel.on('sortstop', ()=>{
      var orderData = me.ui.panel.sortable('toArray');
      //console.log(orderData);  // array of channel dom id's 

      orderData.forEach((ele, index)=>{
        var channelId = parseInt(ele.substr(ele.indexOf('>')+1));
        me.channels[channelId].ui.data('sortOrder', index);
        if (!me.settings.hasOwnProperty(channelId)) {
          me.settings[channelId] = {};  
        }
        me.settings[channelId].sortOrder = index;
      });

      this.settingsChanged = true;
    })

    // subscribe to module.new events
    this.node.state.on('module.new', (data)=>{
      if (data.node != this.node.id) return;

      //console.log('module.new: ' + data.node + '> ' + data.channel);

      // attempt to retrieve sort order
      var sortOrder = this.settings[data.channel] ? this.settings[data.channel].sortOrder : null;

      // create new channel UI
      this.channels[data.channel] = new Channel(this, this.node, this.node.state, data, this.ui.panel, sortOrder);

      // sort
      this.sortChannels();

      this.updateColumns();

      // see if we have settings info for this channel
      if (this.settings.hasOwnProperty(data.channel)) {
        this.expandChannel(data.channel, this.settings[data.channel].expanded);
      }
    });

  }


  sortChannels() {
    var children = this.ui.panel.children();
    var sortList = Array.prototype.sort.bind(children);

    sortList((a,b)=>{
      return $(a).data('sortOrder') - $(b).data('sortOrder');
    });

    // re-append sorted children
    this.ui.panel.append(children);
  }

  clear() {
    this.ui.panel.empty();
  }

  updateColumns() {
    var w = this.ui.panel.width();

    if ( w > 0) {
      // update column count
      var cols = Math.floor(w / 300);
      this.ui.panel.css('column-count', cols);
      return true;
    } 
    return false;
  }

  update() {
    if (!this.visible) return;

    this.updateInterfaces();
  }


  updateInterfaces() {
    for (const [key, chan] of Object.entries(this.channels)) {
      if (chan.interface) chan.interface.update();
    }
  }

  resize() {
    if (!this.built || !this.visible) return;

    if (this.updateColumns()) {
      this.updateInterfaces();
    }
  }

  show() {
    super.show();
    this.updateColumns();
    for (const [key, chan] of Object.entries(this.channels)) {
      chan.show();
    }
  }

  hide() {
    super.hide();
    for (const [key, chan] of Object.entries(this.channels)) {
      chan.hide();
    }
  }


  notifyChannelInterfaceCreated(channel) {
    // check settings for whether to expand or not
    if (this.settings.hasOwnProperty(channel.channel)) {
      this.expandChannel(channel.channel, this.settings[channel.channel].expanded);
    } else {
      // expand by default

      this.expandChannel(channel.channel, true);
    }
  }


  notifyChannelExpanded(channel, expanded) {
    var changed = false;
    if (this.settings.hasOwnProperty(channel.channel)) {
      if (this.settings[channel.channel].expanded != expanded) {
        changed = true;
      }
    } else {
      // create setting
      changed = true;
    }

    if (changed) {
      this.settings[channel.channel] = {
        expanded: expanded
      };
      this.settingsChanged = true;
    }
  }


  // true to expand, false to contract
  expandChannel(id, expand) {
    if (this.channels.hasOwnProperty(id)) {
      if (expand) {
        this.channels[id].expand(false);
      } else  
      this.channels[id].collapse(false);
    }
  }


  updateSettings(settings) {

    // merge new settings into existing settings
    for (const [key, obj] of Object.entries(settings)) {
      // key represents a channel id
      if (this.settings.hasOwnProperty(key)) {
        // compare and action
        if (obj.expanded != this.settings[key].expanded) {
          // action
          this.expandChannel(key, obj.expanded);
        }
        if (obj.sortOrder != this.settings[key].sortOrder) {
          this.settings[key].sortOrder = obj.sortOrder;
          this.channels[key].ui.data('sortOrder', obj.sortOrder);
        }
      } else {
        // add and action
        this.settings[key] = obj;
        // action 
        this.expandChannel(key, obj.expanded);

        if (this.channels.hasOwnProperty(key)) {
          this.channels[key].ui.data('sortOrder', obj.sortOrder);
        }
      }
    }

    // in case sort has changed
    this.sortChannels();
  }


}
