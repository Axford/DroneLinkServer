import Panel from './Panel.mjs';
import loadStylesheet from '../../loadStylesheet.js';

import * as DMFS from '../../DroneMeshFS.mjs';

loadStylesheet('./css/modules/oui/panels/Configuration.css');

//--------------------------------------------------------
// DroneFSEntry
//--------------------------------------------------------

class DroneFSEntry {
  constructor(socket, nodeId, parent, path, isDir, container) {
    this.socket = socket;
    this.nodeId = nodeId;
    this.parent = parent;
    this.fullpath = path;
    this.isDir = isDir;
    this.container = container;
    this.children = {}; // indexed by id
    this.size = 0;
    this.enumerated = false;

    // separate path from name
    var fp = 0;
    for (var i=path.length-1; i>=0; i--) {
      if (path[i] == '/') {
        fp = i;
        break;
      }
    }

    this.path = path.substr(0, fp+1);
    this.name = path.substr(fp+1, path.length);

    console.log('fs.new entry: ['+this.path+'] ['+this.name+']');

    this.ui = {};
    this.ui.container = $('<div class="'+(this.isDir ? 'directory' : 'file')+'"></div>');
    this.container.append(this.ui.container);

    this.ui.title = $('<div class="title">'+ this.title() +'</div>');
    this.ui.container.append(this.ui.title);

    if (this.isDir) {
      this.ui.children = $('<div class="children"></div>');
      this.ui.container.append(this.ui.children);
    }
  }


  title() {
    var s = '';
    if (this.isDir) {
      s = '<i class="fas fa-folder-open mr-2"></i> ' + this.path;
    } else {
      var sizeStr =  '';
      if (this.size < 1000) {
        sizeStr = this.size.toFixed(0);
      } else {
        sizeStr = (this.size/1024).toFixed(1) + 'k';
      }

      s = this.name + '  ('+sizeStr+')';
    }
    return s;
  }


  update() {
    this.ui.title.html(this.title());
  }


  getNodeFileByPath(path) {
    var qm = new DMFS.DroneMeshFSFileRequest();
    qm.flags = DMFS.DRONE_MESH_MSG_FS_FLAG_PATH_INFO;
    qm.id = 0;
    qm.path = path;

    var data = {
      node: this.nodeId,
      payload: qm.encode()
    };

    console.log('Emitting fs.file.request: ' + qm.toString() );
    this.socket.emit('fs.file.request', data);
  }


  getNodeFileByIndex(path, index) {
    var qm = new DMFS.DroneMeshFSFileRequest();
    qm.flags = DMFS.DRONE_MESH_MSG_FS_FLAG_INDEX_INFO;
    qm.id = index;
    qm.path = path;

    var data = {
      node: this.nodeId,
      payload: qm.encode()
    };

    console.log('Emitting fs.file.request: ' + qm.toString() );
    this.socket.emit('fs.file.request', data);
  }


  enumerate() {
    // get info about self
    this.getNodeFileByPath(this.fullpath);

    this.enumerated = true;
  }


  handleFileResponse(fr) {

    // separate path from name
    var fp = 0;
    for (var i=fr.path.length-1; i>=0; i--) {
      if (fr.path[i] == '/') {
        fp = i;
        break;
      }
    }
    var path = fr.path.substr(0, fp+1);
    var name = fr.path.substr(fp+1, fr.path.length);

    // is this about us?
    if (fr.path == this.fullpath) {
      console.log('fs.file.response: its about us');
      this.size = fr.size;
      this.isDir = fr.isDirectory();

      if (fr.isDirectory()) {
        console.log('fs.file.response: enumerating directory of ' + fr.size);

        // enumerate entries
        for (var i=0; i<fr.size; i++) {
          this.getNodeFileByIndex(this.fullpath, i);
        }
      }

      this.update();

    } else {

      if (this.isDir) {

        var createChild = false;

        // is this about one of our immediate children?
        if (path == this.path) {
          console.log('fs.file.response: its one of our children');

          // do we need to create a new child?
          if (!this.children[fr.id]) {
            createChild = true;
            this.children[fr.id] = new DroneFSEntry(this.socket, this.nodeId, this, fr.path, fr.isDirectory(), this.ui.children);
            this.children[fr.id].size = fr.size;
            this.children[fr.id].id = fr.id;
            this.children[fr.id].update();
          }
        }

        // pass to children
        if (!createChild) {
          for (const [id, obj] of Object.entries(this.children)) {
            obj.handleFileResponse(fr);
          }
        }

      }

    }
  }

}


