import loadStylesheet from "./loadStylesheet.js";

import {
  getStorage,
  ref,
  uploadBytesResumable,
  listAll,
  getBytes,
} from "https://www.gstatic.com/firebasejs/9.14.0/firebase-storage.js";

loadStylesheet("./css/uploadManager.css");

class UploadItem {
  constructor(mgr, filename, file, metadata, container, storage) {
    var me = this;
    me.mgr = mgr;
    me.filename = filename;
    me.file = file;
    me.metadata = metadata;
    me.container = container;
    me.storage = storage;

    me.ui = {};

    me.ui.frame = $('<div class="uploadFrame"></div>');
    me.container.append(me.ui.frame);

    me.ui.title = $('<div class="uploadTitle">' + filename + "</div>");
    me.ui.frame.append(me.ui.title);

    me.ui.status = $('<div class="uploadTitle"></div>"');
    me.ui.frame.append(me.ui.status);

    me.ui.retryBtn = $('<button class="btn btn-sm btn-danger" style="display:none">Retry</button>"');
    me.ui.retryBtn.on('click', ()=>{
        me.startUpload();
    });
    me.ui.frame.append(me.ui.retryBtn);

    me.setState("Pending");

    // initiate upload
    this.startUpload();
  }


  setState(state) {
    var me = this;
    this.state = state;

    if (state == 'Complete') {
        me.ui.frame.css('background-color', '#5f5');
        me.ui.frame.css('color', '#000');
    } else if (state == 'Error') {
        me.ui.frame.css('background-color', '#f55');
    } else {
        me.ui.frame.css('background-color', 'inherit');
    }

    this.ui.status.html(this.state);
  }


  startUpload() {
    var me = this;
    if (me.state == 'Uploading') return;

    me.setState("Uploading");

    me.ui.retryBtn.hide();

    const storageRef = ref(this.storage, this.filename);

    const uploadTask = uploadBytesResumable(
      storageRef,
      this.file,
      this.metadata
    );

    // Listen for state changes, errors, and completion of the upload.
    uploadTask.on(
      "state_changed",
      (snapshot) => {
        // Get task progress, including the number of bytes uploaded and the total number of bytes to be uploaded
        const progress =
          (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        console.log("Upload is " + progress + "% done");
        switch (snapshot.state) {
          case "paused":
            console.log("Upload is paused");
            break;
          case "running":
            console.log("Upload is running");
            break;
        }
      },
      (error) => {
        // text code in error.code
        me.setState("Error");
        me.ui.retryBtn.show();

        // A full list of error codes is available at
        // https://firebase.google.com/docs/storage/web/handle-errors
        console.error("Error uploading log file: ", error.code);
      },
      () => {
        // Upload completed successfully
        console.log("Uploaded a blob or file!");
        me.setState("Complete");
        me.ui.frame.fadeOut('slow', ()=>{
            me.mgr.uploadComplete(me);
        });
      }
    );
  }


  cleanUp() {
    // remove UI elements
    this.ui.frame.remove();
  }
}

export default class UploadManager {
  constructor(storage, container) {
    var me = this;

    this.storage = storage;
    this.container = container;
    this.panelVisible = false;
    this.ui = {};

    // list of UploadItems
    this.queue = [];

    // build top-nav UI
    this.ui.uploadsBtn = $(
      '<button class="btn btn-sm btn-secondary mt-1">Uploads</button>'
    );
    this.ui.uploadsBtn.on("click", () => {
      me.togglePanel();
    });

    this.container.append(this.ui.uploadsBtn);

    // build flyout panel
    this.ui.panel = $('<div class="uploadsPanel"></div>');
    this.container.append(this.ui.panel);

    this.ui.panelTitle = $('<div class="uploadsPanelTitle">Uploads</div>');
    this.ui.panel.append(this.ui.panelTitle);

    // update positions
    // TODO

    this.updateUI();
  }

  togglePanel() {
    if (this.panelVisible) {
      this.hidePanel();
    } else {
      this.showPanel();
    }
  }

  hidePanel() {
    this.panelVisible = false;
    this.ui.panel.hide();
  }

  showPanel() {
    if (this.queue.length > 0) {
      this.panelVisible = true;
      this.ui.panel.show();
    }
  }

  updateUI() {
    this.ui.uploadsBtn.html(this.queue.length + " Uploads");
  }

  // add file to upload queue (file can be a file or a blob)
  uploadFile(filename, file, metadata = {}) {
    this.queue.push(
      new UploadItem(this, filename, file, metadata, this.ui.panel, this.storage)
    );
    this.showPanel();
    this.updateUI();
  }


  uploadComplete(item) {
    item.cleanUp();

    // remove item from queue
    var index = -1;
    for (var i=0; i<this.queue.length; i++) {
        if (this.queue[i] == item) {
            index = i;
            break;
        }
    }

    if (i > -1) {
        this.queue.splice(index, 1);
    }

    if (this.queue.length == 0) {
        this.hidePanel();
    }

    this.updateUI();
  }
}
