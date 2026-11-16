'use strict';
const express = require('express');
const Joi = require('joi');
const { asyncHandler } = require('../middleware/errorHandler');
const { fault } = require('./accessPolicy');
const { defaultWater, waterDensities } = require('./dreamer/hydrostatics');
const { runStability } = require('./dreamer/stability');

const endpoint = '/api/domains/:id/dreamer-models';
const editRoles = ['owner', 'editor'];
const uuid = Joi.string().guid({ version: ['uuidv4'], separator: '-' }).lowercase();
const stabilityInput = Joi.object({
    water: Joi.string().valid(...Object.keys(waterDensities)).default(defaultWater),
}).required();
const axis = Joi.string().valid('+X', '-X', '+Y', '-Y', '+Z', '-Z');
const vector = Joi.array().length(3).items(Joi.number().required());
const requiredVector = vector.required();
const maxTriangles = 120000;
const count = Joi.number().integer().min(0).max(maxTriangles).required();
const joint = Joi.object({
    pivot: requiredVector, axis: requiredVector,
    neutral: Joi.number(), minimum: Joi.number().required(), maximum: Joi.number().required(),
}).allow(null).required();
const mesh = Joi.object({
    vertices: Joi.array().min(3).max(maxTriangles).required(),
    triangles: Joi.array().min(1).max(maxTriangles).required(),
    closed: Joi.boolean().required(), duplicateVertices: count, degenerateFaces: count,
}).required();
const part = Joi.object({
    id: Joi.string().pattern(/^[1-9]\d{0,2}$/).required(), name: Joi.string().trim().min(1).max(160).required(),
    mesh, sourcePose: Joi.array().length(4).items(requiredVector).required(),
    translation: requiredVector, rotation: requiredVector, centerOfMass: vector.allow(null).required(),
    mass: Joi.number().min(0).allow(null).required(),
    role: Joi.string().valid('Unassigned', 'Displacement hull', 'Ballast', 'Water foil', 'Rigid sail', 'Visual only').required(),
    simulationEnabled: Joi.boolean(),
    joint,
});
const body = Joi.object({
    baseRevisionId: uuid.allow(null).required(),
    model: Joi.object({
        version: Joi.valid(1).required(), name: Joi.string().trim().min(1).max(120).required(),
        forward: axis.required(), up: axis.required(),
        parts: Joi.array().min(1).max(50).items(part.required()).unique('id').required(),
    }).required(),
}).required();

function readModel(input) {
    const { error, value } = body.validate(input, { convert: false });
    if (error || value.model.forward[1] === value.model.up[1]) throw fault('validation');
    let triangles = 0, vertices = 0;
    for (const part of value.model.parts) {
        const geometry = part.mesh;
        vertices += geometry.vertices.length;
        triangles += geometry.triangles.length;
        if (vertices > maxTriangles || triangles > maxTriangles || (part.joint && (
            part.joint.minimum > part.joint.maximum || Math.hypot(...part.joint.axis) <= 1e-9)))
            throw fault('validation');
        for (const point of geometry.vertices) {
            if (!Array.isArray(point) || point.length !== 3 || !point.every(v => Number.isFinite(v) && Math.abs(v) <= 1000))
                throw fault('validation');
        }
        for (const triangle of geometry.triangles) {
            if (!Array.isArray(triangle) || triangle.length !== 3 || new Set(triangle).size !== 3 ||
                !triangle.every(index => Number.isSafeInteger(index) && index >= 0 && index < geometry.vertices.length))
                throw fault('validation');
        }
    }
    return value;
}

function mountDreamerRoutes(app, { store, ready, policy, ensureAuthenticated }) {
    const models = store.dreamerModels;
    const input = req => ({ domainId: req.params.id, modelId: req.params.modelId, revisionId: req.params.revisionId });
    const read = fn => [ready, ensureAuthenticated, asyncHandler(async (req, res) => {
        const current = await policy.domain(req);
        const data = await fn(current.actor, { ...input(req), after: req.query.after }, req);
        await policy.domain(req);
        res.json(data);
    })];
    app.get(endpoint, ...read((actor, target) => models.list(actor, target)));
    const revisions = endpoint + '/:modelId/revisions';
    app.get(revisions, ...read((actor, target) => models.revisions(actor, target)));
    const revision = revisions + '/:revisionId';
    app.get(revision, ...read(async (actor, target) => ({ data: await models.get(actor, target) })));
    const editDomain = asyncHandler(async (req, res, next) => {
        req.dreamerActor = (await policy.domain(req, editRoles, true)).actor;
        next();
    });
    const stability = revision + '/stability';
    const analysis = stability + '/:analysisId';
    const analysisTarget = (req, target) => ({ ...target, analysisId: req.params.analysisId });
    app.get(stability, ...read((actor, target) => models.listStability(actor, target)));
    app.get(analysis, ...read(async (actor, target, req) => ({ data: await models.getStability(actor, analysisTarget(req, target)) })));
    app.put(analysis, ready, ensureAuthenticated, editDomain, express.json({ limit: '2kb', inflate: false }),
        asyncHandler(async (req, res) => {
            const target = analysisTarget(req, input(req));
            const { error, value } = stabilityInput.validate(req.body, { convert: false });
            if (error || uuid.validate(target.analysisId, { convert: false }).error) throw fault('validation');
            const { water } = value;
            const actor = req.dreamerActor;
            const existing = await models.getStability(actor, target).catch(issue => {
                if (issue.code !== 'not-found') throw issue;
                return null;
            });
            if (existing) {
                if (existing.water !== water) throw fault('conflict');
                await policy.domain(req, editRoles, true);
                return res.json({ data: existing });
            }
            const snapshot = await models.get(actor, target);
            const result = await runStability(snapshot.model, water);
            if (!result.equilibrium) {
                await policy.domain(req, editRoles, true);
                const names = new Map(snapshot.model.parts.map(part => [part.id, part.name]));
                const diagnostics = result.diagnostics.map(issue => ({
                    ...issue, partName: names.get(issue.partId), otherPartName: names.get(issue.otherPartId),
                }));
                return res.json({ data: null, result: { ...result, diagnostics } });
            }
            const data = await models.saveStability(actor, { ...target, water, result });
            res.json({ data });
        }));
    app.put(revision, ready, ensureAuthenticated, editDomain, express.json({ limit: '10mb', inflate: false }),
        asyncHandler(async (req, res) => {
            const target = input(req);
            if (uuid.validate(target.modelId, { convert: false }).error || uuid.validate(target.revisionId, { convert: false }).error)
                throw fault('validation');
            const data = await models.save(req.dreamerActor, { ...target, ...readModel(req.body) });
            res.json({ data });
        }));
}
module.exports = { mountDreamerRoutes };
