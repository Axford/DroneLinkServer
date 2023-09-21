
import moduleInfo from "/moduleInfo.json" assert { type: "json" };

export default class DroneConfigParser {
    constructor() {
        this.config = {

        };
    }

    parseNameValue(line) {
        var res = {
          name: "",
          value: "",
          values:[],
          error: "",
        };
    
        var inString = false,
          inValue = false,
          buf = "",
          wasString = false;
    
        for (var i = 0; i < line.length; i++) {
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
              if (buf.length > 0) {
                res.error = "text encountered before quotation marks";
                break;
              } else {
                inString = true;
                wasString = true;
              }
            } else if (c == "=") {
              if (!inValue) {
                // store name
                if (buf.length > 0) {
                  res.name = buf;
                  buf = "";
                } else {
                  res.error = "Undefined parameter name";
                  break;
                }
                inValue = true;
              } else {
                res.error = "unexpected equals character";
                break;
              }
            } else {
              // skip whitespace, add anything else to buffer
              if (c != " " && c != "\t") {
                buf += c;
              }
            }
          }
        }
    
        // store value
        if (inValue) {
          if (buf.length > 0) {
            res.value = buf;
    
            // parse values if it's an array
            if (wasString) {
                res.values = [buf];
            } else {
                res.values = buf.split(',');
            }
          } else {
            res.error = "Undefined parameter value";
          }
        } else {
          res.error = "Undefined parameter value";
        }
    
        return res;
      }

      getPubOrSub(moduleType, pName) {
        if (moduleInfo.hasOwnProperty(moduleType)) {
          var m = moduleInfo[moduleType];
    
          if (m.hasOwnProperty('pub')) {
            // check pubs
            for (var i=0; i<m.pub.length; i++) {
              var p = m.pub[i];
              if (p.name == pName) return m.pub[i];
            }
          }
    
          if (m.hasOwnProperty('sub')) {
            // check subs
            for (var i=0; i<m.sub.length; i++) {
              var p = m.sub[i];
              if (p.name == pName) return m.sub[i];
            }
          }
    
          // also check inherited properties
          if (m.hasOwnProperty('inherits')) {
            return this.getPubOrSub(m.inherits[0], pName);
          }
        }
        return null;
      }

      compilePubAndSubInfo(module, moduleType) {
        if (moduleInfo.hasOwnProperty(moduleType)) {
            var m = moduleInfo[moduleType];
      
            if (m.hasOwnProperty('pub')) {
              // check pubs
              for (var i=0; i<m.pub.length; i++) {
                var p = {
                    published: false,
                    configured: false
                };
                _.merge(p, m.pub[i]);
                module.params[p.address] = p;
              }
            }
      
            if (m.hasOwnProperty('sub')) {
              // check subs
              for (var i=0; i<m.sub.length; i++) {
                var p = m.sub[i];
                // prepare one entry for the address
                var p1 = {
                    published: false,
                    configured: false,
                    name: '$' + p.name,
                    address: p.addrAddress,
                    type: 'addr',
                    numValues: 1,
                    description: p.description
                };
                module.params[p1.address] = p1;

                // and another for the value
                var p2 = {
                    published: false,
                    configured: false,
                    name: p.name,
                    address: p.address,
                    type: p.type,
                    numValues: p.numValues,
                    description: p.description
                };
                module.params[p2.address] = p2;
              }
            }
      
            // also check inherited properties
            if (m.hasOwnProperty('inherits')) {
              this.compilePubAndSubInfo(module, m.inherits[0]);
            }
          }
      }

      checkValidParam(moduleType, pName, pValue) {
        var res = {
          error: ''
        };
    
        if (moduleInfo.hasOwnProperty(moduleType)) {
          // valid module
          if (pName == 'publish') {
            // check if pValue is a valid list of parameters (pub or sub)
            var parts = pValue.split(',');
    
            // check each part to see if it's valid
            for (var i=0; i<parts.length; i++) {
                var pubOrSubInfo = this.getPubOrSub(moduleType, parts[i]);
                if (!pubOrSubInfo) { 
                    res.error += parts[i] + ' is an unknown param for this module type; '
                }
            }
    
          } else {
            // check pName is a valid pub or sub
            if (pName[0] == '$') pName = pName.slice(1);
            var pubOrSubInfo = this.getPubOrSub(moduleType, pName);
            if (!pubOrSubInfo) {
              res.error = 'Uknown param for this module type'
            } else {
                res.info = pubOrSubInfo;
            }
    
          }
    
        } else {
          res.error = 'Uknown module type';
        }
    
        return res;
      }

      getParamByName(module, param) {
        for (const id in module.params) {
            var p = module.params[id];
            if (p.name == param ) {
                return p;
            }
        };
        return null;
      }

      publishParam(module, param) {
        for (const id in module.params) {
            var p = module.params[id];
            if (p.name == param || (p.name == '$' + param)) {
                p.published = true;
            }
        };
      }
    
      parse(config) {
        this.rawConfig = config;
    
        // clear
        this.config = {
            id:-1,
            modules: {},
            errors: []
        };
    
        // setup syntax parser
        var module = null;
        var moduleName = '';
    
        // parse rawConfig into lines
        var lines = this.rawConfig.split("\n");
    
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i].trim();
    
          if (line.length > 0) {
            if (line[0] == ';') {
                // comment, so skip
            } else if (line[0] == "[") {
              // new section
              // check ends with a ]
              if (line[line.length - 1] == "]") {
                // check we've had a valid node id
                if (this.config.id < 0) {
                    this.config.errors.push({
                        row: 0,
                        column: 0,
                        text: "node ID not defined before first module, e.g. node=1",
                        type: "error"
                    });
                }

                // get the module name and id
                var nv = this.parseNameValue(line.substring(1, line.length - 1));

                // check for name/Value errors
                if (nv.error != '') {
                    this.config.errors.push({
                        row: i,
                        column: 0,
                        text: nv.error,
                        type: "error"
                    });
                  } else {
                    moduleName = nv.name;
      
                    // see if its a valid module name
                    if (!moduleInfo.hasOwnProperty(moduleName)) {
                        this.config.errors.push({
                          row: i,
                          column: 0,
                          text: "Unknown module type",
                          type: "error"
                      });
                    } else {
                        // all good
                        var mi = moduleInfo[moduleName];
                        module = {
                            type: nv.name,
                            id: parseInt(nv.value),
                            inherits: mi.inherits,
                            description: mi.description,
                            exampleConfig: mi.config,
                            params:{}
                        };

                        // compile all param info
                        this.compilePubAndSubInfo(module, module.type);

                        this.config.modules[module.id] = module;
                    }
                  }

                //module = new ModuleBlock(this, nv.name);
                //this.modules.push(module);
              } else {
                // error, no closing bracket
                this.config.errors.push({
                    row: i,
                    column: 0,
                    text: "No closing ] bracket",
                    type: "error"
                });
              }
            } else {
              // should be a regular name=value combo
              var nv = this.parseNameValue(line);

              if (nv.error != '') {
                this.config.errors.push({
                    row: i,
                    column: 0,
                    text: nv.error,
                    type: "error"
                });
              } else {
                if (module) {
                  // see if its a valid param name
                  var pv = this.checkValidParam(module.type, nv.name, nv.value);
    
                  if (pv.error != '') {
                    this.config.errors.push({
                        row: i,
                        column: 0,
                        text: pv.error,
                        type: "error"
                    });
                  } else {
                    // valid param... add to params

                    if (nv.name == 'publish') {
                        // mark all relevant params as published
                        nv.values.forEach((param)=>{
                            this.publishParam(module, param);
                        });
                        
                    } else {
                        var p = this.getParamByName(module, nv.name);
                        if (p) {
                            p.values = nv.values;
                            p.configured = true;
                        }
                    }
                  }
                } else {
                  // is this the nodeId?
                  if (nv.name == 'node') {
                    this.config.id = parseInt(nv.value);
                  }
                }
              }
            }
          }
        }

        return this.config;
      }
}