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

    var distances = this.state.getParamValues(node, channel, 15, [0,0,0]);

    var speed = this.state.getParamValues(node, channel, 16, [0])[0];

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

    this.drawValue(80,0,'Total', (distances[2] / 1000).toFixed() + 'km');

    this.drawValue(160,0,'Speed', (speed * 1.94384).toFixed(1) + 'kn');

    var eta = speed > 0 ? distances[1] / speed : 0;
    
    var s = '';

		var days = Math.floor(eta / (3600*24));
		eta = eta - (days * 3600*24);
		var hours = Math.floor(eta / (3600));
		eta = eta - (hours * 3600);
		var minutes = Math.floor(eta / 60);
		var seconds = eta - (minutes * 60);

		if (days > 0) {
			s += days + 'd ';
		}
		if (hours > 0) {
			s += String(hours).padStart(2, '0') + ':';
		}
		s += String(minutes).padStart(2, '0') + ':';
		s += seconds.toFixed(0).padStart(2, '0');

    this.drawValue(240,0,'ETA', s);

    // mode pill - top right
    this.drawPill(loopMode == 1 ? 'Loop' : 'Once', w-40, 5, 70, loopMode == 1 ? '#55f' : '#555');

    // draw progress bar
    var pw = w - 20;
    var ph = 20;

    var px = 10;
    var py = h-ph-10;

    // outer rect
    ctx.strokeStyle = '#888';
    ctx.beginPath();
    ctx.rect(px, py, pw, ph);
    ctx.stroke();

    if (distances[2] == 0) return;

    // calc progress and draw filled bar
    var progress = (distances[2] - distances[1]) / distances[2];
    ctx.fillStyle = '#5f5';
    ctx.fillRect(px, py, pw * progress, ph);

    // draw next waypoint marker
    var x1 = px + pw * ((distances[2] - distances[1] + distances[0]) / distances[2]);
    ctx.strokeStyle = '#5f5';
    ctx.beginPath();
    ctx.moveTo(x1, py);
    ctx.lineTo(x1, py + ph);
    ctx.stroke();

    // draw labels
    ctx.fillStyle = '#fff';
    ctx.font = '15px Arial';
    ctx.textAlign = 'left';
    ctx.fillText((progress * distances[2] / 1000).toFixed(1) + ' km', 10, py-10);

    ctx.textAlign = 'right';
    ctx.fillText((distances[1] / 1000).toFixed(1) + ' km', w-10, py-10);
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
