'use strict';

const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

function routeCoordinates(text) {
    const rows = text.replace(/[ \t\r]/g, '').split('\n');
    const header = rows.shift().split(',');
    const columns = ['lon', 'lat', 'radius'].map(name => header.indexOf(name));
    if (columns.includes(-1) || columns.some(index => header.lastIndexOf(header[index]) !== index)) return;
    const coordinates = [];
    for (const row of rows) {
        if (!row) continue;
        const cells = row.split(',');
        const values = columns.map(index => cells[index]);
        if (values.some(value => !value || value.length > 31 || !decimal.test(value))) return;
        const [longitude, latitude, radius] = values.map(value => Math.fround(Number(value)));
        if (!longitude || Math.abs(longitude) > 180 || Math.abs(latitude) > 90 ||
            !Number.isFinite(latitude) || !Number.isFinite(radius)) return;
        coordinates.push([longitude, latitude]);
        if (coordinates.length > 255) return;
    }
    if (coordinates.length) return coordinates;
}

module.exports = { routeCoordinates };
