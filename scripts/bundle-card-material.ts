import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const require=createRequire(import.meta.url);
const vendorSha='5289ca2dfde8572bd7715b9fa2ca929db12bae87e9a2cb53e431662df7039506';
const licenseSha='4c40a1ef62450b857c3b2aaf294936304cd552d965fbcd9d32d4c5bcf4ba4454';
const sha=(value:Uint8Array)=>createHash('sha256').update(value).digest('hex');

/** Uses only the verified local Three copy and the lab's installed Next webpack/SWC. */
export async function bundleCardMaterial(root:string,outputDirectory:string) {
  const vendor=path.join(root,'references/card-materials/vendor');
  if(sha(await readFile(path.join(vendor,'three.module.js')))!==vendorSha || sha(await readFile(path.join(vendor,'LICENSE')))!==licenseSha)throw Error('Three r167 vendor identity changed.');
  const runtime=path.join(root,'runs/20261109-card-material-study/build-support');await mkdir(runtime,{recursive:true});await mkdir(outputDirectory,{recursive:true});
  const loader=path.join(runtime,'typescript-loader.cjs');
  await writeFile(loader,`const swc=require(${JSON.stringify(require.resolve('next/dist/build/swc'))});module.exports=function(source){return swc.transformSync(source,{filename:this.resourcePath,jsc:{parser:{syntax:'typescript'},target:'es2022'},module:{type:'es6'}}).code;};\n`);
  const {webpack}=require('next/dist/compiled/webpack/webpack');
  await new Promise<void>((resolve,reject)=>{
    const compiler=webpack({mode:'production',context:root,target:'web',entry:path.join(root,'src/card-material-study.ts'),output:{path:outputDirectory,filename:'kortmaterial.js'},devtool:false,optimization:{minimize:false},resolve:{extensions:['.ts','.js','.json']},module:{rules:[{test:/\.ts$/,exclude:/node_modules/,use:[{loader}]}]},performance:{hints:false}});
    compiler.run((error:Error|null,stats:any)=>compiler.close((closeError:Error|null)=>{if(error||closeError)return reject(error||closeError);if(stats?.hasErrors())return reject(new Error(stats.toString({all:false,errors:true})));resolve();}));
  });
  await writeFile(path.join(outputDirectory,'kortmaterial-three-LICENSE.txt'),await readFile(path.join(vendor,'LICENSE')));
  return readFile(path.join(outputDirectory,'kortmaterial.js'),'utf8');
}
