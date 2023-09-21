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
      if (str.startsWith(";")) {
        this.isComment = true;
      } else {
        // otherwise parse name = value pair
        var epos = str.indexOf("=");
        this.data = {
          name: str.substring(0, epos).trim(),
          value: str.substring(epos + 1, str.length).trim(),
        };
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

    this.inputs = [];  // form input elements

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
      this.ui.widget.addClass("configured");
    } else {
      this.ui.widget.removeClass("configured");
    }

    if (this.str == "") {
      this.hide();
    } else {
      this.show();
    }
  }

  show() {
    this.ui.widget.show();
  }

  hide() {
    this.ui.widget.hide();
  }

  buildCharInput() {
    var me = this;
    // generate a form input
    var ele = $('<input class="form-control" type="text" placeholder="">');
    if (this.data.default) {
      ele.val(this.data.default);
      me.gotInput();
    }
    ele.on("change", () => {
      var v = ele.val();
      me.str = me.data.param + ' = "' + v + '"';
      if (v.length > 0) {
        me.gotInput();
      }
    });
    return ele;
  }

  buildIntegerInput() {
    var me = this;
    // generate a form input
    var ele = $('<input class="form-control" type="text" placeholder="">');
    if (this.data.default) {
      ele.val(this.data.default);
      me.gotInput();
    }
    ele.on("change", () => {
      var v = parseInt(ele.val());
      me.str = me.data.param + " = " + v;
      me.gotInput();
    });
    return ele;
  }

  buildFloatInput() {
    var me = this;
    // generate a form input
    var ele = $('<input class="form-control" type="text" placeholder="">');
    if (this.data.default) {
      ele.val(this.data.default);
      me.gotInput();
    }
    ele.on("change", () => {
      var v = parseFloat(ele.val());
      me.str = me.data.param + " = " + v.toFixed(4);
      me.gotInput();
    });
    return ele;
  }

  buildI2CBusInput() {
    var me = this;

    // container
    var container = $('<div></div>');

    // generate a form input
    var ele = $('<select class="form-control" >');
    var op = $('<option value="">-</option>');
    ele.append(op);
    
    for (var i=0; i<8; i++) {
        var op = $('<option value="'+i+'">'+ i +'</option>');
        ele.append(op);
    };

    if (me.data.default !== undefined) {
        ele.val(me.data.default);
        me.gotInput();
    }
    
    ele.on("change", () => {
      var v = ele.val();
      me.str = me.data.param + " = " + v;
      if (v.length > 0) {
        me.gotInput();
      }
    });
    container.append(ele);

    var info = $('<div class="text-muted mt-2"></div>');

    // get i2c info button
    var btn = $('<button class="btn btn-primary mt-2">Autodetect</button>');
    btn.on('click', ()=>{
        // determine the expected i2c address of this module
        var addr = parseInt(me.mgr.modInfo.I2CAddress[0], 16);
        info.html('Looking for address: ' + addr);

        // attempt to fetch latest i2c scan info
        //console.log(me.mgr.mgr.node);
        var node = me.mgr.mgr.node;
        if (!node.ipAddress) {
            $(btn).notify(
                "IP address unknown",
                {
                  className: "error",
                  autoHide: true,
                  arrowShow: false,
                  position: "bottom",
                }
              );
        }
        $.getJSON("http://" + node.ipAddress + "/i2c", function (data) {
            console.log(data);
            var chan = -1;
            data.forEach((channel)=>{
                channel.addresses.forEach((address)=>{
                    if (address == addr) {
                        chan = channel.channel;
                    }
                });
            });
            if (chan > -1) {
                info.html('Found on bus: ' + chan);
                ele.val(chan).trigger('change');
            } else {
                info.html('Could not find a device with address: ' + addr);
            }
        });
    });
    container.append(btn);
    container.append(info);

    return container;
  }

  buildSerialPortInput() {
    var me = this;
    // generate a form input
    var ele = $('<select class="form-control" >');
    var op = $('<option value="">-</option>');
    ele.append(op);
    
    for (var i=0; i<3; i++) {
        var op = $('<option value="'+i+'">'+ i +'</option>');
        ele.append(op);
    };

    if (me.data.default !== undefined) {
        ele.val(me.data.default);
        me.gotInput();
    }
    
    ele.on("change", () => {
      var v = ele.val();
      me.str = me.data.param + " = " + v;
      if (v.length > 0) {
        me.gotInput();
      }
    });
    return ele;
  }

  buildPinsInput() {
    var me = this;

    // container
    var container = $('<div></div>');

    // generate a form inputs for each pin, based on length of capabilities array

    var numPins = me.data.capabilities.length;

    for (var i=0; i<numPins; i++) {
        var ele = $('<select class="form-control" >');

        me.inputs.push(ele);

        var op = $('<option value="">-</option>');
        ele.append(op);
        
        ele.on("change", () => {
            me.onChange();
        });
        container.append(ele);
    }

    var info = $('<div class="text-muted mt-2"></div>');

    // load pin info
    var btn = $('<button class="btn btn-primary mt-2">Scan for Available/Capable Pins</button>');
    btn.on('click', ()=>{
        // determine the expected i2c address of this module
        info.html('Loading pin info...');

        // attempt to fetch latest pin info
        //console.log(me.mgr.mgr.node);
        var node = me.mgr.mgr.node;
        if (!node.ipAddress) {
            $(btn).notify(
                "IP address unknown",
                {
                  className: "error",
                  autoHide: true,
                  arrowShow: false,
                  position: "bottom",
                }
              );
        }
        $.getJSON("http://" + node.ipAddress + "/pins", function (data) {
            console.log(data);
            // add options to each element if they are available and have matching capabilities
            data.forEach((pin)=>{
                if (pin.state == 1) {
                    // compare to each capability
                    for (var i=0; i<numPins; i++) {
                        if (pin[me.data.capabilities[i]] == 1) {
                            me.inputs[i].append( $('<option value="'+pin.id+'">'+pin.id+'</option>') );
                        }
                    }
                }
            });

            info.html('Pin info loaded');
        });
    });
    container.append(btn);
    container.append(info);

    return container;
  }

  onChange() {
    var me = this;

    var vStr = '';

    if (this.data.type == "char") {
        vStr = me.inputs[0].val();
    } else if (this.data.type == "uint8_t" || this.data.type == "uint32_t" || this.data.type == "I2CBus" || this.data.type == "serialPort" || this.data.type == "pins") {
      me.inputs.forEach((ele, index)=>{
        if (index > 0) vStr += ', ';
        vStr += ele.val();
      });  
    } else if (this.data.type == "float") {
        me.inputs.forEach((ele, index)=>{
            if (index > 0) vStr += ', ';
            vStr += ele.val().toFixed(4);
          });  
    } 
    me.str = me.data.param + " = " + vStr;
    if (vStr.length > 0) {
        me.gotInput();
    }
  }

  gotInput() {
    this.hasInput = true;
    this.updateWidget();
    this.mgr.updateWidget();
  }

  buildWidgetUI() {
    var me = this;
    if (this.isLiteral) {
      this.ui.widget.html(this.str);
    } else {
      var container = $(
        '<div class="form-group"><label>' + this.data.title + "</label></div>"
      );
      this.ui.widget.append(container);

      if (this.data.type == "char") {
        container.append(this.buildCharInput());
      } else if (this.data.type == "uint8_t" || this.data.type == "uint32_t") {
        container.append(this.buildIntegerInput());
      } else if (this.data.type == "float") {
        container.append(this.buildFloatInput());
      } else if (this.data.type == "I2CBus") {
        container.append(this.buildI2CBusInput());
      } else if (this.data.type == "serialPort") {
        container.append(this.buildSerialPortInput());
      } else if (this.data.type == "pins") {
        container.append(this.buildPinsInput());
      } else {
        // unknown?
        var ele = $(
          "<div>" +
            "UNKNOWN TYPE: " +
            this.data.type +
            ": " +
            this.str +
            "</div>"
        );
        container.append(ele);
      }
    }
  }
}

