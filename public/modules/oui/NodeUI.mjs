
import loadStylesheet from '../loadStylesheet.js';
import * as DLM from '../droneLinkMsg.mjs';

// oui
import Channel from './Channel.mjs';

// widgets
import NavWidget from '../widgets/NavWidget.mjs';
import RFM69TelemetryWidget from '../widgets/RFM69TelemetryWidget.mjs';
import INA219Widget from '../widgets/INA219Widget.mjs';
import NMEAWidget from '../widgets/NMEAWidget.mjs';


loadStylesheet('./css/modules/oui/NodeUI.css');


export default class NodeUI {

  constructor(id, state, map) {
    this.state = state;
    this.map = map;
    this.location=  [0,0];
    this.target=  [0,0,0];
    this.last=  [0,0,0];
    this.id=  id;

    this.gotLocationModule=  false;
    this.gotLocation= false;
    this.locationType=  '';
    this.locationModule=  0;

    this.gotCompass= false;
    this.compassModule= 0;
    this.compassType= '';
    this.heading= 0;

    this.gotTarget= false;
    this.targetModule= 0;
    this.gotLast= false;

    this.lastHeard=  (new Date()).getTime();

    // create overlay UI
    this.ui = document.createElement('div');
    this.ui.className = 'nodeOverlay';
    this.ui.node = this;

    this.uiLabel = document.createElement('span');
    this.uiLabel.className = 'label';
    this.uiLabel.innerHTML = id;
    this.ui.appendChild(this.uiLabel);

    this.uiIcons = document.createElement('span');
    this.uiIcons.className = 'uiIcons';
    this.ui.appendChild(this.uiIcons);

    this.uiLastHeard = document.createElement('div');
    this.uiLastHeard.className = 'lastHeard';
    this.uiLastHeard.innerHTML = '0s';
    this.ui.appendChild(this.uiLastHeard);

    this.uiWidgets = document.createElement('div');
    this.uiWidgets.className = 'widgets';
    this.ui.appendChild(this.uiWidgets);

    this.widgets = {};

    // create event handler
    this.ui.onclick = (e)=> {
      this.focus();
    }

    // add to UI
    document.getElementById('nodes').appendChild(this.ui);


    // create mgmt ui
    this.mui = $('<div class="NodeUI" style="display:none"/>');
    //this.muiName = $('<div class="nodeName"></div>');
    //this.mui.append(this.muiName);
    this.mui.node = this;
    this.muiChannels = {};


    // add to mgmt UI
    $('#nodeManager').append(this.mui);


    // query for target regularly - TODO - only do this when we spot a nav module
    /*
    setInterval(()=>{
      var qm = new DLM.DroneLinkMsg();
      qm.source = 252;
      qm.node = this.id;
      qm.channel = 7;
      qm.param = 12;
      qm.msgType = DLM.DRONE_LINK_MSG_TYPE_QUERY;
      qm.msgLength = 1;
      this.state.send(qm);
    }, 5000);
    */


    this.state.on('module.new', (data)=>{
      if (data.node != this.id) return;
      console.log('module.new: ' + data.node + '> ' + data.channel);

      // create new channel UI
      this.muiChannels[data.channel] = new Channel(this, state, data);

      // sort
      var children = this.mui.children();
      var sortList = Array.prototype.sort.bind(children);

      sortList((a,b)=>{
        return $(a).data('channel') - $(b).data('channel');
      });

      this.mui.append(children);
    });

    // listen for key module type info
    this.state.on('module.type', (data)=>{
      if (data.node != this.id) return;

      console.log('module.type: ' + data.node + '> '+ data.type + '[' + data.type.length + ']');

      // create Widget
      if (!this.widgets[data.channel]) {
        if (data.type == 'Nav') {
          this.widgets[data.channel] = new NavWidget(this);
        } else if (data.type == 'RFM69Telemetry') {
          this.widgets[data.channel] = new RFM69TelemetryWidget(this);
        } else if (data.type == 'INA219') {
          this.widgets[data.channel] = new INA219Widget(this);
        } else if (data.type == 'NMEA') {
          this.widgets[data.channel] = new NMEAWidget(this);
        }
      }

      if (data.type == 'Nav' && !this.gotLocationModule) {
        console.log('Found Nav: '+data.channel);
        this.gotLocationModule = true;
        this.locationModule = data.channel;
        this.locationType = 'Nav';

        // speculative query for location
        var qm = new DLM.DroneLinkMsg();
        qm.source = 252;
        qm.node = this.id;
        qm.channel = 7;
        qm.param = 10;
        qm.msgType = DLM.DRONE_LINK_MSG_TYPE_QUERY;
        qm.msgLength = 1;
        this.state.send(qm);
      }

      if (data.type == 'Nav' && this.targetModule == 0) {
        this.targetModule = data.channel;

        // speculative query for target
        var qm = new DLM.DroneLinkMsg();
        qm.source = 252;
        qm.node = this.id;
        qm.channel = 7;
        qm.param = 12;
        qm.msgType = DLM.DRONE_LINK_MSG_TYPE_QUERY;
        qm.msgLength = 1;
        this.state.send(qm);
      }

      if (data.type == 'NMEA') {
        this.gotLocationModule = true;
        this.locationModule = data.channel;
        this.locationType = 'NMEA';
      }

      if (data.type == 'TankSteerBoat') {
        console.log('using TankSteerBoat');
        this.gotLocationModule = true;
        this.locationModule = data.channel;
        this.locationType = 'TankSteerBoat';
        this.compassModule = data.channel;
        this.compassType = 'TankSteerBoat';
      }

      if (data.type == 'TurnRate' && this.compassType == '') {
        this.compassModule = data.channel;
        this.compassType = 'TurnRate';
      }
    });


    // listen for overall map values
    this.state.on('param.value', (data)=>{
      if (data.node != this.id) return;

      /*
         Update widgets
      */
      if (this.widgets[data.channel]) {
        this.widgets[data.channel].newParamValue(data);
      }

      // listen for hostname
      if (data.channel == 1 && data.param == 8 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_CHAR) {
        if (data.values[0]) {
          this.uiLabel.innerHTML = data.node + ' > ' + data.values[0];
        } else {
          console.error('undefined hostname:', data);
        }

        //this.muiName.html(data.node + ' > ' + data.values[0]);
      }

      // listen for location
      if (this.gotLocationModule &&
          this.locationModule == data.channel) {
        //console.log('pv: '+ data.node + '>' + data.channel + '.' + data.param);

        if (this.locationType == 'Nav') {
          /* Nav mapping:
            8. heading
            9. distance
            10. location
            12. target
            14. mode
          */
          //console.log(data.param, data.values);
          if (data.param == 10 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_FLOAT && data.values[0] != 0) {
            this.updateLocation(data.values);
          }
        }

        if (this.locationType == 'NMEA') {
          /*
          #define NMEA_PARAM_LOCATION           8
          #define NMEA_PARAM_SATELLITES         9
          #define NMEA_PARAM_HEADING            10
          #define NMEA_PARAM_SPEED              11
          #define NMEA_PARAM_HDOP               12
          #define NMEA_PARAM_PORT               13
          #define NMEA_PARAM_BAUD               14
          */
          if (data.param == 8 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_FLOAT&& data.values[0] != 0) {
            this.updateLocation(data.values);
          }
        }

        if (this.locationType == 'TankSteerBoat') {
          /*
          location .9
          */
          if (data.param == 9 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_FLOAT&& data.values[0] != 0) {
            this.updateLocation(data.values);
          }
        }
      }

      // compass heading
      if (this.compassType != '' &&
          this.compassModule == data.channel) {
        //console.log('pv: '+ data.node + '>' + data.channel + '.' + data.param);

        if (this.compassType == 'TurnRate') {
          if (data.param == 12 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_FLOAT) {
            this.updateHeading(data.values[0]);
          }
        }

        if (this.compassType == 'TankSteerBoat') {
          if (data.param == 8 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_FLOAT) {
            this.updateHeading(data.values[0]);
          }
        }

      }

      // target
      if (this.targetModule == data.channel) {
        if (data.param == 12 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_FLOAT) {
          // 12 - target
          this.updateTarget(data.values);
        } else if (data.param == 15 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_FLOAT) {
          // 15 - last waypoint/location
          this.updateLast(data.values);
        }
      }

      // update lastHeard
      var now = (new Date()).getTime();
      this.lastHeard = now;
    });

    // update lastHeard UI every second
    setInterval(()=>{
      var now = (new Date()).getTime();

      var dt = (now - this.lastHeard)/1000;
      if (dt > 120) {
        this.uiLastHeard.classList.add('danger');
      } else if (dt > 60) {
        this.uiLastHeard.classList.add('warning');
        this.uiLastHeard.classList.remove('danger');
      } else {
        this.uiLastHeard.classList.remove('danger');
        this.uiLastHeard.classList.remove('warning');
      }
      this.uiLastHeard.innerHTML = dt.toFixed(0)+ 's';

    }, 1000)
  }


