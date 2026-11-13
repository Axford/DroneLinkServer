'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { routeCoordinates } = require('../lib/route-preview');

test('the route preview preserves firmware coordinate order and omits non-route columns', () => {
    assert.deepEqual(routeCoordinates('label,lat,radius,lon\r\nprivate,51,20,-2\r\nother,52,25,-3'), [[-2, 51], [-3, 52]]);
    assert.equal(routeCoordinates('lon,lat,radius\n-2,51,20\n-3,,25'), undefined);
    assert.equal(routeCoordinates('lon,lat,radius\n0,51,20'), undefined);
    assert.equal(routeCoordinates('lon,lat,radius\n-2,51,20\n-3,52,25' + ',extra'.repeat(254)), undefined);
});
