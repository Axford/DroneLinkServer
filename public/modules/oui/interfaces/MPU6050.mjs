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

    this.updateNeeded = true;
  }


  update() {
		if (!super.update()) return;

    var node = this.channel.node.id;
    var channel = this.channel.channel;

  
		// keep size updated
		var w = this.ui.width();
    var h = Math.max(this.ui.height(), 400) - 20;

    this.renderer.setSize( w, h );
    this.camera.updateProjectionMatrix();
    this.camera.aspect = w/h;

    var pos = this.state.getParamValues(node, channel, 10, [0,0,0]);

    var pitch = this.state.getParamValues(node, channel, 13, [0])[0];
    var roll = this.state.getParamValues(node, channel, 14, [0])[0];

    var rawVector = this.state.getParamValues(node, channel, 15, [0,0,0,0]);
    var calibX = this.state.getParamValues(node, channel, 16, [0,0,0]);
    var calibY = this.state.getParamValues(node, channel, 17, [0,0,0]);
    var calibZ = this.state.getParamValues(node, channel, 18, [0,0,0]);

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


  hide() {
    super.hide();
    this.renderer.forceContextLoss();
  }

  show() {
    super.show();
    this.renderer.forceContextRestore();
  }


	build() {
    super.build('MPU6050');

    this.modeSelect = $('<select class="modeSelect"></select>');
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

    this.ui.append(this.modeSelect);

    this.uiOverlay = $('<div style="position:absolute; z-index:1000; padding: 4px 8px; color:white">test</div>');
    this.ui.append(this.uiOverlay);

    var w = Math.max(this.ui.width(), 200);
    var h = Math.max(this.ui.height(), 400);

    console.log('THREE', w, h);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color( 0x343a40 );
    this.camera = new THREE.PerspectiveCamera( 75, w / h, 0.1, 1000 );
    this.camera.up = new THREE.Vector3(0, 0, 1);

    this.renderer = new THREE.WebGLRenderer();
    this.renderer.setSize( w, h );
    this.ui.append( this.renderer.domElement );

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

    this.finishBuild();

    this.animate();
  }
}
