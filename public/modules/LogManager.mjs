import loadStylesheet from "./loadStylesheet.js";

import { format } from "https://cdn.skypack.dev/date-fns";

import {
  getStorage,
  ref,
  uploadBytesResumable,
  listAll,
  getBytes,
} from "https://www.gstatic.com/firebasejs/9.14.0/firebase-storage.js";

loadStylesheet("./css/logManager.css");

class LogItem {
  constructor(mgr, name, fileDate, container) {
    var me = this;
    me.mgr = mgr;
    me.name = name;
    me.fileDate = fileDate;
    me.container = container;
    me.selected = false;

    me.title = format(fileDate, "HH:mm:ss");

    me.ui = {};

    me.ui.link = $('<a class="logItemLink">' + me.title + "</a>");
    me.ui.link.prop("fileDate", fileDate);
    me.ui.link.on("click", () => {
      me.mgr.selectLog(me);
    });
    me.container.append(me.ui.link);
  }

  select() {
    if (this.selected) return;
    this.selected = true;
    this.ui.link.addClass("selected");
  }

  deselect() {
    if (!this.selected) return;
    this.selected = false;
    this.ui.link.removeClass("selected");
  }
}

class LogCollection {
  constructor(mgr, index, fileDate) {
    var me = this;
    me.mgr = mgr;
    me.index = index;

    me.ui = {};

    // LogItems indexed on filename
    me.logItems = {};
    me.numLogItems = 0;
    me.selected = null;

    me.title = format(fileDate, "EEE do LLL yyyy");

    me.ui.link = $('<a class="logCollectionLink">' + me.title + "</a>");
    me.ui.link.prop("index", me.index);
    me.ui.link.prop("fileDate", fileDate);
    me.ui.link.on("click", () => {
      me.mgr.selectCollection(me.index);
    });
    me.mgr.ui.panelLeft.append(me.ui.link);

    me.ui.linkBadge = $(
      '<span class="badge float-right bg-secondary">0</span>'
    );
    me.ui.link.append(me.ui.linkBadge);

    me.ui.logItems = $('<div class="logItems"></div>');
    me.mgr.ui.panelRight.append(me.ui.logItems);
  }

  selectFirstLog() {
    if (this.numLogItems == 0) return;

    for (const prop in this.logItems) {
        this.selectLog(this.logItems[prop]);
        return;
      }
  }

  selectLog(item) {
    if (item == this.selected) return;

    for (const prop in this.logItems) {
      if (prop == item.name) {
        this.logItems[prop].select();
      } else {
        this.logItems[prop].deselect();
      }
    }

    this.selected = item;
    this.mgr.selectLog(item);
  }

  selectNextLog() {
    if (!this.selected) return false;

    var nextItem = null;
    var found = false;
    for (const prop in this.logItems) {
        if (this.logItems[prop] == this.selected) {
          found = true;
        } else {
          if (found) {
            nextItem = this.logItems[prop];
            found=false;
            break;
          }
        }
      }

    if (nextItem) {
        this.selectLog(nextItem);
        return true;
    } else {
        return false;
    }
  }

  addLog(name, fileDate) {
    var me = this;
    me.selected = false;

    if (!me.logItems.hasOwnProperty(name)) {
      // or create a new one
      me.logItems[name] = new LogItem(me, name, fileDate, me.ui.logItems);
      me.numLogItems++;
      me.ui.linkBadge.html(me.numLogItems);

      me.ui.logItems.sort((a, b) => {
        a.prop("fileDate") - b.prop("fileDate");
      });
    }
    var item = me.logItems[name];
  }

  select() {
    if (this.selected) return;
    this.selected = true;
    this.ui.link.addClass("selected");
    this.ui.logItems.show();
  }

  deselect() {
    if (!this.selected) return;
    this.selected = false;
    this.ui.link.removeClass("selected");
    this.ui.logItems.hide();

    // deselect logitems
    this.selected = null;
    for (const prop in this.logItems) {
      this.logItems[prop].deselect();
    }
  }
}

