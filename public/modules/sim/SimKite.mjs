/*

Simulates a Kite

*/
import SimNode from './SimNode.mjs';
import * as DLM from '../droneLinkMsg.mjs';
import Vector from '../Vector.mjs';
import https from 'https';
import { degreesToRadians } from '../navMath.mjs';

export default class SimKite extends SimNode {
  constructor(config, mgr) {
    super(config, mgr);
    this.moduleType = 'Kite';
    this.lastLoop = 0;

    // pubs (simulated sensors)
    this.pubs['yaw'] = {
      param: 9,
      msgType: DLM.DRONE_LINK_MSG_TYPE_FLOAT,
      values: [0]
    };

    this.pubs['pitch'] = {
      param: 10,
      msgType: DLM.DRONE_LINK_MSG_TYPE_FLOAT,
      values: [0]
    };

    // subs (to control outputs of the KiteController module)
    this.leftSub = new DLM.DroneLinkMsg();
    this.leftSub.setAddress(config.left);
    this.leftSub.msgType = DLM.DRONE_LINK_MSG_TYPE_FLOAT;
    this.leftSub.values = [1];
    this.subs.push(this.leftSub);

    this.rightSub = new DLM.DroneLinkMsg();
    this.rightSub.setAddress(config.right);
    this.rightSub.msgType = DLM.DRONE_LINK_MSG_TYPE_FLOAT;
    this.rightSub.values = [1];
    this.subs.push(this.rightSub);

    this.subs.forEach((sub)=>{
      console.log(('Sub: ' + sub.addressAsString()).blue);
    });

    // contact vectors for the motors
    this.contactVectors = [
      new Vector(-0.06, 0),
      new Vector(0.06, 0)
    ];

    this.physics.m = 1;
    //this.calcCylindricalInertia(0.6, 0.06);

  }


  getDiagnosticString() {
    var s = this.node + ': ' + this.name + '\n';
    s += ' L: ' + this.leftSub.values[0].toFixed(1) + ', R: ' + this.rightSub.values[0].toFixed(1) + '\n';
    s += ' p: ' + this.physics.p.x.toFixed(1) + ', ' + this.physics.p.y.toFixed(1) + '\n';
    s += ' v: ' + this.physics.v.x.toFixed(1) + ', ' + this.physics.v.y.toFixed(1) + '\n';
    s += ' a: ' + this.physics.a.toFixed(1) + '\n';
    s += ' angV: ' + this.physics.angV.toFixed(1) + '\n';

    return s;
  }


  handleLinkMessage(msg) {
    super.handleLinkMessage(msg);

    if (msg.node == this.node &&
        msg.channel == this.module) {
      // its for us


    }
  }



  update() {
    super.update();

    var loopTime = (new Date()).getTime();
    var dt = (loopTime - this.lastLoop) / 1000;
    if (dt > 2*this.interval) dt = 2*this.interval;
    if (dt > this.interval) {
      //console.log(('dt: '+dt).white);

      // all forces act through centre of "kite" in this simplified model
      var centrePoint = new Vector(0,0);

      // calc rotational force from difference in motor lengths
      var left = this.leftSub.values[0];
      var right = this.rightSub.values[0];

      var angF = 0.3 * (left - right);
      this.physics.angV = angF;

      // calc and apply local lift force
      // lift force in direction of airfoil decreases as yaw/pitch increase = cosine law
      var windL = 10 * Math.cos(degreesToRadians(this.physics.p.y)) * Math.cos(degreesToRadians(this.physics.p.x));
      this.applyImpulse(new Vector(0, windL), centrePoint);

      // calc and apply drag force in direction of yaw = 0, pitch = 0
      // drag area decreases as pitch/yaw increase (i.e. smaller cross-section hits the wind) = cosine law
      // however the component of drag acting to alter pitch/yaw increases = sin law
      // these cancel each other out and become a constant drag
      var windF = 1;
      // calc in world coordinates... i.e. the inverse of current position
      var windDV = new Vector(-this.physics.p.x,  -this.physics.p.y);
      windDV.setLength(windF);
      this.applyWorldVelocity(windDV);


      if (this.physics.p.y < 0) {
        this.physics.p.y = 0;
        this.physics.v.multiply(0);
      }

      this.updatePhysics(dt);

      // update and publish
      //console.log(this.pubs['gps.location'].values, this.physics.dp);
      //this.pubs['gps.location'].values  = this.calcNewCoordinatesFromTranslation(this.pubs['gps.location'].values , this.physics.dp);

      // limit range of yaw and pitch
      if (this.physics.p.x < -90) this.physics.p.x = -90;
      if (this.physics.p.x > 90) this.physics.p.x = 90;
      if (this.physics.p.y < 0) this.physics.p.y = 0;
      if (this.physics.p.y > 90) this.physics.p.y = 90;

      // cap velocity if on the grounsd
      if (this.physics.p.y == 0) {
        this.physics.v.multiply(0);
      }

      // add sensor noise to outputs
      this.pubs['yaw'].values[0] = this.physics.p.x + (0.2*Math.random() - 0.1);
      this.pubs['pitch'].values[0] = this.physics.p.y + (0.2*Math.random() - 0.1);

      // invert heading
      //this.pubs['compass.heading'].values[0] = -this.physics.aDeg;

      //console.log('new loc: ', this.pubs['gps.location'].values);

      this.publishParams();

      this.lastLoop = loopTime;
    }
  }
}
