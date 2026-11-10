import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {PAMELA_SHOE_BANK_PROFILES} from '../src/pamela-shoe-bank-profile.ts';
import {PAMELA_SHOE_P2_PROFILE} from '../src/pamela-shoe-p2-profile.ts';
import {PAMELA_SHOE_BANK_DISABLED_GLSL,PAMELA_SHOE_BANK_SHADER_IDENTITIES,PAMELA_SHOE_BANK_SHADER_PARITY,resolvePamelaShoeBankShaderBinding} from '../src/pamela-shoe-bank-shader.ts';

const hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const read=async(p:string)=>JSON.parse(await readFile(p,'utf8'));
const full=process.env.PAMELA_SHOE_BANK_PARITY_FRAMES==='all';
// A bounded integration pass can rerun all newly added P2 frames while retaining
// native critical checks and exact emitted-byte baselines for existing P3/P5.
const fullP2=process.env.PAMELA_SHOE_BANK_PARITY_FRAMES==='p2-all';
const profiles=[...PAMELA_SHOE_BANK_PROFILES,PAMELA_SHOE_P2_PROFILE];
sharp.concurrency(1);

test('Shoe shader requires exact project/dealer/clip/source/format AND the audited paper atlas',()=>{
  for(const profile of profiles){
    const valid={identity:profile.identity,paperAtlasSha256:profile.paperAtlas.sha256};
    const binding=resolvePamelaShoeBankShaderBinding(valid);
    assert.equal(binding.enabled,true);
    for(const [field,value]of Object.entries({project:'scoutgaming',dealerId:'goran-scout',clipId:'C2-P4',sourceSha256:'0'.repeat(64),width:1764,height:1175,fps:24,frames:359})){
      const rejected=resolvePamelaShoeBankShaderBinding({...valid,identity:{...profile.identity,[field]:value}});
      assert.deepEqual(rejected,{enabled:false,reason:'unknown-source-identity',glsl:PAMELA_SHOE_BANK_DISABLED_GLSL});
    }
    for(const identity of [undefined,null,{},profile.identity.clipId])assert.equal(resolvePamelaShoeBankShaderBinding({...valid,identity}).enabled,false);
    for(const paperAtlasSha256 of [undefined,null,'',profile.source.sha256,'f'.repeat(64)]){
      const rejected=resolvePamelaShoeBankShaderBinding({...valid,paperAtlasSha256});
      assert.deepEqual(rejected,{enabled:false,reason:'unverified-paper-atlas',glsl:PAMELA_SHOE_BANK_DISABLED_GLSL});
    }
  }
  assert.equal(resolvePamelaShoeBankShaderBinding().enabled,false);
  assert.deepEqual(PAMELA_SHOE_BANK_SHADER_IDENTITIES,profiles.map(p=>p.identity));
  for(const profile of profiles)for(const other of profiles.filter(p=>p.id!==profile.id)){
    assert.equal(resolvePamelaShoeBankShaderBinding({identity:profile.identity,paperAtlasSha256:other.paperAtlas.sha256}).enabled,false,'Another supported clip cannot donate its paper atlas');
    assert.equal(resolvePamelaShoeBankShaderBinding({identity:{...profile.identity,sourceSha256:other.source.sha256},paperAtlasSha256:profile.paperAtlas.sha256}).enabled,false,'Another supported original cannot donate its source hash');
  }
});

test('P3/P5 emitted GLSL remains byte-identical to the pre-P2 integration baseline',()=>{
  // Captured before edits in shader-integration-01/before.json. Both sources
  // intentionally emit the same projection, with separate identity/atlas gates.
  for(const profile of PAMELA_SHOE_BANK_PROFILES){
    const binding=resolvePamelaShoeBankShaderBinding({identity:profile.identity,paperAtlasSha256:profile.paperAtlas.sha256});assert.ok(binding.enabled);
    assert.equal(hash(Buffer.from(binding.glsl)),'a6be9505d099f2ea2edaeae895acc15f757f13da4dc57d1bdf1ee2fe3afe1738');
  }
});

type Vec2={x:number;y:number};type Vec3={r:number;g:number;b:number};
/** Execute the ACTUAL emitted removal body with GLSL-style float32 arithmetic,
 * rather than a second hand-written classification predicate. Only the two
 * vector operations are translated explicitly; polygon constants and branch
 * expressions are taken directly from the emitted shader. This cannot emulate
 * a browser decoder, driver compiler, texture sampler or GPU rasterization. */
