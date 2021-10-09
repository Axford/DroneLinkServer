import loadStylesheet from './modules/loadStylesheet.js';
import * as DLM from './modules/droneLinkMsg.js';

// UI


/* TODO
 - Extend Address input to be a drop-down selector of published outputs
*/

loadStylesheet('./css/configurator.css');

// shortcut
const e = React.createElement;

// state
var state = {
  schema: [],
  config: {}
};

var editor;
var ipAddress;
var configChanged = false;


function getModuleSchema(modType) {
  var mt = {};
  state.schema.modules.forEach((mod)=>{
    if (mod.type == modType) {
      mt = mod;
    }
  });
  return mt;
}


function deleteModule(id) {
  // find module index
  var index = -1;
  state.config.modules.forEach((mod,i)=>{
    if (mod.id == id) {
      index = i;
      return false;
    }
  });

  // remove it
  if (index >=0) {
    state.config.modules.splice(index,1);
  }

  configChanged = true;
}


// sendData is our main function
function save() {
  // To construct our multipart form data request,
  // We need an XMLHttpRequest instance
  const XHR = new XMLHttpRequest();

  // We need a separator to define each part of the request
  const boundary = "blobblobblob";

  // Store our body request in a string.
  let data = "";

  // So, if the user has selected a file
  if ( true ) {
    // Start a new part in our body's request
    data += "--" + boundary + "\r\n";

    // Describe it as form data
    data += 'content-disposition: form-data; '
    // Define the name of the form data
          + 'name="'         + 'data'          + '"; '
    // Provide the real name of the file
          + 'filename="'     + '/config.json'+ '"\r\n';
    // And the MIME type of the file
    data += 'Content-Type: ' + 'text/json' + '\r\n';

    // There's a blank line between the metadata and the data
    data += '\r\n';

    // Append the binary data to our body's request
    data += JSON.stringify(state.config, null, 4) + '\r\n';
  }

  // Once we are done, "close" the body's request
  data += "--" + boundary + "--";

  // Define what happens on successful data submission
  XHR.addEventListener( 'load', function( event ) {
    //alert( 'Yeah! Data sent and response loaded.' );
  } );

  // Define what happens in case of error
  XHR.addEventListener( 'error', function( event ) {
    //console.error( 'Oops! Something went wrong.', event );
    // ignore errors - seems normal
    alert('saved');
  } );

  // Set up our request
  XHR.open( 'POST', "http://" + ipAddress + '/edit' );

  // Add the required HTTP header to handle a multipart form data POST request
  XHR.setRequestHeader( 'Content-Type','multipart/form-data; boundary=' + boundary );

  // And finally, send our data.
  XHR.send( data );
}


function getNextId() {
  var newId = 1;
  if (state.config.modules) {
    state.config.modules.forEach((mod,i)=>{
      if (mod.id) {
        newId = mod.id + 1;
      }
    })
  }
  return newId;
}


function instanceCount(modType) {
  var c = 0;
  if (state.config.modules) {
    state.config.modules.forEach((mod,i)=>{
      if (mod.type == modType) {
        c++
      }
    })
  }
  return c;
}


class SchemaRoot extends React.Component {
  constructor(props) {
    super(props);
  }

  render() {
    var items = [];

    this.props.schema.modules.forEach((mod,i)=>{

      var modCount = instanceCount(mod.type);

      //console.log(mod)
      items.push( e('div',{key:'mod'+i, className:'card '+ (modCount > 0 ? 'bg-light' : 'bg-secondary')},
        e('div',{key:'header', className:'card-body'},
          e('div',{key:'addme', className:'card-text'},
            e('a', {
              className:'addButton btn btn-primary btn-sm float-right',
              onClick: (e)=> {
                state.config.modules.push({
                  type:mod.type,
                  id: getNextId(),
                  name: mod.type
                });
                configChanged = true;
              }
            }, e('i', {className:'bi bi-arrow-up-circle-fill'}))
          ),
          e('div',{key:'title', className:'card-title'},
            modCount > 0 ? e('span',{key:'instances', className:'instanceCount bg-secondary'}, modCount) : '',
            mod.type
          ),
          e('div',{key:'desc', className:'card-text'}, mod.description)
        )
      ));
    });

    return [
      e('h2',{key:'h2', className:'clearfix'}, 'Add a Module'),
      e('div', {key:'schemaList', className:'schemaList'}, items)
    ];
  }
}


