
import loadStylesheet from '../loadStylesheet.js';
import * as DLM from '../droneLinkMsg.mjs';

// oui
import Channel from './Channel.mjs';
import GraphManager from './GraphManager.mjs';

// widgets
import NavWidget from '../widgets/NavWidget.mjs';
import RFM69TelemetryWidget from '../widgets/RFM69TelemetryWidget.mjs';
import INA219Widget from '../widgets/INA219Widget.mjs';
import NMEAWidget from '../widgets/NMEAWidget.mjs';


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
    this.ipAddress = '';
    this.selectedNodeFilename = '';
    this.scriptMarkers = [];
    this.focused = false;

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

    this.puiNav = $('<div class="panelNav"></div>');
    this.pui.append(this.puiNav);

    this.puiMgmtBut = $('<a class="tab active">Management</a>')
    this.puiNav.append(this.puiMgmtBut)
    this.puiMgmtBut.on('click', ()=> { this.showPanel(this.puiMgmtBut, this.mui) });

    this.puiConfigBut = $('<a class="tab inactive">Configuration</a>')
    this.puiNav.append(this.puiConfigBut)
    this.puiConfigBut.on('click', ()=> {  this.showPanel(this.puiConfigBut,this.cui) });

    this.puiGraphBut = $('<a class="tab inactive">Graph</a>')
    this.puiNav.append(this.puiGraphBut)
    this.puiGraphBut.on('click', ()=> {  this.showPanel(this.puiGraphBut,this.graphui) });

    /*
    this.puiFirmwareBut = $('<button class="btn btn-secondary">Firmware</button>')
    this.puiNav.append(this.puiFirmwareBut)
    this.puiFirmwareBut.on('click', ()=> {  this.showPanel(this.puiFirmwareBut,this.fui) });
    */

    this.puiPanels = $('<div class="panels"></div>');
    this.pui.append(this.puiPanels);

    // create mgmt ui
    this.mui = $('<div class="managementUI"/>');
    //this.muiName = $('<div class="nodeName"></div>');
    //this.mui.append(this.muiName);
    this.mui.node = this;
    this.muiChannels = {};

    this.puiPanels.append(this.mui);



    // create config ui
    this.cui = $('<div class="configurationUI" style="display:none"/>');
    this.cui.node = this;
    this.puiPanels.append(this.cui);

    // file mgmt block
    this.cuiFileBlock = $('<div class="fileBlock"></div>');
    this.cui.append(this.cuiFileBlock);

    // on server
    this.cuiFilesOnServer = $('<div class="filePane"></div>');
    this.cuiFileBlock.append(this.cuiFilesOnServer);

    //    title
    this.cuiFilesOnServerTitle = $('<div class="title">Files on Server</div>');
    this.cuiFilesOnServer.append(this.cuiFilesOnServerTitle);

    //    nav
    this.cuiFilesOnServerNav = $('<div class="nav"></div>');
    this.cuiFilesOnServer.append(this.cuiFilesOnServerNav);

    //    filelist
    this.cuiFilesOnServerFiles = $('<div class="files"></div>');
    this.cuiFilesOnServer.append(this.cuiFilesOnServerFiles);

    // on node
    this.cuiFilesOnNode = $('<div class="filePane" style="display:none"></div>');
    this.cuiFileBlock.append(this.cuiFilesOnNode);

    //    title
    this.cuiFilesOnNodeTitle = $('<div class="title">Files on Node</div>');
    this.cuiFilesOnNode.append(this.cuiFilesOnNodeTitle);

    //    nav
    this.cuiFilesOnNodeNav = $('<div class="nav"></div>');
    this.cuiFilesOnNode.append(this.cuiFilesOnNodeNav);

    this.cuiGetFileListBut = $('<button class="btn btn-sm btn-primary">List</button>');
    this.cuiGetFileListBut.on('click',()=>{ this.getNodeFileList()  });
    this.cuiFilesOnNodeNav.append(this.cuiGetFileListBut);


    this.cuiGetFileBut = $('<button class="btn btn-sm btn-primary ml-1" style="display:none">Edit</button>');
    this.cuiGetFileBut.on('click',()=>{
      this.loadFileFromNode();
    });
    this.cuiFilesOnNodeNav.append(this.cuiGetFileBut);



    //    filelist
    this.cuiFilesOnNodeFiles = $('<div class="files"></div>');
    this.cuiFilesOnNode.append(this.cuiFilesOnNodeFiles);



    // file editor block
    this.cuiEditorBlock = $('<div class="editorBlock" style="display:none"></div>');
    this.cui.append(this.cuiEditorBlock);

    // nav
    this.cuiEditorNav = $('<div class="editorNav clearfix"></div>');
    this.cuiEditorBlock.append(this.cuiEditorNav);

    this.cuiEditorSaveBut = $('<button class="btn btn-sm btn-primary float-right" style="display:none">Save</button>');
    this.cuiEditorSaveBut.on('click',()=>{
      this.cuiEditorNav.addClass('saving');
      var contents = this.aceEditor.session.getValue();
      var blob = new Blob ([contents], { type: "text/plain" });
      var fileOfBlob = new File([blob], this.cuiEditorTitle.html());
      var fd = new FormData();
      fd.append("file1", fileOfBlob);
      var xmlhttp=new XMLHttpRequest();
      xmlhttp.open("POST", 'http://' + this.ipAddress + '/', true);
      xmlhttp.onload = function (e) {
        if (xmlhttp.readyState === 4) {
          if (xmlhttp.status === 200) {
            //
            me.cuiEditorNav.addClass('saved');
            me.cuiEditorNav.removeClass('saving');
            me.getNodeFileList();
          } else {
            //console.error(xmlhttp.statusText);
            me.cuiEditorNav.addClass('error');
            me.cuiEditorNav.removeClass('saving');
          }
        }
      };
      xmlhttp.onerror = function (e) {
        console.error(xmlhttp.statusText);
        me.cuiEditorNav.addClass('error');
        me.cuiEditorNav.removeClass('saving');
      };
      xmlhttp.send(fd);
    });
    this.cuiEditorNav.append(this.cuiEditorSaveBut);

    this.cuiEditorTitle = $('<div class="title"></div>');
    this.cuiEditorNav.append(this.cuiEditorTitle);

    // editor
    this.cuiEditor = $('<div class="editor"></div>');

    ace.config.setModuleUrl('ace/mode/dcode',"/modules/mode-dcode.js");

    this.aceEditor = ace.edit(this.cuiEditor[0], {
        mode: "ace/mode/dcode",
        theme:'ace/theme/dracula',
        selectionStyle: "text"
    });
    this.aceEditor.on('change', ()=>{
      this.cuiEditorNav.removeClass('saved');
      this.analyseFile();
    });
    this.aceEditor.session.selection.on('changeCursor', (e)=>{

      var cursor = this.aceEditor.selection.getCursor();
      // get line for cursor
      var line = this.aceEditor.session.getLine(cursor.row);
      console.log('line:', line);
      if (line.includes('.goto')) {
        console.log('goto!');
        const regexp = /\s*([_]\w+)?\.\w+\s+(-?(0|[1-9]\d*)(\.\d+)?)\s+(-?(0|[1-9]\d*)(\.\d+)?)\s+(-?(0|[1-9]\d*)(\.\d+)?)/;
        const match = line.match(regexp);
        if (match) {
          console.log('coord:',match[1],match[4],match[7]);

          /*
          // move map center to coord
          var lon =  parseFloat(match[1]);
          var lat = parseFloat(match[4]);
          if (lon && lat) this.map.setCenter([ lon, lat])
          */
          // find matching marker
          for (var i=0; i<this.scriptMarkers.length; i++) {
            if (this.scriptMarkers[i].lineNumber == cursor.row) {
              // found it
              this.scriptMarkers[i].getElement().classList.add('active');

              // set outline
              var outlineData = this.createGeoJSONCircle([this.scriptMarkers[i]._lngLat.lng, this.scriptMarkers[i]._lngLat.lat], this.scriptMarkers[i].targetRadius);
              var src = this.map.getSource('scriptOutline' + this.id);
              if (src) src.setData(outlineData);

              // see if visible
              if (!this.map.getBounds().contains(this.scriptMarkers[i].getLngLat())) {
                this.map.flyTo({center:this.scriptMarkers[i].getLngLat()});
              }
            } else {
              this.scriptMarkers[i].getElement().classList.remove('active');
            }
          }
        }

      }
    });
    //const syntax = new DCodeSyntax();
    //console.log(this.aceEditor.session);
    //this.aceEditor.session.setMode(syntax.mode);
    this.cuiEditorBlock.append(this.cuiEditor);


    // create graph ui
    this.graphui = $('<div class="graphUI" style="display:none"/>');
    this.puiPanels.append(this.graphui);
    this.graphui.node = this;
    this.graphManager = new GraphManager(this, this.graphui);


    // query ipAddress
    var qm = new DLM.DroneLinkMsg();
    qm.source = 252;
    qm.node = this.id;
    qm.channel = 1;
    qm.param = 12;
    qm.msgType = DLM.DRONE_LINK_MSG_TYPE_QUERY;
    qm.msgLength = 1;
    this.state.send(qm);


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

      // create new graph element for the module/channel
      this.graphManager.addBlock(state, data);

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

      if (data.type == 'Nav' && this.locationType != 'Nav') {
        console.log('Found Nav: '+data.channel);
        this.gotLocationModule = true;
        this.locationModule = data.channel;
        this.locationType = 'Nav';

        // speculative query for location
        /*
        var qm = new DLM.DroneLinkMsg();
        qm.source = 252;
        qm.node = this.id;
        qm.channel = 7;
        qm.param = 10;
        qm.msgType = DLM.DRONE_LINK_MSG_TYPE_QUERY;
        qm.msgLength = 1;
        this.state.send(qm);
*/
      }

      if (data.type == 'Nav' && this.targetModule == 0) {
        console.log('Using Nav for waypoint targets');
        this.targetModule = data.channel;

        // query for target regularly
        setInterval(()=>{
          var qm = new DLM.DroneLinkMsg();
          qm.source = 252;
          qm.node = this.id;
          qm.channel = data.channel;
          qm.param = 12;
          qm.msgType = DLM.DRONE_LINK_MSG_TYPE_QUERY;
          qm.msgLength = 1;
          this.state.send(qm);
        }, 5000);
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
      }

      // listen for ipAddress
      if (data.channel == 1 && data.param == 12 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_UINT8_T) {
        if (data.values[0]) {
          this.ipAddress = data.values.join('.');
          // show config node files panel
          this.cuiFilesOnNode.show();
        } else {
          console.error('undefined hostname:', data);
        }
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


  resize() {
    this.graphManager.resize();
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

    // ignore if not on configuration tab
    if (!this.cui.is(":visible")) return;

    // ignore if editor not visible
    if (!this.cuiEditorBlock.is(":visible")) return;

    var coord = e.lngLat;
    var cursor = this.aceEditor.selection.getCursor();
    var radius = 5;
    if (this.scriptMarkers.length > 0) {
      radius = this.scriptMarkers[this.scriptMarkers.length-1].targetRadius;
    }
    var newCmd = '\n_Nav.goto '+coord.lng.toFixed(12)+' '+coord.lat.toFixed(12) + ' ' + radius.toFixed(1);
    console.log('inserting:', newCmd, cursor.row);
    this.aceEditor.session.insert({row: cursor.row+1, column:0}, newCmd);
  }

  getNodeFileList() {
    fetch('http://' + this.ipAddress + '/listfiles?json')
      .then(response => {
        if (!response.ok) {
          throw new Error('Network response was not OK');
        }
        return response.json();
      })
      .then(data => {
        console.log(data);
        this.cuiFilesOnNodeTitle.html( data.files.length +' Files on Node');
        this.cuiFilesOnNodeFiles.empty();
        data.files.forEach((f)=>{
          var sizeStr =  '';
          if (f.size < 1000) {
            sizeStr = f.size.toFixed(0);
          } else {
            sizeStr = (f.size/1024).toFixed(1) + 'k';
          }
          var fe = $('<div class="file clearfix">'+f.name+' <span class="size float-right">'+sizeStr+'</span></div>');
          fe.data('name',f.name);
          fe.on('click',()=>{
            this.cuiFilesOnNodeFiles.children().removeClass('selected');
            this.selectedNodeFilename = fe.data('name');
            fe.addClass('selected');
            this.cuiGetFileBut.show();
          });
          this.cuiFilesOnNodeFiles.append(fe);
        });
      })
      .catch(error => {
        this.cuiFilesOnNodeFiles.html('Error fetching files: '+error);
        console.error('There has been a problem with your fetch operation:', error);
        this.cuiGetFileBut.hide();
      });
  }

  loadFileFromNode() {
    this.cuiEditorTitle.html('Downloading...' + this.selectedNodeFilename);
    this.cuiEditorNav.removeClass('saved');
    this.cuiEditorNav.removeClass('error');
    this.aceEditor.session.setValue('',-1);
    this.cuiEditorBlock.show();

    fetch('http://' + this.ipAddress + '/file?action=download&name='+this.selectedNodeFilename)
      .then(response => {
        if (!response.ok) {
          throw new Error('Network response was not OK');
        }
        return response.text();
      })
      .then(data => {
        this.aceEditor.session.setValue(data,-1);
        this.cuiEditorTitle.html(this.selectedNodeFilename);
        this.cuiEditorSaveBut.show();

        this.analyseFile();
      })
      .catch(error => {
        this.aceEditor.session.setValue('Error fetching file: '+error,-1);
        this.cuiEditorTitle.html('Error!');
        this.cuiEditorSaveBut.hide();
        console.error('Error downloading: ' + this.selectedNodeFilename);
      });
  }

  analyseFile() {
    // analyse contents of file loaded into editor
    // e.g. extract navigation markers
    var sess = this.aceEditor.session;

    var numLines = sess.getLength();
    var numMarkers = 0;
    for (var i=1; i<=numLines; i++) {
      var line = sess.getLine(i);

      // analyse line
      if (line.includes('.goto')) {
        const regexp = /(\s*([_]\w+)?\.goto)\s+(-?[0-9]\d*(\.\d+)?)\s+(-?[0-9]\d*(\.\d+)?)\s+(-?[0-9]\d*(\.\d+)?)/;
        const match = line.match(regexp);
        if (match) {
          console.log('goto:',match[3],match[5],match[7]);
          var lon = parseFloat(match[3]);
          var lat = parseFloat(match[5]);
          var radius = parseFloat(match[7]);

          // create or update marker
          // -- target marker --
          var el = document.createElement('div');
          el.className = 'scriptMarker';

          console.log(numMarkers, this.scriptMarkers.length, this.scriptMarkers);


          var marker;
          if (numMarkers < this.scriptMarkers.length) {
            marker = this.scriptMarkers[numMarkers];
          } else {
            marker = new mapboxgl.Marker(el)
                .setLngLat([lon,lat])
                .setDraggable(true)
                .addTo(this.map);

            marker.on('dragend', (e)=>{
              const lngLat = e.target.getLngLat();
              var newCmd = '  _Nav.goto '+lngLat.lng.toFixed(12) + ' ' +lngLat.lat.toFixed(12)+ ' '+e.target.targetRadius;

              function replacer(match, p1, p2, p3, p4, p5, p6, p7, offset, string) {
                // p1 is the namespace/command combined
                // p2, p4 and p6 are the outer matches for the 3 coord params
                return [p1, lngLat.lng.toFixed(12), lngLat.lat.toFixed(12), e.target.targetRadius].join(' ');
              }
              var newCmd = sess.getLine(e.target.lineNumber);
              newCmd = newCmd.replace(/(\s*([_]\w+)?\.goto)\s+(-?[0-9]\d*(\.\d+)?)\s+(-?[0-9]\d*(\.\d+)?)\s+(-?[0-9]\d*(\.\d+)?)/, replacer);

              console.log('new pos', lngLat);
              sess.replace({
                  start: {row: e.target.lineNumber, column: 0},
                  end: {row: e.target.lineNumber, column: Number.MAX_VALUE}
              }, newCmd);

              this.aceEditor.selection.moveCursorTo(e.target.lineNumber, newCmd.length, false);
              this.aceEditor.selection.clearSelection();

            })

            this.scriptMarkers.push(marker);
          }

          if (lon && lat) {
            marker.setLngLat([lon,lat]);
            marker.lineNumber = i;
            marker.targetRadius = radius;
          } else {
            console.error('invalid coords:', lon, lat);
          }


          numMarkers++;
        }
      }
    }

    // delete redundant markers
    while (numMarkers < this.scriptMarkers.length) {
      this.scriptMarkers[this.scriptMarkers.length-1].remove();
      this.scriptMarkers.pop();
    }

    if (this.scriptMarkers.length == 0) {
      // clear script target outline
      // set outline
      var outlineData = {
        "type": "Feature",
        "geometry": {
            "type": "Point",
            "coordinates":  [  ]
        }
      }
      var src = this.map.getSource('scriptOutline' + this.id);
      if (src) src.setData(outlineData);
    }

    console.log('done',numMarkers, this.scriptMarkers.length, this.scriptMarkers);
  }


  showPanel(but, panel) {
    // hide everythign else
    var me = this;
    // restyle buttons
    this.puiNav.children().each(function () {
        $(this).removeClass('active');
        $(this).addClass('inactive');
    });
    // hide panels
    this.puiPanels.children().each(function () {
        $(this).hide();
    });

    but.addClass('active');
    but.removeClass('inactive');
    if (panel) panel.show();

    // trigger a graph resize... just in case
    this.graphManager.resize();

    // trigger interface redraw
    this.updateInterfaces();
  }


  updateInterfaces() {
    for (const [key, chan] of Object.entries(this.muiChannels)) {
      if (chan.interface) chan.interface.update();
    }
  }


  focus() {
    if (this.onFocus) this.onFocus(this);

    this.focused = true;
    this.ui.classList.add('focus');
    this.pui.show();

    // trigger interface redraw
    this.updateInterfaces();

    //this.mui.css('display','grid');

    if (this.gotLocation && this.location[0] != 0) {
      this.map.flyTo({
        center: this.location
      });
    }
  }

  blur() {
    this.ui.classList.remove('focus');
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
