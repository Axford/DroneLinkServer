import AisDecoder from "../AisDecoder.mjs";
import loadStylesheet from '../loadStylesheet.js';
import {calculateDestinationFromDistanceAndBearing, calculateDistanceBetweenCoordinates, shortestSignedDistanceBetweenCircularValues, calculateInitialBearingBetweenCoordinates} from '../navMath.mjs';


loadStylesheet('./css/modules/oui/AisTracker.css');

export default class AisTracker {

    constructor() {
      this.map = null;
      this.vessels = {}; // indexed on mmsi
      this.decoder = new AisDecoder();

      this.decoder.onDecode = (msg)=>{
        if (msg.type == 18) {
          console.log(msg);
          var v = this.getVessel(msg.mmsi, msg.lon, msg.lat);
          console.log(v);
          if (v) {
            this.updateVessel(v, msg);
          }
        }
      };
    }
  

    updateVessel(v, msg) {
      // update position and heading
      var location = [msg.lon, msg.lat];
      v.marker.setLngLat(location);

      v.markerLabel.setLngLat(location);
      v.markerLabel.getElement().innerHTML = msg.speedOverGround.toFixed(1) + ' kn';

      v.headingIndicator.coordinates[0] = location;
      var len = msg.speedOverGround * 60 / 1.94384;  // convert back to meters in 1 min
      var targetCoords = calculateDestinationFromDistanceAndBearing(location, len, msg.courseOverGround);
      v.headingIndicator.coordinates[1] = targetCoords;

      var src = this.map.getSource(v.headingName);
      if (src) src.setData(v.headingIndicator);

    
      // check distance between nodes, update if moved a sig distance
      var d = calculateDistanceBetweenCoordinates(location, v.snailTrail.coordinates[v.snailTrail.coordinates.length-1]);
      var dThreshold = 2;  // calculate based on disance between waypoints
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

        this.vessels[mmsi] = {
          mmsi: mmsi,
          marker: marker,
          headingName: traceName,
          headingIndicator: headingIndicator,
          markerLabel: markerLabel,
          snailTrailName: snailTrailName,
          snailTrail: snailTrail
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