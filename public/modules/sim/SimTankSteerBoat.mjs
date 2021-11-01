/*

Simulates a TankSteer boat

*/
import SimNode from './SimNode.mjs';
import * as DLM from '../droneLinkMsg.mjs';
import Vector from '../Vector.mjs';


export default class SimTankSteerBoat extends SimNode {
  constructor(config, mgr) {
    super(config, mgr);
    this.moduleType = 'TankSteerBoat';
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

    // subs
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
    this.calcCylindricalInertia(0.6, 0.06);
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

      // convert motor speeds to impulse vectors
      var fv = 0.5;

      // apply deadband
      if (this.leftSub.values[0] < 0.3) this.leftSub.values[0] = 0;
      if (this.rightSub.values[0] < 0.3) this.rightSub.values[0] = 0;

      var forces = [
        this.leftSub.values[0] * fv,
        this.rightSub.values[0] * fv
      ];

      // calculate impulses from motor speeds
      var impulses = [
        new Vector(0, forces[0]),
        new Vector(0, forces[1])
      ];

      // apply impulses
      for (var i=0; i<impulses.length; i++)
        this.applyImpulse(impulses[i], this.contactVectors[i]);

      // apply wind impulse
      var windVector = new Vector(0,0);
      windVector.fromAngle( (this.pubs['wind.direction'].values[0] + 180) * Math.PI/180 ,0.2);
      this.applyImpulse(windVector, new Vector(0,0));

      this.updatePhysics(dt);

      // update and publish
      //console.log(this.pubs['gps.location'].values, this.physics.dp);
      this.pubs['gps.location'].values  = this.calcNewCoordinatesFromTranslation(this.pubs['gps.location'].values , this.physics.dp);

      // invert heading
      this.pubs['compass.heading'].values[0] = -this.physics.aDeg;

      console.log('new loc: ', this.pubs['gps.location'].values);

      this.publishParams();

      this.lastLoop = loopTime;
    }
  }
}
