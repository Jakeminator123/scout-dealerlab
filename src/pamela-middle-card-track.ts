/** Source-bound local studies for the frozen first-card clips, seats 2..6. */
import {projectNeutralMesh as projectSourceMesh} from './pamela-neutral-card-track.ts';
export type Point = [number, number];
export type Quad = [Point, Point, Point, Point];
export type MiddleSeat = 2 | 3 | 4 | 5 | 6;
export const WIDTH = 1762, HEIGHT = 1174;
const directory = 'runs/20261109-pamela-seat-bank/batches/middle-end-card-v1';
const hashes = {
  2: 'dc9e35760fd708a6b7c004e3bc255e9c5e8207aa6ddd5bc274c0e3c62dd3f001',
  3: '312f8d9b612cf58cf7cf21a26c77b169bb930d00e3348ffe9fa1cdf0dc574eb9',
  4: '4e252be2235ce42cec5de9d49b993d0ffed1c029de9890faea6686f46824f87c',
  5: 'edd74e2620327c41080d0f1610e2865d0ddfc44bd2b9e7bf56f114a408e26acf',
  6: 'dee43b673dbd3014efdcdccd4b5dbea9a4256a1bc33bf760b554d1fbcfe633bb',
} as const;
export const MIDDLE_SOURCES = ([2,3,4,5,6] as MiddleSeat[]).map(seat => ({seat,
  path: `${directory}/original/pamela-seat-${seat}-wan3-end-card-v1.mp4`, sha256: hashes[seat],
  frameDirectory: `${directory}/qa/seat-${seat}/frames`, width: WIDTH, height: HEIGHT, fps: 30, frames: 360,
}));
// Coarse authored search gates only. They do not establish material-point UVs.
const centers: Record<MiddleSeat, [number, number, number][]> = {
  2: [[0,1288,808],[60,1289,809],[75,1287,807],[80,1281,801],[85,1273,792],[90,1219,767],[95,1154,761],[100,1072,763],[105,976,770],[110,884,788],[115,807,799],[120,734,811],[125,668,834],[130,612,855],[135,561,878],[140,519,895],[150,453,959],[160,450,978],[175,448,983],[190,447,984],[205,457,974],[220,457,974],[240,457,974],[350,456,974],[359,456,974]],
  3: [[0,1288,808],[60,1289,808],[75,1282,800],[80,1267,791],[85,1191,758],[90,1107,742],[95,1006,753],[100,913,783],[105,840,817],[110,783,852],[115,735,896],[120,697,933],[125,671,970],[130,668,996],[135,667,1007],[140,667,1016],[150,662,1027],[160,663,1027],[175,669,1022],[190,669,1022],[205,669,1022],[220,669,1022],[240,669,1022],[350,669,1022],[359,669,1022]],
  4: [[0,1288,808],[60,1226,714],[75,1056,748],[80,1004,782],[85,958,819],[90,920,857],[95,893,895],[100,880,930],[105,873,972],[110,872,998],[115,869,1015],[120,868,1023],[125,869,1031],[130,868,1036],[135,868,1042],[140,867,1043],[150,867,1047],[160,871,1047],[175,879,1051],[190,879,1051],[205,880,1050],[220,880,1044],[240,880,1045],[350,880,1045],[359,880,1045]],
  5: [[0,1288,808],[60,1288,808],[75,1287,812],[80,1285,815],[85,1285,815],[90,1285,813],[95,1284,809],[100,1284,796],[105,1281,763],[110,1238,672],[115,1188,682],[120,1135,749],[125,1102,831],[130,1094,903],[135,1093,953],[140,1094,984],[150,1087,1009],[160,1086,1021],[175,1091,1029],[190,1090,1022],[205,1087,1026],[220,1087,1028],[240,1091,1022],[350,1091,1022],[359,1091,1022]],
  6: [[0,1288,808],[60,1289,808],[75,1289,807],[80,1291,803],[85,1294,794],[90,1297,781],[95,1295,766],[100,1280,699],[105,1260,681],[110,1241,733],[115,1262,812],[120,1274,859],[125,1282,921],[130,1291,950],[135,1295,959],[140,1294,969],[150,1298,980],[160,1297,985],[175,1308,994],[190,1310,996],[205,1310,983],[220,1305,974],[240,1304,974],[350,1304,975],[359,1304,975]]
};
export function expectedCenter(seat: MiddleSeat, frame: number): Point {
  if (!Number.isInteger(frame) || frame < 0 || frame > 359) throw Error('Expected zero-based source frame 0..359');
  const keys=centers[seat], hi=keys.findIndex(k=>k[0]>=frame), b=keys[hi],a=keys[Math.max(0,hi-1)],t=b[0]===a[0]?0:(frame-a[0])/(b[0]-a[0]);
  return [a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
}
export const warmSkin = (r:number,g:number,b:number) => r>90 && r-g>12 && r-b>20;
export const paperSupport = (r:number,g:number,b:number) => Math.min(r,b)>70 && r-b<22 && b-r<24 && r-g<16 && g-r<145 && g-b<150;
export const paperCore = (r:number,g:number,b:number) => Math.min(r,g,b)>190 && Math.max(r,g,b)-Math.min(r,g,b)<22;
export type Component = {pixels:number[];corePixels:number;center:Point;bounds:{left:number;top:number;width:number;height:number};hull:Point[]};
const cross=(o:Point,a:Point,b:Point)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
export function convexHull(points:Point[]):Point[]{
  const p=points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);if(p.length<=2)return p;
  const lo:Point[]=[],hi:Point[]=[];for(const a of p){while(lo.length>=2&&cross(lo.at(-2)!,lo.at(-1)!,a)<=0)lo.pop();lo.push(a);}for(const a of p.toReversed()){while(hi.length>=2&&cross(hi.at(-2)!,hi.at(-1)!,a)<=0)hi.pop();hi.push(a);}return [...lo.slice(0,-1),...hi.slice(0,-1)];
}
export function paperComponents(raw:Buffer,center:Point,radius=185):Component[]{
  if(raw.length!==WIDTH*HEIGHT*3)throw Error('Expected native RGB24');
  const left=Math.max(0,Math.floor(center[0]-radius)),right=Math.min(WIDTH-1,Math.ceil(center[0]+radius)),top=Math.max(540,Math.floor(center[1]-radius)),bottom=Math.min(HEIGHT-1,Math.ceil(center[1]+radius));
  const support=Buffer.alloc(WIDTH*HEIGHT),visited=Buffer.alloc(WIDTH*HEIGHT),seeds:number[]=[];
  for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){const p=y*WIDTH+x,j=p*3,r=raw[j],g=raw[j+1],b=raw[j+2];if(warmSkin(r,g,b))continue;if(paperSupport(r,g,b))support[p]=1;if(paperCore(r,g,b))seeds.push(p);}
  const result:Component[]=[];
  for(const seed of seeds){if(visited[seed])continue;const q=[seed];visited[seed]=1;let sx=0,sy=0,nCore=0,minX=WIDTH,maxX=0,minY=HEIGHT,maxY=0;const edges:Point[]=[];
    for(let i=0;i<q.length;i++){const p=q[i],x=p%WIDTH,y=Math.floor(p/WIDTH),j=p*3;sx+=x;sy+=y;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);if(paperCore(raw[j],raw[j+1],raw[j+2]))nCore++;let boundary=false;for(const n of [x>0?p-1:-1,x<WIDTH-1?p+1:-1,p-WIDTH,p+WIDTH]){if(n<0||n>=support.length||!support[n]){boundary=true;continue;}if(!visited[n]){visited[n]=1;q.push(n);}}if(boundary)edges.push([x,y]);}
    if(q.length>30&&nCore>8)result.push({pixels:q,corePixels:nCore,center:[sx/q.length,sy/q.length],bounds:{left:minX,top:minY,width:maxX-minX+1,height:maxY-minY+1},hull:convexHull(edges)});
  }
  return result.sort((a,b)=>Math.hypot(a.center[0]-center[0],a.center[1]-center[1])-Math.hypot(b.center[0]-center[0],b.center[1]-center[1]));
}

