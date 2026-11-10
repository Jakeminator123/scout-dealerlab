import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

// Offline measurements only. Every coordinate is in the native decoded source plane.
const root = process.cwd();
const source = path.join(root, 'runs/20261109-pamela-sequence/original/pamela-central-base-wan3.mp4');
const framesDir = path.join(root, 'runs/20261109-pamela-sequence/qa/central-base');
const output = path.join(root, 'runs/20261109-pamela-central-composite/tracking');
const sourceSha256 = '2445bb2ef5122fe558134d582533d277603da72c4b98b6c782be01a5bf06235a';
const WIDTH = 1762, HEIGHT = 1174, FPS = 30, FRAME_COUNT = 180;
const framePath = (n: number) => path.join(framesDir, `frame-${String(n).padStart(3, '0')}.png`);
const reviewedFrames=[1,36,40,44,48,52,56,60,64,68,72,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,100,113,114,115,116,117,118,119,120,125,150,180];
type Point = [number, number];
type Rect = { left: number; top: number; width: number; height: number };
const anchors: [number, number, number][] = [
  [37,1300,771],[40,1300,756],[44,1272,739],[48,1250,685],[52,1170,641],
  [56,1005,674],[60,952,688],[64,928,719],[68,916,756],[72,903,787],
  [76,907,781],[80,856,810],[85,830,881],[90,850,961],[95,865,1024],
  [100,873,1054],[115,882,1060],[180,882,1060],
];
const shoePolygon: Point[] = [[1297,756],[1340,779],[1284,857],[1240,830]];
const clamp = (v: number, min: number, max: number) => Math.max(min,Math.min(max,v));
function expected(n: number): Point {
  const end = anchors.findIndex(a=>a[0]>=n);
  if(end<=0) return [anchors[0][1],anchors[0][2]];
  const a=anchors[end-1],b=anchors[end],t=(n-a[0])/(b[0]-a[0]);
  return [a[1]+t*(b[1]-a[1]),a[2]+t*(b[2]-a[2])];
}
function inside(x: number,y: number,p: Point[]) {
  let value=false;
  for(let i=0,j=p.length-1;i<p.length;j=i++) if((p[i][1]>y)!==(p[j][1]>y) && x<(p[j][0]-p[i][0])*(y-p[i][1])/(p[j][1]-p[i][1])+p[i][0]) value=!value;
  return value;
}
function whiteness(r: number,g: number,b: number) {
  // Gray/ivory and reflected green card faces qualify; saturated green and warm skin do not.
  return Math.min(clamp((Math.min(r,b)-95)/45,0,1),clamp((53-(r-b))/28,0,1),clamp((36-(r-g))/21,0,1),clamp((83-(g-r))/32,0,1),clamp((91-(g-b))/32,0,1));
}
function connected(data: Buffer, roi: Rect, expectedPoint: Point, rejectShoe: boolean) {
  const {left,top,width,height}=roi;
  const weights=new Uint8Array(width*height), seen=new Uint8Array(width*height);
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    if(rejectShoe && inside(left+x,top+y,shoePolygon)) continue;
    const p=((top+y)*WIDTH+left+x)*3;
    weights[y*width+x]=Math.round(255*whiteness(data[p],data[p+1],data[p+2]));
  }
  const candidates: {indices:number[],score:number,box:Rect,cx:number,cy:number}[]=[];
  for(let i=0;i<weights.length;i++) {
    if(weights[i]<30 || seen[i]) continue;
    const queue=[i];seen[i]=1;let minX=width,minY=height,maxX=0,maxY=0,sx=0,sy=0;
    for(let q=0;q<queue.length;q++) {
      const p=queue[q],x=p%width,y=Math.floor(p/width); minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);sx+=x;sy+=y;
      for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) {
        const nx=x+dx,ny=y+dy,j=ny*width+nx;
        if(nx<0||nx>=width||ny<0||ny>=height||seen[j]||weights[j]<30) continue;
        seen[j]=1;queue.push(j);
      }
    }
    if(queue.length<18) continue;
    const cx=left+sx/queue.length,cy=top+sy/queue.length,distance=Math.hypot(cx-expectedPoint[0],cy-expectedPoint[1]);
    const score=Math.log(queue.length)*20-distance;
    candidates.push({indices:queue,score,box:{left:left+minX,top:top+minY,width:maxX-minX+1,height:maxY-minY+1},cx,cy});
  }
  candidates.sort((a,b)=>b.score-a.score);
  const selected=candidates[0];
  const mask=Buffer.alloc(WIDTH*HEIGHT),binary=new Uint8Array(width*height);
  if(selected) for(const index of selected.indices) { const x=index%width,y=Math.floor(index/width);mask[(top+y)*WIDTH+left+x]=weights[index];binary[index]=1; }
  return {mask,binary,selected,weights,candidates:candidates.length};
}
function simplify(points:Point[],epsilon:number):Point[] {
  if(points.length<=2) return points;
  const a=points[0],b=points[points.length-1],dx=b[0]-a[0],dy=b[1]-a[1];
  let best=0,index=0;
  for(let i=1;i<points.length-1;i++) {
    const t=clamp(((points[i][0]-a[0])*dx+(points[i][1]-a[1])*dy)/(dx*dx+dy*dy||1),0,1);
    const d=Math.hypot(points[i][0]-a[0]-t*dx,points[i][1]-a[1]-t*dy);
    if(d>best){best=d;index=i;}
  }
  return best<=epsilon?[a,b]:[...simplify(points.slice(0,index+1),epsilon).slice(0,-1),...simplify(points.slice(index),epsilon)];
}
function contours(binary:Uint8Array,roi:Rect):Point[][] {
  const {width:w,height:h,left,top}=roi;
  const edges=new Map<string,Point[]>();
  const add=(a:Point,b:Point)=>{const k=a.join(',');edges.set(k,[...(edges.get(k)||[]),b]);};
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) if(binary[y*w+x]) {
    if(y===0||!binary[(y-1)*w+x]) add([x,y],[x+1,y]);
    if(x===w-1||!binary[y*w+x+1]) add([x+1,y],[x+1,y+1]);
    if(y===h-1||!binary[(y+1)*w+x]) add([x+1,y+1],[x,y+1]);
    if(x===0||!binary[y*w+x-1]) add([x,y+1],[x,y]);
  }
  const loops:Point[][]=[];
  while(edges.size) {
    const first=edges.keys().next().value as string;let p=first.split(',').map(Number) as Point;const loop:Point[]=[p];
    for(let step=0;step<w*h*4;step++) {
      const k=p.join(','),next=edges.get(k);if(!next?.length)break;
      p=next.pop()!;if(!next.length)edges.delete(k);loop.push(p);if(p.join(',')===first)break;
    }
    if(loop.length>10) loops.push(simplify(loop,1.1).map(([x,y])=>[x+left,y+top]));
  }
  return loops.sort((a,b)=>polygonArea(b)-polygonArea(a));
}
function polygonArea(p:Point[]) {let a=0;for(let i=0;i<p.length;i++){const q=p[(i+1)%p.length];a+=p[i][0]*q[1]-q[0]*p[i][1];}return Math.abs(a/2);}
function quadFromObserved(mask:Buffer,box:Rect|null):Point[]|null {
  if(!box)return null;
  // Four diagonal support points are observed pixels, not extrapolated hidden corners.
  const points:Point[]=[[0,0],[0,0],[0,0],[0,0]],scores=[Infinity,-Infinity,-Infinity,Infinity];
  for(let y=box.top;y<box.top+box.height;y++)for(let x=box.left;x<box.left+box.width;x++)if(mask[y*WIDTH+x]>220){
    if(x+y<scores[0]){scores[0]=x+y;points[0]=[x,y];}
    if(x-y>scores[1]){scores[1]=x-y;points[1]=[x,y];}
    if(x+y>scores[2]){scores[2]=x+y;points[2]=[x,y];}
    if(x-y<scores[3]){scores[3]=x-y;points[3]=[x,y];}
  }
  return points;
}

