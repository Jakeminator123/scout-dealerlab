/** Static wrapper around the exact Next review client; no provider calls or new dependencies. */
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

export async function bundlePamelaCardSideReview(root: string, outputDirectory: string) {
  const vendor = path.join(root, 'references/card-materials/vendor');
  assert.equal(hash(await readFile(path.join(vendor, 'three.module.js'))), '5289ca2dfde8572bd7715b9fa2ca929db12bae87e9a2cb53e431662df7039506');
  const license = await readFile(path.join(vendor, 'LICENSE'));
  assert.equal(hash(license), '4c40a1ef62450b857c3b2aaf294936304cd552d965fbcd9d32d4c5bcf4ba4454');
  const support = path.join(root, 'runs/20261110-pamela-card-side-review/static-build-support');
  await mkdir(support, { recursive: true }); await mkdir(outputDirectory, { recursive: true });
  const loader = path.join(support, 'typescript-loader.cjs'), entry = path.join(support, 'entry.tsx');
  await writeFile(loader, `const swc=require(${JSON.stringify(require.resolve('next/dist/build/swc'))});module.exports=function(source){return swc.transformSync(source,{filename:this.resourcePath,jsc:{parser:{syntax:'typescript',tsx:true},target:'es2022',transform:{react:{runtime:'automatic'}}},module:{type:'es6'}}).code;};\n`);
  await writeFile(entry, `import React from 'react';
import {createRoot} from 'react-dom/client';
import Review from ${JSON.stringify(path.join(root, 'src/pamela-card-side-review-client.tsx').replaceAll('\\', '/'))};
const root=document.getElementById('review-root')!;
fetch('/granskning/pamela-sidprov/data.json').then(r=>{if(!r.ok)throw Error('Review data HTTP '+r.status);return r.json();}).then(props=>createRoot(root).render(React.createElement(Review,props))).catch(error=>{root.textContent='Sidprovet kunde inte laddas: '+String(error);});
`);
  const { webpack } = require('next/dist/compiled/webpack/webpack');
  await new Promise<void>((resolve, reject) => {
    const compiler = webpack({ mode: 'production', context: root, target: 'web', entry,
      output: { path: outputDirectory, filename: 'client.js', chunkFilename: '[name].[contenthash].js', publicPath: '/granskning/pamela-sidprov/' },
      devtool: false, optimization: { minimize: false }, resolve: { extensions: ['.tsx', '.ts', '.js', '.json'] },
      module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: [{ loader }] }] }, performance: { hints: false } });
    compiler.run((error: Error | null, stats: any) => compiler.close((closeError: Error | null) => {
      if (error || closeError) return reject(error || closeError);
      if (stats?.hasErrors()) return reject(new Error(stats.toString({ all: false, errors: true })));
      resolve();
    }));
  });
  await writeFile(path.join(outputDirectory, 'three-LICENSE.txt'), license);
  const files = [];
  for (const name of await readdir(outputDirectory)) if (/\.(js|txt)$/.test(name)) {
    const file = path.join(outputDirectory, name), bytes = await readFile(file);
    files.push({ path: file, sha256: hash(bytes), bytes: bytes.length });
  }
  return files;
}
