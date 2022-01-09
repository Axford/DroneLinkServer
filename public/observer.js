
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