async function finalizeManifest() {
  const manifest=JSON.parse(await fs.readFile(path.join(output,'card-tracks.json'),'utf8'));
  let testedMasks=0,dimensionsPass=0,disjointPass=0;
  for(const record of manifest.frames) {
    const masks:Buffer[]=[];
    for(const kind of ['moving','shoe']) {
      const maskFile=path.join(output,kind+'-mask',`frame-${String(record.fileFrame).padStart(3,'0')}.png`);
      const bytes=await fs.readFile(maskFile);
      record[kind].maskSha256=crypto.createHash('sha256').update(bytes).digest('hex');
      const {data,info}=await sharp(bytes).greyscale().raw().toBuffer({resolveWithObject:true});
      if(info.width!==WIDTH||info.height!==HEIGHT||info.channels!==1)throw new Error(`Invalid mask plane ${maskFile}`);
      testedMasks++;dimensionsPass++;masks.push(data);
      if(kind==='shoe') {
        let minX=WIDTH,minY=HEIGHT,maxX=-1,maxY=-1,area=0,alphaArea=0;
        for(let i=0;i<data.length;i++) {
          alphaArea+=data[i]/255;if(data[i]<128)continue;
          area++;const x=i%WIDTH,y=Math.floor(i/WIDTH);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
        }
        record.shoe.areaPx=area;record.shoe.alphaAreaPx=Math.round(alphaArea);
        record.shoe.bbox=area?{left:minX,top:minY,width:maxX-minX+1,height:maxY-minY+1}:null;
        record.shoe.visibilityStatus=record.fileFrame>=37&&record.fileFrame<=48?'overlap-with-moving-card-not-fully-separable':'independent-aperture-observation';
      }
    }
    let overlap=0;for(let i=0;i<masks[0].length;i++)if(masks[0][i]&&masks[1][i])overlap++;
    if(overlap===0)disjointPass++;else throw new Error(`Shoe and moving masks overlap at frame ${record.fileFrame}: ${overlap}`);
  }
  const landed=manifest.frames.filter((r:any)=>r.fileFrame>=125);
  const median=(values:number[])=>{values.sort((a,b)=>a-b);return values[Math.floor(values.length/2)];};
  const stableQuad:Point[]=Array.from({length:4},(_,corner)=>[median(landed.map((r:any)=>r.moving.quadNative[corner][0])),median(landed.map((r:any)=>r.moving.quadNative[corner][1]))]);
  const stableBox=Object.fromEntries(['left','top','width','height'].map(key=>[key,median(landed.map((r:any)=>r.moving.bbox[key]))]));
  const bboxRange=Object.fromEntries(['left','top','width','height'].map(key=>[key,{min:Math.min(...landed.map((r:any)=>r.moving.bbox[key])),max:Math.max(...landed.map((r:any)=>r.moving.bbox[key]))}]));
  manifest.stableLanding={fileFrames:[125,180],frameIndices:[124,179],quadNative:stableQuad,quadMeaning:'Median of four observed diagonal support pixels across 56 unoccluded frames; not hidden-corner reconstruction.',bbox:stableBox,bboxRange,bboxMeaning:'Observed alpha-support bounds; warm outer paper border can extend beyond these bounds.'};
  manifest.qa={measuredAt:new Date().toISOString(),nativeMaskPlaneChecks:{passed:dimensionsPass,total:testedMasks},shoeMovingDisjointChecks:{passed:disjointPass,total:FRAME_COUNT},visuallyReviewedOverlayFileFrames:reviewedFrames,reviewFinding:'No obvious skin or fingernail fill in reviewed overlays. Conservative partial coverage at shoe overlap and green-reflected underside. Warm border and fingershadow intentionally retained from source.',coverageMeaning:'180 masks measured per object; 44 native overlay frames visually reviewed. This is not a segmentation precision benchmark or acceptance of the final compositor.'};
  const json=JSON.stringify(manifest,null,2)+'\n';
  await fs.writeFile(path.join(output,'card-tracks.json'),json);
  await fs.writeFile(path.join(output,'tracking-qa.json'),JSON.stringify({schemaVersion:1,source:manifest.source,manifestSha256:crypto.createHash('sha256').update(json).digest('hex'),...manifest.qa,stableLanding:manifest.stableLanding,limitations:['No reliable airborne planar quad: native bending and hidden corners remain.', 'FileFrames 37–48: moving mask excludes the entire fixed shoe aperture, retaining a known conservative gap.', 'FileFrames 55–74: near-edge-on card needs original surface or subtle artwork.', 'FileFrames 77–79: reflected green underside has lower alpha; never expand to an opaque estimated rectangle.', 'No amodal hand mask or 3D grip reconstruction.']},null,2)+'\n');
  console.log(JSON.stringify({finalized:true,masks:testedMasks,disjointFrames:disjointPass,reviewedNativeOverlays:reviewedFrames.length,stableQuadNative:stableQuad}));
}

