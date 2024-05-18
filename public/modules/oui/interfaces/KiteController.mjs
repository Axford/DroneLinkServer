import ModuleInterface from "./ModuleInterface.mjs";
import loadStylesheet from "../../loadStylesheet.js";
import * as DLM from "../../droneLinkMsg.mjs";
import { degreesToRadians } from "../../navMath.mjs";

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export default class KiteController extends ModuleInterface {
    constructor(channel, state) {
        super(channel, state);

        this.lastVec = [0, 0, 30, 0]; // yaw, pitch, distance, roll

        this.lastPos = [0,0,0];  // in base coordinate frame

        this.rawVectors = []; // history of raw vector values

        this.spheres = [];
        this.sphereIndex = 0;

        // snail trail line objects
        this.trail = [];
        this.trailIndex = 0;
    }

    onParamValue(data) {
        if (!this.built) return;

        if (data.param == 22 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_FLOAT) {
            // yaw
            this.lastVec[0] = data.values[0];
            this.rawVectors.push(_.clone(this.lastVec));
        }

        if (data.param == 24 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_FLOAT) {
            // pitch
            this.lastVec[1] = data.values[0];
            this.rawVectors.push(_.clone(this.lastVec));
        }

        // if too many vectors, lose one
        if (this.rawVectors.length > 200) this.rawVectors.shift();

        // mode
        if (
            data.param == 10 &&
            data.msgType == DLM.DRONE_LINK_MSG_TYPE_UINT8_T
        ) {
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
        this.renderer.setSize(w, h1);
        this.camera.updateProjectionMatrix();
        this.camera.aspect = w / h1;

        // fetch params
        var limits = this.state.getParamValues(node, channel, 12, [0, 0]);
        var trim = this.state.getParamValues(node, channel, 11, [0]);

        // render vector view
        // -------------------------------------------------------------------------
        var w2 = w / 2;
        var x2 = w2;
        var cx2 = x2 + w2 / 2;

        ctx.fillStyle = "#343a40";
        ctx.fillRect(x2, 0, w2, h);

        // render info
        // -------------------------------------------------------------------------
        var w1 = w;
        var cx = w1 / 2;
        var cy = h1 / 2;

        var r = Math.min(w1, h1) * 0.4;

        ctx.fillStyle = "#343a40";
        ctx.fillRect(0, 0, w1, h);

        this.drawValue(5, 0, "Yaw", this.lastVec[0].toFixed(0), "#8f8");
        this.drawValue(5, 40, "Pitch", this.lastVec[1].toFixed(0), "#8f8");
        this.drawValue(5, 80, "Distance", this.lastVec[2].toFixed(0), "#8f8");
        this.drawValue(5, 120, "Roll", this.lastVec[3].toFixed(0), "#8f8");

        // X = forward
        var yaw = degreesToRadians(this.lastVec[0]);
        var pitch = degreesToRadians(this.lastVec[1]);
        var dist = this.lastVec[2];

        var d2 = dist * Math.cos(pitch); // dist in XY plane

        var kx = d2 * Math.cos(yaw);
        var ky = d2 * Math.sin(yaw);
        var kz = dist * Math.sin(pitch);

        // 3D
        // -------------------------------------------------------------------------
        // add vector to 3D visualisation
/*
        var sphere;
        if (this.spheres.length < 300) {
            sphere = new THREE.Mesh(this.sphereGeometry, this.sphereMaterial);
            this.scene.add(sphere);
            this.spheres.push(sphere);
        } else {
            sphere = this.spheres[this.sphereIndex];
            this.sphereIndex++;
            if (this.sphereIndex >= this.spheres.length) this.sphereIndex = 0;
        }

        sphere.position.x = kx;
        sphere.position.y = ky;
        sphere.position.z = kz;
        */

        // update snail trail
        var tl = this.trail[this.trailIndex];
        this.trailIndex++;
        if (this.trailIndex >= this.trail.length) this.trailIndex = 0;
        var tlpos = tl.geometry.attributes.position.array;
        tlpos[0] = this.lastPos[0];
        tlpos[1] = this.lastPos[1];
        tlpos[2] = this.lastPos[2];
        tlpos[3] = kx;
        tlpos[4] = ky;
        tlpos[5] = kz;
        tl.geometry.attributes.position.needsUpdate = true;
        tl.material.opacity = 1;

        // nudge down opacity of all other elements
        var j = this.trailIndex-1;
        if (j<0) j = this.trail.length-1;

        while (j != this.trailIndex) {
            this.trail[j].material.opacity *= (1 - 1/this.trail.length);
            j--;
            if (j<0) j = this.trail.length-1;
        }
        
        

        // visualise raw vector
        const positions = this.line.geometry.attributes.position.array;
        positions[0] = 0;
        positions[1] = 0;
        positions[2] = 0;
        positions[3] = kx;
        positions[4] = ky;
        positions[5] = kz;
        this.line.geometry.attributes.position.needsUpdate = true;

        this.lastPos[0] = kx;
        this.lastPos[1] = ky;
        this.lastPos[2] = kz;
    }

    animate() {
        if (this.visible) {
            this.renderer.render(this.scene, this.camera);
        }

        requestAnimationFrame(() => {
            this.animate();
        });
    }

    build() {
        super.build("KiteController");
        var me = this;

        var controlsContainer = $('<div class="form-row mr-1 ml-1" />');

        this.modeSelect = $(
            '<select class="col-8 custom-select custom-select-sm modeSelect"></select>'
        );
        // add mode options
        this.modeSelect.append($('<option value="0">Manual</option>'));
        this.modeSelect.append($('<option value="1">Auto</option>'));
        this.modeSelect.change((e) => {
            // get value
            var newMode = this.modeSelect.val();

            var qm = new DLM.DroneLinkMsg();
            qm.node = this.channel.node.id;
            qm.channel = this.channel.channel;
            qm.param = 10;
            qm.setUint8([newMode]);
            this.state.send(qm);

            this.queryParam(10);
        });
        controlsContainer.append(this.modeSelect);

        this.button3D = $(
            '<button class="col-4 btn btn-sm btn-primary">Show 3D</button>'
        );
        this.button3D.on("click", () => {
            if (me.renderer.domElement.style.display == "none") {
                me.renderer.domElement.style.display = "block";
                this.button3D.html("Hide 3D");
                this.update();
            } else {
                me.renderer.domElement.style.display = "none";
                this.button3D.html("Show 3D");
            }
        });
        controlsContainer.append(this.button3D);

        this.ui.append(controlsContainer);

        var w = Math.max(this.ui.width(), 200);
        var h = Math.max(this.ui.height(), 600);

        this.canvas = $("<canvas height=200 />");

        this.ui.append(this.canvas);

        // THREE
        var h1 = h - 200;

        console.log("THREE", w, h1);
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x343a40);
        this.camera = new THREE.PerspectiveCamera(75, w / h1, 0.1, 1000);
        this.camera.up = new THREE.Vector3(0, 0, 1);

        this.renderer = new THREE.WebGLRenderer();
        this.renderer.setSize(w, h1);
        this.ui.append(this.renderer.domElement);

        // hide 3D by default
        this.renderer.domElement.style.display = "none";

        this.camera.position.x = -30;
        this.camera.position.y = 5;
        this.camera.position.z = 20;

        const controls = new OrbitControls(
            this.camera,
            this.renderer.domElement
        );
        controls.minDistance = 5;
        controls.maxDistance = 100;
        controls.maxPolarAngle = Math.PI / 2;


        this.camera.lookAt(new THREE.Vector3(30, 0, 20));

        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        this.cube = new THREE.Mesh(geometry, material);
        this.scene.add(this.cube);

        // kite line
        const lineMaterial = new THREE.LineBasicMaterial({
            color: 0xffffff,
            linewidth: 3,
        });

        this.points = [];
        this.points.push(new THREE.Vector3(0, 0, 0));
        this.points.push(new THREE.Vector3(1, 1, 10));

        this.lineGeometry = new THREE.BufferGeometry().setFromPoints(
            this.points
        );
        this.line = new THREE.Line(this.lineGeometry, lineMaterial);
        this.scene.add(this.line);


        // snail trail
        for (var i=0; i<50; i++) {
            var points = [ new THREE.Vector3(i, 0, i), new THREE.Vector3(0, 0, (i+1)) ];
            var lineMat = new THREE.LineBasicMaterial({
                color: 0xffff00,
                linewidth: 3,
                opacity: 0,
                transparent: true
            });
            var lineGeo = new THREE.BufferGeometry().setFromPoints( points );
            var line = new THREE.Line(lineGeo, lineMat);
            this.scene.add(line);
            this.trail.push(line);
        }


        // axis helper
        this.scene.add(new THREE.AxesHelper(10));

        // commonn geometry and material for position spheres
        this.sphereGeometry = new THREE.SphereGeometry(0.2, 6, 6);
        this.sphereMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
        this.sphereMaterial2 = new THREE.MeshBasicMaterial({ color: 0xff00ff });

        // see if we already know key params
        var node = this.channel.node.id;
        var channel = this.channel.channel;

        // mode
        var mode = this.state.getParamValues(node, channel, 10, [0])[0];
        this.modeSelect.val(mode);

        super.finishBuild();
        this.animate();
    }
}
