'use client';
import {useEffect,useRef,useState} from 'react';
import {PAMELA_CARD_ATLAS_GLSL} from './pamela-card-atlas.ts';
import {resolvePamelaShoeBankShaderBinding} from './pamela-shoe-bank-shader.ts';
import type {PamelaShoeBankIdentity} from './pamela-shoe-bank-profile.ts';

type FileRef={path:string;sha256:string};
type Bounds={left:number;top:number;width:number;height:number};
export type ShoeGpuReviewCase={
  identity:PamelaShoeBankIdentity;paperAtlasSha256:string;proofSha256:string;
  pages:Array<FileRef&{width:number;height:number}>;
  frames:Array<{frame:number;source:FileRef;sourceRgbSha256:string;expectedRemoval:FileRef;paperCoverageSha256:string;cards:Array<{bounds:Bounds;atlas:Bounds&{page:number}}>}>;
};
type CaseStats={clipId:string;frames:number;sourceRgbReadbacks:number;paperCoverageChecks:number;comparedPixels:number;overRemoval:number;underRemoval:number;malformedPixels:number};
type Result={status:'passed'|'failed';scope:string;videoDecoderVerified:false;precisionBits:number;elapsedMs:number;cases:CaseStats[];negativeDraws:number;negativeNonzeroPixels:number;sourcePngHashes:number;cpuMaskHashes:number;atlasPageHashes:number;failures:unknown[];code:FileRef[];proofs:Array<{clipId:string;proofSha256:string;paperAtlasSha256:string;frames:number[]}>;error?:string};
const WIDTH=1762,HEIGHT=1174,PIXELS=WIDTH*HEIGHT;
const fileUrl=(path:string)=>{
  if(!path.startsWith('runs/')||path.split('/').some(p=>p==='..'))throw Error('Unexpected local GPU fixture path');
  return '/files/'+path.split('/').map(encodeURIComponent).join('/');
};
const hex=(b:ArrayBuffer)=>Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('');
async function sha(bytes:Uint8Array|ArrayBuffer){
  const input=bytes instanceof Uint8Array?Uint8Array.from(bytes).buffer:bytes;
  return hex(await crypto.subtle.digest('SHA-256',input));
}
const tick=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));