export type Section = {v:number;left:Point;right:Point;observedEdges:boolean};
export type BoundaryRepair = {start:number;end:number;legacyKeyframes:{frame:number;quad:Quad}[];keys:{frame:number;paper:Point[];shoePolygons:Point[][];guardEnvelope?:Point[]}[]};
export type AuthoredPaper = {sourceSha256:string;reason:string;keys:{frame:number;polygons:Point[][];handPolygons:Point[][];featherPx:number;opaqueInterior:boolean}[]};
export type StructuralFrame = {frame:number;sourceRgbSha256:string;quad:Quad;paperContour:Point[];handRuns:[number,number,number][];handDomain:Point[];authoredHandBoundary?:Point[];nextShoePolygons:Point[][];edgeFeatherPx:number;localPaperStudy?:{sourceSha256:string;interval:[number,number];domain:Point[];strongRedBlue:number;strongRedGreen:number;seedReachPx:number;reason:string};identity:{method:string;candidatePixels:number;candidateCenter:Point;phase:string;manualGate:boolean;landedReferenceFrame:number}};
export type TrackProfile = {seat:MiddleSeat;sourceSha256:string;keyframes:{frame:number;quad:Quad;origin:string}[];release:number;contact:number;detached:number;boundaryRepair?:BoundaryRepair;authoredPaper?:AuthoredPaper;structural?:StructuralFrame[]};
export const EVENTS:Record<MiddleSeat,{release:number;contact:number;detached:number}>={
  2:{contact:157,release:205,detached:89},3:{contact:140,release:175,detached:84},
  4:{contact:137,release:225,detached:57},5:{contact:151,release:235,detached:108},6:{contact:150,release:210,detached:99},
};
const SHOE:Quad=[[1290,756],[1342,778],[1285,860],[1239,832]];
// During extraction the two neutral sheets touch. These gates describe only
// the moving top sheet; blank color alone cannot distinguish overlapping sheets.
export const EXTRACTION:Record<MiddleSeat,{frame:number;quad:Quad}[]>={
  2:[{frame:0,quad:[[1290,756],[1342,778],[1285,860],[1239,832]]},{frame:75,quad:[[1280,746],[1336,770],[1285,855],[1240,826]]},{frame:80,quad:[[1254,737],[1320,756],[1283,851],[1233,824]]},{frame:83,quad:[[1243,727],[1314,750],[1282,850],[1230,821]]},{frame:85,quad:[[1234,723],[1303,741],[1270,840],[1217,809]]},{frame:88,quad:[[1215,710],[1291,732],[1265,823],[1201,787]]}],
  3:[{frame:0,quad:[[1290,756],[1342,778],[1285,860],[1239,832]]},{frame:70,quad:[[1290,756],[1342,778],[1285,860],[1239,832]]},{frame:75,quad:[[1269,732],[1312,758],[1284,851],[1238,825]]},{frame:78,quad:[[1254,722],[1300,743],[1280,844],[1226,818]]},{frame:80,quad:[[1238,716],[1288,742],[1263,837],[1204,809]]},{frame:82,quad:[[1220,705],[1282,737],[1253,823],[1191,793]]}],
  4:[{frame:0,quad:[[1290,756],[1342,778],[1285,860],[1239,832]]},{frame:35,quad:[[1290,756],[1342,778],[1285,860],[1239,832]]},{frame:40,quad:[[1282,734],[1320,753],[1282,848],[1247,821]]},{frame:45,quad:[[1287,712],[1308,726],[1278,820],[1257,796]]},{frame:48,quad:[[1282,699],[1303,707],[1283,810],[1264,789]]},{frame:50,quad:[[1276,677],[1298,686],[1296,800],[1271,781]]},{frame:53,quad:[[1263,664],[1292,678],[1298,783],[1267,769]]},{frame:55,quad:[[1247,653],[1281,668],[1277,774],[1243,761]]}],
  5:[{frame:0,quad:[[1290,756],[1342,778],[1285,860],[1239,832]]},{frame:95,quad:[[1280,744],[1336,764],[1281,851],[1239,825]]},{frame:100,quad:[[1255,724],[1320,732],[1301,832],[1241,817]]},{frame:103,quad:[[1255,696],[1323,704],[1303,811],[1239,798]]},{frame:105,quad:[[1250,660],[1325,672],[1305,774],[1239,759]]},{frame:108,quad:[[1245,628],[1312,647],[1290,746],[1225,724]]}],
  6:[{frame:0,quad:[[1290,756],[1342,778],[1285,860],[1239,832]]},{frame:80,quad:[[1290,744],[1343,768],[1288,854],[1241,829]]},{frame:85,quad:[[1282,728],[1342,748],[1301,824],[1246,800]]},{frame:90,quad:[[1290,706],[1347,725],[1303,806],[1257,779]]},{frame:93,quad:[[1280,690],[1348,716],[1306,800],[1253,771]]},{frame:95,quad:[[1280,676],[1348,703],[1304,792],[1252,759]]},{frame:98,quad:[[1279,651],[1341,679],[1298,763],[1244,728]]},{frame:115,quad:[[1230,746],[1304,788],[1267,867],[1192,826]]},{frame:118,quad:[[1227,780],[1290,810],[1268,902],[1199,865]]},{frame:121,quad:[[1240,825],[1305,849],[1286,934],[1217,906]]}]
};
const mix=(a:Point,b:Point,t:number):Point=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
export function quadAt(keys:{frame:number;quad:Quad}[],frame:number):Quad {
  const i=keys.findIndex(k=>k.frame>=frame),b=keys[i<0?keys.length-1:i],a=keys[Math.max(0,(i<0?keys.length-1:i)-1)],t=a.frame===b.frame?0:Math.max(0,Math.min(1,(frame-a.frame)/(b.frame-a.frame)));
  return a.quad.map((p,j)=>mix(p,b.quad[j],t)) as Quad;
}
export function quadFromHull(hull:Point[]):Quad {
  const p=hull.map(v=>[...v] as Point);if(p.length<4)throw Error('Cannot fit paper quadrilateral');
  while(p.length>4){let k=0,best=Infinity;for(let i=0;i<p.length;i++){const area=Math.abs(cross(p[(i+p.length-1)%p.length],p[i],p[(i+1)%p.length]));if(area<best){best=area;k=i;}}p.splice(k,1);}
  let edge=0;for(let i=1;i<4;i++)if(p[i][1]+p[(i+1)%4][1]<p[edge][1]+p[(edge+1)%4][1])edge=i;
  // Keep the hull winding. Reversing it when an edge happens to face left
  // makes interpolation cross through a degenerate line during a thin turn.
  return [p[edge],p[(edge+1)%4],p[(edge+2)%4],p[(edge+3)%4]];
}
export function inside(x:number,y:number,poly:Point[]){let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++)if((poly[i][1]>y)!==(poly[j][1]>y)&&x<(poly[j][0]-poly[i][0])*(y-poly[i][1])/(poly[j][1]-poly[i][1])+poly[i][0])yes=!yes;return yes;}
const clamp=(n:number,a=0,b=1)=>Math.max(a,Math.min(b,n));
export function boundaryAt(profile:TrackProfile,frame:number){
  const repair=profile.boundaryRepair;if(!repair||frame<repair.start||frame>repair.end)return null;
  const i=repair.keys.findIndex(k=>k.frame>=frame),b=repair.keys[i<0?repair.keys.length-1:i],a=repair.keys[Math.max(0,(i<0?repair.keys.length-1:i)-1)],t=a.frame===b.frame?0:(frame-a.frame)/(b.frame-a.frame);
  if(b.frame===frame)return{paper:b.paper,shoePolygons:b.shoePolygons,guardEnvelope:b.guardEnvelope};
  if(a.paper.length!==b.paper.length||a.shoePolygons.length!==b.shoePolygons.length)throw Error('Boundary topology changes within repair interval');
  return {paper:a.paper.map((p,j)=>mix(p,b.paper[j],t)),shoePolygons:a.shoePolygons.map((poly,j)=>{if(poly.length!==b.shoePolygons[j].length)throw Error('Shoe polygon topology changes');return poly.map((p,k)=>mix(p,b.shoePolygons[j][k],t));}),guardEnvelope:[...a.guardEnvelope??[],...b.guardEnvelope??[]]};
}
export function trackMiddleCard(raw:Buffer,frame:number,profile:TrackProfile){
  if(raw.length!==WIDTH*HEIGHT*3)throw Error('Expected native RGB24');
  if(!Number.isInteger(frame)||frame<0||frame>359)throw Error('Expected zero-based source frame 0..359');
  if(profile.sourceSha256!==hashes[profile.seat])throw Error('Profile is not bound to frozen source');
  if(profile.structural)return trackStructuralMiddleCard(raw,frame,profile);
  const quad=quadAt(profile.keyframes,frame),cx=quad.reduce((s,p)=>s+p[0],0)/4,cy=quad.reduce((s,p)=>s+p[1],0)/4,scale=frame<profile.detached||(profile.seat===6&&frame>=113&&frame<=123)?1.005:1.15;
  const authorization=profile.authoredPaper?.keys.find(k=>k.frame===frame);if(authorization&&profile.authoredPaper!.sourceSha256!==profile.sourceSha256)throw Error('Authored paper authorization source mismatch');
  const boundary=boundaryAt(profile,frame),gate=boundary?.paper??quad.map(p=>[cx+(p[0]-cx)*scale,cy+(p[1]-cy)*scale] as Point),boundsPoints=[...gate,...authorization?.polygons.flat()??[]],left=Math.max(0,Math.floor(Math.min(...boundsPoints.map(p=>p[0]))-4)),right=Math.min(WIDTH-1,Math.ceil(Math.max(...boundsPoints.map(p=>p[0]))+4)),top=Math.max(0,Math.floor(Math.min(...boundsPoints.map(p=>p[1]))-4)),bottom=Math.min(HEIGHT-1,Math.ceil(Math.max(...boundsPoints.map(p=>p[1]))+4));
  // Keep every prior positive warm-skin guard pixel while extending the paper gate.
  // This changes spatial coverage, never the skin/color thresholds or dilation.
  const legacy=boundary?quadAt(profile.boundaryRepair!.legacyKeyframes,frame):null,legacyCenter=legacy?[legacy.reduce((s,p)=>s+p[0],0)/4,legacy.reduce((s,p)=>s+p[1],0)/4]:null,legacyGate=legacy?.map(p=>[legacyCenter![0]+(p[0]-legacyCenter![0])*scale,legacyCenter![1]+(p[1]-legacyCenter![1])*scale] as Point)??gate;
  const guardPoints=[...legacyGate,...boundary?.guardEnvelope??[]],guardLeft=Math.min(left,Math.floor(Math.min(...guardPoints.map(p=>p[0]))-4)),guardRight=Math.max(right,Math.ceil(Math.max(...guardPoints.map(p=>p[0]))+4)),guardTop=Math.min(top,Math.floor(Math.min(...guardPoints.map(p=>p[1]))-4)),guardBottom=Math.max(bottom,Math.ceil(Math.max(...guardPoints.map(p=>p[1]))+4));
  const mask=Buffer.alloc(WIDTH*HEIGHT),paint=Buffer.alloc(WIDTH*HEIGHT),protectedSkin=Buffer.alloc(WIDTH*HEIGHT),shoePaper=Buffer.alloc(WIDTH*HEIGHT),independentShoeGuard=Buffer.alloc(WIDTH*HEIGHT),authoredPaper=Buffer.alloc(WIDTH*HEIGHT),handOcclusion=Buffer.alloc(WIDTH*HEIGHT),support=Buffer.alloc(WIDTH*HEIGHT),seeds:number[]=[];
  for(let y=Math.max(0,guardTop-2);y<=Math.min(HEIGHT-1,guardBottom+2);y++)for(let x=Math.max(0,guardLeft-2);x<=Math.min(WIDTH-1,guardRight+2);x++){const p=y*WIDTH+x,j=p*3;if(warmSkin(raw[j],raw[j+1],raw[j+2]))for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(x+dx>=0&&x+dx<WIDTH&&y+dy>=0&&y+dy<HEIGHT)protectedSkin[(y+dy)*WIDTH+x+dx]=255;}
  const warmColorGuard=Buffer.from(protectedSkin);
  if(authorization){
    const distance=(x:number,y:number,poly:Point[])=>Math.min(...poly.map((a,i)=>{const b=poly[(i+1)%poly.length],dx=b[0]-a[0],dy=b[1]-a[1],t=clamp(((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy||1));return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy);}));
    for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){const p=y*WIDTH+x,hand=authorization.handPolygons.some(poly=>inside(x+.5,y+.5,poly));if(hand){handOcclusion[p]=255;protectedSkin[p]=255;continue;}const polygon=authorization.polygons.find(poly=>inside(x+.5,y+.5,poly));if(!polygon)continue;const j=p*3,r=raw[j],g=raw[j+1],b=raw[j+2];if(Math.min(r,g,b)<=60||g-Math.max(r,b)>=25)continue;const value=Math.round(255*clamp(distance(x+.5,y+.5,polygon)/Math.max(.001,authorization.featherPx)));if(value){authoredPaper[p]=value;protectedSkin[p]=0;}}
  }
  if(boundary)for(let y=735;y<=875;y++)for(let x=1220;x<=1360;x++){const p=y*WIDTH+x,j=p*3;if(boundary.shoePolygons.some(poly=>inside(x+.5,y+.5,poly))&&!warmSkin(raw[j],raw[j+1],raw[j+2])&&paperSupport(raw[j],raw[j+1],raw[j+2]))independentShoeGuard[p]=255;}
  for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){const p=y*WIDTH+x,j=p*3;if(protectedSkin[p]||independentShoeGuard[p]||(!authoredPaper[p]&&!inside(x+.5,y+.5,gate)))continue;if(authoredPaper[p]||paperSupport(raw[j],raw[j+1],raw[j+2]))support[p]=1;if(paperCore(raw[j],raw[j+1],raw[j+2]))seeds.push(p);}
  const visited=Buffer.alloc(WIDTH*HEIGHT);let pixels=0,sx=0,sy=0;
  for(const seed of seeds){if(visited[seed])continue;const q=[seed];visited[seed]=1;for(let i=0;i<q.length;i++){const p=q[i],x=p%WIDTH;for(const n of [x>0?p-1:-1,x<WIDTH-1?p+1:-1,p-WIDTH,p+WIDTH])if(n>=0&&n<support.length&&support[n]&&!visited[n]){visited[n]=1;q.push(n);}}
    if(q.length<12)continue;for(const p of q){const j=p*3,r=raw[j],g=raw[j+1],b=raw[j+2],alpha=Math.min(clamp((Math.min(r,b)-15)/220),clamp((170-(g-Math.min(r,b)))/100));mask[p]=Math.round(alpha*255);pixels++;sx+=p%WIDTH;sy+=Math.floor(p/WIDTH);}}
  if(authorization?.opaqueInterior)for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){const p=y*WIDTH+x;if(!protectedSkin[p]&&!independentShoeGuard[p])mask[p]=Math.max(mask[p],authoredPaper[p]);}
  if(authorization){pixels=0;sx=0;sy=0;for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++)if(mask[y*WIDTH+x]){pixels++;sx+=x;sy+=y;}}
  for(let y=top+1;y<bottom;y++)for(let x=left+1;x<right;x++){const p=y*WIDTH+x;if(!protectedSkin[p])paint[p]=Math.min(mask[p],mask[p-1],mask[p+1],mask[p-WIDTH],mask[p+WIDTH]);}
  const mouth:Point[]=[[1288,749],[1352,777],[1290,866],[1231,835]];
  for(let y=745;y<=870;y++)for(let x=1227;x<=1355;x++){const p=y*WIDTH+x,j=p*3;if(!mask[p]&&inside(x+.5,y+.5,mouth)&&!warmSkin(raw[j],raw[j+1],raw[j+2])&&paperSupport(raw[j],raw[j+1],raw[j+2]))shoePaper[p]=255;}
  const sections:Section[]=[];for(let k=0;k<=16;k++){const v=k/16,l=mix(quad[0],quad[3],v),r=mix(quad[1],quad[2],v),dx=r[0]-l[0],dy=r[1]-l[1],steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)*1.5));let lo=Infinity,hi=-Infinity;
    for(let j=0;j<=steps;j++){const u=-.12+1.24*j/steps,x=Math.round(l[0]+dx*u),y=Math.round(l[1]+dy*u);if(x>=0&&x<WIDTH&&y>=0&&y<HEIGHT&&mask[y*WIDTH+x]>=200){lo=Math.min(lo,u);hi=Math.max(hi,u);}}
    const observed=k>0&&k<16&&hi-lo>.72&&lo<.18&&hi>.82;sections.push({v,left:observed?[l[0]+dx*lo,l[1]+dy*lo]:l,right:observed?[l[0]+dx*hi,l[1]+dy*hi]:r,observedEdges:observed});}
  const widths:number[]=[];const sample=(x:number,y:number)=>{const j=(Math.round(y)*WIDTH+Math.round(x))*3;return Math.min(raw[j]??0,raw[j+2]??0);};
  for(const section of sections.slice(2,-2))if(section.observedEdges)for(const flip of [false,true]){const a=flip?section.right:section.left,b=flip?section.left:section.right,len=Math.hypot(b[0]-a[0],b[1]-a[1]),dx=(b[0]-a[0])/len,dy=(b[1]-a[1])/len,out=sample(a[0]-dx*6,a[1]-dy*6),inward=sample(a[0]+dx*6,a[1]+dy*6);if(inward-out<100)continue;let t10:number|null=null,t90:number|null=null;for(let z=-6;z<=6;z+=.5){const t=(sample(a[0]+dx*z,a[1]+dy*z)-out)/(inward-out);if(t10===null&&t>=.1)t10=z;if(t90===null&&t>=.9)t90=z;}if(t10!==null&&t90!==null&&t90>=t10)widths.push(t90-t10);}
  widths.sort((a,b)=>a-b);const edgeTransitionPx=widths[Math.floor(widths.length/2)]??1.5;
  return {mask,paint,protectedSkin,warmColorGuard,authoredPaper,handOcclusion,shoePaper,independentShoeGuard,record:{sourceFrame:frame,seat:profile.seat,sourceSha256:profile.sourceSha256,physicalSide:'UNKNOWN' as const,authoredDisplaySide:'FRONT_DEMONSTRATION_ONLY' as const,quad,sections,visiblePixels:pixels,centroid:pixels?[sx/pixels,sy/pixels]:null,authoredPaperAuthorization:authorization??null,bounds:{left,top,width:right-left+1,height:bottom-top+1},edgeTransitionPx,inkBlurSigmaPx:clamp(edgeTransitionPx/2.563,.4,2.8),state:frame<profile.detached?'shoe-contact':frame<profile.contact?'carried':frame<profile.release?'hand-contact':'released',confidence:{calibratedProbability:false,unobservedSections:sections.filter(s=>!s.observedEdges).length,reasons:['Blank paper has no observed material-point UVs; all texture coordinates are authored estimates.','Warm-color guard is conservative, not a complete anatomical hand matte.',...(authorization?['Local source-bound visible-paper authorization overrides color guard only inside recorded polygons, excluding explicit hand occlusion.']:[]),...(frame<profile.detached?['Touching sheets require an authored extraction gate.']:[])]}}};
}
export {projectNeutralMesh} from './pamela-neutral-card-track.ts';

