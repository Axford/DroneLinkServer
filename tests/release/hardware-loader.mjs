/** Test-only transport replacements; never selected by production startup. */
import { pathToFileURL } from 'node:url';
export async function resolve(specifier, context, nextResolve) {
 if(specifier.endsWith('/UDPInterface.mjs') || specifier.endsWith('/SerialInterface.mjs'))return {url:'data:text/javascript,'+encodeURIComponent('export default class SimulatedTransport { constructor() {} }'),shortCircuit:true};
 if(specifier==='http')return {url:'data:text/javascript,'+encodeURIComponent(`import http from 'node:http';export default {...http,createServer(...args){const server=http.createServer(...args);const listen=server.listen.bind(server);server.listen=(_port,callback)=>{server.once('listening',()=>process.send?.({port:server.address().port}));return listen(0,'127.0.0.1',callback);};return server;}}`),shortCircuit:true};
 return nextResolve(specifier,context);
}
