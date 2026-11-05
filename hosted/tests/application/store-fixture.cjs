const crypto = require('node:crypto');
const { StorageError } = require('@dronelink/persistence');

// Historical model doubles need ObjectId-like behavior without a hosted Mongoose dependency.
class LegacyId {
    constructor(value) { this.value = value ? String(value) : Math.floor(Date.now()/1000).toString(16).padStart(8,'0') + crypto.randomBytes(8).toString('hex'); }
    get _id() { return this; }
    toString() { return this.value; }
    toJSON() { return this.value; }
    getTimestamp() { return new Date(parseInt(this.value.slice(0,8),16)*1000); }
}
function record(value) {
    if (value == null || typeof value !== 'object') return value;
    if (value instanceof LegacyId) return String(value);
    if (Buffer.isBuffer(value)) return Buffer.from(value);
    if (value instanceof Date) return new Date(value);
    if (Array.isArray(value)) return value.map(record);
    return Object.fromEntries(Object.entries(value).map(([key,item]) => [key,record(item)]));
}
function fakeStore(fixture) {
    const { User, Domain, RxPacket } = fixture.models;
    const run = fn => async (...args) => {
        try { return record(await fn(...args)); }
        catch(error) { throw new StorageError(error.name === 'CastError' ? 'invalid-id' : 'internal'); }
    };
    const save = async (id, update) => { const domain=await Domain.findById(id); if (!domain) throw new StorageError('internal'); update(domain); return domain.save(); };
    return {
        users: {
            findByGoogleId:run(googleId=>User.findOne({googleId})), getById:run(id=>User.findById(id)),
            create:run(data=>new User(data).save()),
            recordSignIn:run(async(id,time)=>{const user=await User.findById(id); user.lastSignInDate=time;return user.save();}),
            updateMapState:run((id,mapState)=>User.findByIdAndUpdate(id,{mapState})),
            addDomain:run((id,domainId)=>User.findByIdAndUpdate(id,{$push:{domains:domainId}})),
            removeDomainFromUsers:run((ids,domainId)=>User.updateMany({_id:{$in:ids}},{$pull:{domains:domainId}}))
        },
        domains: {
            getById:run(id=>Domain.findById(id)), getDetails:run(id=>Domain.findById(id)),
            findByInviteToken:run(inviteToken=>Domain.findOne({inviteToken})),
            findNamedForUser:run((name,userId,excludeId)=>Domain.findOne({name,users:userId,...(excludeId?{_id:{$ne:excludeId}}:{})})),
            countForUser:run((userId,search)=>Domain.countDocuments({users:userId,...(search?{name:{$regex:search,$options:'i'}}:{})})),
            listForUser:run(async(userId,options)=>{
                const domains=await Domain.find({users:userId,...(options.searchPattern?{name:{$regex:options.searchPattern,$options:'i'}}:{})}).skip(options.offset).limit(options.limit);
                return Promise.all(domains.map(async domain=>{
                    const createdAt=domain.createdAt || domain._id.getTimestamp().toISOString();
                    const update={};
                    if(!domain.apiKey) update.apiKey=domain.apiKey=crypto.randomBytes(32).toString('hex');
                    if(!domain.inviteToken) update.inviteToken=domain.inviteToken=crypto.randomBytes(16).toString('hex');
                    if(!domain.createdBy && domain.users.length) update.createdBy=domain.createdBy=domain.users[0];
                    if(Object.keys(update).length) await Domain.findByIdAndUpdate(domain._id,update);
                    return {...domain,createdAt,updatedAt:domain.updatedAt||createdAt,stats:domain.stats||{nodeCount:0,packetCount:0},createdBy:domain.createdBy||null};
                }));
            }),
            create:run(data=>new Domain(data).save()), rename:run((id,name)=>save(id,d=>{d.name=name;})),
            remove:run(async id=>{const domain=await Domain.findById(id);return domain?.deleteOne();}),
            setApiKey:run((id,key)=>save(id,d=>{d.apiKey=key;})), setInviteToken:run((id,inviteToken)=>Domain.findByIdAndUpdate(id,{inviteToken})),
            addMember:run((id,userId)=>save(id,d=>{d.users.push(userId);})),
            incrementPacketCount:run(id=>Domain.findByIdAndUpdate(id,{$inc:{'stats.packetCount':1}}))
        },
        packets: {
            append:run(data=>new RxPacket(data).save()),
            listHistory:run(({domainId,since,limit})=>RxPacket.find({domain:domainId,time:{$gte:since}}).limit(limit)),
            listAfter:run(({domainId,since,limit})=>RxPacket.find({domain:domainId,time:{$gt:since}}).limit(limit))
        },
        close:async()=>{}
    };
}
module.exports={LegacyId,fakeStore};
