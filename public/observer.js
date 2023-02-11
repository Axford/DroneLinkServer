
import loadStylesheet from './modules/loadStylesheet.js';

loadStylesheet('./css/observer.css');

// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.14.0/firebase-app.js";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries
import { getFirestore,  collection, doc, setDoc } from "https://www.gstatic.com/firebasejs/9.14.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, listAll, getBytes } from "https://www.gstatic.com/firebasejs/9.14.0/firebase-storage.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCk0qtHjpFO90FBXJtqXVPB2RSBc8b2e_g",
  authDomain: "dronelink-25dbc.firebaseapp.com",
  projectId: "dronelink-25dbc",
  storageBucket: "dronelink-25dbc.appspot.com",
  messagingSenderId: "722464451302",
  appId: "1:722464451302:web:590b5f4213069c772d6927",
  storageBucket: 'gs://dronelink-25dbc.appspot.com'
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

console.log('Loaded firebase');

// Initialize Cloud Firestore and get a reference to the service
const db = getFirestore(app);

// Initialize Cloud Storage and get a reference to the service
const storage = getStorage(app);

/*
try {
  const docRef = doc(db, 'nodes', '250');
  setDoc(docRef, { 
    id: 250,
    name: "Server"
   }, { merge: true });


  console.log("Document written");
} catch (e) {
  console.error("Error adding document: ", e);
}
*/



import io from '../libs/socketio/socket.io.esm.min.mjs';
var socket = io();


import * as DLM from './modules/droneLinkMsg.mjs';
import DroneLinkState from './modules/DroneLinkState.mjs';
var state = new DroneLinkState(socket, db);

var firmwareVersion = '', latestFirmwareVersion = '';

import NodeUI from './modules/oui/NodeUI.mjs';
import { controllers, initGamepads } from './modules/gamepads.js';

import AisTracker from './modules/oui/AisTracker.mjs';
var tracker = new AisTracker();

// object of nodes, keyed on id, with associated UI objects
// populated based on events from state object
var nodes = {};
var numNodes = 0;

var map;

mapboxgl.accessToken = 'pk.eyJ1IjoiYXhmb3JkIiwiYSI6ImNqMWMwYXI5MDAwNG8zMm5uanFyeThmZDEifQ.paAXk3S29-VVw1bhk458Iw';

import DroneLinkLog from './modules/DroneLinkLog.mjs';
var logger = new DroneLinkLog(state);
var stateLog = new DroneLinkLog(state);

var resumeLogPlayback = false;

import NetManager from './modules/oui/NetManager.mjs';
var networkGraph;

import AnalysisManager from './modules/oui/AnalysisManager.mjs';
import Neopixel from './modules/oui/interfaces/Neopixel.mjs';
var analyser;

var liveMode = true;

var parsedLog = [];
var logMarkers = [];

function saveMapLocation(lngLat) {
  localStorage.location = JSON.stringify({
    lng:lngLat.lng,
    lat:lngLat.lat
  });
  // TODO
  localStorage.zoom = JSON.stringify(17.5);
}

socket.on('localAddress', (id)=>{
  // set local address on state
  state.localAddress = id;
  if (networkGraph) networkGraph.localAddress = id;
});

socket.on('AIS', (msg)=>{
  tracker.handleAIS(msg);
});


