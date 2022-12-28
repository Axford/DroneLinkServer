import ModuleInterface from './ModuleInterface.mjs';
import loadStylesheet from '../../loadStylesheet.js';
import * as DLM from '../../droneLinkMsg.mjs';


export default class Waypoint extends ModuleInterface {
	constructor(channel, state) {
    super(channel, state)
	}


  update() {
		if (!super.update()) return;

    var node = this.channel.node.id;
    var channel = this.channel.channel;

		var mode =  this.state.getParamValues(node, channel, 8, [0])[0];
    var waypoint =  this.state.getParamValues(node, channel, 10, [0])[0];
    var waypoints =  this.state.getParamValues(node, channel, 9, [0])[0];
    var loopMode = this.state.getParamValues(node, channel, 14, [0])[0];

		var c = this.canvas[0];
		var ctx = c.getContext("2d");

		// keep width updated
		var w = this.ui.width();
		ctx.canvas.width = w;
		var cx = w/2;
		var h = 100;

		// background
		ctx.fillStyle = '#343a40';
		ctx.fillRect(0,0,w,200);

    this.drawValue(5,0,'Waypoint', (waypoint+1) + ' of ' + waypoints);

    this.drawPill(loopMode == 1 ? 'Loop' : 'Once', w-40, h-20, 70, loopMode == 1 ? '#55f' : '#555');
  }


  build() {
	  super.build('Waypoint');

	  var restartButton = $('<button class="btn btn-sm btn-primary mr-2 mb-2"><i class="fas fa-fast-backward"></i></button>');
    restartButton.on('click', ()=>{
      this.setAndQueryUint8Param(10,0);
    });
    this.ui.append(restartButton);

    var nextButton = $('<button class="btn btn-sm btn-primary mr-2 mb-2"><i class="fas fa-step-forward"></i></button>');
    nextButton.on('click', ()=>{
      var waypoint =  this.state.getParamValues(this.channel.node.id, this.channel.channel, 10, [0])[0];
      this.setAndQueryUint8Param(10, waypoint+1 );
    });
    this.ui.append(nextButton);

    var gotoButton = $('<button class="btn btn-sm btn-primary mr-2 mb-2">Goto</button>');
    gotoButton.on('click', ()=>{
      var target =  this.state.getParamValues(this.channel.node.id, this.channel.channel, 11, [0,0,0]);
      // fly map to this location
      if (target[0] != 0) {
        this.channel.node.map.flyTo({
          center: target
        });
      }
    });
    this.ui.append(gotoButton);


    var reloadButton = $('<button class="btn btn-sm btn-danger mr-2 mb-2 float-right">Reload</button>');
    reloadButton.on('click', ()=>{
      this.setAndQueryUint8Param(8,1);
    });
    this.ui.append(reloadButton);


    this.canvas = $('<canvas height=100 />');
		this.ui.append(this.canvas);
    
    super.finishBuild();
  }
}
