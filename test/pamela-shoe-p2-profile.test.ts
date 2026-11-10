import assert from 'node:assert/strict';
import test from 'node:test';
import {PAMELA_SHOE_P2_PROFILE as profile,resolvePamelaShoeP2Profile,createPamelaShoeP2Removal,createPamelaShoeP2GeometrySvg} from '../src/pamela-shoe-p2-profile.ts';

test('P2 rejects every identity field independently and both unknown shapes/sources',()=>{
 assert.equal(resolvePamelaShoeP2Profile({...profile.identity}),profile);
 for(const [key,value]of Object.entries({project:'other',dealerId:'other',clipId:'C2-P3',sourceSha256:'0'.repeat(64),width:1764,height:1175,fps:24,frames:359})){
  const invalid={...profile.identity,[key]:value};assert.equal(resolvePamelaShoeP2Profile(invalid),undefined);
  assert.throws(()=>createPamelaShoeP2GeometrySvg(invalid,'compact-wedge'));
 }
 for(const missing of [null,undefined,{},'C2-P2'])assert.equal(resolvePamelaShoeP2Profile(missing),undefined);
 assert.throws(()=>createPamelaShoeP2GeometrySvg(profile.identity,'other' as any));
});

test('native paper, hand and contact protections win over body removal, without timing gates',()=>{
 const N=1762*1174,sourceRgb=new Uint8Array(N*3).fill(30),semanticMaskRgb=new Uint8Array(N*3),paperCoverage=new Uint8Array(N);
 const at=(x:number,y:number)=>y*1762+x;
 const body=at(1500,800),paper=at(1490,800),semantic=at(1480,800),hand=at(1300,725),pale=at(1310,730),collar=at(1280,820),outside=at(1100,700);
 paperCoverage[paper]=1;semanticMaskRgb[semantic*3+1]=1;
 sourceRgb.set([140,100,80],hand*3);sourceRgb.set([170,170,170],pale*3);
 const input={identity:profile.identity,sourceRgb,semanticMaskRgb,paperCoverage};
 const first=createPamelaShoeP2Removal({...input,sourceFrame:0}),last=createPamelaShoeP2Removal({...input,sourceFrame:359});
 assert.deepEqual(first.removeAlpha,last.removeAlpha);
 assert.equal(first.removeAlpha[body],255);
 for(const p of [paper,semantic,hand,pale,collar,outside])assert.equal(first.removeAlpha[p],0);
 assert.equal(first.retainedContact[collar],255);
 assert.equal(first.diagnostics.semanticPaperOverlap,0);assert.equal(first.diagnostics.atlasPaperOverlap,0);
 for(const sourceFrame of [-1,360,1.5,NaN])assert.throws(()=>createPamelaShoeP2Removal({...input,sourceFrame}));
 assert.throws(()=>createPamelaShoeP2Removal({...input,sourceFrame:0,paperCoverage:new Uint8Array(1)}));
});

test('the two separately rendered body assets differ and preserve native dimensions',()=>{
 const compact=createPamelaShoeP2GeometrySvg(profile.identity,'compact-wedge'),rounded=createPamelaShoeP2GeometrySvg(profile.identity,'rounded-housing');
 assert.notEqual(compact,rounded);
 for(const svg of [compact,rounded])assert.match(svg,/width="1762" height="1174"/);
});
