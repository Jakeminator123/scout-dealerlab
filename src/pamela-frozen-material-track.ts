/** Read-only adapter for selected, hash-bound presentation candidates.
 * Coverage, hand/shoe guards and UVs are frozen independently of artwork. */
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {applyPaperMaterials} from './pamela-paper-material.ts';
import {edgeSurfaceUv} from './pamela-edge-card-track.ts';

export const MATERIAL_WIDTH=1762,MATERIAL_HEIGHT=1174;
const W=MATERIAL_WIDTH,H=MATERIAL_HEIGHT;
export const materialHash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
export type FrozenRef={path:string;sha256:string};
export type FrozenMaterialSelection={id:string;kind:'edge'|'middle'|'c2';evidence:FrozenRef;review:FrozenRef;canonicalUvQuarterTurns?:0|1|2|3};
export async function checkedMaterialBytes(ref:FrozenRef){const b=await readFile(ref.path);assert.equal(materialHash(b),ref.sha256,`Changed frozen input: ${ref.path}`);return b;}
async function mono(ref:FrozenRef){const {data,info}=await sharp(await checkedMaterialBytes(ref)).greyscale().raw().toBuffer({resolveWithObject:true});assert.equal(info.width,W);assert.equal(info.height,H);assert.equal(info.channels,1);return data;}
async function rgb(bytes:Buffer){const {data,info}=await sharp(bytes).removeAlpha().raw().toBuffer({resolveWithObject:true});assert.equal(info.width,W);assert.equal(info.height,H);assert.equal(info.channels,3);return data;}

export async function openFrozenMaterialTrack(selection:FrozenMaterialSelection,texture?:FrozenRef){
 assert.match(selection.id,/^C[12]-P[1-7]$/);const seat=Number(selection.id.at(-1)),pass=Number(selection.id[1]);
 assert.equal(selection.kind==='c2',pass===2);
 const turns=selection.canonicalUvQuarterTurns??0;assert.ok(Number.isInteger(turns)&&turns>=0&&turns<=3);if(pass===2)assert.equal(turns,0,'Frozen C2 pixels already have canonical artwork');
 const bytes=await checkedMaterialBytes(selection.evidence),e=JSON.parse(bytes.toString());
 // A caller explicitly selects its independently reviewed candidate; a JSON
 // boolean never promotes an unreviewed take on its own.
 const review=JSON.parse((await checkedMaterialBytes(selection.review)).toString());
 if(review.track)assert.deepEqual(review.track,selection.evidence,'Review belongs to another track');
 if(review.evidence)assert.deepEqual(review.evidence,selection.evidence,'Review belongs to another evidence file');
 assert.equal(e.seat??e.source.seat,seat);
 const source=e.source;assert.equal(materialHash(await readFile(source.path)),source.sha256);
 const records=selection.kind==='edge'?e.records:e.frames;assert.equal(records.length,360);
 let material:undefined|{rgb:Buffer;width:number;height:number;sha256:string};
 if(pass===1){assert.ok(texture);const b=await checkedMaterialBytes(texture),{data,info}=await sharp(b).removeAlpha().raw().toBuffer({resolveWithObject:true});material={rgb:data,width:info.width,height:info.height,sha256:texture.sha256};}
 const sourceDirectory=source.frameDirectory??source.framesDirectory;
 async function frame(f:number){
  assert.ok(Number.isInteger(f)&&f>=0&&f<360);const r=records[f];assert.equal(r.sourceFrame??r.frame,f);
  let original:Buffer,printed:Buffer,paper:Buffer;
  if(selection.kind==='c2'){
   original=await rgb(await checkedMaterialBytes(r.source));printed=await rgb(await checkedMaterialBytes(r.output));const mask=await rgb(await checkedMaterialBytes(r.mask));paper=Buffer.alloc(W*H);
   for(let p=0;p<W*H;p++){const j=p*3;if(mask[j]&&mask[j+1])throw Error('Two papers overlap');paper[p]=Math.max(mask[j],mask[j+1]);if(mask[j+2]&&(printed[j]!==original[j]||printed[j+1]!==original[j+1]||printed[j+2]!==original[j+2]))throw Error('Protected hand/shoe changed');}
  }else{
   assert.ok(sourceDirectory,'Frozen C1 source frame directory missing');const file=`${sourceDirectory}/frame-${String(f).padStart(4,'0')}.png`,b=await readFile(file);if(r.sourcePngSha256)assert.equal(materialHash(b),r.sourcePngSha256);original=await rgb(b);if(r.sourceRgbSha256)assert.equal(materialHash(original),r.sourceRgbSha256);
   let coverage:Buffer,guard:Buffer,uvAt:(x:number,y:number)=>[number,number];const bounds=r.record?.bounds??r.bounds;
   if(selection.kind==='edge'){
    coverage=await mono(r.masks.find((m:any)=>m.type==='coverage'));guard=await mono(r.masks.find((m:any)=>m.type==='hand-guards'));uvAt=(x,y)=>edgeSurfaceUv(x,y,r.quad,r.sections);
   }else{
    coverage=await mono(r.masks.coverage);const hand=await mono(r.masks.hand),shoe=await mono(r.masks.shoe);guard=Buffer.alloc(W*H);for(let p=0;p<W*H;p++)guard[p]=Math.max(hand[p],shoe[p]);
    const decompressed=gunzipSync(await checkedMaterialBytes(r.uv));assert.equal(materialHash(decompressed),r.uv.decodedSha256);assert.deepEqual(r.uv.region,bounds);assert.equal(decompressed.length,bounds.width*bounds.height*8);
    uvAt=(x,y)=>{const xx=Math.floor(x)-bounds.left,yy=Math.floor(y)-bounds.top;if(xx<0||yy<0||xx>=bounds.width||yy>=bounds.height)return[-1,-1];const k=(yy*bounds.width+xx)*8;return[decompressed.readFloatLE(k),decompressed.readFloatLE(k+4)];};
   }
   // Blank-paper tracks have no inherent printed top edge. A single, selected
   // quarter-turn aligns the whole motion with the same card in the next take.
   // Coverage, bending, hand occlusion and source pixels remain frozen.
   const rawUvAt=uvAt;
   uvAt=(x,y)=>{const [u,v]=rawUvAt(x,y);return turns===1?[1-v,u]:turns===2?[1-u,1-v]:turns===3?[v,1-u]:[u,v];};
   const result=await applyPaperMaterials(original,W,H,[{slotId:selection.id,coverage,guard,bounds,uvAt,texture:material!}]);printed=result.after;paper=result.paper;
  }
  let outside=0;for(let p=0;p<W*H;p++)if(!paper[p])for(let c=0;c<3;c++)outside+=Number(printed[p*3+c]!==original[p*3+c]);assert.equal(outside,0,'Printed pixels leave frozen paper');
  return{original,printed,paper,verification:{sourceRgbSha256:materialHash(original),printedRgbSha256:materialHash(printed),changedOutsidePaperPixels:outside}};
 }
 return{selection,source,frame};
}
