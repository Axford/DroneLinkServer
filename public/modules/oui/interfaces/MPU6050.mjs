import ModuleInterface from './ModuleInterface.mjs';
import loadStylesheet from '../../loadStylesheet.js';
import * as DLM from '../../droneLinkMsg.mjs';

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

loadStylesheet('./css/modules/oui/interfaces/MPU6050.css');

export default class MPU6050 extends ModuleInterface {
	constructor(channel, state) {
    super(channel, state);
	}


  onParamValue(data) {
    if (!this.built) return;

    // mode
    if (data.param == 19 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_UINT8_T) {
      this.modeSelect.val(data.values[0]);
    }

    // temp
		if (data.param == 12 &&  (data.msgType == DLM.DRONE_LINK_MSG_TYPE_FLOAT)) {
      var d = data.values[0];
			if (d > 40 ) {
				this.widget.removeClass('warning');
				this.widget.addClass('danger');
			} else if (d > 30) {
				this.widget.removeClass('danger');
				this.widget.addClass('warning');
			} else {
				this.widget.removeClass('danger');
				this.widget.removeClass('warning');
			}
      this.widgetText.html(d.toFixed(0) + '°');
    }

    this.updateNeeded = true;
  }


  update() {
		if (!super.update()) return;

    var node = this.channel.node.id;
    var channel = this.channel.channel;

    var c = this.canvas[0];
		var ctx = c.getContext("2d");
  
		// keep size updated
		var w = this.ui.width();
		ctx.canvas.width = w;
    var h = 200;

    // keep size updated
    var h1 = Math.max(ctx.canvas.height, 600) - 200;
    this.renderer.setSize( w, h1 );
    this.camera.updateProjectionMatrix();
    this.camera.aspect = w/h1;

    // fetch params
    var pos = this.state.getParamValues(node, channel, 10, [0,0,0]);

    var pitch = this.state.getParamValues(node, channel, 13, [0])[0];
    var roll = this.state.getParamValues(node, channel, 14, [0])[0];

    var rawVector = this.state.getParamValues(node, channel, 15, [0,0,0,0]);
    var calibX = this.state.getParamValues(node, channel, 16, [0,0,0]);
    var calibY = this.state.getParamValues(node, channel, 17, [0,0,0]);
    var calibZ = this.state.getParamValues(node, channel, 18, [0,0,0]);
    var temp = this.state.getParamValues(node, channel, 12, [0])[0];


    // 2D Artificial horizon
    ctx.fillStyle = '#343a40';
		ctx.fillRect(0,0,w,h);

    this.drawArtificialHorizon(pitch, roll, 0, 0, w, h);

    this.drawValue(10,10,'Pitch',pitch.toFixed(0), '#8f8');
    this.drawValue(10,60,'Roll',roll.toFixed(0), '#8f8');
    this.drawValue(10,110,'Temp',temp.toFixed(1) + '°', '#8f8');

    // 3D Vis

    this.cube.position.x = pos[0];
    this.cube.position.y = pos[1];
    this.cube.position.z = pos[2];

    const positions = this.line.geometry.attributes.position.array;
    positions[3] = pos[0];
    positions[4] = pos[1];
    positions[5] = pos[2];
    this.line.geometry.attributes.position.needsUpdate = true;

    var m = Math.sqrt(pos[0]*pos[0] + pos[1]*pos[1] + pos[2]*pos[2]);

    var s = 'Pitch: ' + pitch.toFixed(1) + '<br/>';
    s += 'Roll: ' + roll.toFixed(1) + '<br/>';
    s += 'x: ' + pos[0].toFixed(1) + ', ';
    s += 'y: ' + pos[1].toFixed(1) + ', ';
    s += 'z: ' + pos[2].toFixed(1) + '<br/>';
    s += 'mag: ' + m.toFixed(1) + '<br/>';
    s += 'X Calib: ' + ((calibX[2]-calibX[0])/2).toFixed(1) + ', ' + calibX[1].toFixed(1) + '<br/>';
    s += 'Y Calib: ' + ((calibY[2]-calibY[0])/2).toFixed(1) + ', ' + calibY[1].toFixed(1) + '<br/>';
    s += 'Z Calib: ' + ((calibZ[2]-calibZ[0])/2).toFixed(1) + ', ' + calibZ[1].toFixed(1) + '<br/>';
    this.uiOverlay.html(s);



    // visualise calibration sphere
    this.calibSphere.position.x = calibX[1];
    this.calibSphere.position.y = calibY[1];
    this.calibSphere.position.z = calibZ[1];

    this.calibSphere.scale.x = (calibX[2] - calibX[0])/2;
    this.calibSphere.scale.y = (calibY[2] - calibY[0])/2;
    this.calibSphere.scale.z = (calibZ[2] - calibZ[0])/2;
  }


  animate() {
    if (this.visible) {
      

      this.renderer.render( this.scene, this.camera );
    }

    requestAnimationFrame( ()=>{ this.animate(); } );
  };

