/*

Update a json map of all available modules by scanning the DroneLink modules directory for header files and extracting key info from tagged (@xx) comments

*/
const modulesPath = '../DroneNode/src/droneModules/';
const baseDroneModulePath = '../DroneNode/src/DroneModule.h';
const outputFile = 'public/moduleInfo.json';
const fs = require('fs');

var moduleInfo = {};  // the parsed map of module info


function parseModule(fn) {
  console.log('Parsing: '+fn + '...');

  var tags = {};

  var lines = fs.readFileSync(fn).toString().split("\n");

  var tagComplete = false;
  var multiline = false;
  var tagStr = '';

  for(i in lines) {
    //console.log(lines[i]);

    if (multiline) {
      // check for end of multiline
      if (lines[i].indexOf('<<<') > -1) {
        // no need to add this line to the tagStr
        multiline = false;
        tagComplete = true;
      } else {
        tagStr += lines[i] + '\n';
      }

    } else {
      // search line for @ tags
      var atp = lines[i].indexOf('@');
      if (atp > -1) {
        // extract tag string from @ onward
        tagStr = lines[i].substr(atp, lines[i].length);
        //console.log(ts);

        // detect multiline values
        if (tagStr.indexOf('>>>') > -1) {
          // remove the >>> characters from the tag
          tagStr = tagStr.slice(0,-3);
          tagStr += '\n';
          multiline = true;
        } else {
          multiline = false;
          tagComplete = true;
        }
      } // if atp
    }

    // parse completed tags
    if (tagComplete) {
      //console.log(tagStr);

      // find first space character
      var fsp = tagStr.indexOf(' ');
      var tagName = tagStr.substring(1,fsp);
      var tagValue = tagStr.substr(fsp, tagStr.length).trim();

      //console.log(tagName, '['+tagValue+']');

      // parse pub
      if (tagName == 'pub') {
        // pubs of form: <param address>;<type>;<number of values>;<name>;<description>
        var tagValues = tagValue.split(';');
        if (tagValues.length == 6) {
          tagValue = {
            address: parseInt(tagValues[0]),
            type: tagValues[1],
            numValues: parseInt(tagValues[2]),
            writable: tagValues[3] == 'w',
            name: tagValues[4],
            description: tagValues[5]
          };
        } else {
          console.log('  Error: invalid number of tag values');
        }
      }

      // parse sub
      if (tagName == 'sub') {
        // subs of form: <param address>;<addr param address>;<type>;<number of values>;<name>;description
        var tagValues = tagValue.split(';');
        if (tagValues.length == 6) {
          tagValue = {
            address: parseInt(tagValues[0]),
            addrAddress: parseInt(tagValues[1]),
            type: tagValues[2],
            numValues: parseInt(tagValues[3]),
            name: tagValues[4],
            description: tagValues[5]
          };
        } else {
          console.log('  Error: invalid number of tag values');
        }
      }

      if (!tags.hasOwnProperty(tagName)) tags[tagName] = [];

      tags[tagName].push(tagValue);

      tagComplete = false;
      tagStr = '';
    }
  }

  // tags array should now be populated
  if (tags.type && tags.type[0] != '') {
    // store tags into overall modules map
    tags.filename = [ fn ];
    moduleInfo[ tags.type[0] ] = tags;
    //console.log(tags);
    console.log('  Parsed OK')
  } else {
    console.log('  Error: Unable to locate tag for module type');
  }
}

function parseModules() {
  fs.readdirSync(modulesPath, { withFileTypes:true }).forEach(file => {
    if (file.isFile() && file.name.slice(-2) == '.h') {
      parseModule(modulesPath +  file.name);
    }
  });
}

//base class
parseModule(baseDroneModulePath);
// all other modules
parseModules();

//console.log(moduleInfo);

// save complete moduleInfo json file
var moduleInfoJson = JSON.stringify(moduleInfo , null, 4);
fs.writeFile(outputFile, moduleInfoJson, function (err) {
  if (err) return console.log(err);
});

// render help files
// -----------------------------------------------------------------------------
var Mustache = require('mustache');
// load template
var moduleTemplate = fs.readFileSync('templates/help/module.mustache').toString();
var indexTemplate = fs.readFileSync('templates/help/index.mustache').toString();

// for each module
var moduleList = [];

for (const [key, value] of Object.entries(moduleInfo)) {
  console.log('Rendering help file for: '+key);
  moduleList.push({
    name:key,
    description: value.description
  });
  var output = Mustache.render(moduleTemplate, value);
  //console.log(output);
  fs.writeFile('public/help/' + key + '.html', output, function (err) {
    if (err) return console.log(err);
  });
}

// also generate an index file
console.log('Rendering help index');
var output = Mustache.render(indexTemplate, { modules: moduleList});
//console.log(output);
fs.writeFile('public/help/index.html', output, function (err) {
  if (err) return console.log(err);
});
