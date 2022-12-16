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

import dgram from 'dgram';

export default class SimAISBoat extends SimNode {
  constructor(config, mgr) {
    super(config, mgr);
    this.moduleType = 'AISBoat';
    this.lastLoop = 0;
    this.heading = 0;
    this.location = config.location;
    this.lastTransmission = 0;

    this.socketReady = false;

    this.socket = dgram.createSocket('udp4');
    this.socket.bind('8500');
    this.socket.on('listening', ()=>{
      this.socketReady = true;
    });

    // contact vectors for the sail and rudder
    this.contactVectors = [
      new Vector(0, 0),
      new Vector(0.0, -0.5)
    ];

    this.physics.m = 1;
    this.calcCylindricalInertia(0.6, 0.06);
  }


  getDiagnosticString() {
    var s = this.name + '\n';
    s += ' v: ' + this.physics.v.x.toFixed(1) + ', ' + this.physics.v.y.toFixed(1) + '\n';
    s += ' angV: ' + this.physics.angV.toFixed(1) + '\n';
    s += ' heading: ' + this.heading.toFixed(1) + '\n';
    //s += ' angToWind: ' + node.angToWind.toFixed(1) + '\n';
    //s += ' polarIndex: ' + node.polarIndex + '\n';
    //s += ' sailForce: ' + node.sailForce.toFixed(2) + '\n';
    //s += ' rudderForce: ' + node.rudderForce.toFixed(2) + '\n';

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
    msg.mmsi = 235000000;
    msg.speedOverGround = 0;

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
      this.socket.send(s2.message, 8008, '255.255.255.255');
    }

    this.mgr.sendAIS(s2.message);
  }


  update() {
    super.update();

    var loopTime = (new Date()).getTime();
    var dt = (loopTime - this.lastLoop) / 1000;
    if (dt > 2*this.interval) dt = 2*this.interval;
    if (dt > this.interval) {
   
      this.thrust = 1;

      // TODO
      this.rudderForce = 0.01;

      var impulses = [
        new Vector(0, this.thrust),
        new Vector(this.rudderForce,0)
      ];

      // apply impulses
      for (var i=0; i<impulses.length; i++)
        this.applyImpulse(impulses[i], this.contactVectors[i]);

      this.updatePhysics(dt);

      // update and publish
      this.location = this.calcNewCoordinatesFromTranslation(this.location , this.physics.dp); 
      this.heading = -this.physics.aDeg;  

      if (loopTime > this.lastTransmission + 1000) {
        this.transmitAIS();
        this.lastTransmission = loopTime;
      }

      //this.publishParams();

      this.lastLoop = loopTime;
    }
  }
}
