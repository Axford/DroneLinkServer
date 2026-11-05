const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');
const { Passport, Strategy } = require('passport');
const crypto = require('node:crypto');
const { fakeStore, LegacyId } = require('./store-fixture.cjs');
const Types = { ObjectId: LegacyId };

const root = path.resolve(__dirname, '../..');
const baselineRevision = '704a33ec9569dd12fea305cf1d87e4bb3b37ffc1';
const ids = {member:'000000000000000000000001', outsider:'000000000000000000000002',
  domain:'000000000000000000000011', otherDomain:'000000000000000000000012'};
const idString = id => String(id?._id || id);

// Provider adapter: real Passport invokes the production verify callback and
// creates the real session; this never contacts Google or adds a test route.
class TestGoogleStrategy extends Strategy {
  constructor(options, verify) { super(); this.name = 'google'; this.options = options; this.verify = verify; }
  authenticate(req) {
    if (!req.path.endsWith('/callback')) return this.redirect('https://accounts.google.com/test-consent');
    if (req.query.fail) return this.fail();
    if (req.query.error) return this.verify('test-access', 'test-refresh', null, (err) => this.error(err || new Error('Expected provider failure')));
    const key = req.query.identity || 'member';
    const profile = {id:`${key}-google`,displayName:`${key} user`,emails:[{value:`${key}@example.test`}],photos:[{value:'https://example.test/avatar.png'}]};
    this.verify('test-access','test-refresh',profile,(err,user) => err ? this.error(err) : user ? this.success(user) : this.fail());
  }
}

class Query {
  constructor(result) { this.result = result; }
  populate() { return this; }
  select() { return this; }
  sort() { return this; }
  skip(n) { if (Array.isArray(this.result)) this.result=this.result.slice(n); return this; }
  limit(n) { if (Array.isArray(this.result)) this.result=this.result.slice(0,n); return this; }
  lean() { return this; }
  then(resolve,reject) { return Promise.resolve(this.result).then(resolve,reject); }
}

function modelFixture() {
  const users = new Map(); const domains = new Map(); const packets = [];
  const writes = [];
  class User {
    constructor(data) { Object.assign(this,{_id:new Types.ObjectId(),domains:[]},data); this.id=String(this._id); }
    async save() { users.set(String(this._id),this); writes.push('user.save'); return this; }
    static async findOne(query) { return [...users.values()].find(user=>user.googleId===query.googleId) || null; }
    static async findById(id) { return users.get(idString(id)) || null; }
    static async findByIdAndUpdate(id,update) {
      writes.push('user.update'); const user=users.get(idString(id));
      if (user) {
        if (update.$push) user.domains.push(update.$push.domains);
        else if (update.mapState) user.mapState=update.mapState;
      }
      return user;
    }
    static async updateMany(query,update) {
      writes.push('users.update');
      for (const id of query._id.$in) {
        const user=users.get(idString(id));
        if(user) user.domains=user.domains.filter(d=>idString(d)!==idString(update.$pull.domains));
      }
    }
  }
  class Domain {
    constructor(data) { Object.assign(this,{_id:new Types.ObjectId(),createdAt:new Date('2026-01-01T00:00:00Z'),apiKey:'fixture-key',inviteToken:'fixture-invite',stats:{nodeCount:0,packetCount:0}},data); }
    async save() { domains.set(String(this._id),this); writes.push('domain.save'); return this; }
    async deleteOne() { domains.delete(String(this._id)); writes.push('domain.delete'); }
    static findById(id) {
      if(id==='cast-error') { const err=new Error('fixture cast failure'); err.name='CastError'; throw err; }
      if(id==='server-error') throw new Error('fixture database failure');
      return new Query(domains.get(idString(id)) || null);
    }
    static findOne(query) {
      return new Query([...domains.values()].find(d=>
        (!query._id || (query._id.$ne ? String(d._id)!==idString(query._id.$ne) : String(d._id)===idString(query._id))) &&
        (!query.name || d.name===query.name) && (!query.inviteToken || d.inviteToken===query.inviteToken) &&
        (!query.users || d.users.some(id=>idString(id)===idString(query.users)))) || null);
    }
    static find(query) { return new Query([...domains.values()].filter(d=>d.users.some(id=>idString(id)===idString(query.users)) && (!query.name || new RegExp(query.name.$regex,query.name.$options).test(d.name)))); }
    static async countDocuments(query) { return (await this.find(query)).length; }
    static async findByIdAndUpdate(id,update) {
      writes.push('domain.update'); const domain=domains.get(idString(id));
      if(domain) {
        if(update.$inc) domain.stats.packetCount+=update.$inc['stats.packetCount'];
        else Object.assign(domain,update);
      }
      return domain;
    }
  }
  class RxPacket {
    constructor(data) { Object.assign(this,{_id:new Types.ObjectId()},data); }
    async save() { packets.push(this); writes.push('packet.save'); }
    static find(query) {
      return new Query(packets.filter(p=>idString(p.domain)===idString(query.domain) &&
        (!query.time || (query.time.$gte ? p.time>=query.time.$gte : p.time>query.time.$gt))));
    }
  }
  for(const name of ['member','outsider']) {
    const user=new User({_id:new Types.ObjectId(ids[name]),googleId:`${name}-google`,displayName:`${name} user`,email:`${name}@example.test`}); users.set(ids[name],user);
  }
  domains.set(ids.domain,new Domain({_id:new Types.ObjectId(ids.domain),name:'Test domain',users:[users.get(ids.member)._id],createdBy:users.get(ids.member)._id}));
  return {models:{User,Domain,RxPacket},users,domains,packets,writes};
}

