// Maintainer build tool only: one GPU lane plus one isolated CPU lane.
import http from 'node:http';
import { readFile, stat, rename, writeFile, mkdir } from 'node:fs/promises';
import { spawn, fork } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { ensureAudioModel } from '../ensure-audio-model.mjs';
await mkdir('tmp/gpu-builder', {recursive:true});
await mkdir('tmp/audio', {recursive:true});
const root = process.cwd();
const { words } = JSON.parse(await readFile('dist/data/words.json', 'utf8'));
const overrides = JSON.parse(await readFile('tools/pronunciation-overrides.json', 'utf8'));
const allJobs = words.flatMap(w => ['word', 'definition', 'sentence'].map(kind => ({ type:'generate', key:`${w.id}-${kind}`, word:w.word, kind,
 text:kind==='word'?w.word:w[kind], target:path.resolve('dist/audio',`${w.id}-${kind}.mp3`), override:overrides[w.id] })));
const keys = new Set(allJobs.map(j=>j.key));
const manifest = JSON.parse(await readFile('dist/data/audio-manifest.json','utf8').catch(()=>'{}'));
const previous = JSON.parse(await readFile('tmp/gpu-builder/generated.json','utf8').catch(()=>JSON.stringify({keys:manifest.fp32Clips || []})));
const gpuKeys = new Set(previous.keys);
let queue=[],active=new Map(),cpu,cpuReady=false,started=0,completed=0,counts={cpu:0,gpu:0},failed=[],finalized=false,finalizing;
let initialAvailable=new Set(), generated=new Set(),minFree=Infinity;
async function exists(job){return stat(job.target).then(s=>s.size>1000).catch(()=>false);}
function summary(){return{available:new Set([...initialAvailable,...generated]).size,completed,remaining:queue.length,active:active.size,counts,
 elapsedSeconds:started?Math.round((performance.now()-started)/1000):0,done:finalized,failed};}
