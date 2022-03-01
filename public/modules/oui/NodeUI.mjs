
import loadStylesheet from '../loadStylesheet.js';
import * as DLM from '../droneLinkMsg.mjs';

// oui
//import Channel from './Channel.mjs';
//import GraphManager from './GraphManager.mjs';
import Tabs from './Tabs.mjs';

// panels
import ManagementPanel from './panels/Management.mjs';
import ConfigurationPanel from './panels/Configuration.mjs';
import GraphPanel from './panels/Graph.mjs';
import NodeSettingsPanel from './panels/NodeSettings.mjs';


loadStylesheet('./css/modules/oui/NodeUI.css');


export default class NodeUI {

  constructor(id, state, map) {
    var me = this;
    this.state = state;
    this.map = map;
    this.location=  [0,0];
    this.target=  [0,0,0];
    this.last=  [0,0,0];
    this.id=  id;
    this.name = '';
    this.ipAddress = '';
    this.selectedNodeFilename = '';
    this.scriptMarkers = [];
    this.focused = false;
    this.heading= 0;

    // used to track mappable params like location or heading
    this.mapParams = {};


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

    this.uiWidgets = $('<div class="widgets"></div>');
    $(this.ui).append(this.uiWidgets);

    // prep a layer for scriptMarker outlines
    var scriptOutlineName = 'scriptOutline' + this.id;
    this.map.addSource(scriptOutlineName, { type: 'geojson', data: {
      "type": "Feature",
      "geometry": {
          "type": "Point",
          "coordinates":  []
      }
    } });
    this.map.addLayer({
      'id': scriptOutlineName,
      'type': 'line',
      'source': scriptOutlineName,
      'layout': {},
      'paint': {
        'line-color': '#88f',
        'line-opacity': 0.8,
        'line-width': 2
      }
    });

    // create event handler
    this.ui.onclick = (e)=> {
      this.focus();
    }

    // add mini view to floating UI
    document.getElementById('nodes').appendChild(this.ui);


    // add gamepad ui
    this.gameui = $('<div class="gamepadUI" style="display:none;"></div>');
    $('#nodeManager').append(this.gameui);
    this.gameAxes = [];
    for (var i=0; i<4; i++) {
      this.gameAxes.push( $('<div class="gamepadAxis"></div>') );
      this.gameAxes[i].inputE = $('<input type="text"></input>');
      this.gameAxes[i].inputE.val(this.id + '>');
      this.gameAxes[i].append(this.gameAxes[i].inputE);
      this.gameAxes[i].graphE = $('<div class="gamepadGraph">?</div>');
      this.gameAxes[i].append(this.gameAxes[i].graphE);
      this.gameui.append(this.gameAxes[i]);
    }


    // create panel ui
    this.pui = $('<div class="NodeUI" style="display:none"/>');
    this.pui.node = this;
    $('#nodeManager').append(this.pui);

    // container for tabs
    this.puiNav = $('<div class="panelNav"></div>');
    this.pui.append(this.puiNav);

    // container for panels
    this.puiPanels = $('<div class="panels"></div>');
    this.pui.append(this.puiPanels);

    // create tabs
    this.puiTabs = new Tabs(this.puiNav);
    this.puiTabs.on('select', (tabName)=>{
      me.showPanel(tabName);
    });

    // panels
    this.panels = {};

    this.panels.Management = new ManagementPanel(this, this.puiTabs, this.puiPanels);

    this.panels.Configuration = new ConfigurationPanel(this, this.puiTabs, this.puiPanels);

    this.panels.Graph = new GraphPanel(this, this.puiTabs, this.puiPanels);

    this.panels.NodeSettings = new NodeSettingsPanel(this, this.puiTabs, this.puiPanels);


    // query ipAddress
    var qm = new DLM.DroneLinkMsg();
    qm.node = this.id;
    qm.channel = 1;
    qm.param = 12;
    qm.msgType = DLM.DRONE_LINK_MSG_TYPE_QUERY;
    qm.msgLength = 1;
    this.state.send(qm);


    // show management tab
    this.puiTabs.selectTab('Management');


    // listen for overall map values
    this.state.on('param.value', (data)=>{
      if (data.node != this.id) return;

      // listen for hostname
      if (data.channel == 1 && data.param == 8 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_CHAR) {
        if (data.values[0]) {
          this.name = data.values[0];
          if (this.mapLabel) this.mapLabel.innerHTML = this.name;
          this.uiLabel.innerHTML = data.node + ' > ' + data.values[0];
        } else {
          console.error('undefined hostname:', data);
        }
      }

      // listen for ipAddress
      if (data.channel == 1 && data.param == 12 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_UINT8_T) {
        if (data.values[0]) {
          this.ipAddress = data.values.join('.');
          // show config node files panel
          //this.panels.Configuration.cuiFilesOnNode.show();
        } else {
          console.error('undefined ipaddress:', data);
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


  resize() {
    for (const [panelName, panel] of Object.entries(this.panels)) {
      panel.resize();
    }
  }


  // called by interfaces to register widget UI
  addWidget(widget) {
    this.uiWidgets.append(widget);
  }


  updateMapParam(paramName, priority, value, channel, param) {
    var updated = false;

    if (!this.mapParams[paramName]) {
      // create
      this.mapParams[paramName] = {
        priority: priority,
        value:value,
        channel:channel,
        param:param
      }
      updated = true;
    } else {
      if (priority > this.mapParams[paramName].priority ||
      (priority == this.mapParams[paramName].priority &&
      channel < this.mapParams[paramName].channel)) {
        this.mapParams[paramName].priority = priority;
        this.mapParams[paramName].value = value;
        this.mapParams[paramName].channel = channel;
        this.mapParams[paramName].param = param;
        updated = true;
      }
    }

    if (updated) {
      // trigger updates
      if (paramName == 'location') {
        this.updateLocation(value);
      } else if (paramName == 'heading') {
        this.updateHeading(value);
      } else if (paramName == 'target') {
        this.updateTarget(value);
      } else if (paramName == 'last') {
        this.updateLast(value);
      }

      this.panels.NodeSettings.update();
    }
  }


  updateGamepad(g) {
    //console.log('new data', g.axes);
    this.gameui.show();
    for (var i=0; i<4; i++) {
      var binding = this.gameAxes[i].inputE.val();
      if (binding.indexOf('.') > 0) {
        // parse binding address
        var gp = binding.indexOf('>');
        var pp = binding.indexOf('.');
        var n = parseInt(binding.substr(0,gp));
        var c = parseInt(binding.substr(gp+1,pp-1));
        var p = parseInt(binding.substr(pp+1));

        console.log('Gamepad: ',n,c,p);

        var av = (i % 2 == 1 ? -1 : 1) * g.axes[i];

        var qm = new DLM.DroneLinkMsg();
        qm.source = 252;
        qm.node = n;
        qm.channel = c;
        qm.param = p;
        qm.setFloat([ av ]);

        this.state.socket.emit('sendMsg', qm.encodeUnframed());

        this.gameAxes[i].graphE.html(av.toFixed(1));
      }
    }

  }

  onMapDoubleClick(e) {
    // ignore if not focused
    if (!this.focused) return;

    this.panels.Configuration.insertGoto(e.lngLat);
  }


  showPanel(tabName) {
    // hide everything else
    var me = this;

    // iterate over panel mgmt objects
    for (const [panelName, panel] of Object.entries(this.panels)) {
      if (panel.tabName == tabName) {
        panel.show();
      } else {
        panel.hide();
      }
    }
  }


  focus() {
    if (this.onFocus) this.onFocus(this);

    this.focused = true;
    this.ui.classList.add('focus');
    if (this.mapEl) this.mapEl.classList.add('selected');
    this.pui.show();

    // update panels
    for (const [panelName, panel] of Object.entries(this.panels)) {
      panel.update();
    }

    if (this.mapParams.location &&
        this.mapParams.location.value[0] != 0) {
      this.map.flyTo({
        center: this.mapParams.location.value
      });
    }
  }

  blur() {
    this.ui.classList.remove('focus');
    if (this.mapEl) this.mapEl.classList.remove('selected');
    this.pui.hide();
    this.focused = false;
    //this.mui.css('display','none');
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

    // -- marker label --
    this.mapLabel = document.createElement('div');
    this.mapLabel.className = 'markerLabel';
    this.mapLabel.innerHTML = this.name;
    this.markerLabel = new mapboxgl.Marker({
      element:this.mapLabel,
      anchor:'left'
    })
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
          'rgba(0,255,0,0.2)',
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
      var dThreshold = 1;  // calculate based on disance between waypoints
      if (d > dThreshold) {
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
      if (this.location && this.location.length >=2) {
        this.marker.setLngLat(this.location);
        this.markerLabel.setLngLat(this.location);
      }

    }
  }

  updateHeading(heading) {
    //console.log(heading);
    if (this.gotLocation) {
      this.marker.setRotation(heading);
    }
  }

  updateTarget(target) {
    if (target == undefined || target.length <3) {
      console.error('invalid target: ', target);
      return;
    }

    // convert to 3-part array for compatibility with mapbox markers
    target = target.slice(0,3);
    this.target = target;
    console.log('new target');

    // speculative query for last
    if (!this.last) {
      var qm = new DLM.DroneLinkMsg();
      qm.source = 252;
      qm.node = this.id;
      qm.channel = this.targetModule;
      qm.param = 15;
      qm.msgType = DLM.DRONE_LINK_MSG_TYPE_QUERY;
      qm.msgLength = 1;
      this.state.send(qm);
    }


    if (this.gotLocation) {
      if (!this.gotTarget) {
        console.log('Adding target', target);
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
          qm.channel = this.mapParams['target'].channel;
          qm.param = this.mapParams['target'].param;
          qm.setFloat([ lngLat.lng, lngLat.lat, this.target[2] ])
          this.state.send(qm);

          // then send a query for the new target value
          qm = new DLM.DroneLinkMsg();
          qm.source = 252;
          qm.node = this.id;
          qm.channel = this.mapParams['target'].channel;
          qm.param = this.mapParams['target'].param;
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
        if (!this.targetMarker) return;

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

    // convert to 3-part array for compatibility with mapbox markers
    last = last.slice(0,3);
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
