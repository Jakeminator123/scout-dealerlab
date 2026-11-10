/** Server-side presentation material. Card values are supplied by the caller;
 * this module does not select, deal, randomize or evaluate game cards. */
import sharp from 'sharp';
export type PaperMaterialLayer={
 slotId:string;coverage:Buffer;guard:Buffer;
 bounds:{left:number;top:number;width:number;height:number};
 uvAt:(x:number,y:number)=>[number,number];
 texture:{rgb:Buffer;width:number;height:number;sha256:string};
};
export async function applyPaperMaterials(source:Buffer,width:number,height:number,layers:PaperMaterialLayer[],blurSigma=.65){
 if(source.length!==width*height*3||!Number.isFinite(blurSigma)||blurSigma<.3)throw Error('Native RGB and explicit material softness required');
 if(new Set(layers.map(l=>l.slotId)).size!==layers.length)throw Error('Each visible paper surface needs an independent slot');
 const after=Buffer.from(source),paper=Buffer.alloc(width*height),changes:{slotId:string;pixels:number;outsideUvPixels:number}[]=[];
 for(const layer of layers){
  const {bounds:b,texture:t}=layer;if(layer.coverage.length!==width*height||layer.guard.length!==width*height||t.rgb.length!==t.width*t.height*3)throw Error('Layer dimensions mismatch');
  if(b.left<0||b.top<0||b.width<1||b.height<1||b.left+b.width>width||b.top+b.height>height)throw Error('Layer bounds leave the source');
  const mapped=Buffer.alloc(b.width*b.height*3,255);let outsideUvPixels=0;
  for(let y=b.top;y<b.top+b.height;y++)for(let x=b.left;x<b.left+b.width;x++){
   const [u,v]=layer.uvAt(x+.5,y+.5),p=y*width+x;if(!Number.isFinite(u)||!Number.isFinite(v)){if(layer.coverage[p])throw Error('Visible paper has invalid UV');continue;}
   if(layer.coverage[p]&&(u<0||u>1||v<0||v>1))outsideUvPixels++;
   const tx=Math.max(0,Math.min(1,u))*(t.width-1),ty=Math.max(0,Math.min(1,v))*(t.height-1),x0=Math.floor(tx),y0=Math.floor(ty),fx=tx-x0,fy=ty-y0,k=((y-b.top)*b.width+x-b.left)*3;
   for(let c=0;c<3;c++){
    const at=(xx:number,yy:number)=>t.rgb[(Math.min(t.height-1,yy)*t.width+Math.min(t.width-1,xx))*3+c];
    mapped[k+c]=Math.round((at(x0,y0)*(1-fx)+at(x0+1,y0)*fx)*(1-fy)+(at(x0,y0+1)*(1-fx)+at(x0+1,y0+1)*fx)*fy);
   }
  }
  const ink=await sharp(mapped,{raw:{width:b.width,height:b.height,channels:3}}).blur(blurSigma).raw().toBuffer();let changed=0;
  for(let y=b.top;y<b.top+b.height;y++)for(let x=b.left;x<b.left+b.width;x++){
   const p=y*width+x,a=layer.coverage[p]/255;if(!a)continue;
   if(layer.guard[p])throw Error(`Paper overlaps protected foreground in ${layer.slotId}`);
   if(paper[p])throw Error('Two visible surfaces claim the same source pixel');
   paper[p]=layer.coverage[p];const j=p*3,k=((y-b.top)*b.width+x-b.left)*3;let any=false;
   for(let c=0;c<3;c++){after[j+c]=Math.round(source[j+c]*(1-a+a*ink[k+c]/255));any ||=after[j+c]!==source[j+c];}if(any)changed++;
  }
  changes.push({slotId:layer.slotId,pixels:changed,outsideUvPixels});
 }
 let outsidePaperChanges=0;for(let p=0;p<width*height;p++)if(!paper[p])for(let c=0;c<3;c++)if(after[p*3+c]!==source[p*3+c])outsidePaperChanges++;
 if(outsidePaperChanges)throw Error('Material changed a pixel outside visible paper');
 return {after,paper,changes,outsidePaperChanges};
}
