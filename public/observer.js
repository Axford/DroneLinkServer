
import loadStylesheet from './modules/loadStylesheet.js';

loadStylesheet('./css/observer.css');

import * as DLM from './modules/droneLinkMsg.mjs';
import DroneLinkState from './modules/DroneLinkState.mjs';
var state = new DroneLinkState();

// object of nodes, keyed on id, with associated UI objects
// populated based on events from state object
var nodes = {};

var map;

mapboxgl.accessToken = 'pk.eyJ1IjoiYXhmb3JkIiwiYSI6ImNqMWMwYXI5MDAwNG8zMm5uanFyeThmZDEifQ.paAXk3S29-VVw1bhk458Iw';

const metersToPixels = (meters, latitude, zoom) =>
  meters / (78271.484 / 2 ** zoom) / Math.cos(latitude * Math.PI / 180);


function initNodeLocation(node) {
  console.log('Adding node');

  // update node label
  var icon = document.createElement('i');
  icon.className = 'fas fa-map-marked';
  node.uiIcons.appendChild(icon);

  // create map objects
  // -----------------------------------------

  // -- marker --
  node.mapEl = document.createElement('div');
  node.mapEl.className = 'marker';
  var arrow = document.createElement('i');
  arrow.className = 'fas fa-arrow-up';
  node.mapEl.appendChild(arrow);
  node.marker = new mapboxgl.Marker(node.mapEl)
        .setLngLat(node.location)
        .addTo(map);

  // -- snailTrail --
  node.snailTrail = { "type": "LineString", "coordinates": [ node.location ] };
  map.addSource('snailTrail', { type: 'geojson', lineMetrics: true, data: node.snailTrail });
  map.addLayer({
    'id': 'snailTrail',
    'type': 'line',
    'source': 'snailTrail',
    'paint': {
      'line-color': 'green',
      'line-opacity': 0.5,
      'line-width': 2,
      'line-gradient': [
        'interpolate',
        ['linear'],
        ['line-progress'],
        0,
        'rgba(0,255,0,0)',
        1,
        'rgba(0,255,0,1)'
      ]
    }
  });
}

function updateLocation(node, newLoc) {
  node.location = newLoc;
  // update snailTrail
  if (node.snailTrail) {
    node.snailTrail.coordinates.push(node.location);
    if (node.snailTrail.coordinates.length > 100) {
      node.snailTrail.coordinates.shift();
    }
    var src = map.getSource('snailTrail');
    if (src) src.setData(node.snailTrail);
  }

  // update target
  if (node.targetTrace) {
    node.targetTrace.coordinates[0] = node.location;
    var src = map.getSource('targetTrace');
    if (src) src.setData(node.targetTrace);
  }

  if (!node.gotLocation) {
    node.gotLocation = true;
    initNodeLocation(node);
  } else {
    node.marker.setLngLat(node.location);
  }
}

function updateHeading(node, heading) {
  if (node.gotLocation) {
    node.marker.setRotation(heading);
  }
}

function updateTarget(node, target) {
  node.target = target;
  console.log('new target');

  if (node.gotLocation) {
    if (!node.gotTarget) {
      console.log('Adding target');
      node.gotTarget = true;

      // -- target marker --
      var el = document.createElement('div');
      el.className = 'targetMarker';

      var pixelRadius = metersToPixels(target[2], target[1], map.getZoom() );
      el.style.width = pixelRadius + 'px';
      el.style.height = pixelRadius + 'px';
      el.style.lineHeight = pixelRadius + 'px';

      node.targetMarker = new mapboxgl.Marker(el)
          .setLngLat(target)
          .addTo(map);

      // -- target trace --
      node.targetTrace = { "type": "LineString", "coordinates": [ node.location, node.target ] };
      map.addSource('targetTrace', { type: 'geojson', data: node.targetTrace });
			map.addLayer({
				'id': 'targetTrace',
				'type': 'line',
				'source': 'targetTrace',
				'paint': {
					'line-color': 'yellow',
					'line-opacity': 0.5,
					'line-width': 2
				}
			});


    } else {
      // -- target marker --
      node.targetMarker.setLngLat(target);

      var el = node.targetMarker.getElement();
      var pixelRadius = metersToPixels(target[2], target[1], map.getZoom() );
      el.style.width = pixelRadius + 'px';
      el.style.height = pixelRadius + 'px';
      el.style.lineHeight = pixelRadius + 'px';

      // -- target trace --
      node.targetTrace.coordinates[1] = node.target;
      var src = map.getSource('targetTrace');
      if (src) src.setData(node.targetTrace);
    }
  }
}

