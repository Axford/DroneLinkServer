import AisDecoder from "../AisDecoder.mjs";
import loadStylesheet from '../loadStylesheet.js';
import {calcCrossTrackDistance, calculateDestinationFromDistanceAndBearing, 
        calculateDistanceBetweenCoordinates, shortestSignedDistanceBetweenCircularValues, 
        calculateInitialBearingBetweenCoordinates, intersection,
      calcCrossTrackInfo} from '../navMath.mjs';


loadStylesheet('./css/modules/oui/AisTracker.css');

export default class AisTracker {

    constructor() {
      this.map = null;
      this.vessels = {}; // indexed on mmsi
      this.decoder = new AisDecoder();

      this.node = null;  // which node has focus, and therefore to use for collision tracking
      //this.collisionBuilt = false;

      this.decoder.onDecode = (msg)=>{
        if (msg.type == 18) {
          //console.log(msg);
          var v = this.getVessel(msg.mmsi, msg.lon, msg.lat);
          //console.log(v);
          if (v) {
            this.updateVessel(v, msg);
          }
        }
      };
    }
  

    focus(node) {
      this.node = node;
    }


    updateVessel(v, msg) {
      var location = [msg.lon, msg.lat];

      var labelStr = msg.mmsi + '<br/>';
      labelStr += msg.speedOverGround.toFixed(1) + ' kn';

      // heading
      v.headingIndicator.coordinates[0] = location;
      var len = msg.speedOverGround * 60 / 1.94384;  // convert back to meters in 1 min
      var targetCoords = calculateDestinationFromDistanceAndBearing(location, len, msg.courseOverGround);
      v.headingIndicator.coordinates[1] = targetCoords;

      var src = this.map.getSource(v.headingName);
      if (src) src.setData(v.headingIndicator);

      // ext heading
      v.extHeadingIndicator.coordinates[0] = location;
      var len = msg.speedOverGround * 10 * 60 / 1.94384;  // convert back to meters in 10 min
      var extTargetCoords = calculateDestinationFromDistanceAndBearing(location, len, msg.courseOverGround);
      v.extHeadingIndicator.coordinates[1] = extTargetCoords;

      var src = this.map.getSource(v.extTraceName);
      if (src) src.setData(v.extHeadingIndicator);


      // hull outline indicator 
      v.hullIndicator.coordinates = [
        calculateDestinationFromDistanceAndBearing(location, 50, msg.courseOverGround),
        calculateDestinationFromDistanceAndBearing(location, 35, msg.courseOverGround+15),
        calculateDestinationFromDistanceAndBearing(location, 35, msg.courseOverGround+180-15),
        calculateDestinationFromDistanceAndBearing(location, 50, msg.courseOverGround+180),
        calculateDestinationFromDistanceAndBearing(location, 35, msg.courseOverGround+180+15),
        calculateDestinationFromDistanceAndBearing(location, 35, msg.courseOverGround-15),
        calculateDestinationFromDistanceAndBearing(location, 50, msg.courseOverGround)
      ];
      var src = this.map.getSource(v.hullName);
      if (src) src.setData(v.hullIndicator);

      // update collision info
      if (this.node && this.node.location[0] != 0) {
        // distance to node
        var cd = calculateDistanceBetweenCoordinates(location, this.node.location);
        labelStr += '<br/>D: '+ cd.toFixed(0) + 'm';

        // check to see if node is behind vessel
        // calc angle between vessel heading vector and vector from vessel to node, if subtended angle is >90 then node is behind vessel
        var vesselToNode = calculateInitialBearingBetweenCoordinates(location[0], location[1], this.node.location[0], this.node.location[1]);
        //labelStr += '<br/>VtN: ' + vesselToNode.toFixed(0) + 'deg';

        var vesselToNodeToHeading = Math.abs(shortestSignedDistanceBetweenCircularValues(msg.courseOverGround, vesselToNode));
        //labelStr += '<br/>VtNtH: ' + vesselToNodeToHeading.toFixed(0) + 'deg';

        if (vesselToNodeToHeading < 90) {
          // crosstrack distance of node to vessel's course
          var ci = calcCrossTrackInfo(location, extTargetCoords, this.node.location);

          // negative crosstracks are to starboard, positive to port of vessel course
          labelStr += '<br/>Ct: ' + ci.crossTrack.toFixed(1) + 'm';
          labelStr += '<br/>At: ' + ci.alongTrack.toFixed(1) + 'm';

          // update intersection marker to crosstrack point
          var ip = calculateDestinationFromDistanceAndBearing(location, ci.alongTrack, msg.courseOverGround);
          v.intersectionMarker.setLngLat(ip);
        } else {
          labelStr += '<br/>behind';
          v.intersectionMarker.setLngLat([0,0]);
        }

        

        // calculate point of potential intersection
        /*
        var ip = intersection(location, msg.courseOverGround, this.node.location, this.node.heading);
        if (ip) {
          console.log(ip);
          v.intersectionMarker.setLngLat(ip);

          // calc distance to intersection point
          var id1 = calculateDistanceBetweenCoordinates(location, ip);

          if (id1 > 10000) {
            // more than 10km can be ignored
            labelStr += '<br/>I: &gt;10km';
          } else {
            // estimate time to intersection
            var speed1 = msg.speedOverGround / 1.94384;
            var timeToIntersection1 = id1 / speed1;

            // estimate time to intersection for the node
            var id2 = calculateDistanceBetweenCoordinates(this.node.location, ip);
            var speed2 = this.node.speedOverGround / 1.94384;
            var timeToIntersection2 = id2 / speed2;


            labelStr += '<br/>I1: ' + id1.toFixed(0) + 'm, ' + timeToIntersection1.toFixed(0) + 's';
            labelStr += '<br/>I2: ' + id2.toFixed(0) + 'm, ' + timeToIntersection2.toFixed(0) + 's';
          }

          
        } else {
          v.intersectionMarker.setLngLat([0,0]);
          labelStr += '<br/>I: n/a';
        }
        */
      }

      // update position and heading
      v.marker.setLngLat(location);

      v.markerLabel.setLngLat(location);
      v.markerLabel.getElement().innerHTML = labelStr;

    
      // check distance between nodes, update if moved a sig distance
      var d = calculateDistanceBetweenCoordinates(location, v.snailTrail.coordinates[v.snailTrail.coordinates.length-1]);
      var dThreshold = 5;  // calculate based on disance between waypoints
      if (d > dThreshold) {
        v.snailTrail.coordinates.push(location);
        if (v.snailTrail.coordinates.length > 200) {
          v.snailTrail.coordinates.shift();
        }
        var src = this.map.getSource(v.snailTrailName);
        if (src) src.setData(v.snailTrail);
      }
      
  
    }