async function runGpuReview(cases:ShoeGpuReviewCase[],code:FileRef[],signal:AbortSignal,progress:(message:string)=>void):Promise<Result>{
  const expectedFrames=cases.reduce((n,c)=>n+c.frames.length,0),expectedNegativeDraws=cases.length+2;
  const start=performance.now(),result:Result={status:'failed',scope:'WebGL2 readPixels: native PNG source, audited paper atlas, frozen CPU removal',videoDecoderVerified:false,precisionBits:0,elapsedMs:0,cases:[],negativeDraws:0,negativeNonzeroPixels:0,sourcePngHashes:0,cpuMaskHashes:0,atlasPageHashes:0,failures:[],code,proofs:cases.map(c=>({clipId:c.identity.clipId,proofSha256:c.proofSha256,paperAtlasSha256:c.paperAtlasSha256,frames:c.frames.map(f=>f.frame)}))};
  const canvas=document.createElement('canvas');canvas.width=WIDTH;canvas.height=HEIGHT;
  const gl=canvas.getContext('webgl2',{alpha:false,antialias:false,depth:false,stencil:false,premultipliedAlpha:false,preserveDrawingBuffer:false,powerPreference:'low-power'});
  if(!gl)return{...result,error:'WebGL2 saknas; ingen GPU-mask verifierad.'};
  const textures=new Set<WebGLTexture>(),programs=new Set<WebGLProgram>(),shaders=new Set<WebGLShader>();
  let framebuffer:WebGLFramebuffer|null=null,buffer:WebGLBuffer|null=null,vao:WebGLVertexArrayObject|null=null;
  function alive(){if(signal.aborted)throw new DOMException('GPU-kontrollen avbröts','AbortError');if(gl!.isContextLost())throw Error('WebGL-kontexten förlorades');}
  function check(stage:string){const error=gl!.getError();if(error!==gl!.NO_ERROR)throw Error(`${stage}: WebGL-fel ${error}`);}
  const vertex=`#version 300 es
layout(location=0) in vec2 position;void main(){gl_Position=vec4(position,0.0,1.0);}`;
  function program(fragment:string){
    function compile(type:number,source:string){const shader=gl!.createShader(type);if(!shader)throw Error('Shader allocation failed');shaders.add(shader);gl!.shaderSource(shader,source);gl!.compileShader(shader);if(!gl!.getShaderParameter(shader,gl!.COMPILE_STATUS))throw Error('Shader compile: '+gl!.getShaderInfoLog(shader));return shader;}
    const p=gl!.createProgram();if(!p)throw Error('Program allocation failed');programs.add(p);gl!.attachShader(p,compile(gl!.VERTEX_SHADER,vertex));gl!.attachShader(p,compile(gl!.FRAGMENT_SHADER,fragment));gl!.linkProgram(p);if(!gl!.getProgramParameter(p,gl!.LINK_STATUS))throw Error('Shader link: '+gl!.getProgramInfoLog(p));return p;
  }
  function texture(width:number,height:number,data:Uint8Array|ImageBitmap|null){
    const t=gl!.createTexture();if(!t)throw Error('Texture allocation failed');textures.add(t);gl!.bindTexture(gl!.TEXTURE_2D,t);
    gl!.texParameteri(gl!.TEXTURE_2D,gl!.TEXTURE_MIN_FILTER,gl!.NEAREST);gl!.texParameteri(gl!.TEXTURE_2D,gl!.TEXTURE_MAG_FILTER,gl!.NEAREST);gl!.texParameteri(gl!.TEXTURE_2D,gl!.TEXTURE_WRAP_S,gl!.CLAMP_TO_EDGE);gl!.texParameteri(gl!.TEXTURE_2D,gl!.TEXTURE_WRAP_T,gl!.CLAMP_TO_EDGE);
    if(data instanceof ImageBitmap)gl!.texImage2D(gl!.TEXTURE_2D,0,gl!.RGBA8,gl!.RGBA,gl!.UNSIGNED_BYTE,data);
    else gl!.texImage2D(gl!.TEXTURE_2D,0,gl!.RGBA8,width,height,0,gl!.RGBA,gl!.UNSIGNED_BYTE,data);
    return t;
  }
  function disposeTexture(t:WebGLTexture){gl!.deleteTexture(t);textures.delete(t);}
  async function bytes(ref:FileRef){
    alive();const response=await fetch(fileUrl(ref.path),{cache:'no-store',signal});if(!response.ok)throw Error(`Fixture HTTP ${response.status}: ${ref.path}`);
    const b=await response.arrayBuffer();if(await sha(b)!==ref.sha256)throw Error(`Fixture hash mismatch: ${ref.path}`);return b;
  }
  async function decoded(bytes:ArrayBuffer,width:number,height:number){
    const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/png'}),{colorSpaceConversion:'none',premultiplyAlpha:'none',imageOrientation:'none'});
    try{if(bitmap.width!==width||bitmap.height!==height)throw Error('PNG dimensions differ from frozen evidence');const c=document.createElement('canvas');c.width=width;c.height=height;const ctx=c.getContext('2d',{willReadFrequently:true,colorSpace:'srgb'});if(!ctx)throw Error('PNG mask decoder unavailable');ctx.drawImage(bitmap,0,0);return ctx.getImageData(0,0,width,height).data;}finally{bitmap.close();}
  }
  const maskFragment=(glsl:string)=>`#version 300 es
precision highp float;precision highp int;precision highp sampler2D;
#define texture2D texture
uniform sampler2D originalFrame;uniform float enabled;
${PAMELA_CARD_ATLAS_GLSL}
${glsl}
out vec4 outputColor;
void main(){vec2 pixel=vec2(gl_FragCoord.x,1174.0-gl_FragCoord.y);
float paper=max(paperMask(cardMask0,pixel,cardBounds0,cardAtlas0,cardPageSize0),paperMask(cardMask1,pixel,cardBounds1,cardAtlas1,cardPageSize1));
float removal=pamelaShoeBankRemovalFromTexture(originalFrame,pixel,enabled,paper);outputColor=vec4(vec3(removal),1.0);}`;
  const readback=new Uint8Array(PIXELS*4);
  function draw(p:WebGLProgram,source:WebGLTexture,pages:WebGLTexture[],c:ShoeGpuReviewCase,row:ShoeGpuReviewCase['frames'][number],enabled=1){
    alive();gl!.useProgram(p);gl!.activeTexture(gl!.TEXTURE0);gl!.bindTexture(gl!.TEXTURE_2D,source);gl!.uniform1i(gl!.getUniformLocation(p,'originalFrame'),0);gl!.uniform1f(gl!.getUniformLocation(p,'enabled'),enabled);
    for(let i=0;i<2;i++){const card=row.cards[i],page=c.pages[card.atlas.page];gl!.activeTexture(gl!.TEXTURE1+i);gl!.bindTexture(gl!.TEXTURE_2D,pages[card.atlas.page]);gl!.uniform1i(gl!.getUniformLocation(p,`cardMask${i}`),i+1);gl!.uniform4f(gl!.getUniformLocation(p,`cardBounds${i}`),card.bounds.left,card.bounds.top,card.bounds.width,card.bounds.height);gl!.uniform4f(gl!.getUniformLocation(p,`cardAtlas${i}`),card.atlas.left,card.atlas.top,card.atlas.width,card.atlas.height);gl!.uniform2f(gl!.getUniformLocation(p,`cardPageSize${i}`),page.width,page.height);}
    gl!.drawArrays(gl!.TRIANGLES,0,3);gl!.readPixels(0,0,WIDTH,HEIGHT,gl!.RGBA,gl!.UNSIGNED_BYTE,readback);check('draw/readPixels');
  }
  function negativePixels(){let count=0;for(let p=0;p<PIXELS;p++)if(readback[p*4]!==0||readback[p*4+1]!==0||readback[p*4+2]!==0||readback[p*4+3]!==255)count++;return count;}
  try{
    result.precisionBits=gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER,gl.HIGH_FLOAT)?.precision??0;if(result.precisionBits<23)throw Error('Highp float32 krävs för native texelparitet');
    if(gl.getParameter(gl.MAX_TEXTURE_SIZE)<4096)throw Error('GPU atlas dimension unsupported');
    gl.disable(gl.BLEND);gl.disable(gl.DITHER);gl.disable(gl.DEPTH_TEST);gl.disable(gl.STENCIL_TEST);gl.disable(gl.SCISSOR_TEST);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);gl.pixelStorei(gl.PACK_ALIGNMENT,1);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,gl.NONE);
    vao=gl.createVertexArray();gl.bindVertexArray(vao);buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
    framebuffer=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);const target=texture(WIDTH,HEIGHT,null);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,target,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('RGBA8 framebuffer incomplete');gl.drawBuffers([gl.COLOR_ATTACHMENT0]);gl.viewport(0,0,WIDTH,HEIGHT);
    const echo=program(`#version 300 es
precision highp float;precision highp sampler2D;uniform sampler2D originalFrame;out vec4 outputColor;
void main(){outputColor=vec4(texture(originalFrame,gl_FragCoord.xy/vec2(1762.0,1174.0)).rgb,1.0);}`);
    let done=0;
    for(const c of cases){
      const binding=resolvePamelaShoeBankShaderBinding({identity:c.identity,paperAtlasSha256:c.paperAtlasSha256});if(!binding.enabled)throw Error('GPU fixture identity/atlas is not enabled');
      const maskProgram=program(maskFragment(binding.glsl)),pages:WebGLTexture[]=[],pageGray:Uint8Array[]=[];
      const stats:CaseStats={clipId:c.identity.clipId,frames:0,sourceRgbReadbacks:0,paperCoverageChecks:0,comparedPixels:0,overRemoval:0,underRemoval:0,malformedPixels:0};result.cases.push(stats);
      for(const page of c.pages){const rgba=await decoded(await bytes(page),page.width,page.height),gray=new Uint8Array(page.width*page.height);for(let p=0;p<gray.length;p++){if(rgba[p*4]!==rgba[p*4+1]||rgba[p*4]!==rgba[p*4+2]||rgba[p*4+3]!==255)throw Error('Atlas is not opaque grayscale');gray[p]=rgba[p*4];}pageGray.push(gray);pages.push(texture(page.width,page.height,new Uint8Array(rgba)));result.atlasPageHashes++;}
      for(const row of c.frames){
        alive();progress(`${c.identity.clipId} · ruta ${row.frame} · ${done}/${expectedFrames} kontrollerade`);await tick();
        const png=await bytes(row.source);result.sourcePngHashes++;
        // ImageBitmap owns the flip. WebGL's UNPACK_FLIP_Y is ignored for an
        // ImageBitmap, so never rely on it to match the VideoTexture UV contract.
        const bitmap=await createImageBitmap(new Blob([png],{type:'image/png'}),{colorSpaceConversion:'none',premultiplyAlpha:'none',imageOrientation:'flipY'});
        let source:WebGLTexture;
        try{if(bitmap.width!==WIDTH||bitmap.height!==HEIGHT)throw Error('Native source PNG dimensions mismatch');source=texture(WIDTH,HEIGHT,bitmap);}finally{bitmap.close();}
        try{
          const expectedRgba=await decoded(await bytes(row.expectedRemoval),WIDTH,HEIGHT);result.cpuMaskHashes++;
          const expected=new Uint8Array(PIXELS);for(let p=0;p<PIXELS;p++){const v=expectedRgba[p*4];if((v!==0&&v!==255)||expectedRgba[p*4+1]!==v||expectedRgba[p*4+2]!==v||expectedRgba[p*4+3]!==255)throw Error('Frozen CPU removal is not binary grayscale');expected[p]=v;}
          const paper=new Uint8Array(PIXELS);for(const card of row.cards){const data=pageGray[card.atlas.page],page=c.pages[card.atlas.page];for(let y=0;y<card.bounds.height;y++)for(let x=0;x<card.bounds.width;x++){const p=(card.bounds.top+y)*WIDTH+card.bounds.left+x;paper[p]=Math.max(paper[p],data[(card.atlas.top+y)*page.width+card.atlas.left+x]);}}
          if(await sha(paper)!==row.paperCoverageSha256)throw Error(`Browser paper decode differs from CPU: ${c.identity.clipId} f${row.frame}`);stats.paperCoverageChecks++;
          draw(echo,source,pages,c,row);
          const sourceRgb=new Uint8Array(PIXELS*3);for(let y=0;y<HEIGHT;y++)for(let x=0;x<WIDTH;x++){const from=((HEIGHT-1-y)*WIDTH+x)*4,to=(y*WIDTH+x)*3;sourceRgb[to]=readback[from];sourceRgb[to+1]=readback[from+1];sourceRgb[to+2]=readback[from+2];}
          const echoedHash=await sha(sourceRgb);if(echoedHash!==row.sourceRgbSha256)throw Error(`GPU PNG upload/readback differs from frozen RGB: ${c.identity.clipId} f${row.frame}; observed ${echoedHash}, expected ${row.sourceRgbSha256}`);stats.sourceRgbReadbacks++;
          draw(maskProgram,source,pages,c,row);
          for(let y=0;y<HEIGHT;y++)for(let x=0;x<WIDTH;x++){
            const p=y*WIDTH+x,k=((HEIGHT-1-y)*WIDTH+x)*4,actual=readback[k],want=expected[p];
            if((actual!==0&&actual!==255)||readback[k+1]!==actual||readback[k+2]!==actual||readback[k+3]!==255)stats.malformedPixels++;
            if(actual!==want){if(actual>want)stats.overRemoval++;else stats.underRemoval++;if(result.failures.length<5)result.failures.push({clip:c.identity.clipId,frame:row.frame,x,y,actual,expected:want});}
          }
          stats.comparedPixels+=PIXELS;stats.frames++;done++;
          if(row===c.frames[0]){draw(maskProgram,source,pages,c,row,0);result.negativeDraws++;result.negativeNonzeroPixels+=negativePixels();}
          if(done===1){
            for(const invalid of [{identity:{...c.identity,sourceSha256:'0'.repeat(64)},paperAtlasSha256:c.paperAtlasSha256},{identity:c.identity,paperAtlasSha256:'f'.repeat(64)}]){
              const denied=resolvePamelaShoeBankShaderBinding(invalid);if(denied.enabled)throw Error('Invalid GPU identity unexpectedly enabled');const inert=program(maskFragment(denied.glsl));draw(inert,source,pages,c,row,1);result.negativeDraws++;result.negativeNonzeroPixels+=negativePixels();gl.deleteProgram(inert);programs.delete(inert);
            }
          }
        }finally{disposeTexture(source);}
      }
      pages.forEach(disposeTexture);gl.deleteProgram(maskProgram);programs.delete(maskProgram);
    }
    const all=result.cases.reduce((n,c)=>n+c.frames,0);
    result.status=expectedFrames>0&&all===expectedFrames&&result.negativeDraws===expectedNegativeDraws&&result.negativeNonzeroPixels===0&&result.cases.every(c=>c.overRemoval===0&&c.underRemoval===0&&c.malformedPixels===0)?'passed':'failed';
  }catch(error){result.error=error instanceof Error?error.message:String(error);}
  finally{
    for(const p of programs)gl.deleteProgram(p);for(const s of shaders)gl.deleteShader(s);for(const t of textures)gl.deleteTexture(t);if(framebuffer)gl.deleteFramebuffer(framebuffer);if(buffer)gl.deleteBuffer(buffer);if(vao)gl.deleteVertexArray(vao);gl.getExtension('WEBGL_lose_context')?.loseContext();canvas.width=1;canvas.height=1;result.elapsedMs=Math.round(performance.now()-start);
  }
  return result;
}

