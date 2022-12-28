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

  update() {
		if (!super.update()) return;

    var node = this.channel.node.id;
    var channel = this.channel.channel;

		// keep size updated
		var w = this.ui.width();
    var h = Math.max(this.ui.height(), 200);

    this.renderer.setSize( w, h );
    this.camera.updateProjectionMatrix();
    this.camera.aspect = w/h;

    var pos = this.state.getParamValues(node, channel, 10, [0,0,0]);

    this.cube.position.x = pos[0];
    this.cube.position.y = pos[1];
    this.cube.position.z = pos[2];

    const positions = this.line.geometry.attributes.position.array;
    positions[3] = pos[0];
    positions[4] = pos[1];
    positions[5] = pos[2];
    this.line.geometry.attributes.position.needsUpdate = true;

    var m = Math.sqrt(pos[0]*pos[0] + pos[1]*pos[1] + pos[2]*pos[2]);

    var s = 'x: ' + pos[0].toFixed(1) + '<br/>';
    s += 'y: ' + pos[1].toFixed(1) + '<br/>';
    s += 'z: ' + pos[2].toFixed(1) + '<br/>';
    s += 'mag: ' + m.toFixed(1) + '<br/>';
    this.uiOverlay.html(s);
  }


  animate() {
    if (this.visible) {
      

      this.renderer.render( this.scene, this.camera );
    }

    requestAnimationFrame( ()=>{ this.animate(); } );
  };


	build() {
    super.build('MPU6050');

    this.uiOverlay = $('<div style="position:absolute; z-index:1000; padding: 4px 8px; color:white">test</div>');
    this.ui.append(this.uiOverlay);

    var w = Math.max(this.ui.width(), 100);
    var h = Math.max(this.ui.height(), 200);
    
    console.log('THREE', w, h);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera( 75, w / h, 0.1, 1000 );
    this.camera.up = new THREE.Vector3(0, 0, 1);

    this.renderer = new THREE.WebGLRenderer();
    this.renderer.setSize( w, h );
    this.ui.append( this.renderer.domElement );

    const controls = new OrbitControls( this.camera, this.renderer.domElement );
    controls.minDistance = 10;
    controls.maxDistance = 20;
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

    this.camera.position.z = 12;

    this.finishBuild();

    this.animate();
  }
}
