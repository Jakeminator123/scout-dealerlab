import test from 'node:test';
import assert from 'node:assert/strict';
import {cardProjectiveUv,presentedCardMaterial,renderTwoSidedCards,pamelaP4FlipSide,PAMELA_P4_FLIP_SOURCE,type CardPresentation} from '../src/pamela-two-sided-card.ts';
const back={id:'back',width:1,height:1,rgb:new Uint8Array([20,40,80])},front={id:'front',width:1,height:1,rgb:new Uint8Array([255,0,0])};
test('engine front permission gates even the material lookup, including absent identity',()=>{
 let reads=0;const p:CardPresentation={slotId:'engine-slot',physicalSide:'FRONT',engine:{cardId:'engine-id',frontAllowed:false},back,front:id=>{assert.equal(id,'engine-id');reads++;return front;}};
 assert.equal(presentedCardMaterial(p).side,'CONCEALED');assert.equal(reads,0);
 p.engine.frontAllowed=true;p.engine.cardId=null;assert.equal(presentedCardMaterial(p).side,'CONCEALED');assert.equal(reads,0);
 p.engine.cardId='engine-id';assert.equal(presentedCardMaterial(p).texture,front);assert.equal(reads,1);
 p.physicalSide='BACK';assert.equal(presentedCardMaterial(p).texture,back);assert.equal(reads,1);
 p.physicalSide='EDGE';assert.equal(presentedCardMaterial(p).texture,null);assert.equal(reads,1);
});
test('perspective corners and projective diagonal intersection preserve UV',()=>{
 const q:[[number,number],[number,number],[number,number],[number,number]]=[[1,2],[8,1],[6,9],[2,7]],uv=cardProjectiveUv(q);
 for(const[i,p]of q.entries()){const got=uv(...p),want=[[0,0],[1,0],[1,1],[0,1]][i];for(let c=0;c<2;c++)assert.ok(Math.abs(got[c]-want[c])<1e-10);}
 // AC: (1,2)+t(5,7), BD: (8,1)+s(-6,6), giving t=1/2.
 const got=uv(3.5,5.5);assert.ok(Math.abs(got[0]-.5)<1e-10&&Math.abs(got[1]-.5)<1e-10);
});
test('hand wins, source outside support is exact, repeat design does not accumulate ink',()=>{
 const neutral=new Uint8Array(4*4*3).fill(230),coverage=new Uint8Array(16),guard=new Uint8Array(16);coverage[5]=coverage[6]=255;guard[6]=255;
 const p:CardPresentation={slotId:'engine-slot',physicalSide:'BACK',engine:{cardId:'id',frontAllowed:false},back,front:()=>front};
 const layer={presentation:p,coverage,guard,quad:[[0,0],[4,0],[4,4],[0,4]] as [[number,number],[number,number],[number,number],[number,number]],bounds:{left:0,top:0,width:4,height:4}};
 const a=renderTwoSidedCards(neutral,4,4,[layer]);for(let i=0;i<16;i++)if(i!==5)assert.deepEqual(a.rgb.slice(i*3,i*3+3),neutral.slice(i*3,i*3+3));
 p.engine.frontAllowed=true;p.physicalSide='FRONT';renderTwoSidedCards(neutral,4,4,[layer]);p.physicalSide='BACK';const b=renderTwoSidedCards(neutral,4,4,[layer]);assert.deepEqual(a.rgb,b.rgb);assert.ok(neutral.every(v=>v===230));
});
test('turn calibration is restricted to exact source and frame interval',()=>{
 assert.equal(pamelaP4FlipSide(97,PAMELA_P4_FLIP_SOURCE),'BACK');assert.equal(pamelaP4FlipSide(98,PAMELA_P4_FLIP_SOURCE),'EDGE');assert.equal(pamelaP4FlipSide(99,PAMELA_P4_FLIP_SOURCE),'FRONT');
 assert.throws(()=>pamelaP4FlipSide(98,'other-source'));assert.throws(()=>pamelaP4FlipSide(360,PAMELA_P4_FLIP_SOURCE));
});
test('an exactly edge-on collinear surface needs no homography or front lookup',()=>{
 const raw=new Uint8Array(12).fill(220),coverage=new Uint8Array([255,255,0,0]),guard=new Uint8Array(4);
 const result=renderTwoSidedCards(raw,2,2,[{presentation:{slotId:'edge',physicalSide:'EDGE',engine:{cardId:null,frontAllowed:false},back,front:()=>{throw Error('Front must stay inaccessible');}},coverage,guard,bounds:{left:0,top:0,width:2,height:2},quad:[[0,0],[1,0],[2,0],[3,0]]}]);
 assert.equal(result.paper[0],255);assert.ok(result.rgb[0]<220);
});