function buildPinOptions() {
  var items = [];

  state.schema.pins.forEach((p,i)=>{
    items.push( e('option', {key:'option'+i, value:p}, p) );
  });

  return items;
}


function buildFormGroup(label,tooltip, controls) {
  return e(ReactBootstrap.Form.Group, {key:'g-'+label, className:'mb-1 row'},
          e(ReactBootstrap.Form.Label, {
            key:'l1', className:'col-sm-4',
            'data-toggle':'tooltip','data-original-title':tooltip
          }, label ),
          e('div', {key:'d1', className:'col-sm-8 controlGroup'},
            controls
          )
        );
}


function buildPinInput(schemaObj, modObj, i, def, isArray, nestedIndex) {
  return e(ReactBootstrap.Form.Select, {
    key:'s'+i, size:'sm',
    className: (isArray ? 'mb-1' : ''),
    'aria-label':'Select pin',
    arrindex:i,
    defaultValue:isArray ? def[i] : def,
    onChange: (e)=> {
      var j = e.target.getAttribute('arrindex');
      var newVal = e.target.value;

      if (nestedIndex) {
        modObj[schemaObj.name][nestedIndex][j] = newVal;
      } else if (isArray) {
        modObj[schemaObj.name][j] = newVal;
      } else
        modObj[schemaObj.name] = newVal;

      configChanged = true;
    }
  }, buildPinOptions())
}


function buildBooleanInput(schemaObj, modObj, i, def, isArray, nestedIndex) {
  return e(ReactBootstrap.Form.Select, {
      key:'s'+i, size:'sm',
      className: (isArray ? 'mb-1' : ''),
      'aria-label':'Select a value',
      arrindex:i,
      defaultValue:isArray ? def[i] : def,
      onChange: (e)=> {
        var j = e.target.getAttribute('arrindex');
        var newVal = (e.target.value == 'true');

        if (nestedIndex) {
          modObj[schemaObj.name][nestedIndex][j] = newVal;
        } else if (isArray) {
          modObj[schemaObj.name][j] = newVal;
        } else
          modObj[schemaObj.name] = newVal;

        configChanged = true;
      }
    },
    e('option', {key:'option0', value:false}, 'false'),
    e('option', {key:'option1', value:true}, 'true')
  )
}


function buildNumericInput(schemaObj, modObj, i, def, isArray, nestedIndex) {
  return e(ReactBootstrap.Form.Control, {
    key:'c'+i, type:'text', size:'sm',
    className: (isArray ? 'mb-1' : ''),
    defaultValue:isArray ? def[i] : def,
    arrindex:i,
    onChange: (e)=> {
      var j = e.target.getAttribute('arrindex');
      var newVal = 0;
      if (schemaObj.type == 'float') {
        newVal = parseFloat(e.target.value)
      } else {
        newVal = parseInt(e.target.value);
      }

      if (nestedIndex) {
        modObj[schemaObj.name][nestedIndex][j] = newVal;
      } else if (isArray) {
        modObj[schemaObj.name][j] = newVal;
      } else
        modObj[schemaObj.name] = newVal;

      configChanged = true;
    }
  })
}


