import {test} from 'node:test';
import assert from 'node:assert/strict';
import {preparePamelaMeshV7,paintPamelaMeshV7,type PaperEdgeFrame} from '../src/pamela-card-mesh-v7.ts';
import type {CardMeshFrame} from '../src/pamela-card-mesh.ts';
const mesh:CardMeshFrame={sourceFrame:54,side:'BACK',sections:[{v:0,left:[3,3],right:[8,3]},{v:1,left:[3,8],right:[8,8]}]};
const square=(x:number,y:number)=>[[x,y],[x+1,y],[x+1,y+1],[x,y+1]] as [number,number][];
test('reviewed skin guard wins even over a paper inclusion',()=>{
 const raw=Buffer.alloc(12*12*3,220),p=5*12+5;raw.set([239,212,195],p*3);
 const e:PaperEdgeFrame={sourceFrame:54,frameSha256:'test',coreInclude:[square(5,5)],blurSupport:[],skinExclude:[square(5,5)]};
 const s=preparePamelaMeshV7(raw,mesh,12,12,Buffer.alloc(144,255),Buffer.alloc(144),[],e);
 const out=Buffer.from(raw);paintPamelaMeshV7(out,Buffer.alloc(210*294*3,12),raw,s,12);
 assert.deepEqual(out.subarray(p*3,p*3+3),raw.subarray(p*3,p*3+3));
 assert.equal(s.opticalAlpha[p],0);
});
test('edge-on source contract suppresses new paper and printing',()=>{
 const raw=Buffer.alloc(432,240),e:PaperEdgeFrame={sourceFrame:60,frameSha256:'test',coreInclude:[],blurSupport:[],skinExclude:[],preserveOriginalEdge:true};
 const s=preparePamelaMeshV7(raw,mesh,12,12,Buffer.alloc(144,255),Buffer.alloc(144),[],e);
 const out=Buffer.from(raw);paintPamelaMeshV7(out,Buffer.alloc(210*294*3,12),raw,s,12);assert.deepEqual(out,raw);
});
test('unmixed paper replacement preserves background outside authored support',()=>{
 const raw=Buffer.alloc(432,30);for(let y=3;y<8;y++)for(let x=3;x<8;x++)raw.fill(240,(y*12+x)*3,(y*12+x)*3+3);
 const s=preparePamelaMeshV7(raw,mesh,12,12,Buffer.alloc(144),Buffer.alloc(144));
 const out=Buffer.from(raw);paintPamelaMeshV7(out,Buffer.alloc(210*294*3,20),raw,s,12);
 assert.deepEqual(out.subarray(0,3),raw.subarray(0,3));assert.ok(out[(5*12+5)*3]<40);
});
