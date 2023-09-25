import Panel from './Panel.mjs';
import loadStylesheet from '../../loadStylesheet.js';

import * as DMFS from '../../DroneMeshFS.mjs';

import { getFirestore,  collection, doc, setDoc, addDoc, getDocs, deleteDoc, query, onSnapshot, where } from "https://www.gstatic.com/firebasejs/9.14.0/firebase-firestore.js";
import { DRONE_MESH_MSG_TYPE_LINK_CHECK_REQUEST } from '../../DroneMeshMsg.mjs';
//import { bgBlue } from 'colors/index.js';

//import moduleInfo from "/moduleInfo.json" assert { type: "json" };
const { default: moduleInfo } = await import("/moduleInfo.json", { assert: { type: "json" } });

import {calculateDistanceBetweenCoordinates} from "../../navMath.mjs";

import Wiring from '../Wiring.mjs';
import Wizard from '../Wizard.mjs';
import GraphEditor from '../GraphEditor.mjs';

loadStylesheet('./css/modules/oui/panels/Configuration.css');


const DRONE_FS_UPLOAD_STATE_NONE       =0;  // no upload initiated, buffer is null
const DRONE_FS_UPLOAD_STATE_WIP        =1;  // upload initiated and in progress
const DRONE_FS_UPLOAD_STATE_COMPLETE   =2; 


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


  findEntryByPath(path) {
    if (this.fullpath == path) {
      return this;
    } else if (this.isDir) {
      // check children
      for (const [id, child] of Object.entries(this.children)) {
        var e = child.findEntryByPath(path);
        if (e != null) return e;
      }
    } else {
      return null;
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


  removeChildren() {
    console.log('fs removeChildren: ' + this.fullpath);
    // remove children
    for (const [id, obj] of Object.entries(this.children)) {
      obj.remove();
    }
    this.children = {};
    this.size = 0;
  }


  remove() {
    console.log('fs remove: ' + this.fullpath);
    // remove children 
    this.removeChildren();

    // remove ui objects
    if (this.ui.container) this.ui.container.remove();
  }


  enumerate(redo) {
    if (this.enumerated && (!redo)) return;

    if (redo && this.enumerated) {
      // delete existing children recursively
      this.removeChildren();
    }

    // get info about self
    this.getNodeFileByPath(this.fullpath);

    this.enumerated = true;
  }


  handleFileResponse(fr) {
    console.log('fs.file.response: path: ', fr.path);

    // check for file not found... and trigger re-enumeration
    if (fr.flags == DMFS.DRONE_MESH_MSG_FS_FLAG_NOT_FOUND) {
      console.log('File not found...  probably just deleted something');
      this.enumerate(true);
      return;
    }
    
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

        console.log('fs.file.response: ',path, this.path);

        // is this about one of our immediate children?
        if (path == this.path) {
          console.log('fs.file.response: its one of our children, id:' + fr.id);

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

    // init filedata to ????
    for (var i=0; i<this.filedata.length; i++) {
      this.filedata[i] = 63;  // ?
    }

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
    } else {
      this.manager.onDownloadProgress(this, progress/this.numBlocks);
    }
  }


  delete() {
    // delete self on node
    var qm = new DMFS.DroneMeshFSFileRequest();
    qm.flags = DMFS.DRONE_MESH_MSG_FS_FLAG_DELETE;
    qm.id = 0;
    qm.path = this.fullpath;

    var data = {
      node: this.nodeId,
      payload: qm.encode()
    };

    console.log('Emitting fs.file.request: ' + qm.toString() );
    this.socket.emit('fs.file.request', data);
  }




}



//--------------------------------------------------------
// ServerFSEntry
//--------------------------------------------------------

class ServerFSEntry {
  constructor(manager, db, nodeId, parent, path, isDir, container) {
    this.manager = manager;
    this.db = db;
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
    this.deleted = false;

    this.contents = ''; // actual file contents

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

    console.log('db.fs.new entry: ['+this.path+'] ['+this.name+']');

    this.ui = {};
    this.ui.container = $('<div class="'+(this.isDir ? 'directory' : 'file')+'"></div>');
    this.container.append(this.ui.container);

    this.ui.header = $('<div class="header"/>');
    this.ui.header.on('click', ()=>{
      this.manager.onServerFSEntryClick(this);
    });
    this.ui.header.on('dblclick', ()=>{
      this.manager.onServerFSEntryDblClick(this);
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


  findEntryByPath(path) {
    if (this.deleted) return null;

    if (this.fullpath == path) {
      return this;
    } else if (this.isDir) {
      // check children
      for (const [id, child] of Object.entries(this.children)) {
        var e = child.findEntryByPath(path);
        if (e != null) return e;
      }
    } else {
      return null;
    }
  }


  select(entry) {
    if (this.deleted) {
      console.error('Attempting to select a deleted entry');
      return;
    }

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
        if (child && !child.deleted) {
          child.select(entry);
        }
      }
    }
  }

  setContents(s) {
    this.contents = s;
    this.size = s.length;
  }


  async getServerFileByPath(path) {
    var me = this;

    if (me.isDir) {
      // query server for files within this directory
      const q = query(
        collection(me.db, "files"), 
        where("node", "==", me.nodeId),
        where("parent", "==", me.fullpath)
      );

      const querySnapshot = await getDocs(q);
      var numDocs = 0;
      querySnapshot.forEach((doc) => {
          // doc.data() is never undefined for query doc snapshots
          var data = doc.data();
          console.log(doc.id, " => ", data);

          // do we need to create a new child?
          if (!this.children.hasOwnProperty(doc.id)) {
            this.children[doc.id] = new ServerFSEntry(this.manager, this.db, this.nodeId, this, data.path, data.isDir, this.ui.children);
            this.children[doc.id].setContents(data.contents);
            this.children[doc.id].id = doc.id;

            this.children[doc.id].update();
          }

          numDocs++;
      });

      // update size
      me.size = numDocs;
      me.update();

    } else {

      // ?

    }
  }


  enumerate() {
    if (this.enumerated) return;

    console.log('Enumerating: ' + this.fullpath);

    // get info about self
    this.getServerFileByPath(this.fullpath);

    this.enumerated = true;
  }


  upload(contents) {
    if (this.isDir) return;

    if (this.deleted ) {
      comnsole.error('Attempting to udpate a deleted file!?');
      return;
    }

    // update firebase
    try {
      var fileInfo = {};
      fileInfo.contents = contents;
      fileInfo.size = contents.length;

      const docRef = doc(this.db, 'files', this.id);
      setDoc(docRef, fileInfo, { merge: true });

      console.log("Firebase, file contents updated: " + this.id);

      this.contents = contents;
      this.size = contents.length;

      this.ui.container.notify("Upload complete",  {
        className: 'success',
        autoHide:false,
        arrowShow:false,
        position:'bottom'
      });

      this.update();
    } catch (e) {
      console.error("Firebase, Error updating file contents: ", e);
    }
  }


  async createFromPath(path, contents) {

    // separate parent path from name
    var fp = 0;
    for (var i=path.length-1; i>=0; i--) {
      if (path[i] == '/') {
        fp = i;
        break;
      }
    }

    var parentPath = path.substr(0, fp+1);
    var filename = path.substr(fp+1, path.length);
    var isDir = filename == '';

    // locate parent directory
    var parent = this.findEntryByPath(parentPath);
    
    if (parent != null) {
      console.log('Creating new file within parentPath: ' + parentPath);

      const docRef = await addDoc(collection(this.db, "files"), {
        size: contents.length,
        isDir: isDir,
        path: path,
        node: this.nodeId,
        parent: parentPath,
        contents: contents
      });
      console.log("Document written with ID: ", docRef.id);


      parent.children[docRef.id] = new ServerFSEntry(this.manager, this.db, this.nodeId, parent, path, isDir, parent.ui.children);
      parent.children[docRef.id].setContents(contents);
      parent.children[docRef.id].id = docRef.id;

      parent.children[docRef.id].update();

    } else {
      console.error('No matching parent path: ['+ parentPath +']');
    }
  }


  async delete() {

    if (this.isDir) {
      console.error('Unable to delete directories');
    }

    this.deleted = true;

    // remove from server
    await deleteDoc(doc(this.db, "files", this.id));

    // clear selection
    if (this.isSelected) this.ui.header.removeClass('selected');
    this.isSelected = false;

    // remove ui container and child objects
    this.ui.container.remove();

    // re-enumerate parent
    this.parent.enumerate();
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

    // -- marker trail --
    this.node.markerTrailName = 'markerTrail' + this.node.id;
    this.node.markerTrail = { "type": "LineString", "coordinates": [  ] };
    this.node.map.addSource(this.node.markerTrailName, { type: 'geojson', lineMetrics: true, data: this.node.markerTrail });
    this.node.map.addLayer({
      'id': this.node.markerTrailName,
      'type': 'line',
      'source': this.node.markerTrailName,
      'paint': {
        'line-color': '#88f',
        'line-opacity': 0.4,
        'line-width': 2,
        'line-dasharray': [2,2]
      }
    });

    this.wiring = new Wiring(node);

    this.wizard = new Wizard(this, node.storage);

    this.graphEditor = new GraphEditor(node);
    this.graphEditor.on('generate', (str)=>{
      this.setEditorContents(str, '/config.ini');
    });

    this.build();

    this.socket = this.node.state.socket;

    this.root = new DroneFSEntry(this, this.node.state.socket, this.node.id, null, '/', true, this.cuiFilesOnNodeFiles);

    this.serverRoot = new ServerFSEntry(this, this.node.state.db, this.node.id, null, '/', true, this.cuiFilesOnServerFiles);

    this.selectedEntry = null;
    this.selectedServerEntry = null;

    // for upload to node mgmt
    this.uploadSize = 0;
    this.uploadBlocks = [];
    this.numUploadBlocks = 0;
    this.uploading = false;
    this.uploadState = 0;  // 0 = pending, 1 = in progress, 2 = waiting for confirmation
    this.uploadStarted = 0; // time
    this.uploadData = null;
    this.uploadPath = '';
  }


  onFSEntryClick(entry) {
    this.root.select(entry);
    this.selectedEntry = entry;

    if (entry.isDir) {
      this.cuiDeleteNodeFileBut.hide();
    } else {
      this.cuiDeleteNodeFileBut.show();
    }
  }


  onFSEntryDblClick(entry) {
    // select
    this.onFSEntryClick(entry);
    // and edit
    this.loadFileFromNode();
  }


  onServerFSEntryClick(entry) {
    this.serverRoot.select(entry);
    this.selectedServerEntry = entry;

    if (entry.isDir) {
      this.cuiDeleteServerFileBut.hide();
    } else {
      this.cuiDeleteServerFileBut.show();
    }
  }


  onServerFSEntryDblClick(entry) {
    // select
    this.onServerFSEntryClick(entry);
    // and edit
    this.loadFileFromServer();
  }


  build() {
    super.build();

    var me = this;

    // file mgmt block
    this.cuiFileBlock = $('<div class="fileBlock"></div>');
    this.ui.panel.append(this.cuiFileBlock);

    // on server
    // ------------------------------------------------------------------------
    this.cuiFilesOnServer = $('<div class="filePane"></div>');
    this.cuiFileBlock.append(this.cuiFilesOnServer);

    //    title
    this.cuiFilesOnServerTitle = $('<div class="title">Files on Server</div>');
    this.cuiFilesOnServer.append(this.cuiFilesOnServerTitle);

    //    nav
    this.cuiFilesOnServerNav = $('<div class="nav"></div>');
    this.cuiFilesOnServer.append(this.cuiFilesOnServerNav);

    // fetch 
    this.cuiGetServerFileListBut = $('<button class="btn btn-sm btn-primary mr-2">List</button>');
    this.cuiGetServerFileListBut.on('click',()=>{ this.getServerFileList()  });
    this.cuiFilesOnServerNav.append(this.cuiGetServerFileListBut);

    // delete
    this.cuiDeleteServerFileBut = $('<button class="btn btn-sm btn-danger" style="display:none"><i class="fas fa-trash"></i></button>');
    this.cuiDeleteServerFileBut.on('click',()=>{ 
      if (this.selectedServerEntry) this.selectedServerEntry.delete();
      // select root
      this.serverRoot.select(this.serverRoot);
      this.selectedServerEntry = this.serverRoot;
      // hide button
      this.cuiDeleteServerFileBut.hide();
     });
    this.cuiFilesOnServerNav.append(this.cuiDeleteServerFileBut);

    //    filelist
    this.cuiFilesOnServerFiles = $('<div class="files"></div>');
    this.cuiFilesOnServer.append(this.cuiFilesOnServerFiles);


    // on node
    // ------------------------------------------------------------------------
    this.cuiFilesOnNode = $('<div class="filePane"></div>');
    this.cuiFileBlock.append(this.cuiFilesOnNode);

    //    title
    this.cuiFilesOnNodeTitle = $('<div class="title">Files on Node</div>');
    this.cuiFilesOnNode.append(this.cuiFilesOnNodeTitle);

    //    nav
    this.cuiFilesOnNodeNav = $('<div class="nav"></div>');
    this.cuiFilesOnNode.append(this.cuiFilesOnNodeNav);

    this.cuiGetFileListBut = $('<button class="btn btn-sm btn-primary mr-2">List</button>');
    this.cuiGetFileListBut.on('click',()=>{ this.getNodeFileList()  });
    this.cuiFilesOnNodeNav.append(this.cuiGetFileListBut);


    //    filelist
    this.cuiFilesOnNodeFiles = $('<div class="files"></div>');
    this.cuiFilesOnNode.append(this.cuiFilesOnNodeFiles);

    // delete
    this.cuiDeleteNodeFileBut = $('<button class="btn btn-sm btn-danger" style="display:none"><i class="fas fa-trash"></i></button>');
    this.cuiDeleteNodeFileBut.on('click',()=>{ 
      me.deleteFileOnNode();
     });
    this.cuiFilesOnNodeNav.append(this.cuiDeleteNodeFileBut);


    // upload management
    this.cuiUploadToNode = $('<canvas class="upload" height="10" style="display:none;"></canvas>');
    this.cuiFilesOnNode.append(this.cuiUploadToNode);


    // file editor block
    this.cuiEditorBlock = $('<div class="editorBlock" ></div>');
    this.ui.panel.append(this.cuiEditorBlock);

    // ----------------------------------------------------------
    // edtior nav bar
    // --------------
    this.cuiEditorNav = $('<div class="editorNav"></div>');
    this.cuiEditorBlock.append(this.cuiEditorNav);

    // editor title
    this.cuiEditorTitle = $('<input type="text" class="title mr-5" style="flex-grow:2"></input>');
    this.cuiEditorNav.append(this.cuiEditorTitle);

    // save to server button
    this.cuiEditorSaveToServerBut = $('<button class="btn btn-sm btn-primary mr-2" ><i class="fas fa-save"></i> Server</button>');
    this.cuiEditorSaveToServerBut.on('click',()=>{
      me.saveFileToServer();
    });
    this.cuiEditorNav.append(this.cuiEditorSaveToServerBut);

    // save to node button
    this.cuiEditorSaveToNodeBut = $('<button class="btn btn-sm btn-primary mr-2" ><i class="fas fa-save"></i> Node</button>');
    this.cuiEditorSaveToNodeBut.on('click',()=>{
      me.saveFileToNode();
    });
    this.cuiEditorNav.append(this.cuiEditorSaveToNodeBut);

    // cancel save to node button
    this.cuiEditorCancelSaveToNodeBut = $('<button class="btn btn-sm btn-danger mr-2" style="display:none" >Cancel Save to Node</button>');
    this.cuiEditorCancelSaveToNodeBut.on('click',()=>{
      me.cancelSaveFileToNode();
    });
    this.cuiEditorNav.append(this.cuiEditorCancelSaveToNodeBut);

    // wizard
    this.uiGraphBut = $('<button class="btn btn-sm btn-info mr-2"><i class="fas fa-project-diagram"></i> Configure</button>');
		this.uiGraphBut.on('click', ()=>{
      // display configuration graph editor
      me.graphEditor.show();
      me.graphEditor.parseConfig( me.aceEditor.session.getValue() );
		});
    this.cuiEditorNav.append(this.uiGraphBut);

    // wizard
    this.uiWizardBut = $('<button class="btn btn-sm btn-info mr-2"><i class="fas fa-birthday-cake"></i> Recipes</button>');
		this.uiWizardBut.on('click', ()=>{
      // display configuration wizard
      this.wizard.show();
		});
    this.cuiEditorNav.append(this.uiWizardBut);

    // show wiring
    this.cuiShowWiringBut = $('<button class="btn btn-sm btn-info" ><i class="fas fa-plug"></i> Wiring</button>');
    this.cuiShowWiringBut.on('click',()=>{
      me.wiring.show();
      me.wiring.parseConfig( this.aceEditor.session.getValue() );
    });
    this.cuiEditorNav.append(this.cuiShowWiringBut);

    // ----------------------------------------------------------

    // editor
    this.cuiEditor = $('<div class="editor"></div>');

    ace.config.setModuleUrl('ace/mode/dcode',"/modules/mode-dcode.js");

    this.aceEditor = ace.edit(this.cuiEditor[0], {
        mode: "ace/mode/dcode",
        //mode: "ace/mode/ini",
        theme:'ace/theme/dracula',
        selectionStyle: "text"
    });
    this.aceEditor.on('change', ()=>{
      this.cuiEditorNav.removeClass('saved');
      this.analyseFile();
    });
    this.aceEditor.session.selection.on('changeCursor', (e)=>{
      this.highlightMarker();
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


    this.node.state.socket.on('fs.manage.response', (data)=>{
      // see if it's for us
      if (data.node != this.node.id) return;

      // hydrate
      data.payload = new DMFS.DroneMeshFSManageResponse(data.payload);

      console.log('fs.manage.response: ' + data.node + '=>' + data.payload.toString());

      // pass to root to handle
      this.handleManageResponse(data.payload);
    });


    this.node.state.socket.on('fs.write.response', (data)=>{
      // see if it's for us
      if (data.node != this.node.id) return;

      // hydrate
      data.payload = new DMFS.DroneMeshFSWriteResponse(data.payload);

      console.log('fs.write.response: ' + data.node + '=>' + data.payload.toString());

      // pass to root to handle
      this.handleWriteResponse(data.payload);
    });
  }

  update() {
    if (!this.visible) return;

  }

  show() {
    super.show();
    this.root.enumerate(false);
    this.serverRoot.enumerate();
  }

  hide() {
    super.hide();
    this.wizard.hide();
    this.graphEditor.hide();
  }


  resize() {

  }


  async getServerFileList() {
    this.serverRoot.enumerate();
  }

  getNodeFileList() {
    this.root.enumerate(true);
  }


  loadFileFromNode() {
    this.selectedEntry.download();
  }


  onDownloadProgress(entry, progress) {
    var data = '';
    for (var i=0; i<entry.filedata.length; i++) {
      data += String.fromCharCode(entry.filedata[i]);
    }
    this.aceEditor.session.setValue(data,-1);
  }


  onDownloadComplete(entry) {
    // get data from entry

    var data = '';
    for (var i=0; i<entry.filedata.length; i++) {
      data += String.fromCharCode(entry.filedata[i]);
    }
    this.setEditorContents(data, entry.fullpath);
  }


  loadFileFromServer() {
    var data = this.selectedServerEntry.contents;
    this.setEditorContents(data, this.selectedServerEntry.fullpath);
  }


  setEditorContents(data, fullpath) {
    this.aceEditor.session.setValue(data,-1);

    this.cuiEditorNav.removeClass('saved');
    this.cuiEditorNav.removeClass('error');

    this.cuiEditorBlock.show();
    this.cuiEditorTitle.val(fullpath);
   
    this.analyseFile();
  }


  deleteFileOnNode() {
    if (this.selectedEntry) this.selectedEntry.delete();
    // select root
    this.root.select(this.root);
    this.selectedEntry = this.root;
    // hide button
    this.cuiDeleteNodeFileBut.hide();
  }


  onUploadComplete(entry) {
    console.log('Upload complete');
  }


  cancelSaveFileToNode() {
    // send cancellation
    this.sendManageRequest(DMFS.DRONE_MESH_MSG_FS_FLAG_CANCEL);

    this.uploadState = 3;
  }


  saveFileToNode() {
    if (this.uploading) {
      this.cuiFilesOnNode.notify("Upload already in progress",  {
        className: 'error',
        autoHide:false,
        arrowShow:false,
        position:'bottom'
      });

      return;
    }

    var contents = this.aceEditor.session.getValue();
    this.uploadPath = this.cuiEditorTitle.val();

    // convert to buffer
    this.uploadSize = contents.length;
    this.uploadData = new Uint8Array(this.uploadSize);
    for (var i=0; i<this.uploadData.length; i++) {
      this.uploadData[i] = contents.charCodeAt(i);
    }

    // prep blocks
    this.uploadBlocks = [];
    this.numUploadBlocks = Math.ceil(this.uploadSize / 32);
    for (var i=0; i<this.numUploadBlocks; i++) {
      this.uploadBlocks.push({
        offset: i * 32,
        sent:false,
        sentTime:Date.now(),
        written:false,
        error:false
      });
    }

    this.uploading = true;
    this.uploadState = 0;
    this.uploadStarted = Date.now();

    this.cuiUploadToNode.show();
    this.cuiEditorCancelSaveToNodeBut.show();

    // initiate upload
    this.startUpload();

    this.uploadInterval = setInterval(()=>{
      this.monitorUpload();
    }, 100);
  }


  sendUploadBlock(offset) {
    var qm = new DMFS.DroneMeshFSWriteRequest();
    qm.offset = offset;

    // calc size
    qm.size = Math.min(32, this.uploadSize - offset);

    // copy to data to buffer
    for (var i=0; i<qm.size; i++) {
      qm.data[i] = this.uploadData[offset + i];
    }

    var data = {
      node: this.node.id,
      payload: qm.encode()
    };

    console.log('Emitting fs.write.request: ' + qm.toString() );
    this.socket.emit('fs.write.request', data);
  }


  sendManageRequest(flags) {
    var qm = new DMFS.DroneMeshFSManageRequest();
    qm.flags = flags;
    qm.path = this.uploadPath;
    qm.size = this.uploadSize;

    var data = {
      node: this.node.id,
      payload: qm.encode()
    };

    console.log('Emitting fs.manage.request: ' + qm.toString() );
    this.socket.emit('fs.manage.request', data);
  }

  uploadError(msg) {
    // abort upload
    this.cuiFilesOnNode.notify("Error uploading file: " + msg,  {
      className: 'error',
      autoHide:false,
      arrowShow:false,
      position:'bottom'
    });

    // reset state
    if (this.uploadInterval) clearInterval(this.uploadInterval);
    this.uploading = false;
    this.uploadState = 0;

    console.error('Error uploading file: '  +msg);

    this.cuiUploadToNode.hide();
    this.cuiEditorCancelSaveToNodeBut.hide();
  }


  handleManageResponse(fr) {
    // did we get an error ?
    if (fr.flags == DMFS.DRONE_MESH_MSG_FS_FLAG_ERROR) {
      this.uploadError('General upload error');

    } else {
      // check status
      if (fr.status == DRONE_FS_UPLOAD_STATE_NONE) {
        if (this.uploadState == 0) {
          // if it was in response to a start request, then we failed to allocate memory... 
          this.uploadError('Failed to initiate upload');

        } else if (this.uploadState == 2) {
          // if this was in response to a save operation, then we are done 
          clearInterval(this.uploadInterval);
          this.uploading = false;
          this.uploadState = 0;
          this.cuiUploadToNode.hide();
          this.cuiEditorCancelSaveToNodeBut.hide();

          // re-enumerate node filesystem
          this.getNodeFileList();

          this.cuiFilesOnNode.notify("Upload complete",  {
            className: 'success',
            autoHide:false,
            arrowShow:false,
            position:'bottom'
          });
        } else {
          // cancelled
          this.uploadError('Upload cancelled');
        }

      } else if (fr.status == DRONE_FS_UPLOAD_STATE_WIP) {
        // good to write blocks
        this.uploadState = 1;
      }; 
    }
  }


  handleWriteResponse(fr) {
    var blockIndex = Math.floor(fr.offset / 32);

    // check size
    if (fr.flags == DMFS.DRONE_MESH_MSG_FS_FLAG_SUCCESS) {
      this.uploadBlocks[blockIndex].written = true;

    } else {
      // error retrieving block
      this.uploadBlocks[blockIndex].written = false;
      this.uploadBlocks[blockIndex].error = true;
    }
  }


  startUpload() {
    this.uploadState = 0;  // pending confirmation
    this.sendManageRequest(DMFS.DRONE_MESH_MSG_FS_FLAG_START);
  }


  monitorUpload() {
    if (!this.uploading) return;

    var loopTime = Date.now();

    if (this.uploadState == 1) {
      // check status and send blocks if we have capacity
      var requested = 0;
      for (var i=0; i<this.numUploadBlocks; i++) {
        if (requested > 3) break;  // 4 in progress at a time

        if (!this.uploadBlocks[i].error && !this.uploadBlocks[i].written) {
          var doRequest = false;
          if (this.uploadBlocks[i].sent) {
            requested++;
            // check timer
            if (loopTime > this.uploadBlocks[i].sentTime + 2000) {
              // re-request the block
              doRequest = true;
            }
          } else {
            // request the block
            doRequest = true;
            requested++;
          }
          if (doRequest) {
            this.uploadBlocks[i].sent = true;
            this.uploadBlocks[i].sentTime = loopTime;
            this.sendUploadBlock(this.uploadBlocks[i].offset);
          }
        }
      }
    }


    // render progress
    var c = this.cuiUploadToNode[0];
		var ctx = c.getContext("2d");

    // keep width updated
    var w = this.cuiUploadToNode.width();
    ctx.canvas.width = w;
    var h = this.cuiUploadToNode.height();

    ctx.fillStyle = '#343a40';
		ctx.fillRect(0,0,w,h);

    var bw = w / this.numUploadBlocks;
    var progress = 0;
    for (var i=0; i<this.numUploadBlocks; i++) {
      var x1 = w * (i/(this.numUploadBlocks));

      if (this.uploadBlocks[i].error) {
        ctx.fillStyle = '#f55';
        ctx.fillRect(x1,0,bw,h);
      }  else if (this.uploadBlocks[i].written) {
        ctx.fillStyle = '#5f5';
        ctx.fillRect(x1,0,bw,h);
        progress++;
      } else if (this.uploadBlocks[i].sent) {
        var age = 1 - (loopTime - this.uploadBlocks[i].sentTime)/2000;

        ctx.fillStyle = 'rgba(255,190,50, '+(age).toFixed(2)+')';
        ctx.fillRect(x1,0,bw,h);
      }
    }

    var complete = progress == this.numUploadBlocks;

    if (complete && (this.uploadState != 2)) {
      this.uploadState = 2;  // complete, waiting for confirmation of save to disk

      // send completion packet
      this.sendManageRequest(DMFS.DRONE_MESH_MSG_FS_FLAG_SAVE);
    }
  }


  saveFileToServer() {
    var contents = this.aceEditor.session.getValue();
    var path = this.cuiEditorTitle.val();

    // locate an entry
    var entry = this.serverRoot.findEntryByPath(path)
    if (entry != null) {
      this.serverRoot.select(entry);
      this.selectedServerEntry = entry;
      entry.upload(contents);

    } else {
      // select root
      this.serverRoot.select(this.serverRoot);
      this.selectedServerEntry = this.serverRoot;

      // or create a new one!
      this.serverRoot.createFromPath(path, contents);
    }
  }



  analyseFile() {
    // check filename for which type of file to analyse
    var path = this.cuiEditorTitle.val();
    var ext = path.slice(-3,).toLowerCase();
    if (ext == 'csv') {
      this.analyseCSVFile();
    } else if (ext=='txt') {
      this.analyseDCodeFile();
    } else if (ext=='ini') {
      this.analyseINIFile();
    }
  }


  analyseCSVFile() {
    // analyse contents of file loaded into editor
    // e.g. extract navigation markers
    var sess = this.aceEditor.session;

    this.node.markerTrail.coordinates = [];

    var numLines = sess.getLength();
    var numMarkers = 0;
    var cumLength = 0;
    var lastPoint = [0,0];

    for (var i=1; i<=numLines; i++) {
      var line = sess.getLine(i);

      // analyse line
      if (i>0) {
        var parts = line.split(',');
        
        if (parts.length>=3) {
          var lon = parseFloat(parts[0].trim());
          var lat = parseFloat(parts[1].trim());
          var radius = parseFloat(parts[2].trim());

          // create or update marker
          // -- target marker --
          var el = document.createElement('div');
          el.className = 'scriptMarker';

          //console.log(numMarkers, this.node.scriptMarkers.length, this.node.scriptMarkers);

          if (isNaN(lon) || isNaN(lat)) continue;

          var p1 = [lon, lat];
          if (numMarkers > 0) {
            cumLength += calculateDistanceBetweenCoordinates(lastPoint, p1);
          }
          lastPoint = p1; 

          var lenStr = cumLength > 1000 ? (cumLength/1000).toFixed( cumLength > 10000 ? 0 : 1) + 'km' : cumLength.toFixed(0) + 'm';

          var marker, markerLabel;
          if (numMarkers < this.node.scriptMarkers.length) {
            marker = this.node.scriptMarkers[numMarkers];
            markerLabel = this.node.scriptMarkerLabels[numMarkers];
          } else {
            marker = new mapboxgl.Marker(el)
                .setLngLat([lon,lat])
                .setDraggable(true)
                .addTo(this.node.map);

            marker.on('dragend', (e)=>{
              const lngLat = e.target.getLngLat();

              var newCmd = lngLat.lng.toFixed(12) + ', ' +lngLat.lat.toFixed(12)+ ', '+e.target.targetRadius;
              sess.replace({
                  start: {row: e.target.lineNumber, column: 0},
                  end: {row: e.target.lineNumber, column: Number.MAX_VALUE}
              }, newCmd);

              this.aceEditor.selection.moveCursorTo(e.target.lineNumber, newCmd.length, false);
              this.aceEditor.selection.clearSelection();

            });

            this.node.scriptMarkers.push(marker);

            // label
            // -- marker label --
            var labelEl = document.createElement('div');
            labelEl.className = 'markerLabel';
            labelEl.innerHTML = i + ', ' + lenStr; 
            markerLabel = new mapboxgl.Marker({
              element:labelEl,
              anchor:'left'
            })
                  .setLngLat([lon,lat])
                  .addTo(this.node.map);
            this.node.scriptMarkerLabels.push(markerLabel);
          }

          if (lon && lat) {
            marker.setLngLat([lon,lat]);
            marker.lineNumber = i;
            marker.targetRadius = radius;

            markerLabel.setLngLat([lon,lat]);
            markerLabel.getElement().innerHTML = i + ', ' + lenStr; 

            this.node.markerTrail.coordinates.push([lon,lat]);
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

    // delete redundant labels
    while (numMarkers < this.node.scriptMarkerLabels.length) {
      this.node.scriptMarkerLabels[this.node.scriptMarkerLabels.length-1].remove();
      this.node.scriptMarkerLabels.pop();
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

    var src = this.node.map.getSource(this.node.markerTrailName);
    if (src) src.setData(this.node.markerTrail);
  }


  analyseDCodeFile() {
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


  parseININameValue(line) {
    var res = {
      name: '',
      value:'',
      error:''
    };

    var inString = false,
        inValue = false,
        buf = '';

    for (var i=0; i<line.length; i++) {
      var c = line[i];
      if (inString) {
        if (c == '"') {
          // end of string
          inString = false;
        } else {
          buf += c;
        }
      } else {
        if (c == '"') {
          // check this is the first character we've seen
          if (buf.length >0) {
            res.error = 'text encountered before quotation marks';
            break;
          } else {
            inString =true;
          }
        } else if (c == '=') {
          if (!inValue) {
            // store name
            if (buf.length > 0) {
              res.name = buf;
              buf = '';
            } else {
              res.error = 'Undefined parameter name';
              break;
            }
            inValue = true;
          } else {
            res.error = 'unexpected equals character';
            break;
          }
        } else {
          // skip whitespace, add anything else to buffer
          if (c != ' ' && 
              c != '\t') {
            buf += c;
          }
        }
      }
    }

    // store value
    if (inValue) {
      if (buf.length > 0) {
        res.value = buf;
      } else {
        res.error = 'Undefined parameter value'
      }
    } else {
      res.error = 'Undefined parameter value'
    }

    return res;
  }


  checkValidPubOrSub(moduleName, pName) {
    if (moduleInfo.hasOwnProperty(moduleName)) {
      var m = moduleInfo[moduleName];

      if (m.hasOwnProperty('pub')) {
        // check pubs
        for (var i=0; i<m.pub.length; i++) {
          var p = m.pub[i];
          if (p.name == pName) return true;
        }
      }

      if (m.hasOwnProperty('sub')) {
        // check subs
        for (var i=0; i<m.sub.length; i++) {
          var p = m.sub[i];
          if (p.name == pName) return true;
        }
      }

      // also check inherited properties
      if (m.hasOwnProperty('inherits')) {
        return this.checkValidPubOrSub(m.inherits[0], pName);
      }
    }
    return false;
  }

  checkValidParam(moduleName, pName, pValue) {
    var res = {
      error: ''
    };

    if (moduleInfo.hasOwnProperty(moduleName)) {
      // valid module
      if (pName == 'publish') {
        // check if pValue is a valid list of parameters (pub or sub)
        var parts = pValue.split(',');

        // check each part to see if it's valid
        for (var i=0; i<parts.length; i++) {
          if (!this.checkValidPubOrSub(moduleName, parts[i])) { 
            res.error += parts[i] + ' is an unknown param for this module type; '
          }
        }

      } else {
        // check pName is a valid pub or sub
        if (pName[0] == '$') pName = pName.slice(1);
        if (!this.checkValidPubOrSub(moduleName, pName)) { 
          res.error = 'Uknown param for this module type'
        }

      }

    } else {
      res.error = 'Uknown module type';
    }

    return res;
  }


  analyseINIFile() {
    // analyse contents of config file... check for syntax errors, etc
    var sess = this.aceEditor.session;

    // clear any existing annotations
    sess.clearAnnotations();

    // setup syntax parser
    var nodeId = 0,
        moduleName = '';

    var annotations = [];

    var numLines = sess.getLength();
    var numMarkers = 0;
    for (var i=0; i<numLines; i++) {
      var line = sess.getLine(i).trim();

      if (line.length > 0) {
        if (line[0] == ';') {
          // comment, so skip
        } else if (line[0] == '[') {
          // new section 
          // check ends with a ] 
          if (line[line.length-1] == ']') {
            // check we've had a valid node id
            if (nodeId == 0) {
              annotations.push({
                  row: 0,
                  column: 0,
                  text: "node ID not defined before first module, e.g. node=1",
                  type: "error"
              });
            }

            // parse
            var nv = this.parseININameValue(line.slice(1,line.length-1));

            if (nv.error != '') {
              annotations.push({
                  row: i,
                  column: 0,
                  text: nv.error,
                  type: "error"
              });
            } else {
              moduleName = nv.name;

              // see if its a valid module name
              if (!moduleInfo.hasOwnProperty(moduleName)) {
                annotations.push({
                    row: i,
                    column: 0,
                    text: "Unknown module type",
                    type: "error"
                });
              }

            }

          } else {
            // error, no closing bracket
            annotations.push({
                row: i,
                column: 0,
                text: "No closing ] bracket",
                type: "error"
            });
          }
        } else {
          // should be a regular name = value, possibly quoted
          var nv = this.parseININameValue(line);

          if (nv.error != '') {
            annotations.push({
                row: i,
                column: 0,
                text: nv.error,
                type: "error"
            });
          } else {
            if (moduleName == '') {
              //console.log('parsed param: '+ nv.name + '=' + nv.value);
              // is this the nodeId?
              if (nv.name == 'node') {
                nodeId = parseInt(nv.value);
              }
            } else {
              // see if its a valid param name
              var pv = this.checkValidParam(moduleName, nv.name, nv.value);

              if (pv.error != '') {
                annotations.push({
                    row: i,
                    column: 0,
                    text: pv.error,
                    type: "error"
                });
              }
            }
          }
        }
      }
      
    }

    sess.setAnnotations(annotations);
  }
  

  insertGoto(coord) {
    // ignore if not on configuration tab
    if (!this.visible) return;

    // ignore if editor not visible
    if (!this.cuiEditorBlock.is(":visible")) return;

    var cursor = this.aceEditor.getCursorPosition();
    var radius = 5;
    if (this.node.scriptMarkers.length > 0) {
      radius = this.node.scriptMarkers[this.node.scriptMarkers.length-1].targetRadius;
    }

    var path = this.cuiEditorTitle.val();
    var ext = path.slice(-3,).toLowerCase();
    var newCmd = '';
    if (ext == 'csv') {
      newCmd = coord.lng.toFixed(12)+', '+coord.lat.toFixed(12) + ', ' + radius.toFixed(1) + '\n';
    } else if (ext=='txt') {
      newCmd = '_Nav.goto '+coord.lng.toFixed(12)+' '+coord.lat.toFixed(12) + ' ' + radius.toFixed(1) + '\n';
    }

     
    //console.log('inserting:', newCmd, cursor.row);
    this.aceEditor.session.insert(cursor, newCmd);
  }


  highlightMarker() {
    var path = this.cuiEditorTitle.val();
    var ext = path.slice(-3,).toLowerCase();
    if (ext == 'csv') {
      this.highlightCSVMarker();
    } else if (ext=='txt') {
      this.highlightDCodeMarker();
    }
  }


  highlightCSVMarker() {
    var cursor = this.aceEditor.selection.getCursor();
    // get line for cursor
    var line = this.aceEditor.session.getLine(cursor.row);
    //console.log('line:', line);
    if (cursor.row > 0) {
      var parts = line.split(',');
      if (parts.length >=3 ) {
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
  }


  highlightDCodeMarker() {

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
  }

}