export default function PamelaShoeGpuReviewClient({cases,code}:{cases:ShoeGpuReviewCase[];code:FileRef[]}){
  const total=cases.reduce((n,c)=>n+c.frames.length,0);
  const [running,setRunning]=useState(false),[status,setStatus]=useState('Inte körd'),[result,setResult]=useState<Result|null>(null),controller=useRef<AbortController|null>(null),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;controller.current?.abort();};},[]);
  async function start(){
    if(running)return;const owned=new AbortController();controller.current=owned;setRunning(true);setResult(null);setStatus('Förbereder verifierade native-PNG-rutor…');
    try{const receipt=await runGpuReview(cases,code,owned.signal,message=>{if(mounted.current)setStatus(message);});if(mounted.current){setResult(receipt);setStatus(receipt.status==='passed'?`GODKÄND · ${total}/${total} rutor · 0 maskskillnader`:'UNDERKÄND · se resultat');}}
    catch(error){if(mounted.current)setStatus('UNDERKÄND · '+(error instanceof Error?error.message:String(error)));}
    finally{if(controller.current===owned)controller.current=null;if(mounted.current)setRunning(false);}
  }
  return <main style={{maxWidth:1000,margin:'0 auto',padding:28,color:'#edf4ef',fontFamily:'Arial,sans-serif'}}>
    <a href="/pamela-prov?view=combined-scene&id=C2-P3" style={{color:'#c6dfc9'}}>← Till den lokala scenen</a>
    <h1>GPU-kontroll av kortskons mask</h1>
    <p>{total} kritiska originalrutor: {cases.map(c=>`${c.identity.clipId} (${c.frames.length})`).join(', ')}. WebGL2 läser tillbaka varje pixel och jämför med frysta CPU-masker.</p>
    <p>Provet använder native PNG, oförändrade atlasmasker och highp. Videodekodning ingår inte.</p>
    <button type="button" onClick={()=>void start()} disabled={running} style={{padding:'12px 20px',fontSize:17,cursor:running?'wait':'pointer'}}>Kör GPU-kontroll</button>
    <p role="status" aria-live="polite" id="shoe-gpu-status" style={{fontWeight:700,marginTop:22}}>{status}</p>
    {result&&<><p>{result.status==='passed'?'Käll-RGB, papperscoverage och GPU-mask matchar de frysta PNG-underlagen.':'Ingen godkänd GPU-paritet lämnas för denna körning.'} Alla egna GPU-resurser har släppts.</p><pre id="shoe-gpu-result" aria-label="GPU-kontrollens resultat" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',background:'#17251d',padding:18,fontSize:12}}>{JSON.stringify(result,null,2)}</pre></>}
  </main>;
}
