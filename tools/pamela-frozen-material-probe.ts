import {readFile,writeFile,mkdir} from 'node:fs/promises';
import sharp from 'sharp';
import {openFrozenMaterialTrack,materialHash as hash,type FrozenMaterialSelection} from '../src/pamela-frozen-material-track.ts';
const W=1762,H=1174,run='runs/20261109-pamela-frozen-material-probe/take-01';
const ref=async(path:string)=>({path,sha256:hash(await readFile(path))});
const surfaces=JSON.parse(await readFile('runs/20261109-pamela-c2-card-surfaces/take-01/surfaces.json','utf8'));
const specs=[{id:'C1-P1',kind:'edge' as const,track:'runs/20261109-pamela-edge-card-track/take-02/p1/evidence.json',review:'runs/20261109-pamela-edge-card-track/take-04-probe/independent-review/review.json',frames:[0,84,96,97,99,184,194,350]},...[4,7].map(seat=>({id:`C2-P${seat}`,kind:'c2' as const,track:`runs/20261109-pamela-c2-motion-track/take-01/seat-${seat}/draft-0${seat===4?3:2}/track.json`,review:`runs/20261109-pamela-c2-motion-track/take-01/seat-${seat}/draft-0${seat===4?3:2}/review.json`,frames:seat===4?[0,83,180,225,350]:[0,84,180,206,350]}))];
await mkdir('runs/20261109-pamela-frozen-material-probe',{recursive:true});await mkdir(run);const records=[];
for(const spec of specs){
 const selection:FrozenMaterialSelection={id:spec.id,kind:spec.kind,evidence:await ref(spec.track),review:await ref(spec.review)},seat=Number(spec.id.at(-1)),track=await openFrozenMaterialTrack(selection,surfaces.results.find((s:any)=>s.seat===seat).layers[0].material);
 for(const frame of spec.frames){const f=await track.frame(frame),path=`${run}/${spec.id}-${frame}.png`;await sharp(f.printed,{raw:{width:W,height:H,channels:3}}).png().toFile(path);records.push({selection,frame,...f.verification,output:await ref(path)});}
}
await writeFile(run+'/evidence.json',JSON.stringify({records,code:await Promise.all(['tools/pamela-frozen-material-probe.ts','src/pamela-frozen-material-track.ts','src/pamela-paper-material.ts'].map(ref)),productionAccepted:false,newApiJobs:0},null,2));console.log(JSON.stringify({run,frames:records.length}));
