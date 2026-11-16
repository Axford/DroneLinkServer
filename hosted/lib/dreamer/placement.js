'use strict';

const radians = degrees => degrees * Math.PI / 180;
const add = (a, b) => a.map((value, index) => value + b[index]);
const subtract = (a, b) => a.map((value, index) => value - b[index]);
const scale = (vector, factor) => vector.map(value => value * factor);
const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const cross = (a, b) => [
    a[1]*b[2] - a[2]*b[1],
    a[2]*b[0] - a[0]*b[2],
    a[0]*b[1] - a[1]*b[0],
];
const vector = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);

function axisVector(axis) {
    const result = [0, 0, 0];
    result['XYZ'.indexOf(axis[1])] = axis[0] === '+' ? 1 : -1;
    return result;
}

function eulerRotation(angles) {
    const [sx, sy, sz] = angles.map(angle => Math.sin(radians(angle)));
    const [cx, cy, cz] = angles.map(angle => Math.cos(radians(angle)));
    return ([x, y, z]) => {
        const rolledY = y*cx - z*sx;
        const rolledZ = y*sx + z*cx;
        const pitchedX = x*cy + rolledZ*sy;
        return [pitchedX*cz - rolledY*sz, pitchedX*sz + rolledY*cz, -x*sy + rolledZ*cy];
    };
}

// Match the version-1 editor: source pose, boat-axis remap, part placement,
// then the confirmed joint neutral around the placed local pivot.
function neutralPlacement(part, forward, up) {
    const [basisX, basisY, basisZ, origin] = part.sourcePose;
    const x = axisVector(forward);
    const z = axisVector(up);
    const y = cross(z, x);
    const orient = value => [dot(value, x), dot(value, y), dot(value, z)];
    const rotate = eulerRotation(part.rotation);
    const position = add(orient(origin), part.translation);
    const basis = [basisX, basisY, basisZ].map(value => rotate(orient(value)));
    const direction = point => add(add(scale(basis[0], point[0]), scale(basis[1], point[1])), scale(basis[2], point[2]));
    const place = point => add(position, direction(point));
    if (!part.joint) return place;
    const pivot = place(part.joint.pivot);
    const axis = direction(part.joint.axis);
    const length = Math.hypot(...axis);
    if (!Number.isFinite(length) || length <= 1e-9) return null;
    const unit = scale(axis, 1 / length);
    const angle = radians(part.joint.neutral ?? 0);
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    return point => {
        const arm = subtract(place(point), pivot);
        return add(pivot, add(add(scale(arm, cosine), scale(cross(unit, arm), sine)),
            scale(unit, dot(unit, arm) * (1 - cosine))));
    };
}

// Boat axes are forward, port and up. Bow-up pitch is around negative world Y.
const attitudeRotation = (heel, pitch) => eulerRotation([heel, -pitch, 0]);

module.exports = { vector, neutralPlacement, attitudeRotation, radians, add, subtract, scale, dot, cross };