/** Neutral RGB is evidence for locating a contour, never the opacity of its interior. */
export function structuralPaperComponents(raw:Buffer,center:Point,gate?:Point[]):Component[]{
  const l=Math.max(0,Math.floor(center[0]-155)),r=Math.min(WIDTH-1,Math.ceil(center[0]+155)),t=Math.max(540,Math.floor(center[1]-155)),b=Math.min(HEIGHT-1,Math.ceil(center[1]+155)),selected=new Set<number>(),visited=new Set<number>();
  for(let y=t;y<=b;y++)for(let x=l;x<=r;x++){const p=y*WIDTH+x,j=p*3,red=raw[j],green=raw[j+1],blue=raw[j+2],lo=Math.min(red,green,blue),hi=Math.max(red,green,blue);if(lo>85&&hi-lo<55&&green-Math.min(red,blue)<45&&red-blue<28&&(!gate||inside(x+.5,y+.5,gate)))selected.add(p);}
  const result:Component[]=[];for(const seed of selected){if(visited.has(seed))continue;const q=[seed];visited.add(seed);let sx=0,sy=0,minX=WIDTH,maxX=0,minY=HEIGHT,maxY=0,corePixels=0;const edge:Point[]=[];for(let i=0;i<q.length;i++){const p=q[i],x=p%WIDTH,y=Math.floor(p/WIDTH);sx+=x;sy+=y;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);if(paperCore(raw[p*3],raw[p*3+1],raw[p*3+2]))corePixels++;let boundary=false;for(const n of [p-1,p+1,p-WIDTH,p+WIDTH]){if(!selected.has(n)){boundary=true;continue;}if(!visited.has(n)){visited.add(n);q.push(n);}}if(boundary)edge.push([x+.5,y+.5]);}if(q.length>=40)result.push({pixels:q,corePixels,center:[sx/q.length,sy/q.length],bounds:{left:minX,top:minY,width:maxX-minX+1,height:maxY-minY+1},hull:convexHull(edge)});}
  return result.sort((a,b)=>Math.hypot(a.center[0]-center[0],a.center[1]-center[1])-Math.hypot(b.center[0]-center[0],b.center[1]-center[1]));
}
const polyScale=(q:Point[],s:number)=>{const c=q.reduce((a,p)=>[a[0]+p[0]/q.length,a[1]+p[1]/q.length],[0,0]);return q.map(p=>[c[0]+(p[0]-c[0])*s,c[1]+(p[1]-c[1])*s] as Point);};
const polyDistance=(x:number,y:number,poly:Point[])=>Math.min(...poly.map((a,i)=>{const b=poly[(i+1)%poly.length],dx=b[0]-a[0],dy=b[1]-a[1],t=clamp(((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy||1));return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy);}));
const alignQuad=(q:Quad,reference:Quad):Quad=>{const norm=(v:Quad)=>{const c=v.reduce((a,p)=>[a[0]+p[0]/4,a[1]+p[1]/4],[0,0]),r=Math.sqrt(v.reduce((a,p)=>a+(p[0]-c[0])**2+(p[1]-c[1])**2,0));return v.map(p=>[(p[0]-c[0])/r,(p[1]-c[1])/r]);},a=norm(reference),b=norm(q),scores=[0,1,2,3].map(k=>a.reduce((s,p,j)=>s+(p[0]-b[(j+k)%4][0])**2+(p[1]-b[(j+k)%4][1])**2,0)),k=scores.indexOf(Math.min(...scores));return q.map((_,j)=>q[(j+k)%4]) as Quad;};
function clipOutside(poly:Point[],a:Point,b:Point,margin=1):Point[]{const d=(p:Point)=>-cross(a,b,p)/Math.hypot(b[0]-a[0],b[1]-a[1])-margin,out:Point[]=[];for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length],dp=d(p),dq=d(q);if(dp>=0)out.push(p);if((dp>=0)!==(dq>=0))out.push(mix(p,q,dp/(dp-dq)));}return out;}