    getVessel(mmsi, lon, lat) {
      // get or create a matching vessel
      if (this.vessels.hasOwnProperty(mmsi)) {
        
      } else {

        // create marker
        var el = document.createElement('div');
        el.className = 'trackerMarker';
        el.style.backgroundColor = 'rgba(255,0,0,1)';

        var marker = new mapboxgl.Marker(el)
            .setLngLat([lon, lat])
            .addTo(this.map);


        // create intersection marker
        var el2 = document.createElement('div');
        el2.className = 'intersectionMarker';
        el2.style.backgroundColor = 'rgba(255,0,0,1)';

        var intersectionMarker = new mapboxgl.Marker(el2)
            .setLngLat([0,0])
            .addTo(this.map);


        // -- marker label --
        var el2 = document.createElement('div');
        el2.className = 'trackerMarkerLabel';
        el2.innerHTML = '-';
        var markerLabel = new mapboxgl.Marker({
          element:el2,
          anchor:'left'
        })
              .setLngLat([lon, lat])
              .addTo(this.map);


        // heading indicator
        var traceName = 'tracker.heading' + mmsi;
        var targetCoords = calculateDestinationFromDistanceAndBearing([lon, lat], 1, 0);
  
        var headingIndicator = { "type": "LineString", "coordinates": [ [lon, lat], targetCoords ] };
        this.map.addSource(traceName, { type: 'geojson', data: headingIndicator });
        this.map.addLayer({
          'id': traceName,
          'type': 'line',
          'source': traceName,
          'paint': {
            'line-color': 'red',
            'line-opacity': 1,
            'line-width': 3
          }
        });

        // hull outline indicator
        var hullName = 'tracker.hull' + mmsi;

        var hullIndicator = { "type": "LineString", "coordinates": [ [lon, lat], [lon, lat], [lon, lat], [lon, lat] ] };
        this.map.addSource(hullName, { type: 'geojson', data: hullIndicator });
        this.map.addLayer({
          'id': hullName,
          'type': 'line',
          'source': hullName,
          'paint': {
            'line-color': 'red',
            'line-opacity': 1,
            'line-width': 3
          }
        });

        // -- snailTrail --
        var snailTrailName = 'tracker.snail' + mmsi;
        var snailTrail = { "type": "LineString", "coordinates": [ [lon, lat] ] };
        this.map.addSource(snailTrailName, { type: 'geojson', lineMetrics: true, data: snailTrail });
        this.map.addLayer({
          'id': snailTrailName,
          'type': 'line',
          'source': snailTrailName,
          'paint': {
            'line-color': 'red',
            'line-opacity': 0.5,
            'line-width': 2,
            'line-gradient': [
              'interpolate',
              ['linear'],
              ['line-progress'],
              0,
              'rgba(255,0,0,0.2)',
              1,
              'rgba(255,0,0,1)'
            ]
          }
        });   

        // extended heading - for collision detection
        var extTraceName = 'tracker.extHeading' + mmsi;
        var extTargetCoords = calculateDestinationFromDistanceAndBearing([lon, lat], 1, 0);
  
        var extHeadingIndicator = { "type": "LineString", "coordinates": [ [lon, lat], extTargetCoords ] };
        this.map.addSource(extTraceName, { type: 'geojson', lineMetrics: true, data: extHeadingIndicator });
        this.map.addLayer({
          'id': extTraceName,
          'type': 'line',
          'source': extTraceName,
          'paint': {
            'line-color': 'red',
            'line-opacity': 0.5,
            'line-width': 2,
            'line-dasharray': [2,2]
          }
        });

        this.vessels[mmsi] = {
          mmsi: mmsi,
          marker: marker,
          intersectionMarker: intersectionMarker,
          headingName: traceName,
          headingIndicator: headingIndicator,
          hullName: hullName,
          hullIndicator: hullIndicator,
          markerLabel: markerLabel,
          snailTrailName: snailTrailName,
          snailTrail: snailTrail,
          extTraceName: extTraceName,
          extHeadingIndicator: extHeadingIndicator
        };
      }
      return this.vessels[mmsi];
    }

    handleAIS(msg) {
      if (!this.map) return;

      // parse msg
      this.decoder.parse(msg);

    }

}