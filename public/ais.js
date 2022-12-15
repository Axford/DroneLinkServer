
import loadStylesheet from './modules/loadStylesheet.js';

loadStylesheet('./css/observer.css');

import AisDecoder from './modules/AisDecoder.mjs';

var map;

mapboxgl.accessToken = 'pk.eyJ1IjoiYXhmb3JkIiwiYSI6ImNqMWMwYXI5MDAwNG8zMm5uanFyeThmZDEifQ.paAXk3S29-VVw1bhk458Iw';

var decoder = new AisDecoder();

decoder.onDecode = (dm)=>{
  console.log(dm);

  if (dm.type == 18) {
    // add marker to map
    addLogMarker(dm.lon, dm.lat, 255,0,0);
  }
};


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


function parseAISData(data) {
  // step through each line
  var lines = data.split('\n');

  // for each
  for (var i=0; i<lines.length; i++) {
    // if it starts with !AIVDM
    var line = lines[i];
    if (line.startsWith('!AIVDM')) {
      decoder.parse(line);
    }
  }
}


function init() {

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

    map.setPaintProperty(
      'satellite',
      'raster-opacity',
      0.5
    );

    map.on('mousemove',(e)=>{
      // update coord div
      $('.mapCoords').html(e.lngLat.lng.toFixed(6) + ', ' + e.lngLat.lat.toFixed(6));

      // update last location in localstorage
      //saveMapLocation(e.lngLat);
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

    // load AIS data
    fetch('/ais.txt')     
      .then(x => x.text())
      .then(data => parseAISData(data));

  });

}


init();