function buildStringInput(schemaObj, modObj, i, def, isArray, nestedIndex) {
  return e(ReactBootstrap.Form.Control, {
    key:'c'+i, type:'text', size:'sm',
    className: (isArray ? 'mb-1' : ''),
    defaultValue:isArray ? def[i] : def,
    arrindex:i,
    onChange: (e)=> {
      var j = e.target.getAttribute('arrindex');
      var newVal = e.target.value;

      if (nestedIndex) {
        modObj[schemaObj.name][nestedIndex][j] = newVal;
      } else if (isArray) {
        modObj[schemaObj.name][j] = newVal;
      } else
        modObj[schemaObj.name] = newVal;

      configChanged = true;
    }
  })
}


function buildInput(schemaObj, modObj) {
  if (modObj == undefined) return '';

  var label = schemaObj.name;
  var def = modObj[schemaObj.name] != undefined ? modObj[schemaObj.name] : schemaObj.default;

  // ensure config has correct defaults
  if (modObj[schemaObj.name] == undefined) {
    modObj[schemaObj.name] = def;
  }

  var controls = [];

  var isArray = schemaObj.values > 1 || schemaObj.extensible;

  var numValues = schemaObj.extensible ? modObj[schemaObj.name].length : schemaObj.values;

  for (var i=0; i < numValues; i++) {

    if (schemaObj.type == 'pin') {
      // selector
      controls.push(buildPinInput(schemaObj, modObj, i, def, isArray));

    } else if (schemaObj.type == 'boolean') {
      // selector
      controls.push(buildBooleanInput(schemaObj, modObj, i, def, isArray));

    } else if (schemaObj.type == 'uint8_t' ||
               schemaObj.type == 'uint32_t' ||
               schemaObj.type == 'float' ) {
      controls.push(buildNumericInput(schemaObj, modObj, i, def, isArray));
    } else {
      controls.push(buildStringInput(schemaObj, modObj, i, def, isArray));
    }
  }  // end for

  if (schemaObj.extensible) {
    controls.push(e(ReactBootstrap.Button, {
      key:'addButton',
      className:'btn btn-sm btn-primary',
      onClick: (e)=> {
        var newVal = schemaObj.default[0];
        modObj[schemaObj.name].push(newVal);
        configChanged = true;
      }
    }, 'Add'));

    controls.push(e(ReactBootstrap.Button, {
      key:'removeButton',
      className:'btn btn-sm btn-danger',
      onClick: (e)=> {
        modObj[schemaObj.name].pop();
        configChanged = true;
      }
    }, 'Remove'));
  }


  return buildFormGroup(label, schemaObj.description, controls);
}


function buildAddrInput(schemaObj, modObj) {
  // of form:  "PID": ["", [0.1, 0, 0]],
  if (modObj == undefined) return '';

  // ensure config file has correct array structure
  if (modObj[schemaObj.name] == undefined || modObj[schemaObj.name].length == 0) {
    modObj[schemaObj.name] = ['', schemaObj.default];
  } else {
    if (modObj[schemaObj.name].length == 1) {
      modObj[schemaObj.name].push(schemaObj.default);
    }
  }


  var label = schemaObj.name;

  var addrControls = [];

  // build two controls...

  // address input control
  addrControls.push(e('div',{key:'addrTitle'}, 'Sub Address'));
  addrControls.push(buildStringInput(schemaObj, modObj, 0, modObj[schemaObj.name], true));


  // default value control
  var isArray = schemaObj.values > 1;
  var numValues = schemaObj.values;
  var def = modObj[schemaObj.name][1];
  var defControls = [];

  defControls.push(e('div',{key:'addrTitle'}, 'Default'));
  for (var i=0; i < numValues; i++) {

    if (schemaObj.type == 'pin') {
      // selector
      defControls.push(buildPinInput(schemaObj, modObj[1], i, def, isArray, 1));

    } else if (schemaObj.type == 'boolean') {
      // selector
      defControls.push(buildBooleanInput(schemaObj, modObj[1], i, def, isArray, 1));

    } else if (schemaObj.type == 'uint8_t' ||
               schemaObj.type == 'uint32_t' ||
               schemaObj.type == 'float' ) {
      defControls.push(buildNumericInput(schemaObj, modObj, i, def, isArray, 1));
    } else {
      // generic input
      defControls.push(buildStringInput(schemaObj, modObj, i, def, isArray, 1));
    }
  }

  // put it all together
  var controls = [
    e('div', {key:'addrControls'}, addrControls),
    e('div', {key:'defControls'}, defControls)
  ];


  return buildFormGroup(label, schemaObj.description, controls);
}



