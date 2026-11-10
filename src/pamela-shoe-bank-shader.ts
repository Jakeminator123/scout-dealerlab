import {
  PAMELA_SHOE_BANK_PROFILES,
  resolvePamelaShoeBankProfile,
  type PamelaShoeBankIdentity,
  type PamelaShoeBankProfile,
} from './pamela-shoe-bank-profile.ts';
import {PAMELA_SHOE_P2_PROFILE,resolvePamelaShoeP2Profile} from './pamela-shoe-p2-profile.ts';

/** Removing raw semantic R/G from the CPU inputs made ZERO pixel differences
 * against the frozen removal masks in all 360 frames of EACH source. This is
 * only established for these exact paper atlases, original RGB and profiles.
 * It does not establish browser video decoding or GPU rasterization parity. */
export const PAMELA_SHOE_BANK_SHADER_PARITY = [
  {
    profileId:'pamela-C2-P2-shoe-bank-v1',
    paperAtlasSha256:'217b58c2b2ba65d705e4e04b96a258646b7fb2802489259b94f3004fa34e32bc',
    evidence:{path:'runs/20261110-pamela-shoe-p2/proof-01/evidence.json',sha256:'9513931d9de5b401e9b265549082a80b404545456cbde53fd0628980113ac634'},
    frames:360,atlasOnlyOverRemoval:0,atlasOnlyUnderRemoval:0,
  },
  {
    profileId:'pamela-C2-P3-shoe-bank-v1',
    paperAtlasSha256:'d6483aa44d78e950199eca20adda2933fe6d09eaf488d34332a4ca73119ce86c',
    evidence:{path:'runs/20261110-pamela-shoe-bank/proof-01-p3/evidence.json',sha256:'f8723db2bca994196bd6a8eb3edd25455e3ad9fa7627c00e6422d85001cd3d7b'},
    frames:360,atlasOnlyOverRemoval:0,atlasOnlyUnderRemoval:0,
  },
  {
    profileId:'pamela-C2-P5-shoe-bank-v1',
    paperAtlasSha256:'149ffbca7f0310f47a3b46b80f11f7e7f40568e2e5760a8bf1b26ebca6d370f3',
    evidence:{path:'runs/20261110-pamela-shoe-bank/proof-01-p5/evidence.json',sha256:'1c33c5a12667b9c6ea9c4fc4929817a0262fa9e498fd0262ce9d1fdb7926b9a5'},
    frames:360,atlasOnlyOverRemoval:0,atlasOnlyUnderRemoval:0,
  },
] as const;

/** Unknown identity/atlas: retain source alpha even if a caller accidentally
 * sets shoeEnabled=1. The caller must ALSO keep the separate body invisible. */
export const PAMELA_SHOE_BANK_DISABLED_GLSL = `
float pamelaShoeBankRemoval(vec3 sourceColor,vec2 pixel,float enabled,float paperProtection){return 0.0;}
float pamelaShoeBankRemovalFromTexture(sampler2D originalFrame,vec2 pixel,float enabled,float paperProtection){return 0.0;}
`;

type ShaderBinding = {
  enabled:true;
  profileId:string;
  identity:PamelaShoeBankIdentity;
  paperAtlasSha256:string;
  glsl:string;
  parity:typeof PAMELA_SHOE_BANK_SHADER_PARITY[number];
}|{
  enabled:false;
  reason:'unknown-source-identity'|'unverified-paper-atlas';
  glsl:typeof PAMELA_SHOE_BANK_DISABLED_GLSL;
};

