/** Source-bound shoe SHELL material study. No recovered 3D, silhouette removal or game state.
 * Work in native top-left pixels and unmodified source sRGB, before linear conversion.
 * The outlet, rim, moving card, hand and source contact geometry remain authoritative.
 */
export type PamelaShoeVariant = 'source' | 'obsidian-brass' | 'ivory-bronze' | 'walnut';
type Point = readonly [number, number];
type Face = {name: string; points: readonly Point[]; weight: number};
export const PAMELA_SHOE_VARIANTS = [
  {id:'source',label:'Källsko',shaderIndex:0},
  {id:'obsidian-brass',label:'Obsidian / mässing',shaderIndex:1},
  {id:'ivory-bronze',label:'Elfenben / brons',shaderIndex:2},
  {id:'walnut',label:'Valnöt / mässing',shaderIndex:3},
] as const;
export const PAMELA_SHOE_CALIBRATION = {
  id:'pamela-C1-P4-shoe-shell-v1',project:'snyggare-dealer',dealerId:'pamela',selectionId:'C1-P4',
  source:'runs/20261109-pamela-seat-bank/batches/middle-end-card-v1/original/pamela-seat-4-wan3-end-card-v1.mp4',
  sourceSha256:'4e252be2235ce42cec5de9d49b993d0ffed1c029de9890faea6686f46824f87c',
  width:1762,height:1174,fps:30,frames:360,
  roi:{left:1190,top:637,width:501,height:261},
  outlet:[[1290,756],[1342,778],[1285,860],[1239,832]] as readonly Point[],
  contactAnchor:[1435,892] as Point,
  geometry:'Authored native-image shell faces; unchanged source silhouette and outlet. Not recovered depth.',
  limitations:[
    'Only the visible opaque outer shell material is replaceable; source rim, outlet and interior stay.',
    'No whole-shoe removal, shape substitution, new viewpoint or physical relighting.',
    'Calibration and all-frame protected-pixel proof apply only to the exact C1-P4 source hash.',
    'Color guards are conservative diagnostics. Zero changed guard pixels does not validate anatomical masks.',
    'Source shading and source/table contact are retained; no second contact shadow is added.',
  ],
} as const;

/** Insets leave the observed rim/outlet intact, rather than guessing the hidden body. */
export const PAMELA_SHOE_SHELL_FACES:readonly Face[] = [
  {name:'outer-panel',points:[[1357,782],[1680,685],[1680,816],[1298,878]],weight:1},
  {name:'base-trim',points:[[1290,885],[1680,824],[1680,829],[1289,892]],weight:.44},
  {name:'front-foot',points:[[1206,871],[1228,883],[1282,883],[1282,891],[1226,890]],weight:.55},
];
const clamp=(n:number,lo=0,hi=1)=>Math.max(lo,Math.min(hi,n));
function faceCoverage(x:number,y:number,face:Face){
  // Convex polygon inward distance: same expression is emitted into the GLSL.
  let distance=Infinity;
  for(let n=0;n<face.points.length;n++){
    const a=face.points[n],b=face.points[(n+1)%face.points.length];
    distance=Math.min(distance,((b[0]-a[0])*(y-a[1])-(b[1]-a[1])*(x-a[0]))/Math.hypot(b[0]-a[0],b[1]-a[1]));
  }
  return clamp(distance/1.5)*face.weight;
}
function skinOrPaper(r:number,g:number,b:number){
  return (r>65&&r>g*1.10&&r>b*1.18)||Math.max(r,g,b)>126||g-Math.max(r,b)>18;
}
export function isPamelaShoeSource(sha256:string,width:number,height:number){
  return sha256===PAMELA_SHOE_CALIBRATION.sourceSha256&&width===1762&&height===1174;
}
export type PamelaShoeFrameInput = {
  sourceRgb:Uint8Array;width:number;height:number;sourceSha256:string;sourceFrame:number;
  variant:PamelaShoeVariant;visiblePaperMask?:Uint8Array;handMask?:Uint8Array;shoePaperMask?:Uint8Array;
};
/** Packed RGBA replacement and one-channel coverage; compose over the unchanged source.
 * The return values never alter source alpha. Optional semantic masks only protect more pixels.
 */
