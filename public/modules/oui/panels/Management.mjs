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

    // set UI to be sortable
    this.ui.panel.sortable();

    // subscribe to module.new events
    this.node.state.on('module.new', (data)=>{
      if (data.node != this.node.id) return;

      //console.log('module.new: ' + data.node + '> ' + data.channel);

      // create new channel UI
      this.channels[data.channel] = new Channel(this, this.node, this.node.state, data, this.ui.panel);

      // sort
      var children = this.ui.panel.children();
      var sortList = Array.prototype.sort.bind(children);

      sortList((a,b)=>{
        return $(a).data('channel') - $(b).data('channel');
      });

      // re-append sorted children
      this.ui.panel.append(children);

      this.updateColumns();

      // see if we have settings info for this channel
      if (this.settings.hasOwnProperty(data.channel)) {
        this.expandChannel(data.channel, this.settings[data.channel].expanded);
      }
    });

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
    //console.log('Update settings:', settings);

    // merge new settings into existing settings
    for (const [key, obj] of Object.entries(settings)) {
      // key represents a channel id
      if (this.settings.hasOwnProperty(key)) {
        // compare and action
        if (obj.expanded != this.settings[key].expanded) {
          // action
          this.expandChannel(key, obj.expanded);
        }
      } else {
        // add and action
        this.settings[key] = obj;
        // action 
        this.expandChannel(key, obj.expanded);
      }
    }
  }


}
