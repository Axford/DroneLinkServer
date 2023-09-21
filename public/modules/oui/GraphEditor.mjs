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
    }
  
    build() {
      var me = this;
  
      // script editor block
      this.ui.panel = $('<div class="graphEditorPanel"></div>');
  
      // append to body for absolute positioning
      $(document.body).prepend(this.ui.panel);
  
      this.ui.panel.resizable({
        resize:()=>{
            this.gm.resize();    
        },
        stop:()=>{
            this.gm.resize();
        }
      }).draggable({ handle: ".graphEditorTitle" });
  
      // add a close button
      this.ui.closeBtn = $(
        '<button type="button" class="close" aria-label="Close"><span aria-hidden="true">&times;</span></button>'
      );
      this.ui.closeBtn.on("click", () => {
        me.hide();
      });
      this.ui.panel.append(this.ui.closeBtn);
  
      // add title area / drag handle
      this.ui.title = $('<div class="graphEditorTitle">Configuration Graph</div>');
      this.ui.panel.append(this.ui.title);
  
      // add a container for the graph canvas
      this.ui.container = $('<div style="width:100%; height:calc(100% - 34px);"></div>');
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

        for (const id in this.config.modules) {
            this.gm.addBlock(this.config.modules[id]);            
        }
    }

  }
  