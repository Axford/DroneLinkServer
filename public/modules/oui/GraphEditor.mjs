import loadStylesheet from "../loadStylesheet.js";
import * as DLM from "../droneLinkMsg.mjs";

loadStylesheet("./css/modules/oui/GraphEditor.css");

import moduleInfo from "/moduleInfo.json" assert { type: "json" };

import GraphManager from "./GraphManager.mjs";
import DroneConfigParser from "../DroneConfigParser.mjs";

function decimalToHex(d, padding) {
  var hex = Number(d).toString(16);
  padding =
    typeof padding === "undefined" || padding === null
      ? (padding = 2)
      : padding;

  while (hex.length < padding) {
    hex = "0" + hex;
  }

  return hex;
}

export default class GraphEditor {
  constructor(node) {
    this.node = node;
    this.visible = false;
    this.built = false;

    this.config = {};

    this.parser = new DroneConfigParser();

    this.ui = {};
    this.callbacks = {}; // each key is an event type, values are an array of callback functions
  }

  on(name, cb) {
    if (!this.callbacks.hasOwnProperty(name)) {
      this.callbacks[name] = [];
    }
    this.callbacks[name].push(cb);
  }

  trigger(name, param) {
    if (this.callbacks[name]) {
      this.callbacks[name].forEach((cb) => {
        cb(param);
      });
    }
  }

  build() {
    var me = this;

    // script editor block
    this.ui.panel = $('<div class="graphEditorPanel"></div>');

    // watch for resizing
    let resizeObserver = new ResizeObserver(() => {
        this.gm.resize();
    });
    resizeObserver.observe(this.ui.panel[0]);

    // append to body for absolute positioning
    $(document.body).prepend(this.ui.panel);

    this.ui.panel
      .resizable({
        resize: () => {
          //this.gm.resize();
        },
        stop: () => {
          //this.gm.resize();
        },
      })
      .draggable({ handle: ".graphEditorTitle" });

    // add a close button
    this.ui.closeBtn = $(
      '<button type="button" class="close" aria-label="Close"><span aria-hidden="true">&times;</span></button>'
    );
    this.ui.closeBtn.on("click", () => {
      me.hide();
    });
    this.ui.panel.append(this.ui.closeBtn);

    // add title area / drag handle
    this.ui.title = $(
      '<div class="graphEditorTitle">Configuration Graph</div>'
    );
    this.ui.panel.append(this.ui.title);

    // add a nav bar
    this.ui.navbar = $('<div class="mb-2"></div>');
    this.ui.panel.append(this.ui.navbar);

    // add flyout button
    this.ui.flyoutBtn = $(
      '<button type="button" class="btn btn-primary mr-3"><i class="fas fa-plus-circle"></i> Module</button>'
    );
    this.ui.flyoutBtn.on("click", () => {
      this.ui.flyoutContainer.toggle();
    });
    this.ui.navbar.append(this.ui.flyoutBtn);

    // detect I2C button
    this.ui.detectI2CBtn = $(
      '<button type="button" class="btn btn-primary mr-3">Detect I2C Devices</button>'
    );
    this.ui.detectI2CBtn.on("click", () => {
      me.detectI2CDevices();
    });
    this.ui.navbar.append(this.ui.detectI2CBtn);

    // add a generate button
    this.ui.generateBtn = $(
      '<button type="button" class="btn btn-success">Generate Config</button>'
    );
    this.ui.generateBtn.on("click", () => {
      // generate config script
      var str = this.gm.generateConfig();

      // pass back to host
      this.trigger("generate", str);
    });
    this.ui.navbar.append(this.ui.generateBtn);

    // add a flyout container for new modules
    this.ui.flyoutContainer = $(
      '<div class="graphEditorFlyout" style="height:calc(100% - 100px);"></div>'
    );
    this.ui.flyoutContainer.hide();
    this.ui.panel.append(this.ui.flyoutContainer);

    this.buildFlyout();

    // add a container for the graph canvas
    this.ui.container = $(
      '<div style="width:100%; height:calc(100% - 66px);"></div>'
    );
    this.ui.panel.append(this.ui.container);

    this.gm = new GraphManager(this, this.ui.container);

    this.built = true;
  }

  show() {
    if (!this.built) this.build();
    if (this.visible) return;
    this.visible = true;
    this.ui.panel.show();
    this.gm.show();
  }

  hide() {
    if (!this.visible) return;
    this.visible = false;
    this.ui.panel.hide();
    this.gm.hide();
  }

  removeBlock(block) {
    if (block.channel == 0) return;  // can't delete Node block

    // remove from config
    delete this.config.modules[block.channel];
  }

