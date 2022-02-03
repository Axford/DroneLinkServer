
import loadStylesheet from './modules/loadStylesheet.js';

loadStylesheet('./css/observer.css');

import io from '../libs/socketio/socket.io.esm.min.mjs';
var socket = io();

socket.on('route.update', (msg)=>{
  console.log('route.update', msg);
});

import * as DLM from './modules/droneLinkMsg.mjs';
import DroneLinkState from './modules/DroneLinkState.mjs';
var state = new DroneLinkState(socket);

import NodeUI from './modules/oui/NodeUI.mjs';
import { controllers, initGamepads } from './modules/gamepads.js';

// object of nodes, keyed on id, with associated UI objects
// populated based on events from state object
var nodes = {};
var numNodes = 0;

var map;

mapboxgl.accessToken = 'pk.eyJ1IjoiYXhmb3JkIiwiYSI6ImNqMWMwYXI5MDAwNG8zMm5uanFyeThmZDEifQ.paAXk3S29-VVw1bhk458Iw';

import DroneLinkLog from './modules/DroneLinkLog.mjs';
var logger = new DroneLinkLog(state);
var stateLog = new DroneLinkLog(state);

var liveMode = true;

var parsedLog = [];
var logMarkers = [];


function setPanelSize(w) {
  var container = $('#main'),
    left = $('#leftPanel'),
    right = $('#rightPanel');

  var maxOffset = container.width() - 200;
  if (w > maxOffset) w = maxOffset;

  left.css('right', w);
  right.css('width', w);
  map.resize();

  // let nodes know they should also resize
  for (const [key, n] of Object.entries(nodes)) {
    n.resize();
  }
}

function openPanel() {
  var right = $('#rightPanel'),
     container = $('#main');
  if (right.width() == 0) setPanelSize(container.width()/2);
}


function showHelp(page) {
  $(".helpContainer").show();

  console.log('Loading help page: ' + page);
  if (page) {
    // load requested page, append the .html suffix
    $('.helpViewer').attr('src', 'help/' + page + '.html');
  }
}


async function getNewFileHandle() {
  const options = {
    types: [
      {
        description: 'Log Data File',
        accept: {
          'application/octet-stream': ['.log'],
        },
      },
    ],
  };
  const handle = await window.showSaveFilePicker(options);
  return handle;
}

async function loadState() {

  let fileHandle;
  [fileHandle] = await window.showOpenFilePicker();

  const file = await fileHandle.getFile();

  var buffer = await file.arrayBuffer();

  stateLog.loadFromBuffer(buffer);
  state.reset();
  stateLog.playAll();
}

async function saveState() {
  stateLog.reset();
  stateLog.logState();

  var h = await getNewFileHandle();

  if (h) {
    // Create a FileSystemWritableFileStream to write to.
    const writable = await h.createWritable();

    await stateLog.saveToStream(writable);

    // Close the file and write the contents to disk.
    await writable.close();
  }
}


async function saveLog() {
  var h = await getNewFileHandle();

  if (h) {
    // Create a FileSystemWritableFileStream to write to.
    const writable = await h.createWritable();

    await logger.saveToStream(writable);

    // Close the file and write the contents to disk.
    await writable.close();
  }
}




async function loadLog() {
  let fileHandle;
  [fileHandle] = await window.showOpenFilePicker();

  const file = await fileHandle.getFile();

  var buffer = await file.arrayBuffer();

  logger.loadFromBuffer(buffer);

  alert('Log loaded');
}


function calculateDistanceBetweenCoordinates( p1, p2) {
  var RADIUS_OF_EARTH = 6371e3;
  var lon1 = p1[0],  lat1=p1[1],  lon2=p2[0],  lat2=p2[1];
  var R = RADIUS_OF_EARTH; // metres
  var lat1r = lat1 * Math.PI/180; // φ, λ in radians
  var lat2r = lat2 * Math.PI/180;
  var lon1r = lon1 * Math.PI/180; // φ, λ in radians
  var lon2r = lon2 * Math.PI/180;
  var x = (lon2r-lon1r) * Math.cos((lat1r+lat2r)/2);
  var y = (lat2r-lat1r);
  var d = Math.sqrt(x*x + y*y) * R;
  return d;
}


