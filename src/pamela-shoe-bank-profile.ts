import {createPamelaShoeGeometrySvg,type PamelaShoeShape} from './pamela-shoe-geometry.ts';

type Point=readonly[number,number];
type FileRef={readonly path:string;readonly sha256:string};
export type PamelaShoeBankIdentity={project:string;dealerId:string;clipId:string;sourceSha256:string;width:number;height:number;fps:number;frames:number};
export type PamelaShoeBankProfile={
 readonly id:string;readonly identity:PamelaShoeBankIdentity;readonly source:FileRef;readonly track:FileRef;
 readonly paperAtlas:FileRef;readonly paperCalibration:FileRef;
 readonly roi:{readonly left:number;readonly top:number;readonly width:number;readonly height:number};
 readonly removalHull:readonly Point[];readonly sourceContactInsert:readonly Point[];
 readonly paleForegroundHull:readonly Point[];
 readonly skinForegroundHull:readonly Point[];
 readonly rearAuditHull:readonly Point[];
 readonly observations:{readonly extractionReview:readonly[number,number];readonly returnReview:readonly[number,number];readonly emptyShoeFrame:number;readonly note:string};
};

/** Native observations are per SOURCE, never inferred from a dealer's name or
 * another clip's timing. Review windows document evidence; they do NOT gate
 * removal. The two authored bodies share coordinates only because both sources'
 * native surveys independently show the same fixed shoe/contact projection. */
export const PAMELA_SHOE_BANK_PROFILES:readonly PamelaShoeBankProfile[]=[
 {
  id:'pamela-C2-P3-shoe-bank-v1',
  identity:{project:'snyggare-dealer',dealerId:'pamela',clipId:'C2-P3',sourceSha256:'bce1003fedde8573cfd85470367a16e439d40c230e3f526c5a51a105d151794b',width:1762,height:1174,fps:30,frames:360},
  source:{path:'runs/20261109-pamela-seat-bank/c2/bank-v2-stage-2/original/pamela-seat-3-wan3-c2-bank-v2.mp4',sha256:'bce1003fedde8573cfd85470367a16e439d40c230e3f526c5a51a105d151794b'},
  track:{path:'runs/20261109-pamela-c2-motion-track/take-01/seat-3/draft-01/track.json',sha256:'19d20efd01824a8032662caaf575a196247472bbc8dff7451f9aa2895ca73692'},
  paperAtlas:{path:'runs/20261109-pamela-p3-atlas/take-01/manifest.json',sha256:'d6483aa44d78e950199eca20adda2933fe6d09eaf488d34332a4ca73119ce86c'},
  paperCalibration:{path:'runs/20261109-pamela-p3-card-calibration/take-02/evidence.json',sha256:'a701be22b859a8bcf28323169ff9ecd646f3e0ce2c2c0f1584c68162c11d1453'},
  roi:{left:1175,top:620,width:530,height:295},
  removalHull:[[1179,811],[1210,774],[1300,712],[1598,626],[1700,658],[1701,843],[1290,908],[1210,908],[1179,886]],
  sourceContactInsert:[[1291,736],[1363,771],[1291,876],[1221,836]],
  paleForegroundHull:[[1200,650],[1355,650],[1355,780],[1200,780]],
  skinForegroundHull:[[1175,620],[1380,620],[1380,915],[1175,915]],
  rearAuditHull:[[1380,724],[1597,630],[1697,658],[1698,841],[1305,906],[1294,885],[1368,781]],
  observations:{extractionReview:[27,53],returnReview:[178,218],emptyShoeFrame:100,note:'P3 native source: paper rises by32, clears collar by46; return approaches184 and touches collar188..200. Review windows are deliberately wider, not exact contact labels.'},
 },
 {
  id:'pamela-C2-P5-shoe-bank-v1',
  identity:{project:'snyggare-dealer',dealerId:'pamela',clipId:'C2-P5',sourceSha256:'9a73beb62ccaa93325c7f3d0a65feb3c767ad873d1d3678f9ad494e53a8b0a58',width:1762,height:1174,fps:30,frames:360},
  source:{path:'runs/20261109-pamela-seat-bank/c2/bank-v2-stage-2/original/pamela-seat-5-wan3-c2-bank-v2.mp4',sha256:'9a73beb62ccaa93325c7f3d0a65feb3c767ad873d1d3678f9ad494e53a8b0a58'},
  track:{path:'runs/20261109-pamela-c2-motion-track/take-01/seat-5/draft-01/track.json',sha256:'a3d3962c461bd7e651143058410d07394025dd05ec376626056db94b69622220'},
  paperAtlas:{path:'runs/20261109-pamela-p5-atlas/take-01/manifest.json',sha256:'149ffbca7f0310f47a3b46b80f11f7e7f40568e2e5760a8bf1b26ebca6d370f3'},
  paperCalibration:{path:'runs/20261109-pamela-p5-card-calibration/take-03/evidence.json',sha256:'8f0a5481336aea24047a5f5a790e7b5fe957a853ba5970fdebef5a1a2c4be64e'},
  roi:{left:1175,top:620,width:530,height:295},
  removalHull:[[1179,811],[1210,774],[1300,712],[1598,626],[1700,658],[1701,843],[1290,908],[1210,908],[1179,886]],
  sourceContactInsert:[[1291,736],[1363,771],[1291,876],[1221,836]],
  paleForegroundHull:[[1200,650],[1355,650],[1355,780],[1200,780]],
  skinForegroundHull:[[1175,620],[1380,620],[1380,915],[1175,915]],
  rearAuditHull:[[1380,724],[1597,630],[1697,658],[1698,841],[1305,906],[1294,885],[1368,781]],
  observations:{extractionReview:[47,81],returnReview:[218,280],emptyShoeFrame:180,note:'P5 native source: paper rises by52, clears collar around76; returning hand passes left of shoe220..244 and approaches collar248..272. No P3/P4 timing is used.'},
 },
];

