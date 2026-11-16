'use strict';

const { vector, neutralPlacement, attitudeRotation, add, subtract, scale, dot, cross } = require('./placement');
const { bounds, closedShells, intersectsBounds, submergedVolume, volumeAtWaterline } = require('./submerged-volume');

const waterDensities = Object.freeze({ 'salt-water': 1025, freshwater: 1000 });
const defaultWater = 'salt-water';
const solverVersion = 'hydrostatics-1';
const gravity = 9.80665;
const volumeRelativeTolerance = 1e-8;
const momentRelativeTolerance = 1e-7;
const angleDelta = 0.05;
const equilibriumAngleLimit = 45;
const equilibriumIterations = 24;
const heaveIterations = 48;
const maxShells = 100;
const maxTriangles = 120000;
const maxSamples = 181;
const axes = new Set(['+X', '-X', '+Y', '-Y', '+Z', '-Z']);
const physicalRoles = new Set(['Displacement hull', 'Ballast', 'Water foil', 'Rigid sail']);

function sweepIntervals({ minimum, maximum, step }) {
    return Math.max(1, Math.ceil((maximum - minimum) / step - 1e-12));
}

function sweepSettings(input, minimum, maximum) {
    const range = { minimum, maximum, step: 2, ...input };
    if (![range.minimum, range.maximum, range.step].every(Number.isFinite) ||
        range.minimum < -89 || range.maximum > 89 || range.minimum >= range.maximum || range.step <= 0 ||
        sweepIntervals(range) >= maxSamples)
        throw new RangeError('Choose a sweep within ±89 degrees with at most ' + maxSamples + ' samples.');
    return { minimum: range.minimum, maximum: range.maximum, step: range.step };
}

function prepare(model, proxies) {
    const diagnostics = [];
    const report = (code, part) => diagnostics.push(part ? { code, partId: part.id } : { code });
    if (model?.version !== 1 || !axes.has(model.forward) || !axes.has(model.up) ||
        model.forward[1] === model.up[1] || !Array.isArray(model.parts) ||
        !model.parts.length || model.parts.length > 50)
        return { diagnostics: [{ code: 'invalid-model' }] };
    const parts = new Map(model.parts.map(part => [part.id, part]));
    if (parts.size !== model.parts.length) return { diagnostics: [{ code: 'invalid-model' }] };
    const selected = new Map();
    for (const [hullId, proxyId] of Object.entries(proxies)) {
        const proxy = parts.get(proxyId);
        if (parts.get(hullId)?.role !== 'Displacement hull' || proxy?.role !== 'Visual only' ||
            (proxy.mass != null && proxy.mass !== 0) || selected.has(proxyId)) {
            report('invalid-displacement-proxy', parts.get(hullId));
        } else selected.set(proxyId, hullId);
    }

    let mass = 0;
    let firstMoment = [0, 0, 0];
    let triangleCount = 0;
    const shells = [];
    const contributors = [];
    for (const part of model.parts) {
        if (!physicalRoles.has(part.role) && part.role !== 'Visual only') { report('unassigned-role', part); continue; }
        const hull = part.role === 'Displacement hull' && !Object.hasOwn(proxies, part.id);
        const contributes = hull || selected.has(part.id);
        const carriesWeight = part.role !== 'Visual only';
        if (carriesWeight && (!Number.isFinite(part.mass) || part.mass < 0)) report('missing-or-invalid-mass', part);
        if (carriesWeight && part.mass > 0 && !vector(part.centerOfMass)) report('missing-or-invalid-cg', part);
        if (!contributes && (!carriesWeight || !(part.mass > 0))) continue;
        const place = neutralPlacement(part, model.forward, model.up);
        if (!place) { report('invalid-neutral-joint', part); continue; }
        if (carriesWeight && part.mass > 0 && vector(part.centerOfMass)) {
            mass += part.mass;
            firstMoment = add(firstMoment, scale(place(part.centerOfMass), part.mass));
        }
        if (!contributes) continue;
        const mesh = part.mesh;
        triangleCount += mesh.triangles.length;
        if (triangleCount > maxTriangles) { report('geometry-limit'); break; }
        const closed = closedShells(mesh.vertices.map(place), mesh.triangles);
        if (!closed) { report('invalid-displacement-shell', part); continue; }
        if (shells.length + closed.length > maxShells) { report('geometry-limit'); break; }
        for (const shell of closed) {
            const overlap = shells.find(other => intersectsBounds(other.box, shell.box));
            if (overlap) diagnostics.push({ code: 'overlapping-displacement-bounds', partId: part.id, otherPartId: overlap.partId });
            shells.push({ ...shell, partId: part.id });
        }
        contributors.push({ partId: part.id, hullId: selected.get(part.id) ?? part.id });
    }
    if (!(mass > 0) || !Number.isFinite(mass) || !vector(firstMoment)) report('invalid-total-mass');
    if (!shells.length) report('no-displacement-hull');
    return {
        diagnostics, mass, centerOfGravity: scale(firstMoment, 1 / mass), shells, contributors,
        capacity: shells.reduce((sum, shell) => sum + shell.volume, 0),
    };
}