class Module extends React.Component {
  constructor(props) {
    super(props);
    this.state = {};
  }

  componentDidUpdate() {
    // generate new publish string and update config
    var newPubs = [];
    Object.entries(this.state).forEach(([key, value]) => {
      if (value) {
        newPubs.push(key);
      }
    });

    this.props.module.publish = newPubs;
    configChanged = true;
  }

  componentDidMount() {
    var m = this.props.module;
    var s = this.props.schema;
    var ms = getModuleSchema(m.type);

    // prep state for publish settings
    if (ms.publish) {
      var pubSettings = { };

      ms.publish.forEach((schemaObj,i)=>{
        pubSettings[schemaObj] = (m.publish && m.publish.includes(schemaObj));
      });

      this.setState(pubSettings);
    }

  }

  render() {
    var m = this.props.module;
    var s = this.props.schema;
    var ms = getModuleSchema(m.type);

    var coreItems = [];
    var items = [];
    var pubControls = [];

    if (ms && ms.type) {
      // build inputs for core settings
      s.coreSettings.forEach((schemaObj,i)=>{
        if (schemaObj.type != 'moduleType')
          coreItems.push( buildInput(schemaObj, m) );
      });

      // build inputs for module settings
      if (ms && ms.settings) {
        ms.settings.forEach((schemaObj,i)=>{
          items.push( buildInput(schemaObj, m) );
        });
      }

      // namedSubs
      if (ms && ms.namedSubs) {
        ms.namedSubs.forEach((schemaObj,i)=>{
          items.push( buildAddrInput(schemaObj, m) );
        });
      }


      // publish - what values to publish, list of checkboxes
      pubControls.push(e('div',{key:'title',className:'publishTitle','data-toggle':'tooltip','data-original-title':'Select which parameters to publish'}, 'Publish'));

      var i = 0;
      for (const [schemaObj, value] of Object.entries(this.state)) {
        var paramAddr = '';
        if (ms.publishParams) paramAddr = ms.publishParams[i] + '. ';

        pubControls.push(e(ReactBootstrap.Form.Check,{
          key:'pub'+schemaObj,
          label: paramAddr + schemaObj,
          checked: this.state[schemaObj],
          onChange: (e) => {
            var newState = {};
            newState[schemaObj] = !this.state[schemaObj];
            this.setState(newState);
          }
        }));
        i++;
      };

    } else {
      // unknown module type
      coreItems.push( e('div', {key:'unknown',className:'card-text'}, 'Unknown module type: ' + m.type) );
    }

    return e('div',{key:'module', className:'card'},
            e('div',{key:'header', className:'card-body'},
              e('div',{key:'title', className:'card-title'},
                e(ReactBootstrap.Button, {
                  key:'deleteButton',
                  className:'btn btn-sm btn-danger deleteButton',
                  onClick: (e)=> {
                    deleteModule(this.props.module.id);
                  }
                }, 'X'),
                m.type
              ),
              e('div', {key:'desc',className:'card-text mb-3'}, ms.description),
              e(ReactBootstrap.Form,{className:'row'},
                e('div',{key:'core',className:'col-sm-4'}, coreItems),
                e('div',{key:'inputs',className:'col-sm-5'}, items),
                e('div',{key:'outputs', className:'col-sm-3'}, pubControls)
              )
            )
      );
  }
}


class ConfigRoot extends React.Component {
  constructor(props) {
    super(props);
  }

