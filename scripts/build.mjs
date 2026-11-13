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
// One serif, Literata (SIL OFL 1.1, see src/fonts), cut down to two small
// files. The reader carries them inside itself as data: URLs, so it still
// loads nothing from anywhere; the writer loads them from its own folder.
const FONTS = [['Literata-Regular.woff2', 'normal'], ['Literata-Italic.woff2', 'italic']];
const fontFace = (url, style) => `@font-face { font-family: "Literata"; font-style: ${style}; font-weight: 400; font-display: swap; src: url(${url}) format("woff2"); }`;
const inlineFonts = (await Promise.all(FONTS.map(async ([file, style]) =>
  fontFace(`data:font/woff2;base64,${(await readFile(src(`fonts/${file}`))).toString('base64')}`, style)))).join('\n');
const sheetCss = await readFile(src('shared/sheet.css'), 'utf8');
const css = [inlineFonts, sheetCss, await readFile(src('reader/reader.css'), 'utf8')].join('\n');
// The address the reader is hosted at, for the link-preview picture only.
const site = (JSON.parse(await readFile(new URL('../heartwritten.config.json', import.meta.url), 'utf8')).readerUrl || '').replace(/\/?$/, '/');
const html = (await readFile(src('reader/index.html'), 'utf8'))
  .replaceAll('__SITE__', site)
  .replace('/*__READER_CSS__*/', () => css)
  .replace('/*__READER_JS__*/', () => js.outputFiles[0].text.replace(/<\/script/gi, '<\\/script'));
await writeFile(out('reader/index.html'), html);
try { await copyFile(src('reader/og.png'), out('reader/og.png')); } catch { /* the preview picture is optional */ }

// 2. Writer renderer.
await build({
  entryPoints: [src('writer/writer.js').pathname],
  bundle: true, format: 'iife', platform: 'browser', target: ['chrome120'],
  outfile: out('writer/writer.js').pathname, loader: { '.html': 'text' }, logLevel: 'warning',
});
await copyFile(src('writer/index.html'), out('writer/index.html'));
await mkdir(out('writer/fonts/'), { recursive: true });
for (const [file] of FONTS) await copyFile(src(`fonts/${file}`), out(`writer/fonts/${file}`));
await copyFile(src('fonts/OFL.txt'), out('writer/fonts/OFL.txt'));
await writeFile(out('writer/writer.css'), [
  FONTS.map(([file, style]) => fontFace(`./fonts/${file}`, style)).join('\n'),
  sheetCss,
  await readFile(src('writer/writer.css'), 'utf8'),
].join('\n'));

// 3. Preload: SmartSpectra's bridge plus ours, with only `electron` left external
//    so it runs in a sandboxed preload.
await build({
  entryPoints: [src('writer/preload.cjs').pathname],
  bundle: true, format: 'cjs', platform: 'node', external: ['electron'],
  outfile: out('preload.cjs').pathname, logLevel: 'warning',
});

console.log(`built dist/ (reader ${(html.length / 1024).toFixed(1)} KB)`);