function atAttitude(boat, heel, pitch) {
    const rotate = attitudeRotation(heel, pitch);
    const centerOfGravity = rotate(boat.centerOfGravity);
    const intervals = [];
    const faces = boat.shells.flatMap(shell => {
        const vertices = new Map();
        const placed = point => {
            if (!vertices.has(point)) vertices.set(point, rotate(point));
            return vertices.get(point);
        };
        const faces = shell.faces.map(face => face.map(placed));
        const vertical = bounds(vertices.values());
        intervals.push([vertical.min[2], vertical.max[2]]);
        return faces;
    });
    intervals.sort((a, b) => a[0] - b[0]);
    return {
        faces, centerOfGravity, intervals, lowest: intervals[0][0], highest: Math.max(...intervals.map(interval => interval[1])),
        heelAxis: rotate([1, 0, 0]), heel, pitch,
    };
}

function sampleAtWaterline(attitude, waterline, mass, density) {
    const { volume, center } = submergedVolume(attitude.faces, waterline, attitude.centerOfGravity);
    const buoyancy = density * volume * gravity;
    const moment = center ? cross(subtract(center, attitude.centerOfGravity), [0, 0, buoyancy]) : [0, 0, 0];
    return {
        heel: attitude.heel, pitch: attitude.pitch, waterline,
        draft: Math.max(0, waterline - attitude.lowest), displacedVolume: volume,
        centerOfBuoyancy: center, centerOfGravity: attitude.centerOfGravity,
        buoyancy, verticalResidual: buoyancy - mass*gravity,
        heelMoment: dot(moment, attitude.heelAxis), pitchMoment: -moment[1],
    };
}

function balancedSample(boat, heel, pitch, density) {
    const attitude = atAttitude(boat, heel, pitch);
    const target = boat.mass / density;
    const tolerance = target * volumeRelativeTolerance;
    const volumeAt = volumeAtWaterline(attitude.faces);
    let high = attitude.lowest;
    for (const [lower, upper] of attitude.intervals) {
        if (lower > high && Math.abs(volumeAt(high + (lower - high)/2) - target) <= tolerance) return null;
        high = Math.max(high, upper);
    }
    let lower = attitude.lowest, upper = attitude.highest;
    for (let iteration = 0; iteration < heaveIterations; iteration++) {
        const waterline = lower + (upper - lower) / 2;
        const volume = volumeAt(waterline);
        if (Math.abs(volume - target) <= tolerance) {
            const result = sampleAtWaterline(attitude, waterline, boat.mass, density);
            return Math.abs(result.displacedVolume - target) <= 2*tolerance ? result : null;
        }
        if (volume < target) lower = waterline;
        else upper = waterline;
    }
    return null;
}

function momentJacobian(sample, heel, pitch) {
    const left = sample(heel - angleDelta, pitch);
    const right = sample(heel + angleDelta, pitch);
    const down = sample(heel, pitch - angleDelta);
    const up = sample(heel, pitch + angleDelta);
    if (!left || !right || !down || !up) return null;
    return [
        [(right.heelMoment - left.heelMoment)/(2*angleDelta), (up.heelMoment - down.heelMoment)/(2*angleDelta)],
        [(right.pitchMoment - left.pitchMoment)/(2*angleDelta), (up.pitchMoment - down.pitchMoment)/(2*angleDelta)],
    ];
}

