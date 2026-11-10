import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

// A measured layout proposal only. Does not alter, render or submit any film.
const run = 'runs/20261109-pamela-central-composite';
const out = `${run}/review/c2-layout`;
await mkdir(out, { recursive: true });
type Point = [number, number];
const q1: Point[] = [[820,1026],[943,1026],[963,1093],[802,1093]];
const dx = 46;
const q2: Point[] = q1.map(([x,y]) => [x+dx,y]);
const area = (123+161)/2*67;
const overlap = (area-dx*67)/area*100;
const tracks = JSON.parse(await readFile(`${run}/tracking/card-tracks.json`, 'utf8'));
const composition = JSON.parse(await readFile(`${run}/composition.json`, 'utf8'));
if(JSON.stringify(composition.cardRendering.landedQuad)!==JSON.stringify(q1))throw Error('Landing geometry changed; remeasure this proposal');
const measurement = tracks.frames[98].moving;
const contour: Point[] = measurement.contourNative ?? measurement.contoursNative.flat();
const scores = [(p:Point)=>p[0]+p[1],(p:Point)=>-p[0]+p[1],(p:Point)=>-p[0]-p[1],(p:Point)=>p[0]-p[1]];
const quad: Point[] = measurement.quadNative ?? scores.map(score => contour.reduce((a,p) => score(p)<score(a)?p:a));
const mask = await sharp(`${run}/${measurement.maskPath}`).greyscale().raw().toBuffer();
function inside(x:number,y:number,q:Point[]) {
  let hit=false;
  for(let i=0,j=q.length-1;i<q.length;j=i++)if((q[i][1]>y)!==(q[j][1]>y)&&x<(q[j][0]-q[i][0])*(y-q[i][1])/(q[j][1]-q[i][1])+q[i][0])hit=!hit;
  return hit;
}
let visibleMaskPixels=0, visibleMaskPixelsOutsideQuad=0;
for(let y=0;y<1174;y++)for(let x=0;x<1762;x++)if(mask[y*1762+x]>=128){visibleMaskPixels++;if(!inside(x,y,quad))visibleMaskPixelsOutsideQuad++;}
const plan = {
  schemaVersion:1, status:'proposal-not-applied-to-film', updatedAt:new Date().toISOString(),
  source:{path:tracks.source.path,sha256:tracks.source.sha256,width:1762,height:1174,fps:30},
  currentComposition:{path:composition.output.path,sha256:composition.output.sha256,unchanged:true},
  placement:{requestedOverlapPercent:[65,70],overlapAreaPercent:overlap,coordinateSpace:'native source pixels',
    card1LandingQuad:q1,card2ProposedLandingQuad:q2,card2OffsetPixels:[dx,0],
    rule:'Card 1 remains fixed from its release. Card 2 must arrive at the new target with its hand. No post-release translation.',
    bindingStatus:'No source motion or calibrated hand mask is bound to the proposed second landing.',
    readability:'Both upper-left rank areas are exposed geometrically. Final desktop/mobile legibility remains to be tested.'},
  existingFrameEvidence:{outputFrame:348,sourceFrameIndex:98,maskPath:measurement.maskPath,visibleMaskPixels,visibleMaskPixelsOutsideQuad,
    note:'Pixels counted outside the inferred texture support are still part of the observed source-card mask. This diagnoses incomplete texture coverage, not a semantic third card. The texture also has an inset decorative border; two state cards are present at this point.'},
  nextProof:['Remove duplicate paper/texture outlines while preserving the fingers.','Replace rectangular torso cover with a verified torso/sleeve occlusion boundary.','Recover or reconstruct a separate hand/contact shadow for the chosen table.','Calibrate or obtain a second motion reaching card2ProposedLandingQuad; validate grip and release before any bank expansion.'],
  noGeneration:true,noGameLogicChanged:true,
};
await writeFile(`${out}/placement-plan.json`,JSON.stringify(plan,null,2)+'\n');
const points=(q:Point[])=>q.map(([x,y])=>`${(x-790)*2.3},${(y-1000)*2.3}`).join(' ');
const card=(q:Point[],rank:string,suit:string,color:string)=>`<polygon points="${points(q)}" fill="#f9f7ef" stroke="#aaa99f" stroke-width="2"/><text x="${(q[0][0]-790)*2.3+18}" y="${(q[0][1]-1000)*2.3+30}" fill="${color}" font-size="25" font-weight="700">${rank}</text><text x="${(q[0][0]-790)*2.3+19}" y="${(q[0][1]-1000)*2.3+56}" fill="${color}" font-size="24">${suit}</text><text x="${(q[0][0]+q[1][0])/2*2.3-790*2.3}" y="150" fill="${color}" font-size="40" text-anchor="middle">${suit}</text>`;
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1180" height="510" viewBox="0 0 1180 510"><rect width="1180" height="510" rx="18" fill="#101a1e"/><g font-family="Segoe UI,Arial,sans-serif" fill="#eef4f0"><text x="36" y="46" font-size="26" font-weight="600">Kort 2: tydligt överlapp, stilla efter släpp</text><text x="36" y="78" font-size="16" fill="#b6c6c4">Geometriförslag. Filmen och handrörelsen är ännu oförändrade.</text><g transform="translate(36,118)"><rect width="510" height="260" rx="12" fill="#21322d"/><text x="22" y="32" font-size="20">Nu: samma landning</text><g transform="translate(0,35)">${card(q1,'A','♠','#19252a')}${card(q1,'K','♥','#a52d32')}</g><text x="22" y="240" font-size="16" fill="#c6d3cf">Kort 2 täcker kort 1 helt.</text></g><g transform="translate(574,118)"><rect width="570" height="260" rx="12" fill="#21322d"/><text x="22" y="32" font-size="20">Förslag: ${overlap.toFixed(1).replace('.',',')} % överlapp av kortytan</text><g transform="translate(0,35)">${card(q1,'A','♠','#19252a')}${card(q2,'K','♥','#a52d32')}</g><text x="22" y="240" font-size="16" fill="#c6d3cf">Första kortets vänstra valörhörn är fritt.</text></g><text x="36" y="419" font-size="18">Kort 1 ligger kvar. Kort 2 behöver landa 46 källpixlar åt höger.</text><text x="36" y="452" font-size="16" fill="#b6c6c4">Hand, kortspår och släpp måste följa samma nya mål. En mask ändrar bara vad som skymmer vad.</text><text x="36" y="481" font-size="16" fill="#b6c6c4">Ingen efterföljande glidning. Läsbarheten kontrolleras i både desktop och stående mobil.</text></g></svg>`;
const diagram=svg.replaceAll('translate(0,35)','translate(0,0)');
await writeFile(`${out}/overlap-plan.svg`,diagram);
await sharp(Buffer.from(diagram)).png().toFile(`${out}/overlap-plan.png`);
const source='C:/Users/jakem/.codex/attachments/dc6cf20f-bcfe-48ab-96f8-1d7abf9382a0/Inklistrad text.txt';
const raw=await readFile(source);const rawHash=createHash('sha256').update(raw).digest('hex');
await mkdir('gpt-underlag/7',{recursive:true});
const dest='gpt-underlag/7/GPT-granskning-scen-och-kort-original.txt';
try { const existing=await readFile(dest);if(!existing.equals(raw))throw Error('Preserved source differs'); }
catch(error) { if((error as NodeJS.ErrnoException).code==='ENOENT')await copyFile(source,dest);else throw error; }
await writeFile('gpt-underlag/7/index.json',JSON.stringify({schemaVersion:1,raw:{path:dest,sha256:rawHash},reviewedSnapshot:'public-review-20261109011709',currentBasis:'public-review-20261109014037',interpretation:'Historical review of v1. Current user steering and verified code take precedence.'},null,2)+'\n');
console.log(JSON.stringify({overlapAreaPercent:overlap,visibleMaskPixels,visibleMaskPixelsOutsideQuad,plan:`${out}/placement-plan.json`,diagram:`${out}/overlap-plan.png`}));
