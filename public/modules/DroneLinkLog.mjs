/*

Manages a time-stamped log of DroneLinkMsgs

*/


import * as DLM from './droneLinkMsg.mjs';

export default class DroneLinkLog {
  constructor(state) {
    var me = this;
    this.state = state;
    this.log = [];
    this.recording = false;
    this.callbacks = {}; // each key is an event type, values are an array of callback functions
    this.startTime = 0;
    this.playback = false;
    this.playbackIndex = 0;
    this.playbackStart = 0;
    this.playbackTime = 0;  //  how far into the playback are we - used for pause/rewind

    setInterval(()=>{
      if (me.playback) {
        // get time offset since start
        this.playbackTime = Date.now() - me.playbackStart;

        while (me.playbackIndex < me.log.length &&
               this.playbackTime >= me.log[me.playbackIndex].timestamp - me.log[0].timestamp) {

          var nextMsg = me.log[me.playbackIndex];
          //console.log(nextMsg);

          // send log message to state
          me.state.handleLinkMsg( nextMsg );

          me.trigger('playbackInfo',{
            packets:me.playbackIndex+1,
            duration: me.log[me.playbackIndex].timestamp - me.log[0].timestamp,
            percent: (me.playbackIndex+1) / me.log.length
          });

          me.playbackIndex++;
        }

        if (me.playbackIndex >= me.log.length) {
          me.playback = false;
          this.trigger('status', null);
        }
      }
    }, 100);

    this.state.on('raw', (msg)=>{
      // if recording, add to log
      if (me.recording) {
        me.add(msg);
      }
    })
  }

  add(msg, quiet=false) {
    var me = this;

    if (msg.msgType < DLM.DRONE_LINK_MSG_TYPE_NAMEQUERY) {
      if (me.log.length == 0) {
        me.startTime = msg.timestamp;
      }
      me.log.push(msg);
      if (!quiet)
        me.trigger('info',{
          packets:me.log.length,
          duration: msg.timestamp - me.log[0].timestamp
        });
    }

  }

  on(name, cb) {
    if (!this.callbacks.hasOwnProperty(name)) {
      this.callbacks[name] = [];
    }
    this.callbacks[name].push(cb);
  }

  trigger(name, param) {
    if (this.callbacks[name]) {
      this.callbacks[name].forEach((cb)=>{
        //console.log('trigger('+name+'): ', param);
        cb(param);
      })
    }
  }


  record() {
    console.log('DLL.record');

    // if this is the start of a new recording, then store state
    if (this.log.length == 0) {
      this.logState();
    }

    this.recording = !this.recording;
    this.trigger('status', null);
  }

  stopRecording() {
    this.recording = false;
    this.trigger('status', null);
  }

  reset() {
    this.log = [];
    this.trigger('info',{
      packets:0,
      duration: 0
    });
  }

  play() {
    this.playback = true;
    this.playbackStart = Date.now() - this.playbackTime;
    //this.playbackIndex = 0;
    //this.playbackStart = Date.now();

    this.trigger('status', null);
  }

  playAll() {
    // one shot playback
    for (var i=0; i<this.log.length; i++) {
      // send log message to state
      this.state.handleLinkMsg( this.log[i] );
    }
    this.playback = false;
  }

  forward() {
    // skip forward 1min
    // which is the equivalent of moving the playback start back a minute
    this.playbackStart -= 60000;
  }

  pause() {
    this.playback = false;
    this.trigger('status', null);
  }

  rewind() {
    this.playbackIndex = 0;
    this.playbackTime = 0;

    this.trigger('playbackInfo',{
      packets:0,
      duration: 0,
      percent:0
    });
  }


  logState() {
    // convert current state to log messages, that when replayed, will rebuild the current state

    // for each node
    //me.state[msg.node].channels[msg.channel].params.hasOwnProperty(msg.param)

    for (const [nkey, node] of Object.entries(this.state.state)) {
      this.logStateForNode(nkey, node);
    }
  }


  logStateForNode(nkey, node) {
    console.log('Logging state for: ', node);

    // for each channel
    for (const [ckey, channel] of Object.entries(node.channels)) {
      console.log('  channel:' + ckey);

      // for each param
      for (const [pkey, param] of Object.entries(channel.params)) {
        console.log('    param:' + pkey);

        var msg = new DLM.DroneLinkMsg();
        msg.node = nkey;
        msg.channel = ckey;
        msg.param = pkey;
        msg.writable = param.writable;

        switch(param.msgType) {
          case DLM.DRONE_LINK_MSG_TYPE_UINT8_T: msg.setUint8(param.values); break;
          case DLM.DRONE_LINK_MSG_TYPE_UINT32_T: msg.setUint32(param.values); break;
          case DLM.DRONE_LINK_MSG_TYPE_FLOAT: msg.setFloat(param.values); break;
          case DLM.DRONE_LINK_MSG_TYPE_CHAR: msg.setString(param.values[0]); break;
          case DLM.DRONE_LINK_MSG_TYPE_ADDR: msg.setUint8(param.values);
          msg.msgType = DLM.DRONE_LINK_MSG_TYPE_ADDR;
          msg.msgLength = 4;
          break;
        }

        this.add(msg, true);

        // also add a msg for the param name (if we know it)
        if (param.name) {
          var nameMsg = new DLM.DroneLinkMsg();
          nameMsg.copy(msg);

          nameMsg.setName(param.name);

          this.add(nameMsg,true);
        }
      }

    }
  }

  async saveToStream(writable) {
    // iterate over packets in log and write to stream
    for (var i=0; i<this.log.length; i++) {
      await writable.write( this.log[i].encodeForLog() );
    }
  }

  loadFromBuffer(buffer) {
    this.reset();

    const view = new Uint8Array(buffer);

    // parse view
    var i = 0;
    while (i < view.length) {
      // read size byte
      var size = view[i];
      //console.log('Reading from '+i+': '+size+' bytes...');

      var packet = new Uint8Array(buffer, i, size);

      var msg = new DLM.DroneLinkMsg();
      msg.parseFromLog(packet);
      //console.log(msg.timestamp + ': '+msg.asString());

      // add to logger
      this.add(msg);

      // jump to next packet
      i += size;
    }
  }

}
