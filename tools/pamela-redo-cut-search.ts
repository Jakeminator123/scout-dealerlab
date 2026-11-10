/** Bounded search of already-returned REDO holds; scores never approve a seam. */
import{mkdir,readFile,writeFile}from'node:fs/promises';
import{createHash}from'node:crypto';
import sharp from'sharp';
sharp.concurrency(1);
const out='runs/20261109-pamela-redo-cut-search/take-01';await mkdir('runs/20261109-pamela-redo-cut-search',{recursive:true});await mkdir(out);
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const bank=JSON.parse(await readFile('runs/20261109-pamela-bank-sequence/take-02/plan.json','utf8'));
const a=bank.jobs.find((j:{seat:number})=>j.seat===1),b=bank.jobs.find((j:{seat:number})=>j.seat===2);
for(const s of[a,b])if(hash(await readFile(s.source))!==s.sourceSha256)throw Error('Source hash changed');
const rois=[{name:'face',left:750,top:100,width:260,height:400,weight:.65},{name:'restingHand',left:650,top:735,width:210,height:160,weight:.15},{name:'shoeHand',left:1240,top:630,width:150,height:170,weight:.2}];
type Sample={frame:number;path:string;sha256:string;regions:Buffer[]};
async function sample(job:typeof a,frame:number):Promise<Sample>{const path=job.sourceFrames+`/frame-${String(frame).padStart(4,'0')}.png`,bytes=await readFile(path),regions=[];for(const r of rois)regions.push(await sharp(bytes).extract({left:r.left,top:r.top,width:r.width,height:r.height}).resize(32,48,{fit:'fill'}).removeAlpha().raw().toBuffer());return{frame,path,sha256:hash(bytes),regions};}
const av:Sample[]=[],bv:Sample[]=[];for(const f of[285,...Array.from({length:57},(_,i)=>300+i)])av.push(await sample(a,f));for(let f=0;f<=30;f++)bv.push(await sample(b,f));
function score(aa:Sample,bb:Sample){const metrics=aa.regions.map((p,i)=>{const q=bb.regions[i];let sum=0;for(let n=0;n<p.length;n++)sum+=Math.abs(p[n]-q[n]);return{name:rois[i].name,mae:sum/p.length};});return{outgoing:aa.frame,incoming:bb.frame,score:metrics.reduce((s,m,i)=>s+m.mae*rois[i].weight,0),metrics,addedFramesVsTempo:(aa.frame-285)+(30-bb.frame)};}
const baseline=score(av[0],bv[30]),candidates=av.filter(x=>x.frame>=300).flatMap(aa=>bv.map(bb=>score(aa,bb))).sort((x,y)=>x.score-y.score);
const near=candidates.filter(x=>x.addedFramesVsTempo<=60)[0],best=candidates[0],selected=[baseline,near,best];
const tiles=[];for(const [row,pair]of selected.entries()){for(const [column,s]of[av.find(x=>x.frame===pair.outgoing)!,bv.find(x=>x.frame===pair.incoming)!].entries()){const label=`${['CURRENT','MAX +2s','LOWEST PIXEL SCORE'][row]} ${column?'IN':'OUT'} ${s.frame} / MAE ${pair.score.toFixed(2)}`;tiles.push({input:Buffer.from(`<svg width="440" height="30"><rect width="100%" height="100%" fill="#17232a"/><text x="8" y="21" fill="white" font-size="15">${label}</text></svg>`),left:column*440,top:row*440},{input:await sharp(s.path).extract({left:650,top:70,width:440,height:510}).resize(354,410).png().toBuffer(),left:column*440+43,top:row*440+30});}}
await sharp({create:{width:880,height:1320,channels:3,background:'#17232a'}}).composite(tiles).png().toFile(out+'/candidate-faces.png');
const evidence={createdAt:new Date().toISOString(),sources:[a,b].map(s=>({path:s.source,sha256:s.sourceSha256})),rois,baseline,candidates:candidates.slice(0,20),selected,scope:{outgoing:[300,356],incoming:[0,30],basis:'Only final60 seat1 and initial31 seat2 hold frames. No contact, draw or moving return is removed.'},limitations:['Pixel MAE ranks photometric similarity, not anatomy or velocity compatibility.','Best/near candidates need native hands and 30fps playback review.','No source edited, no timing changed, no QA gate approved.'],samples:av.concat(bv).map(({frame,path,sha256})=>({frame,path,sha256})),toolSha256:hash(await readFile('tools/pamela-redo-cut-search.ts'))};await writeFile(out+'/evidence.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify({baseline,near,best}));