// Native hand-edge SEARCH anchors read against source frames185..210, with topology
// fixed across the two contacting fingertips. Coordinates are relative to the
// frozen source crop x1160,y810. Interpolation changes masks, never source RGB.
function p6ReleaseBoundary(frame:number):Point[]|null{
  if(frame<185||frame>210)return null;
  const xs=[95,105,119,135,149,158,162,176,189,200,205],anchors:[number,number[]][]=[
    [185,[134,150,163,171,173,169,168,176,171,156,147]],
    [197,[134,151,164,172,174,171,170,177,173,158,149]],
    [198,[127,145,157,165,168,165,159,165,164,159,146]],
    [199,[123,141,152,158,160,156,151,157,156,151,140]],
    [200,[122,140,151,155,156,153,148,153,154,148,138]],
    [201,[119,137,147,152,153,149,145,149,150,145,134]],
    [202,[114,128,138,144,145,142,136,143,142,137,127]],
    [203,[90,99,109,117,122,124,123,126,126,120,116]],
    [210,[40,40,40,40,40,40,40,40,40,40,40]],
  ];const i=anchors.findIndex(a=>a[0]>=frame),b=anchors[i],a=anchors[Math.max(0,i-1)],t=a[0]===b[0]?0:(frame-a[0])/(b[0]-a[0]);return xs.map((x,j)=>[1160+x,810+a[1][j]+(b[1][j]-a[1][j])*t]);
}

