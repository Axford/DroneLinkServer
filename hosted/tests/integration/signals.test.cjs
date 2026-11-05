const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { withMongo } = require('../../tools/mongo.cjs');
const { root, testConfig } = require('../application/support.cjs');

for (const signal of ['SIGINT','SIGTERM']) {
    test(`real hosted CLI releases HTTP and MongoDB on ${signal}`, async t => withMongo(async uri => {
        const serviceDir=fs.mkdtempSync(path.join(root,'.test-application-'));
        t.after(()=>fs.rmSync(serviceDir,{recursive:true,force:true}));
        for(const item of ['index.js','app.js','lib','middleware','public']) fs.cpSync(path.join(root,item),path.join(serviceDir,item),{recursive:true});
        fs.writeFileSync(path.join(serviceDir,'config.json'),JSON.stringify(testConfig({mongoURI:uri+'signals'})));
        const child=spawn(process.execPath,[path.join(serviceDir,'index.js')],{cwd:require('node:os').tmpdir(),stdio:['ignore','pipe','pipe']});
        const exited=once(child,'exit');
        let output='';
        child.stderr.on('data',bytes=>{output+=bytes;});
        t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await exited;}});
        const deadline=setTimeout(()=>child.kill('SIGKILL'),10000);
        try {
            const port=await new Promise((resolve,reject)=>{
                child.stdout.on('data',bytes=>{output+=bytes;const match=output.match(/Hosted server listening on port (\d+)/);if(match)resolve(Number(match[1]));});
                child.once('error',reject); child.once('exit',()=>reject(Error('CLI exited before ready: '+output)));
            });
            const response=await fetch(`http://127.0.0.1:${port}/api/user`,{redirect:'manual'});
            assert.equal(response.status,302); await response.text();
            child.kill(signal);
            const [code,terminatedBy]=await exited;
            assert.equal(code,0,output); assert.equal(terminatedBy,null);
            assert.doesNotMatch(output,/mongodb:\/\//);
            await assert.rejects(fetch(`http://127.0.0.1:${port}/api/user`));
        } finally {clearTimeout(deadline);}
    }));
}
