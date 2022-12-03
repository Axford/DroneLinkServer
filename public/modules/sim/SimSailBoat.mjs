/*

Simulates a genric Sailing boat

*/
import SimNode from './SimNode.mjs';
import * as DLM from '../droneLinkMsg.mjs';
import Vector from '../Vector.mjs';
import https from 'https';
import { threadId } from 'worker_threads';

export default class SimSailBoat extends SimNode {
  constructor(config, mgr) {
    super(config, mgr);
    this.moduleType = 'SailBoat';
    this.lastLoop = 0;

    // pubs
    this.pubs['compass.heading'] = {
      param: 8,
      msgType: DLM.DRONE_LINK_MSG_TYPE_FLOAT,
      values: config.heading
    };

    this.pubs['gps.location'] = {
      param: 9,
      msgType: DLM.DRONE_LINK_MSG_TYPE_FLOAT,
      values: config.location
    };

    this.pubs['wind.direction'] = {
      param: 10,
      msgType: DLM.DRONE_LINK_MSG_TYPE_FLOAT,
      values: config.wind
    };

    this.pubs['wind.speed'] = {
      param: 11,
      msgType: DLM.DRONE_LINK_MSG_TYPE_FLOAT,
      values: 0.5
    };

    // subs
    this.sheetSub = new DLM.DroneLinkMsg();
    this.sheetSub.setAddress(config.sheet);
    this.sheetSub.msgType = DLM.DRONE_LINK_MSG_TYPE_FLOAT;
    this.sheetSub.values = [0];
    this.subs.push(this.sheetSub);

    this.rudderSub = new DLM.DroneLinkMsg();
    this.rudderSub.setAddress(config.rudder);
    this.rudderSub.msgType = DLM.DRONE_LINK_MSG_TYPE_FLOAT;
    this.rudderSub.values = [0];
    this.subs.push(this.rudderSub);

    this.subs.forEach((sub)=>{
      //console.log(('Sub: ' + sub.addressAsString()).blue);
    });

    // contact vectors for the sail and rudder
    this.contactVectors = [
      new Vector(0, 0),
      new Vector(0.0, -0.5)
    ];

    this.physics.m = 1;
    this.calcCylindricalInertia(0.04, 0.01);
    this.physics.angFriction = 0.1;
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

      // randomly tweak the wind
      //this.pubs['wind.direction'].values[0]
      //this.pubs['wind.direction'].values[0] += (Math.random()-0.5) * dt;

      var sailForce = 0.5;


      var rudderForce = - this.physics.v.y * 0.01 * this.rudderSub.values[0];


      // calculate impulses
      var impulses = [
        new Vector(0, sailForce),
        new Vector(rudderForce,0)
      ];

      // apply impulses
      for (var i=0; i<impulses.length; i++)
        this.applyImpulse(impulses[i], this.contactVectors[i]);

      // apply wind impulse
      var windVector = new Vector(0,0);
      // NOTE: physics angles are inverted vs compass bearings
      // make sure wind vector is in node coord frame - i.e. rotate by current heading
      windVector.fromAngle( -(this.pubs['wind.direction'].values[0] + 90) * Math.PI/180 - this.physics.a , 0.2);
      this.applyImpulse(windVector, new Vector(0,0));

      this.updatePhysics(dt);

      // update and publish
      //console.log(this.pubs['gps.location'].values, this.physics.dp);
      this.pubs['gps.location'].values  = this.calcNewCoordinatesFromTranslation(this.pubs['gps.location'].values , this.physics.dp);

      // invert heading
      this.pubs['compass.heading'].values[0] = -this.physics.aDeg;

      //console.log('new loc: ', this.pubs['gps.location'].values);

      this.publishParams();

      this.lastLoop = loopTime;
    }
  }
}
