
import loadStylesheet from '../loadStylesheet.js';
import * as DLM from '../droneLinkMsg.mjs';

import { getFirestore,  collection, doc, setDoc, query, onSnapshot, where, deleteField, updateDoc } from "https://www.gstatic.com/firebasejs/9.14.0/firebase-firestore.js";

// oui
//import Channel from './Channel.mjs';
//import GraphManager from './GraphManager.mjs';
import Tabs from './Tabs.mjs';

// panels
import ManagementPanel from './panels/Management.mjs';
import ConfigurationPanel from './panels/Configuration.mjs';
import GraphPanel from './panels/Graph.mjs';
import NodeSettingsPanel from './panels/NodeSettings.mjs';
import VisualisationPanel from './panels/Visualisation.mjs';

import {calculateDestinationFromDistanceAndBearing, calculateInitialBearingBetweenCoordinates} from '../navMath.mjs';

loadStylesheet('./css/modules/oui/NodeUI.css');


// threshold of lastHeard to be considered active, in seconds
const ACTIVE_THRESHOLD = 10*60;  // 10 minutes


export default class NodeUI {

  constructor(id, state, map, uiManager, db, storage) {
    var me = this;
    this.state = state;
    this.map = map;
    this.uiManager = uiManager;
    this.db = db;
    this.storage = storage;
    this.location=  [0,0];
    this.target=  [0,0,0];
    this.last=  [0,0,0];
    this.id=  id;
    this.name = '';
    this.active = true;  // true if lastHeard < xx minutes
    this.ipAddress = '';
    this.firmwareVersion = '';
    this.latestFirmwareVersion = '';
    this.selectedNodeFilename = '';
    this.scriptMarkers = [];
    this.scriptMarkerLabels = [];
    this.focused = false;
    this.heading= 0;
    this.speedOverGround = 0;
    this.lastLocationTime = 0; 
    this.lastLocation = [0,0]; // to estimate speed over ground 
    this.priorityCounts= [0,0,0,0];
    this.mapLayerIDs = [];  // list of map layers (IDs), used to manage visibility/opacity
    this.mapLayerOpacities = {};  // to store original opactities by id
    this.mapElements = [];  // list of html elements (object references) on the map

    this.settingsChanged = false;
    this.navMappingStyle = 'full';

    // used to track mappable params like location or heading
    this.mapParams = {};

    // used to register/track context handlers
    this.contextHandlers = {};

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
    this.uiLastHeard.innerHTML = '-';
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

    // container for title controls
    var titleContainer = $('<div class="nodeTitleContainer"></div>');
    this.pui.append(titleContainer);

    // add node name (title) to right panel
    this.uiTitle = $('<div class="nodeTitle">'+ this.id +'</div>');
    titleContainer.append(this.uiTitle);

    // add network priority pie widget
    //this.uiPriorityPie = $('<canvas width=20 height=20 class="priorityPie"></canvas>');
    //titleContainer.append(this.uiPriorityPie);

    // add rebuild button to right panel
    this.uiRebuildBut = $('<button class="btn btn-sm btn-dark rebuildModules">Rebuild</button>');
		this.uiRebuildBut.on('click', ()=>{
			// remove UI for modules, params, etc
      me.panels.Management.clear();
      me.uiWidgets.empty();
      
      // clear state info... and also remove from firestore
      me.state.rebuildNode(me.id);

      // remove any bindings to map params
      me.mapParams = {};

      // remove histogram data

		});
    titleContainer.append(this.uiRebuildBut);

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
    this.activePanel = 'Management';

    this.panels.Management = new ManagementPanel(this, this.puiTabs, this.puiPanels);

    this.panels.Visualisation = new VisualisationPanel(this, this.puiTabs, this.puiPanels);

    this.panels.Configuration = new ConfigurationPanel(this, this.puiTabs, this.puiPanels);

    //this.panels.Graph = new GraphPanel(this, this.puiTabs, this.puiPanels);

    this.panels.NodeSettings = new NodeSettingsPanel(this, this.puiTabs, this.puiPanels);

    // create empty div ready to build context menu
    this.contextMenuContainer = $('<div class="contextMenu nav flex-column" style="display:none"/>');
    $('#mapPanel').append(this.contextMenuContainer);

    this.contextMenuTitle = $('<div class="contextMenuTitle">'+this.id+' &#9654; ?</div>');
    this.contextMenuContainer.append(this.contextMenuTitle);


    // query ipAddress
    var qm = new DLM.DroneLinkMsg();
    qm.node = this.id;
    qm.channel = 1;
    qm.param = 12;
    qm.msgType = DLM.DRONE_LINK_MSG_TYPE_QUERY;
    qm.msgLength = 1;
    this.state.send(qm);

    // query hostname
    var qm = new DLM.DroneLinkMsg();
    qm.node = this.id;
    qm.channel = 1;
    qm.param = 8;
    qm.msgType = DLM.DRONE_LINK_MSG_TYPE_QUERY;
    qm.msgLength = 1;
    this.state.send(qm);


    // show management tab
    this.puiTabs.selectTab('Management');

    // listen for visualisation script
    this.state.on('node.visualisation', (data)=>{ 
      if (data == me.id) {
        me.panels.Visualisation.scriptAvailable();
      }
    });


    // listen for overall map values
    this.state.on('param.value', (data)=>{
      if (data.node != this.id) return;

      // listen for hostname
      if (data.channel == 1 && data.param == 8 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_CHAR) {
        if (data.values[0]) {
          this.name = data.values[0];
          this.uiTitle.html(this.id + ' <span style="color:#07e;">&#9654;</span> ' + this.name);
          this.contextMenuTitle.html(this.id + ' &#9654; ' + this.name);
          if (this.mapLabel) this.mapLabel.innerHTML = this.name;
          this.uiLabel.innerHTML = data.node + ' <span style="color:#888">&#9654;</span> ' + data.values[0];
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
          //console.warning('undefined ipaddress:', data);
        }
      }

      // update priority counts
      this.priorityCounts[data.priority]++;

      // update lastHeard
      var now = (new Date()).getTime();
      this.lastHeard = now;
    });

    // update lastHeard UI every second
    setInterval(()=>{
      this.checkIfActive(); 

      this.checkIfSettingsChanged();

    }, 1000);

    // create firestore snapshot and thereby gather an initial state 
    const q = query(collection(me.db, "nodeSettings"), where("id", "==", this.id ));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added" || change.type == "modified") {
          var docData = change.doc.data();
          this.panels.Management.updateSettings(docData.management);

          // read the nav mapping style
          me.updateNavMappingStyle(docData.navMappingStyle, false);
          this.panels.NodeSettings.updateSettings(docData.navMappingStyle);
        }
        if (change.type === "removed") {
          
        }
      });
    });
  }

  deactivate() {
    if (!this.active) return;

    this.active = false;

    this.uiLastHeard.innerHTML = '-';

    this.ui.classList.add('faded');
    this.uiWidgets.hide();
    $(this.uiLastHeard).hide();

    // fade out map widgets
    this.mapLayerIDs.forEach((id)=>{
      this.mapLayerOpacities[id] = this.map.getPaintProperty(id, 'line-opacity');

      this.map.setPaintProperty(
        id,
        'line-opacity',
        0.2 * this.mapLayerOpacities[id]
      );
    });

    this.mapElements.forEach((ele)=>{
      ele.style.opacity = 0.3;
    });
  }


  activate() {
    if (this.active) return;

    this.ui.classList.remove('faded');
    $(this.uiLastHeard).show();
    this.uiWidgets.show();
    this.active = true;

    // bring back map widgets
    this.mapLayerIDs.forEach((id)=>{
      this.map.setPaintProperty(
        id,
        'line-opacity',
        this.mapLayerOpacities[id]
      );
    });

    this.mapElements.forEach((ele)=>{
      ele.style.opacity = 1;
    });
  }

  checkIfActive() {
    var now = (new Date()).getTime();

    var dt = (now - this.lastHeard)/1000;

    if ( (this.state.state[this.id].interface == 'firebase')) {
      this.deactivate();     

    } else if (dt > ACTIVE_THRESHOLD) {
      this.deactivate();

    } else {
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

      this.activate();
    }

    // also update network Priority Pie 
    //this.updatePriorityPie();
  }


  checkIfSettingsChanged() {
    if (this.panels.Management.settingsChanged || this.settingsChanged) {
      // update firestore
      try {
        var nodeSettings = {
          id: this.id,
          navMappingStyle: this.navMappingStyle,
          management: this.panels.Management.settings
        };
        const docRef = doc(this.db, 'nodeSettings', this.id.toString());
        setDoc(docRef, nodeSettings, { merge: true });
  
        console.log("Firebase, nodeSettings updated: " + this.id);
      } catch (e) {
        console.error("Firebase, Error updating nodeSettings: ", e);
      }

      this.panels.Management.settingsChanged = false;
    }
  }


  updatePriorityPie() {
    // calc segment sizes
    var totalPackets = 0;
    for (var i=0; i<4; i++) {
      totalPackets += this.priorityCounts[i];
    }

    if (totalPackets == 0) return;

    const segmentColors = [
      '#f55',
      '#fa5',
      '#5f5',
      '#fff'
    ];

    var c = this.uiPriorityPie[0];
    var ctx = c.getContext("2d");

    var w = ctx.canvas.width;
    var h = ctx.canvas.height;
    var cx = w/2, cy = h/2, r=10;

    // calc and draw segments
    var ang = 0;
    for (var i=0; i<4; i++) {
      var segmentRatio = this.priorityCounts[i] / totalPackets;

      var segmentAng = segmentRatio * 2 * Math.PI;

      ctx.fillStyle = segmentColors[i];
      ctx.strokeStyle = '#000';
      ctx.beginPath();
      ctx.moveTo(cx,cy);
      ctx.arc(cx,cy,r,ang, ang+segmentAng);
      ctx.lineTo(cx,cy);
      ctx.fill();
      ctx.lineWidth = 0.5;
      ctx.stroke();

      ang += segmentAng;
    }
    //this.uiPriorityPie.html(this.priorityCounts[0]);
  }


  updateVisualisation(visScript) {
    this.state.updateVisualisation(this.id, visScript);
  }

  registerContextHandler(groupName, mapParamName, widget, widgetCallbackName) {
    console.log('Registering context menu', groupName);

    if (this.contextHandlers[groupName] === undefined) {
      this.contextHandlers[groupName] = {
        ele: null,
        mapParamName:mapParamName,
        widget: widget,
        widgetCallbackName: widgetCallbackName,
        items: {}
      };
    }

    // sort?
    this.rebuildContextMenu();
  }


  rebuildContextMenu() {
    const me = this;
    const cm = this.contextMenuContainer;

    for (const [key, ch] of Object.entries(this.contextHandlers)) {
      if (ch.ele === null) {
        // create group element
        ch.ele = $('<div class="context-group">'+key+'</div>');
        cm.append(ch.ele);
      }

      // update items... based on nodes with the relevant registerd mapParam
      var qNodes = this.uiManager.getNodesWithMapParam(ch.mapParamName);
      
      qNodes.forEach((item)=>{
        // see if we need to add entry in items for node, indexed on node id, assuming its not our nodeId
        if (item.id != this.id) {
          if (!ch.items.hasOwnProperty(item.id)) {
            ch.items[item.id] = {
              ele: $('<a class="nav-link">'+item.id+' &#9654; '+item.name+'</a>'),
              node:item
            };
  
            ch.items[item.id].ele.on('click', ()=>{ 
              me.contextHandler(ch, item); 
            } );
  
            cm.append(ch.items[item.id].ele);
          } else {
            // update name
            ch.items[item.id].ele.html(item.id+' &#9654; '+item.name);

            // check if still active
            if (item.active) {
              ch.items[item.id].ele.show();
            } else {
              ch.items[item.id].ele.hide();
            }
          }
        }
      });

    }
  }


  contextHandler(contextGroup, node) {
    //item.widget.globalContextHandler(this.lngLat);

    contextGroup.widget[contextGroup.widgetCallbackName](contextGroup.mapParamName, node);

    this.hideContextMenu();
  }


  showContextMenu(point) {
    console.log('Show Node context menu');
    this.uiManager.showingPrivateContextMenu(this);

    this.rebuildContextMenu();

    this.contextMenuContainer.show();
    this.contextMenuContainer.css({top:point.y, left:point.x});
  }


  hideContextMenu() {
    this.contextMenuContainer.hide();
    this.uiManager.hidingPrivateContextMenu();
  }


  resize() {
    for (const [panelName, panel] of Object.entries(this.panels)) {
      panel.resize();
    }
  }

  setLatestFirmwareVersion(v) {
    this.latestFirmwareVersion = v;

    // if we already know our own firmware version, then compare?
    
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
      channel <= this.mapParams[paramName].channel)) {
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
      } else if (paramName == 'location2') {
        this.updateLocation2(value);
      }else if (paramName == 'heading') {
        this.updateHeading(value);
      } else if (paramName == 'target') {
        this.updateTarget(value);
      } else if (paramName == 'last') {
        this.updateLast(value);
      } else if (paramName == 'wind') {
        this.updateWind(value);
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

        //console.log('Gamepad: ',n,c,p);

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

    this.activePanel = tabName;
  }


  focus() {
    if (this.onFocus) this.onFocus(this);

    this.focused = true;
    this.ui.classList.add('focus');
    if (this.mapEl) this.mapEl.classList.add('selected');
    this.pui.show();

    // update panels
    setTimeout( ()=>{ this.showPanel(this.activePanel); }, 500 );

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

    // hide all panels
    for (const [panelName, panel] of Object.entries(this.panels)) {
      panel.hide();
    }
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


  updateNavMappingStyle(style, update=true) {
    if (this.navMappingStyle == style || style === undefined) return;

    this.navMappingStyle = style;
    this.settingsChanged = update;

    // show/hide stuff we don't want

    var items = [
      this.targetOutlineName,
      this.lastOutlineName,
      this.lastTraceName,
      this.starboardCorridorTraceName,
      this.portCorridorTraceName
    ];

    items.forEach((item)=>{
      if (item !== undefined)
        this.map.setLayoutProperty(item, 'visibility', style == 'minimal' ? 'none' : 'visible');
    });
    
  }


  initNodeLocation() {
    var me = this;
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
    this.mapElArrow = document.createElement('i');
    this.mapElArrow.className = 'fas fa-circle-dot';
    this.mapEl.appendChild(this.mapElArrow);
    this.marker = new mapboxgl.Marker(this.mapEl)
          .setLngLat(this.location)
          .addTo(this.map);
    this.mapElements.push(this.mapEl);

    // set context menu handler
    this.mapEl.addEventListener('contextmenu', (e)=>{
      me.showContextMenu({
        x:e.clientX,
        y:e.clientY - 41 // to allow for toolbar
      });
      e.preventDefault();
    });

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
    this.mapElements.push(this.mapLabel);

    // heading indicator
    this.headingIndicatorName = 'headingIndicator' + this.id;
    var targetCoords = calculateDestinationFromDistanceAndBearing(this.location, 1, 0);

    this.headingIndicator = { "type": "LineString", "coordinates": [ this.location, targetCoords ] };
    this.map.addSource(this.headingIndicatorName, { type: 'geojson', data: this.headingIndicator });
    this.map.addLayer({
      'id': this.headingIndicatorName,
      'type': 'line',
      'source': this.headingIndicatorName,
      'paint': {
        'line-color': 'green',
        'line-opacity': 1,
        'line-width': 3
      }
    });
    this.mapLayerIDs.push(this.headingIndicatorName);


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
    this.mapLayerIDs.push(trailName);
  }


  initNodeLocation2() {
    console.log('Adding node secondary location');

    // create map objects
    // -----------------------------------------

    // -- marker --
    this.mapEl2 = document.createElement('div');
    this.mapEl2.className = 'marker';
    this.mapEl2Arrow = document.createElement('i');
    this.mapEl2Arrow.className = 'fas fa-circle-dot';
    this.mapEl2.appendChild(this.mapEl2Arrow);
    this.marker2 = new mapboxgl.Marker(this.mapEl2)
          .setLngLat(this.location2)
          .addTo(this.map);
    this.mapElements.push(this.mapEl2);
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


  resetSnailTrail() {
    if (!this.snailTrail) return;
    this.snailTrail.coordinates = [ this.location ];
    var src = this.map.getSource('snailTrail' + this.id);
    if (src) src.setData(this.snailTrail);
  }

  updateLocation(newLoc) {
    var loopTime = (new Date()).getTime();

    //console.log(newLoc);
    this.location = newLoc;
    // update snailTrail
    if (this.snailTrail) {
      // check distance between nodes, update if moved a sig distance
      var d = this.distanceBetweenCoordinates(this.location, this.snailTrail.coordinates[this.snailTrail.coordinates.length-1]);
      var dThreshold = 1;  // calculate based on disance between waypoints
      if (d > dThreshold) {
        this.snailTrail.coordinates.push(this.location);
        if (this.snailTrail.coordinates.length > 400) {
          this.snailTrail.coordinates.shift();
        }

        // see if point p[n-2] is basically on a straight line from p[n-3] to p[n-1] (this.location)
        
        if (this.snailTrail.coordinates.length > 2) {
          var pm3 = this.snailTrail.coordinates[this.snailTrail.coordinates.length-3];
          var pm2 = this.snailTrail.coordinates[this.snailTrail.coordinates.length-2];
          var pm1 = this.location;

          var b1 = calculateInitialBearingBetweenCoordinates(pm3[0], pm3[1], pm2[0], pm2[1]);
          var b2 = calculateInitialBearingBetweenCoordinates(pm2[0], pm2[1], pm1[0], pm1[1]);

          if (Math.abs(b2-b1) < 3) {
            // remove p[n-2]
            this.snailTrail.coordinates.splice(this.snailTrail.coordinates.length-2, 1);
          }
        }
        

        var src = this.map.getSource('snailTrail' + this.id);
        if (src) src.setData(this.snailTrail);
      }
    }

    // update speed estimate
    if (this.lastLocation[0] != 0 && this.lastLocationTime > 0) {
      var d1 = this.distanceBetweenCoordinates(this.location, this.lastLocation);
      var dt = (loopTime - this.lastLocationTime) / 1000;
      if (dt > 1) {
        var speed = d1 / dt;
        this.speedOverGround = (this.speedOverGround * 9 + speed) / 10;
  
        // update label
        this.markerLabel.getElement().innerHTML = this.name + '<br/>' + (this.speedOverGround * 1.94384).toFixed(1) + 'kn';
      }
    }

    this.lastLocation = newLoc;
    this.lastLocationTime = loopTime;

    // update target
    if (this.targetTrace) {
      this.targetTrace.coordinates[0] = this.location;
      var src = this.map.getSource('targetTrace' + this.id);
      if (src) src.setData(this.targetTrace);
    }

    // update wind
    if (this.windDir && this.windIndicator) {
      this.updateWind(this.windDir);
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

    // do we need to tickle target or last updates?
    if (this.target && this.target[0] != 0 && !this.gotTarget) {
      this.updateTarget(this.target);
    }
    if (this.last && this.last[0] != 0 && !this.gotLast) {
      this.updateLast(this.last);
    }
  }


  updateLocation2(newLoc) {
    var loopTime = (new Date()).getTime();

    //console.log(newLoc);
    this.location2 = newLoc;

    if (!this.gotLocation2) {
      this.gotLocation2 = true;
      this.initNodeLocation2();
    } else {
      if (this.location2 && this.location2.length >=2) {
        this.marker2.setLngLat(this.location2);
      }
    }
  }


  updateHeading(heading) {
    //console.log(heading);
    if (this.gotLocation) {
      this.heading = heading;
      this.mapElArrow.className = 'fas fa-arrow-up';
      this.marker.setRotation(heading);

      // heading
      this.headingIndicator.coordinates[0] = this.location;
      var len = this.speedOverGround * 60 / 1.94384;  // convert back to meters in 1 min
      var targetCoords = calculateDestinationFromDistanceAndBearing(this.location, len, this.heading);
      this.headingIndicator.coordinates[1] = targetCoords;

      var src = this.map.getSource(this.headingIndicatorName);
      if (src) src.setData(this.headingIndicator);
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
    //console.log('new target');


    //if (this.gotLocation) {
      if (!this.gotTarget) {
        //console.log('Adding target', target);
        this.gotTarget = true;

        // -- target marker --
        var el = document.createElement('div');
        el.className = 'targetMarker';

        this.targetMarker = new mapboxgl.Marker(el)
            .setLngLat(target)
            .setDraggable(true)
            .addTo(this.map);

        this.mapElements.push(el);
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
        this.targetOutlineName = 'targetOutline' + this.id;
        this.targetOutline = this.createGeoJSONCircle(this.target, this.target[2]);
        this.map.addSource(this.targetOutlineName, { type: 'geojson', data: this.targetOutline });
        this.map.addLayer({
  				'id': this.targetOutlineName,
  				'type': 'line',
  				'source': this.targetOutlineName,
          'layout': {},
  				'paint': {
            'line-color': 'yellow',
  					'line-opacity': 0.5,
  					'line-width': 2
  				}
  			});
        this.mapLayerIDs.push(this.targetOutlineName);

        // -- target trace --
        var traceName = 'targetTrace' + this.id;
        this.targetTrace = { "type": "LineString", "coordinates": [ this.gotLocation ? this.location : this.target, this.target ] };
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
        this.mapLayerIDs.push(traceName);


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
    //} // end if gotLocation

    // if gotLast then trigger an update just to ensure corridor is drawn correctly
    if (this.gotLast) {
      this.updateLast(this.last);
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
        this.mapElements.push(el);

        this.lastMarker = new mapboxgl.Marker(el)
            .setLngLat(last)
            .addTo(this.map);

        // -- last outline --
        this.lastOutlineName = 'lastOutline' + this.id;
        this.lastOutline = this.createGeoJSONCircle(this.last, this.last[2]);
        this.map.addSource(this.lastOutlineName, { type: 'geojson', data: this.lastOutline });
        this.map.addLayer({
  				'id': this.lastOutlineName,
  				'type': 'line',
  				'source': this.lastOutlineName,
          'layout': {},
  				'paint': {
            'line-color': 'red',
  					'line-opacity': 0.5,
  					'line-width': 2
  				}
  			});
        this.mapLayerIDs.push(this.lastOutlineName);

        // -- last trace --
        this.lastTraceName = 'lastTrace' + this.id;
        this.lastTrace = { "type": "LineString", "coordinates": [ this.last, this.target ] };
        this.map.addSource(this.lastTraceName, { type: 'geojson', data: this.lastTrace });
  			this.map.addLayer({
  				'id': this.lastTraceName,
  				'type': 'line',
  				'source': this.lastTraceName,
  				'paint': {
  					'line-color': 'red',
  					'line-opacity': 0.5,
  					'line-width': 2
  				}
  			});
        this.mapLayerIDs.push(this.lastTraceName);

        // -- starboard corridor --
        this.starboardCorridorTraceName = 'starboardTrace' + this.id;

        // target needs to be transformed by translating on a vector given by target radius rotated by 90 CW
        var course = calculateInitialBearingBetweenCoordinates( this.last[0], this.last[1],  this.target[0], this.target[1]);

        var offsetTarget = calculateDestinationFromDistanceAndBearing(this.target, this.target[2], course+90);
        var offsetLast = calculateDestinationFromDistanceAndBearing(this.last, this.target[2], course+90);

        this.starboardTrace = { "type": "LineString", "coordinates": [ offsetLast, offsetTarget ] };
        this.map.addSource(this.starboardCorridorTraceName, { type: 'geojson', data: this.starboardTrace });
  			this.map.addLayer({
  				'id': this.starboardCorridorTraceName,
  				'type': 'line',
  				'source': this.starboardCorridorTraceName,
  				'paint': {
  					'line-color': 'yellow',
  					'line-opacity': 0.3,
  					'line-width': 2,
            'line-dasharray': [4,4]
  				}
  			});
        this.mapLayerIDs.push(this.starboardCorridorTraceName);

        // -- port corridor --
        this.portCorridorTraceName = 'portTrace' + this.id;

        // target needs to be transformed by translating on a vector given by target radius rotated by 90 CW
        offsetTarget = calculateDestinationFromDistanceAndBearing(this.target, this.target[2], course-90);
        offsetLast = calculateDestinationFromDistanceAndBearing(this.last, this.target[2], course-90);

        this.portTrace = { "type": "LineString", "coordinates": [ offsetLast, offsetTarget ] };
        this.map.addSource(this.portCorridorTraceName, { type: 'geojson', data: this.portTrace });
  			this.map.addLayer({
  				'id': this.portCorridorTraceName,
  				'type': 'line',
  				'source': this.portCorridorTraceName,
  				'paint': {
  					'line-color': 'yellow',
  					'line-opacity': 0.3,
  					'line-width': 2,
            'line-dasharray': [4,4]
  				}
  			});
        this.mapLayerIDs.push(this.portCorridorTraceName);


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

        // -- starboard corridor --
        var course = calculateInitialBearingBetweenCoordinates( this.last[0], this.last[1],  this.target[0], this.target[1]);

        var traceName = 'starboardTrace' + this.id;
        var src = this.map.getSource(traceName);
        if (src) {
          this.starboardTrace.coordinates[1] = calculateDestinationFromDistanceAndBearing(this.target, this.target[2], course+90);
          this.starboardTrace.coordinates[0] = calculateDestinationFromDistanceAndBearing(this.last, this.target[2], course+90);
          src.setData(this.starboardTrace);
        }

        // -- port corridor --
        var traceName = 'portTrace' + this.id;
        var src = this.map.getSource(traceName);
        if (src) {
          this.portTrace.coordinates[1] = calculateDestinationFromDistanceAndBearing(this.target, this.target[2], course-90);
          this.portTrace.coordinates[0] = calculateDestinationFromDistanceAndBearing(this.last, this.target[2], course-90);
          src.setData(this.portTrace);
        }
      }
    }
  }




  


  updateWind(wind) {
    // can't visualise until we have a valid location
    if (!this.gotLocation) return;

    this.windDir = wind;

    if (this.windIndicator) {
      this.windIndicator.coordinates[0] = this.location;
      var windCoords = calculateDestinationFromDistanceAndBearing(this.location, 10, wind);
      this.windIndicator.coordinates[1] = windCoords;

      var src = this.map.getSource('windIndicator' + this.id);
      if (src) src.setData(this.windIndicator);

    } else {
      // init windIndicator
      var traceName = 'windIndicator' + this.id;
      var windCoords = calculateDestinationFromDistanceAndBearing(this.location, 10, wind);

      this.windIndicator = { "type": "LineString", "coordinates": [ this.location, windCoords ] };
      this.map.addSource(traceName, { type: 'geojson', data: this.windIndicator });
      this.map.addLayer({
        'id': traceName,
        'type': 'line',
        'source': traceName,
        'paint': {
          'line-color': 'blue',
          'line-opacity': 1,
          'line-width': 3
        }
      });
      this.mapLayerIDs.push(traceName);
    }
  }

}
