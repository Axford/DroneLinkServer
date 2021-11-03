
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



function init() {
  map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/satellite-v9',
    center: [-1.804, 51.575],
    zoom: 17.5
  });

  map.on('style.load', () => {

    /*
    map.on('click', function(e) {
      var coordinates = e.lngLat;
      new mapboxgl.Popup()
        .setLngLat(coordinates)
        .setHTML(coordinates)
        .addTo(map);
    });
    */

    // check we've resized
    map.resize();
  });



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

}


init();
