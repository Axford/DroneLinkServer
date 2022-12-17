

export function calculateDistanceBetweenCoordinates( p1, p2) {
  var RADIUS_OF_EARTH = 6371e3;
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