async function contact(name: string, numbers: number[], crop: Rect, columns: number, scale = 1, sourceDir = framesDir) {
  const w = Math.round(crop.width * scale), h = Math.round(crop.height * scale);
  const tiles = await Promise.all(numbers.map(async (n) => {
    const picture = await sharp(path.join(sourceDir,`frame-${String(n).padStart(3,'0')}.png`)).extract(crop).resize(w, h).png().toBuffer();
    const label = Buffer.from(`<svg width="${w}" height="26"><rect width="100%" height="100%" fill="#111"/><text x="8" y="19" fill="white" font-size="17" font-family="sans-serif">file ${String(n).padStart(3,'0')} | zero ${n-1} | ${((n-1)/FPS).toFixed(3)} s</text></svg>`);
    return sharp({ create: { width: w, height: h + 26, channels: 3, background: '#111' } }).composite([{input: picture, left: 0, top: 26}, {input: label, left: 0, top: 0}]).png().toBuffer();
  }));
  await sharp({create:{width:w*columns,height:(h+26)*Math.ceil(numbers.length/columns),channels:3,background:'#111'}})
    .composite(tiles.map((input,i)=>({input,left:(i%columns)*w,top:Math.floor(i/columns)*(h+26)}))).png().toFile(path.join(output,name));
}

