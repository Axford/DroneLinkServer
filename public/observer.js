
import loadStylesheet from './modules/loadStylesheet.js';

loadStylesheet('./css/observer.css');

import * as DLM from './modules/droneLinkMsg.mjs';
import DroneLinkState from './modules/DroneLinkState.mjs';
var state = new DroneLinkState();

import NodeUI from './modules/oui/NodeUI.mjs';

// object of nodes, keyed on id, with associated UI objects
// populated based on events from state object
var nodes = {};
var numNodes = 0;

var map;

mapboxgl.accessToken = 'pk.eyJ1IjoiYXhmb3JkIiwiYSI6ImNqMWMwYXI5MDAwNG8zMm5uanFyeThmZDEifQ.paAXk3S29-VVw1bhk458Iw';

import DroneLinkLog from './modules/DroneLinkLog.mjs';
var logger = new DroneLinkLog(state);

var liveMode = true;


function setPanelSize(w) {
  var container = $('#main'),
    left = $('#leftPanel'),
    right = $('#rightPanel');

  var maxOffset = container.width() - 200;
  if (w > maxOffset) w = maxOffset;

  left.css('right', w);
  right.css('width', w);
  map.resize();
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


async function saveLog() {
  var h = await getNewFileHandle();

  if (h) {
    // Create a FileSystemWritableFileStream to write to.
    const writable = await h.createWritable();

    // iterate over packets in log and write to stream
    for (var i=0; i<logger.log.length; i++) {
      await writable.write( logger.log[i].encodeForLog() );
    }


    // Close the file and write the contents to disk.
    await writable.close();
  }
}




async function loadLog() {
  logger.reset();

  let fileHandle;
  [fileHandle] = await window.showOpenFilePicker();

  const file = await fileHandle.getFile();

  var buffer = await file.arrayBuffer();
  console.log(buffer);

  const view = new Uint8Array(buffer);

  // parse view
  var i = 0;
  while (i < view.length) {
    // read size byte
    var size = view[i];
    console.log('Reading from '+i+': '+size+' bytes...');

    var packet = new Uint8Array(buffer, i, size);

    var msg = new DLM.DroneLinkMsg();
    msg.parseFromLog(packet);
    console.log(msg.timestamp + ': '+msg.asString());

    // add to logger
    logger.add(msg);

    // jump to next packet
    i += size;
  }
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
  });

}


init();