function setPanelSize(w) {
  var container = $('#main'),
    left = $('#leftPanel'),
    right = $('#rightPanel');

  var maxOffset = container.width() - 200;
  if (w > maxOffset) w = maxOffset;

  left.css('right', w);
  right.css('width', w);
  map.resize();

  networkGraph.resize();

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


function saveLog() {
  /*
  var h = await getNewFileHandle();

  if (h) {
    // Create a FileSystemWritableFileStream to write to.
    const writable = await h.createWritable();

    await logger.saveToStream(writable);

    // Close the file and write the contents to disk.
    await writable.close();
  }
  */

  if (logger.size() == 0) return;

  // generate filename
  var filename = 'logs/' + (new Date(logger.startTime)).toISOString() + '.log';

  const storageRef = ref(storage, filename);

  // get blob from logger
  var blob = logger.createBlob();

  // 'file' comes from the Blob or File API
  uploadBytes(storageRef, blob).then((snapshot) => {
    console.log('Uploaded a blob or file!');
    // now reset log contents ready to store some more
    logger.reset();
  }); 
}




async function loadLogs() {

  // clear selection
  $('#logSelect').empty();

  // Create a reference under which you want to list
  const listRef = ref(storage, 'logs');

  // Find all the prefixes and items.
  listAll(listRef)
    .then((res) => {
      res.prefixes.forEach((folderRef) => {
        // All the prefixes under listRef.
        // You may call listAll() recursively on them.
      });
      res.items.forEach((itemRef) => {
        // All the items under listRef.
        console.log(itemRef.name);
        var dateStr = itemRef.name.slice(0,-4);
        var fileDate = new Date(dateStr);

        var niceName = fileDate.toString().slice(0,24);

        // add to selection box
        var option = $('<option value="'+itemRef.fullPath+'">'+niceName+'</option>');
        $('#logSelect').append(option);
      });

      $('#logSelect').val('');
    }).catch((error) => {
      // Uh-oh, an error occurred!
      console.error(error);
    });


  /*
  let fileHandle;
  [fileHandle] = await window.showOpenFilePicker();

  const file = await fileHandle.getFile();

  var buffer = await file.arrayBuffer();

  logger.loadFromBuffer(buffer);

  alert('Log loaded');
  */
}


async function loadLog(filePath) {
  const docRef = ref(storage, filePath);

  getBytes(docRef)
    .then((buffer)=>{
      // pass to logger to load and playback
      logger.loadFromBuffer(buffer);

      if (resumeLogPlayback) logger.play();
    })
    .catch((error) => {
      // Uh-oh, an error occurred!
      console.error(error);
    });
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

/*
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
*/

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


function fetchFirmwareVersion() {
  fetch('/firmware/firmware.ver')
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }
      return response.text();
    })
    .then((text) => {
      console.log('Firmware version: ' + text);
      firmwareVersion = text;

      // inform Nodes of latest firmware version
      for (const [key, n] of Object.entries(nodes)) {
        n.setLatestFirmwareVersion(text);
      }
    })
    .catch((error) => console.error(`Could not fetch firmware.ver: ${error}`));

  // recheck every minute
  setTimeout(fetchFirmwareVersion, 60000);
}


