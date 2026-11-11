// End-to-end checks of the built pages in jsdom: the reader opens a letter
// from a link and from a saved file, and the writer (in simulated mode)
// goes consent -> write -> seal.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { JSDOM, VirtualConsole } from 'jsdom';

const root = new URL('../', import.meta.url);
let readerHtml;
let token;

before(() => {
  execFileSync('node', ['scripts/build.mjs'], { cwd: root });
  execFileSync('node', ['scripts/make-sample.mjs'], { cwd: root });
});

function webGlobals(win) {
  // jsdom lacks these; borrow Node's (same web-standard implementations).
  for (const k of ['CompressionStream', 'DecompressionStream', 'Blob', 'Response', 'TextEncoder', 'TextDecoder', 'ReadableStream']) {
    win[k] = globalThis[k];
  }
  win.HTMLMediaElement.prototype.play = () => Promise.resolve();
}

function load(html, url) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => { if (!/Not implemented/.test(e.message)) errors.push(e); });
  vc.on('error', (e) => errors.push(e));
  const dom = new JSDOM(html, { url, runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc, beforeParse: webGlobals });
  return { dom, win: dom.window, doc: dom.window.document, errors };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 4000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (fn()) return true; await wait(25); }
  return false;
}

test('reader opens a letter from its link and replays it to the end', async () => {
  readerHtml = await readFile(new URL('dist/reader/index.html', root), 'utf8');
  token = (await readFile(new URL('dist/sample-token.txt', root), 'utf8')).trim();
  const { win, doc, errors } = load(readerHtml, `https://reader.test/#${token}`);
  assert.ok(await until(() => doc.body.dataset.view === 'envelope'), 'envelope shows');
  assert.match(doc.getElementById('envelope-to').textContent, /For Maya/);
  assert.match(doc.getElementById('envelope-from').textContent, /Sam’s heartbeat/);
  assert.ok(doc.querySelector('#seal svg'), 'wax seal drawn');
  assert.equal(doc.getElementById('sim-badge').hidden, false, 'sample letters say so');

  doc.getElementById('seal-button').click();
  assert.ok(await until(() => doc.body.dataset.view === 'letter', 3000), 'letter opens after the seal breaks');
  assert.ok(await until(() => doc.getElementById('body-text').textContent.length > 3, 3000), 'words start appearing');
  doc.getElementById('skip').click();
  assert.ok(await until(() => doc.body.classList.contains('finished'), 3000), 'replay finishes');

  const text = doc.getElementById('body-text').textContent;
  assert.match(text, /I actually got it!/);
  assert.match(text, /not good enough/);
  assert.doesNotMatch(text, /terrible/, 'the taken-back word is gone at the end');
  const summary = doc.getElementById('summary-body').textContent;
  assert.match(summary, /Quickest at/);
  assert.match(summary, /got it/);
  assert.match(summary, /Steadiest at/);
  assert.match(summary, /smiled/);
  assert.match(summary, /taken back|written and taken back/);
  assert.ok(doc.querySelector('#body-text .smiled'), 'smiled words are marked');
  const colours = new Set([...doc.querySelectorAll('#body-text span[style]')].map((s) => s.style.color));
  assert.ok(colours.size > 3, 'ink changes colour with the heart');
  assert.match(doc.getElementById('pauses').textContent, /paused/);
  assert.equal(doc.getElementById('signature').textContent, '— Sam');
  assert.deepEqual(errors, []);
  win.close();
});

test('a saved letter file opens with no link at all', async () => {
  const html = await readFile(new URL('dist/sample-letter.html', root), 'utf8');
  const { win, doc, errors } = load(html, 'file:///Users/someone/Downloads/a-letter-for-maya.html');
  assert.ok(await until(() => doc.body.dataset.view === 'envelope'));
  assert.deepEqual(errors, []);
  win.close();
});

test('a cut-off link explains itself instead of breaking', async () => {
  const { win, doc } = load(readerHtml, `https://reader.test/#${token.slice(0, 200)}`);
  assert.ok(await until(() => doc.body.dataset.view === 'empty'));
  assert.match(doc.getElementById('empty-text').textContent, /cut short/);
  win.close();
});

test('the reader page makes no network requests', () => {
  // CSP forbids it, and the page has no URLs to fetch.
  assert.match(readerHtml, /connect-src 'none'/);
  assert.match(readerHtml, /default-src 'none'/);
  assert.doesNotMatch(readerHtml, /<(link|img|iframe)[^>]+(href|src)="https?:/i);
  assert.doesNotMatch(readerHtml, /fetch\(/);
});

test('writer in simulated mode: consent, write, seal, save', async () => {
  const html = (await readFile(new URL('dist/writer/index.html', root), 'utf8'))
    .replace('<script src="./writer.js"></script>', '');
  const { win, doc, errors } = load(html, 'file:///app/dist/writer/index.html');
  const js = await readFile(new URL('dist/writer/writer.js', root), 'utf8');
  win.eval(js);

  assert.equal(doc.body.dataset.step, 'consent', 'nothing starts before consent');
  assert.ok(doc.getElementById('begin').disabled, 'camera button waits for agreement');
  assert.match(doc.getElementById('mode-note').textContent, /simulated/);
  doc.getElementById('opt-edits').checked = true;
  const agree = doc.getElementById('agree');
  agree.checked = true;
  agree.dispatchEvent(new win.Event('change'));
  assert.equal(doc.getElementById('begin').disabled, false);
  doc.getElementById('begin').click();
  assert.ok(await until(() => doc.body.dataset.step === 'write'));
  assert.equal(doc.getElementById('sim-flag').hidden, false, 'simulated signals are labelled');
  assert.ok(await until(() => doc.getElementById('live-bpm').textContent !== '—', 3000), 'live heart rate shows');

  doc.getElementById('to').value = 'Maya';
  doc.getElementById('from').value = 'Sam';
  const body = doc.getElementById('body');
  for (const ch of 'Hello Maya. I got it!') {
    body.value += ch;
    body.dispatchEvent(new win.InputEvent('input', { data: ch }));
    await wait(15);
  }
  await wait(600);
  assert.equal(doc.getElementById('seal-it').disabled, false);
  doc.getElementById('seal-it').click();
  assert.ok(await until(() => doc.body.dataset.step === 'sealed'), 'sealed');
  assert.ok(doc.querySelector('#seal svg'));
  assert.match(doc.getElementById('sealed-sub').textContent, /For Maya/);
  assert.match(doc.getElementById('link-note').textContent, /sample/);
  assert.deepEqual(errors, []);
  win.close();
});
