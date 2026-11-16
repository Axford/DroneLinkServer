'use strict';

const { vector, subtract, cross, dot } = require('./placement');

function bounds(vertices) {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const point of vertices) {
        for (let axis = 0; axis < 3; axis++) {
            min[axis] = Math.min(min[axis], point[axis]);
            max[axis] = Math.max(max[axis], point[axis]);
        }
    }
    return { min, max };
}

function edgeKey(a, b) {
    return a < b ? a + ':' + b : b + ':' + a;
}

// Check paired edges, winding and the incident face cycle at each vertex.
// Traverse each separate shell so an inward shell can be flipped on its own.
function closedShells(vertices, triangles) {
    if (!vertices.every(vector) || !Array.isArray(triangles) || !triangles.length) return null;
    const edges = new Map();
    const links = new Map();
    const neighbors = triangles.map(() => []);
    for (const [index, face] of triangles.entries()) {
        if (!Array.isArray(face) || face.length !== 3 || new Set(face).size !== 3 ||
            !face.every(i => Number.isSafeInteger(i) && i >= 0 && i < vertices.length)) return null;
        const [a, b, c] = face.map(i => vertices[i]);
        const normal = cross(subtract(b, a), subtract(c, a));
        if (!vector(normal) || normal.every(value => value === 0)) return null;
        for (let i = 0; i < 3; i++) {
            const from = face[i], to = face[(i+1)%3], previous = face[(i+2)%3];
            const key = edgeKey(from, to);
            const edge = edges.get(key);
            if (!edge) edges.set(key, { from, index });
            else {
                if (edge.paired || edge.from === from) return null;
                edge.paired = true;
                neighbors[index].push(edge.index);
                neighbors[edge.index].push(index);
            }
            if (!links.has(from)) links.set(from, new Map());
            const link = links.get(from);
            if (link.has(to)) return null;
            link.set(to, previous);
        }
    }
    if (neighbors.some(list => list.length !== 3)) return null;
    for (const link of links.values()) {
        const start = link.keys().next().value;
        let current = start, count = 0;
        do {
            current = link.get(current);
            count++;
        } while (current !== undefined && current !== start && count <= link.size);
        if (current !== start || count !== link.size) return null;
    }
    const pending = new Set(triangles.keys());
    const shells = [];
    while (pending.size) {
        const start = pending.values().next().value;
        pending.delete(start);
        const queue = [start], vertexIds = new Set();
        for (const index of queue) {
            for (const id of triangles[index]) vertexIds.add(id);
            for (const neighbor of neighbors[index]) if (pending.delete(neighbor)) queue.push(neighbor);
        }
        const shellVertices = [...vertexIds].map(id => vertices[id]);
        const box = bounds(shellVertices);
        const origin = shellVertices[0];
        const volume6 = queue.reduce((sum, index) => {
            const [a,b,c] = triangles[index].map(id => subtract(vertices[id], origin));
            return sum + dot(a, cross(b, c));
        }, 0);
        const extent = Math.max(...subtract(box.max, box.min));
        if (!Number.isFinite(volume6) || Math.abs(volume6) <= extent ** 3 * 1e-12) return null;
        shells.push({ box, volume: Math.abs(volume6) / 6, faces: queue.map(index => {
            const [a,b,c] = triangles[index];
            return volume6 > 0 ? [vertices[a], vertices[b], vertices[c]] : [vertices[a], vertices[c], vertices[b]];
        }) });
    }
    return shells;
}

function intersectsBounds(a, b) {
    return a.min.every((value, axis) => Math.min(a.max[axis], b.max[axis]) > Math.max(value, b.min[axis]));
}

function belowPlane(face, waterline) {
    const clipped = [];
    for (let index = 0; index < 3; index++) {
        const a = face[index], b = face[(index + 1) % 3];
        const aBelow = a[2] <= waterline;
        if (aBelow) clipped.push(a);
        if (aBelow !== (b[2] <= waterline)) {
            const fraction = (waterline - a[2]) / (b[2] - a[2]);
            clipped.push([a[0] + fraction*(b[0] - a[0]), a[1] + fraction*(b[1] - a[1]), waterline]);
        }
    }
    return clipped;
}

// The vertical divergence field (0, 0, z - waterline) gives volume
// from signed horizontal triangle areas. Each clipped corner scales both
// edge lengths by its waterline fraction. Precompute each face once per
// attitude to keep the repeated vertical balance evaluations inexpensive.
function volumeAtWaterline(faces) {
    const projections = [];
    for (const [a,b,c] of faces) {
        const area = ((b[0] - a[0])*(c[1] - a[1]) - (b[1] - a[1])*(c[0] - a[0])) / 2;
        if (area === 0) continue;
        const [low, middle, high] = [a[2], b[2], c[2]].sort((x, y) => x - y);
        projections.push({ low, middle, high, area });
    }
    return waterline => {
        let volume = 0;
        for (const { low, middle, high, area } of projections) {
            if (waterline <= low) continue;
            if (waterline < middle) {
                const height = waterline - low;
                volume -= area * height**3 / (3*(middle - low)*(high - low));
                continue;
            }
            volume += area * ((low - waterline) + (middle - waterline) + (high - waterline))/3;
            if (waterline < high) {
                const height = high - waterline;
                volume -= area * height**3 / (3*(high - low)*(high - middle));
            }
        }
        return Math.max(0, volume);
    };
}

// On the cap plane every tetrahedron would have zero volume. Integrate the
// clipped, oriented faces directly around a reference point on that plane.
function submergedVolume(faces, waterline, [originX, originY]) {
    let volume6 = 0, momentX = 0, momentY = 0, momentZ = 0;
    for (const face of faces) {
        if (face.every(point => point[2] >= waterline)) continue;
        const polygon = face.every(point => point[2] <= waterline) ? face : belowPlane(face, waterline);
        const [a] = polygon;
        for (let index = 1; index + 1 < polygon.length; index++) {
            const b = polygon[index], c = polygon[index + 1];
            const ax = a[0] - originX, ay = a[1] - originY, az = a[2] - waterline;
            const bx = b[0] - originX, by = b[1] - originY, bz = b[2] - waterline;
            const cx = c[0] - originX, cy = c[1] - originY, cz = c[2] - waterline;
            const weight = ax*(by*cz - bz*cy) + ay*(bz*cx - bx*cz) + az*(bx*cy - by*cx);
            volume6 += weight;
            momentX += weight * (ax + bx + cx);
            momentY += weight * (ay + by + cy);
            momentZ += weight * (az + bz + cz);
        }
    }
    const volume = Math.max(0, volume6 / 6);
    return {
        volume,
        center: volume > 0 ? [
            originX + momentX/(4*volume6), originY + momentY/(4*volume6), waterline + momentZ/(4*volume6),
        ] : null,
    };
}

module.exports = { bounds, closedShells, intersectsBounds, submergedVolume, volumeAtWaterline };
