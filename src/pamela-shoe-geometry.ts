/** C2-P4 source-bound 2.5D SHAPE replacement, not a material tint.
 * Original body is independently removed. The source hand and actual visible
 * paper are foreground; the aperture and extraction coordinates never move.
 * Rear/inner surfaces, thickness and lighting are authored assumptions.
 */
export type PamelaShoeShape='compact-wedge'|'rounded-housing';
type Point=readonly[number,number];
export const PAMELA_SHOE_GEOMETRY={
 id:'pamela-C2-P4-shoe-shape-v1',sourceSha256:'67319ed86cde67cc7a7566553d451a89f8aac11384a55f8f8b460d1403d30167',
 source:'runs/20261109-pamela-seat-bank/c2/bank-v2-stage-2/original/pamela-seat-4-wan3-c2-bank-v2.mp4',
 track:'runs/20261109-pamela-c2-motion-track/take-01/seat-4/draft-03/track.json',
 trackSha256:'5f7bdf302f9a1cc602c0addac3a691888af019fefede75d671fe59ccff1bb4d8',
 width:1762,height:1174,fps:30,frames:360,
 aperture:[[1288,750],[1350,780],[1287,863],[1234,833]] as readonly Point[],
 sourceContactInsert:[[1290,742],[1360,772],[1290,873],[1225,835]] as readonly Point[],
 removalHull:[[1179,811],[1210,774],[1300,712],[1598,626],[1700,658],[1701,843],[1290,908],[1210,908],[1179,886]] as readonly Point[],
 roi:{left:1175,top:620,width:530,height:295},
 footprint:{'compact-wedge':[[1198,868],[1223,894],[1289,896],[1574,847]] as readonly Point[],
 'rounded-housing':[[1200,869],[1225,895],[1289,896],[1535,851]] as readonly Point[]},
 assumptions:['Native image-space 2.5D geometry; not a recovered source camera or physical shoe.',
 'Hidden rear, inner trough, side thickness, bevels and illumination are authored.',
 'Both bodies deliberately retain the small source contact collar/lip/interior and paper at the aperture; the original outer body and rear silhouette are removed.',
 'Use the same source-projection mesh, locked camera and bounded pan as dealer video.',
 'Removal classifier is source-bound to this original RGB and must run before artwork or color grading.',
 'Foreground masks do not establish anatomical ground truth; native extraction and return views require visual review.'],
} as const;
export const PAMELA_SHOE_SHAPES=[{id:'compact-wedge',label:'Kompakt kil'},{id:'rounded-housing',label:'Rundat hus'}] as const;
export function isPamelaShoeGeometrySource(hash:string,width:number,height:number){return hash===PAMELA_SHOE_GEOMETRY.sourceSha256&&width===1762&&height===1174;}
function inside(points:readonly Point[],x:number,y:number){let yes=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
/** Native foreground: the deliberately retained source contact collar, source
 * warm skin, pale nail/skin and exact visible-paper coverage from the C2 mask.
 * No generic blue-channel 'shoe guard': that channel conflates hand and collar.
 */
export function pamelaShoeForeground(r:number,g:number,b:number,x:number,y:number,paperProtection=0){
 if(paperProtection>0||inside(PAMELA_SHOE_GEOMETRY.sourceContactInsert,x,y))return true;
 const warm=r>65&&r-g>7&&r-b>17;
 const pale=Math.min(r,b)>115&&Math.abs(r-b)<67&&g>Math.min(r,b)-15;
 const handZone=x>1220&&x<1380&&y>690&&y<800;
 const paperZone=inside(PAMELA_SHOE_GEOMETRY.aperture,x,y)||(x>1215&&x<1365&&y>690&&y<784);
 return handZone&&warm||paperZone&&pale;
}
export function createPamelaShoeRemoval(input:{sourceRgb:Uint8Array;sourceSha256:string;sourceFrame:number;width:number;height:number;semanticMaskRgb?:Uint8Array}){
 const {sourceRgb,width,height,sourceFrame,semanticMaskRgb}=input;
 if(!isPamelaShoeGeometrySource(input.sourceSha256,width,height))throw Error('Shoe geometry source/calibration mismatch');
 if(!Number.isInteger(sourceFrame)||sourceFrame<0||sourceFrame>=360)throw Error('Shoe geometry source frame out of range');
 if(sourceRgb.length!==width*height*3||semanticMaskRgb&&semanticMaskRgb.length!==sourceRgb.length)throw Error('Native packed RGB24 required');
 const removeAlpha=new Uint8Array(width*height),foregroundGuard=new Uint8Array(width*height);
 let removedPixels=0,protectedPixels=0,semanticPaperOverlap=0,semanticSkinOverlap=0;
 const roi=PAMELA_SHOE_GEOMETRY.roi;
 for(let y=roi.top;y<roi.top+roi.height;y++)for(let x=roi.left;x<roi.left+roi.width;x++){
  const p=y*width+x,j=p*3;if(!inside(PAMELA_SHOE_GEOMETRY.removalHull,x+.5,y+.5))continue;
  const r=sourceRgb[j],g=sourceRgb[j+1],b=sourceRgb[j+2],protect=pamelaShoeForeground(r,g,b,x+.5,y+.5,semanticMaskRgb?Math.max(semanticMaskRgb[j],semanticMaskRgb[j+1]):0);
  if(protect){foregroundGuard[p]=255;protectedPixels++;}else{removeAlpha[p]=255;removedPixels++;}
  if(semanticMaskRgb&&!protect){if(semanticMaskRgb[j]||semanticMaskRgb[j+1])semanticPaperOverlap++;if(semanticMaskRgb[j+2]&&r>70&&r-g>10&&r-b>27)semanticSkinOverlap++;}
 }
 return{removeAlpha,foregroundGuard,diagnostics:{removedPixels,protectedPixels,semanticPaperOverlap,semanticSkinOverlap}};
}
export function createPamelaShoeGeometrySvg(shape:PamelaShoeShape){
 if(!PAMELA_SHOE_SHAPES.some(v=>v.id===shape))throw Error('Unknown shoe geometry');
 // Identical fixed collar; its SOURCE foreground supplies the observed lip once.
 const aperture=`<path d="M1290 742L1360 772L1290 873L1225 835Z" fill="#152128"/>
 <path d="M1232 834L1286 867L1287 879L1225 863Z" fill="#7d8588" stroke="#303e45" stroke-width="2"/>
 <path d="M1225 863L1287 879L1289 892L1224 891L1200 873L1211 829L1232 807L1234 833Z" fill="url(#foot)" stroke="#27343b" stroke-width="2"/>
 <path d="M1225 883L1287 886" fill="none" stroke="#9ba2a2" stroke-opacity=".45" stroke-width="2"/>`;
 const body=shape==='compact-wedge'?`
 <path d="M1216 891L1289 896L1577 848L1584 838L1581 720L1501 686L1285 750L1206 812L1194 867Z" fill="#16242d" stroke="#101b22" stroke-width="3"/>
 <path d="M1288 884L1351 779L1577 716L1577 834L1290 884Z" fill="url(#metal)"/>
 <path d="M1291 748L1500 689L1577 716L1351 779Z" fill="url(#trough)" stroke="#81979e" stroke-width="4"/>
 <path d="M1300 751L1497 697L1563 720L1351 773Z" fill="#18252b"/>
 <path d="M1310 754L1500 706L1522 722L1345 771Z" fill="#54646a"/>
 <path d="M1359 795L1564 740L1564 824L1306 870Z" fill="#304b58" opacity=".6"/>
 <path d="M1335 857L1559 817" stroke="#bd9a5d" stroke-width="3"/>
 <path d="M1289 889L1575 840" stroke="#788b91" stroke-width="3"/>
 <path d="M1203 815L1287 751L1280 771L1218 820L1211 860L1200 869Z" fill="#495b62"/>`:`
 <path d="M1200 869Q1202 889 1225 895L1289 896L1527 855Q1555 850 1563 830L1553 744Q1551 716 1529 706L1451 682Q1434 677 1416 686L1287 750L1212 810Z" fill="#242f32" stroke="#182327" stroke-width="3"/>
 <path d="M1289 886L1352 780L1460 711Q1481 699 1502 710L1535 728Q1546 735 1547 754L1551 822Q1551 837 1528 843L1290 886Z" fill="url(#ceramic)"/>
 <path d="M1290 750L1425 686Q1440 680 1454 686L1524 710Q1537 715 1539 727L1352 780Z" fill="#6d7b7e"/>
 <path d="M1305 751L1429 695Q1440 690 1453 695L1518 716L1350 772Z" fill="#18272d"/>
 <path d="M1321 756L1446 707L1488 721L1350 769Z" fill="#596b72"/>
 <path d="M1319 861L1514 826Q1534 821 1533 806" fill="none" stroke="#ac8951" stroke-width="3"/>
 <path d="M1206 816L1286 753L1276 777L1222 821L1211 860L1200 871Z" fill="#6c7a7c"/>
 <path d="M1292 888L1529 847" stroke="#a9b0a8" stroke-width="3"/>`;
 const shadow=shape==='compact-wedge'?'M1194 892Q1220 910 1290 906L1587 853Q1592 846 1577 842L1287 888Z':'M1196 892Q1220 909 1290 906L1549 860Q1564 854 1537 847L1287 888Z';
 return`<svg xmlns="http://www.w3.org/2000/svg" width="1762" height="1174" viewBox="0 0 1762 1174"><defs>
 <linearGradient id="metal" x1="0" y1="0" x2=".2" y2="1"><stop stop-color="#73919d"/><stop offset=".48" stop-color="#44606d"/><stop offset="1" stop-color="#243b47"/></linearGradient>
 <linearGradient id="ceramic" x1="0" y1="0" x2=".1" y2="1"><stop stop-color="#ede2c5"/><stop offset=".48" stop-color="#c8bfa7"/><stop offset="1" stop-color="#a79f8d"/></linearGradient>
 <linearGradient id="trough" x2="0" y2="1"><stop stop-color="#71868d"/><stop offset="1" stop-color="#283b44"/></linearGradient>
 <linearGradient id="foot" x2="0" y2="1"><stop stop-color="#6b7a7d"/><stop offset="1" stop-color="#24363d"/></linearGradient>
 <filter id="soft"><feGaussianBlur stdDeviation="3"/></filter></defs>
 <path d="${shadow}" fill="#000" opacity=".26" filter="url(#soft)"/>${body}${aperture}</svg>`;
}
const vec=(p:Point)=>`vec2(${p[0]}.0,${p[1]}.0)`;
const edges=PAMELA_SHOE_GEOMETRY.removalHull.map((p,i)=>{const q=PAMELA_SHOE_GEOMETRY.removalHull[(i+1)%PAMELA_SHOE_GEOMETRY.removalHull.length];return`shoeGeoCross(p,${vec(p)},${vec(q)})`;});
/** Set enable only after source hash/dimensions match. Source p uses top-left
 * native pixels. Multiply SOURCE alpha by (1-removal), never the geometry alpha.
 * Render generated PNG with the same dealerProjectionMesh behind source video.
 */
export const PAMELA_SHOE_GEOMETRY_GLSL=`
float shoeGeoCross(vec2 p,vec2 a,vec2 b){return((a.y>p.y)!=(b.y>p.y))&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x?1.0:0.0;}
float pamelaShoeGeometryRemoval(vec3 sourceColor,vec2 p,float enabled,float paperProtection){
 if(enabled<.5||p.x<1175.0||p.x>1705.0||p.y<620.0||p.y>915.0)return 0.0;
 float crosses=${edges.join('+')};if(mod(crosses,2.0)<.5)return 0.0;
 float collar=${PAMELA_SHOE_GEOMETRY.sourceContactInsert.map((p,i)=>`shoeGeoCross(p,${vec(p)},${vec(PAMELA_SHOE_GEOMETRY.sourceContactInsert[(i+1)%4])})`).join('+')};
 if(paperProtection>0.0||mod(collar,2.0)>.5)return 0.0;
 vec3 c=sourceColor*255.0;bool warm=c.r>65.0&&c.r-c.g>7.0&&c.r-c.b>17.0;
 bool pale=min(c.r,c.b)>115.0&&abs(c.r-c.b)<67.0&&c.g>min(c.r,c.b)-15.0;
 bool hand=p.x>1220.0&&p.x<1380.0&&p.y>690.0&&p.y<800.0;
 float mouth=${PAMELA_SHOE_GEOMETRY.aperture.map((p,i)=>`shoeGeoCross(p,${vec(p)},${vec(PAMELA_SHOE_GEOMETRY.aperture[(i+1)%4])})`).join('+')};
 bool paper=mod(mouth,2.0)>.5||(p.x>1215.0&&p.x<1365.0&&p.y>690.0&&p.y<784.0);
 return(hand&&warm)||(paper&&pale)?0.0:1.0;
}`;