function parseLog() {
  parsedLog = [];

  // clear markers
  // TODO

  var parseBuffer = Array(3);

  var lastLoc = [0,0];

  // buffer format:  lon lat RSSI

  // step through DroneLinkMsg objects in log
  for (var i=0; i<logger.log.length; i++) {
    var msg = logger.log[i];

    // extract required values and store in buffer
    if (msg.node == 1 && msg.channel == 5 && msg.param == 8) {
      // store lon and lat
      parseBuffer[0] = msg.valueArray()[0];
      parseBuffer[1] = msg.valueArray()[1];
    }


    if (msg.node == 1 && msg.channel == 3 && msg.param == 8) {
      // store RSSI
      parseBuffer[2] = msg.valueArray()[0];
    }


    /*
    if (msg.node == 10 && msg.channel == 13 && msg.param == 13) {
      // store depth
      parseBuffer[2] = msg.valueArray()[0];
    }
    */

    // add buffer to parsedLog
    // store on GPS location change
    if (msg.node == 1 && msg.channel == 5 && msg.param == 8) {
    //if (msg.node == 10 && msg.channel == 13 && msg.param == 13) {

      // check distance from lastLoc
      var d = calculateDistanceBetweenCoordinates(parseBuffer, lastLoc);

      if (d > 2) {
        parsedLog.push(parseBuffer);
        console.log('Stored: ', parseBuffer);

        var g = (1 - (parseBuffer[2]/100)) * 255;
        var r=0, b=0;

        if (parseBuffer[2] > 80) {
          r=g + 30;
          g=0;
        } else if(parseBuffer[2] > 70) {
          r=g;
        }

        addLogMarker(parseBuffer[0], parseBuffer[1], r, g, b);
        //addLogMarker(parseBuffer[0], parseBuffer[1], 1 - (parseBuffer[2]/10));

        lastLoc[0] = parseBuffer[0];
        lastLoc[1] = parseBuffer[1];
      }

    }

  }
}


function addLogMarker(lon,lat, r,g,b) {
  // create or update marker
  // -- target marker --
  var el = document.createElement('div');
  el.className = 'logMarker';
  el.style.backgroundColor = 'rgba('+r+','+g+','+b+',1)';

  var marker;

  marker = new mapboxgl.Marker(el)
      .setLngLat([lon,lat])
      .addTo(map);
}