export default class LogManager {
  constructor(storage, container) {
    var me = this;

    this.storage = storage;
    this.container = container;
    this.panelVisible = false;
    this.ui = {};

    // callbacks
    this.cb = {};

    // loaded LogCollection objects indexed by dayname
    me.logCollections = {};

    me.selected = null;

    // build top-nav UI
    this.ui.logBtn = $(
      '<button id="logSelect" type="button" class="btn btn-sm btn-secondary">Select Log <span class="caret"></span></button>'
    );
    this.ui.logBtn.on("click", () => {
      me.togglePanel();
    });

    this.container.append(this.ui.logBtn);

    // build flyout panel
    this.ui.panel = $('<div class="logPanel"></div>');
    this.container.append(this.ui.panel);

    this.ui.panelRow = $('<div class="row"></div>');
    this.ui.panel.append(this.ui.panelRow);

    this.ui.panelLeft = $('<div class="col-7"></div>');
    this.ui.panelRow.append(this.ui.panelLeft);

    this.ui.panelRight = $('<div class="col-5"></div>');
    this.ui.panelRow.append(this.ui.panelRight);
  }

  on(event, cb) {
    this.cb[event] = cb;
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
    this.panelVisible = true;
    this.ui.panel.show();

    var offset = this.ui.logBtn.offset();
    this.ui.panel.offset({
      top: offset.top + this.ui.logBtn.outerHeight() + 6,
      left:
        offset.left + this.ui.logBtn.outerWidth() - this.ui.panel.outerWidth(),
    });
  }

  selectLog(item) {
    this.loadLog(item);
  }

  selectNextLog() {
    if (!this.selected) return;

    if (!this.selected.selectNextLog()) {
        // select the next collection and the first item in it
        var nextItem = null;
        var found = false;
        for (const prop in this.logCollections) {
            if (prop == this.selected.index) {
                found = true;
            } else {
            if (found) {
                nextItem = prop;
                found=false;
                break;
            }
            }
        }

        if (nextItem) {
            this.selectCollection(nextItem);

            // select first item
            if (this.selected) this.selected.selectFirstLog();
            
        } else {
            return;
        }
    }
  }

  selectCollection(index) {
    if (this.logCollections[index] == this.selected) return;

    for (const prop in this.logCollections) {
      if (prop == index) {
        this.logCollections[prop].select();
      } else {
        this.logCollections[prop].deselect();
      }
    }

    this.selected = this.logCollections[index];
  }

  addLog(name) {
    var me = this;
    console.log(name);
    var dateStr = name.slice(0, -4);
    var fileDate = new Date(dateStr);

    //var niceName = fileDate.toString().slice(0,24);

    var index = fileDate.yyyymmdd();

    // see if we have an existing collection to add to...
    if (!me.logCollections.hasOwnProperty(index)) {
      // or create a new one
      me.logCollections[index] = new LogCollection(me, index, fileDate);
    }
    var collection = me.logCollections[index];

    // add new log name to collection
    collection.addLog(name, fileDate);
  }

  async loadLogs() {
    var me = this;

    // clear selection
    $("#logSelect").html("Loading...");

    // Create a reference under which you want to list
    const listRef = ref(me.storage, "logs");

    var dayList = [];

    // Find all the prefixes and items.
    listAll(listRef)
      .then((res) => {
        res.items.forEach((itemRef) => {
          // All the items under listRef.

          me.addLog(itemRef.name);
        });

        me.ui.panelLeft.sort((a, b) => {
          a.prop("fileDate") - b.prop("fileDate");
        });

        me.ui.logBtn.html('Select a log <i class="fas fa-caret-down"></i>');
      })
      .catch((error) => {
        // Uh-oh, an error occurred!
        console.error(error);
      });
  }

  async loadLog(item) {
    var me = this;
    var filename = "logs/" + item.name;
    console.log('loadLog: ' + filename);
    const docRef = ref(this.storage, filename);

    getBytes(docRef)
      .then((buffer) => {
        if (this.cb["logLoaded"]) me.cb["logLoaded"](buffer);

        var title = format(item.fileDate, 'EEE do LLL yyyy > HH:mm:ss');

        me.ui.logBtn.html(title + ' <i class="fas fa-caret-down"></i>');
      })
      .catch((error) => {
        // Uh-oh, an error occurred!
        console.error(error);
      });
  }
}
