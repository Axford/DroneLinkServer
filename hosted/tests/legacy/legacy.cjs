const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const provenance = require('./fixtures/baseline.json');
function legacyModels(connection) {
  const models = {};
  for (const name of ['User', 'Domain', 'RxPacket', 'Node']) {
    const source = fs.readFileSync(path.join(__dirname, 'fixtures/legacy-models', name + '.js'), 'utf8');
    if (crypto.createHash('sha256').update(source).digest('hex') !== provenance.files[`models/${name}.js`]) throw new Error(`Legacy ${name} fixture differs`);
    const mod = { exports: {} };
    vm.runInNewContext(source, { module: mod, Buffer, Date, require: dependency => dependency === 'mongoose'
      ? { ...mongoose, model: connection.model.bind(connection) }
      : dependency === 'joi' ? {} : require(dependency) }, { filename: `legacy-${name}.js` });
    models[name] = mod.exports;
  }
  return models;
}
module.exports = { legacyModels };