function classifyStiffness([[a, b], [c, d]], tolerance) {
    const offDiagonal = (b + c) / 2;
    const lowestStiffness = -(a + d)/2 - Math.hypot((a - d)/2, offDiagonal);
    if (lowestStiffness < -tolerance) return 'non-restoring';
    return lowestStiffness > tolerance ? 'restoring' : 'indeterminate';
}

function findEquilibrium(boat, sample) {
    const size = Math.max(...boat.shells.map(shell => Math.hypot(...subtract(shell.box.max, shell.box.min))));
    const tolerance = boat.mass * gravity * size * momentRelativeTolerance;
    const residual = point => Math.hypot(point.heelMoment, point.pitchMoment);
    let current = sample(0, 0);
    for (let iteration = 0; current && iteration < equilibriumIterations; iteration++) {
        const jacobian = momentJacobian(sample, current.heel, current.pitch);
        if (residual(current) <= tolerance) {
            const stability = jacobian ? classifyStiffness(jacobian, tolerance / angleDelta) : 'indeterminate';
            return { ...current, stability };
        }
        if (!jacobian) return null;
        const [[a, b], [c, d]] = jacobian;
        const determinant = a*d - b*c;
        if (Math.abs(determinant) <= Number.EPSILON * Math.max(Math.abs(a*d), Math.abs(b*c))) return null;
        const heelStep = (-current.heelMoment*d + current.pitchMoment*b)/determinant;
        const pitchStep = (-current.pitchMoment*a + current.heelMoment*c)/determinant;
        const maxStep = Math.max(1, Math.abs(heelStep)/10, Math.abs(pitchStep)/10);
        let next = null;
        for (let step = 1/maxStep; step >= 1/(64*maxStep); step /= 2) {
            const heel = current.heel + step*heelStep, pitch = current.pitch + step*pitchStep;
            if (Math.max(Math.abs(heel), Math.abs(pitch)) > equilibriumAngleLimit) continue;
            const point = sample(heel, pitch);
            if (point && residual(point) < residual(current)) { next = point; break; }
        }
        current = next;
    }
    return null;
}

function sweep(range, evaluate) {
    const count = sweepIntervals(range);
    return Array.from({ length: count + 1 }, (_, index) => {
        const angle = index === count ? range.maximum : range.minimum + index*range.step;
        const sample = evaluate(angle);
        return sample ? { angle, ...sample } : { angle, diagnostic: 'vertical-balance-unresolved' };
    });
}

/** Evaluate a saved version-1 boat definition without accessing storage. */
function analyzeHydrostatics(model, { water = defaultWater, proxies = {}, heel, pitch } = {}) {
    if (!Object.hasOwn(waterDensities, water)) throw new RangeError('Choose salt-water or freshwater.');
    const density = waterDensities[water];
    const settings = { water, density, proxies: { ...proxies }, heel: sweepSettings(heel, -60, 60), pitch: sweepSettings(pitch, -30, 30) };
    const boat = prepare(model, settings.proxies);
    const result = {
        solverVersion, settings, tolerances: {
            relativeVolume: volumeRelativeTolerance, relativeMoment: momentRelativeTolerance,
            angularDerivativeStep: angleDelta, equilibriumAngleLimit,
        },
        diagnostics: boat.diagnostics, mass: Number.isFinite(boat.mass) ? boat.mass : null,
        centerOfGravity: vector(boat.centerOfGravity) ? boat.centerOfGravity : null,
        contributors: boat.contributors ?? [], displacementCapacity: boat.capacity ?? null,
        equilibrium: null, heel: [], pitch: [],
    };
    if (result.diagnostics.length) return result;
    if (boat.mass / density >= boat.capacity * (1 - volumeRelativeTolerance)) {
        result.diagnostics.push({ code: 'insufficient-displacement' });
        return result;
    }
    const sample = (heel, pitch) => balancedSample(boat, heel, pitch, density);
    result.equilibrium = findEquilibrium(boat, sample);
    if (!result.equilibrium) {
        result.diagnostics.push({ code: 'equilibrium-unresolved' });
        return result;
    }
    result.heel = sweep(settings.heel, heel => sample(heel, result.equilibrium.pitch));
    result.pitch = sweep(settings.pitch, pitch => sample(result.equilibrium.heel, pitch));
    return result;
}

module.exports = { analyzeHydrostatics, waterDensities, defaultWater };
