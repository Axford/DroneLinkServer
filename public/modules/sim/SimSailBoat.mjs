/*

Simulates a genric Sailing boat

*/
import fs from 'fs';
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


// Standard Normal variate using Box-Muller transform.
function gaussianRandom(mean=0, stdev=1) {
  let u = 1 - Math.random(); //Converting [0,1) to (0,1)
  let v = Math.random();
  let z = Math.sqrt( -2.0 * Math.log( u ) ) * Math.cos( 2.0 * Math.PI * v );
  // Transform to the desired mean and standard deviation:
  return z * stdev + mean;
}



export default class SimSailBoat extends SimNode {
  constructor(config, mgr) {
    super(config, mgr);
    this.moduleType = 'SailBoat';
    this.lastLoop = 0;

    this.lastWindUpdate = 0;

    this.windDir = config.wind[0];
    this.drift = {
      u:0,
      v:0
    };

    // load ocean current data
    this.currentData = JSON.parse( fs.readFileSync('currents.json') );

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
      values: [this.windDir]
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

    this.windSpeed = 1.4;
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
    s += ' windDir: '+ this.config.wind[0].toFixed(0) +', ' + this.windDir.toFixed(0) + '\n';
    s += ' windSpeed: '+ this.windSpeed.toFixed(1) + '\n';
    s += ' drift: '+ this.drift.u.toFixed(2) +', ' + this.drift.v.toFixed(2) + '\n';

    return s;
  }

  handleLinkMessage(msg) {
    super.handleLinkMessage(msg);

    if (msg.node == this.node &&
        msg.channel == this.module) {
      // its for us


    }
  }


  getOceanCurrent() {
    var location = this.pubs['gps.location'].values;

    // read ocean currents
    var i = Math.round(location[0]) + 90;
    var j = Math.round(location[1]);

    var index = i + 91 * j;
    var cell = {
      u: 0,
      v: 0
    }

    if (index >= 0 && index < this.currentData.length) {
      cell = this.currentData[index];
    }
     
    return cell;
  }


  updateWind() {
    var loopTime = (new Date()).getTime();

    if (loopTime > this.lastWindUpdate + 60*10*1000) {
      this.lastWindUpdate = loopTime;

      var location = this.pubs['gps.location'].values;

      var url = 'https://api.open-meteo.com/v1/forecast?latitude='+location[1]+'&longitude='+location[0]+'&current_weather=true';

      https.get(url,(res) => {
        let body = "";
    
        res.on("data", (chunk) => {
            body += chunk;
        });
    
        res.on("end", () => {
            try {
                let json = JSON.parse(body);
                
                this.config.wind[0] = json.current_weather.winddirection;
                this.windSpeed = json.current_weather.windspeed / 10;

            } catch (error) {
                console.error(error.message);
            };
        });
    
      }).on("error", (error) => {
          console.error(error.message);
      });
      

    }
  }


  update() {
    super.update();

    this.updateWind();

    var loopTime = (new Date()).getTime();
    var dt = (loopTime - this.lastLoop) / 1000;
    if (dt > 2*this.interval) dt = 2*this.interval;
    if (dt > this.interval) {
      //console.log(('dt: '+dt).white);

      // randomly tweak the wind
      //this.pubs['wind.direction'].values[0]
      //this.pubs['wind.direction'].values[0] += (Math.random()-0.5) * dt;
      this.windDir = this.config.wind[0] + 10 * gaussianRandom(0,1);

      // calc sail force based on polar
      // calc angle of heading relative to wind and thereby index into polar

      this.heading = -this.physics.aDeg;
      this.angToWind = Math.abs(shortestSignedDistanceBetweenCircularValues(this.windDir, this.heading));
      this.polarIndex = Math.floor(this.angToWind / 11.25);

      if (this.olarIndex < 0) this.polarIndex = 0;
      if (this.polarIndex > 15) this.polarIndex = 15;

      this.polarVal = this.config.polar[this.polarIndex] / 255.0;

      this.sailForce = this.windSpeed * this.polarVal + 0;

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
      windVector.fromAngle( -(this.windDir + 90) * Math.PI/180 - this.physics.a , 0.1);
      this.applyImpulse(windVector, new Vector(0,0.005));

      // apply ocean current drift
      this.drift = this.getOceanCurrent();
      var dv = new Vector(this.drift.u, this.drift.v);
      this.applyWorldVelocity(dv);

      this.updatePhysics(dt);

      // update and publish
      //console.log(this.pubs['gps.location'].values, this.physics.dp);
      this.pubs['gps.location'].values  = this.calcNewCoordinatesFromTranslation(this.pubs['gps.location'].values , this.physics.dp);

      // invert heading
      this.pubs['compass.heading'].values[0] = this.heading;

      // update speed over ground
      this.pubs['gps.speedOverGround'].values[0] = this.physics.v.y * 1.94384;  // convert to knots

      this.pubs['wind.direction'].values[0] = this.windDir;

      //console.log('new loc: ', this.pubs['gps.location'].values);

      this.publishParams();

      this.lastLoop = loopTime;
    }
  }
}