/*
  Manages the input selection for a ModuleType
*/
class TypeWizard {
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
      if (str.startsWith(";")) {
        this.isComment = true;
      } else {
        // otherwise parse name = value pair
        var epos = str.indexOf("=");
        this.data = {
          name: str.substring(0, epos).trim(),
          value: str.substring(epos + 1, str.length).trim(),
        };
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

    this.ui.widget = $('<div class="typeWidget"></div>');
    this.container.append(this.ui.widget);

    this.updateWidget();

    // build widget UI
    this.buildWidgetUI();
  }

  updateStr() {
    
  }

  isConfigured() {
    return this.isLiteral || this.hasInput;
  }

  toConfigString() {
    return '[ ' + this.str + ' ]';
  }

  typeName() {
    // return type name
    if (!this.isConfigured()) return '';
    var epos = this.str.indexOf("=");
    return this.str.substring(0, epos).trim();
  }

  updateWidget() {
    if (this.isConfigured()) {
      this.ui.widget.addClass("configured");
    } else {
      this.ui.widget.removeClass("configured");
    }

    if (this.str == "") {
      this.hide();
    } else {
      this.show();
    }
  }

  show() {
    this.ui.widget.show();
  }

  hide() {
    this.ui.widget.hide();
  }

  buildModuleTypeInput() {
    var me = this;
    // generate a form input
    var ele = $('<select class="form-control" >');
    var op = $('<option value="">-</option>');
    ele.append(op);
    
    me.data.options.forEach((option)=>{
        var op = $('<option value="'+option+'">'+ option +'</option>');
        ele.append(op);
    });
    
    ele.on("change", () => {
      var v = ele.val();
      me.str = v + ' = ' + me.data.value;
      if (v.length > 0) {
        me.gotInput();
      }
    });
    return ele;
  }