const scalar=(n:number)=>Number.isInteger(n)?`${n}.0`:String(n);
const vector=(p:readonly[number,number])=>`vec2(${scalar(p[0])},${scalar(p[1])})`;
function crossingSum(points:readonly(readonly[number,number])[]){
  return points.map((p,i)=>`shoeBankCross(p,${vector(p)},${vector(points[(i+1)%points.length])})`).join('+');
}
function shaderFor(profile:PamelaShoeBankProfile){
  const {width,height}=profile.identity,{left,top,width:rw,height:rh}=profile.roi;
  return `
float shoeBankCross(vec2 p,vec2 a,vec2 b){
 if((a.y>p.y)==(b.y>p.y))return 0.0;
 return p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x?1.0:0.0;
}
float pamelaShoeBankRemoval(vec3 sourceColor,vec2 pixel,float enabled,float paperProtection){
 if(!(enabled>0.5))return 0.0;
 if(!(pixel.x>=0.0&&pixel.x<${scalar(width)}&&pixel.y>=0.0&&pixel.y<${scalar(height)}))return 0.0;
 vec2 p=floor(pixel)+vec2(0.5);
 if(p.x<${scalar(left)}||p.x>=${scalar(left+rw)}||p.y<${scalar(top)}||p.y>=${scalar(top+rh)})return 0.0;
 float hullCrosses=${crossingSum(profile.removalHull)};
 if(mod(hullCrosses,2.0)<0.5)return 0.0;
 float collarCrosses=${crossingSum(profile.sourceContactInsert)};
 if(paperProtection>0.0||mod(collarCrosses,2.0)>0.5)return 0.0;
 vec3 c=floor(clamp(sourceColor,0.0,1.0)*255.0+0.5);
 bool warm=c.r>60.0&&c.r-c.g>6.0&&c.r-c.b>16.0;
 bool pale=min(c.r,c.b)>110.0&&abs(c.r-c.b)<65.0&&c.g>min(c.r,c.b)-15.0;
 float skinCrosses=${crossingSum(profile.skinForegroundHull)};
 float paleCrosses=${crossingSum(profile.paleForegroundHull)};
 return (warm&&mod(skinCrosses,2.0)>0.5)||(pale&&mod(paleCrosses,2.0)>0.5)?0.0:1.0;
}
// Source UV is bottom-left; all profile coordinates are top-left native pixels.
// Read the ORIGINAL video at native texel centres, separately from the bilinear
// display colour and card artwork. Round UNORM RGB back to bytes before gates.
float pamelaShoeBankRemovalFromTexture(sampler2D originalFrame,vec2 pixel,float enabled,float paperProtection){
 vec2 p=floor(clamp(pixel,vec2(0.0),vec2(${scalar(width-1)},${scalar(height-1)})))+vec2(0.5);
 vec3 originalRgb=texture2D(originalFrame,vec2(p.x/${scalar(width)},1.0-p.y/${scalar(height)})).rgb;
 return pamelaShoeBankRemoval(originalRgb,pixel,enabled,paperProtection);
}
`;
}

/** Pass a VERIFIED hash of the actual manifest bytes, not a hash guessed from
 * its filename or a JSON reserialization. Its masks must be verified and loaded
 * as nearest/no-mipmap/NoColorSpace/flipY=false by the existing atlas loader.
 * Identity contains project+dealer+clip+source SHA+native geometry+fps+length.
 * Supply max(cardMask0,cardMask1) for the displayed source frame; never derive
 * paper protection from the new artwork or the engine's front permission.
 */
export function resolvePamelaShoeBankShaderBinding(input?:{identity?:unknown;paperAtlasSha256?:unknown}):ShaderBinding{
  const candidate=input?.identity;
  const profile=candidate&&typeof candidate==='object'
    ?resolvePamelaShoeBankProfile(candidate as PamelaShoeBankIdentity)??resolvePamelaShoeP2Profile(candidate):undefined;
  if(!profile)return{enabled:false,reason:'unknown-source-identity',glsl:PAMELA_SHOE_BANK_DISABLED_GLSL};
  const parity=PAMELA_SHOE_BANK_SHADER_PARITY.find(p=>p.profileId===profile.id);
  if(!parity||input?.paperAtlasSha256!==parity.paperAtlasSha256||profile.paperAtlas.sha256!==parity.paperAtlasSha256)
    return{enabled:false,reason:'unverified-paper-atlas',glsl:PAMELA_SHOE_BANK_DISABLED_GLSL};
  return{enabled:true,profileId:profile.id,identity:{...profile.identity},paperAtlasSha256:parity.paperAtlasSha256,glsl:shaderFor(profile),parity};
}

/** Explicit supported identities are useful to a server resolving trusted
 * project context. A clip label alone is never sufficient to enable a shader. */
export const PAMELA_SHOE_BANK_SHADER_IDENTITIES=[...PAMELA_SHOE_BANK_PROFILES,PAMELA_SHOE_P2_PROFILE].map(p=>({...p.identity}));
