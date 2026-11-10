import { createRequire } from 'node:module';
import { mkdir,writeFile,readFile } from 'node:fs/promises';
import path from 'node:path';
const require=createRequire(import.meta.url);

/** Uses the project's installed Next webpack and React. No network or new dependencies. */
export async function bundleComposition(root:string,outputDirectory:string){
 const runtime=path.join(root,'.runtime','composition-bundle');await mkdir(runtime,{recursive:true});
 const loader=path.join(runtime,'typescript-loader.cjs');
 await writeFile(loader,`// Generated build helper; source: scripts/bundle-composition.ts\nconst swc=require(${JSON.stringify(require.resolve('next/dist/build/swc'))});module.exports=function(source){return swc.transformSync(source,{filename:this.resourcePath,jsc:{parser:{syntax:'typescript',tsx:true},target:'es2022',transform:{react:{runtime:'automatic'}}},module:{type:'es6'}}).code;};\n`);
 const {webpack}=require('next/dist/compiled/webpack/webpack');
 await new Promise<void>((resolve,reject)=>{
  const compiler=webpack({mode:'production',context:root,target:'web',entry:path.join(root,'src/composition-review-react.tsx'),output:{path:outputDirectory,filename:'komposition-react.js'},devtool:false,optimization:{minimize:false},resolve:{extensions:['.tsx','.ts','.js','.json']},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:[{loader}]}]},performance:{hints:false}});
  compiler.run((error:Error|null,stats:any)=>compiler.close((closeError:Error|null)=>{if(error||closeError)return reject(error||closeError);if(stats?.hasErrors())return reject(new Error(stats.toString({all:false,errors:true})));resolve();}));
 });
 return readFile(path.join(outputDirectory,'komposition-react.js'),'utf8');
}
