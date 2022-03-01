import Panel from './Panel.mjs';
import loadStylesheet from '../../loadStylesheet.js';

import * as DMFS from '../../DroneMeshFS.mjs';

loadStylesheet('./css/modules/oui/panels/Configuration.css');

//--------------------------------------------------------
// DroneFSEntry
//--------------------------------------------------------

class DroneFSEntry {
  constructor(manager, socket, nodeId, parent, path, isDir, container) {
    this.manager = manager;
    this.socket = socket;
    this.nodeId = nodeId;
    this.parent = parent;
    this.fullpath = path;
    this.isDir = isDir;
    this.container = container;
    this.children = {}; // indexed by id
    this.size = 0;
    this.enumerated = false;
    this.isSelected = false;
    this.isDownloading = false;
    this.isDownloaded = false;
    this.downloadInterval = null;

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

    this.ui.header = $('<div class="header"/>');
    this.ui.header.on('click', ()=>{
      this.manager.onFSEntryClick(this);
    });
    this.ui.header.on('dblclick', ()=>{
      this.manager.onFSEntryDblClick(this);
    });
    this.ui.container.append(this.ui.header);

    this.ui.title = $('<div class="title"/>');
    this.ui.header.append(this.ui.title);

    this.ui.size = $('<div class="size"/>');
    this.ui.header.append(this.ui.size);

    this.ui.download = $('<canvas class="download" height="10" style="display:none;"></canvas>');
    this.ui.container.append(this.ui.download);

    if (this.isDir) {
      this.ui.children = $('<div class="children"/>');
      this.ui.container.append(this.ui.children);
    }
  }


  title() {
    var s = '';
    if (this.isDir) {
      if (this.path = '/') {
        s += '<i class="fas fa-database mr-1"></i> ';
      } else {
        s += '<i class="fas fa-folder-open mr-1"></i> ';
      }
      s += this.path;
    } else {
      s = this.name;
    }
    return s;
  }

  sizeString() {
    var sizeStr =  '';
    if (!this.isDir) {
      if (this.size < 1000) {
        sizeStr = this.size.toFixed(0) + ' B';
      } else {
        sizeStr = (this.size/1024).toFixed(1) + ' kB';
      }
    }
    return sizeStr;
  }


  update() {
    this.ui.title.html(this.title());
    if (this.isDownloaded) this.ui.title.addClass('downloaded');
    this.ui.size.html(this.sizeString());
  }


