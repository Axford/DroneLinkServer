import loadStylesheet from '../../loadStylesheet.js';
import * as DLM from '../../droneLinkMsg.mjs';




export default class Waypoint {
	constructor(channel, state) {
    this.channel = channel;
    this.state = state;
    this.built = false;
	}


  drawPill(label, x, y, w, color) {
    var c = this.canvas[0];
		var ctx = c.getContext("2d");

    ctx.fillStyle = color;
    // draw pill
    var r = 8;
    var x1 = x - w/2 + r;
    var x2 = x + w/2 - r;
  
    ctx.beginPath();
    ctx.arc(x1, y+r, r, 0, 2 * Math.PI);
    ctx.fill();
  
    ctx.beginPath();
    ctx.fillRect(x1,y, w - 2*r, 2*r);
  
    ctx.beginPath();
    ctx.arc(x2, y + r, r, 0, 2 * Math.PI);
    ctx.fill();
  
    // draw label
    ctx.textAlign = 'center';
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(label, x, y+12);
  }


  drawValue(x,y,label,v) {
    var c = this.canvas[0];
		var ctx = c.getContext("2d");

    ctx.fillStyle = '#FFF';
		ctx.textAlign = 'left';
    ctx.font = '12px serif';
    ctx.fillText(label, x, y+15);
    ctx.fillStyle = '#5f5';
    ctx.font = '20px bold serif';
    ctx.fillText(v, x, y+35);
  }


  setAndQueryUint8Param(param, value) {
    var qm = new DLM.DroneLinkMsg();
    qm.node = this.channel.node.id;
    qm.channel = this.channel.channel;
    qm.param = param;
    qm.setUint8([ value ]);
    this.state.send(qm);

    qm = new DLM.DroneLinkMsg();
    qm.node = this.channel.node.id;
    qm.channel = this.channel.channel;
    qm.param = param;
    qm.msgType = DLM.DRONE_LINK_MSG_TYPE_QUERY;
    this.state.send(qm);
  }

	onParamValue(data) {
    this.update();
  }

  update() {
		if (!this.built) return;

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
	  this.built = true;

	  this.ui = $('<div class="Waypoint text-center"></div>');

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
    this.channel.interfaceTab.append(this.ui);

    this.built = true;

    this.update();
  }
}
