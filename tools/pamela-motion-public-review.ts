import {cp,mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import path from 'node:path';
import {validateMotionContract,type MotionContract} from '../src/pamela-motion-contract.ts';

// Explicit static review allowlist. No server, API configuration or original requests enter it.
const root=process.cwd(),arg=process.argv.find(x=>x.startsWith('--destination='));
const destination=arg?.slice(14)??'exports/pamela-motion-review-20261109-r1';
if(!/^exports\/pamela-motion-review-[a-z0-9-]+$/.test(destination))throw Error('Invalid review destination');
const previous='exports/pamela-pilot-review-20261109-r1/.vercel/output';
const target=JSON.parse(await readFile('references/public-review.json','utf8'));
if(target.projectId!=='prj_mQwHzspK3GrrJA04eFOorFxth0d5'||target.teamId!=='team_Scxorb9qtZHjNae1YEQnFCaT')throw Error('Lab identity mismatch');
const contract=JSON.parse(await readFile('references/pamela-motion-contract.json','utf8')) as MotionContract;
const errors=validateMotionContract(contract);if(errors.length)throw Error(errors.join('; '));
const stage=JSON.parse(await readFile('references/pamela-stage-contract.json','utf8'));
await mkdir(destination);await mkdir(`${destination}/.vercel`);
await cp(previous,`${destination}/.vercel/output`,{recursive:true,force:false,errorOnExist:true});
await writeFile(`${destination}/.vercel/project.json`,JSON.stringify({projectId:target.projectId,orgId:target.teamId,projectName:target.projectName}));
const routeFile=`${destination}/.vercel/output/config.json`,routes=JSON.parse(await readFile(routeFile,'utf8'));
routes.routes.unshift({src:'/pamela-(?:bank|scen|motion-manifest|platser|pilot-manifest).*',headers:{'Cache-Control':'no-cache, max-age=0, must-revalidate'},continue:true});
await writeFile(routeFile,JSON.stringify(routes));
const output=path.join(root,destination,'.vercel/output/static');
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const media:Array<{source:string;publicPath:string;sha256:string;bytes:number}>=[];
async function copy(source:string,expected?:string){
 if(!source.startsWith('runs/')||source.split('/').some(x=>!x||x==='..'||x.startsWith('.'))||! /\.(png|jpg|mp4|json)$/.test(source))throw Error('Disallowed media');
 const bytes=await readFile(source),sha256=hash(bytes);if(expected&&expected!==sha256)throw Error('Source hash changed '+source);
 const publicPath='/files/'+source;await mkdir(path.dirname(output+publicPath),{recursive:true});await writeFile(output+publicPath,bytes);
 media.push({source,publicPath,sha256,bytes:bytes.length});
}
for(const a of contract.assets)await copy(a.path,a.sha256);
for(const file of [stage.assets.dealer,stage.assets.room,stage.assets.felt,stage.assets.provenance])await copy(file);
const runtime=path.join(root,'.runtime','motion-review-bundle');await mkdir(runtime,{recursive:true});
const require=createRequire(import.meta.url),loader=path.join(runtime,'typescript-loader.cjs');
await writeFile(loader,`const swc=require(${JSON.stringify(require.resolve('next/dist/build/swc'))});module.exports=function(source){return swc.transformSync(source,{filename:this.resourcePath,jsc:{parser:{syntax:'typescript',tsx:true},target:'es2022',transform:{react:{runtime:'automatic'}}},module:{type:'es6'}}).code;};`);
for(const [name,component,props]of [['pamela-bank','src/pamela-motion-lab-client.tsx',{contract,publicMode:true}],['pamela-scen','src/pamela-stage-client.tsx',{contract:stage,publicMode:true}]]as const){
 const entry=path.join(runtime,name+'.tsx');
 await writeFile(entry,`import {createRoot} from 'react-dom/client';import Component from ${JSON.stringify(path.join(root,component))};createRoot(document.getElementById('root')!).render(<Component {...${JSON.stringify(props)}}/>);`);
 const {webpack}=require('next/dist/compiled/webpack/webpack');
 await new Promise<void>((resolve,reject)=>{const compiler=webpack({mode:'production',context:root,target:'web',entry,output:{path:output,filename:name+'.js',chunkFilename:name+'-[contenthash].js',publicPath:'/'},devtool:false,optimization:{minimize:false},resolve:{extensions:['.tsx','.ts','.js','.json']},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:[{loader}]}]},performance:{hints:false}});compiler.run((err:Error|null,stats:any)=>compiler.close((close:Error|null)=>{if(err||close||stats?.hasErrors())reject(err??close??Error(stats.toString({all:false,errors:true})));else resolve();}));});
 await writeFile(path.join(output,name+'.html'),`<!doctype html><html lang="sv"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pamela · ${name==='pamela-bank'?'Rörelsebank':'Scen och ljus'}</title><style>body{margin:0;background:#111819}</style><div id="root"></div><script defer src="/${name}.js"></script></html>`);
}
const now=new Date().toISOString(),snapshot='pamela-motion-review-'+now.replace(/\D/g,'');
const manifest={schemaVersion:1,snapshot,createdAt:now,status:'review-candidates-not-production',motionContract:contract,sceneContract:stage,media,limitations:['No action bank is accepted for gameplay','Dealer reference in 3D scene is planar','Lighting direction is authored, not measured','Existing source face/edge discontinuities remain']};
await writeFile(path.join(output,'pamela-motion-manifest.json'),JSON.stringify(manifest,null,2));
const oldLatest=JSON.parse(await readFile(path.join(output,'latest.json'),'utf8'));
await writeFile(path.join(output,'latest.json'),JSON.stringify({...oldLatest,snapshot,publishedAt:now,reviewUrl:'/pamela-bank.html',reviewManifest:'/pamela-motion-manifest.json',sceneUrl:'/pamela-scen.html',pilot:{url:'/pamela-platser.html',manifest:'/pamela-pilot-manifest.json'},note:'Current motion catalog and layered scene are studies. Existing V6 proof and raw pilot remain separately identified.'},null,2));
const banner='<aside style="padding:16px;background:#294439;color:#fff"><a style="color:#fff" href="/pamela-bank.html">Rörelsebanken: VILA, REDO och sju platser</a> · <a style="color:#fff" href="/pamela-scen.html">Separat bord, ljus och panorering</a></aside>';
for(const name of ['index.html','studio.html','pamela-prov.html','pamela-platser.html']){const file=path.join(output,name);let html=await readFile(file,'utf8');html=html.includes('<body')?html.replace(/<body([^>]*)>/,`<body$1>${banner}`):html.replace('<main>',banner+'<main>');await writeFile(file,html);}
const rootManifest=JSON.parse(await readFile(path.join(output,'manifest.json'),'utf8'));rootManifest.snapshot=snapshot;rootManifest.latestReview={url:'/pamela-bank.html',manifest:'/pamela-motion-manifest.json',status:'review-candidates-not-production'};await writeFile(path.join(output,'manifest.json'),JSON.stringify(rootManifest,null,2));
async function audit(dir:string){for(const e of await readdir(dir,{withFileTypes:true})){if(e.name.startsWith('.env')||['private','node_modules'].includes(e.name))throw Error('Private entry');if(e.isDirectory())await audit(path.join(dir,e.name));}}
await audit(output);
await writeFile(`${destination}/receipt.json`,JSON.stringify({snapshot,destination,projectId:target.projectId,teamId:target.teamId,baselineDeployment:target.deploymentId,status:'prepared-not-uploaded',media,excluded:['private configuration','raw API request payloads','API/server runtime','source maps']},null,2));
console.log(JSON.stringify({snapshot,destination,mediaCount:media.length,bytes:media.reduce((s,m)=>s+m.bytes,0)}));
