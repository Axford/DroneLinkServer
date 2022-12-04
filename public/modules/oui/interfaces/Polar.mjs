import loadStylesheet from '../../loadStylesheet.js';
import * as DLM from '../../droneLinkMsg.mjs';


loadStylesheet('./css/modules/oui/interfaces/Polar.css');

function radiansToDegrees(a) {
  return a * 180 / Math.PI;
}

function degreesToRadians(a) {
  return a * Math.PI / 180;
}

function drawPill(ctx, label, x, y, w, color) {
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

function drawLabelledHand(ctx, ang, label, r1, r2, color) {
  var angR = (ang - 90) * Math.PI / 180;

  var cx = ctx.canvas.width / 2;

  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(cx + r1*Math.cos(angR), 100 + r1*Math.sin(angR));
  ctx.lineTo(cx + r2*Math.cos(angR), 100 + r2*Math.sin(angR) );
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.font = '15px Arial';
  ctx.textAlign = 'left';
  //ctx.fillText(ang.toFixed(0) + '°', 10, 25);
  ctx.fillText(label, cx + 4 + r2*Math.cos(angR), 100 + r2*Math.sin(angR));
}

function drawLabel(ctx, v, label, x, y, color) {
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.font = '12px serif';
  ctx.fillText(label, x, y+12);
  ctx.font = '20px bold serif';
  ctx.fillText(v, x, y+35);
}

export default class Polar {
	constructor(channel, state) {
    this.channel = channel;
    this.state = state;
    this.built = false;
    this.builtMapElements = false;
    this.mapMarker = null;
    this.mapOutlines = {};
	}


  updateMapElements() {

    var nodeRef = this.channel.node;
    var node = nodeRef.id;
    var channel = this.channel.channel;

    // fetch key param info
    var target = this.state.getParamValues(node, channel, 8, [0,0]);
    var radius = this.state.getParamValues(node, channel, 13, [0,0,0]);

    if (target[0] ==0 || radius[0] == 0) return;

    if (!this.builtMapElements) {
      // build map elements

      // -- target marker --
      var el = document.createElement('div');
      el.className = 'polarMarker';

      this.mapMarker = new mapboxgl.Marker(el)
          .setLngLat(target)
          .setDraggable(true)
          .addTo(nodeRef.map);


      this.mapMarker.on('dragend', (e)=>{
        // e.target
        const lngLat = e.target.getLngLat();

        // indicate update in progress
        e.target.getElement().classList.add('updating');

        // write the new target
        var qm = new DLM.DroneLinkMsg();
        qm.node = node;
        qm.channel = channel;
        qm.param = 8;
        qm.setFloat([ lngLat.lng, lngLat.lat ])
        this.state.send(qm);

        // then send a query for the new target value
        qm = new DLM.DroneLinkMsg();
        qm.node = node;
        qm.channel = channel;
        qm.param = 8;
        qm.msgType = DLM.DRONE_LINK_MSG_TYPE_QUERY;
        qm.msgLength = 1;
        this.state.send(qm);
      });

      

      // -- radius rings --
      for (var i=0; i<3; i++) {
        var outlineName = 'polarOutline' + node + '_' + i;
        this.mapOutlines['ring'+i] = nodeRef.createGeoJSONCircle(target, radius[i]);
        nodeRef.map.addSource(outlineName, { type: 'geojson', data: this.mapOutlines['ring'+i] });

        var paintStyle = {
          'line-color': (i==2) ? 'red' : '#f5f',
          'line-opacity': (i==2) ? 0.5 : 0.6,
          'line-width': (i==2) ? 1 : 3
        }
        if (i > 0) paintStyle['line-dasharray'] = [4,4];

        nodeRef.map.addLayer({
  				'id': outlineName,
  				'type': 'line',
  				'source': outlineName,
          'layout': {},
  				'paint': paintStyle
  			});
      }

      this.builtMapElements = true;
    } else {
      // update map elements

      this.mapMarker.setLngLat(target);

      var el = this.mapMarker.getElement();
      el.classList.remove('updating');

      // -- outline rings --
      for (var i=0; i<3; i++) {
        var outlineName = 'polarOutline' + node + '_' + i;
        this.mapOutlines['ring'+i] = nodeRef.createGeoJSONCircle(target, radius[i]);
        var src = nodeRef.map.getSource(outlineName);
        if (src) src.setData(this.mapOutlines['ring'+i]);
      }
      
    }
  }


  update() {
    if (!this.built) return;

    this.updateMapElements();

    var node = this.channel.node.id;
    var channel = this.channel.channel;

    // redraw canvas
    var polar = this.state.getParamValues(node, channel, 11, [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]);
    var samples = this.state.getParamValues(node, channel, 12, [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]);
    var adjHeading = this.state.getParamValues(node, channel, 14, [0])[0];
    var wind = this.state.getParamValues(node, channel, 34, [0])[0];
    var mode = this.state.getParamValues(node, channel, 9, [0])[0];

    var c = this.canvas[0];
    var ctx = c.getContext("2d");

    // keep width updated
    var w = this.ui.width();
    ctx.canvas.width = w;
    var cx = w/2;
    var h = 200;

    ctx.fillStyle = '#343a40';
    ctx.fillRect(0,0,w,200);

    // draw polar
    ctx.strokeStyle = '#55f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx,100);
    var r = 0;
    for (var i =0; i<32; i++) {
      var ang = (180/32) + (i*(180/16)) - 90;
      ang = ang * Math.PI / 180;
      if ( i<16) {
        r = 30 + 50 * polar[i] /255;
      } else {
        r = 30 + 50 * polar[31-i] /255;
      }
      ctx.lineTo(cx + r*Math.cos(ang), 100 + r*Math.sin(ang) );
    }
    ctx.moveTo(cx,100);
    ctx.stroke();

    // draw samples bargraphs
    ctx.strokeStyle = '#5f5';
    ctx.lineWidth = 2;
    // calc max samples
    var maxSample = 0;
    for (var i =0; i<16; i++) {
      if (samples[i] > maxSample) maxSample = samples[i];
    }
    ctx.beginPath();
    ctx.moveTo(cx,100);
    var r = 0;
    for (var i =0; i<32; i++) {
      var ang = (180/32) + (i*(180/16)) - 90;
      ang = ang * Math.PI / 180;
      if ( i<16) {
        r = 30 * samples[i] / maxSample;
      } else {
        r = 30 * samples[31-i] /maxSample;
      }
      ctx.lineTo(cx + r*Math.cos(ang), 100 + r*Math.sin(ang) );
    }
    ctx.stroke();

    // circles
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, 100, 80, 0, 2 * Math.PI);
    ctx.stroke();
		ctx.beginPath();
    ctx.arc(cx, 100, 30, 0, 2 * Math.PI);
    ctx.stroke();


    // draw ticks
    ctx.beginPath();
    for (var i =0; i<12; i++) {
      var ang = (i*30) * Math.PI / 180;
      ctx.moveTo(cx + 80*Math.cos(ang), 100 + 80*Math.sin(ang));
      ctx.lineTo(cx + 90*Math.cos(ang), 100 + 90*Math.sin(ang) );
    }
    ctx.stroke();

    // adjHeading
    drawLabelledHand(ctx, adjHeading - wind, '', 30, 100, '#ff5')

    // draw controlMode
    var controlModeStr = 'Passive';
    var controlModeClr = '#555';
    if (mode == 2) {
      controlModeStr = 'Reset';
      controlModeClr = '#a55';
    } else if (mode == 1) {
      controlModeStr = 'Active';
      controlModeClr = '#5a5';
    }
    drawPill(ctx, controlModeStr, w-40, h-20, 70, controlModeClr);
  }


  onParamValue(data) {
    console.log('polar param update');
    setTimeout(()=>{ this.update(); }, 500);
  }


	build() {
    this.ui = $('<div class="Polar text-center"></div>');

    var passiveButton = $('<button class="btn btn-sm btn-primary mr-2 mb-2">Passive</button>');
    passiveButton.on('click', ()=>{
      var qm = new DLM.DroneLinkMsg();
			qm.node = this.channel.node.id;
			qm.channel = this.channel.channel;
			qm.param = 9;
			qm.setUint8([ 0 ]);
			this.state.send(qm);
    });
    this.ui.append(passiveButton);


    var activeButton = $('<button class="btn btn-sm btn-success mr-2 mb-2">Active</button>');
    activeButton.on('click', ()=>{
      var qm = new DLM.DroneLinkMsg();
			qm.node = this.channel.node.id;
			qm.channel = this.channel.channel;
			qm.param = 9;
			qm.setUint8([ 1 ]);
			this.state.send(qm);
    });
    this.ui.append(activeButton);


    this.canvas = $('<canvas height=200 />');
    this.ui.append(this.canvas);
    this.channel.interfaceTab.append(this.ui);

    this.built = true;

    this.update();
  }
}
