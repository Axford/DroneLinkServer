'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { analyzeHydrostatics, waterDensities, defaultWater } = require('../../lib/dreamer/hydrostatics');
const { submergedVolume, volumeAtWaterline } = require('../../lib/dreamer/submerged-volume');

const identity = [[1,0,0], [0,1,0], [0,0,1], [0,0,0]];
const gravity = 9.80665;
const upright = { minimum: -4, maximum: 4, step: 2 };
const short = { heel: upright, pitch: upright };

function close(actual, expected, tolerance = 1e-6) {
    assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected} (±${tolerance})`);
}

function box(length = 4, beam = 2, depth = 1) {
    const x = length/2, y = beam/2;
    return {
        closed: true,
        vertices: [[-x,-y,0],[x,-y,0],[x,y,0],[-x,y,0],[-x,-y,depth],[x,-y,depth],[x,y,depth],[-x,y,depth]],
        triangles: [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]],
    };
}

function part(overrides = {}) {
    return {
        id: '1', name: 'Hull', role: 'Displacement hull', mesh: box(), mass: 4000, centerOfMass: [0,0,0.2],
        sourcePose: identity, rotation: [0,0,0], translation: [0,0,0], joint: null, ...overrides,
    };
}

const model = (parts, axes = {}) => ({ version: 1, name: 'Test boat', forward: '+X', up: '+Z', parts, ...axes });
const fixture = () => model([part()]);

// Wall-sided rectangular barge. This closed form applies while the plane
// meets only the vertical sides. breadth is transverse for heel and fore-aft for pitch.
function rectangularMoment(angle, breadth, draft, cgHeight, weight) {
    const theta = angle * Math.PI/180;
    const transverseCentroid = -(breadth**2) * Math.tan(theta) / (12*draft);
    const verticalCentroid = draft/2 + breadth**2 * Math.tan(theta)**2 / (24*draft);
    return weight*(transverseCentroid*Math.cos(theta) + (cgHeight - verticalCentroid)*Math.sin(theta));
}

test('salt water is the default and freshwater changes draft for the same loading', () => {
    assert.equal(defaultWater, 'salt-water');
    assert.deepEqual(waterDensities, { 'salt-water': 1025, freshwater: 1000 });
    assert.throws(() => analyzeHydrostatics(fixture(), { water: 1010 }), /salt-water or freshwater/);
    const salt = analyzeHydrostatics(fixture(), short);
    const fresh = analyzeHydrostatics(fixture(), { ...short, water: 'freshwater' });
    assert.deepEqual(salt.diagnostics, []);
    assert.deepEqual(fresh.diagnostics, []);
    assert.equal(salt.settings.density, 1025);
    assert.equal(fresh.settings.density, 1000);
    close(salt.equilibrium.draft, 4000/(8*1025));
    close(fresh.equilibrium.draft, 0.5);
    close(fresh.equilibrium.displacedVolume, 4);
    close(fresh.equilibrium.centerOfBuoyancy[2], 0.25);
    close(fresh.equilibrium.verticalResidual, 0, 1e-3);
    assert.equal(fresh.equilibrium.stability, 'restoring');
    const defaults = analyzeHydrostatics(fixture());
    assert.deepEqual([defaults.heel.length, defaults.pitch.length], [61, 31]);
    assert.throws(() => analyzeHydrostatics(fixture(), { heel: { step: 0.1 } }), /181 samples/);
    const decimal = analyzeHydrostatics(fixture(), { ...short, heel: { minimum: 0.1, maximum: 0.4, step: 0.1 } });
    assert.deepEqual(decimal.heel.map(point => Math.round(10*point.angle)), [1,2,3,4]);
    for (const point of [...defaults.heel, ...defaults.pitch]) close(point.verticalResidual, 0, 8e-4);
});

test('heel and pitch match independent finite-angle moments on a rectangular hull', () => {
    const result = analyzeHydrostatics(fixture(), { ...short, water: 'freshwater' });
    for (const [curve, breadth, field] of [[result.heel, 2, 'heelMoment'], [result.pitch, 4, 'pitchMoment']]) {
        for (const sample of curve) {
            const expected = rectangularMoment(sample.angle, breadth, 0.5, 0.2, 4000*gravity);
            close(sample[field], expected, 5e-4);
            close(sample.verticalResidual, 0, 8e-4);
        }
    }
});

test('offset ballast moves both equilibrium angles and leaves the other axis fixed during a sweep', () => {
    const ballast = part({ id: '2', role: 'Ballast', mass: 300, centerOfMass: [0.7,-0.5,0.1] });
    const result = analyzeHydrostatics(model([part(), ballast]), short);
    assert.deepEqual(result.diagnostics, []);
    assert.ok(result.equilibrium.heel > 0);
    assert.ok(result.equilibrium.pitch < 0);
    close(result.equilibrium.heelMoment, 0, 0.03);
    close(result.equilibrium.pitchMoment, 0, 0.03);
    assert.ok(result.heel.every(sample => sample.pitch === result.equilibrium.pitch));
    assert.ok(result.pitch.every(sample => sample.heel === result.equilibrium.heel));
    const topHeavy = analyzeHydrostatics(model([part({ centerOfMass: [0,0,2] })]), short);
    assert.equal(topHeavy.equilibrium.stability, 'non-restoring');
});

test('separated hulls restore as a pair and inward winding is normalized per shell', () => {
    const small = box(2, 0.5, 0.6);
    const inward = { ...small, triangles: small.triangles.map(([a,b,c]) => [a,c,b]) };
    const left = part({ mesh: small, mass: 300, centerOfMass: [0,0,0.1], translation: [0,1,0] });
    const right = part({ id:'2', mesh: inward, mass: 300, centerOfMass: [0,0,0.1], translation: [0,-1,0] });
    const result = analyzeHydrostatics(model([left,right]), { ...short, water: 'freshwater' });
    assert.deepEqual(result.diagnostics, []);
    close(result.equilibrium.draft, 0.3);
    close(result.equilibrium.centerOfBuoyancy[1], 0);
    close(result.displacementCapacity, 1.2);
    assert.ok(result.heel.at(-1).heelMoment < 0);
    const overlapping = analyzeHydrostatics(model([left, { ...right, translation: [0,0.8,0] }]), short);
    assert.ok(overlapping.diagnostics.some(issue => issue.code === 'overlapping-displacement-bounds'));
    assert.deepEqual(overlapping.heel, []);
});

test('mass uses source axes, placement and the confirmed neutral joint pose', () => {
    const hull = part({ mesh: box(2, 4), mass: 3900 });
    const foil = part({
        id: '2', role: 'Water foil', mass: 100, centerOfMass: [0,1,0.2], translation: [0,0.1,0],
        sourcePose: [[1,0,0],[0,1,0],[0,0,1],[0,-0.4,0]], rotation: [0,0,90],
        joint: { axis: [0,0,1], pivot: [0,0,0], neutral: 90, minimum: -30, maximum: 30 },
    });
    const result = analyzeHydrostatics(model([hull,foil], { forward:'-Y' }), short);
    assert.deepEqual(result.diagnostics, []);
    close(result.centerOfGravity[0], 0.035);
    close(result.centerOfGravity[1], 0.0025);
    close(result.centerOfGravity[2], 0.2);
    assert.equal(result.mass, 4000);
    assert.equal(result.contributors.length, 1);
});

test('displacement proxy substitutes for an open hull while preserving its mass', () => {
    const mesh = box();
    const open = part({ mesh: { ...mesh, closed: false, triangles: mesh.triangles.slice(1) } });
    const proxy = part({ id: '2', role: 'Visual only', mesh, mass: null, centerOfMass: null });
    const boat = model([open,proxy]);
    const failure = analyzeHydrostatics(boat, short);
    assert.ok(failure.diagnostics.some(issue => issue.code === 'invalid-displacement-shell'));
    const success = analyzeHydrostatics(boat, { ...short, proxies: { '1':'2' } });
    assert.deepEqual(success.diagnostics, []);
    assert.deepEqual(success.contributors, [{ partId:'2', hullId:'1' }]);
    close(success.mass, 4000);
    close(success.equilibrium.draft, 4000/(8*1025));
    const weightedProxy = { ...proxy, role: 'Ballast', mass: 10 };
    const invalid = analyzeHydrostatics(model([open,weightedProxy]), { ...short, proxies: { '1':'2' } });
    assert.ok(invalid.diagnostics.some(issue => issue.code === 'invalid-displacement-proxy'));
});

test('unusable models return diagnostics and no fabricated curves', () => {
    const overload = analyzeHydrostatics(model([part({ mass: 8200 })]), short);
    assert.deepEqual(overload.diagnostics, [{ code: 'insufficient-displacement' }]);
    assert.equal(overload.equilibrium, null);
    assert.deepEqual(overload.heel, []);
    const incomplete = analyzeHydrostatics(model([part({ mass: null })]), short);
    assert.ok(incomplete.diagnostics.some(issue => issue.code === 'missing-or-invalid-mass' && issue.partId === '1'));
    const separated = model([part({ mass: 8200 }), part({ id:'2', mass:0, translation:[0,0,2] })]);
    const ambiguous = analyzeHydrostatics(separated, short);
    assert.deepEqual(ambiguous.diagnostics, [{ code: 'equilibrium-unresolved' }]);
    assert.deepEqual(ambiguous.pitch, []);
});

test('dry and fully submerged clipping extremes agree with the independent volume evaluator', () => {
    const { vertices, triangles } = box();
    const faces = triangles.map(face => face.map(index => vertices[index]));
    const volumeAt = volumeAtWaterline(faces);
    for (const [waterline, volume] of [[-1,0],[0,0],[0.5,4],[1,8],[2,8]]) {
        const section = submergedVolume(faces, waterline, [0,0]);
        close(volumeAt(waterline), volume);
        close(section.volume, volume);
        if (volume === 0) assert.equal(section.center, null);
        else close(section.center[2], Math.min(1, waterline)/2);
    }
});
