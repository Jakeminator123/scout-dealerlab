import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import contract from '../references/pamela-stage-contract.json' with {type:'json'};
import {CARD_SCENE_SOURCES,validateCardSceneAtlas} from './pamela-card-scene-calibration.ts';
import type {CardAtlasManifest} from './pamela-card-atlas.ts';
import type {PamelaShoeShape} from './pamela-shoe-geometry.ts';
import {resolvePamelaShoeBankShaderBinding} from './pamela-shoe-bank-shader.ts';
import type {PamelaShoeBankIdentity} from './pamela-shoe-bank-profile.ts';
type Ref={path:string;sha256:string};
export const cardSceneSha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
async function checked(ref:Ref){assert.match(ref.path,/^runs\/202611(?:09|10)-pamela-[a-z0-9-]+\//);const b=await readFile(ref.path);assert.equal(cardSceneSha(b),ref.sha256,'Frozen scene file changed: '+ref.path);return b;}
export async function readPamelaCardSceneBank(){
 const registry=JSON.parse(await readFile('references/pamela-card-scenes.json','utf8'));
 assert.equal(registry.schemaVersion,1);assert.ok(registry.scenes.length>=1&&registry.scenes.length<=CARD_SCENE_SOURCES.length);
 assert.equal(new Set(registry.scenes.map((s:{id:string})=>s.id)).size,registry.scenes.length,'Duplicate scene source');
 const scenes=[];
 for(const row of registry.scenes){
  const evidence=JSON.parse((await checked(row.evidence)).toString()),atlas:CardAtlasManifest=JSON.parse((await checked(evidence.manifest)).toString()),calibration=validateCardSceneAtlas(atlas);
  assert.equal(row.id,calibration.id);assert.equal(evidence.source.sha256,atlas.source.sha256);
  assert.equal(evidence.verification.nativeFrames,360);assert.equal(evidence.verification.guardedPixelsWritten,0);assert.equal(evidence.verification.overlapPixels,0);
  const refs:Ref[]=[atlas.source,...atlas.pages,...evidence.assets];
  for(const file of refs)await checked(file);
  const bound=new Set(refs.map(f=>f.path));for(const p of [...Object.values(atlas.artwork.back),...Object.values(atlas.artwork.front).flatMap(v=>Object.values(v))])assert.ok(bound.has(p),'Artwork missing hash binding');
  let shoeAssets:Record<PamelaShoeShape,string>|undefined;
  let shoeBankBinding:{identity:PamelaShoeBankIdentity;paperAtlasSha256:string}|undefined;
  if(row.shoe){
   assert.equal(calibration.shoeGeometry,true,'No shoe calibration for this source');
   const shoe=JSON.parse((await checked(row.shoe)).toString());assert.equal(shoe.source.sha256,atlas.source.sha256);
   assert.equal(shoe.checks.frames,360);assert.equal(shoe.checks.maxPaperOverlap,0);assert.equal(shoe.checks.maxSkinOverlap,0);
   shoeAssets={} as Record<PamelaShoeShape,string>;
   for(const id of ['compact-wedge','rounded-housing'] as const){const asset=shoe.assets.find((f:Ref)=>f.path.endsWith('/'+id+'.png'));assert.ok(asset);await checked(asset);shoeAssets[id]=asset.path;}
  }
  if(row.shoeBank){
   assert.ok(!row.shoe,'One shoe removal calibration per source');
   const shoe=JSON.parse((await checked(row.shoeBank)).toString()),identity=shoe.profile.identity;
   assert.equal(identity.project,'snyggare-dealer');assert.equal(identity.dealerId,'pamela');assert.equal(identity.clipId,row.id);assert.equal(identity.sourceSha256,atlas.source.sha256);
   assert.deepEqual(shoe.profile.paperAtlas,evidence.manifest);assert.equal(shoe.checks.frames,360);
   for(const key of ['maxSemanticPaperOverlap','maxAtlasPaperOverlap','maxSemanticSkinOverlap','maxSourceSkinRemoved','maxOpaqueSkinChanged','maxOpaquePaperChanged','maxOldRearSilhouetteLeaks'])assert.equal(shoe.checks[key],0,'Unverified shoe boundary: '+key);
   for(const code of shoe.code as Ref[])assert.equal(cardSceneSha(await readFile(code.path)),code.sha256,'Shoe proof code changed');
   shoeBankBinding={identity,paperAtlasSha256:evidence.manifest.sha256};const binding=resolvePamelaShoeBankShaderBinding(shoeBankBinding);assert.ok(binding.enabled,'Unverified shoe shader binding');assert.deepEqual(binding.parity.evidence,row.shoeBank);
   shoeAssets={} as Record<PamelaShoeShape,string>;for(const id of ['compact-wedge','rounded-housing'] as const){const asset=shoe.assets.find((f:Ref)=>f.path.endsWith('/'+id+'.png'));assert.ok(asset);await checked(asset);shoeAssets[id]=asset.path;}
  }
  assert.equal(typeof row.presentation.first.frontAllowed,'boolean');assert.equal(typeof row.presentation.second.frontAllowed,'boolean');
  scenes.push({id:row.id,label:`Plats ${calibration.seat} · andra kortet`,contract,atlas,presentation:row.presentation,shoeAssets,shoeBankBinding,comparisonHref:row.comparisonHref});
 }
 return scenes;
}