function init() {
  map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/satellite-v9',
    center: [-1.804, 51.575],
    zoom: 17.5
  });

  map.on('style.load', () => {
    var config = {
      'type': 'geojson',
      'data': {
        'type': 'Feature',
        'properties': {},
        'geometry': {
          'type': 'LineString',
          'coordinates': [ ]
        }
      }
    };

    map.on('click', function(e) {
      var coordinates = e.lngLat;
      new mapboxgl.Popup()
        .setLngLat(coordinates)
        .setHTML(coordinates)
        .addTo(map);
    });

    // check we've resized
    map.resize();
  });


  // setup state event handlers
  state.on('node.new', (id)=>{
    // create new node entry
    var node = nodes[id] = {
      location: [0,0],

      gotLocationModule: false,
      gotLocation:false,
      locationType: '',
      locationModule: 0,

      gotRFM69: false,

      gotCompass:false,
      compassModule:0,
      compassType:'',
      heading:0,

      gotTarget:false,
      targetModule:0,

      lastHeard: (new Date()).getTime()
    };

    // create UI
    node.ui = document.createElement('div');
    node.ui.className = 'node';
    node.ui.node = node;

    node.uiLabel = document.createElement('span');
    node.uiLabel.className = 'label';
    node.uiLabel.innerHTML = id;
    node.ui.appendChild(node.uiLabel);

    node.uiIcons = document.createElement('span');
    node.uiIcons.className = 'uiIcons';
    node.ui.appendChild(node.uiIcons);

    node.uiLastHeard = document.createElement('div');
    node.uiLastHeard.className = 'lastHeard';
    node.uiLastHeard.innerHTML = '0s';
    node.ui.appendChild(node.uiLastHeard);

    // create event handler
    node.ui.onclick = (e)=> {
      if (node.gotLocation && node.location[0] != 0) {
        map.flyTo({
          center: node.location
        });
      }
    }

    // add to UI
    document.getElementById('nodes').appendChild(node.ui);
  });

  // listen for key node types
  state.on('module.type', (data)=>{
    //console.log('module.type', data);
    var node = nodes[data.node];
    if (data.type == 'Nav' && !node.getLocationModule) {
      console.log('Found Nav: '+data.channel);
      node.gotLocationModule = true;
      node.locationModule = data.channel;
      node.locationType = 'Nav';
      node.targetModule = data.channel;

      // speculative query for location
      var qm = new DLM.DroneLinkMsg();
      qm.source = 253;
      qm.node = data.node;
      qm.channel = 7;
      qm.param = 10;
      qm.msgType = DLM.DRONE_LINK_MSG_TYPE_QUERY;
      qm.msgLength = 1;
      state.send(qm);

      // speculative query for target
      var qm = new DLM.DroneLinkMsg();
      qm.source = 253;
      qm.node = data.node;
      qm.channel = 7;
      qm.param = 12;
      qm.msgType = DLM.DRONE_LINK_MSG_TYPE_QUERY;
      qm.msgLength = 1;
      state.send(qm);
    }

    if (data.type == 'NMEA' && !node.getLocationModule) {
      node.gotLocationModule = true;
      node.locationModule = data.channel;
      node.locationType = 'NMEA';
    }

    if (data.type == 'RFM69Telemetry') {
      node.gotRFM69 = true;
      var icon = document.createElement('i');
      icon.className = 'fas fa-broadcast-tower';
      node.uiIcons.appendChild(icon);
    }

    if (data.type == 'TurnRate' && node.compassType == '') {
      node.compassModule = data.channel;
      node.compassType = 'TurnRate';
    }
  });

  // listen for values
  state.on('param.value', (data)=>{
    var node = nodes[data.node];

    // listen for hostname
    if (data.channel == 1 && data.param == 8) {
      node.uiLabel.innerHTML = data.node + ' > ' + data.values[0];
    }

    // listen for location
    if (node.gotLocationModule &&
        node.locationModule == data.channel) {
      //console.log('pv: '+ data.node + '>' + data.channel + '.' + data.param);

      if (node.locationType == 'Nav') {
        /* Nav mapping:
          8. heading
          9. distance
          10. location
          12. target
          14. mode
        */
        //console.log(data.param, data.values);
        if (data.param == 10) {
          updateLocation(node, data.values);
        }
      }

      if (node.locationType == 'NMEA') {
        /*
        #define NMEA_PARAM_LOCATION           8
        #define NMEA_PARAM_SATELLITES         9
        #define NMEA_PARAM_HEADING            10
        #define NMEA_PARAM_SPEED              11
        #define NMEA_PARAM_HDOP               12
        #define NMEA_PARAM_PORT               13
        #define NMEA_PARAM_BAUD               14
        */
        if (data.param == 8) {
          updateLocation(node, data.values);
        }
      }
    }

    // compass heading
    if (node.compassType != '' &&
        node.compassModule == data.channel) {
      //console.log('pv: '+ data.node + '>' + data.channel + '.' + data.param);

      if (node.compassType == 'TurnRate') {
        if (data.param == 12) {
          updateHeading(node, data.values);
        }
      }

    }

    // target
    if (node.targetModule == data.channel) {
      // Nav.target = 12
      if (data.param == 12) {
        updateTarget(node, data.values);
      }


    }

    // update lastHeard
    var now = (new Date()).getTime();
    node.lastHeard = now;
  });


  // update lastHeard UI every second
  setInterval(()=>{
    var now = (new Date()).getTime();

    for (const [id, node] of Object.entries(nodes)) {
      var dt = (now - node.lastHeard)/1000;
      node.uiLastHeard.innerHTML = dt.toFixed(0)+ 's';
    }
  }, 1000)

}


init();