  focus() {
    if (this.onFocus) this.onFocus(this);

    this.ui.classList.add('focus');
    this.mui.css('display','grid');

    if (this.gotLocation && this.location[0] != 0) {
      this.map.flyTo({
        center: this.location
      });
    }
  }

  blur() {
    this.ui.classList.remove('focus');
    this.mui.css('display','none');
    if (this.onBlur) this.onBlur(this);
  }


  createGeoJSONCircle(center, radius) {
    var points = 64;

    var coords = {
        latitude: center[1],
        longitude: center[0]
    };

    var km = radius / 1000;

    var ret = [];
    var distanceX = km/(111.320*Math.cos(coords.latitude*Math.PI/180));
    var distanceY = km/110.574;

    var theta, x, y;
    for(var i=0; i<points; i++) {
        theta = (i/points)*(2*Math.PI);
        x = distanceX*Math.cos(theta);
        y = distanceY*Math.sin(theta);

        ret.push([coords.longitude+x, coords.latitude+y]);
    }
    ret.push(ret[0]);

    return {
      "type": "Feature",
      "geometry": {
          "type": "Polygon",
          "coordinates":  [ ret ]
      }
    };
  };


  initNodeLocation() {
    console.log('Adding node');

    // update node label
    var icon = document.createElement('i');
    icon.className = 'fas fa-map-marked';
    this.uiIcons.appendChild(icon);

    // create map objects
    // -----------------------------------------

    // -- marker --
    this.mapEl = document.createElement('div');
    this.mapEl.className = 'marker';
    var arrow = document.createElement('i');
    arrow.className = 'fas fa-arrow-up';
    this.mapEl.appendChild(arrow);
    this.marker = new mapboxgl.Marker(this.mapEl)
          .setLngLat(this.location)
          .addTo(this.map);

    // -- snailTrail --
    var trailName = 'snailTrail' + this.id;
    this.snailTrail = { "type": "LineString", "coordinates": [ this.location ] };
    this.map.addSource(trailName, { type: 'geojson', lineMetrics: true, data: this.snailTrail });
    this.map.addLayer({
      'id': trailName,
      'type': 'line',
      'source': trailName,
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

  distanceBetweenCoordinates(c1, c2) {
    var lat1 = c1[1];
    var lon1 = c1[0];
    var lat2 = c2[1];
    var lon2 = c2[0];

    var R = 6371e3; // metres
    var lat1r = lat1 * Math.PI/180; // φ, λ in radians
    var lat2r = lat2 * Math.PI/180;
    var lon1r = lon1 * Math.PI/180; // φ, λ in radians
    var lon2r = lon2 * Math.PI/180;

    var x = (lon2r-lon1r) * Math.cos((lat1r+lat2r)/2);
    var y = (lat2r-lat1r);
    var d = Math.sqrt(x*x + y*y) * R;

    return d;
  }

  updateLocation(newLoc) {
    //console.log(newLoc);
    this.location = newLoc;
    // update snailTrail
    if (this.snailTrail) {
      // check distance between nodes, update if moved a sig distance
      var d = this.distanceBetweenCoordinates(this.location, this.snailTrail.coordinates[this.snailTrail.coordinates.length-1]);
      if (d > 0.5) {
        this.snailTrail.coordinates.push(this.location);
        if (this.snailTrail.coordinates.length > 200) {
          this.snailTrail.coordinates.shift();
        }
        var src = this.map.getSource('snailTrail' + this.id);
        if (src) src.setData(this.snailTrail);
      }
    }

    // update target
    if (this.targetTrace) {
      this.targetTrace.coordinates[0] = this.location;
      var src = this.map.getSource('targetTrace' + this.id);
      if (src) src.setData(this.targetTrace);
    }

    if (!this.gotLocation) {
      this.gotLocation = true;
      this.initNodeLocation();
    } else {
      if (this.location && this.location.length >=2)
        this.marker.setLngLat(this.location);
    }
  }

  updateHeading(heading) {
    //console.log(heading);
    if (this.gotLocation) {
      this.marker.setRotation(heading);
    }
  }

  updateTarget(target) {
    if (target.length <3) return;

    this.target = target;
    console.log('new target');

    // speculative query for last
    var qm = new DLM.DroneLinkMsg();
    qm.source = 252;
    qm.node = this.id;
    qm.channel = 7;
    qm.param = 15;
    qm.msgType = DLM.DRONE_LINK_MSG_TYPE_QUERY;
    qm.msgLength = 1;
    this.state.send(qm);

    if (this.gotLocation) {
      if (!this.gotTarget) {
        console.log('Adding target');
        this.gotTarget = true;

        // -- target marker --
        var el = document.createElement('div');
        el.className = 'targetMarker';

        this.targetMarker = new mapboxgl.Marker(el)
            .setLngLat(target)
            .setDraggable(true)
            .addTo(this.map);

        this.targetMarker.on('dragend', (e)=>{
          // e.target
          const lngLat = e.target.getLngLat();

          // clear radius to indicate an update is in progress
          //e.target.values[2] = 0;
          e.target.getElement().classList.add('updating');

          //console.log('Moved target: ' + lngLat);

          // write the new target
          var qm = new DLM.DroneLinkMsg();
          qm.source = 252;
          qm.node = this.id;
          qm.channel = this.targetModule;
          qm.param = 12;
          qm.setFloat([ lngLat.lng, lngLat.lat, this.target[2] ])
          this.state.send(qm);

          // then send a query for the new target value
          qm = new DLM.DroneLinkMsg();
          qm.source = 252;
          qm.node = this.id;
          qm.channel = this.targetModule;
          qm.param = 12;
          qm.msgType = DLM.DRONE_LINK_MSG_TYPE_QUERY;
          qm.msgLength = 1;
          this.state.send(qm);
        });

        // -- target outline --
        var outlineName = 'targetOutline' + this.id;
        this.targetOutline = this.createGeoJSONCircle(this.target, this.target[2]);
        this.map.addSource(outlineName, { type: 'geojson', data: this.targetOutline });
        this.map.addLayer({
  				'id': outlineName,
  				'type': 'line',
  				'source': outlineName,
          'layout': {},
  				'paint': {
            'line-color': 'yellow',
  					'line-opacity': 0.5,
  					'line-width': 2
  				}
  			});

        // -- target trace --
        var traceName = 'targetTrace' + this.id;
        this.targetTrace = { "type": "LineString", "coordinates": [ this.location, this.target ] };
        this.map.addSource(traceName, { type: 'geojson', data: this.targetTrace });
  			this.map.addLayer({
  				'id': traceName,
  				'type': 'line',
  				'source': traceName,
  				'paint': {
  					'line-color': 'yellow',
  					'line-opacity': 0.5,
  					'line-width': 2
  				}
  			});


      } else {
        // -- target marker --
        this.targetMarker.setLngLat(target);

        var el = this.targetMarker.getElement();
        el.classList.remove('updating');

        // -- target outline --
        var outlineName = 'targetOutline' + this.id;
        this.targetOutline = this.createGeoJSONCircle(this.target, this.target[2]);
        var src = this.map.getSource(outlineName);
        if (src) src.setData(this.targetOutline);

        // -- target trace --
        this.targetTrace.coordinates[1] = this.target;
        var traceName = 'targetTrace' + this.id;
        var src = this.map.getSource(traceName);
        if (src) src.setData(this.targetTrace);

        // -- last trace --
        if (this.gotLast) {
          this.lastTrace.coordinates[1] = this.target;
          var traceName = 'lastTrace' + this.id;
          var src = this.map.getSource(traceName);
          if (src) src.setData(this.lastTrace);
        }
      }
    }
  }


  updateLast(last) {
    if (last.length <3 || last[0] == 0) return;

    this.last = last;
    console.log('new last');

    if (this.gotLocation && this.gotTarget) {
      if (!this.gotLast) {
        console.log('Adding last');
        this.gotLast = true;

        // -- last marker --
        var el = document.createElement('div');
        el.className = 'lastMarker';

        this.lastMarker = new mapboxgl.Marker(el)
            .setLngLat(last)
            .addTo(this.map);

        // -- last outline --
        var outlineName = 'lastOutline' + this.id;
        this.lastOutline = this.createGeoJSONCircle(this.last, this.last[2]);
        this.map.addSource(outlineName, { type: 'geojson', data: this.lastOutline });
        this.map.addLayer({
  				'id': outlineName,
  				'type': 'line',
  				'source': outlineName,
          'layout': {},
  				'paint': {
            'line-color': 'red',
  					'line-opacity': 0.5,
  					'line-width': 2
  				}
  			});

        // -- last trace --
        var traceName = 'lastTrace' + this.id;
        this.lastTrace = { "type": "LineString", "coordinates": [ this.last, this.target ] };
        this.map.addSource(traceName, { type: 'geojson', data: this.lastTrace });
  			this.map.addLayer({
  				'id': traceName,
  				'type': 'line',
  				'source': traceName,
  				'paint': {
  					'line-color': 'red',
  					'line-opacity': 0.5,
  					'line-width': 2
  				}
  			});


      } else {
        // -- last marker --
        this.lastMarker.setLngLat(last);

        var el = this.lastMarker.getElement();
        el.classList.remove('updating');

        // -- last outline --
        var outlineName = 'lastOutline' + this.id;
        this.lastOutline = this.createGeoJSONCircle(this.last, this.last[2]);
        var src = this.map.getSource(outlineName);
        if (src) src.setData(this.lastOutline);

        // -- last trace --
        this.lastTrace.coordinates[0] = this.last;
        var traceName = 'lastTrace' + this.id;
        var src = this.map.getSource(traceName);
        if (src) src.setData(this.lastTrace);
      }
    }
  }

}