function emittedRemoval(glsl:string){
  const match=/float pamelaShoeBankRemoval\(vec3 sourceColor,vec2 pixel,float enabled,float paperProtection\)\{([\s\S]*?)\n\}/.exec(glsl);
  assert.ok(match,'Removal function is missing');
  let body=match[1];
  assert.ok(body.includes('vec2 p=floor(pixel)+vec2(0.5);'));
  body=body.replace('vec2 p=floor(pixel)+vec2(0.5);','const p={x:Math.floor(pixel.x)+0.5,y:Math.floor(pixel.y)+0.5};');
  assert.ok(body.includes('vec3 c=floor(clamp(sourceColor,0.0,1.0)*255.0+0.5);'));
  body=body.replace('vec3 c=floor(clamp(sourceColor,0.0,1.0)*255.0+0.5);','const c=quantize(sourceColor);');
  const points:Vec2[]=[];
  body=body.replace(/vec2\(([\d.]+),([\d.]+)\)/g,(_all,x,y)=>{points.push({x:Number(x),y:Number(y)});return`points[${points.length-1}]`;});
  body=body.replace(/\b(?:float|bool)\s+(\w+)\s*=/g,'const $1=');
  assert.doesNotMatch(body,/\bvec[234]\b/,'Unexpected vector GLSL needs explicit emulation');
  const f=Math.fround;
  const crossing=(p:Vec2,a:Vec2,b:Vec2)=>{
    if((a.y>p.y)===(b.y>p.y))return 0;
    const cross=f(f(f(f(b.x-a.x)*f(p.y-a.y))/f(b.y-a.y))+a.x);
    return p.x<cross?1:0;
  };
  const byte=(v:number)=>Math.floor(f(f(Math.max(0,Math.min(1,v))*255)+.5));
  const quantize=(c:Vec3)=>({r:byte(c.r),g:byte(c.g),b:byte(c.b)});
  const run=new Function('sourceColor','pixel','enabled','paperProtection','points','shoeBankCross','quantize','mod','min','abs',body);
  return (sourceColor:Vec3,pixel:Vec2,enabled=1,paperProtection=0):number=>run(sourceColor,pixel,enabled,paperProtection,points,crossing,quantize,(a:number,b:number)=>a%b,Math.min,Math.abs);
}

test('Shader reads native original texels and cannot erase protected paper or run while disabled',()=>{
 for(const profile of profiles){
  const binding=resolvePamelaShoeBankShaderBinding({identity:profile.identity,paperAtlasSha256:profile.paperAtlas.sha256});
  assert.ok(binding.enabled);
  assert.match(binding.glsl,/texture2D\(originalFrame,vec2\(p.x\/1762.0,1.0-p.y\/1174.0\)\)/);
  assert.match(binding.glsl,/return pamelaShoeBankRemoval\(originalRgb,pixel,enabled,paperProtection\)/);
  assert.doesNotMatch(binding.glsl,/sourceFrame|mediaTime|cardEdge|cardInk|\b98\.0\b|\b88\.0\b/);
  const run=emittedRemoval(binding.glsl),body={x:1500.2,y:800.8},collar={x:1295.2,y:800.8},black={r:0,g:0,b:0};
  assert.equal(run(black,body),1);assert.equal(run(black,collar),0);
  for(const enabled of [0,.5,-1,NaN])assert.equal(run(black,body,enabled),0);
  for(const paper of [1/255,.5,1])assert.equal(run(black,body,1,paper),0,'Even black artwork and one-byte paper coverage must be protected');
  for(const pixel of [{x:NaN,y:800},{x:-1,y:800},{x:1762,y:800},{x:1500,y:1174}])assert.equal(run(black,pixel),0);
  // Every native byte is represented on a real UNORM8 boundary, including the
  // exact thresholds where unrounded float32 RGB multiplication could diverge.
  for(let value=0;value<256;value++){
    const c={r:Math.fround(value/255),g:Math.fround(value/255),b:Math.fround(value/255)};
    assert.equal(run(c,{x:1345.3,y:760.2}),value>110?0:1);
  }
 }
});

