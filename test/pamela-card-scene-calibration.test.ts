import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateCardSceneAtlas,CARD_SCENE_SOURCES} from '../src/pamela-card-scene-calibration.ts';
import type {CardAtlasManifest} from '../src/pamela-card-atlas.ts';
const fixture:CardAtlasManifest=JSON.parse(await readFile(new URL('../runs/20261109-pamela-card-atlas/take-03/manifest.json',import.meta.url),'utf8'));
test('Frozen P4 atlas remains valid and P2 cannot inherit its turn or shoe/contact calibration',()=>{
 const p4=validateCardSceneAtlas(fixture);assert.equal(p4.shoeGeometry,true);assert.equal(p4.edgeFrame,98);
 const p2=structuredClone(fixture);p2.source.sha256=CARD_SCENE_SOURCES[1].sourceSha256;
 assert.throws(()=>validateCardSceneAtlas(p2),/turn timing/);
 for(const f of p2.frames)f.cards[1].side=f.frame<79?'BACK':f.frame<89?'EDGE':'FRONT';
 const own=validateCardSceneAtlas(p2);assert.equal(own.shoeGeometry,false);assert.equal(own.contactCalibration,false);
 p2.source.sha256='0'.repeat(64);assert.throws(()=>validateCardSceneAtlas(p2),/source\/calibration/);
});
test('Malformed atlas geometry is rejected before reaching a shader or homography',()=>{
 const invalid:Array<(a:CardAtlasManifest)=>void>=[
  a=>{a.frames[0].cards[0].bounds.width=a.frames[0].cards[0].atlas.width=-1;},
  a=>{a.frames[0].cards[0].quad=[] as any;},
  a=>{a.frames[0].cards[0].quad=[[0,0],[1,0],[2,0],[3,0]];},
  a=>{a.frames[0].cards[0].quad=[[100,100],[100,100],[101,101],[100,101]];},
  a=>{a.frames[0].cards[0].quad=[[0,0],[20,20],[0,20],[20,0]];},
  a=>{a.pages[0].width=NaN;},
  a=>{a.frames[0].cards[0].atlas.left=.25;},
 ];
 for(const change of invalid){const a=structuredClone(fixture);change(a);assert.throws(()=>validateCardSceneAtlas(a));}
});

test('P3 and P5 require their observed side timing and never inherit P4 shoe/contact coordinates',()=>{
 for(const [id,edge,front] of [['C2-P3',52,67],['C2-P5',88,94]] as const){
  const source=CARD_SCENE_SOURCES.find(s=>s.id===id)!;
  const candidate=structuredClone(fixture);candidate.source.sha256=source.sourceSha256;
  assert.throws(()=>validateCardSceneAtlas(candidate),/turn timing/);
  for(const frame of candidate.frames)frame.cards[1].side=frame.frame<edge?'BACK':frame.frame<front?'EDGE':'FRONT';
  const result=validateCardSceneAtlas(candidate);assert.equal(result.edgeFrame,edge);assert.equal(result.frontFrame,front);
  assert.equal(result.shoeGeometry,false);assert.equal(result.contactCalibration,false);
  candidate.frames[front-1].cards[1].side='FRONT';assert.throws(()=>validateCardSceneAtlas(candidate),/turn timing/);
 }
});