//--------------------------------------------------------
// Configuration
//--------------------------------------------------------


export default class Configuration extends Panel {

  constructor(node, tabs, panels) {
    super(node, tabs, panels);

    this.tabName = 'Configuration';
    this.title = 'Configuration';
    this.icon = 'fas fa-folder-open';

    this.build();

    this.root = new DroneFSEntry(this.node.state.socket, this.node.id, null, '/', true, this.cuiFilesOnNodeFiles);
  }


  build() {
    super.build();

    var me = this;

    // file mgmt block
    this.cuiFileBlock = $('<div class="fileBlock"></div>');
    this.ui.panel.append(this.cuiFileBlock);

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
    this.ui.panel.append(this.cuiEditorBlock);

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
      xmlhttp.open("POST", 'http://' + this.node.ipAddress + '/', true);
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
      //console.log('line:', line);
      if (line.includes('.goto')) {
        //console.log('goto!');
        const regexp = /\s*([_]\w+)?\.\w+\s+(-?(0|[1-9]\d*)(\.\d+)?)\s+(-?(0|[1-9]\d*)(\.\d+)?)\s+(-?(0|[1-9]\d*)(\.\d+)?)/;
        const match = line.match(regexp);
        if (match) {
          //console.log('coord:',match[1],match[4],match[7]);

          /*
          // move map center to coord
          var lon =  parseFloat(match[1]);
          var lat = parseFloat(match[4]);
          if (lon && lat) this.node.map.setCenter([ lon, lat])
          */
          // find matching marker
          for (var i=0; i<this.node.scriptMarkers.length; i++) {
            if (this.node.scriptMarkers[i].lineNumber == cursor.row) {
              // found it
              this.node.scriptMarkers[i].getElement().classList.add('active');

              // set outline
              var outlineData = this.node.createGeoJSONCircle([this.node.scriptMarkers[i]._lngLat.lng, this.node.scriptMarkers[i]._lngLat.lat], this.node.scriptMarkers[i].targetRadius);
              var src = this.node.map.getSource('scriptOutline' + this.id);
              if (src) src.setData(outlineData);

              // see if visible
              if (!this.node.map.getBounds().contains(this.node.scriptMarkers[i].getLngLat())) {
                this.node.map.flyTo({center:this.node.scriptMarkers[i].getLngLat()});
              }
            } else {
              this.node.scriptMarkers[i].getElement().classList.remove('active');
            }
          }
        }

      }
    });
    //const syntax = new DCodeSyntax();
    //console.log(this.aceEditor.session);
    //this.aceEditor.session.setMode(syntax.mode);
    this.cuiEditorBlock.append(this.cuiEditor);


    // event handlers
    this.node.state.socket.on('fs.file.response', (data)=>{
      // see if it's for us
      if (data.node != this.node.id) return;

      // hydrate
      data.payload = new DMFS.DroneMeshFSFileResponse(data.payload);

      console.log('fs.file.response: ' + data.node + '=>' + data.payload.toString());

      // pass to root to handle
      this.root.handleFileResponse(data.payload);

      /*
      if (data.payload.isDirectory()) {
        console.log('fs.file.response: enumerating directory of ' + data.payload.size);
        // enumerate entries
        for (var i=0; i<data.payload.size; i++) {
          this.getNodeFileByIndex(data.payload.path, i)
        }
      } else {
        var sizeStr =  '';
        if (data.payload.size < 1000) {
          sizeStr = data.payload.size.toFixed(0);
        } else {
          sizeStr = (data.payload.size/1024).toFixed(1) + 'k';
        }
        var fe = $('<div class="file clearfix">'+data.payload.path+' <span class="size float-right">'+sizeStr+'</span></div>');
        fe.data('name',data.payload.path);
        fe.data('id', data.payload.id);
        fe.data('size', data.payload.size);
        fe.on('click',()=>{
          this.cuiFilesOnNodeFiles.children().removeClass('selected');
          this.selectedNodeFilename = fe.data('name');
          fe.addClass('selected');
          this.cuiGetFileBut.show();
        });
        this.cuiFilesOnNodeFiles.append(fe);
      }
      */
    });
  }

  update() {
    if (!this.visible) return;

  }


  resize() {

  }


  getNodeFileList() {
    this.root.enumerate();
  }


  loadFileFromNode() {
    this.cuiEditorTitle.html('Downloading...' + this.selectedNodeFilename);
    this.cuiEditorNav.removeClass('saved');
    this.cuiEditorNav.removeClass('error');
    this.aceEditor.session.setValue('',-1);
    this.cuiEditorBlock.show();

  }

