/*

Base class for all node simulators

*/
import * as DLM from '../droneLinkMsg.mjs';
import Vector from '../Vector.mjs';

const R_EARTH = 6378 * 1000;

export default class SimNode {
  constructor(config, mgr) {
    this.config = config;
    this.moduleType = 'SimNode';
    this.name = config.name;
    this.node = config.node; // node id
    this.module = config.module; // module id
    this.mgr = mgr;
    this.interval = config.interval / 1000;
    this.lastDiscovery = 0;
    this.mgmtMsg = new DLM.DroneLinkMsg();
    this.mgmtMsg.source = 253;
    this.mgmtMsg.node = this.node;
    this.mgmtMsg.channel = this.module;
    this.subs = [];
    this.pubs = {};
    this.physics = {
      p: new Vector(0,0),
      dp: new Vector(0,0),
      m: 1,
      v: new Vector(0,0),
      angV: 0,
      a:0, // angle in radians
      aDeg:0,
      inertia: 1,
      friction: 0.0001,
      angFriction: 0.01
    }
  }

  calcCylindricalInertia(len, radius) {
      this.physics.inertia = 0.25 * this.physics.m * radius * radius +
        (1/12) * this.physics.m * (len * len);
  }

  applyImpulse(impulse, contactVector) {
    /*
    velocity += 1.0f / mass * impulse;
    angularVelocity += 1.0f / inertia * Cross( contactVector, impulse );
    */
    var dv = new Vector(0,0);
    dv.add(impulse.multiply(1/this.physics.m));
    this.physics.v.add(dv);

    var cvi = contactVector.cross(impulse);
    if (cvi != 0) this.physics.angV += (1 / (100* this.physics.inertia)) *cvi;

    // apply friction
    this.physics.v.multiply(1-this.physics.friction);
    this.physics.angV *= (1-this.physics.angFriction);
  }

  calcNewCoordinatesFromTranslation(coord, dp) {
    var newLatitude  = coord[1]  + (dp.y / R_EARTH) * (180 / Math.PI);
    var newLongitude = coord[0] + (dp.x / R_EARTH) * (180 / Math.PI) / Math.cos(coord[1] * Math.PI/180);
    return [newLongitude, newLatitude];
  }

  handleLinkMessage(msg) {
    if (msg.node == this.node &&
        msg.channel == this.module) {
      // its for us
      //console.log(('[hLM] ' + msg.asString()).green);

      // standard responses
      if (msg.msgType == DLM.DRONE_LINK_MSG_TYPE_QUERY) {
        if (msg.param == DLM.DRONE_MODULE_PARAM_ERROR) {
          this.mgmtMsg.param = msg.param;
          this.mgmtMsg.setUint8([0]);
          this.send(this.mgmtMsg);
        } else if (msg.param == DLM.DRONE_MODULE_PARAM_TYPE) {
          this.mgmtMsg.param = msg.param;
          this.mgmtMsg.setString(this.config.type);
          this.send(this.mgmtMsg);
        }
      }

      if (msg.msgType == DLM.DRONE_LINK_MSG_TYPE_NAMEQUERY) {
        this.mgmtMsg.param = msg.param;
        if (msg.param == DLM.DRONE_MODULE_PARAM_STATUS) {
          this.mgmtMsg.setName('status');
          this.send(this.mgmtMsg);
        } else if (msg.param == DLM.DRONE_MODULE_PARAM_NAME) {
          this.mgmtMsg.setName(this.name);
          this.send(this.mgmtMsg);
        } else if (msg.param == DLM.DRONE_MODULE_PARAM_ERROR) {
          this.mgmtMsg.setName('error');
          this.send(this.mgmtMsg);
        } else if (msg.param == DLM.DRONE_MODULE_PARAM_TYPE) {
          this.mgmtMsg.setName('type');
          this.send(this.mgmtMsg);
        }
      }

      // handle pub queries
      for (const [key, value] of Object.entries(this.pubs)) {
        if (msg.param == value.param) {
          if (msg.msgType == DLM.DRONE_LINK_MSG_TYPE_NAMEQUERY) {
            this.mgmtMsg.param = value.param
            this.mgmtMsg.setName(key);
            this.send(this.mgmtMsg);
          }
        }
      }
    }

    // handle subscriptions
    // iterate over each sub and see if it matches msg
    this.subs.forEach((sub)=>{
      if (sub.sameAddress(msg) && msg.msgType == sub.msgType) {
        //console.log(('  updating sub: ' + msg.asString()).green);
        // matches, so overwrite values and trigger update
        var newValues = msg.valueArray();
        sub.values.fill(0,0,newValues.length);
        for (var i=0; i<newValues.length; i++)
          sub.values[i] = newValues[i];
        //console.log('  new values: ', sub.values);
      }
    });

  }

  send(msg) {
    this.mgr.send(msg);
  }

  publishParams() {
    // publish pubs - iterate over and send
    for (const [key, value] of Object.entries(this.pubs)) {
      // send value
      this.mgmtMsg.param = value.param;
      this.mgmtMsg.msgType = value.msgType;
      this.mgmtMsg.msgLength = this.mgmtMsg.bytesPerValue() * value.values.length;
      var valueBuffer = this.mgmtMsg.valueArray();

      for (var i=0; i<value.values.length; i++) {
        valueBuffer[i] = value.values[i];
      }

      this.send(this.mgmtMsg);
    }
  }

  updatePhysics(dt) {
    // apply impulses, then call this to update position, rotation

    //TODO:  allow for the fact velocity is in local frame, so needs to be rotated to get in world frame to update p
    this.physics.a += this.physics.angV * dt;

    this.physics.dp = new Vector(0,0);
    this.physics.dp.add(this.physics.v.multiply(dt));
    this.physics.dp.rotate(this.physics.a);
    this.physics.p.add(this.physics.dp);

    this.physics.aDeg = this.physics.a * 180 / Math.PI;
    this.physics.aDeg = this.physics.aDeg % 360;
    //console.log(this.physics.p, this.physics.aDeg);
  }

  update() {
    var loopTime = (new Date()).getTime();

    // do discovery
    if (loopTime > this.lastDiscovery + 1000) {
      //console.log('disco');

      // send status
      this.mgmtMsg.param = DLM.DRONE_MODULE_PARAM_STATUS;
      this.mgmtMsg.msgType = DLM.DRONE_LINK_MSG_TYPE_UINT8_T;
      this.mgmtMsg.msgLength = 1;
      this.mgmtMsg.uint8_tPayload[0] = 1;
      this.send(this.mgmtMsg);

      // send name
      this.mgmtMsg.param = DLM.DRONE_MODULE_PARAM_NAME;
      this.mgmtMsg.setString(this.config.type);
      this.send(this.mgmtMsg);

      // send type
      this.mgmtMsg.param = DLM.DRONE_MODULE_PARAM_TYPE;
      this.mgmtMsg.setString(this.moduleType);
      this.send(this.mgmtMsg);

      this.publishParams();

      this.lastDiscovery = loopTime;
    }
  }

}