  gotInput() {
    this.hasInput = true;
    this.updateWidget();
    this.mgr.updateWidget();
  }

  buildWidgetUI() {
    var me = this;
    if (this.isLiteral) {
      this.ui.widget.html('[ ' + this.str + ' ]');
    } else {
      var container = $(
        '<div class="form-group"></div>'
      );
      this.ui.widget.append(container);

      if (this.data.type == "moduleType") {
        container.append(this.buildModuleTypeInput());
      } else {
        // unknown?
        var ele = $(
          "<div>" +
            "UNKNOWN TYPE: " +
            this.data.type +
            ": " +
            this.str +
            "</div>"
        );
        container.append(ele);
      }
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
    this.name = "";
    this.selected = false;

    // create ui elements
    this.ui = {};

    this.ui.widget = $('<div class="moduleWidget">' + str + "</div>");
    this.ui.widget.on("click", () => {
      me.mgr.selectModule(me);
    });
    this.leftPane.append(this.ui.widget);

    // container for inputs
    this.ui.inputsContainer = $('<div class="moduleInputsContainer" style="display:none"></div>');
    this.rightPane.append(this.ui.inputsContainer);

    this.ui.typeContainer = $('<div class="mb-4"><h2>Module Type</h2></div>');
    this.ui.inputsContainer.append(this.ui.typeContainer);

    // is this the overall node dummy module?
    if (str == "") {
        this.ui.widget.html("Node Settings");
        this.ui.typeContainer.hide();
    }

    this.ui.paramsContainer = $('<div></div>');
    if (str != '') {
        this.ui.paramsContainer.append($('<h2>Module Configuration</h2>'));
    }
    this.ui.inputsContainer.append(this.ui.paramsContainer);

    this.typeInput = new TypeWizard(this, str, this.ui.typeContainer);
  }

  parseLine(str) {
    var newInput = new InputWizard(this, str, this.ui.paramsContainer);
    // see if this was our name
    if (
      newInput.isLiteral &&
      !newInput.isComment &&
      newInput.data.name == "name"
    ) {
      this.name = newInput.data.value;
      // strip double quotes?
      if (this.name.startsWith('"')) {
        this.name = this.name.substring(1, this.name.length - 1);
      }
      this.ui.widget.html(this.name);
    }
    this.params.push(newInput);
  }

  toConfigString() {
    var res = "";

    // module section
    if (this.typeInput.str != "") {
      res += this.typeInput.toConfigString() + "\n";
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
    var me = this;
    if (this.isConfigured()) {
      this.ui.widget.addClass("configured");
    } else {
      this.ui.widget.removeClass("configured");
    }

    // attempt to load module info if type is defined
    if (me.typeInput.isConfigured()) {
        this.modInfo = moduleInfo[me.typeInput.typeName()]; 
    }

    // show or hide input widgets based on typeInput
    this.params.forEach((p) => {
      if (me.typeInput.isConfigured()) {
        p.show();
      } else {
        p.hide();
      }
    });

  }

  select() {
    this.ui.inputsContainer.show();
    this.selected = true;
    this.ui.widget.addClass("selected");
  }

  blur() {
    this.ui.inputsContainer.hide();
    this.selected = false;
    this.ui.widget.removeClass("selected");
  }
}

/*
  Manages the overall configuration wizard for a node
*/
export default class Wizard {
  constructor(configPanel, storage) {
    this.configPanel = configPanel;
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
    this.ui.title = $('<div class="wizardTitle">Configuration Recipes</div>');
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
    var module = new ModuleWizard(
      this,
      "",
      this.ui.leftPane,
      this.ui.rightPane
    );
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
            var module = new ModuleWizard(
              this,
              line.substring(1, line.length - 1),
              this.ui.leftPane,
              this.ui.rightPane
            );
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
    //this.node.displayNewConfig(s);
    console.log(this.configPanel);
    this.configPanel.setEditorContents(s, '/config.ini');
  }
}
