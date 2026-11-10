import {createPamelaShoeGeometrySvg,type PamelaShoeShape} from './pamela-shoe-geometry.ts';
import {shoeBankPointInside,pamelaShoeBankSourceForeground,type PamelaShoeBankIdentity,type PamelaShoeBankProfile} from './pamela-shoe-bank-profile.ts';

/** C2-P2's original was independently surveyed in survey-01 (0..359) and
 * survey-02 (dense extraction/return), under runs/20261110-pamela-shoe-p2.
 * Its fixed body projection agrees with the shared authored bodies. These
 * coordinates are NOT a licence to reuse this profile or timing on another
 * original. Review intervals are observations, never removal time gates. */
export const PAMELA_SHOE_P2_PROFILE:PamelaShoeBankProfile={
 id:'pamela-C2-P2-shoe-bank-v1',
 identity:{project:'snyggare-dealer',dealerId:'pamela',clipId:'C2-P2',sourceSha256:'ba257d6f88f95536521fe3170f5c5517f53bb447ced7de908cea94683795d77c',width:1762,height:1174,fps:30,frames:360},
 source:{path:'runs/20261109-pamela-seat-bank/c2/bank-v2-stage-2/original/pamela-seat-2-wan3-c2-bank-v2.mp4',sha256:'ba257d6f88f95536521fe3170f5c5517f53bb447ced7de908cea94683795d77c'},
 track:{path:'runs/20261109-pamela-c2-motion-track/take-01/seat-2/draft-02/track.json',sha256:'78b42df54c83c0189a70e0924d1ab35e28b54c654c2a7146161d5cb9a91e90e0'},
 paperAtlas:{path:'runs/20261109-pamela-p2-atlas/take-01/manifest.json',sha256:'217b58c2b2ba65d705e4e04b96a258646b7fb2802489259b94f3004fa34e32bc'},
 paperCalibration:{path:'runs/20261109-pamela-p2-card-calibration/take-05/evidence.json',sha256:'94ebd4c1c31015a82dca9c81d371b72172aeabbd867c3da105cd5e8b2dbca183'},
 roi:{left:1175,top:620,width:530,height:295},
 removalHull:[[1179,811],[1210,774],[1300,712],[1598,626],[1700,658],[1701,843],[1290,908],[1210,908],[1179,886]],
 sourceContactInsert:[[1291,736],[1363,771],[1291,876],[1221,836]],
 paleForegroundHull:[[1200,650],[1355,650],[1355,780],[1200,780]],
 skinForegroundHull:[[1175,620],[1380,620],[1380,915],[1175,915]],
 rearAuditHull:[[1380,724],[1597,630],[1697,658],[1698,841],[1305,906],[1294,885],[1368,781]],
 observations:{extractionReview:[28,76],returnReview:[232,284],emptyShoeFrame:180,note:'P2 original: paper visibly rises by32, overlaps collar through56, clears by64. Returning fingers approach244..252 and contact the collar/paper by256..260; settling continues through284. Inclusive inspection windows are deliberately wider, not physical contact ground truth.'},
};

export function resolvePamelaShoeP2Profile(identity:unknown):PamelaShoeBankProfile|undefined{
 if(!identity||typeof identity!=='object')return undefined;
 return Object.entries(PAMELA_SHOE_P2_PROFILE.identity).every(([k,v])=>(identity as Record<string,unknown>)[k]===v)?PAMELA_SHOE_P2_PROFILE:undefined;
}

/** Same source-RGB foreground criteria as the audited P3/P5 algorithm; no
 * threshold relaxation, blue-channel pseudo-hand mask, or borrowed time gates.
 * Exact atlas coverage and raw semantic R/G both protect paper. */
