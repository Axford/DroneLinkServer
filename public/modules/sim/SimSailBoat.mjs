/*

Simulates a genric Sailing boat

*/
import SimNode from './SimNode.mjs';
import * as DLM from '../droneLinkMsg.mjs';
import Vector from '../Vector.mjs';
import https from 'https';
import { threadId } from 'worker_threads';




function radiansToDegrees(a) {
  return a * 180 / Math.PI;
}

function degreesToRadians(a) {
  return a * Math.PI / 180;
}

function fmod(a,b) { return Number((a - (Math.floor(a / b) * b)).toPrecision(8)); };


function shortestSignedDistanceBetweenCircularValues(origin, target){
  var signedDiff = 0.0;
  var raw_diff = origin > target ? origin - target : target - origin;
  var mod_diff = fmod(raw_diff, 360); //equates rollover values. E.g 0 == 360 degrees in circle

  if(mod_diff > (360/2) ){
    //There is a shorter path in opposite direction
    signedDiff = (360 - mod_diff);
    if(target>origin) signedDiff = signedDiff * -1;
  } else {
    signedDiff = mod_diff;
    if(origin>target) signedDiff = signedDiff * -1;
  }

  return signedDiff;
}


function calculateDistanceBetweenCoordinates(lon1, lat1, lon2, lat2) {
  const R = 6371e3; // metres
  var lat1r = lat1 * Math.PI/180; // φ, λ in radians
  var lat2r = lat2 * Math.PI/180;
  var lon1r = lon1 * Math.PI/180; // φ, λ in radians
  var lon2r = lon2 * Math.PI/180;

  var x = (lon2r-lon1r) * Math.cos((lat1r+lat2r)/2);
  var y = (lat2r-lat1r);
  var d = Math.sqrt(x*x + y*y) * R;

  return d;
}



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

    this.pubs['gps.speedOverGround'] = {
      param: 12,
      msgType: DLM.DRONE_LINK_MSG_TYPE_FLOAT,
      values: [0]
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

    this.physics.m = 2;
    this.calcCylindricalInertia(0.04, 0.01);
    this.physics.friction = 0.00001;
    this.physics.angFriction = 0.07;

    this.heading = 0;
    this.angToWind = 0;
    this.polarIndex = 0;
    this.sailForce = 0;
    this.rudderForce = 0;
  }

  getDiagnosticString() {
    var s = this.node + ': ' + this.name + '\n';
    s += ' v: ' + this.physics.v.x.toFixed(1) + ', ' + this.physics.v.y.toFixed(1) + '\n';
    s += ' angV: ' + this.physics.angV.toFixed(1) + '\n';
    s += ' heading: ' + this.heading.toFixed(1) + '\n';
    s += ' angToWind: ' + this.angToWind.toFixed(1) + '\n';
    s += ' polarIndex: ' + this.polarIndex + '\n';
    s += ' sailForce: ' + this.sailForce.toFixed(2) + '\n';
    s += ' rudderForce: ' + this.rudderForce.toFixed(2) + '\n';

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

      // randomly tweak the wind
      //this.pubs['wind.direction'].values[0]
      //this.pubs['wind.direction'].values[0] += (Math.random()-0.5) * dt;

      // calc sail force based on polar
      // calc angle of heading relative to wind and thereby index into polar

      this.heading = -this.physics.aDeg;
      this.angToWind = Math.abs(shortestSignedDistanceBetweenCircularValues(this.config.wind, this.heading));
      this.polarIndex = Math.floor(this.angToWind / 11.25);

      if (this.olarIndex < 0) this.polarIndex = 0;
      if (this.polarIndex > 15) this.polarIndex = 15;

      this.polarVal = this.config.polar[this.polarIndex] / 255.0;

      this.sailForce = 0.7 * this.polarVal + 0;

      // calc rudder force based on forward velocity (y)
      this.rudderForce = - this.physics.v.y * 0.07 * this.rudderSub.values[0];


      // calculate impulses
      var impulses = [
        new Vector(0, this.sailForce),
        new Vector(this.rudderForce,0)
      ];

      // apply impulses
      for (var i=0; i<impulses.length; i++)
        this.applyImpulse(impulses[i], this.contactVectors[i]);

      // apply wind impulse
      var windVector = new Vector(0,0);
      // NOTE: physics angles are inverted vs compass bearings
      // make sure wind vector is in node coord frame - i.e. rotate by current heading
      windVector.fromAngle( -(this.pubs['wind.direction'].values[0] + 90) * Math.PI/180 - this.physics.a , 0.1);
      this.applyImpulse(windVector, new Vector(0,0.005));

      this.updatePhysics(dt);

      // update and publish
      //console.log(this.pubs['gps.location'].values, this.physics.dp);
      this.pubs['gps.location'].values  = this.calcNewCoordinatesFromTranslation(this.pubs['gps.location'].values , this.physics.dp);

      // invert heading
      this.pubs['compass.heading'].values[0] = this.heading;

      // update speed over ground
      this.pubs['gps.speedOverGround'].values[0] = this.physics.v.y * 1.94384;  // convert to knots

      //console.log('new loc: ', this.pubs['gps.location'].values);

      this.publishParams();

      this.lastLoop = loopTime;
    }
  }
}