await fs.mkdir(output, { recursive: true });
const actualHash = crypto.createHash('sha256').update(await fs.readFile(source)).digest('hex');
if(actualHash !== sourceSha256) throw new Error('Source hash mismatch');
if(process.argv.includes('--contact')) {
  await contact('draw-transfer-native.png',[32,36,40,44,48,52,56,60,64,68,72,76],{left:700,top:570,width:680,height:320},3,1);
  await contact('bend-native-077-094.png',Array.from({length:18},(_,i)=>77+i),{left:640,top:740,width:340,height:310},6,1);
  await contact('release-native-113-130.png',Array.from({length:18},(_,i)=>113+i),{left:700,top:880,width:290,height:240},6,1);
  console.log(JSON.stringify({output,sourceSha256,node:process.version,mode:'contact'}));
}
if(process.argv.includes('--qa')) {
  await contact('mask-overlay-draw-transfer.png',[36,40,44,48,52,56,60,64,68,72,76,77],{left:700,top:570,width:680,height:320},3,1,path.join(output,'overlay'));
  await contact('mask-overlay-bend-077-094.png',Array.from({length:18},(_,i)=>77+i),{left:640,top:740,width:340,height:310},6,1,path.join(output,'overlay'));
  await contact('mask-overlay-release.png',[100,113,114,115,116,117,118,119,120,125,150,180],{left:700,top:880,width:290,height:240},6,1,path.join(output,'overlay'));
  console.log('QA contact sheets created');
}
if(process.argv.includes('--finalize')) await finalizeManifest();
if(!process.argv.includes('--contact')&&!process.argv.includes('--qa')&&!process.argv.includes('--finalize')) {
  await Promise.all(['moving-mask','shoe-mask','overlay'].map(d=>fs.mkdir(path.join(output,d),{recursive:true})));
  const results:any[]=[];
  for(let n=1;n<=FRAME_COUNT;n++) {
    const input=await fs.readFile(framePath(n));
    const {data,info}=await sharp(input).removeAlpha().raw().toBuffer({resolveWithObject:true});
    if(info.width!==WIDTH||info.height!==HEIGHT||info.channels!==3)throw new Error(`Frame ${n} geometry changed`);
    const p=expected(n);
    const roi:Rect={left:Math.round(clamp(p[0]-135,0,WIDTH-270)),top:Math.round(clamp(p[1]-95,0,HEIGHT-190)),width:270,height:190};
    const moving=n<37?null:connected(data,roi,p,n<49);
    const movingMask=moving?.mask||Buffer.alloc(WIDTH*HEIGHT);
    const shoeRoi={left:1225,top:745,width:130,height:125};
    const shoe=connected(data,shoeRoi,[1285,810],false);
    // Shoe measurements are intentionally clipped to its own aperture, never unioned with the dealt card.
    for(let y=shoeRoi.top;y<shoeRoi.top+shoeRoi.height;y++)for(let x=shoeRoi.left;x<shoeRoi.left+shoeRoi.width;x++)if(!inside(x,y,shoePolygon))shoe.mask[y*WIDTH+x]=0;
    const name=`frame-${String(n).padStart(3,'0')}.png`;
    await Promise.all([
      sharp(movingMask,{raw:{width:WIDTH,height:HEIGHT,channels:1}}).png().toFile(path.join(output,'moving-mask',name)),
      sharp(shoe.mask,{raw:{width:WIDTH,height:HEIGHT,channels:1}}).png().toFile(path.join(output,'shoe-mask',name)),
    ]);
    const loops=moving?contours(moving.binary,roi):[];
    const box=moving?.selected?.box||null;
    let areaPx=0,alphaAreaPx=0;for(const v of movingMask){if(v>=128)areaPx++;alphaAreaPx+=v/255;}
    const geometryStatus=n<37?'not-separately-observable':n<49?'partially-overlaps-shoe':n<74?'edge-on-or-turning':n<96?'nonplanar-or-grip-occluded':n<119?'landed-hand-occluded':'landed-unoccluded';
    const uncertainties:string[]=[];
    if(n<37)uncertainties.push('No distinct moving card surface; shoe card is a separate observation.');
    if(n>=37&&n<49)uncertainties.push('Shared white overlap with shoe aperture excluded; mask is conservative partial visibility.');
    if(n>=55&&n<=74)uncertainties.push('Near-edge-on card; face area and corners not observable reliably.');
    if(n>=76&&n<=95)uncertainties.push('Visible curvature/soft deformation; do not interpret contour as a rigid planar quadrilateral.');
    if(n>=37&&n<119)uncertainties.push('Grip/hand occlusion: no amodal hidden corner inference.');
    if(n>=37&&!moving?.selected)uncertainties.push('No white component found; preserve source, no fabricated geometry.');
    const quad=n>=119?quadFromObserved(movingMask,box):null;
    const record={frameIndex:n-1,fileFrame:n,timeSeconds:Number(((n-1)/FPS).toFixed(6)),frameSha256:crypto.createHash('sha256').update(input).digest('hex'),
      moving:{maskPath:`tracking/moving-mask/${name}`,bbox:box,areaPx,alphaAreaPx:Math.round(alphaAreaPx),centroidNative:moving?.selected?[Number(moving.selected.cx.toFixed(2)),Number(moving.selected.cy.toFixed(2))]:null,contourNative:loops[0]||[],contoursNative:loops,quadNative:quad,quadMethod:quad?'observed diagonal support pixels TL TR BR BL':null,geometryStatus,uncertainties,searchRoi:roi},
      shoe:{maskPath:`tracking/shoe-mask/${name}`,aperturePolygonNative:shoePolygon,identity:'stationary shoe-outlet card; distinct from dealt card',measurement:'observed white pixels clipped to fixed visible aperture; overlap can be ambiguous'}};
    results.push(record);
    if(reviewedFrames.includes(n)) {
      const overlay=Buffer.alloc(WIDTH*HEIGHT*4);
      for(let i=0;i<movingMask.length;i++){overlay[i*4]=255;overlay[i*4+2]=255;overlay[i*4+3]=Math.round(movingMask[i]*0.5);}
      await sharp(input).composite([{input:overlay,raw:{width:WIDTH,height:HEIGHT,channels:4}}]).png().toFile(path.join(output,'overlay',name));
    }
    if(n%30===0)console.log(`measured ${n}/${FRAME_COUNT}`);
  }
  const manifest={schemaVersion:1,source:{path:path.relative(root,source).replaceAll('\\','/'),sha256:sourceSha256,width:WIDTH,height:HEIGHT,fps:FPS,frameCount:FRAME_COUNT,frameIndexBase:0,fileFrameBase:1,coordinateOrigin:'native top-left; x right; y down'},
    method:{name:'conservative color-connected visible-surface segmentation',node:process.version,handOcclusion:'Skin excluded by color; no amodal hand matte. All source skin must remain above any added card artwork.',smoothing:'None across time. Native frame silhouette and natural bend retained.',quadPolicy:'Only unoccluded landed frames get observed support-point quads. All hidden or bent corners null.',manualRoiAnchors:anchors,skinBoundaryCaveat:'Color classification cannot prove semantic skin labels; inspect supplied overlays. Preserve original pixels where mask is zero.'},
    events:{drawStarts:{fileFrames:[37,40],timeSeconds:[1.2,1.3],certainty:'visual interval'},fullySeparatedFromShoe:{fileFrame:49,timeSeconds:1.6,certainty:'visual interval end; verify 47–49'},transferToRightHand:{fileFrames:[60,76],timeSeconds:[1.966667,2.5],certainty:'both-hands contact interval, no invented exact ownership switch'},bendObserved:{fileFrames:[77,95],timeSeconds:[2.533333,3.133333],certainty:'visually inspected all consecutive frames 77–94'},lastClearFingerContact:{fileFrame:115,timeSeconds:3.8},firstClearGap:{fileFrame:118,timeSeconds:3.9},releaseIntervalSeconds:[3.8,3.9]},
    frames:results};
  await fs.writeFile(path.join(output,'card-tracks.json'),JSON.stringify(manifest,null,2)+'\n');
  console.log(JSON.stringify({output,frames:results.length,sourceSha256,missingMoving:results.filter(r=>r.fileFrame>=37&&!r.moving.bbox).map(r=>r.fileFrame)}));
  await finalizeManifest();
}
