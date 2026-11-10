/** Hash-check final native compositing witnesses and prepare visual contact sheets. No optical verdict is inferred. */
import{readFile,writeFile,mkdir}from'node:fs/promises';
import{createHash}from'node:crypto';
import assert from'node:assert/strict';
import sharp from'sharp';
type Ref={path:string;sha256:string};
const root='runs/20261110-pamela-two-sided-bank/take-02',out=root+'/native-review',hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex'),ref=async(path:string)=>({path,sha256:hash(await readFile(path))}),checked=async(r:Ref)=>{const b=await readFile(r.path);assert.equal(hash(b),r.sha256);return b;};
const planRef=await ref(root+'/plan.json'),plan=JSON.parse((await checked(planRef)).toString()),preflightRef=await ref(root+'/preflight/evidence.json'),p=JSON.parse((await checked(preflightRef)).toString());assert.equal(planRef.sha256,p.plan.sha256);assert.equal(plan.selections.length,14);sharp.concurrency(1);await mkdir(out);
const parts=new Map<string,any>(),partRefs=[];for(const selection of plan.selections){const r=await ref(root+'/'+selection.id+'.json'),part=JSON.parse((await checked(r)).toString());assert.equal(part.id,selection.id);assert.deepEqual(part.selection,selection);assert.equal(part.records.length,360);parts.set(part.id,part);partRefs.push({id:part.id,...r});}
const crops:any[]=[];
for(const image of p.images.filter((x:any)=>x.design==='sg-classic')){
 const record=parts.get(image.id).records.find((r:any)=>r.frame===image.frame);if(!record?.proof)continue;
 const bytes=await checked(record.proof),rgb=await sharp(bytes).removeAlpha().raw().toBuffer();assert.equal(hash(rgb),record.outputRgbSha256);await checked(image);
 const file=`${out}/${image.id}-${String(image.frame).padStart(3,'0')}.png`;await sharp(bytes).extract(image.roi).png().toFile(file);crops.push({id:image.id,frame:image.frame,source:record.proof,roi:image.roi,...await ref(file)});
}
async function sheet(name:string,items:any[],columns:number){assert.ok(items.length);const rows=Math.ceil(items.length/columns),layers=[];for(const[i,item]of items.entries()){const left=(i%columns)*280,top=Math.floor(i/columns)*306;layers.push({input:Buffer.from(`<svg width="280" height="26"><rect width="280" height="26" fill="#142019"/><text x="8" y="18" font-family="Arial" font-size="14" fill="white">${item.id} · källruta ${item.frame}</text></svg>`),left,top},{input:await checked(item),left,top:top+26});}const file=out+'/'+name+'.png';await sharp({create:{width:columns*280,height:rows*306,channels:3,background:'#142019'}}).composite(layers).png().toFile(file);return ref(file);}
const sheets=[await sheet('all-fourteen-landings',crops.filter(c=>c.frame===350).sort((a,b)=>a.id.localeCompare(b.id)),7)];
for(const seat of[1,2,3,4,5])sheets.push(await sheet(`turn-p${seat}`,crops.filter(c=>c.id===`C2-P${seat}`&&c.frame!==350),4));
await writeFile(out+'/evidence.json',JSON.stringify({status:'native-witness-hashes-checked-optical-review-required',sourcePlan:planRef,parts:partRefs,preflight:preflightRef,checkedFrames:crops.length,crops,sheets,code:await ref('tools/pamela-two-sided-native-sheets.ts'),productionAccepted:false},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({checkedFrames:crops.length,sheets}));
