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
        if (msg.msgType < DLM.DRONE_LINK_MSG_TYPE_NAMEQUERY) {
          // add timestamp
          msg.timestamp = Date.now();
          if (me.log.length == 0) {
            me.startTime = msg.timestamp;
          }
          me.log.push(msg);
          me.trigger('info',{
            packets:me.log.length,
            duration: msg.timestamp - me.log[0].timestamp
          })
        }
      }
    })
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

}
