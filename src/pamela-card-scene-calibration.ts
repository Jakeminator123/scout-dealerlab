import {cardUvMatrix,type CardAtlasManifest} from './pamela-card-atlas.ts';
export const CARD_SCENE_SOURCES=[
 {id:'C2-P4',seat:4,cardOrdinal:2,sourceSha256:'67319ed86cde67cc7a7566553d451a89f8aac11384a55f8f8b460d1403d30167',edgeFrame:98,frontFrame:99,shoeGeometry:true,contactCalibration:true},
 {id:'C2-P2',seat:2,cardOrdinal:2,sourceSha256:'ba257d6f88f95536521fe3170f5c5517f53bb447ced7de908cea94683795d77c',edgeFrame:79,frontFrame:89,shoeGeometry:false,contactCalibration:false},
 {id:'C2-P3',seat:3,cardOrdinal:2,sourceSha256:'bce1003fedde8573cfd85470367a16e439d40c230e3f526c5a51a105d151794b',edgeFrame:52,frontFrame:67,shoeGeometry:false,contactCalibration:false},
 {id:'C2-P5',seat:5,cardOrdinal:2,sourceSha256:'9a73beb62ccaa93325c7f3d0a65feb3c767ad873d1d3678f9ad494e53a8b0a58',edgeFrame:88,frontFrame:94,shoeGeometry:false,contactCalibration:false},
] as const;
/** Membership does not imply visual acceptance. Source-specific masks remain
 * required, and P4 shoe/contact coordinates may never be borrowed by P2. */
export function validateCardSceneAtlas(atlas:CardAtlasManifest){
 const source=CARD_SCENE_SOURCES.find(s=>s.sourceSha256===atlas.source.sha256);
 if(!source||atlas.schemaVersion!==1||atlas.width!==1762||atlas.height!==1174||atlas.fps!==30||atlas.frames.length!==360)throw Error('Card scene source/calibration mismatch');
 const positive=(n:number)=>Number.isSafeInteger(n)&&n>0,nonnegative=(n:number)=>Number.isSafeInteger(n)&&n>=0;
 if(!atlas.pages.length||atlas.pages.some(p=>!positive(p.width)||!positive(p.height)||p.width>8192||p.height>8192))throw Error('Invalid mask page dimensions');
 let stage=0;
 for(let f=0;f<360;f++){
  const rec=atlas.frames[f];if(rec.frame!==f||rec.cards.length!==2||rec.cards[0].side!=='FRONT')throw Error('Card frame order/slot mismatch');
  const next=['BACK','EDGE','FRONT'].indexOf(rec.cards[1].side);if(next<0||next<stage||next>stage+1)throw Error('Uncalibrated card-side sequence');stage=next;
  if(rec.cards[1].side!==(f<source.edgeFrame?'BACK':f<source.frontFrame?'EDGE':'FRONT'))throw Error('Source-specific turn timing mismatch');
  for(const card of rec.cards){const b=card.bounds,a=card.atlas,p=atlas.pages[a.page];if(!nonnegative(a.page)||!p||![b.width,b.height,a.width,a.height].every(positive)||![b.left,b.top,a.left,a.top].every(nonnegative)||b.width!==a.width||b.height!==a.height||b.left+b.width>atlas.width||b.top+b.height>atlas.height||a.left+a.width>p.width||a.top+a.height>p.height||card.quad.length!==4||!card.quad.every(q=>q.length===2&&q.every(Number.isFinite)))throw Error('Card atlas projection/bounds mismatch');if(card.side!=='EDGE'){
   const cross=card.quad.map((a,i)=>{const b=card.quad[(i+1)%4],c=card.quad[(i+2)%4];return(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);});
   if(!cross.every(c=>Math.abs(c)>1e-8&&Math.sign(c)===Math.sign(cross[0])))throw Error('Card surface must be a nondegenerate ordered convex quadrilateral');
   cardUvMatrix(card.quad);
  }}
 }
 const edge=atlas.frames.findIndex(f=>f.cards[1].side==='EDGE'),front=atlas.frames.findIndex(f=>f.cards[1].side==='FRONT');
 if(edge<1||front<=edge||stage!==2)throw Error('Observed turn passage is required');
 return{...source,edgeFrame:edge,frontFrame:front,landmarks:[Math.max(0,edge-18),edge-1,edge,front,180,359]};
}
