import AisDecoder from "../AisDecoder.mjs";
import loadStylesheet from '../loadStylesheet.js';


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

    calculateDestinationFromDistanceAndBearing(start, d, bearing) {
      var p = [0,0];
      var R = 6371e3; // metres
      var lat1r = start[1] * Math.PI/180; // φ, λ in radians
      var lon1r = start[0] * Math.PI/180;
      var br = bearing * Math.PI/180;
  
      var a = Math.sin(lat1r)*Math.cos(d/R) + Math.cos(lat1r)*Math.sin(d/R)*Math.cos(br);
      p[1] = Math.asin( a );
      p[0] = lon1r + Math.atan2(
        Math.sin(br)*Math.sin(d/R)*Math.cos(lat1r),
        Math.cos(d/R) - Math.sin(lat1r)*a
      );
      // convert to degrees
      p[0] = p[0] * 180/Math.PI;
      p[1] = p[1] * 180/Math.PI;
      // normalise lon
      p[0] = ((p[0] + 540) % 360) - 180;
      return p;
    }
  

    updateVessel(v, msg) {
      // update position and heading
      v.marker.setLngLat([msg.lon, msg.lat]);


      v.headingIndicator.coordinates[0] = [msg.lon, msg.lat];
      var targetCoords = this.calculateDestinationFromDistanceAndBearing([msg.lon, msg.lat], 10, msg.courseOverGround);
      v.headingIndicator.coordinates[1] = targetCoords;

      var src = this.map.getSource(v.headingName);
      if (src) src.setData(v.headingIndicator);
  
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


        // heading indicator
        var traceName = 'tracker.heading' + mmsi;
        var targetCoords = this.calculateDestinationFromDistanceAndBearing([lon, lat], 1, 0);
  
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

        this.vessels[mmsi] = {
          mmsi: mmsi,
          marker: marker,
          headingName: traceName,
          headingIndicator: headingIndicator
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