function init() {
  // install showHelp on window object
  window.showHelp = showHelp;

  // configure DroneLink logo to open help
  $('.logo').on('click', ()=>{
    showHelp('index');
  });

  // configure help window
  var helpRelX = 0, helpRelY = 0;
  var helpDragging = false;

  $('.helpHeader').mousedown(function(event) {
    helpDragging = true;
    helpRelX = event.pageX - $(this).offset().left;
    helpRelY = event.pageY - $(this).offset().top;
  });
  $("body").mousemove(function(event){
    if (helpDragging) {
      $(".helpContainer")
         .css({
             left: event.pageX - helpRelX,
             top: event.pageY - helpRelY
         })
    }
  });
  $('body').mouseup(function(event) {
    helpDragging = false;
  });

  $('.helpHeader button').on('click', ()=>{
    $(".helpContainer").hide();
  });

  // configure state controls
  $('#stateLoadButton').on('click', ()=>{
    loadState();
  });
  $('#stateSaveButton').on('click', ()=>{
    saveState();
  });

  // configure logger
  $('#logRecordButton').on('click', ()=>{
    logger.record();
  });

  $('#logResetButton').on('click', ()=>{
    logger.reset();
  });

  $('#logPlaybackButton').on('click', ()=>{
    if (liveMode) {
      // switch to playback mode
      liveMode = false;
      logger.stopRecording();
      $('#logPlaybackButton').html('Playback');
      state.liveMode = false;
      $('.logRecordControls').hide();
      $('.logPlaybackControls').show();

    } else {
      // switch to liveMode
      liveMode = true;
      logger.pause();
      logger.rewind();
      $('#logPlaybackButton').html('Live');
      state.liveMode = true;
      $('.logRecordControls').show();
      $('.logPlaybackControls').hide();
    }
  });

  $('#logPlayButton').on('click', ()=>{
    logger.play();
  });

  $('#logPauseButton').on('click', ()=>{
    logger.pause();
  });

  $('#logRewindButton').on('click', ()=>{
    logger.rewind();
  });

  $('#logSaveButton').on('click', ()=>{
    saveLog();
  });

  $('#logLoadButton').on('click', ()=>{
    loadLog();
  });

  $('#logParseButton').on('click', ()=>{
    parseLog();
  });

  logger.on('status', ()=>{
    // update recording status
    $('#logRecordButton').html(logger.recording ? '<i class="fas fa-stop"></i>' : '<i class="fas fa-circle"></i>');
  });

  logger.on('info', (info)=>{
    var t = (info.duration/1000);
    var minutes = Math.floor(t/60);
    var seconds = Math.round(t - (minutes*60));
    $('#logStatus').html(info.packets + ' / '+ ('0000'+minutes).slice(-2) + ':' + ('0000'+seconds).slice(-2) +' ');
  });

  logger.on('playbackInfo', (info)=>{
    var t = (info.duration/1000);
    var minutes = Math.floor(t/60);
    var seconds = Math.round(t - (minutes*60));

    var px = $('#logPlaybackStatus').outerWidth() * (1-info.percent);
    $('#logPlaybackStatus').css('background-position', '-'+px+'px 0px');

    $('#logPlaybackStatus').html(info.packets + ' / '+ ('0000'+minutes).slice(-2) + ':' + ('0000'+seconds).slice(-2) +' ');
  });

  // configure map
  map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/satellite-v9',
    center: [-1.804, 51.575],
    zoom: 17.5
  });

  map.on('style.load', () => {

    map.setPaintProperty(
      'satellite',
      'raster-opacity',
      0.5
    );

    map.on('dblclick',(e)=>{
      e.preventDefault();
      // copy location to clipboard
      navigator.clipboard.writeText(e.lngLat.lng.toFixed(6) + ' ' + e.lngLat.lat.toFixed(6));

      // pass to nodes
      for (const [key, n] of Object.entries(nodes)) {
        n.onMapDoubleClick(e);
      }
    });

    map.on('mousemove',(e)=>{
      // update coord div
      $('.mapCoords').html(e.lngLat.lng.toFixed(6) + ', ' + e.lngLat.lat.toFixed(6));
    });


    // check we've resized
    map.resize();

    // setup everything else
    // setup drag handler
    var isResizing = false,
      lastDownX = 0;

    var container = $('#main'),
      left = $('#leftPanel'),
      right = $('#rightPanel'),
      handle = $('#panelDrag');

    setPanelSize(0);

    handle.on('mousedown', function (e) {
      isResizing = true;
      lastDownX = e.clientX;
    });

    $(document).on('mousemove', function (e) {
      // we don't want to do anything if we aren't resizing.
      if (!isResizing)
          return false;

      var offsetRight = container.width() - (e.clientX - container.offset().left);

      setPanelSize(offsetRight);
      return false;
    }).on('mouseup', function (e) {
      // stop resizing
      isResizing = false;
    });


    // Create new nodes as they are detected
    state.on('node.new', (id)=>{
      console.log('node.new:' + id);

      // create new node entry
      var node = new NodeUI(id, state, map);
      nodes[id] = node;
      numNodes++;

      node.onFocus = (n)=>{
        // blur all other nodes
        for (const [key, n] of Object.entries(nodes)) {
          if (n != node) n.blur();
        }

        // ensure mgmt panel is open
        openPanel();
      }

      if (numNodes == 1) {
        node.focus();
        // hide status
        $('.status').hide();
      }

    });

    state.goLive();
  });


  // init gamepads
  initGamepads(()=>{
    // on gamepad connected.... or any other gamepad event
    //console.log('Gamepad connected', controllers[0].axes);
    for (const [key, n] of Object.entries(nodes)) {
      if (n.focused) n.updateGamepad(controllers[0]);
    }
  })

}


init();