/** A free-edge proposal searches the native edge normal; authored gates remain the identity constraint. */
function refineExtractionQuad(raw:Buffer,quad:Quad,frame:number,profile:TrackProfile):Quad{
  if(frame<({2:74,3:70,4:36,5:96,6:80}[profile.seat]))return quad;
  const a=quad[2],b=quad[3],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy),normal:[number,number]=[dy/len,-dx/len],offsets:number[]=[];
  for(const u of [.2,.35,.5,.65,.8]){const p=mix(a,b,u);let best=0,offset=0;for(let z=-6;z<=22;z++){const sample=(d:number)=>{const x=Math.round(p[0]+normal[0]*d),y=Math.round(p[1]+normal[1]*d),j=(y*WIDTH+x)*3;return .299*raw[j]+.587*raw[j+1]+.114*raw[j+2];},drop=sample(z-1.5)-sample(z+1.5),score=drop-Math.abs(z)*.65;if(score>best){best=score;offset=z;}}if(best>12)offsets.push(offset);}
  offsets.sort((a,b)=>a-b);if(offsets.length<3)return quad;const z=offsets[Math.floor(offsets.length/2)];return quad.map((p,i)=>i>=2?[p[0]+normal[0]*z,p[1]+normal[1]*z]:p) as Quad;
}

