import test from 'node:test';
import assert from 'node:assert/strict';
import {keyPamelaFrame} from '../src/pamela-key.ts';
import {keyPamelaFrameWithPaper} from '../src/pamela-key-paper.ts';

test('green-lit opaque paper cannot become a transparent hole in a neutral prop',()=>{
 const W=40,H=40,raw=Buffer.alloc(W*H*3),coverage=Buffer.alloc(W*H);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const p=y*W+x,inside=x>=8&&x<32&&y>=8&&y<32;
  raw.set(inside?[230,245,232]:[0,245,0],p*3);if(inside)coverage[p]=255;
 }
 const before=keyPamelaFrame(raw,W,H),after=keyPamelaFrameWithPaper(raw,W,H,coverage),center=20*W+20;
 assert.equal(before.alpha[center],0,'Fixture must reproduce the original key failure');
 assert.equal(after.alpha[center],1);
 assert.deepEqual([...after.rgb.subarray(center*3,center*3+3)],[230,245,232]);
 for(let p=0;p<W*H;p++)if(!coverage[p]){
  assert.equal(after.alpha[p],before.alpha[p]);
  assert.deepEqual(after.rgb.subarray(p*3,p*3+3),before.rgb.subarray(p*3,p*3+3));
 }
});

test('paper shadow retains source radiance and the independent hand stays unchanged',()=>{
 const W=16,H=16,raw=Buffer.alloc(W*H*3),coverage=Buffer.alloc(W*H);
 for(let p=0;p<W*H;p++){raw.set(p<128?[156,152,149]:[242,151,101],p*3);if(p<128)coverage[p]=255;}
 const before=keyPamelaFrame(raw,W,H),after=keyPamelaFrameWithPaper(raw,W,H,coverage);
 assert.deepEqual(after.rgb,raw);
 for(let p=128;p<W*H;p++)assert.equal(after.alpha[p],before.alpha[p]);
});

test('paper coverage must have the exact native canvas size',()=>{
 assert.throws(()=>keyPamelaFrameWithPaper(Buffer.alloc(12),2,2,Buffer.alloc(3)),/Native semantic/);
});

test('a geometric paper contour cannot turn a green mixed edge opaque',()=>{
 const W=40,H=40,raw=Buffer.alloc(W*H*3),coverage=Buffer.alloc(W*H);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const p=y*W+x,inside=x>=8&&x<32&&y>=8&&y<32;raw.set(inside?[235,239,235]:[0,255,20],p*3);if(inside)coverage[p]=255;}
 const p=20*W+31;raw.set([109,255,141],p*3);
 const before=keyPamelaFrame(raw,W,H),after=keyPamelaFrameWithPaper(raw,W,H,coverage);
 assert.ok(before.alpha[p]>0&&before.alpha[p]<1);
 assert.equal(after.alpha[p],before.alpha[p]);
 assert.ok(after.rgb[p*3+1]<=Math.max(after.rgb[p*3],after.rgb[p*3+2])+2);
 assert.equal(after.alpha[20*W+20],1);
 assert.ok(after.verification.preservedMixedEdgePixels>0);
});

test('edge opacity comes from the unprinted source even under dark ink',()=>{
 const W=24,H=24,raw=Buffer.alloc(W*H*3),coverage=Buffer.alloc(W*H);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const p=y*W+x,inside=x>=5&&x<19&&y>=5&&y<19;raw.set(inside?[235,239,235]:[0,255,20],p*3);if(inside)coverage[p]=255;}
 const p=12*W+18;raw.set([109,255,141],p*3);const printed=Buffer.from(raw);for(let c=0;c<3;c++)printed[p*3+c]=Math.round(raw[p*3+c]*.1);
 const before=keyPamelaFrame(raw,W,H),after=keyPamelaFrameWithPaper(printed,W,H,coverage,raw);
 assert.equal(after.alpha[p],before.alpha[p]);assert.ok(after.alpha[p]<1);
 for(let c=0;c<3;c++)assert.ok(Math.abs(after.rgb[p*3+c]-before.rgb[p*3+c]*.1)<2);
});
