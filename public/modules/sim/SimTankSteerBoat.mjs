/*

Simulates a TankSteer boat

*/
import SimNode from './SimNode.mjs';
import * as DLM from '../droneLinkMsg.mjs';
import Vector from '../Vector.mjs';
import https from 'https';

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

    this.pubs['wind.speed'] = {
      param: 11,
      msgType: DLM.DRONE_LINK_MSG_TYPE_FLOAT,
      values: 0
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

    // sample wind
    //this.getWind();
  }


  getDiagnosticString() {
    var s = this.node + ': ' + this.name + '\n';
    s += ' v: ' + this.physics.v.x.toFixed(1) + ', ' + this.physics.v.y.toFixed(1) + '\n';
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


  getWind() {
    try {
      // https://api.openweathermap.org/data/2.5/weather?lat=51.7&lon=-1.8&appid=53453db3ecb10cd4d3e852dfa4d7f75a
      /*
      {"coord":{"lon":-1.8,"lat":51.7},"weather":[{"id":800,"main":"Clear","description":"clear sky","icon":"01n"}],"base":"stations","main":{"temp":277.32,"feels_like":274.24,"temp_min":275.84,"temp_max":279.66,"pressure":1023,"humidity":91},"visibility":10000,"wind":{"speed":3.6,"deg":270},"clouds":{"all":1},"dt":1636331370,"sys":{"type":1,"id":1495,"country":"GB","sunrise":1636355631,"sunset":1636388887},"timezone":0,"id":2649741,"name":"Fairford","cod":200}
      */

      let url = "https://api.openweathermap.org/data/2.5/weather?lat=51.7&lon=-1.8&appid=53453db3ecb10cd4d3e852dfa4d7f75a";


      https.get(url,(res) => {
        let body = "";

        res.on("data", (chunk) => {
            body += chunk;
        });

        res.on("end", () => {
            try {
                let data = JSON.parse(body);

                var windDir = data.wind.deg;
                var windSpeed = data.wind.speed;
                console.log('Wind: ',windDir, windSpeed);

                this.pubs['wind.direction'].values[0] = windDir;
            } catch (error) {
                console.error(error.message);
            };
        });

      }).on("error", (error) => {
          console.error(error.message);
      });

    } catch(e) {
      console.error(e);
    }

    // refresh wind every 5min
    setTimeout(()=>{
      this.getWind()
    }, 5*60*1000);
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

      // convert motor speeds to impulse vectors
      var fv = 1;

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
      // NOTE: physics angles are inverted vs compass bearings
      // make sure wind vector is in node coord frame - i.e. rotate by current heading
      windVector.fromAngle( -(this.pubs['wind.direction'].values[0] + 90) * Math.PI/180 - this.physics.a , 0.3);
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