/*
  loadFileFromNode() {
    this.cuiEditorTitle.html('Downloading...' + this.selectedNodeFilename);
    this.cuiEditorNav.removeClass('saved');
    this.cuiEditorNav.removeClass('error');
    this.aceEditor.session.setValue('',-1);
    this.cuiEditorBlock.show();

    fetch('http://' + this.node.ipAddress + '/file?action=download&name='+this.selectedNodeFilename)
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
  */

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
          //console.log('goto:',match[3],match[5],match[7]);
          var lon = parseFloat(match[3]);
          var lat = parseFloat(match[5]);
          var radius = parseFloat(match[7]);

          // create or update marker
          // -- target marker --
          var el = document.createElement('div');
          el.className = 'scriptMarker';

          //console.log(numMarkers, this.node.scriptMarkers.length, this.node.scriptMarkers);


          var marker;
          if (numMarkers < this.node.scriptMarkers.length) {
            marker = this.node.scriptMarkers[numMarkers];
          } else {
            marker = new mapboxgl.Marker(el)
                .setLngLat([lon,lat])
                .setDraggable(true)
                .addTo(this.node.map);

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

              //console.log('new pos', lngLat);
              sess.replace({
                  start: {row: e.target.lineNumber, column: 0},
                  end: {row: e.target.lineNumber, column: Number.MAX_VALUE}
              }, newCmd);

              this.aceEditor.selection.moveCursorTo(e.target.lineNumber, newCmd.length, false);
              this.aceEditor.selection.clearSelection();

            })

            this.node.scriptMarkers.push(marker);
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
    while (numMarkers < this.node.scriptMarkers.length) {
      this.node.scriptMarkers[this.node.scriptMarkers.length-1].remove();
      this.node.scriptMarkers.pop();
    }

    if (this.node.scriptMarkers.length == 0) {
      // clear script target outline
      // set outline
      var outlineData = {
        "type": "Feature",
        "geometry": {
            "type": "Point",
            "coordinates":  [  ]
        }
      }
      var src = this.node.map.getSource('scriptOutline' + this.id);
      if (src) src.setData(outlineData);
    }

    //console.log('done',numMarkers, this.node.scriptMarkers.length, this.node.scriptMarkers);
  }


  insertGoto(coord) {
    // ignore if not on configuration tab
    if (!this.visible) return;

    // ignore if editor not visible
    if (!this.cuiEditorBlock.is(":visible")) return;

    //var cursor = this.aceEditor.selection.getCursor();
    var cursor = this.aceEditor.getCursorPosition();
    var radius = 5;
    if (this.node.scriptMarkers.length > 0) {
      radius = this.node.scriptMarkers[this.node.scriptMarkers.length-1].targetRadius;
    }
    var newCmd = '_Nav.goto '+coord.lng.toFixed(12)+' '+coord.lat.toFixed(12) + ' ' + radius.toFixed(1) + '\n';
    //console.log('inserting:', newCmd, cursor.row);
    this.aceEditor.session.insert(cursor, newCmd);
  }

}
