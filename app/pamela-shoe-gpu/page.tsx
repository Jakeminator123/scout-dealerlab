import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import PamelaShoeGpuReviewClient,{type ShoeGpuReviewCase} from '../../src/pamela-shoe-gpu-review-client.tsx';
import {PAMELA_SHOE_BANK_PROFILES} from '../../src/pamela-shoe-bank-profile.ts';
import {PAMELA_SHOE_P2_PROFILE} from '../../src/pamela-shoe-p2-profile.ts';
import {PAMELA_SHOE_BANK_SHADER_PARITY} from '../../src/pamela-shoe-bank-shader.ts';

export const dynamic='force-dynamic';
export const metadata={title:'Pamela · GPU-maskkontroll'};
const hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
async function verifiedJson(ref:{path:string;sha256:string}){
  const bytes=await readFile(ref.path);assert.equal(hash(bytes),ref.sha256,`Changed GPU review input: ${ref.path}`);
  return JSON.parse(bytes.toString());
}

export default async function PamelaShoeGpuPage(){
  const cases:ShoeGpuReviewCase[]=[];
  for(const profile of [...PAMELA_SHOE_BANK_PROFILES,PAMELA_SHOE_P2_PROFILE]){
    const parity=PAMELA_SHOE_BANK_SHADER_PARITY.find(p=>p.profileId===profile.id)!;
    const proof=await verifiedJson(parity.evidence);assert.deepEqual(proof.profile,profile);
    for(const profileCode of proof.code as {path:string;sha256:string}[])
      assert.equal(hash(await readFile(profileCode.path)),profileCode.sha256,'Frozen CPU proof dependency changed: '+profileCode.path);
    const records=await verifiedJson(proof.frameRecords),atlas=await verifiedJson(profile.paperAtlas);
    assert.equal(atlas.source.sha256,profile.source.sha256);assert.equal(atlas.frames.length,360);
    const frames=profile.identity.clipId==='C2-P2'
      ?[0,28,31,35,52,57,61,63,76,180,232,249,253,255,260,284,359]
      :profile.identity.clipId==='C2-P3'
      ?[0,27,32,38,43,46,52,100,184,188,192,200,218,359]
      :[0,47,52,60,68,74,80,120,180,210,218,248,252,260,280,359];
    cases.push({
      identity:{...profile.identity},paperAtlasSha256:profile.paperAtlas.sha256,proofSha256:parity.evidence.sha256,
      pages:atlas.pages.map((p:{path:string;sha256:string;width:number;height:number})=>({...p})),
      frames:frames.map(frame=>{
        const r=records[frame],a=atlas.frames[frame];assert.equal(r.frame,frame);assert.equal(a.frame,frame);assert.equal(r.sourceRgbSha256,a.sourceRgbSha256);
        return{frame,source:r.source,sourceRgbSha256:r.sourceRgbSha256,expectedRemoval:r.removal,paperCoverageSha256:r.paperCoverageSha256,cards:a.cards.map((c:{bounds:unknown;atlas:unknown})=>({bounds:c.bounds,atlas:c.atlas}))};
      }),
    });
  }
  const code=[];
  for(const path of ['src/pamela-shoe-bank-shader.ts','src/pamela-card-atlas.ts','src/pamela-shoe-gpu-review-client.tsx','app/pamela-shoe-gpu/page.tsx'])
    code.push({path,sha256:hash(await readFile(path))});
  return <PamelaShoeGpuReviewClient cases={cases} code={code}/>;
}
