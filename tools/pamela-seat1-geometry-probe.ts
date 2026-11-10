import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import sharp, { type OverlayOptions } from 'sharp';
import { projectDealerPixel, type StageProjection } from '../src/pamela-stage-projection.ts';
import { keyPamelaFrame } from '../runs/20261109-pamela-bank-sequence/take-02/pamela-key.ts';

// A bounded diagnostic, never a bank export. All source files remain read-only.
type Point = [number, number];
type Matrix = number[];
const run = 'runs/20261109-pamela-seat1-geometry-probe';
const trackRun = 'runs/20261109-pamela-neutral-card-track';
const geometryPath = 'runs/20261109-pamela-card-geometry/geometry.json';
const trackingPath = `${trackRun}/tracking.json`;
const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const tag = (n: number) => String(n).padStart(4, '0');
const execute = promisify(execFile);
const sourceFrames = [...Array.from({ length: 18 }, (_, i) => 169 + i), 188];
const W = 1762, H = 1174, N = W * H;
const pinned = {
  geometry: '118b458a3f0e8e0b91545d6f03d8ad5ab26536a352b1af8ee8d53f7afda9bccc',
  tracking: '0e6fcc04d8e1436247aa1960152ef97623a10e13a4ef3ff775c9e343a7215306',
  projection: '8d3fd42f995366f144ff02785e8e4bb7b1404b255434bdd19e1fdc9ac0922df0',
  neutral: '069d4bd699ee4aed44be186c0c894004252f0e38a91ab9e3cb75d08df5e43198',
};
async function checked(path: string, expected: string) {
  const bytes = await readFile(path);
  if (hash(bytes) !== expected) throw Error(`Frozen source changed: ${path}`);
  return bytes;
}
const geometryBytes = await checked(geometryPath, pinned.geometry);
const trackingBytes = await checked(trackingPath, pinned.tracking);
await checked('src/pamela-stage-projection.ts', pinned.projection);
const g = JSON.parse(geometryBytes.toString()), t = JSON.parse(trackingBytes.toString());
const p: StageProjection = g.projection;
const one = g.records.find((r: any) => r.seat === 1), two = g.records.find((r: any) => r.seat === 2);
if (one.sourceSha256 !== t.source.sha256 || t.source.width !== W || t.source.height !== H || g.standard.designWidth !== 63 || g.standard.designLength !== 88) throw Error('Input identity/standard mismatch');
await checked(t.source.path, t.source.sha256);
await checked(two.source, two.sourceSha256);
const neutralPath = `${trackRun}/layers/landed-canonical-neutral.png`;
const neutralBytes = await checked(neutralPath, pinned.neutral);
sharp.concurrency(1);
const texture = await sharp(neutralBytes).ensureAlpha().raw().toBuffer();
for (const dir of ['before', 'after', 'diagnostic', 'masks', 'qa', 'composite/before', 'composite/after', 'composite/masks']) await mkdir(`${run}/${dir}`, { recursive: true });
const sceneJobPath='runs/20261109-pamela-bank-sequence/take-02/job-0.json';
const sceneJobHash='9d6ea21a653551793e09a0e5912b50f32a0f620704850a1916766c5c09cff359';
const keyPath='runs/20261109-pamela-bank-sequence/take-02/pamela-key.ts';
const keyHash='38a682369e2006da29101c7b9f023b36c8a60f4b17257fccbe49044d26965e8d';
const sceneJob=JSON.parse((await checked(sceneJobPath,sceneJobHash)).toString());
await checked(keyPath,keyHash);
if(sceneJob.sourceSha256!==t.source.sha256||sceneJob.prior.length!==0)throw Error('Unexpected seat1 scene context');
for(const a of sceneJob.scene)await checked(a.path,a.sha256);
const room=await sharp(sceneJob.scene[0].path).resize(W,H,{fit:'contain',background:'#24201d'}).removeAlpha().blur(8).modulate({brightness:.58,saturation:.65}).toBuffer();
const stage=await sharp(room).composite([{input:await readFile(sceneJob.scene[1].path)}]).removeAlpha().raw().toBuffer();

