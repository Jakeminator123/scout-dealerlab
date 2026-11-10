import test from 'node:test';
import assert from 'node:assert/strict';
import {cardUvMatrix,resolveArtwork} from '../src/pamela-card-atlas.ts';
import {cardProjectiveUv,type CardQuad} from '../src/pamela-two-sided-card.ts';
test('GPU matrix matches projective map at perspective corners and interior',()=>{
 const q:CardQuad=[[920,700],[1047,683],[1080,931],[876,928]],cpu=cardProjectiveUv(q),m=cardUvMatrix(q);
 for(const [x,y]of [...q,[987,800],[950,900]]){const z=m[2]*x+m[5]*y+m[8],actual=[(m[0]*x+m[3]*y+m[6])/z,(m[1]*x+m[4]*y+m[7])/z],expected=cpu(x,y);for(let i=0;i<2;i++)assert.ok(Math.abs(actual[i]-expected[i])<1e-10);}
});
test('Denied, absent identity and edge never request a front artwork',()=>{
 const lookup=()=>{throw Error('Forbidden front lookup');};
 assert.equal(resolveArtwork('FRONT',{cardId:'AS',frontAllowed:false},'back',lookup),'back');
 assert.equal(resolveArtwork('FRONT',{cardId:null,frontAllowed:true},'back',lookup),'back');
 assert.equal(resolveArtwork('BACK',{cardId:'AS',frontAllowed:true},'back',lookup),'back');
 assert.equal(resolveArtwork('EDGE',{cardId:'AS',frontAllowed:true},'back',lookup),null);
 assert.equal(resolveArtwork('FRONT',{cardId:'10D',frontAllowed:true},'back',id=>'front:'+id),'front:10D');
});