export function resolvePamelaShoeBankProfile(identity:PamelaShoeBankIdentity):PamelaShoeBankProfile|undefined{
 return PAMELA_SHOE_BANK_PROFILES.find(p=>Object.entries(p.identity).every(([k,v])=>identity[k as keyof PamelaShoeBankIdentity]===v));
}
export function shoeBankPointInside(points:readonly Point[],x:number,y:number){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}

/** High confidence foreground tests in native ORIGINAL RGB. Warm is evaluated
 * throughout each source's measured foreground corridor, including the low
 * returning fingers. Pale covers nails and unlabelled extraction-paper rims.
 * The source's bright gold trim is retained only inside the contact insert.
 * Semantic BLUE is NOT a hand mask: it also labels parts of the original shoe. */
export function pamelaShoeBankSourceForeground(profile:PamelaShoeBankProfile,r:number,g:number,b:number,x:number,y:number){
 const warm=r>60&&r-g>6&&r-b>16;
 const pale=Math.min(r,b)>110&&Math.abs(r-b)<65&&g>Math.min(r,b)-15;
 return warm&&shoeBankPointInside(profile.skinForegroundHull,x,y)||pale&&shoeBankPointInside(profile.paleForegroundHull,x,y);
}
export function createPamelaShoeBankRemoval(input:{identity:PamelaShoeBankIdentity;sourceFrame:number;sourceRgb:Uint8Array;semanticMaskRgb:Uint8Array;paperCoverage:Uint8Array}){
 const profile=resolvePamelaShoeBankProfile(input.identity);
 if(!profile)throw Error('Unknown shoe bank source identity');
 const {width,height,frames}=profile.identity,{sourceFrame,sourceRgb,semanticMaskRgb,paperCoverage}=input,N=width*height;
 if(!Number.isInteger(sourceFrame)||sourceFrame<0||sourceFrame>=frames)throw Error('Shoe bank frame out of range');
 if(sourceRgb.length!==N*3||semanticMaskRgb.length!==N*3||paperCoverage.length!==N)throw Error('Native RGB24 and full paper coverage required');
 const removeAlpha=new Uint8Array(N),foregroundGuard=new Uint8Array(N),retainedContact=new Uint8Array(N);
 let removedPixels=0,protectedPixels=0,contactPixels=0,semanticPaperOverlap=0,atlasPaperOverlap=0,semanticSkinOverlap=0,oldRearSilhouetteLeaks=0;
 const roi=profile.roi;
 for(let y=roi.top;y<roi.top+roi.height;y++)for(let x=roi.left;x<roi.left+roi.width;x++){
  if(!shoeBankPointInside(profile.removalHull,x+.5,y+.5))continue;
  const p=y*width+x,k=p*3,r=sourceRgb[k],g=sourceRgb[k+1],b=sourceRgb[k+2];
  const contact=shoeBankPointInside(profile.sourceContactInsert,x+.5,y+.5);
  const paper=paperCoverage[p]>0||semanticMaskRgb[k]>0||semanticMaskRgb[k+1]>0;
  const foreground=paper||pamelaShoeBankSourceForeground(profile,r,g,b,x+.5,y+.5);
  if(contact){retainedContact[p]=255;contactPixels++;}
  if(contact||foreground){foregroundGuard[p]=255;protectedPixels++;}else{removeAlpha[p]=255;removedPixels++;}
  if(removeAlpha[p]){
   if(semanticMaskRgb[k]||semanticMaskRgb[k+1])semanticPaperOverlap++;
   if(paperCoverage[p])atlasPaperOverlap++;
   // Independent, stricter skin audit; the blue semantic alone conflates shoe.
   if(semanticMaskRgb[k+2]&&r>70&&r-g>10&&r-b>27)semanticSkinOverlap++;
  }
  if(shoeBankPointInside(profile.rearAuditHull,x+.5,y+.5)&&g-Math.max(r,b)<30&&!removeAlpha[p])oldRearSilhouetteLeaks++;
 }
 return{profile,removeAlpha,foregroundGuard,retainedContact,diagnostics:{removedPixels,protectedPixels,contactPixels,semanticPaperOverlap,atlasPaperOverlap,semanticSkinOverlap,oldRearSilhouetteLeaks}};
}

/** Shapes are authored presentation assets. Identity must already match the
 * profile before rendering. No physical camera recovery or relighting claim. */
export function createPamelaShoeBankGeometrySvg(identity:PamelaShoeBankIdentity,shape:PamelaShoeShape){
 if(!resolvePamelaShoeBankProfile(identity))throw Error('Unknown shoe bank geometry identity');
 return createPamelaShoeGeometrySvg(shape);
}

export const PAMELA_SHOE_BANK_LIMITS=[
 'Only exact C2-P3 and C2-P5 project/dealer/clip/hash/dimensions/fps/frame-count identities are supported; unknown inputs fail closed.',
 'Native image-space 2.5D shapes; camera, hidden body, interior, bevels and illumination are authored.',
 'A 142-by-140-pixel bounding box encloses a small retained source contact collar/lip/interior, including the next unprinted card. The whole shoe is not independent.',
 'Removal consumes original RGB and reviewed source-bound paper coverage before material replacement or color grading.',
 'No time gates. Per-source review windows document native inspection and are never applied to another source.',
 'Source lighting and sleeve/skin anatomy are retained; pixel safety is evidence against erosion, not physical contact ground truth.',
 'These are local offline CPU proofs. Browser GPU playback and integration require a separate check.',
] as const;
