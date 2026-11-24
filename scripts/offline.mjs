import {readdir,readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
async function paths(dir){const entries=await readdir(dir,{withFileTypes:true});return (await Promise.all(entries.map(e=>e.isDirectory()?paths(dir+'/'+e.name):dir+'/'+e.name))).flat()}
const files=(await paths('dist')).filter(f=>!f.endsWith('/sw.js')).sort()
const hash=createHash('sha256')
for(const f of files) hash.update(await readFile(f))
const version='sinjar-ezidi-'+hash.digest('hex').slice(0,12)
await writeFile('dist/sw.js',`const version=${JSON.stringify(version)},files=${JSON.stringify(files.map(f=>'./'+f.slice(5)))};
self.addEventListener('install',e=>e.waitUntil(caches.open(version).then(c=>c.addAll(files))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('sinjar-ezidi-')&&k!==version).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||!e.request.url.startsWith(self.registration.scope))return;e.respondWith(caches.open(version).then(async c=>{const hit=e.request.mode==='navigate'?await c.match('./index.html',{ignoreVary:true}):await c.match(e.request,{ignoreVary:true});if(hit)return hit;try{return await fetch(e.request)}catch(err){if(e.request.mode==='navigate')return await c.match('./index.html')||Response.error();throw err}}))});`)
