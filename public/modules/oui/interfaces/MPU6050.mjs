import ModuleInterface from './ModuleInterface.mjs';
import loadStylesheet from '../../loadStylesheet.js';
import * as DLM from '../../droneLinkMsg.mjs';

import * as THREE from 'three';


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
    this.camera.aspect = w/h;
  }


  animate() {
    if (this.visible) {
      this.cube.rotation.x += 0.01;
      this.cube.rotation.y += 0.01;

      this.renderer.render( this.scene, this.camera );
    }

    requestAnimationFrame( ()=>{ this.animate(); } );
  };


	build() {
    super.build('MPU6050');

    var w = Math.max(this.ui.width(), 100);
    var h = Math.max(this.ui.height(), 200);
    
    console.log('THREE', w, h);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera( 75, w / h, 0.1, 1000 );

    this.renderer = new THREE.WebGLRenderer();
    this.renderer.setSize( w, h );
    this.ui.append( this.renderer.domElement );

    const geometry = new THREE.BoxGeometry( 1, 1, 1 );
    const material = new THREE.MeshBasicMaterial( { color: 0x00ff00 } );
    this.cube = new THREE.Mesh( geometry, material );
    this.scene.add( this.cube );

    this.camera.position.z = 5;

    this.finishBuild();

    this.animate();
  }
}
