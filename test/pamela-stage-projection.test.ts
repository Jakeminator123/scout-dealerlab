import test from 'node:test';
import assert from 'node:assert/strict';
import {dealerProjectionMesh, projectDealerPixel,sourcePlanePixel} from '../src/pamela-stage-projection.ts';
const p={width:5.9,sourceWidth:1762,sourceHeight:1174,contactSourceY:876,depth:-.75,tableHeight:.017,camera:[0,3.5,8],cameraTarget:[0,1.35,0]};
test('2.5D fold preserves the original camera ray, including near the table hinge',()=>{
  for(const y of [0,875,876,876.01,950,1174])for(const x of [0,100,881,1762]){
    const v=projectDealerPixel(x,y,p), original=sourcePlanePixel(x,y,p);
    const factor=(v[2]-p.camera[2])/(original[2]-p.camera[2]);
    for(let axis=0;axis<3;axis++)assert.ok(Math.abs(v[axis]-(p.camera[axis]+factor*(original[axis]-p.camera[axis])))<1e-10);
    assert.ok(v[1]>=p.tableHeight-1e-10);
  }
});
test('source plane is perpendicular to original viewing direction, preserving image proportions',()=>{
 const a=sourcePlanePixel(0,0,p),b=sourcePlanePixel(0,p.sourceHeight,p),dx=sourcePlanePixel(p.sourceWidth,0,p)[0]-a[0];
 const direction=p.cameraTarget.map((v,i)=>v-p.camera[i]);
 assert.ok(Math.abs(direction.reduce((sum,v,i)=>sum+v*(b[i]-a[i]),0))<1e-10);
 assert.ok(Math.abs(Math.hypot(...b.map((v,i)=>v-a[i]))/dx-p.sourceHeight/p.sourceWidth)<1e-10);
});
test('mesh is finite, indexed within bounds and includes the exact contact hinge',()=>{
  const m=dealerProjectionMesh(p), count=m.positions.length/3;
  assert.ok(m.positions.every(Number.isFinite));assert.equal(m.uvs.length,count*2);
  assert.ok(m.indices.every(i=>Number.isInteger(i)&&i>=0&&i<count));
  assert.ok(m.uvs.some((v,i)=>i%2===1&&v===1-p.contactSourceY/p.sourceHeight));
  assert.throws(()=>dealerProjectionMesh({...p,camera:[0,0,0]}));
});