const testConfig = overrides => ({...(process.env.CLIENT_BUILD_DIR ? {clientBuildDir:path.resolve(process.env.CLIENT_BUILD_DIR)} : {}),port:0,cookieKey:'isolated-test-session-secret-at-least-32-characters',googleClientID:'test-id',googleClientSecret:'test-secret',mongoURI:'test-no-network',mapboxAccessToken:'public-test-map-token',...overrides});
function baselineApp(config, models) {
  const localRequire=createRequire(path.join(root,'index.js'));
  const source=fixtureSource('704a33e/index.js');
  let app;
  const express=localRequire('express');
  const isolatedPassport=new Passport();
  const expressFactory=Object.assign((...args)=>{app=express(...args); app.listen=()=>{}; return app;},express);
  const replacements={
    './config.json':config, mongoose:{connect:async()=>{}}, passport:isolatedPassport,
    'passport-google-oauth20':{Strategy:TestGoogleStrategy},
    fs:{...fs,existsSync:file=>file==='./config.json' || fs.existsSync(file)},
    express:expressFactory,
    './middleware/errorHandler':loadHistorical('704a33e', 'middleware/errorHandler.js'),
    './middleware/validation':loadHistorical('704a33e', 'middleware/validation.js'),
    './models/User':models.User,'./models/Domain':models.Domain,'./models/RxPacket':models.RxPacket,'./models/Node':{}
  };
  vm.runInNewContext(source,{require:name=>Object.hasOwn(replacements,name)?replacements[name]:localRequire(name),__dirname:root,console:{log(){},error(){}},process:{exit:code=>{throw Error(`Unexpected baseline exit ${code}`);}},Buffer,setTimeout,clearTimeout},{filename:'pre-sep-02-index.js'});
  return app;
}
// Historical code is portable and checksummed, never loaded from another checkout.
const historicalProvenance = require('./fixtures/provenance.json');
function fixtureSource(file) {
  const source=fs.readFileSync(path.join(__dirname,'fixtures',file),'utf8');
  if (crypto.createHash('sha256').update(source).digest('hex')!==historicalProvenance.files[file]) throw new Error('Historical source checksum mismatch: '+file);
  return source;
}
function loadHistorical(revision, file) {
  const mod={exports:{}};
  const localRequire=createRequire(path.join(root,file));
  vm.runInNewContext(fixtureSource(revision+'/'+file),{module:mod,exports:mod.exports,Buffer,console,setTimeout,clearTimeout,__dirname:path.dirname(path.join(root,file)),require:name=>name.startsWith('./') ? loadHistorical(revision,path.posix.join(path.posix.dirname(file),name)+'.js') : localRequire(name)},{filename:'historical-'+file});
  return mod.exports;
}
function sep02Factory() { return loadHistorical('418c9d0','app.js').createApp; }
function application(target, options={}) {
  const fixture=options.fixture || modelFixture(); const config=testConfig(options.config);
  const factory=target==='sep02' ? sep02Factory() : require('../../app').createApp;
  const app=target==='baseline' ? baselineApp(config,fixture.models) : factory({config,...(target==='sep02' ? {models:fixture.models} : {store:options.store || fakeStore(fixture)}),googleStrategyFactory:(options,verify)=>new TestGoogleStrategy(options,verify)});
  return {app,fixture};
}
async function serve(t, app) {
  const server=http.createServer(app);
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  const origin=`http://127.0.0.1:${server.address().port}`;
  return function agent() {
    let cookie='';
    return {
      get cookie() {return cookie;},
      async request(url,options={}) {
        const headers={...options.headers}; if(cookie) headers.Cookie=cookie;
        const response=await fetch(origin+url,{redirect:'manual',...options,headers});
        if(response.headers.get('set-cookie')) cookie=response.headers.get('set-cookie').split(';')[0];
        const text=await response.text();
        return {status:response.status,headers:response.headers,text,json:()=>JSON.parse(text)};
      },
      async login(identity='member') { return this.request(`/auth/google/callback?identity=${identity}`); }
    };
  };
}
module.exports={root,ids,modelFixture,TestGoogleStrategy,testConfig,baselineApp,application,serve};