  select(entry) {
    if (entry == this) {
      this.isSelected = true;
      this.ui.header.addClass('selected');
    } else {
      if (this.isSelected) this.ui.header.removeClass('selected');
      this.isSelected = false;
    }

    // recurse to children
    if (this.isDir) {
      for (const [id, child] of Object.entries(this.children)) {
        child.select(entry)
      }
    }
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
            this.children[fr.id] = new DroneFSEntry(this.manager, this.socket, this.nodeId, this, fr.path, fr.isDirectory(), this.ui.children);
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


  download() {
    if (this.isDir) return;

    // allocate buffer to hold file data
    this.filedata = new Uint8Array(this.size);

    // setup structure to track block download
    this.blocks = [];
    this.numBlocks = Math.ceil(this.size / 32);
    for (var i=0; i<this.numBlocks; i++) {
      this.blocks.push({
        offset: i * 32,
        requested:false,
        requestedTime:Date.now(),
        received:false,
        error:false
      });
    }

    // start the monitoring process
    if (!this.isDownloading) {
      this.isDownloading = true;
      this.ui.download.show();

      this.downloadInterval = setInterval(()=>{
        this.monitorDownload();
      }, 100);
    }
  }


  sendFSReadRequest(id, offset) {
    var qm = new DMFS.DroneMeshFSReadRequest();
    qm.id = id;
    qm.offset = offset;

    var data = {
      node: this.nodeId,
      payload: qm.encode()
    };

    console.log('Emitting fs.read.request: ' + qm.toString() );
    this.socket.emit('fs.read.request', data);
  }


  handleReadResponse(fr) {

    // is this about us?
    if (fr.id == this.id) {
      console.log('fs.read.response: its about us');

      var blockIndex = Math.floor(fr.offset / 32);

      // check size
      if (fr.size > 0) {
        this.blocks[blockIndex].received = true;

        // copy data to buffer
        for (var i=0; i<fr.size; i++) {
          this.filedata[fr.offset + i] = fr.data[i];
        }
      } else {
        // error retrieving block
        this.blocks[blockIndex].received = false;
        this.blocks[blockIndex].error = true;
      }



    } else {
      if (this.isDir) {
        // pass to children
        for (const [id, obj] of Object.entries(this.children)) {
          obj.handleReadResponse(fr);
        }
      }
    }
  }


  monitorDownload() {
    if (!this.isDownloading) return;

    var loopTime = Date.now();

    // check status and request blocks if we have capacity
    var requested = 0;
    for (var i=0; i<this.numBlocks; i++) {
      if (requested > 4) break;

      if (!this.blocks[i].error && !this.blocks[i].received) {
        var doRequest = false;
        if (this.blocks[i].requested) {
          requested++;
          // check timer
          if (loopTime > this.blocks[i].requestedTime + 2000) {
            // re-request the block
            doRequest = true;
          }
        } else {
          // request the block
          doRequest = true;
          requested++;
        }
        if (doRequest) {
          this.blocks[i].requested = true;
          this.blocks[i].requestedTime = loopTime;
          this.sendFSReadRequest(this.id, this.blocks[i].offset);
        }
      }
    }

    // render progress
    var c = this.ui.download[0];
		var ctx = c.getContext("2d");

    // keep width updated
    var w = this.ui.download.width();
    ctx.canvas.width = w;
    var h = this.ui.download.height();

    ctx.fillStyle = '#343a40';
		ctx.fillRect(0,0,w,h);

    var bw = w / this.numBlocks;
    var progress = 0;
    for (var i=0; i<this.numBlocks; i++) {
      var x1 = w * (i/(this.numBlocks));

      if (this.blocks[i].error) {
        ctx.fillStyle = '#f55';
        ctx.fillRect(x1,0,bw,h);
      }  else if (this.blocks[i].received) {
        ctx.fillStyle = '#5f5';
        ctx.fillRect(x1,0,bw,h);
        progress++;
      } else if (this.blocks[i].requested) {
        var age = 1 - (loopTime - this.blocks[i].requestedTime)/2000;

        ctx.fillStyle = 'rgba(255,190,50, '+(age).toFixed(2)+')';
        ctx.fillRect(x1,0,bw,h);
      }
    }

    var complete = progress == this.numBlocks;

    if (complete) {
      clearInterval(this.downloadInterval);
      this.isDownloading = false;
      this.isDownloaded = true;
      this.ui.download.hide();

      this.update();

      // inform manager download is complete
      this.manager.onDownloadComplete(this);
    }
  }


  sendFSResizeRequest(path, newSize) {
    var qm = new DMFS.DroneMeshFSResizeRequest();
    qm.path = path;
    qm.size = newSize;

    var data = {
      node: this.nodeId,
      payload: qm.encode()
    };

    console.log('Emitting fs.resize.request: ' + qm.toString() );
    this.socket.emit('fs.resize.request', data);
  }


  sendFSWriteRequest(id, offset) {
    var qm = new DMFS.DroneMeshFSWriteRequest();
    qm.id = id;
    qm.offset = offset;

    // calc size
    qm.size = Math.min(32, this.size - offset);

    // copy to data to buffer
    for (var i=0; i<qm.size; i++) {
      qm.data[i] = this.filedata[offset + i];
    }

    var data = {
      node: this.nodeId,
      payload: qm.encode()
    };

    console.log('Emitting fs.write.request: ' + qm.toString() );
    this.socket.emit('fs.write.request', data);
  }


  handleResizeResponse(fr) {

    console.log('fs.resize.response: ' + fr.path + ' vs ' + this.fullpath);

    // is this about us?
    if (fr.path == this.fullpath) {
      console.log('fs.resize.response: its about us');

      // check size
      if (fr.size > 0 && fr.size == this.newSize) {
        this.resizeConfirmed = true;
        this.size = this.newSize;
        console.log('fs.resize.response: resize confirmed');
      } else {
        // TODO: error or deleted
        console.error('handleResizeResponse: zero size returned ' + this.fullpath);
      }

    } else {
      if (this.isDir) {
        // pass to children
        for (const [id, obj] of Object.entries(this.children)) {
          obj.handleResizeResponse(fr);
        }
      }
    }
  }


  handleWriteResponse(fr) {

    // is this about us?
    if (fr.id == this.id) {
      console.log('fs.write.response: its about us');

      var blockIndex = Math.floor(fr.offset / 32);

      // check size
      if (fr.size > 0) {
        this.blocks[blockIndex].written = true;

      } else {
        // error retrieving block
        this.blocks[blockIndex].written = false;
        this.blocks[blockIndex].error = true;
      }

    } else {
      if (this.isDir) {
        // pass to children
        for (const [id, obj] of Object.entries(this.children)) {
          obj.handleWriteResponse(fr);
        }
      }
    }
  }


  upload(data) {
    if (this.isDir) return;

    // update size
    this.newSize = data.length;

    // allocate buffer to hold file data
    this.filedata = new Uint8Array(this.newSize);

    // copy data contents
    for (var i=0; i<data.length; i++) {
      this.filedata[i] = data[i];
    }

    // setup structure to track block upload
    this.blocks = [];
    this.numBlocks = Math.ceil(this.newSize / 32);
    for (var i=0; i<this.numBlocks; i++) {
      this.blocks.push({
        offset: i * 32,
        sent:false,
        sentTime:Date.now(),
        written:false,
        error:false
      });
    }

    // start the monitoring process
    if (!this.isUploading) {
      this.uploadStarted = Date.now();
      this.resizeConfirmed = false;
      this.sendFSResizeRequest(this.fullpath, this.newSize);

      this.isUploading = true;
      this.ui.download.show();

      this.uploadInterval = setInterval(()=>{
        this.monitorUpload();
      }, 100);
    }
  }


  monitorUpload() {
    if (!this.isUploading) return;

    var loopTime = Date.now();

    if (!this.resizeConfirmed) {

      if (loopTime - this.uploadStarted > 3000) {
        // abandon
        clearInterval(this.uploadInterval);
        this.isUploading = false;
        this.isUploaded = false;
        this.ui.download.hide();

        this.update();
      }

      // render progress
      var c = this.ui.download[0];
  		var ctx = c.getContext("2d");

      // keep width updated
      var w = this.ui.download.width();
      ctx.canvas.width = w;
      var h = this.ui.download.height();

      ctx.fillStyle = '#f0a050';
  		ctx.fillRect(0,0,w,h);

      return;
    }

    // check status and send blocks if we have capacity
    var requested = 0;
    for (var i=0; i<this.numBlocks; i++) {
      if (requested > 4) break;

      if (!this.blocks[i].error && !this.blocks[i].written) {
        var doRequest = false;
        if (this.blocks[i].sent) {
          requested++;
          // check timer
          if (loopTime > this.blocks[i].sentTime + 2000) {
            // re-request the block
            doRequest = true;
          }
        } else {
          // request the block
          doRequest = true;
          requested++;
        }
        if (doRequest) {
          this.blocks[i].sent = true;
          this.blocks[i].sentTime = loopTime;
          this.sendFSWriteRequest(this.id, this.blocks[i].offset);
        }
      }
    }

    // render progress
    var c = this.ui.download[0];
		var ctx = c.getContext("2d");

    // keep width updated
    var w = this.ui.download.width();
    ctx.canvas.width = w;
    var h = this.ui.download.height();

    ctx.fillStyle = '#343a40';
		ctx.fillRect(0,0,w,h);

    var bw = w / this.numBlocks;
    var progress = 0;
    for (var i=0; i<this.numBlocks; i++) {
      var x1 = w * (i/(this.numBlocks));

      if (this.blocks[i].error) {
        ctx.fillStyle = '#f55';
        ctx.fillRect(x1,0,bw,h);
      }  else if (this.blocks[i].written) {
        ctx.fillStyle = '#5f5';
        ctx.fillRect(x1,0,bw,h);
        progress++;
      } else if (this.blocks[i].sent) {
        var age = 1 - (loopTime - this.blocks[i].sentTime)/2000;

        ctx.fillStyle = 'rgba(255,190,50, '+(age).toFixed(2)+')';
        ctx.fillRect(x1,0,bw,h);
      }
    }

    var complete = progress == this.numBlocks;

    if (complete) {
      clearInterval(this.uploadInterval);
      this.isUploading = false;
      this.isUploaded = true;
      this.ui.download.hide();

      this.update();

      // inform manager upload is complete
      this.manager.onUploadComplete(this);
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

    this.root = new DroneFSEntry(this, this.node.state.socket, this.node.id, null, '/', true, this.cuiFilesOnNodeFiles);

    this.selectedEntry = null;
  }


  onFSEntryClick(entry) {
    this.root.select(entry);
    this.selectedEntry = entry;

    if (entry.isDir) {
      this.cuiGetFileBut.hide();
    } else {
      this.cuiGetFileBut.show();
    }
  }


  onFSEntryDblClick(entry) {
    // select
    this.onFSEntryClick(entry);
    // and edit
    this.loadFileFromNode();
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
    this.cuiFilesOnNode = $('<div class="filePane"></div>');
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
      var contents = this.aceEditor.session.getValue();

      // convert to buffer
      var buffer = new Uint8Array(contents.length);
      for (var i=0; i<buffer.length; i++) {
        buffer[i] = contents.charCodeAt(i);
      }

      this.selectedEntry.upload(buffer);
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
    });


    this.node.state.socket.on('fs.read.response', (data)=>{
      // see if it's for us
      if (data.node != this.node.id) return;

      // hydrate
      data.payload = new DMFS.DroneMeshFSReadResponse(data.payload);

      console.log('fs.read.response: ' + data.node + '=>' + data.payload.toString());

      // pass to root to handle
      this.root.handleReadResponse(data.payload);
    });


    this.node.state.socket.on('fs.resize.response', (data)=>{
      // see if it's for us
      if (data.node != this.node.id) return;

      // hydrate
      data.payload = new DMFS.DroneMeshFSResizeResponse(data.payload);

      console.log('fs.resize.response: ' + data.node + '=>' + data.payload.toString());

      // pass to root to handle
      this.root.handleResizeResponse(data.payload);
    });


    this.node.state.socket.on('fs.write.response', (data)=>{
      // see if it's for us
      if (data.node != this.node.id) return;

      // hydrate
      data.payload = new DMFS.DroneMeshFSWriteResponse(data.payload);

      console.log('fs.write.response: ' + data.node + '=>' + data.payload.toString());

      // pass to root to handle
      this.root.handleWriteResponse(data.payload);
    });
  }

  update() {
    if (!this.visible) return;

  }

  show() {
    super.show();
    if (!this.root.enumerated) {
      this.root.enumerate();
    }
  }


  resize() {

  }


  getNodeFileList() {
    this.root.enumerate();
  }


  loadFileFromNode() {
    /*
    if (this.selectedEntry.isDownloaded) {
      this.onDownloadComplete(this.selectedEntry);
    } else {
      this.selectedEntry.download();
    }
    */
    this.selectedEntry.download();
  }

  onDownloadComplete(entry) {
    // get data from entry

    var data = '';
    for (var i=0; i<entry.filedata.length; i++) {
      data += String.fromCharCode(entry.filedata[i]);
    }
    this.aceEditor.session.setValue(data,-1);

    this.cuiEditorNav.removeClass('saved');
    this.cuiEditorNav.removeClass('error');

    this.cuiEditorBlock.show();
    this.cuiEditorTitle.html(entry.fullpath);
    this.cuiEditorSaveBut.show();

    this.analyseFile();
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
