import Panel from './Panel.mjs';
import loadStylesheet from '../../loadStylesheet.js';


loadStylesheet('./css/modules/oui/panels/Configuration.css');


export default class Graph extends Panel {

  constructor(node, tabs, panels) {
    super(node, tabs, panels);

    this.tabName = 'Configuration';
    this.title = 'Configuration';
    this.icon = 'fas fa-folder-open';

    this.build();
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
  }

  update() {
    if (!this.visible) return;

  }


  resize() {

  }


  getNodeFileList() {
    fetch('http://' + this.node.ipAddress + '/listfiles?json')
      .then(response => {
        if (!response.ok) {
          throw new Error('Network response was not OK');
        }
        return response.json();
      })
      .then(data => {
        //console.log(data);
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