export function buildStructuralFrame(raw:Buffer,frame:number,profile:TrackProfile,reference:{quad:Quad;contour:Point[]},previous?:StructuralFrame):StructuralFrame{
  const legacy=quadAt(profile.keyframes,frame),center=expectedCenter(profile.seat,frame),attached=frame<profile.detached,overlap=profile.seat===6&&frame>=111&&frame<=120,manualGate=attached||overlap;
  const existingBoundary=boundaryAt(profile,frame);
  let gateQuad=existingBoundary?.paper.length===4?existingBoundary.paper.map(p=>[...p] as Point) as Quad:attached?refineExtractionQuad(raw,legacy,frame,profile):legacy;
  if(profile.seat===4&&frame===45){gateQuad[2]=[1276,832];gateQuad[3]=[1255,811];}
  // Source99 briefly overlaps the shoe in screen space. Its old hull incorrectly joined both sheets.
  if(profile.seat===6&&frame===99)gateQuad=[[1277,635],[1337,674],[1285,766],[1234,728]];
  const forced=manualGate||!!existingBoundary||(profile.seat===6&&frame===99)||(profile.seat===2&&frame===89),gate=forced?existingBoundary?polyScale(existingBoundary.paper,1.005):polyScale(gateQuad,1.01):undefined,candidates=structuralPaperComponents(raw,center,gate).filter(c=>c.pixels.length>120);
  if(!candidates.length)throw Error(`No source contour P${profile.seat}f${frame}`);
  const score=(c:Component)=>Math.hypot(c.center[0]-center[0],c.center[1]-center[1])+(previous?Math.max(0,Math.hypot(c.center[0]-previous.identity.candidateCenter[0],c.center[1]-previous.identity.candidateCenter[1])-35)*.3:0);
  candidates.sort((a,b)=>score(a)-score(b));const selected=candidates[0];let contour=polyScale(selected.hull,1.008),quad=alignQuad(quadFromHull(selected.hull),previous?.quad??legacy);
  if(forced)quad=gateQuad;
  // P4's thin folded extraction has grey paper touching the next white sheet.
  // Its source-authored native contour, not a neutral-colour subcomponent,
  // establishes coverage through the complete33..57 extraction interval.
  if(profile.seat===4&&existingBoundary&&frame>=33&&frame<=57)contour=gateQuad.map(p=>[...p] as Point);
  // The landed material plane is tracked from its visible free edge, not shortened to the portion left by the hand.
  if(frame>=profile.contact){const ref=reference.quad,dx=ref[2][0]-ref[3][0],dy=ref[2][1]-ref[3][1],len=Math.hypot(dx,dy),ux=dx/len,uy=dy/len,vx=-uy,vy=ux,origin=ref[3],project=(p:Point)=>[(p[0]-origin[0])*ux+(p[1]-origin[1])*uy,(p[0]-origin[0])*vx+(p[1]-origin[1])*vy],coords=selected.hull.map(project),refCoords=reference.contour.map(project),minU=Math.min(...coords.map(p=>p[0])),maxU=Math.max(...coords.map(p=>p[0])),maxV=Math.max(...coords.map(p=>p[1])),refMinU=Math.min(...refCoords.map(p=>p[0])),refMaxU=Math.max(...refCoords.map(p=>p[0])),refMaxV=Math.max(...refCoords.map(p=>p[1])),scale=(maxU-minU)/(refMaxU-refMinU);
    const transform=(p:Point):Point=>{const[pu,pv]=project(p);return[origin[0]+ux*(minU+(pu-refMinU)*scale)+vx*(maxV+(pv-refMaxV)*scale),origin[1]+uy*(minU+(pu-refMinU)*scale)+vy*(maxV+(pv-refMaxV)*scale)];};quad=ref.map(transform) as Quad;
    // Coverage follows this frame's visible native contour. The inferred hidden
    // material plane must never enlarge/rotate coverage onto the table.
  }
  const authorization=profile.authoredPaper?.keys.find(k=>k.frame===frame);
  if(authorization&&profile.seat!==2)contour=convexHull([...contour,...authorization.polygons.flat()]);
  if(profile.seat===6&&frame>=185&&frame<=210){const visibleInterior=profile.authoredPaper!.keys.find(k=>k.frame===205)!.polygons[0];contour=convexHull([...contour,...polyScale(visibleInterior,.965)]);}
  const mouth:Point[]=[[1292,758],[1340,779],[1284,858],[1241,832]],nextShoePolygons=gateQuad.map((p,i)=>clipOutside(mouth,p,gateQuad[(i+1)%4])).filter(p=>p.length>=3);
  // Hand seeds must connect to actual warm regions outside the sheet. Isolated warm paper shadows do not become hands.
  const l=Math.max(0,Math.floor(Math.min(...contour.map(p=>p[0]))-65)),r=Math.min(WIDTH-1,Math.ceil(Math.max(...contour.map(p=>p[0]))+65)),t=Math.max(0,Math.floor(Math.min(...contour.map(p=>p[1]))-90)),b=Math.min(HEIGHT-1,Math.ceil(Math.max(...contour.map(p=>p[1]))+35)),rw=r-l+1,rh=b-t+1,warm=new Uint8Array(rw*rh),seen=new Uint8Array(rw*rh),hand=new Uint8Array(rw*rh);
  const receivingHand=profile.seat===2&&((frame>=106&&frame<=124)||frame>=150)||profile.seat===3&&frame>=100&&frame<=120,vLimit=frame<profile.contact&&!receivingHand?.53:2,topLeft=mix(quad[0],quad[3],-3),topRight=mix(quad[1],quad[2],-3),bottomLeft=mix(quad[0],quad[3],vLimit),bottomRight=mix(quad[1],quad[2],vLimit),handDomain=[mix(topLeft,topRight,-2),mix(topLeft,topRight,3),mix(bottomLeft,bottomRight,3),mix(bottomLeft,bottomRight,-2)];
  for(let y=t;y<=b;y++)for(let x=l;x<=r;x++){const j=(y*WIDTH+x)*3;if(warmSkin(raw[j],raw[j+1],raw[j+2]))warm[(y-t)*rw+x-l]=1;}
  const handSeedY=Math.min(...contour.map(v=>v[1]))-8;
  for(let seed=0;seed<warm.length;seed++){if(!warm[seed]||seen[seed])continue;const q=[seed];seen[seed]=1;let externalStrong=0;for(let i=0;i<q.length;i++){const p=q[i],x=p%rw+l,y=Math.floor(p/rw)+t,j=(y*WIDTH+x)*3;if((y<handSeedY||receivingHand)&&!inside(x+.5,y+.5,contour)&&raw[j]-raw[j+2]>40&&raw[j]-raw[j+1]>20)externalStrong++;for(const n of [p%rw?p-1:-1,p%rw<rw-1?p+1:-1,p-rw,p+rw])if(n>=0&&n<warm.length&&warm[n]&&!seen[n]){seen[n]=1;q.push(n);}}if(externalStrong>=45)for(const p of q){const x=p%rw+l,y=Math.floor(p/rw)+t;if(!inside(x+.5,y+.5,contour)||inside(x+.5,y+.5,handDomain))hand[p]=1;}}
  // P5's source-bound contact study: grey/warm paper shadow touches the actual
  // fingers at151..229. Only in this explicit paper domain, retain connected
  // skin colour within2px of a strong native hand seed, then close nail holes.
  // The global warmSkin predicate and every pixel outside this domain are unchanged.
  const localPaperStudy=profile.seat===5&&frame>=151&&frame<=229||profile.seat===6&&frame>=150&&frame<=210;
  if(localPaperStudy){const strong=new Uint8Array(hand.length);for(let y=t;y<=b;y++)for(let x=l;x<=r;x++){const p=(y-t)*rw+x-l,j=(y*WIDTH+x)*3;if(hand[p]&&raw[j]-raw[j+2]>=45&&raw[j]-raw[j+1]>=24)strong[p]=1;}for(let y=t+2;y<=b-2;y++)for(let x=l+2;x<=r-2;x++){const p=(y-t)*rw+x-l;if(!hand[p]||!inside(x+.5,y+.5,contour))continue;let near=false;for(let dy=-2;dy<=2&&!near;dy++)for(let dx=-2;dx<=2;dx++)if(strong[p+dy*rw+dx]){near=true;break;}if(!near)hand[p]=0;}}
  if(profile.seat===4&&frame>=33&&frame<=57)for(let y=t;y<=b;y++)for(let x=l;x<=r;x++){const j=(y*WIDTH+x)*3;if(raw[j]-raw[j+1]>55&&raw[j]-raw[j+2]>70)hand[(y-t)*rw+x-l]=1;}
  // Only small closed holes can be fingernails. A touching fingertip and the
  // warm shoe rim can enclose the entire white sheet; never fill that as skin.
  const outside=new Uint8Array(hand.length),queue:number[]=[];for(let y=0;y<rh;y++)for(const x of [0,rw-1])if(!hand[y*rw+x]&&!outside[y*rw+x]){outside[y*rw+x]=1;queue.push(y*rw+x);}for(let x=0;x<rw;x++)for(const y of [0,rh-1])if(!hand[y*rw+x]&&!outside[y*rw+x]){outside[y*rw+x]=1;queue.push(y*rw+x);}for(let i=0;i<queue.length;i++){const p=queue[i];for(const n of [p%rw?p-1:-1,p%rw<rw-1?p+1:-1,p-rw,p+rw])if(n>=0&&n<hand.length&&!hand[n]&&!outside[n]){outside[n]=1;queue.push(n);}}const holes=new Uint8Array(hand.length);for(let seed=0;seed<hand.length;seed++){if(hand[seed]||outside[seed]||holes[seed])continue;const q=[seed];holes[seed]=1;for(let i=0;i<q.length;i++){const p=q[i];for(const n of [p%rw?p-1:-1,p%rw<rw-1?p+1:-1,p-rw,p+rw])if(n>=0&&n<hand.length&&!hand[n]&&!outside[n]&&!holes[n]){holes[n]=1;q.push(n);}}if(q.length<=500)for(const p of q)hand[p]=1;}
  // Preserved, source-bound paper-shadow authorizations exclude the explicitly recorded hand polygons.
  const originalHand=hand.slice();for(let y=1;y<rh-1;y++)for(let x=1;x<rw-1;x++)if(originalHand[y*rw+x])for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)hand[(y+dy)*rw+x+dx]=1;
  const auth=profile.authoredPaper?.keys.find(k=>k.frame===frame);if(auth&&!localPaperStudy&&profile.seat!==2)for(let y=t;y<=b;y++)for(let x=l;x<=r;x++){const p=(y-t)*rw+x-l;if(auth.handPolygons.some(poly=>inside(x+.5,y+.5,poly)))hand[p]=1;else if(auth.polygons.some(poly=>inside(x+.5,y+.5,poly)))hand[p]=0;}
  const handBoundary=profile.seat===6?p6ReleaseBoundary(frame):null,authoredHandBoundary:Point[]=[];
  if(profile.seat===5&&frame>=151&&frame<=229){const proposals:number[]=[];for(let x=l;x<=r;x++){let last=t-1;for(let y=t;y<=b;y++){const j=(y*WIDTH+x)*3;if(raw[j]-raw[j+1]>55&&raw[j]-raw[j+2]>70)last=y+2;}proposals.push(last);}for(let x=l;x<=r;x++){const neighbors=proposals.slice(Math.max(0,x-l-2),Math.min(proposals.length,x-l+3)).sort((a,b)=>a-b),line=neighbors[Math.floor(neighbors.length/2)];authoredHandBoundary.push([x,line]);for(let y=t;y<=b;y++)if(inside(x+.5,y+.5,contour))hand[(y-t)*rw+x-l]=y<=line?1:0;}}
  if(handBoundary){const proposals:number[]=[];for(let x=l;x<=r;x++){const i=handBoundary.findIndex(p=>p[0]>=x),a=handBoundary[Math.max(0,(i<0?handBoundary.length-1:i)-1)],b=handBoundary[i<0?handBoundary.length-1:i],line=a[1]+(b[1]-a[1])*clamp((x-a[0])/(b[0]-a[0]||1));let last=line;if(frame<=202)for(let y=Math.floor(line-20);y<=Math.ceil(line+20);y++){const j=(y*WIDTH+x)*3;if(raw[j]-raw[j+1]>55&&raw[j]-raw[j+2]>70)last=y+2;}proposals.push(last);}for(let x=l;x<=r;x++){const neighbors=proposals.slice(Math.max(0,x-l-3),Math.min(proposals.length,x-l+4)).sort((a,b)=>a-b),line=neighbors[Math.floor(neighbors.length/2)];authoredHandBoundary.push([x,line]);for(let y=t;y<=b;y++)if(inside(x+.5,y+.5,contour))hand[(y-t)*rw+x-l]=frame<=202&&y<=line?1:0;}}
  const handRuns:[number,number,number][]=[];for(let y=0;y<rh;y++){let start=-1;for(let x=0;x<=rw;x++){const value=x<rw&&hand[y*rw+x];if(value&&start<0)start=x;if(!value&&start>=0){handRuns.push([y+t,start+l,x-1+l]);start=-1;}}}
  return{frame,sourceRgbSha256:'TO_BE_BOUND_BY_TOOL',quad,paperContour:contour,handRuns,handDomain,...authoredHandBoundary.length?{authoredHandBoundary}:{},nextShoePolygons,edgeFeatherPx:.85,...localPaperStudy?{localPaperStudy:{sourceSha256:profile.sourceSha256,interval:(profile.seat===5?[151,229]:[150,210]) as [number,number],domain:contour,strongRedBlue:45,strongRedGreen:24,seedReachPx:2,reason:'Local source-bound paper-shadow versus finger proposal; nail holes closed, one-pixel final guard dilation. P6 release uses explicit native search anchors, strong hand edge within20px,7-column median,+2px guard. P5 contact uses vertical finger silhouette with native r-g>55/r-b>70 seeds,5-column median,+2px guard. Exact resulting boundaries stored.'}}:{},identity:{method:'Source neutral-contour proposal inside independent identity gates; filled geometric paper; connected exterior hand with closed nail holes; canonical landed UV plane separate from coverage',candidatePixels:selected.pixels.length,candidateCenter:selected.center,phase:frame<profile.detached?'extraction':frame<profile.contact?'carried':'landed',manualGate:forced,landedReferenceFrame:350}};
}