for(const profile of profiles)test(`${profile.identity.clipId}: emitted GLSL matches frozen full-semantic CPU removal on ${full||(fullP2&&profile.identity.clipId==='C2-P2')?'all360':'critical native'} frames`,async t=>{
  const parity=PAMELA_SHOE_BANK_SHADER_PARITY.find(p=>p.profileId===profile.id)!;
  const proofBytes=await readFile(parity.evidence.path);assert.equal(hash(proofBytes),parity.evidence.sha256);
  const proof=JSON.parse(proofBytes.toString());assert.deepEqual(profile,proof.profile);
  assert.equal(hash(await readFile('src/pamela-shoe-bank-profile.ts')),proof.code.find((r:any)=>r.path==='src/pamela-shoe-bank-profile.ts').sha256);
  if(profile.identity.clipId==='C2-P2')assert.equal(hash(await readFile('src/pamela-shoe-p2-profile.ts')),proof.code.find((r:any)=>r.path==='src/pamela-shoe-p2-profile.ts').sha256);
  assert.equal(hash(await readFile(profile.source.path)),profile.source.sha256);
  const recordsBytes=await readFile(proof.frameRecords.path);assert.equal(hash(recordsBytes),proof.frameRecords.sha256);const records=JSON.parse(recordsBytes.toString());
  const atlasBytes=await readFile(profile.paperAtlas.path);assert.equal(hash(atlasBytes),parity.paperAtlasSha256);const atlas=JSON.parse(atlasBytes.toString());
  const pages:Buffer[]=[];for(const p of atlas.pages){const b=await readFile(p.path);assert.equal(hash(b),p.sha256);pages.push(await sharp(b).greyscale().raw().toBuffer());}
  const binding=resolvePamelaShoeBankShaderBinding({identity:profile.identity,paperAtlasSha256:hash(atlasBytes)});assert.ok(binding.enabled);const run=emittedRemoval(binding.glsl);
  const critical=profile.identity.clipId==='C2-P2'?[0,28,31,35,40,52,56,60,61,63,64,68,76,180,232,244,248,249,252,253,255,256,259,260,268,284,359]:profile.identity.clipId==='C2-P3'?[0,27,32,38,43,46,52,100,184,188,192,200,218,359]:[0,47,52,60,68,74,80,120,180,210,218,248,252,260,280,359];
  const allFrames=full||(fullP2&&profile.identity.clipId==='C2-P2');
  const frames=allFrames?Array.from({length:360},(_,i)=>i):critical,{width:W,height:H}=profile.identity,roi=profile.roi;
  let compared=0;
  for(const frame of frames){
    const rec=records[frame],src=await readFile(rec.source.path);assert.equal(hash(src),rec.source.sha256);const rgb=await sharp(src).removeAlpha().raw().toBuffer();assert.equal(hash(rgb),rec.sourceRgbSha256);
    const removalBytes=await readFile(rec.removal.path);assert.equal(hash(removalBytes),rec.removal.sha256);const expected=await sharp(removalBytes).greyscale().raw().toBuffer();
    const paper=new Uint8Array(W*H);
    for(const c of atlas.frames[frame].cards){const data=pages[c.atlas.page],page=atlas.pages[c.atlas.page];for(let y=0;y<c.bounds.height;y++)for(let x=0;x<c.bounds.width;x++){const p=(c.bounds.top+y)*W+c.bounds.left+x;paper[p]=Math.max(paper[p],data[(c.atlas.top+y)*page.width+c.atlas.left+x]);}}
    assert.equal(hash(paper),rec.paperCoverageSha256);
    let mismatches=0;const samples:any[]=[],color={r:0,g:0,b:0},pixel={x:0,y:0};
    for(let y=roi.top;y<roi.top+roi.height;y++)for(let x=roi.left;x<roi.left+roi.width;x++){
      const p=y*W+x,k=p*3;color.r=Math.fround(rgb[k]/255);color.g=Math.fround(rgb[k+1]/255);color.b=Math.fround(rgb[k+2]/255);pixel.x=x+.5;pixel.y=y+.5;
      const actual=run(color,pixel,1,paper[p]/255)*255;
      if(actual!==expected[p]){mismatches++;if(samples.length<5)samples.push({x,y,actual,expected:expected[p],paper:paper[p],rgb:[rgb[k],rgb[k+1],rgb[k+2]]});}
      compared++;
    }
    assert.equal(mismatches,0,JSON.stringify({clip:profile.identity.clipId,frame,mismatches,samples}));
    if(allFrames&&frame%90===0)console.log(JSON.stringify({shoeShaderParity:profile.identity.clipId,frame,mismatches}));
  }
  t.diagnostic(JSON.stringify({source:profile.identity.clipId,frames:frames.length,comparedNativeRoiPixels:compared,mismatches:0,semanticMaskSupplied:false,actualGpuVerified:false}));
});
