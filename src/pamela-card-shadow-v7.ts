import {buildPamelaCardShadow,type PamelaCardShadowOptions,type PamelaCardShadow} from './pamela-card-shadow.ts';

/** The upper paper casts a small contact shadow only onto the lower paper.
 * No table shadow is generated here. Apply this once before painting the upper
 * card; do not call the generic shadow helper for the lower card in this profile.
 * The source paper, hand lighting and original contact pass remain unchanged.
 */
export const PAMELA_CARD_OVERLAP_SHADOW_DEFAULTS=Object.freeze({sigma:2,offsetX:-.6,offsetY:.75,opacity:.12});
export function buildPamelaCardOverlapShadow(upperPaper:Uint8Array,lowerPaper:Uint8Array,width:number,height:number,options:PamelaCardShadowOptions={}):PamelaCardShadow{
  if(lowerPaper.length!==width*height)throw Error('Receiving paper mask dimensions differ');
  const shadow=buildPamelaCardShadow(upperPaper,width,height,{...PAMELA_CARD_OVERLAP_SHADOW_DEFAULTS,...options});
  const {alpha}=shadow;
  let left=width,top=height,right=-1,bottom=-1,pixels=0,alphaSum=0,maxAlpha=0;
  if(shadow.bounds)for(let y:number=shadow.bounds.top;y<=shadow.bounds.bottom;y++)for(let x:number=shadow.bounds.left;x<=shadow.bounds.right;x++){
    const p=y*width+x,a=alpha[p]*(lowerPaper[p]/255);
    alpha[p]=a<1/1024?0:a;if(alpha[p]===0)continue;
    pixels++;alphaSum+=alpha[p];maxAlpha=Math.max(maxAlpha,alpha[p]);
    left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);
  }
  return {...shadow,bounds:pixels?{left,top,right,bottom}:null,diagnostics:{...shadow.diagnostics,pixels,alphaSum,maxAlpha}};
}
