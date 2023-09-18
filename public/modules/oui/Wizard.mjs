import loadStylesheet from "../loadStylesheet.js";
import * as DLM from "../droneLinkMsg.mjs";

loadStylesheet("./css/modules/oui/Wizard.css");

import moduleInfo from "/moduleInfo.json" assert { type: "json" };

import {
  getStorage,
  ref,
  uploadBytesResumable,
  listAll,
  getBytes,
} from "https://www.gstatic.com/firebasejs/9.14.0/firebase-storage.js";

/*
  Input wizard
  Manages the input selection of a specific value, including static values
*/
class InputWizard {
  constructor(mgr, str, container) {
    this.mgr = mgr;
    this.str = str; // will be overwritten by non-literals
    this.container = container;
    this.isLiteral = !str.startsWith("{{");
    this.isComment = false; 
    this.data = {};
    this.hasInput = false;

    if (this.isLiteral) {
        // see if its a comment
        if (str.startsWith(';')) {
            this.isComment = true;
        } else {
            // otherwise parse name = value pair
            var epos = str.indexOf('=');
            this.data = {
                name: str.substring(0,epos).trim(),
                value: str.substring(epos+1, str.length).trim()
            }
        }

    } else {
      // parse JSON object
      var json = str.substring(1, str.length - 1);
      try {
        this.data = JSON.parse(json);
      } catch (e) {
        console.error("Error parsing json data in recipe: " + json);
      }

      // parse data object and update str
      this.updateStr();
    }

    // build UI
    this.ui = {};

    this.ui.widget = $('<div class="inputWidget"></div>');
    this.container.append(this.ui.widget);

    this.updateWidget();

    // build widget UI
    this.buildWidgetUI();
  }

  updateStr() {
    if (
      this.data.hasOwnProperty("param") &&
      this.data.hasOwnProperty("default")
    ) {
      this.str = this.data.param + " = " + this.data.default;
    }
  }

  isConfigured() {
    return this.isLiteral || this.hasInput;
  }

  toConfigString() {
    return this.str;
  }

  updateWidget() {
    if (this.isConfigured()) {
        this.ui.widget.addClass('configured');
    } else {
        this.ui.widget.removeClass('configured');
    }
  }

  buildWidgetUI() {
    var me = this;
    if (this.data.type == 'char') {
        // generate a form input
        var container = $('<div class="form-group"><label>'+this.data.title+'</label></div>');
        var ele = $('<input class="form-control" type="text" placeholder="">');
        ele.on('change', ()=>{
            var v = ele.val();
            me.str = me.data.param + ' = "' + v + '"'; 
            if (v.length > 0) {
                me.hasInput = true;
                me.updateWidget();
                me.mgr.updateWidget();
            }
        });
        container.append(ele);
        this.ui.widget.append(container);
    } else if (this.isLiteral) {
        this.ui.widget.html(this.str);
    } else {
        // unknown?
        this.ui.widget.html('UNKNOWN TYPE: ' + this.str);
    }
  }
}

/*
  Manages the setup of an indivual module, including the null module that represents the overall node
*/
class ModuleWizard {
  constructor(mgr, str, leftPane, rightPane) {
    var me = this;
    this.mgr = mgr;
    this.leftPane = leftPane;
    this.rightPane = rightPane;
    this.params = [];
    this.name = '';
    this.selected = false;

    // create ui elements
    this.ui = {};

    this.ui.widget = $('<div class="moduleWidget">'+str+'</div>');
    this.ui.widget.on('click', ()=>{
        me.mgr.selectModule(me);
    });
    this.leftPane.append(this.ui.widget);

    // is this the overall node dummy module?
    if (str == '') {
        this.ui.widget.html('Node Settings');
    }

    // container for inputs
    this.ui.inputsContainer = $('<div style="display:none"></div>');
    this.rightPane.append(this.ui.inputsContainer);

    this.typeInput = new InputWizard(this, str, this.ui.inputsContainer);
  }

  parseLine(str) {
    var newInput = new InputWizard(this, str, this.ui.inputsContainer);
    // see if this was our name
    console.log(newInput);
    if (newInput.isLiteral && !newInput.isComment && newInput.data.name == 'name') {
        this.name = newInput.data.value;
        // strip double quotes?
        if (this.name.startsWith('"')) {
            this.name = this.name.substring(1,this.name.length-1);
        }
        this.ui.widget.html(this.name);
    } 
    this.params.push(newInput);
  }

  toConfigString() {
    var res = "";

    // module section
    if (this.typeInput.str != "") {
      res += "[ " + this.typeInput.toConfigString() + " ]\n";
    }

    // params
    this.params.forEach((p) => {
      res += "  " + p.toConfigString() + "\n";
    });

    res += "\n";

    return res;
  }

  isConfigured() {
    var res = true;
    res = res && this.typeInput.isConfigured();
    // check params
    this.params.forEach((p) => {
      res = res && p.isConfigured();
    });
    return res;
  }

  updateWidget() {
    if (this.isConfigured()) {
        this.ui.widget.addClass('configured');
    } else {
        this.ui.widget.removeClass('configured');
    }
  }

  select() {
    this.ui.inputsContainer.show();
    this.selected = true;
    this.ui.widget.addClass('selected');
  }