  render() {
    var items = [];

    items.push(e('h2',{key:'h2.1'}, 'Node Configuration'));

    // node settings
    var nodeSettings = []
    state.schema.nodeSettings.forEach((schemaObj,i)=>{
      nodeSettings.push( buildInput(schemaObj, state.config) );
    });

    items.push(e('div',{key:'module', className:'card'},
        e('div',{key:'header', className:'card-body'},
          e(ReactBootstrap.Form,{}, nodeSettings)
        )
      ));

    items.push(e('h2',{key:'h2.2'}, 'Module Configuration'));



    this.props.config.modules.forEach((mod,i)=>{
      items.push( e(Module, {key:'mod'+i, schema:this.props.schema, module:mod}) );
    });

    return e('div', {className:'moduleList'}, items);
  }
}



class ConfigEditor extends React.Component {
  constructor(props) {
    super(props);
    this.state = { showLog:false }
  }

  componentDidMount() {
    //(JSON.stringify(this.props.config, null, 4));
  }

  componentDidUpdate() {

  }

  render() {
    var items = [];


    // open button
    items.push(e(ReactBootstrap.Button, {
        key:'configButton',
        variant:'primary',
        className:'configButton',
        onClick: (e) => {
          this.setState({ showLog: true });
        }
    }, 'View JSON'));

    // modal
		items.push(e(ReactBootstrap.Modal,{
			key:'modal',
			show: this.state.showLog,
			onHide: (e)=>{ this.setState({ showLog:false}) }
		}, [
			e(ReactBootstrap.Modal.Header, { key:'header' },
				e(ReactBootstrap.Modal.Title, {}, 'Startup Log')
			),
			e(ReactBootstrap.Modal.Body, { key:'body' },
        e('textarea', {
          ref: this.ref,
          key:'jsonEditor',
          id:'jsonEditor',
          value: (JSON.stringify(this.props.config, null, 4)),
          disabled:true,
          onChange: (e)=> { }
        })
			),
			e(ReactBootstrap.Modal.Footer, { key:'footer' },
				e(ReactBootstrap.Button, {
					key:'closeButton',
					variant:'secondary',
					onClick: (e)=>{ this.setState({ showLog:false }) }
				}, 'Close')
			),
		]));

    return items;
  }
}



function renderAll() {
  const domContainer = document.querySelector('#DroneLinkUI');

  ReactDOM.render([
      e(ReactBootstrap.Button, {
        key:'saveButton',
        variant:'success',
        className:'saveButton',
        onClick: (e) => {
          save();
        }
      }, 'Save'),
      e(ConfigRoot, {key:'config', schema:state.schema, config:state.config }),
      e(ConfigEditor, {key:'editor', config: state.config }),
      e(SchemaRoot, {key:'schema', schema:state.schema })
  ], domContainer);

  // make sure tooltips are initialised
  $('[data-toggle="tooltip"]').tooltip({
        placement : 'top'
    });
}


// load linkConfig
function initState() {
  const urlSearchParams = new URLSearchParams(window.location.search);
  const params = Object.fromEntries(urlSearchParams.entries());

  ipAddress = params.address;

  // fetch module schema
  fetch('moduleSchema.json')
    .then(response => response.json())
    .then(json => {
      //console.log(json);

      json.modules.sort((a,b)=>{
        return (a.type > b.type) ? 1 : -1
      });

      _.merge(state.schema, json);

      if (params.address) {
        fetch('http://' + ipAddress + '/config.json')
          .then(response => response.json())
          .then(json => {
            //console.log(json);

            json.modules.sort((a,b)=>{
              return (a.id > b.id) ? 1 : -1
            });

            _.merge(state.config, json);

            renderAll();
          });
      }

    });

}

initState();

setInterval(()=>{
  if(configChanged) {
    //editor.setValue( JSON.stringify(state.config, null, 4), -1 )
    renderAll();
  }
}, 1000);
