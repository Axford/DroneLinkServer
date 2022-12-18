/*
Nav math from: https://www.movable-type.co.uk/scripts/latlong.html
*/

export const RADIUS_OF_EARTH = 6371e3;
export const π = Math.PI;

export function calculateDistanceBetweenCoordinates( p1, p2) {
  var lon1 = p1[0],  lat1=p1[1],  lon2=p2[0],  lat2=p2[1];
  var R = RADIUS_OF_EARTH; // metres
  var lat1r = lat1 * Math.PI/180; // φ, λ in radians
  var lat2r = lat2 * Math.PI/180;
  var lon1r = lon1 * Math.PI/180; // φ, λ in radians
  var lon2r = lon2 * Math.PI/180;
  var x = (lon2r-lon1r) * Math.cos((lat1r+lat2r)/2);
  var y = (lat2r-lat1r);
  var d = Math.sqrt(x*x + y*y) * R;
  return d;
}

export function calculateDestinationFromDistanceAndBearing(start, d, bearing) {
  var p = [0,0];
  var R = RADIUS_OF_EARTH; // metres
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


export function radiansToDegrees(a) {
  return a * 180 / Math.PI;
}

export function degreesToRadians(a) {
  return a * Math.PI / 180;
}

export function fmod(a,b) { return Number((a - (Math.floor(a / b) * b)).toPrecision(8)); };


export function shortestSignedDistanceBetweenCircularValues(origin, target){
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


export function calculateInitialBearingBetweenCoordinates( lon1,  lat1,  lon2,  lat2) {
  var lat1r = lat1 * Math.PI/180; // φ, λ in radians
  var lat2r = lat2 * Math.PI/180;
  var lon1r = lon1 * Math.PI/180; // φ, λ in radians
  var lon2r = lon2 * Math.PI/180;

  var y = Math.sin(lon2r-lon1r) * Math.cos(lat2r);
  var x = Math.cos(lat1r)*Math.sin(lat2r) - Math.sin(lat1r)*Math.cos(lat2r)*Math.cos(lon2r-lon1r);
  var ang = Math.atan2(y, x);
  var bearing = fmod((ang * 180 / Math.PI + 360), 360);
  return bearing;
}


export function calcCrossTrackDistance(p1, p2, p3) {
  // calculate cross-track distance of p3 from line between p1 and p2
  // in meters

  if (p3[0] == 0 || p1[0] == 0 || p2[0] == 0) return 0;

  // local shortcuts
  var lon1 = p1[0];
  var lat1 = p1[1];
  var lon2 = p2[0];
  var lat2 = p2[1];
  var lon3 = p3[0];
  var lat3 = p3[1];

  var y = Math.sin(lon3 - lon1) * Math.cos(lat3);
  var x = Math.cos(lat1) * Math.sin(lat3) - Math.sin(lat1) * Math.cos(lat3) * Math.cos(lat3 - lat1);
  var bearing13 = radiansToDegrees(Math.atan2(y, x));
  bearing13 = fmod((bearing13 + 360), 360);

  var y2 = Math.sin(lon2 - lon1) * Math.cos(lat2);
  var x2 = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lat2 - lat1);
  var bearing12 = radiansToDegrees(Math.atan2(y2, x2));
  bearing12 = fmod((bearing12 + 360), 360);

  // get distance from last to current location
  var distanceACbyE = calculateDistanceBetweenCoordinates(p1, p3) / RADIUS_OF_EARTH;

  var d = -(Math.asin(Math.sin(distanceACbyE)*Math.sin(degreesToRadians(bearing13)-degreesToRadians(bearing12))) * RADIUS_OF_EARTH);

  return d;
}


export function calcCrossTrackInfo(p1, p2, p3) {
  // calculate cross-track distance of p3 from line between p1 and p2
  // in meters

  if (p3[0] == 0 || p1[0] == 0 || p2[0] == 0) return 0;

  // local shortcuts
  var lon1 = p1[0];
  var lat1 = p1[1];
  var lon2 = p2[0];
  var lat2 = p2[1];
  var lon3 = p3[0];
  var lat3 = p3[1];

  var y = Math.sin(lon3 - lon1) * Math.cos(lat3);
  var x = Math.cos(lat1) * Math.sin(lat3) - Math.sin(lat1) * Math.cos(lat3) * Math.cos(lat3 - lat1);
  var bearing13 = radiansToDegrees(Math.atan2(y, x));
  bearing13 = fmod((bearing13 + 360), 360);

  var y2 = Math.sin(lon2 - lon1) * Math.cos(lat2);
  var x2 = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lat2 - lat1);
  var bearing12 = radiansToDegrees(Math.atan2(y2, x2));
  bearing12 = fmod((bearing12 + 360), 360);

  // get distance from last to current location
  var distanceACbyE = calculateDistanceBetweenCoordinates(p1, p3) / RADIUS_OF_EARTH;

  // cross track distance
  var dxt = -(Math.asin(Math.sin(distanceACbyE)*Math.sin(degreesToRadians(bearing13)-degreesToRadians(bearing12))) * RADIUS_OF_EARTH);

  // along track distance
  var along = Math.acos(Math.cos(distanceACbyE)/Math.cos(dxt/RADIUS_OF_EARTH)) * RADIUS_OF_EARTH;

  return {
    crossTrack: dxt,
    alongTrack: along
  }
}