function init() {
  // install showHelp on window object
  window.showHelp = showHelp;

  // fetch latest firmware version from server, and repeat on a regular basis
  fetchFirmwareVersion();


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


  // view controls
  $('#viewMapButton').on('click', ()=>{
    $('#mapPanel').show();
    $('#networkPanel').hide();
    $('#analysisPanel').hide();
    networkGraph.visible = false;
    analyser.visible = false;

    $('#viewMapButton').removeClass('inactive');
    $('#viewNetworkButton').removeClass('active');
    $('#viewAnalysisButton').removeClass('active');

    $('#viewMapButton').addClass('active');
    $('#viewNetworkButton').addClass('inactive');
    $('#viewAnalysisButton').addClass('inactive');

    map.resize();
  });

  networkGraph = new NetManager(socket, $('#networkPanel'));
  networkGraph.localAddress = state.localAddress;
  networkGraph.on('focus', (id)=>{
    // TODO - focus node
    var node = nodes[id];
    if (node) {
      node.focus();
    }
  });

  $('#viewNetworkButton').on('click', ()=>{
    $('#mapPanel').hide();
    $('#networkPanel').show();
    $('#analysisPanel').hide();
    networkGraph.visible = true;
    analyser.visible = false;

    $('#viewMapButton').removeClass('active');
    $('#viewNetworkButton').removeClass('inactive');
    $('#viewAnalysisButton').removeClass('active');

    $('#viewMapButton').addClass('inactive');
    $('#viewNetworkButton').addClass('active');
    $('#viewAnalysisButton').addClass('inactive');

    networkGraph.resize();
  });

  $('#viewAnalysisButton').on('click', ()=>{
    $('#mapPanel').hide();
    $('#networkPanel').hide();
    $('#analysisPanel').show();
    networkGraph.visible = false;
    analyser.visible = true;

    $('#viewMapButton').removeClass('active');
    $('#viewNetworkButton').removeClass('active');
    $('#viewAnalysisButton').removeClass('inactive');

    $('#viewMapButton').addClass('inactive');
    $('#viewNetworkButton').addClass('inactive');
    $('#viewAnalysisButton').addClass('active');
  });

  analyser = new AnalysisManager($('#analysisOutput'), state);

  $('#analysisResetButton').on('click', ()=>{
    analyser.reset();
  });

  // configure state controls
  /*
  $('#stateLoadButton').on('click', ()=>{
    loadState();
  });
  $('#stateSaveButton').on('click', ()=>{
    saveState();
  });
  */

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
      resumeLogPlayback = false;
      logger.stopRecording();
      $('#logPlaybackButton').html('Playback');
      state.liveMode = false;
      $('.logRecordControls').hide();
      $('.logPlaybackControls').show();

      // load logs
      loadLogs();

    } else {
      // switch to liveMode
      liveMode = true;
      resumeLogPlayback = false;
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

  $('#logForwardButton').on('click', ()=>{
    logger.forward();
  });

  $('#logSelect').on('change', function() {
    loadLog(this.value);
  });

  logger.on('status', ()=>{
    // update recording status
    $('#logRecordButton').html(logger.recording ? '<i class="fas fa-stop"></i>' : '<i class="fas fa-circle"></i>');
  });

  logger.on('info', (info)=>{
    // if reached 5min, then trigger save
    if (info.duration >= 5*60000 && logger.recording) {
      saveLog();
    } else {
      var t = (info.duration/1000);
      var minutes = Math.floor(t/60);
      var seconds = Math.round(t - (minutes*60));
      $('#logStatus').html(info.packets + ' / '+ ('0000'+minutes).slice(-2) + ':' + ('0000'+seconds).slice(-2) +' ');
    }
  });
0
  logger.on('playbackInfo', (info)=>{
    var t = (info.duration/1000);
    var minutes = Math.floor(t/60);
    var seconds = Math.round(t - (minutes*60));

    var px = $('#logPlaybackStatus').outerWidth() * (1-info.percent);
    $('#logPlaybackStatus').css('background-position', '-'+px+'px 0px');

    $('#logPlaybackStatus').html(info.packets + ' / '+ ('0000'+minutes).slice(-2) + ':' + ('0000'+seconds).slice(-2) +' ');
  });

  logger.on('EOF', ()=>{
    // load next log file...
    resumeLogPlayback = true;
    // current index
    var index = $('#logSelect').prop('selectedIndex');
    // number of options
    var numOptions = $('#logSelect option').length;
    index++;
    if (index < numOptions) {
      $('#logSelect option')[index].selected = true;
      $('#logSelect').change();
    }
  });

  // load last position from local storage
  var lngLat;
  var zoom;
  try {
    var lngLat = JSON.parse(localStorage.location);
    var zoom = JSON.parse(localStorage.zoom);
  } catch (e) {
    lngLat = {
      lng: -1.804,
      lat: 51.575
    }
    zoom = 17.5;
  }

  // configure map
  map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/satellite-v9',
    center: [lngLat.lng, lngLat.lat],
    zoom: zoom
  });

  map.on('style.load', () => {

    tracker.map = map;

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

      // update last location in localstorage
      saveMapLocation(e.lngLat);
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
      node.setLatestFirmwareVersion(latestFirmwareVersion);
      nodes[id] = node;
      numNodes++;

      node.onFocus = (n)=>{
        // blur all other nodes
        for (const [key, n] of Object.entries(nodes)) {
          if (n != node) n.blur();
        }

        // update network graph
        networkGraph.focus(n.id);

        // update AIS tracker
        tracker.focus(n);

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

    // show body
    document.body.style.visibility = 'visible';
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
