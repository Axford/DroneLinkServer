import ModuleInterface from './ModuleInterface.mjs';
import loadStylesheet from '../../loadStylesheet.js';
import * as DLM from '../../droneLinkMsg.mjs';
import {degreesToRadians} from '../../navMath.mjs';

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export default class HMC5883L extends ModuleInterface {
	constructor(channel, state) {
    super(channel, state);

    this.rawVectors = [];  // history of raw vector values
    this.rawVectors2 = [];  // history of raw non-tilt-compensated vector values

    this.spheres = [];
    this.sphereIndex = 0;

    this.spheres2 = [];
    this.sphereIndex2 = 0;
	}

	onParamValue(data) {
    if (!this.built) return;

		// heading
		if (data.param == 11 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_FLOAT) {
			// pass onto node for mapping
			this.channel.node.updateMapParam('heading', 3, data.values, this.channel.channel, 11);
		}

    if (data.param == 10 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_FLOAT) {

			this.rawVectors.push(data.values);

      //console.log('new compass vector: ',this.rawVectors);

      // if too many vectors, lose one
      if (this.rawVectors.length > 200) this.rawVectors.shift();
		}

    if (data.param == 21 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_FLOAT) {

			this.rawVectors2.push(data.values);

      // if too many vectors, lose one
      if (this.rawVectors2.length > 200) this.rawVectors2.shift();
		}

    // mode
    if (data.param == 20 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_UINT8_T) {
      this.modeSelect.val(data.values[0]);
    }

    this.updateNeeded = true;
  }

  update() {
		if (!super.update()) return;

    var node = this.channel.node.id;
    var channel = this.channel.channel;


		var c = this.canvas[0];
		var ctx = c.getContext("2d");

		// keep width updated
		var w = this.ui.width();
		ctx.canvas.width = w;
    var h = 200;

    // keep size updated
    var h1 = Math.max(ctx.canvas.height, 600) - 200;
    this.renderer.setSize( w, h1 );
    this.camera.updateProjectionMatrix();
    this.camera.aspect = w/h1;

    // fetch params
    var heading = this.state.getParamValues(node, channel, 11, [0])[0];
    var h2 = (heading - 90) * Math.PI / 180;

    var rawVector = this.state.getParamValues(node, channel, 10, [0,0,0,0]);
    var calibX = this.state.getParamValues(node, channel, 13, [0,0,0]);
    var calibY = this.state.getParamValues(node, channel, 14, [0,0,0]);
    var calibZ = this.state.getParamValues(node, channel, 15, [0,0,0]);
		var limits = this.state.getParamValues(node, channel, 18, [0,0,0,0]);
		var samples = this.state.getParamValues(node, channel, 19, [0,0,0,0]);
		var trim = this.state.getParamValues(node, channel, 15, [0]);

    var pitch = this.state.getParamValues(node, channel, 22, [0])[0];
    var roll = this.state.getParamValues(node, channel, 24, [0])[0];

    var rawVector2 = this.state.getParamValues(node, channel, 21, [0,0,0,0]);

    // render vector view
    // -------------------------------------------------------------------------
    var w2 = w/2;
    var x2 = w2;
    var cx2 = x2 + w2/2;

    ctx.fillStyle = '#343a40';
		ctx.fillRect(x2,0,w2,h);

    // axes
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 1;
    // x
    ctx.beginPath();
    ctx.moveTo(x2, h/2);
    ctx.lineTo(x2 + w2, h/2);
    ctx.stroke();
    // y
    ctx.beginPath();
    ctx.moveTo(cx2, 0);
    ctx.lineTo(cx2, h);
    ctx.stroke();


    // draw rawVectors
    ctx.fillStyle = '#55f';
    ctx.strokeStyle = "#aaf";

		// update maxVal
		var maxVal = 1;
  
    var scaling = 1;
		if (w2 < h) {
			scaling = 0.8 * (w2/2) / maxVal;
		} else {
			scaling = 0.8 * (h/2) / maxVal;
		}

    for (var i=0; i<this.rawVectors.length; i++) {
      /*
      if (i == this.rawVectors.length-1) {
        ctx.fillStyle = '#afa';
        ctx.strokeStyle = "#afa";
      }
      */
      ctx.fillStyle = this.rawVectors[i][3] == 1 ? '#55f' : '#555';
      ctx.strokeStyle = this.rawVectors[i][3] == 1 ? '#aaf' : '#888';
      var x = cx2 + this.rawVectors[i][0] * scaling;
      var y = h/2 - this.rawVectors[i][1] * scaling;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
    }

		//
		var bcx = cx2; 
		var bcy = h/2;

    // draw latest vector
    if (this.rawVectors.length > 0) {
      var vx = cx2 + this.rawVectors[this.rawVectors.length-1][0] * scaling;
      var vy = h/2 - this.rawVectors[this.rawVectors.length-1][1] * scaling;
      ctx.strokeStyle = '#afa';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(bcx, bcy);
      ctx.lineTo(vx, vy);
      ctx.stroke();
    }


    // render compass
    // -------------------------------------------------------------------------
    var w1 = w/2;
    var h1 = 0.6 * h;
		var cx = w1/2;
    var cy = h1/2;
    
    var r = Math.min(w1, h1) * 0.4;

		ctx.fillStyle = '#343a40';
		ctx.fillRect(0,0,w1,h);

		this.drawCompassIndicator(cx, cy, r, 25, h2, heading.toFixed(0), 20);


    // render artificial horizons
    // -------------------------------------------------------------------------
    w1 = w/2;
		cy = h * 0.8;

		//ctx.fillStyle = '#343a40';
		//ctx.fillRect(w/2,0,w1,h);

    // pitch
    // positive pitch is up, negative is down
    var cx1 = w1/4;
    var r1 = w/8-5;

    var pitchAng = degreesToRadians(-pitch); 
    this.drawCompassIndicator(cx1, cy, r1, 20, pitchAng, pitch.toFixed(0), 15);

    this.drawPill('Pitch', cx1, h*0.55, 50, '#000');

    // roll
    // positive roll is to the right, negative to the left

    cx1 = 3*w1/4
    var rollAng = degreesToRadians((-roll) - 90);  // zero roll is a vector pointing straight up, positive roll is to port
    this.drawCompassIndicator(cx1, cy, r1, 20, rollAng, roll.toFixed(0), 15);

    this.drawPill('Roll', cx1, h*0.55, 50, '#000');


    // 3D
    // -------------------------------------------------------------------------
    // add vector to 3D visualisation
    var sphere;
    if (this.spheres.length < 300) {
      sphere = new THREE.Mesh( this.sphereGeometry, this.sphereMaterial );
      this.scene.add( sphere );
      this.spheres.push(sphere);
    } else {
      sphere = this.spheres[this.sphereIndex];
      this.sphereIndex++;
      if (this.sphereIndex >= this.spheres.length) this.sphereIndex = 0;
    }
    
    sphere.position.x = rawVector[0];
    sphere.position.y = rawVector[1];
    sphere.position.z = rawVector[2];

    // add super raw vector to 3D visualisation
    var sphere2;
    if (this.spheres2.length < 300) {
      sphere2 = new THREE.Mesh( this.sphereGeometry, this.sphereMaterial2 );
      this.scene.add( sphere2 );
      this.spheres2.push(sphere2);
    } else {
      sphere2 = this.spheres2[this.sphereIndex2];
      this.sphereIndex2++;
      if (this.sphereIndex2 >= this.spheres2.length) this.sphereIndex2 = 0;
    }
    
    sphere2.position.x = rawVector2[0];
    sphere2.position.y = rawVector2[1];
    sphere2.position.z = rawVector2[2];

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
		super.build('HMC5883L');

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
			qm.param = 20;
			qm.setUint8([ newMode ]);
			this.state.send(qm);

      this.queryParam(20);
    });

    this.ui.append(this.modeSelect);


    var w = Math.max(this.ui.width(), 200);
    var h = Math.max(this.ui.height(), 600);

    this.canvas = $('<canvas height=200 />');

		this.ui.append(this.canvas);

    // THREE
    var h1 = h - 200;

    console.log('THREE', w, h1);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera( 75, w / h1, 0.1, 1000 );
    this.camera.up = new THREE.Vector3(0, 0, 1);

    this.renderer = new THREE.WebGLRenderer();
    this.renderer.setSize( w, h1 );
    this.ui.append( this.renderer.domElement );

    const controls = new OrbitControls( this.camera, this.renderer.domElement );
    controls.minDistance = 5;
    controls.maxDistance = 100;
    controls.maxPolarAngle = Math.PI / 2;

    const geometry = new THREE.BoxGeometry( 1, 1, 1 );
    const material = new THREE.MeshBasicMaterial( { color: 0x00ff00 } );
    this.cube = new THREE.Mesh( geometry, material );
    this.scene.add( this.cube );

    this.scene.add( new THREE.AxesHelper( 10 ) );

    this.camera.position.z = 12;

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
    var mode = this.state.getParamValues(node, channel, 20, [0])[0];
    this.modeSelect.val(mode);


    super.finishBuild();
    this.animate();
  }
}
