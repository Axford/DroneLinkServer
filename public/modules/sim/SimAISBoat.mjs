/*

Simulates an AI boat with AIS transponder... 

*/
import SimNode from './SimNode.mjs';
import * as DLM from '../droneLinkMsg.mjs';
import Vector from '../Vector.mjs';
import https from 'https';
import AisMessage18 from '../AisMessage18.mjs';
import AisSentence from '../AisSentence.mjs';
import AisBitField from '../AisBitField.mjs';
import { degreesToRadians } from '../navMath.mjs';

import dgram from 'dgram';

import {calculateDistanceBetweenCoordinates, shortestSignedDistanceBetweenCircularValues, calculateInitialBearingBetweenCoordinates} from '../navMath.mjs';

export default class SimAISBoat extends SimNode {
  constructor(config, mgr) {
    super(config, mgr);
    this.moduleType = 'AISBoat';
    this.lastLoop = 0;
    this.heading = config.heading[0];
    this.location = config.location;
    this.lastTransmission = 0;
    this.speedOverGround = 0;
    this.waypoint = 0;
    this.waypoints = config.waypoints;
    this.speedIError = 0;
    this.mmsi = config.mmsi;
    this.transmissionDelay = 1000;

    this.socketReady = false;

    this.socket = dgram.createSocket('udp4');
    this.socket.bind(8500 + mgr.nodes.length);
    this.socket.on('listening', ()=>{
      this.socketReady = true;

    });

    // contact vectors for the sail and rudder
    this.contactVectors = [
      new Vector(0, 0),
      new Vector(0.0, -0.5)
    ];

    this.physics.a = degreesToRadians(this.heading);
    this.physics.m = 1;
    this.calcCylindricalInertia(0.3, 0.06);
  }


  getDiagnosticString() {
    var s = this.name + '\n';
    s += ' v: ' + this.physics.v.x.toFixed(4) + ', ' + this.physics.v.y.toFixed(4) + '\n';
    s += ' angV: ' + this.physics.angV.toFixed(4) + '\n';
    s += ' heading: ' + this.heading.toFixed(1) + '\n';
    s += ' thrust: ' + this.thrust.toFixed(1) + '\n';
    s += ' SOG: ' + (this.speedOverGround * 1.94384).toFixed(1) + ' ks\n';
    s += ' Waypoint: ' + this.waypoint +' / ' + this.waypoints.length + ' : ' + (this.distanceToWaypoint/1000).toFixed(2) + ' km\n';
    //s += ' angToWind: ' + node.angToWind.toFixed(1) + '\n';
    //s += ' polarIndex: ' + node.polarIndex + '\n';
    //s += ' sailForce: ' + node.sailForce.toFixed(2) + '\n';
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


  transmitAIS() {
    // construct AIS message
    var msg = new AisMessage18(18, 'A');
    msg.lon = this.location[0];
    msg.lat = this.location[1];

    // make sure heading is in positive regiob 0..360
    var h = this.heading;
    h = h % 360;
    if (h<0) h+=360;
    msg.courseOverGround = h;
    msg.heading = h;
    msg.mmsi = this.mmsi;
    // convert to knots
    msg.speedOverGround = this.speedOverGround * 1.94384;

    // convert to a bitField
    var bitField = new AisBitField();
    msg.populateBitField(bitField); 
    bitField.convertBinaryToText();

    // package into an NMEA sentence
    var s2 = new AisSentence();
    s2.channel = 'A';
    s2.fillBits = 0;
    s2.numParts = 1;
    s2.partId = 0;
    s2.partNumber = 1;
    s2.payload = bitField.payload;
    s2.talkerId = 'AI';
    s2.type = 'VDM';

    s2.toSentence();

    this.mgr.onLog(s2.message);

    if (this.socketReady) {
      this.socket.send(s2.message, 8008, '192.168.0.72');
    }

    this.mgr.sendAIS(s2.message);
  }


  update() {
    super.update();

    var loopTime = (new Date()).getTime();
    var dt = (loopTime - this.lastLoop) / 1000;
    if (dt > 2*this.interval) dt = 2*this.interval;
    if (dt > this.interval) {

      // get waypoint target
      var target = this.waypoints[this.waypoint];

      // calculate heading to next waypoint
      var targetHeading = calculateInitialBearingBetweenCoordinates(this.location[0], this.location[1], target[0], target[1]);

      // calculate distance to next waypoint
      this.distanceToWaypoint = calculateDistanceBetweenCoordinates(this.location, target);

      // calculate heading error
      var herr = shortestSignedDistanceBetweenCircularValues(this.heading, targetHeading);

      // PID control of rudder
      this.rudderForce = -herr * 0.0002 * this.speedOverGround;

      // check angV isn't too high
      if (Math.abs(this.physics.angV) > 0.01) this.rudderForce = 0;

      // set target speed
      var targetSpeed = this.config.targetSpeed;

      // reduce target speed if heading error is too high
      if (Math.abs(herr) >5) {
        targetSpeed = 1;
      }

      // calc motor thrust
      var speedErr = targetSpeed - (this.speedOverGround * 1.94384);
      this.speedIError += speedErr*dt;
      this.thrust = speedErr * 2 + this.speedIError * 0.1;
      if (this.thrust < 0) this.thrust = 0;
      if (this.thrust > 2) this.thrust = 2;

      

      var impulses = [
        new Vector(0, this.thrust),
        new Vector(this.rudderForce,0)
      ];

      // apply impulses
      for (var i=0; i<impulses.length; i++)
        this.applyImpulse(impulses[i], this.contactVectors[i]);

      this.updatePhysics(dt);

      // update and publish
      var oldLocation = this.location;
      this.location = this.calcNewCoordinatesFromTranslation(this.location , this.physics.dp); 
      this.heading = -this.physics.aDeg;
      
      var speed = calculateDistanceBetweenCoordinates(oldLocation, this.location) / dt;
      this.speedOverGround = ((this.speedOverGround * 9) + speed) / 10;

      if (loopTime > this.lastTransmission + this.transmissionDelay) {
        this.transmitAIS();
        this.lastTransmission = loopTime;
        this.transmissionDelay = 1000 + Math.random()*10000;
      }

      //this.publishParams();

      // update waypoint number for next cycle
      if (this.distanceToWaypoint < target[2]) {
        this.waypoint++;
        if (this.waypoint >= this.waypoints.length) this.waypoint = 0;
      }

      this.lastLoop = loopTime;
    }
  }
}
