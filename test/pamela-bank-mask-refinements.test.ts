import test from 'node:test';
import assert from 'node:assert/strict';
import {refinePamelaBankPaperMask,PAMELA_BANK_MASK_REFINEMENT_SOURCES} from '../src/pamela-bank-mask-refinements.ts';
const W=1762,N=W*1174,p=(x:number,y:number)=>y*W+x;
function fixture(id:'C1-P7'|'C2-P6',frame:number){return{id,sourceSha256:PAMELA_BANK_MASK_REFINEMENT_SOURCES[id],frame,sourceRgb:new Uint8Array(N*3),coverage:new Uint8Array(N),guard:new Uint8Array(N),...(id==='C2-P6'?{previousCardCoverage:new Uint8Array(N)}:{})};}
function rgb(f:ReturnType<typeof fixture>,x:number,y:number,colour:number[]){f.sourceRgb.set(colour,p(x,y)*3);}
test('rejects wrong source, invalid frame and missing native C2 protection',()=>{
 const f=fixture('C2-P6',117);
 assert.throws(()=>refinePamelaBankPaperMask({...f,sourceSha256:PAMELA_BANK_MASK_REFINEMENT_SOURCES['C1-P7']}),/source\/frame/);
 for(const frame of[-1,360,1.5,NaN])assert.throws(()=>refinePamelaBankPaperMask({...f,frame}),/source\/frame/);
 assert.throws(()=>refinePamelaBankPaperMask({...f,previousCardCoverage:undefined}),/prior-card/);
 assert.throws(()=>refinePamelaBankPaperMask({...f,sourceRgb:new Uint8Array(3)}),/Native/);
});
test('P7 removes only neutral grey free-tip ownership and preserves shadowed grip and warm paper',()=>{
 const f=fixture('C1-P7',86);for(let y=700;y<=810;y++)for(let x=900;x<=910;x++){f.coverage[p(x,y)]=255;rgb(f,x,y,[245,244,241]);}
 rgb(f,905,800,[81,83,80]);rgb(f,905,705,[81,83,80]);rgb(f,906,800,[150,135,120]);rgb(f,907,800,[80,190,100]);
 const before=f.coverage.slice(),a=refinePamelaBankPaperMask(f);assert.equal(a.coverage[p(905,800)],0);assert.equal(a.coverage[p(905,705)],255);assert.equal(a.coverage[p(906,800)],255);assert.equal(a.coverage[p(907,800)],255);assert.equal(a.removedPixels,1);assert.deepEqual(f.coverage,before);
 for(const frame of[77,108])assert.deepEqual(refinePamelaBankPaperMask({...f,frame}).coverage,before);
});
test('P6 grows connected near paper, excludes protected hand/prior pixels and disconnected white islands',()=>{
 const f=fixture('C2-P6',117);for(let y=700;y<=703;y++)for(let x=900;x<=906;x++)rgb(f,x,y,[248,241,239]);
 for(let y=700;y<=703;y++)for(let x=900;x<=902;x++)f.coverage[p(x,y)]=255;
 f.guard[p(904,701)]=255;f.previousCardCoverage![p(905,702)]=255;rgb(f,912,701,[255,255,255]);
 const old=f.coverage.slice(),guard=f.guard.slice(),prior=f.previousCardCoverage!.slice(),a=refinePamelaBankPaperMask(f);
 assert.equal(a.coverage[p(906,700)],255);assert.equal(a.coverage[p(904,701)],0);assert.equal(a.coverage[p(905,702)],0);assert.equal(a.coverage[p(912,701)],0);assert.ok(a.addedPixels>0);assert.equal(a.removedPixels,0);assert.deepEqual(f.coverage,old);assert.deepEqual(f.guard,guard);assert.deepEqual(f.previousCardCoverage,prior);
 for(const frame of[105,129])assert.deepEqual(refinePamelaBankPaperMask({...f,frame}).coverage,old);
});