/**
     * Returns the point of intersection of two paths defined by point and bearing.
*/
export function intersection(p1, brng1, p2, brng2) {

  // see www.edwilliams.org/avform.htm#Intersection

  console.log(brng1, brng2);

  const φ1 = degreesToRadians(p1[1]), 
        λ1 = degreesToRadians(p1[0]);
  const φ2 = degreesToRadians(p2[1]), 
        λ2 = degreesToRadians(p2[0]);
  const θ13 = degreesToRadians(Number(brng1)), 
        θ23 = degreesToRadians(Number(brng2));
  const Δφ = φ2 - φ1, Δλ = λ2 - λ1;

  // angular distance p1-p2
  const δ12 = 2 * Math.asin(Math.sqrt(Math.sin(Δφ/2) * Math.sin(Δφ/2)
      + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2)));
  if (Math.abs(δ12) < Number.EPSILON) return [p1[0], p1[1]]; // coincident points

  // initial/final bearings between points
  const cosθa = (Math.sin(φ2) - Math.sin(φ1)*Math.cos(δ12)) / (Math.sin(δ12)*Math.cos(φ1));
  const cosθb = (Math.sin(φ1) - Math.sin(φ2)*Math.cos(δ12)) / (Math.sin(δ12)*Math.cos(φ2));
  const θa = Math.acos(Math.min(Math.max(cosθa, -1), 1)); // protect against rounding errors
  const θb = Math.acos(Math.min(Math.max(cosθb, -1), 1)); // protect against rounding errors

  const θ12 = Math.sin(λ2-λ1)>0 ? θa : 2*π-θa;
  const θ21 = Math.sin(λ2-λ1)>0 ? 2*π-θb : θb;

  const α1 = θ13 - θ12; // angle 2-1-3
  const α2 = θ21 - θ23; // angle 1-2-3

  if (Math.sin(α1) == 0 && Math.sin(α2) == 0) return null; // infinite intersections
  if (Math.sin(α1) * Math.sin(α2) < 0) return null;        // ambiguous intersection (antipodal/360°)

  const cosα3 = -Math.cos(α1)*Math.cos(α2) + Math.sin(α1)*Math.sin(α2)*Math.cos(δ12);

  const δ13 = Math.atan2(Math.sin(δ12)*Math.sin(α1)*Math.sin(α2), Math.cos(α2) + Math.cos(α1)*cosα3);

  const φ3 = Math.asin(Math.min(Math.max(Math.sin(φ1)*Math.cos(δ13) + Math.cos(φ1)*Math.sin(δ13)*Math.cos(θ13), -1), 1));

  const Δλ13 = Math.atan2(Math.sin(θ13)*Math.sin(δ13)*Math.cos(φ1), Math.cos(δ13) - Math.sin(φ1)*Math.sin(φ3));
  const λ3 = λ1 + Δλ13;

  const lat = radiansToDegrees(φ3);
  const lon = radiansToDegrees(λ3);

  return [lon, lat];
}
