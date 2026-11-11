// build.mjs: bundles the reader into one self-contained HTML file, then the
// writer (which embeds that file for "Save as a file") and the preload.
import { build } from 'esbuild';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';

const out = (p) => new URL(`../dist/${p}`, import.meta.url);
const src = (p) => new URL(`../src/${p}`, import.meta.url);

await mkdir(out('reader/'), { recursive: true });
await mkdir(out('writer/'), { recursive: true });

// 1. Reader: one HTML file, no external requests.
const js = await build({
  entryPoints: [src('reader/reader.js').pathname],
  bundle: true, minify: true, format: 'iife', write: false, target: ['es2022'],
});
const css = await readFile(src('reader/reader.css'), 'utf8');
const html = (await readFile(src('reader/index.html'), 'utf8'))
  .replace('/*__READER_CSS__*/', () => css)
  .replace('/*__READER_JS__*/', () => js.outputFiles[0].text.replace(/<\/script/gi, '<\\/script'));
await writeFile(out('reader/index.html'), html);

// 2. Writer renderer.
await build({
  entryPoints: [src('writer/writer.js').pathname],
  bundle: true, format: 'iife', platform: 'browser', target: ['chrome120'],
  outfile: out('writer/writer.js').pathname, loader: { '.html': 'text' }, logLevel: 'warning',
});
await copyFile(src('writer/index.html'), out('writer/index.html'));
await copyFile(src('writer/writer.css'), out('writer/writer.css'));

// 3. Preload: SmartSpectra's bridge plus ours, with only `electron` left external
//    so it runs in a sandboxed preload.
await build({
  entryPoints: [src('writer/preload.cjs').pathname],
  bundle: true, format: 'cjs', platform: 'node', external: ['electron'],
  outfile: out('preload.cjs').pathname, logLevel: 'warning',
});

console.log(`built dist/ (reader ${(html.length / 1024).toFixed(1)} KB)`);