  parseConfig(str) {
    this.config = this.parser.parse(str);

    console.log(this.config);

    // clear and instantiate blocks
    this.gm.clear();

    // create dummy block for the overall node config
    this.config.modules[0] = {
      id: 0,
      type: "Node",
      params: {
        0: {
          address: 0,
          configured: true,
          description: "Node ID",
          name: "node",
          numValues: 1,
          values: [this.config.id.toString()],
          published: false,
          type: "u8",
          writeable: true,
        },
      },
    };

    this.gm.nodeId = this.config.id;

    for (const id in this.config.modules) {
      this.gm.addBlock(this.config.modules[id]);
    }

    // now resolve addreses
    this.gm.resolveAddresses();
  }

  detectI2CDevices() {
    var me = this;
    var url = "http://" + this.node.ipAddress + "/i2c";
    $.getJSON(url, function (data) {
      var added = 0,
        updated = 0;

      // check each bus
      data.forEach((bus) => {
        if (bus.addresses.length > 0) {
          // if there are devices on the bus
          bus.addresses.forEach((address) => {
            var v = parseInt(address);
            var hexV = "0X" + decimalToHex(v, 2).toUpperCase();

            var matches = [];

            // look for potential module matches
            for (const moduleName in moduleInfo) {
              var m = moduleInfo[moduleName];
              if (m.I2CAddress) {
                // check each entry in array
                m.I2CAddress.forEach((addr) => {
                  if (addr.toUpperCase() == hexV) {
                    matches.push(m);
                  }
                });
              }
            }

            // if we have a single match, then create a suitable block
            if (matches.length == 1) {
              // see if we already have a block of this type, in which case update its bus
              var existingB = me.gm.getBlocksByType(matches[0].type);
              if (existingB.length > 0) {
                // can only do this if we have a single existing block that matches
                if (existingB.length == 1) {
                  var p = existingB[0].getPortByName("bus");
                  if (p) {
                    p.updateValues([bus.channel.toString()]);
                    updated++;
                  }
                }
              } else {
                console.log(bus.channel, matches[0].type);
                var id = me.gm.getNextBlockId();

                // use the parser to flesh out a skeletal block
                var str = "[" + matches[0].type + "=" + id + "]\n";
                str += '  name = "' + matches[0].type + '"\n';
                str += "  bus = " + bus.channel + "\n";
                var newConfig = me.parser.parse(str);

                console.log(newConfig);

                // merge new config into existing
                _.merge(me.config, newConfig);

                // add a block
                me.gm.addBlock(me.config.modules[id]);
                added++;
              }
            }
          });
        }

        me.ui.detectI2CBtn.notify(
          "I2C detection complete, added: " + added + ", updated: " + updated,
          {
            className: "success",
            autoHide: true,
            arrowShow: true,
            position: "bottom",
          }
        );

        me.gm.resolveAddresses();
      });
    });
  }

  buildFlyout() {
    var me = this;
    // populate module list, first place modules into categories
    var categories = {};

    for (const [key, obj] of Object.entries(moduleInfo)) {
      var cat = obj.category && obj.category.length > 0 ? obj.category[0] : "";
      if (cat > "") {
        if (!categories.hasOwnProperty(cat)) categories[cat] = [];
        categories[cat].push(obj);
      }
    }

    // then build UI from the categories
    for (const [key, cat] of Object.entries(categories)) {
      var container = $(
        '<div><div class="grahpEditorCategoryTitle">' + key + "</div></div>"
      );
      var contents = $('<div class="graphEditorCategoryContents"></div>');
      container.append(contents);
      this.ui.flyoutContainer.append(container);

      cat.forEach((m) => {
        var ele = $(
          '<a class="graphEditorNode"><h2>' +
            m.type +
            '</h2><div class="graphEditorNodeDescription">' +
            m.description +
            "</div></a>"
        );

        ele.on("click", () => {
          var id = me.gm.getNextBlockId();

          // use the parser to flesh out a skeletal block
          var newConfig = this.parser.parse(
            "[" + m.type + "=" + id + ']\n  name = "' + m.type + '"'
          );

          console.log(id, newConfig);

          // merge new config into existing
          _.merge(this.config, newConfig);

          // add a block
          this.gm.addBlock(this.config.modules[id]);

          // check for default wiring and initialise wire objects
          this.gm.resolveAddresses();
        });

        contents.append(ele);
      });
    }

    // sort categories
    var items = this.ui.flyoutContainer.children().sort((a, b) => {
      return $(a).first().text() < $(b).first().text() ? -1 : 1;
    });
    this.ui.flyoutContainer.append(items);
  }
}