function trackStructuralMiddleCard(raw:Buffer,frame:number,profile:TrackProfile){
  const key=profile.structural!.find(k=>k.frame===frame);if(!key)throw Error('Missing explicit structural source frame');const contour=key.paperContour,quad=key.quad,left=Math.max(0,Math.floor(Math.min(...contour.map(p=>p[0]))-2)),right=Math.min(WIDTH-1,Math.ceil(Math.max(...contour.map(p=>p[0]))+2)),top=Math.max(0,Math.floor(Math.min(...contour.map(p=>p[1]))-2)),bottom=Math.min(HEIGHT-1,Math.ceil(Math.max(...contour.map(p=>p[1]))+2)),mask=Buffer.alloc(WIDTH*HEIGHT),paint=Buffer.alloc(WIDTH*HEIGHT),protectedSkin=Buffer.alloc(WIDTH*HEIGHT),warmColorGuard=Buffer.alloc(WIDTH*HEIGHT),authoredPaper=Buffer.alloc(WIDTH*HEIGHT),handOcclusion=Buffer.alloc(WIDTH*HEIGHT),shoePaper=Buffer.alloc(WIDTH*HEIGHT),independentShoeGuard=Buffer.alloc(WIDTH*HEIGHT);
  for(const[y,x0,x1]of key.handRuns)for(let x=x0;x<=x1;x++){const p=y*WIDTH+x;handOcclusion[p]=protectedSkin[p]=255;}
  for(let y=745;y<=870;y++)for(let x=1227;x<=1355;x++){const p=y*WIDTH+x;if(key.nextShoePolygons.some(poly=>inside(x+.5,y+.5,poly)))independentShoeGuard[p]=shoePaper[p]=255;}
  let pixels=0,sx=0,sy=0;for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){const p=y*WIDTH+x,j=p*3;if(warmSkin(raw[j],raw[j+1],raw[j+2]))warmColorGuard[p]=255;if(!inside(x+.5,y+.5,contour)||protectedSkin[p]||independentShoeGuard[p])continue;const alpha=Math.round(255*clamp(polyDistance(x+.5,y+.5,contour)/key.edgeFeatherPx));mask[p]=paint[p]=authoredPaper[p]=alpha;if(alpha){pixels++;sx+=x;sy+=y;}}
  const sections:Section[]=[];for(let k=0;k<=16;k++){const v=k/16,l=mix(quad[0],quad[3],v),r=mix(quad[1],quad[2],v);sections.push({v,left:l,right:r,observedEdges:false});}
  return{mask,paint,protectedSkin,warmColorGuard,authoredPaper,handOcclusion,shoePaper,independentShoeGuard,record:{sourceFrame:frame,seat:profile.seat,sourceSha256:profile.sourceSha256,physicalSide:'UNKNOWN' as const,authoredDisplaySide:'FRONT_DEMONSTRATION_ONLY' as const,quad,sections,visiblePixels:pixels,centroid:pixels?[sx/pixels,sy/pixels]:null,authoredPaperAuthorization:null,bounds:{left,top,width:right-left+1,height:bottom-top+1},edgeTransitionPx:1.5,inkBlurSigmaPx:.65,state:key.identity.phase,structuralPaperContour:contour,structuralIdentity:key.identity,confidence:{calibratedProbability:false,unobservedSections:17,reasons:['All interior paper alpha is geometric, not a brightness estimate.','Native source-bound hand runs and separate next-shoe polygons require visual QA.','Full landed plane is inferred from its free edge and source350 reference.']}}};
}

export function projectMiddleCardUv(record:{sections:Section[];quad:Quad;bounds:{left:number;top:number;width:number;height:number};structuralPaperContour?:Point[]}){
  const uv=projectSourceMesh(record.sections);if(!record.structuralPaperContour)return uv;const q=record.quad,ax=q[1][0]-q[0][0],ay=q[1][1]-q[0][1],bx=q[3][0]-q[0][0],by=q[3][1]-q[0][1],det=ax*by-ay*bx,b=record.bounds;
  for(let y=b.top;y<b.top+b.height;y++)for(let x=b.left;x<b.left+b.width;x++){const p=y*WIDTH+x;if(uv[p*2]>=0||!inside(x+.5,y+.5,record.structuralPaperContour))continue;const dx=x+.5-q[0][0],dy=y+.5-q[0][1];uv[p*2]=clamp((dx*by-dy*bx)/det);uv[p*2+1]=clamp((dy*ax-dx*ay)/det);}return uv;
}
