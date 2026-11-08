'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateDomain } = require('../managed/m1-e.cjs');
const fixture = { _id: 'new-fixture', name: 'M1-E acceptance 2026-11-08', createdBy: 'admin', status: 'active' };
test('managed E mutations exclude original Domains and require the active named Admin fixture', () => {
    assert.doesNotThrow(() => validateDomain(fixture, [], 'admin'));
    assert.throws(() => validateDomain(fixture, [{ name: 'projects/p/databases/d/documents/domains/new-fixture' }], 'admin'), /Original Domains/);
    assert.throws(() => validateDomain({ ...fixture, name: 'Original Domain' }, [], 'admin'));
    assert.throws(() => validateDomain({ ...fixture, createdBy: 'other' }, [], 'admin'));
    assert.throws(() => validateDomain({ ...fixture, status: 'archived' }, [], 'admin'), /credential cleanup/);
    assert.throws(() => validateDomain(null, [], 'admin'));
});
