/** Prepare a small film release on the verified published baseline, without importing new raw banks. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {copyFile,link,lstat,mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {pamelaGoalFilmPage,type GoalFilmReview} from '../src/pamela-goal-film-review.ts';
import {privateReviewJsonField,privateReviewPath,publicReviewSource} from './review-publication-policy.ts';

const read=async (file:string)=>JSON.parse(await readFile(file,'utf8'));
const hash=(data:Uint8Array|string)=>createHash('sha256').update(data).digest('hex');
const packageJson=await read('package.json');assert.equal(process.version,'v'+packageJson.volta.node);
assert.equal(path.basename(process.cwd()),'snyggare-dealer');
const target=await read('references/public-review.json');
assert.equal(target.projectId,'prj_mQwHzspK3GrrJA04eFOorFxth0d5');assert.equal(target.teamId,'team_Scxorb9qtZHjNae1YEQnFCaT');
const baseline=target.currentExport;
assert.ok(path.resolve(baseline).startsWith(path.resolve('exports')+path.sep));
const prior=await read(baseline+'/receipt.json');
assert.equal(prior.uploaded,true);assert.equal(prior.deploymentId,target.deploymentId);assert.equal(prior.snapshot??prior.id,target.snapshot);
const project=await read(baseline+'/.vercel/project.json');assert.equal(project.projectId,target.projectId);assert.equal(project.orgId,target.teamId);
const oldSite=baseline+'/.vercel/output/static';
const originalManifest=await readFile(oldSite+'/granskning/manifest.json','utf8');
assert.equal(hash(originalManifest),target.contentId,'Published baseline manifest changed locally');
const env=parseEnv(await readFile('.env.local','utf8'));
const secrets=Object.entries(env).flatMap(([key,value])=>/KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|^(?:PW|UN)$/i.test(key)&&value.length>=8?[value]:[]);
function guard(text:string){assert.ok(!privateReviewJsonField(text),'Private operational JSON field');assert.ok(!secrets.some(value=>text.includes(value)),'Private value in publication');assert.ok(!/\bsk-(?:proj-|live-)?[A-Za-z0-9_-]{28,}|\bgh[pousr]_[A-Za-z0-9]{25,}/.test(text),'Credential pattern');}
const now=new Date(),id='review-hub-'+now.toISOString().replace(/\D/g,''),directory='exports/'+id,site=directory+'/.vercel/output/static';
let totalStaticFiles=0;
async function clone(from:string,to:string):Promise<void>{
  await mkdir(to,{recursive:true});
  for(const entry of await readdir(from,{withFileTypes:true})){
    const source=from+'/'+entry.name,destination=to+'/'+entry.name;
    assert.ok(!(await lstat(source)).isSymbolicLink(),'Linked source');
    assert.ok(!privateReviewPath(path.relative(baseline+'/.vercel/output',source).replaceAll('\\','/')),'Private baseline path');
    if(entry.isDirectory())await clone(source,destination);
    else {if(/\.(mp4|webm|png|jpg|jpeg|zip)$/i.test(entry.name))await link(source,destination);else await copyFile(source,destination);if(destination.startsWith(site+'/'))totalStaticFiles++;}
  }
}
await mkdir(directory);await clone(baseline+'/.vercel/output',directory+'/.vercel/output');await copyFile(baseline+'/.vercel/project.json',directory+'/.vercel/project.json');
const reviewPath='references/pamela-goal-film-review.json',review:GoalFilmReview=await read(reviewPath);
assert.equal(review.projectId,'snyggare-dealer');assert.equal(review.dealerId,'pamela-pilot');assert.equal(review.route,'/pamela-film.html');
assert.deepEqual(review.films.map(f=>f.id),['wide','mobile','fourth']);assert.equal(review.productionAccepted,false);
const summary=JSON.parse(originalManifest),entries=new Map<string,any>(summary.files.map((entry:any)=>[entry.source,entry]));
let newReviewBytes=0;
for(const ref of [review.poster,...review.films,{path:reviewPath,sha256:hash(await readFile(reviewPath))}]){
  assert.ok(publicReviewSource(ref.path),'Unsafe source');assert.match(ref.sha256,/^[a-f0-9]{64}$/);
  const info=await lstat(ref.path);assert.ok(info.isFile()&&!info.isSymbolicLink());
  const bytes=await readFile(ref.path);assert.equal(hash(bytes),ref.sha256,'Film asset changed');
  const isJson=ref.path.endsWith('.json'),url=(isJson?'/granskning/kallor/':'/files/')+ref.path.split('/').map(encodeURIComponent).join('/');
  if(isJson)guard(bytes.toString('utf8'));
  const destination=site+decodeURIComponent(url);await mkdir(path.dirname(destination),{recursive:true});
  const existing=await lstat(destination).catch(()=>null);assert.ok(!existing?.isSymbolicLink());
  if(existing)assert.equal(hash(await readFile(destination)),ref.sha256,'Existing public media differs');
  else {if(isJson)await writeFile(destination,bytes,{flag:'wx'});else await link(ref.path,destination);totalStaticFiles++;}
  entries.set(ref.path,{source:ref.path,url,sha256:ref.sha256,bytes:bytes.length,kind:isJson?'underlag':'media'});newReviewBytes+=bytes.length;
}
const urls=new Map<string,string>([...entries].map(([source,entry])=>[source,entry.url]));
const page=pamelaGoalFilmPage(review,urls,id);guard(page);
await writeFile(site+review.route,page,{flag:'wx'});totalStaticFiles++;
const description='Sju spelarpositioner får två kort var. Dealern får tre kort, vänder sitt dolda kort och återgår till vila. Helfilm och mobilversion är 119,93 sekunder. En separat variant med ett fjärde dealerkort är 126,9 sekunder. Blått och gult visar kortsidorna. Mindre färgkanter finns kvar vid vissa skarvar.';
const banner='<section><h2>Ny sammanhängande film</h2><p>'+description+'</p><p><a href="/pamela-film.html"><strong>▶ Se Pamela · hela utdelningen</strong></a></p><p>Övriga försök på denna sida är historiskt underlag.</p></section>';
for(const name of ['index.html','granskning.html']){
  let html=await readFile(site+'/'+name,'utf8');assert.match(html,/<section><h2>Nuläge<\/h2>/);
  html=html.replaceAll(target.snapshot,id).replace(/<section><h2>Nuläge<\/h2>[\s\S]*?<\/section>/,banner).replace('<nav>','<nav><a href="/pamela-film.html">Ny helfilm</a>').replace('Ny fysisk givning</a>','Tidigare P1-prov</a>');guard(html);await writeFile(site+'/'+name,html);
}
const status='# Aktuell helfilm\n\n'+target.publicUrl+review.route+'\nSnapshot: '+id+'\n\n'+description+'\n\nSpelmotoranslutning och utbytbara produktionslager har separata kontroller. Följande äldre underlag bevaras för jämförelse.\n\n';
for(const name of ['nulage.txt','starttext.txt']){const file=site+'/granskning/'+name;await writeFile(file,status+(await readFile(file,'utf8')).replace('## Nuläge','## Tidigare nuläge'));}
Object.assign(summary,{snapshot:id,preparedAt:now.toISOString(),goalFilms:{...review,films:review.films.map(f=>({...f,url:urls.get(f.path)}))},files:[...entries.values()],scope:{...summary.scope,inheritedSnapshot:target.snapshot,releaseKind:'selected-finished-films',newRawBankUploaded:false}});
const manifestText=JSON.stringify(summary,null,2);guard(manifestText);const contentId=hash(manifestText);
await writeFile(site+'/granskning/manifest.json',manifestText);
for(const name of ['latest.json','manifest.json']){const file=site+'/'+name,data=await read(file);Object.assign(data,{snapshot:id,preparedAt:now.toISOString(),contentId,filmUrl:review.route});delete data.publishedAt;await writeFile(file,JSON.stringify(data,null,2));}
const configPath=directory+'/.vercel/output/config.json',config=await read(configPath);
config.routes.unshift({src:'/pamela-film(?:\\.html)?',headers:{'Cache-Control':'no-cache, max-age=0, must-revalidate'},continue:true},{src:'/pamela-film',dest:review.route});
await writeFile(configPath,JSON.stringify(config));
for(const match of page.matchAll(/(?:href|src)="(\/[^"#?]+)[^"]*"/g))assert.ok(await lstat(site+decodeURIComponent(match[1])),'Broken film page link');
assert.ok(totalStaticFiles<15000,'Too many static files for a standard deployment');
const receipt={id,snapshot:id,contentId,directory,staticDirectory:site,projectId:target.projectId,teamId:target.teamId,previous:baseline,baselineDeployment:target.deploymentId,status:'prepared-not-uploaded',uploaded:false,preparedAt:now.toISOString(),files:entries.size,totalStaticFiles,newReviewBytes,checks:{hashes:true,links:true,secrets:true,inheritedManifest:true},releaseKind:'selected-finished-films',productionAccepted:false};
await writeFile(directory+'/receipt.json',JSON.stringify(receipt,null,2));await writeFile('.runtime/public-review-ready.json',JSON.stringify(receipt,null,2));
console.log(JSON.stringify(receipt));
