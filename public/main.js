import loadStylesheet from './modules/loadStylesheet.js';
import { colorArray, paleColorArray } from './modules/colors.js';
import { bufferToHex } from './modules/bufferUtils.js';
import * as DLM from './modules/droneLinkMsg.js';
import { controllers, initGamepads } from './modules/gamepads.js';

// UI
import NodeTabs from './modules/ui/NodeTabs.js';
import Gamepads from './modules/ui/Gamepads.js'

// SOCKET
import io from './libs/socketio/socket.io.esm.min.js';
var socket = io();

loadStylesheet('./css/main.css');

mapboxgl.accessToken = 'pk.eyJ1IjoiYXhmb3JkIiwiYSI6ImNqMWMwYXI5MDAwNG8zMm5uanFyeThmZDEifQ.paAXk3S29-VVw1bhk458Iw';

// shortcut
const e = React.createElement;


var channelState = {};
var msgQueue = [];


function renderAll() {
  const domContainer = document.querySelector('#DroneLinkUI');

  ReactDOM.render([
    e( Gamepads, {key:'gamepads', controllers:controllers }),
    e( NodeTabs, {key:'nodeTabs', cs: channelState})
  ], domContainer);
}


function fetchSparkData() {
  console.log('fetchSparkData...');

  var fetchList = [];

  _.forOwn(channelState, function(nodeVal, nodeKey) {

    _.forOwn(channelState[nodeKey].channels, function(chanVal, chanKey) {

      _.forOwn(channelState[nodeKey].channels[chanKey].params, function(paramVal, paramKey) {

        if (paramVal.msgType <= DLM.DRONE_LINK_MSG_TYPE_FLOAT && !paramVal.writable && paramVal.numValues < 4) {
          var addr = nodeKey + '>' + chanKey + '.' + paramKey;

          // size sparkLine array
          if ((paramVal.sparkLine == undefined) || paramVal.sparkLine.length != paramVal.numValues) {
            paramVal.sparkLine = new Array(paramVal.numValues);
            // init all elements to empty arrays
            for (var i=0; i<paramVal.numValues; i++) {
              paramVal.sparkLine[i] = [];
            }
          }

          for (var i=0; i<paramVal.numValues; i++) {
            fetchList.push({
              query: "/query?addr=" + addr + '&start=10m&aggr=10s&valueName=value' + i,
              paramVal: paramVal,
              index:i
            })
          }
        }

      });

    });

  });


  // now go fetch all the spark data
  try {
    Promise.all(
        fetchList.map(fetchTask =>
          fetch(fetchTask.query)
            .then(response => response.json() )
        )
      ).then(sparks => {
        sparks.forEach((spark, i) => {
          fetchList[i].paramVal.sparkLine[ fetchList[i].index ] = spark;
          //console.log(fetchList[i].paramVal);
          //fetchList[i].data = spark;
        });
        //console.log(fetchList);

        renderAll();

  			setTimeout(fetchSparkData, 5000);
      });
  } catch(err) {
    console.log('Error fetching spark data: '+err);
  }

}


var updatesNeeded = false;

socket.on('DLM.name', function(msg) {
    console.log('DLM.name', JSON.stringify(msg, null, 2));
    _.merge(channelState, msg);
    updatesNeeded = true;
    //renderAll();
  });

socket.on('DLM.value', function(msg) {
    //console.log('DLM.value', JSON.stringify(msg, null, 2));
    _.merge(channelState, msg);
    updatesNeeded = true;
    //renderAll();
  });


function renderUpdates() {
  if (updatesNeeded) {
    //console.log('r');
    renderAll();
    updatesNeeded = false;
  }
}

setInterval(renderUpdates, 500);


// sync overall state once every 30sec in case we miss stuff
function updateState() {
  fetch("state")
    .then(response => response.json())
    .then(json => {
      //console.log(json);

      _.merge(channelState, json);

      updatesNeeded = true;
      //renderAll();
    });

	setTimeout(updateState, 10000);
}

updateState();


setTimeout(fetchSparkData,2000);

initGamepads(() => {
  renderAll();
});
