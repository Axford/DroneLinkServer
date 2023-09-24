import loadStylesheet from "../loadStylesheet.js";
import * as DLM from "../droneLinkMsg.mjs";

loadStylesheet("./css/modules/oui/GraphEditor.css");

import moduleInfo from "/moduleInfo.json" assert { type: "json" };

import GraphManager from "./GraphManager.mjs";
import DroneConfigParser from "../DroneConfigParser.mjs";

export default class GraphEditor {
  constructor() {
    this.visible = false;
    this.built = false;

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

    // append to body for absolute positioning
    $(document.body).prepend(this.ui.panel);

    this.ui.panel
      .resizable({
        resize: () => {
          this.gm.resize();
        },
        stop: () => {
          this.gm.resize();
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

    // add a generate button
    this.ui.generateBtn = $(
      '<button type="button" class="btn btn-success">Generate Config</button>'
    );
    this.ui.generateBtn.on("click", () => {
      // generate config script
      var str = this.gm.generateConfig();

      // pass back to host
      this.trigger('generate', str);
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

    this.gm = new GraphManager(this.ui.container);

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


  buildFlyout() {
    var me = this;
    // populate module list
    for (const [key, obj] of Object.entries(moduleInfo)) {
        var ele = $('<a class="graphEditorNode"><h2>'+obj.type+'</h2><div class="graphEditorNodeDescription">'+obj.description+'</div></a>');

        ele.on('click', ()=>{
            var id = me.gm.getNextBlockId();

            // use the parser to flesh out a skeletal block
            var newConfig = this.parser.parse('[' + obj.type + '=' + id + ']\n  name = "'+obj.type+'"');

            console.log(id, newConfig);

            // merge new config into existing
            _.merge(this.config, newConfig);

            // add a block
            this.gm.addBlock(this.config.modules[id]);
        });

        this.ui.flyoutContainer.append(ele);
    }
  }
}