  blur() {
    this.ui.inputsContainer.hide();
    this.selected = false;
    this.ui.widget.removeClass('selected');
  }
}

/*
  Manages the overall configuration wizard for a node
*/
export default class Wizard {
  constructor(node, storage) {
    this.node = node;
    this.storage = storage;
    this.visible = false;
    this.built = false;

    this.rawRecipe = "";

    // list of ModuleWizard
    this.modules = [];

    this.ui = {};
  }

  build() {
    var me = this;

    // script editor block
    this.ui.panel = $('<div class="wizardPanel"></div>');

    // append to body for absolute positioning
    $(document.body).prepend(this.ui.panel);

    this.ui.panel.resizable().draggable({ handle: ".wizardTitle" });

    // add a close button
    this.ui.closeBtn = $(
      '<button type="button" class="close" aria-label="Close"><span aria-hidden="true">&times;</span></button>'
    );
    this.ui.closeBtn.on("click", () => {
      me.hide();
    });
    this.ui.panel.append(this.ui.closeBtn);

    // add title area / drag handle
    this.ui.title = $('<div class="wizardTitle">Configuration Wizard</div>');
    this.ui.panel.append(this.ui.title);

    // add a recipe selection drop-down
    var recipeSelectContainer = $(
      '<div class="form-group"><label class="text-light">Select a Recipe</label></div>'
    );
    this.ui.recipeSelect = $('<select class="form-control" >');
    recipeSelectContainer.append(this.ui.recipeSelect);
    this.ui.panel.append(recipeSelectContainer);

    this.loadRecipes();

    // add a load recipe button
    this.ui.loadRecipeBtn = $(
      '<button class="btn btn-primary">Load Recipe</button>'
    );
    this.ui.loadRecipeBtn.on("click", () => {
      me.loadSelectedRecipe();
    });
    this.ui.panel.append(this.ui.loadRecipeBtn);

    // add a generate config button
    this.ui.generateConfigBtn = $(
      '<button class="btn btn-primary ml-3">Generate Config</button>'
    );
    this.ui.generateConfigBtn.on("click", () => {
      me.generateConfig();
    });
    this.ui.panel.append(this.ui.generateConfigBtn);

    // setup panes for modules and inputs
    var row = $('<div class="row mt-5"></div>');
    this.ui.panel.append(row);

    this.ui.leftPane = $('<div class="col-sm-4"></div>');
    row.append(this.ui.leftPane);

    this.ui.rightPane = $('<div class="col-sm-8"></div>');
    row.append(this.ui.rightPane);

    this.built = true;
  }

  show() {
    if (!this.built) this.build();
    if (this.visible) return;
    this.visible = true;
    this.ui.panel.show();
  }

  hide() {
    if (!this.visible) return;
    this.visible = false;
    this.ui.panel.hide();
  }

  selectModule(module) {
    console.log(module);
    this.modules.forEach((m) => {
        if (m == module) {
            m.select();
        } else {
            m.blur();
        }
    });
  }

  async loadRecipes() {
    var me = this;

    // clear selection
    me.ui.recipeSelect.empty();

    const listRef = ref(me.storage, "recipes");

    listAll(listRef)
      .then((res) => {
        res.items.forEach((itemRef) => {
          var op = $(
            '<option value="' + itemRef.name + '">' + itemRef.name + "</option>"
          );
          me.ui.recipeSelect.append(op);
        });
      })
      .catch((error) => {
        // Uh-oh, an error occurred!
        console.error(error);
      });
  }

  loadSelectedRecipe() {
    var me = this;
    // get selected recipe
    var filename = "recipes/" + this.ui.recipeSelect.val();

    const docRef = ref(this.storage, filename);

    getBytes(docRef)
      .then((buffer) => {
        const view = new Uint8Array(buffer);

        // convert buffer to string
        me.rawRecipe = "";
        for (var i = 0; i < view.length; i++) {
          me.rawRecipe += String.fromCharCode(view[i]);
        }

        // parse rawRecipe
        me.parseRecipe();
      })
      .catch((error) => {
        // Uh-oh, an error occurred!
        console.error(error);
      });
  }

  parseRecipe() {
    if (this.rawRecipe == "") return;

    // clear
    this.modules = [];

    // setup syntax parser
    var module = new ModuleWizard(this, "", this.ui.leftPane, this.ui.rightPane);
    this.modules.push(module);

    // parse rawRecipe into lines
    var lines = this.rawRecipe.split("\n");

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();

      if (line.length > 0) {
        if (line[0] == "[") {
          // new section
          // check ends with a ]
          if (line[line.length - 1] == "]") {
            // instance a new module
            var module = new ModuleWizard(this, line.substring(1, line.length - 1), this.ui.leftPane, this.ui.rightPane);
            this.modules.push(module);
          } else {
            // error, no closing bracket
          }
        } else {
          // should be a regular name = value, possibly quoted
          // pass to module to deal with
          // will include comments
          module.parseLine(line);
        }
      }
    }

    // update widgets now config fully loaded
    this.modules.forEach((m) => {
        m.updateWidget();
      });
  }

  generateConfig() {
    var s = "";
    this.modules.forEach((m) => {
      if (m.isConfigured()) s += m.toConfigString();
    });
    this.node.displayNewConfig(s);
  }
}
