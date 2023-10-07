
import loadStylesheet from './modules/loadStylesheet.js';

loadStylesheet('./css/observer.css');

// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.14.0/firebase-app.js";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries
import { getFirestore,  collection, doc, setDoc } from "https://www.gstatic.com/firebasejs/9.14.0/firebase-firestore.js";
import { getStorage, ref, uploadBytesResumable, listAll, getBytes } from "https://www.gstatic.com/firebasejs/9.14.0/firebase-storage.js";

Date.prototype.yyyymmdd = function() {
  var mm = this.getMonth() + 1; // getMonth() is zero-based
  var dd = this.getDate();

  return [this.getFullYear(),
          (mm>9 ? '' : '0') + mm,
          (dd>9 ? '' : '0') + dd
         ].join('');
};

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


import io from '../libs/socketio/socket.io.esm.min.mjs';
var socket = io();


import * as DLM from './modules/droneLinkMsg.mjs';
import DroneLinkState from './modules/DroneLinkState.mjs';
var state = new DroneLinkState(socket, db);

var firmwareVersion = '', latestFirmwareVersion = '';

import UIManager from './modules/oui/UIManager.mjs';
import NodeUI from './modules/oui/NodeUI.mjs';
import { controllers, initGamepads } from './modules/gamepads.js';
import UploadManager from './modules/UploadManager.mjs';
import LogManager from './modules/LogManager.mjs';
import SparkLine from './modules/SparkLine.mjs';
import Tabs from './modules/oui/Tabs.mjs';

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
var analyser;

import ExportManager from './modules/oui/ExportManager.mjs';
var exportManager;

var uploadManager, logManager;

var liveMode = true;

// give UI manager a reference to the nodes collection
var uiManager = new UIManager(nodes);

var lastSelectedNode = 1;

function saveMapLocation() {
  var lngLat = map.getCenter();
  localStorage.location = JSON.stringify({
    lng:lngLat.lng,
    lat:lngLat.lat
  });
  localStorage.zoom = JSON.stringify(map.getZoom());
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

  if (logger.size() == 0) return;

  // generate filename
  var filename = 'logs/' + (new Date(logger.startTime)).toISOString() + '.log';

  // get blob from logger
  var blob = logger.createBlob();

  uploadManager.uploadFile(filename, blob, {});

  // now reset log contents ready to store some more
  logger.reset();
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

  // load previous selection
  if (localStorage.selectedNode)
    lastSelectedNode = JSON.parse(localStorage.selectedNode);
  

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


  // configure upload manager
  uploadManager = new UploadManager(storage, $('#uploadManager'));

  // configure logManager
  logManager = new LogManager(storage, $('#logManager'));
  logManager.on('logLoaded', (buffer)=>{
    // pass to logger to load and playback
    logger.loadFromBuffer(buffer);

    if (resumeLogPlayback) logger.play();
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

  analyser = new AnalysisManager($('#analysisPanel'), state);

  exportManager = new ExportManager($('#exportPanel'), state);


  // tab manager
  var topTabs = new Tabs($('#topTabs'));

  topTabs.add('map', 'Map', '<i class="fas fa-map-marked"></i>', 'nav-link');
  topTabs.on('map', ()=>{
    networkGraph.hide();
    analyser.hide();
    exportManager.hide();
    $('#mapPanel').show();
    map.resize();
  });

  topTabs.add('network', 'Network', '<i class="fas fa-project-diagram"></i>', 'nav-link');
  topTabs.on('network', ()=>{
    analyser.hide();
    $('#mapPanel').hide();
    exportManager.hide();
    networkGraph.show();
  });

  topTabs.add('analysis', 'Analysis', '<i class="fas fa-chart-bar"></i>', 'nav-link');
  topTabs.on('analysis', ()=>{
    $('#mapPanel').hide();
    networkGraph.hide();
    exportManager.hide();
    analyser.show();
  });

  topTabs.add('export', 'Export', '<i class="fas fa-file-csv"></i>', 'nav-link');
  topTabs.on('export', ()=>{
    $('#mapPanel').hide();
    networkGraph.hide();
    analyser.hide();
    exportManager.show();
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
      resumeLogPlayback = false;
      logger.stopRecording();
      $('#logPlaybackButton').html('Playback');
      state.liveMode = false;
      $('.logRecordControls').hide();
      $('.logPlaybackControls').show();

      // load logs
      logManager.loadLogs();

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
    
    logManager.selectNextLog();
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
    });

    map.on('contextmenu', (e) => {
      // show the global context menu
      uiManager.showContextMenu(e.point, e.lngLat);
    });

    map.on('click', (e) =>{
      uiManager.hideContextMenu();
    });

    map.on('move', ()=>{
      // update last location in localstorage
      saveMapLocation();
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
      var node = new NodeUI(id, state, map, uiManager, db, storage, socket, exportManager);
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

        // save selection for reload
        localStorage.selectedNode = JSON.stringify(n.id);

        // ensure mgmt panel is open
        openPanel();
      }

      node.onStateChange = () => {
        // resort nodes in overlay
        var c = $('#nodes').children().sort((a,b)=>{
          try {
            var av = ($(a).data('isActive') ? 0 : 255) + $(a).data('id');
            var bv = ($(b).data('isActive') ? 0 : 255) + $(b).data('id');
            return av - bv;
          } catch (e) {
          }
          return 0;
        });
        $('#nodes').append(c);
      }

      if (numNodes == 1) {
        node.focus();
        // hide status
        $('.status').remove();

        // sort list
        node.onStateChange();
      }

      // is this the last selected node?
      if (id == lastSelectedNode) {
        node.focus();
      }

    });

    state.goLive();

    // show body
    document.body.style.visibility = 'visible';

    // select map tab
  topTabs.selectTab('map');
  });

  // init gamepads
  initGamepads(()=>{
    // on gamepad connected.... or any other gamepad event
    //console.log('Gamepad connected', controllers[0].axes);
    for (const [key, n] of Object.entries(nodes)) {
      if (n.focused) n.updateGamepad(controllers[0]);
    }
  });

  var transmitSpark = new SparkLine($('#transmitGraph'), { depth:60, label:'Tx' });
  var receiveSpark = new SparkLine($('#receiveGraph'), { depth:60, label:'Rx' });

  // poll for discovery queue size
  setInterval(()=>{
    transmitSpark.addSample(state.discoveryQueue.sent);
    state.discoveryQueue.sent = 0;

    // get rx info...
    receiveSpark.addSample(state.received);
    state.received = 0;

  }, 1000);

}


init();