	build() {
    super.build('MPU6050');
    var me = this;

    var controlsContainer = $('<div class="form-row mr-1 ml-1" />');

    this.modeSelect = $('<select class="col-8 custom-select custom-select-sm modeSelect"></select>');
    // add mode options
    this.modeSelect.append($('<option value="0">Online Calibration</option>'));
    this.modeSelect.append($('<option value="1">Fixed Calibration</option>'));
    this.modeSelect.append($('<option value="2">Reset Calibration</option>'));
    this.modeSelect.append($('<option value="3">Store Calibration</option>'));
    this.modeSelect.change((e)=>{
      // get value
      var newMode = this.modeSelect.val();

      var qm = new DLM.DroneLinkMsg();
			qm.node = this.channel.node.id;
			qm.channel = this.channel.channel;
			qm.param = 19;
			qm.setUint8([ newMode ]);
			this.state.send(qm);

      this.queryParam(19);
    });
    controlsContainer.append(this.modeSelect);

    this.button3D = $('<button class="col-4 btn btn-sm btn-primary">Show 3D</button>');
    this.button3D.on('click', ()=>{
      if (me.renderer.domElement.style.display == 'none') {
        me.renderer.domElement.style.display = 'block';
        this.uiOverlay.show();
        this.button3D.html('Hide 3D');
        this.update();
      } else {
        me.renderer.domElement.style.display = 'none';
        this.uiOverlay.hide();
        this.button3D.html('Show 3D');
      }
    });
    controlsContainer.append(this.button3D);

    this.ui.append(controlsContainer);

    var w = Math.max(this.ui.width(), 200);
    var h = Math.max(this.ui.height(), 600);

    this.canvas = $('<canvas height=200 />');

		this.ui.append(this.canvas);

    this.uiOverlay = $('<div style="position:absolute; z-index:1000; padding: 4px 8px; color:white; display:none;">.</div>');
    this.ui.append(this.uiOverlay);

    // THREE
    var h1 = h - 200;

    console.log('THREE', w, h1);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color( 0x343a40 );
    this.camera = new THREE.PerspectiveCamera( 75, w / h1, 0.1, 1000 );
    this.camera.up = new THREE.Vector3(0, 0, 1);

    this.renderer = new THREE.WebGLRenderer();
    this.renderer.setSize( w, h1 );
    this.ui.append( this.renderer.domElement );

    // hide 3D by default
    this.renderer.domElement.style.display = 'none';

    this.camera.position.x = 7;
    this.camera.position.y = -15;
    this.camera.position.z = 10;
    this.camera.lookAt(new THREE.Vector3(0, 0, 2));

    const controls = new OrbitControls( this.camera, this.renderer.domElement );
    controls.minDistance = 10;
    controls.maxDistance = 50;
    controls.maxPolarAngle = Math.PI / 2;

    const geometry = new THREE.BoxGeometry( 1, 1, 1 );
    const material = new THREE.MeshBasicMaterial( { color: 0x00ff00 } );
    this.cube = new THREE.Mesh( geometry, material );
    this.scene.add( this.cube );

    const lineMaterial = new THREE.LineBasicMaterial( { color: 0xffffff, linewidth: 3, } );

    this.points = [];
    this.points.push( new THREE.Vector3( 0, 0, 0 ) );
    this.points.push( new THREE.Vector3( 1, 1, 10 ) );

    this.lineGeometry = new THREE.BufferGeometry().setFromPoints( this.points );
    this.line = new THREE.Line( this.lineGeometry, lineMaterial );
    this.scene.add( this.line );

    this.scene.add( new THREE.AxesHelper( 10 ) );

    this.sphereGeometry = new THREE.SphereGeometry( 0.2, 6, 6 );
    this.sphereMaterial = new THREE.MeshBasicMaterial( { color: 0xffff00 } );

    this.sphereMaterial2 = new THREE.MeshBasicMaterial( { color: 0xff00ff } );

    this.calibSphereGeometry = new THREE.SphereGeometry( 1, 20, 20 );  
    this.calibSphereMaterial = new THREE.MeshDepthMaterial( { wireframe:true, opacity:0.5 } );
    this.calibSphere = new THREE.Mesh( this.calibSphereGeometry, this.calibSphereMaterial );
    this.scene.add( this.calibSphere );

    // see if we already know key params
    var node = this.channel.node.id;
    var channel = this.channel.channel;

    // mode
    var mode = this.state.getParamValues(node, channel, 19, [0])[0];
    this.modeSelect.val(mode);

    // widget
		this.widget = $('<div class="widget"><i class="fas fa-thermometer-half"></i></div>');
		this.channel.node.addWidget(this.widget);

		this.widgetText = $('<span>?</span>');
		this.widget.append(this.widgetText);

    this.finishBuild();

    this.animate();
  }
}
