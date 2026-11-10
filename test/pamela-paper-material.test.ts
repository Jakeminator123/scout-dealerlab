import test from 'node:test';
import assert from 'node:assert/strict';
import {applyPaperMaterials,type PaperMaterialLayer} from '../src/pamela-paper-material.ts';
const W=12,H=8;
function layer(slotId:string,left:number,rgb:number[]):PaperMaterialLayer{
 const coverage=Buffer.alloc(W*H),guard=Buffer.alloc(W*H);for(let y=2;y<6;y++)for(let x=left;x<left+3;x++)coverage[y*W+x]=255;
 const texture=Buffer.alloc(3*4*4);for(let p=0;p<16;p++)texture.set(rgb,p*3);
 return{slotId,coverage,guard,bounds:{left,top:2,width:3,height:4},uvAt:(x,y)=>[(x-left)/3,(y-2)/4],texture:{rgb:texture,width:4,height:4,sha256:'synthetic-test'}};
}
test('a white material preserves shaded source paper exactly',async()=>{
 const raw=Buffer.alloc(W*H*3);for(let p=0;p<W*H;p++)raw.set([160,154,148],p*3);
 const result=await applyPaperMaterials(raw,W,H,[layer('white',2,[255,255,255])]);assert.deepEqual(result.after,raw);assert.equal(result.outsidePaperChanges,0);
});
test('two materials affect independent papers without changing the hand or backing',async()=>{
 const raw=Buffer.alloc(W*H*3,220),a=layer('first',1,[0,0,0]),b=layer('second',8,[255,0,0]),result=await applyPaperMaterials(raw,W,H,[a,b]);
 const color=(x:number,y:number)=>[...result.after.subarray((y*W+x)*3,(y*W+x)*3+3)];
 assert.deepEqual(color(2,3),[0,0,0]);assert.deepEqual(color(9,3),[220,0,0]);assert.deepEqual(color(6,3),[220,220,220]);
});
test('visible paper cannot overlap a protected finger or another card surface',async()=>{
 const raw=Buffer.alloc(W*H*3,220),a=layer('first',2,[0,0,0]);a.guard[3*W+3]=255;await assert.rejects(applyPaperMaterials(raw,W,H,[a]),/protected foreground/);
 a.guard.fill(0);await assert.rejects(applyPaperMaterials(raw,W,H,[a,layer('second',2,[255,0,0])]),/same source pixel/);
});