export function createPamelaShoeLayerFrame(input:PamelaShoeFrameInput){
  const {sourceRgb,width,height,sourceFrame,variant}=input,count=width*height;
  if(!isPamelaShoeSource(input.sourceSha256,width,height))throw Error('Shoe calibration/source mismatch');
  if(sourceRgb.length!==count*3)throw Error('Shoe layer requires native packed RGB24');
  if(!Number.isInteger(sourceFrame)||sourceFrame<0||sourceFrame>=360)throw Error('Shoe frame outside bound source');
  if(!PAMELA_SHOE_VARIANTS.some(v=>v.id===variant))throw Error('Unknown shoe material');
  for(const mask of [input.visiblePaperMask,input.handMask,input.shoePaperMask])if(mask&&mask.length!==count)throw Error('Shoe protection mask must have one native channel');
  const rgba=new Uint8Array(count*4),replaceAlpha=new Uint8Array(count);
  const diagnostics={shellPixels:0,protectedPixels:0,changedProtectedPixels:0,geometryChanged:false,wholeShoeReplaced:false,semanticMasksProvided:!!(input.visiblePaperMask&&input.handMask&&input.shoePaperMask)};
  if(variant==='source')return {rgba,replaceAlpha,diagnostics};
  const base=variant==='obsidian-brass'?[39,51,67]:variant==='ivory-bronze'?[207,194,169]:[111,65,37];
  const trim=variant==='ivory-bronze'?[116,80,44]:[173,135,71];
  const roi=PAMELA_SHOE_CALIBRATION.roi;
  for(let y=roi.top;y<roi.top+roi.height;y++)for(let x=roi.left;x<roi.left+roi.width;x++){
    const p=y*width+x,i=p*3,r=sourceRgb[i],g=sourceRgb[i+1],b=sourceRgb[i+2];
    let coverage=0;for(const face of PAMELA_SHOE_SHELL_FACES)coverage=Math.max(coverage,faceCoverage(x+.5,y+.5,face));
    if(!coverage)continue;
    if(input.visiblePaperMask?.[p]||input.handMask?.[p]||input.shoePaperMask?.[p]||skinOrPaper(r,g,b)){diagnostics.protectedPixels++;continue;}
    const u=(x-1298)/382,v=(y-(782-(x-1357)*97/323))/(878-(x-1298)*62/382-(782-(x-1357)*97/323));
    const luminance=(r*.2126+g*.7152+b*.0722),light=clamp(.39+luminance/92,.42,1.05);
    const grain=variant==='walnut'?1+.075*Math.sin(u*125+Math.sin(v*12)*1.8)+.025*Math.sin(u*384+v*11):1;
    const stripe=v>.78&&v<.80&&u>.2&&u<.92;
    for(let c=0;c<3;c++)rgba[p*4+c]=Math.round(clamp((stripe?trim[c]:base[c])*light*grain,0,255));
    const a=Math.round(coverage*255);replaceAlpha[p]=a;rgba[p*4+3]=a;diagnostics.shellPixels++;
  }
  return {rgba,replaceAlpha,diagnostics};
}
export function applyPamelaShoeLayerRgb(input:PamelaShoeFrameInput){
  const layer=createPamelaShoeLayerFrame(input),rgb=new Uint8Array(input.sourceRgb);
  const roi=PAMELA_SHOE_CALIBRATION.roi;
  for(let y=roi.top;y<roi.top+roi.height;y++)for(let x=roi.left;x<roi.left+roi.width;x++){
    const p=y*input.width+x,a=layer.replaceAlpha[p]/255;if(!a)continue;
    for(let c=0;c<3;c++)rgb[p*3+c]=Math.round(rgb[p*3+c]*(1-a)+layer.rgba[p*4+c]*a);
  }
  return {rgb,diagnostics:layer.diagnostics};
}

const glNumber=(v:number)=>Number.isInteger(v)?`${v}.0`:String(v);
const glPoint=(p:Point)=>`vec2(${p.map(glNumber).join(',')})`;
const glFaces=PAMELA_SHOE_SHELL_FACES.map(face=>{
  const edges=face.points.map((a,n)=>`shoeEdge(p,${glPoint(a)},${glPoint(face.points[(n+1)%face.points.length])})`);
  const min=edges.reduce((a,b)=>`min(${a},${b})`);
  return `coverage=max(coverage,clamp(${min}/1.5,0.0,1.0)*${glNumber(face.weight)});`;
}).join('\n');
/** Set style=0 unless isPamelaShoeSource() passed. p=(uv.x*1762,(1-uv.y)*1174).
 * Call AFTER computing alpha/despill from original c and BEFORE sRGB -> linear.
 * protectedCoverage is max(hand,paper,next-shoe-paper); 0 enables the conservative
 * color-only fallback. The proof reports fallback overlap against the frozen masks.
 * GLSL keeps source alpha unchanged. CPU rounding differs by <=1 sRGB byte.
 */
export const PAMELA_SHOE_FRAGMENT_GLSL=`
float shoeEdge(vec2 p,vec2 a,vec2 b){vec2 e=b-a;return(e.x*(p.y-a.y)-e.y*(p.x-a.x))/length(e);}
vec3 pamelaShoeMaterial(vec3 sourceColor,vec2 p,float style,float protectedCoverage){
 if(style<0.5||protectedCoverage>0.0||p.x<1190.0||p.x>1691.0||p.y<637.0||p.y>898.0)return sourceColor;
 vec3 c=sourceColor*255.0;
 if((c.r>65.0&&c.r>c.g*1.10&&c.r>c.b*1.18)||max(c.r,max(c.g,c.b))>126.0||c.g-max(c.r,c.b)>18.0)return sourceColor;
 float coverage=0.0;
 ${glFaces}
 if(coverage<=0.0)return sourceColor;
 float u=(p.x-1298.0)/382.0;
 float v=(p.y-(782.0-(p.x-1357.0)*97.0/323.0))/(878.0-(p.x-1298.0)*62.0/382.0-(782.0-(p.x-1357.0)*97.0/323.0));
 float light=clamp(.39+dot(c,vec3(.2126,.7152,.0722))/92.0,.42,1.05);
 vec3 base=style<1.5?vec3(39.0,51.0,67.0):(style<2.5?vec3(207.0,194.0,169.0):vec3(111.0,65.0,37.0));
 vec3 trim=style>1.5&&style<2.5?vec3(116.0,80.0,44.0):vec3(173.0,135.0,71.0);
 float grain=style>2.5?1.0+.075*sin(u*125.0+sin(v*12.0)*1.8)+.025*sin(u*384.0+v*11.0):1.0;
 vec3 paint=(v>.78&&v<.80&&u>.2&&u<.92)?trim:base;
 return mix(sourceColor,clamp(paint*light*grain,0.0,255.0)/255.0,coverage);
}`;