function world(point: Point): Point { const q = projectDealerPixel(...point, p); return [q[0], q[2]]; }
function source(point: Point): Point {
  const [cx, cy, cz] = p.camera, dy = cy - p.cameraTarget[1], dz = cz - p.cameraTarget[2], length = Math.hypot(dy, dz);
  const ny = dy / length, nz = dz / length;
  const scale = ((p.tableHeight - cy) * ny + (p.depth - cz) * nz) / ((p.tableHeight - cy) * ny + (point[1] - cz) * nz);
  const sx = cx + scale * (point[0] - cx), sy = cy + scale * (p.tableHeight - cy), height = (sy - p.tableHeight) * length / dz;
  return [(sx / p.width + .5) * W, p.contactSourceY - height * W / p.width];
}
function area(q: Point[]) { return Math.abs(q.reduce((sum, a, i) => { const b = q[(i + 1) % q.length]; return sum + a[0] * b[1] - a[1] * b[0]; }, 0)) / 2; }
function squareToQuad(q: Point[]): Matrix {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1;
  const a = (dx3 * dy2 - dx2 * dy3) / den, b = (dx1 * dy3 - dx3 * dy1) / den;
  return [x1 - x0 + a * x1, x3 - x0 + b * x3, x0, y1 - y0 + a * y1, y3 - y0 + b * y3, y0, a, b, 1];
}
function inverse(m: Matrix): Matrix {
  const [a,b,c,d,e,f,h,i,j] = m;
  const co = [e*j-f*i,c*i-b*j,b*f-c*e,f*h-d*j,a*j-c*h,c*d-a*f,d*i-e*h,b*h-a*i,a*e-b*d];
  const det = a*co[0]+b*co[3]+c*co[6];
  if (Math.abs(det) < 1e-12) throw Error('Degenerate homography');
  return co.map(v => v/det);
}
function apply(m: Matrix, [x,y]: Point): Point { const z=m[6]*x+m[7]*y+m[8]; return [(m[0]*x+m[1]*y+m[2])/z,(m[3]*x+m[4]*y+m[5])/z]; }
function distance(point: Point, q: Point[]) {
  let best = Infinity;
  for (let i=0;i<q.length;i++) {
    const a=q[i],b=q[(i+1)%q.length],dx=b[0]-a[0],dy=b[1]-a[1];
    const v=Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/(dx*dx+dy*dy)));
    best=Math.min(best,Math.hypot(point[0]-a[0]-v*dx,point[1]-a[1]-v*dy));
  }
  const uv=apply(inverse(squareToQuad(q)),point);
  return uv[0]>=0&&uv[0]<=1&&uv[1]>=0&&uv[1]<=1 ? 0 : best;
}
const anchor: Point = [329.5, 898]; // Tracked f169 paper corner adjacent to the lowest index/middle fingertip.
const baselineWorld: Point[] = one.proposedStandard.tablePlaneQuad;
const delta: Point = [world(anchor)[0]-baselineWorld[0][0],world(anchor)[1]-baselineWorld[0][1]];
const candidateWorld = baselineWorld.map(([x,z]) => [x+delta[0],z+delta[1]] as Point);
const candidate = candidateWorld.map(source), candidateInverse = inverse(squareToQuad(candidate));
const sourceTextureQuad: Point[] = t.frames[172].quad;
const textureTransform = squareToQuad(sourceTextureQuad);
const roundtrip = Math.max(...candidate.map(v=>Math.hypot(...source(world(v)).map((n,i)=>n-v[i]) as Point)));
if (roundtrip > 1e-7 || Math.abs(area(candidateWorld)-g.standard.areaSceneUnitsSquared)>1e-9 || Math.hypot(candidate[0][0]-anchor[0],candidate[0][1]-anchor[1])>1e-7) throw Error('Projection/anchor invariant failed');
const patch={left:110,top:880,width:275,height:100};
const crop={left:80,top:760,width:640,height:260};
const green=(r:number,g:number,b:number)=>g>100&&g>1.5*r&&g>1.4*b;
const skin=(r:number,g:number,b:number)=>r>85&&r>g*1.07&&r>b*1.16;
const paper=(r:number,g:number,b:number)=>Math.min(r,b)>70&&Math.abs(r-b)<25&&r-g<16&&g-r<145&&g-b<150;
const records:any[]=[], sourceBindings:any[]=[];
const decoded=await execute('ffmpeg',['-v','error','-nostdin','-threads','4','-i',t.source.path,'-vf','select=between(n\\,169\\,186)+eq(n\\,188)','-fps_mode','passthrough','-pix_fmt','rgb24','-f','rawvideo','-'],{windowsHide:true,encoding:'buffer',maxBuffer:N*3*20});
const exact=Buffer.from(decoded.stdout);
if(exact.length!==sourceFrames.length*N*3)throw Error('Unexpected decoded frame count');
function sampleTexture(x:number,y:number) {
  const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,acc=[0,0,0,0];
  for(let yy=0;yy<2;yy++)for(let xx=0;xx<2;xx++) {
    if(ix+xx<0||ix+xx>=W||iy+yy<0||iy+yy>=H)continue;
    const offset=((iy+yy)*W+ix+xx)*4,weight=(xx?fx:1-fx)*(yy?fy:1-fy),alpha=texture[offset+3]/255;
    acc[3]+=alpha*weight;for(let c=0;c<3;c++)acc[c]+=texture[offset+c]*alpha*weight;
  }
  if(acc[3]>0)for(let c=0;c<3;c++)acc[c]/=acc[3];
  return acc;
}
const newAlpha=Buffer.alloc(N),newRgb=Buffer.alloc(N*3);
for(let y=patch.top;y<patch.top+patch.height;y++)for(let x=patch.left;x<patch.left+patch.width;x++) {
  const uv=apply(candidateInverse,[x+.5,y+.5]); if(uv.some(v=>v<0||v>1))continue;
  const tex=sampleTexture(...apply(textureTransform,uv)),i=y*W+x;newAlpha[i]=Math.round(tex[3]*255);
  for(let c=0;c<3;c++)newRgb[i*3+c]=Math.round(tex[c]);
}
await sharp(newAlpha,{raw:{width:W,height:H,channels:1}}).png().toFile(`${run}/masks/proposed-card.png`);
for(const [index,f]of sourceFrames.entries()) {
  const frame=t.frames[f]; if(frame.sourceFrame!==f)throw Error('Frame index mismatch');
  const inputPath=`${t.source.frameDirectory}/frame-${tag(f)}.png`,inputBytes=await checked(inputPath,frame.sourcePngSha256);
  const raw=await sharp(inputBytes).removeAlpha().raw().toBuffer();
  if(!raw.equals(exact.subarray(index*N*3,(index+1)*N*3)))throw Error(`Original decode differs at ${f}`);
  const maskBytes=await readFile(`${trackRun}/${frame.observedMask}`),guardBytes=await readFile(`${trackRun}/${frame.skinGuard}`);
  const observed=await sharp(maskBytes).greyscale().raw().toBuffer(),guard=await sharp(guardBytes).greyscale().raw().toBuffer();
  if(observed.length!==N||guard.length!==N)throw Error('Mask format mismatch');
  const protectedPixels=Buffer.alloc(N,255),dilatedSkin=Buffer.alloc(N),out=Buffer.from(raw),diagnostic=Buffer.from(raw),unknown=Buffer.alloc(N);
  for(let y=patch.top-4;y<patch.top+patch.height+4;y++)for(let x=patch.left-4;x<patch.left+patch.width+4;x++) {
    const i=y*W+x,j=i*3;
    if(guard[i]||skin(raw[j],raw[j+1],raw[j+2]))for(let yy=-2;yy<=2;yy++)for(let xx=-2;xx<=2;xx++)dilatedSkin[(y+yy)*W+x+xx]=255;
  }
  const donors=(x:number,y:number):number[]|null=>{
    const ys:number[]=[];
    for(const sign of[-1,1])for(let d=1;d<=100;d++){
      const yy=y+sign*d;if(yy<0||yy>=H)break;const k=yy*W+x,j=k*3;
      // Reject pale antialiased paper fringes; broad green classification alone
      // admits those and creates false vertical bands in the reconstructed area.
      if(observed[k]===0&&!dilatedSkin[k]&&raw[j]<15&&raw[j+1]>130&&raw[j+2]<95&&distance([x+.5,yy+.5],frame.quad)>5){ys.push(yy);break;}
    }
    if(ys.length<2)return null;
    const v=(y-ys[0])/(ys[1]-ys[0]);return[0,1,2].map(c=>raw[(ys[0]*W+x)*3+c]*(1-v)+raw[(ys[1]*W+x)*3+c]*v);
  };
  let changed=0,protectedChanged=0,removedPaperPixels=0,unfilledPixels=0,targetBlockedPixels=0;
  for(let y=patch.top;y<patch.top+patch.height;y++)for(let x=patch.left;x<patch.left+patch.width;x++){
    const i=y*W+x,j=i*3;
    // Include the original's chroma-contaminated paper rim, with the same
    // immutable skin guard. This may erase paper/green mixtures, never skin.
    const rim=distance([x+.5,y+.5],frame.quad)<=3&&Math.min(raw[j],raw[j+2])>30&&raw[j]-raw[j+2]<45&&raw[j+2]-raw[j]<50&&raw[j]-raw[j+1]<16;
    const knownPaper=(observed[i]>0&&paper(raw[j],raw[j+1],raw[j+2]))||rim;
    const editable=!dilatedSkin[i]&&(knownPaper||green(raw[j],raw[j+1],raw[j+2]));
    if(!editable){if(newAlpha[i])targetBlockedPixels++;continue;}protectedPixels[i]=0;
    const a=newAlpha[i]/255;
    let base=[raw[j],raw[j+1],raw[j+2]];
    if(knownPaper&&a<1){
      const estimated=donors(x,y);
      if(!estimated){unfilledPixels++;continue;}
      base=estimated;unknown[i]=Math.round(255*(1-a));if(unknown[i])removedPaperPixels++;
    }
    if(knownPaper||a)for(let c=0;c<3;c++)out[j+c]=Math.round(base[c]*(1-a)+newRgb[j+c]*a);
  }
  for(let i=0;i<N;i++){
    const j=i*3,isChanged=raw[j]!==out[j]||raw[j+1]!==out[j+1]||raw[j+2]!==out[j+2];
    if(isChanged){changed++;if(protectedPixels[i])protectedChanged++;}
    for(let c=0;c<3;c++)diagnostic[j+c]=out[j+c];
    if(unknown[i]>0&&!protectedPixels[i]){diagnostic[j]=230;diagnostic[j+1]=35;diagnostic[j+2]=180;}
  }
  if(protectedChanged)throw Error(`Protected source pixels changed at ${f}`);
  const contacts:{kind:string;distancePx:number;skinPoint:Point|null}[]=[];
  for(const [kind,quad]of [['source',frame.quad],['candidate',candidate]] as [string,Point[]][]){
    let best=Infinity,point:Point|null=null;
    for(let y=820;y<930;y++)for(let x=280;x<460;x++){
      const j=(y*W+x)*3;if(!skin(raw[j],raw[j+1],raw[j+2]))continue;
      const d=distance([x+.5,y+.5],quad);if(d<best){best=d;point=[x+.5,y+.5];}
    }contacts.push({kind,distancePx:best,skinPoint:point});
  }
  const files=[{kind:'before',bytes:inputBytes},{kind:'after',bytes:await sharp(out,{raw:{width:W,height:H,channels:3}}).png().toBuffer()},{kind:'diagnostic',bytes:await sharp(diagnostic,{raw:{width:W,height:H,channels:3}}).png().toBuffer()}];
  const artifacts:any[]=[];
  for(const file of files){const path=`${run}/${file.kind}/frame-${tag(f)}.png`;await writeFile(path,file.bytes);artifacts.push({kind:file.kind,path,sha256:hash(file.bytes)});}
  await sharp(unknown,{raw:{width:W,height:H,channels:1}}).png().toFile(`${run}/masks/unknown-background-${tag(f)}.png`);
  const protectedPath=`${run}/masks/protected-${tag(f)}.png`;
  const protectedPng=await sharp(protectedPixels,{raw:{width:W,height:H,channels:1}}).png().toBuffer();
  await writeFile(protectedPath,protectedPng);
  // Independent layer proof: reveal the existing felt instead of synthesizing
  // the green screen hidden behind the old paper. The geometry/hand is unchanged.
  const keyed=keyPamelaFrame(raw,W,H),compBefore=Buffer.alloc(N*3),compAfter=Buffer.alloc(N*3),cleared=Buffer.alloc(N);
  let clearedPixels=0,nonzeroDealerAlphaCleared=0,compositeProtectedChanged=0,compositeChanged=0;
  for(let i=0;i<N;i++)for(let c=0;c<3;c++)compBefore[i*3+c]=Math.round(stage[i*3+c]*(1-keyed.alpha[i])+keyed.rgb[i*3+c]*keyed.alpha[i]);
  compBefore.copy(compAfter);
  for(let y=patch.top;y<patch.top+patch.height;y++)for(let x=patch.left;x<patch.left+patch.width;x++){
    const i=y*W+x,j=i*3;if(protectedPixels[i])continue;
    const erase=distance([x+.5,y+.5],frame.quad)<=3;
    if(erase){cleared[i]=255;clearedPixels++;if(keyed.alpha[i]>0)nonzeroDealerAlphaCleared++;}
    const a=erase?0:keyed.alpha[i],cardA=newAlpha[i]/255;
    if(!erase&&!cardA)continue;
    for(let c=0;c<3;c++){
      const under=stage[j+c]*(1-cardA)+newRgb[j+c]*cardA;
      compAfter[j+c]=Math.round(under*(1-a)+keyed.rgb[j+c]*a);
    }
  }
  for(let i=0;i<N;i++){
    const j=i*3,diff=compBefore[j]!==compAfter[j]||compBefore[j+1]!==compAfter[j+1]||compBefore[j+2]!==compAfter[j+2];
    if(diff){compositeChanged++;if(protectedPixels[i])compositeProtectedChanged++;}
  }
  if(compositeProtectedChanged)throw Error('Layer proof changed protected person/source pixels');
  const compositeArtifacts:any[]=[];
  for(const[kind,rgb]of[['before',compBefore],['after',compAfter]]as const){
    const path=`${run}/composite/${kind}/frame-${tag(f)}.png`,bytes=await sharp(rgb,{raw:{width:W,height:H,channels:3}}).png().toBuffer();
    await writeFile(path,bytes);compositeArtifacts.push({kind,path,sha256:hash(bytes)});
  }
  const clearPath=`${run}/composite/masks/dealer-alpha-cleared-${tag(f)}.png`,clearPng=await sharp(cleared,{raw:{width:W,height:H,channels:1}}).png().toBuffer();
  await writeFile(clearPath,clearPng);
  records.push({sourceFrame:f,sourcePngSha256:hash(inputBytes),observedMaskSha256:hash(maskBytes),skinGuardSha256:hash(guardBytes),sourceRgbExact:true,changedPixels:changed,protectedChangedPixels:protectedChanged,protectedMask:{path:protectedPath,sha256:hash(protectedPng)},removedPaperPixels,unfilledPixels,targetBlockedPixels,contacts,artifacts,composite:{clearedPixels,nonzeroDealerAlphaCleared,changedPixels:compositeChanged,protectedChangedPixels:compositeProtectedChanged,clearMask:{path:clearPath,sha256:hash(clearPng)},artifacts:compositeArtifacts}});
  sourceBindings.push({path:inputPath,sha256:hash(inputBytes)},{path:`${trackRun}/${frame.observedMask}`,sha256:hash(maskBytes)},{path:`${trackRun}/${frame.skinGuard}`,sha256:hash(guardBytes)});
}
const label=(text:string,width:number)=>Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="28"><rect width="100%" height="100%" fill="#17212c"/><text x="8" y="20" fill="white" font-family="Arial" font-size="15">${text}</text></svg>`);
const panels:OverlayOptions[]=[];
for(const [row,f]of[169,170,172,188].entries())for(const [col,kind]of['before','after','diagnostic'].entries()){
  panels.push({input:await sharp(`${run}/${kind}/frame-${tag(f)}.png`).extract(crop).png().toBuffer(),left:col*crop.width,top:row*(crop.height+28)+28});
  panels.push({input:label(`f${f} ${kind.toUpperCase()}${kind==='diagnostic'?' | MAGENTA = UNKNOWN BACKGROUND':''}`,crop.width),left:col*crop.width,top:row*(crop.height+28)});
}
await sharp({create:{width:crop.width*3,height:(crop.height+28)*4,channels:3,background:'#17212c'}}).composite(panels).png().toFile(`${run}/qa/contact-before-after.png`);
const scenePanels:OverlayOptions[]=[];
for(const[row,f]of[169,170,172,188].entries())for(const[col,kind]of['before','after'].entries()){
  scenePanels.push({input:await sharp(`${run}/composite/${kind}/frame-${tag(f)}.png`).extract(crop).png().toBuffer(),left:col*crop.width,top:row*(crop.height+28)+28});
  scenePanels.push({input:label(`f${f} ${kind==='before'?'FROZEN SCENE + ORIGINAL':'OLD PAPER ALPHA 0 + PROPOSED CARD'}`,crop.width),left:col*crop.width,top:row*(crop.height+28)});
}
await sharp({create:{width:crop.width*2,height:(crop.height+28)*4,channels:3,background:'#17212c'}}).composite(scenePanels).png().toFile(`${run}/qa/composite-before-after.png`);
const twoBytes=await checked(two.sourceFramePng.path,two.sourceFramePng.sha256);
const twoRaw=await sharp(twoBytes).removeAlpha().raw().toBuffer();
const twoDecoded=await execute('ffmpeg',['-v','error','-nostdin','-threads','4','-i',two.source,'-vf','select=eq(n\\,350)','-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','-'],{windowsHide:true,encoding:'buffer',maxBuffer:N*3+100_000});
if(!twoRaw.equals(Buffer.from(twoDecoded.stdout)))throw Error('Seat2 frame decode mismatch');
await writeFile(`${run}/before/seat-2-frame-0350.png`,twoBytes);
const comparison:OverlayOptions[]=[];
for(const[col,item]of[{file:`${run}/before/frame-0172.png`,title:'SEAT 1 RAW f172',region:crop},{file:`${run}/after/frame-0172.png`,title:'SEAT 1 PROPOSED 63:88 | CONTACT ANCHORED',region:crop},{file:`${run}/before/seat-2-frame-0350.png`,title:'SEAT 2 RAW f350 | SAME NATIVE PIXEL SCALE',region:{...crop,left:280,top:810}}].entries()){
  comparison.push({input:label(item.title,crop.width),left:col*crop.width,top:0},{input:await sharp(item.file).extract(item.region).png().toBuffer(),left:col*crop.width,top:28});
}
await sharp({create:{width:crop.width*3,height:crop.height+28,channels:3,background:'#17212c'}}).composite(comparison).png().toFile(`${run}/qa/seat-2-comparison.png`);
const evidence={schemaVersion:1,purpose:'Bounded contact-anchored geometry probe; not a full video repair or scale acceptance',productionAccepted:false,physicalScaleAccepted:false,frameBudget:{seat1Frames:sourceFrames,seat2ReferenceFrame:350,totalUniqueSourceFrames:20},sources:{geometry:{path:geometryPath,sha256:pinned.geometry},tracking:{path:trackingPath,sha256:pinned.tracking},projection:{path:'src/pamela-stage-projection.ts',sha256:pinned.projection},neutral:{path:neutralPath,sha256:pinned.neutral},seat1Video:t.source,seat2Video:{path:two.source,sha256:two.sourceSha256},seat2Reference:two.sourceFramePng,framesAndMasks:sourceBindings},projection:p,standard:g.standard,reprojection:{anchorSourceFrame:169,anchorSourcePx:anchor,anchorMeaning:'Tracked paper corner next to the lowest visible index/middle fingertip. A manually selected contact-adjacent landmark, not an automatic physical contact measurement.',anchorUncertaintyPx:3,orientation:'Frozen standard orientation at seat1 original centroid, preserved under table-plane translation.',baselineTableQuad:baselineWorld,translationTablePlane:delta,candidateTableQuad:candidateWorld,candidateSourceQuad:candidate,sourceTextureQuad,unitSquareToTextureSource:textureTransform,sourceToCandidateUnitSquare:candidateInverse,maximumRoundtripErrorPx:roundtrip,candidateAreaSceneUnitsSquared:area(candidateWorld),candidateProjectedAreaPx:area(candidate),sourceAreaSceneUnitsSquared:one.raw.tablePlaneAreaSceneUnitsSquared,seat2RawAreaSceneUnitsSquared:two.raw.tablePlaneAreaSceneUnitsSquared,seat2RawProjectedAreaPx:two.raw.fittedQuadAreaPx,seat2ProposedAreaSceneUnitsSquared:two.proposedStandard.tablePlaneAreaSceneUnitsSquared},editing:{roi:patch,visiblePerson:'Only observed neutral-paper support, its chroma-mixed rim within three pixels of the tracked quad, or chroma-green pixels may change; all other pixels and a two-pixel dilation of source skin guards/local skin classification are protected byte-for-byte. No body transform.',texture:'Released f172 neutral photographic paper reprojected through an exact projective homography; original alpha silhouette retained.',background:'Same-frame nearest clean-green donors (R less than 15, G greater than 130, B less than 95, over five pixels from original quad) above/below each removed source-paper pixel, linearly interpolated. Every removed paper pixel remains UNKNOWN hidden background, shown magenta in separate diagnostic. Hand shadow under removed paper is unknown; estimated fill is not recovered evidence.',distance:'Minimum RGB-classified skin-to-ideal-card-quad distance in the contact ROI. A 2D diagnostic; not calibrated contact/depth.'},records,validation:{exactSourceRgbComparisons:20,allProtectedPixelsUnchanged:records.every(r=>r.protectedChangedPixels===0),inputsRecheckedUnchanged:false},artifacts:{contactSheet:`${run}/qa/contact-before-after.png`,seat2Comparison:`${run}/qa/seat-2-comparison.png`},reproduction:'node tools/pamela-seat1-geometry-probe.ts',toolSha256:hash(await readFile('tools/pamela-seat1-geometry-probe.ts')),runtime:{node:process.version,sharp:sharp.versions}};
(evidence as any).composite={
  purpose:'Separate layer feasibility proof on the existing frozen scene; does not infer the hidden green-screen background.',
  sceneJob:{path:sceneJobPath,sha256:sceneJobHash},sceneAssets:sceneJob.scene,keyModule:{path:keyPath,sha256:keyHash},
  sceneRecipe:'Identical to bank-sequence take-02: room contain 1762x1174, blur8, brightness0.58, saturation0.65; native transparent felt overlaid; no prior cards for seat1.',
  paperRemovalScope:'Dealer alpha set to zero only inside the tracked source-card quad plus a maximum 3-pixel outward rim, intersected with editable neutral paper/chroma-green and outside the dilated skin/person guard.',
  compositingOrder:'Frozen room/felt, separate proposed neutral card, original keyed dealer with old-paper alpha cleared. Protected pixels copied exactly from the before composite.',
  unknownGreenBackgroundNeeded:false,personOrShoeFill:false,bodyTransform:false,
  maximumClearedPixels:Math.max(...records.map(r=>r.composite.clearedPixels)),
  maximumNonzeroAlphaCleared:Math.max(...records.map(r=>r.composite.nonzeroDealerAlphaCleared)),
  protectedChangedPixels:records.reduce((s,r)=>s+r.composite.protectedChangedPixels,0),
  comparison:`${run}/qa/composite-before-after.png`,
  comparisonSha256:hash(await readFile(`${run}/qa/composite-before-after.png`)),
  limitation:'The frozen general matte is inherited without production acceptance. Conservative skin guard can retain a tiny contact-edge remnant; no hidden person pixels are synthesized.',
};
for(const input of [{path:geometryPath,sha256:pinned.geometry},{path:trackingPath,sha256:pinned.tracking},{path:sceneJobPath,sha256:sceneJobHash},{path:keyPath,sha256:keyHash},...sceneJob.scene,...sourceBindings])await checked(input.path,input.sha256);
evidence.validation.inputsRecheckedUnchanged=true;
await writeFile(`${run}/probe.json`,JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({frames:20,output:run,sourceArea:one.raw.tablePlaneAreaSceneUnitsSquared,proposedArea:area(candidateWorld),proposedSourceQuad:candidate,protectedChanged:records.reduce((s,r)=>s+r.protectedChangedPixels,0),contacts:records.filter(r=>[169,170,171,172,188].includes(r.sourceFrame)).map(r=>({frame:r.sourceFrame,distances:r.contacts,unknown:r.removedPaperPixels,unfilled:r.unfilledPixels}))}));