function claim(lane){
 const i=lane==='gpu'?queue.findIndex(j=>!j.override):queue.findIndex(j=>j.override);
 const index=i>=0?i:(lane==='cpu'&&queue.length?0:-1);
 if(index<0)return null;
 const[job]=queue.splice(index,1);active.set(job.key,{job,lane});return job;
}
async function saveGPUIndex(){await writeFile('tmp/gpu-builder/generated.json',JSON.stringify({model:'Kokoro-82M-v1.0',dtype:'fp32',voice:'af_heart',keys:[...gpuKeys]},null,2));}
async function finishIfDone(){
 if(!started||queue.length||active.size||finalized||finalizing)return;
 finalizing=(async()=>{
  if(cpu&&cpu.connected)cpu.send({type:'close'});
  const available={},checksums={};let clips=0;
  for(const w of words){available[w.id]=[];for(const kind of ['word','definition','sentence']){
   const name=`${w.id}-${kind}.mp3`;const b=await readFile(`dist/audio/${name}`).catch(()=>null);
   if(b&&b.length>1000){available[w.id].push(kind);clips++;checksums[name]=createHash('sha256').update(b).digest('hex');}
  }}
  await saveGPUIndex();
  await writeFile('dist/data/audio-manifest.json',JSON.stringify({model:'onnx-community/Kokoro-82M-v1.0-ONNX',engine:'kokoro-js 1.2.1',voice:'af_heart',
   dtype:'q8 CPU / fp32 GPU',speed:.95,format:'mp3',clips,reviewStatus:'Machine-generated; check unusual words against the printed guide.',
   fp32Clips:[...gpuKeys],available,checksums},null,2)+'\n');
  finalized=true;
  await writeFile('tmp/gpu-builder/report.json',JSON.stringify({...summary(),minimumFreeMiB:minFree},null,2));
  console.log('COMPLETE',JSON.stringify(summary()));
 })();await finalizing;
}
async function dispatchCPU(){if(!cpuReady||!cpu?.connected)return;const job=claim('cpu');if(job)cpu.send(job);else await finishIfDone();}
async function complete(key,lane){active.delete(key);generated.add(key);completed++;counts[lane]++;if(completed%10===0)console.log(JSON.stringify(summary()));await finishIfDone();}
async function start(limit,useCPU){
 if(started)return;
 await ensureAudioModel();
 const missing=[];
 for(const job of allJobs){if(await exists(job))initialAvailable.add(job.key);else missing.push(job);}
 queue=missing.slice(0,limit);
 // Correct the retained acajou recordings using the guide's first pronunciation.
 if(useCPU)queue.unshift(...allJobs.filter(j=>j.key.startsWith('sboc-2027-junior-003-')&&!queue.some(x=>x.key===j.key)));
 started=performance.now();
 console.log(`Starting ${queue.length} jobs; GPU + ${useCPU?'one CPU process':'no CPU process'}`);
 if(useCPU){
  cpu=fork(new URL('../../tools/audio-worker.mjs',import.meta.url),[],{windowsHide:true,env:{...process.env,AUDIO_WORKER_CONFIG:JSON.stringify({id:9,threads:1})},stdio:['ignore','pipe','pipe','ipc']});
  cpu.stdout.on('data',b=>process.stdout.write(b));cpu.stderr.on('data',b=>process.stderr.write(b));
  cpu.on('message',async m=>{try{
   if(m.type==='ready'){cpuReady=true;await dispatchCPU();}
   else if(m.type==='done'){await complete(m.key,'cpu');await dispatchCPU();}
   else if(m.type==='failed'){active.delete(m.key);failed.push({key:m.key,message:m.message});await dispatchCPU();}
   else if(m.type==='fatal'){failed.push({lane:'cpu',message:m.message});cpuReady=false;console.error(m.message);}
  }catch(e){console.error(e.message);}});
  cpu.on('error',e=>{failed.push({lane:'cpu',message:e.message});console.error(e.message);});
 }
}
const timer=setInterval(()=>{minFree=Math.min(minFree,Math.round(os.freemem()/1024**2));},5000);
const server=http.createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://127.0.0.1:4174');
 if(req.method==='GET'&&u.pathname==='/'){res.setHeader('Content-Type','text/html');res.end(await readFile(new URL('./index.html', import.meta.url)));return;}
 if(req.method==='GET'&&u.pathname==='/kokoro.web.js'){res.setHeader('Content-Type','text/javascript');res.end(await readFile('node_modules/kokoro-js/dist/kokoro.web.js'));return;}
 if(req.method==='GET'&&u.pathname==='/status'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(summary()));return;}
 if(req.method==='POST'&&u.pathname==='/start'){
  if(req.headers.origin!=='http://127.0.0.1:4174'){res.writeHead(403).end();return;}
  await start(Number(u.searchParams.get('limit'))||Infinity,u.searchParams.get('cpu')==='1');res.end('Started');return;
 }
 if(req.method==='GET'&&u.pathname==='/claim'){
  const job=claim('gpu');await finishIfDone();res.setHeader('Content-Type','application/json');res.end(JSON.stringify(job||{waiting:!finalized,done:finalized}));return;
 }
 if(req.method==='POST'&&u.pathname.startsWith('/save/')){
  if(req.headers.origin!=='http://127.0.0.1:4174'){res.writeHead(403).end();return;}
  const key=u.pathname.slice(6);if(!keys.has(key)||active.get(key)?.lane!=='gpu')throw Error('Invalid recording lease');
  const pieces=[];let length=0;for await(const p of req){length+=p.length;if(length>10_000_000)throw Error('Clip too large');pieces.push(p);}
  const target=path.join(root,'dist/audio',key+'.mp3'),temporary=target+'.gpu.tmp.mp3';
  await new Promise((resolve,reject)=>{const p=spawn('ffmpeg',['-v','error','-y','-i','pipe:0','-codec:a','libmp3lame','-b:a','64k','-ac','1','-threads','1',temporary],{windowsHide:true,stdio:['pipe','ignore','pipe']});let errors='';p.stderr.on('data',b=>errors+=b.toString());p.on('error',reject);p.on('exit',c=>c===0?resolve():reject(Error(errors)));p.stdin.end(Buffer.concat(pieces));});
  await rename(temporary,target);gpuKeys.add(key);await saveGPUIndex();await complete(key,'gpu');res.end('Saved');return;
 }
 res.writeHead(404).end();
}catch(e){console.error(e.message);res.writeHead(500).end(e.message);}});
const shutdown=()=>{clearInterval(timer);cpu?.kill();server.close();};process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
server.listen(4174,'127.0.0.1',()=>console.log('Build tool: http://127.0.0.1:4174'));
