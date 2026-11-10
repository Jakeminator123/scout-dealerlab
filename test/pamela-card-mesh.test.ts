import {test} from 'node:test';
import assert from 'node:assert/strict';
import {paintPamelaMesh,preparePamelaMesh,projectPamelaMesh,type CardMeshFrame} from '../src/pamela-card-mesh.ts';

const mesh:CardMeshFrame={sourceFrame:80,side:'FRONT',sections:[
 {v:0,left:[2.5,1.5],right:[6.5,1.5]},
 {v:.5,left:[.5,4.5],right:[8.5,4.5]},
 {v:1,left:[2.5,7.5],right:[6.5,7.5]},
]};
test('printed coordinates follow a bowed edge beyond its planar corner envelope',()=>{
 const uv=projectPamelaMesh(mesh,10,10);
 assert.equal(uv[(4*10+0)*2],0);
 assert.equal(uv[(4*10+0)*2+1],.5);
 assert.equal(uv[(4*10+4)*2],.5);
 assert.equal(uv[(4*10+4)*2+1],.5);
 assert.equal(uv[(0*10+0)*2],-1);
});
test('lifting paper owns its footprint while skin and unobserved background stay unpainted',()=>{
 const raw=Buffer.alloc(10*10*3,220),moving=Buffer.alloc(100),shoe=Buffer.alloc(100,255);
 const hand=4*10+4,green=5*10+4;
 raw.set([240,150,90],hand*3);raw.set([0,240,0],green*3);
 shoe[green]=0;
 const surface=preparePamelaMesh(raw,mesh,10,10,moving,shoe);
 assert.equal(surface.stationaryMask[hand],0);
 assert.equal(surface.stationaryMask[0],255);
 assert.equal(surface.paintMask[hand],0);
 assert.equal(surface.paintMask[green],0);
 assert.ok(surface.paintMask[4*10+2]>0);
 const out=Buffer.from(raw);paintPamelaMesh(out,Buffer.alloc(210*294*3,20),raw,surface);
 assert.deepEqual(out.subarray(hand*3,hand*3+3),raw.subarray(hand*3,hand*3+3));
 assert.deepEqual(out.subarray(green*3,green*3+3),raw.subarray(green*3,green*3+3));
 assert.ok(out[(4*10+2)*3]<raw[(4*10+2)*3]);
});
test('source-bound nail guard protects pale nail colour that overlaps paper classification',()=>{
 const raw=Buffer.alloc(300,220),p=4*10+4;raw.set([243,218,201],p*3);
 const moving=Buffer.alloc(100,255),shoe=Buffer.alloc(100);
 const surface=preparePamelaMesh(raw,mesh,10,10,moving,shoe,[[[3,3],[6,3],[6,6],[3,6]]]);
 const out=Buffer.from(raw);paintPamelaMesh(out,Buffer.alloc(210*294*3,20),raw,surface);
 assert.deepEqual(out.subarray(p*3,p*3+3),Buffer.from([243,218,201]));
 assert.ok(out[(4*10+2)*3]<raw[(4*10+2)*3]);
});