export function createPamelaShoeP2Removal(input:{identity:PamelaShoeBankIdentity;sourceFrame:number;sourceRgb:Uint8Array;semanticMaskRgb:Uint8Array;paperCoverage:Uint8Array}){
 const profile=resolvePamelaShoeP2Profile(input.identity);if(!profile)throw Error('Unknown P2 shoe source identity');
 const {width,height,frames}=profile.identity,{sourceFrame,sourceRgb,semanticMaskRgb,paperCoverage}=input,N=width*height;
 if(!Number.isInteger(sourceFrame)||sourceFrame<0||sourceFrame>=frames)throw Error('P2 shoe frame out of range');
 if(sourceRgb.length!==N*3||semanticMaskRgb.length!==N*3||paperCoverage.length!==N)throw Error('Native RGB24 and full paper coverage required');
 const removeAlpha=new Uint8Array(N),foregroundGuard=new Uint8Array(N),retainedContact=new Uint8Array(N);
 let removedPixels=0,protectedPixels=0,contactPixels=0,semanticPaperOverlap=0,atlasPaperOverlap=0,semanticSkinOverlap=0,oldRearSilhouetteLeaks=0,atlasOnlyOverRemoval=0;
 const roi=profile.roi;
 for(let y=roi.top;y<roi.top+roi.height;y++)for(let x=roi.left;x<roi.left+roi.width;x++){
  if(!shoeBankPointInside(profile.removalHull,x+.5,y+.5))continue;
  const p=y*width+x,k=p*3,r=sourceRgb[k],g=sourceRgb[k+1],b=sourceRgb[k+2];
  const contact=shoeBankPointInside(profile.sourceContactInsert,x+.5,y+.5);
  const semanticPaper=semanticMaskRgb[k]>0||semanticMaskRgb[k+1]>0,paper=paperCoverage[p]>0||semanticPaper;
  const sourceForeground=pamelaShoeBankSourceForeground(profile,r,g,b,x+.5,y+.5),foreground=paper||sourceForeground;
  if(contact){retainedContact[p]=255;contactPixels++;}
  if(contact||foreground){foregroundGuard[p]=255;protectedPixels++;}else{removeAlpha[p]=255;removedPixels++;}
  if(!contact&&!sourceForeground&&!paperCoverage[p]&&semanticPaper)atlasOnlyOverRemoval++;
  if(removeAlpha[p]){
   if(semanticPaper)semanticPaperOverlap++;
   if(paperCoverage[p])atlasPaperOverlap++;
   if(semanticMaskRgb[k+2]&&r>70&&r-g>10&&r-b>27)semanticSkinOverlap++;
  }
  if(shoeBankPointInside(profile.rearAuditHull,x+.5,y+.5)&&g-Math.max(r,b)<30&&!removeAlpha[p])oldRearSilhouetteLeaks++;
 }
 return{profile,removeAlpha,foregroundGuard,retainedContact,diagnostics:{removedPixels,protectedPixels,contactPixels,semanticPaperOverlap,atlasPaperOverlap,semanticSkinOverlap,oldRearSilhouetteLeaks,atlasOnlyOverRemoval,atlasOnlyUnderRemoval:0}};
}

export function createPamelaShoeP2GeometrySvg(identity:PamelaShoeBankIdentity,shape:PamelaShoeShape){
 if(!resolvePamelaShoeP2Profile(identity))throw Error('Unknown P2 shoe geometry identity');
 if(shape!=='compact-wedge'&&shape!=='rounded-housing')throw Error('Unknown P2 shoe shape');
 return createPamelaShoeGeometrySvg(shape);
}

export const PAMELA_SHOE_P2_LIMITS=[
 'Only the exact C2-P2 project/dealer/clip/hash/dimensions/fps/frame-count identity and independently verified paper atlas are supported.',
 'Native image-space 2.5D authored bodies; no recovered camera, hidden surfaces, physical relighting or free orbit.',
 'The source contact collar/lip/interior and next unprinted card remain. This is independent body replacement, not a wholly independent shoe.',
 'Original RGB and source-bound paper coverage must precede artwork or color grading. No time gates are used.',
 'Source skin classifiers and native visual review are evidence against erosion, not anatomical or physical contact ground truth.',
 'CPU all-frame proof does not establish browser GPU rasterization, decoded-video RGB parity or continuous optical acceptance.',
] as const;
