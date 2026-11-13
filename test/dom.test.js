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
  assert.equal(doc.title, 'A letter for Maya · Heartwritten');
  assert.match(doc.getElementById('envelope-from').textContent, /Sam’s heartbeat/);
  assert.ok(doc.querySelector('#seal svg'), 'wax seal drawn');
  assert.equal(doc.getElementById('sim-badge').hidden, false, 'sample letters say so');
  assert.match(doc.getElementById('sim-badge').textContent, /sample letter · its heartbeat is simulated/);
  assert.ok(doc.getElementById('sim-badge').classList.contains('cap'), 'in calm small capitals, not as a warning');

  doc.getElementById('seal-button').click();
  assert.ok(await until(() => doc.body.dataset.view === 'letter', 3000), 'letter opens after the seal breaks');
  assert.ok(await until(() => doc.getElementById('body-text').textContent.length > 3, 3000), 'words start appearing');
  // While it is being written: the heartline and the live figure are in the
  // strip bound into the sheet, beside the words, not floating outside it.
  const paper = doc.getElementById('paper');
  const strip = doc.getElementById('strip');
  assert.equal(strip.parentElement, paper, 'the strip is part of the sheet');
  assert.ok(strip.contains(doc.getElementById('heart-bpm')) && strip.contains(doc.getElementById('heart')), 'the figure and its beating mark are in the strip');
  assert.ok(await until(() => /^\d+$/.test(doc.getElementById('heart-bpm').textContent)), 'the figure shows a heart rate');
  assert.equal(doc.getElementById('pulse').hidden, false);
  assert.match(doc.getElementById('replay-sim').textContent, /Sample · simulated heartbeat/);
  assert.equal(doc.getElementById('replay-sim').hidden, false);
  assert.equal(doc.getElementById('summary').hidden, true, 'the postscript waits for the end');
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
  assert.equal(doc.getElementById('signature').textContent, 'Sam');
  const trace = doc.querySelectorAll('#strip svg#trace path');
  assert.ok(trace.length > 6, 'the heartline runs down the margin');
  assert.ok(new Set([...trace].map((p) => p.getAttribute('stroke'))).size > 3, 'and changes ink where the heart did');
  assert.ok(Number(doc.getElementById('trace').dataset.beats) > 20);
  assert.equal(doc.getElementById('heartline'), null, 'there is no second chart under the text');
  assert.ok(doc.querySelector('#body-text .f3'), 'the quickest words are feathered');
  assert.equal(doc.querySelectorAll('#body-text .smiled').length, 2, 'one pencil stroke per smile');
  assert.match(doc.getElementById('summary-title').textContent, /^P\.S\.$/, 'the closing card is a postscript');
  assert.equal(doc.getElementById('summary').hidden, false);
  assert.ok(doc.getElementById('page').contains(doc.getElementById('summary')), 'and it is part of the letter');
  assert.match(summary, /between \d+ and \d+ beats a minute/);
  const notes = [...doc.querySelectorAll('#pauses li')].map((li) => li.textContent);
  assert.ok(notes.some((n) => /^paused 9 seconds$/.test(n)), `margin notes: ${notes.join(' | ')}`);
  assert.ok(notes.some((n) => /^took back 8 characters$/.test(n)));
  assert.equal(notes.filter((n) => n === 'the ink warms where Sam’s heart sped up').length, 1, 'the hint is pencilled in once');
  assert.equal(doc.getElementById('ink-hint').textContent, 'the ink warms where Sam’s heart sped up');
  assert.equal(doc.getElementById('pulse').hidden || doc.body.classList.contains('finished'), true);

  // Watching it again does not explain the ink a second time.
  doc.getElementById('replay').click();
  assert.equal(doc.body.classList.contains('finished'), false);
  doc.getElementById('skip').click();
  assert.ok(await until(() => doc.body.classList.contains('finished'), 3000), 'the second replay finishes');
  const again = [...doc.querySelectorAll('#pauses li')].map((li) => li.textContent);
  assert.ok(again.some((n) => /paused/.test(n)) && !again.some((n) => /ink warms/.test(n)), 'the hint shows once and never again');
  assert.ok(doc.querySelector('#body-text .pz-mark'), 'pauses are anchored to their place in the text');
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
  assert.equal(doc.getElementById('empty-text').hidden, false);
  assert.match(doc.title, /incomplete · Heartwritten/);
  win.close();
});

test('the reader page makes no network requests', () => {
  // CSP forbids it, and the page has no URLs to fetch.
  assert.match(readerHtml, /connect-src 'none'/);
  assert.match(readerHtml, /default-src 'none'/);
  assert.doesNotMatch(readerHtml, /<(link|img|iframe)[^>]+(href|src)="https?:/i);
  assert.doesNotMatch(readerHtml, /fetch\(/);
  // The embedded font is inside the file, and the policy lets fonts come from nowhere else.
  assert.match(readerHtml, /font-src data:;/);
  assert.equal((readerHtml.match(/@font-face/g) || []).length, 2);
  for (const m of readerHtml.matchAll(/url\(([^)]{0,40})/g)) assert.match(m[1], /^"?data:|^%23|^#/, `no url() points anywhere but the file itself: ${m[1]}`);
  // The one address in the page is the preview picture that chat apps fetch
  // for themselves. The page never loads it.
  const og = readerHtml.match(/<meta property="og:image" content="([^"]+)">/);
  assert.equal(og[1], 'https://heartwritten.vercel.app/og.png');
  assert.doesNotMatch(readerHtml.replace(og[0], ''), /https?:\/\/(?!www\.w3\.org\/2000\/svg)/, 'no other address of any site is in the page');
  assert.match(readerHtml, /<link rel="icon" href="data:image\/svg\+xml,/, 'the icon is inside the page too');
  assert.match(readerHtml, /<noscript>/);
  assert.doesNotMatch(readerHtml, /localStorage|sessionStorage|document\.cookie|indexedDB|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
});

test('the sample’s heart moves within the first ten seconds of the replay', async () => {
  const { decodeLetter } = await import('../src/shared/letter-format.js');
  const { buildTimeline, bpmAt, heat } = await import('../src/shared/playback.js');
  const { median } = await import('../src/shared/summary.js');
  const letter = await decodeLetter(token);
  const base = median(letter.vit.bpm);
  const ops = buildTimeline(letter).ops;
  const firstWarm = ops.find((op) => heat(bpmAt(letter, op.t), base) >= 0.5);
  const firstHot = ops.find((op) => heat(bpmAt(letter, op.t), base) >= 0.95);
  assert.ok(firstWarm.at < 5000, `ink clearly warm at ${firstWarm.at} ms`);
  assert.ok(firstHot.at < 10000, `ink fully warm at ${firstHot.at} ms`);
  assert.ok(Math.abs(heat(bpmAt(letter, ops[0].t), base)) < 0.2, 'it starts calm, so the change shows');
});

test('the front page is a letter to the visitor, written in heart-ink', async () => {
  const { win, doc, errors } = load(readerHtml, 'https://reader.test/');
  assert.ok(await until(() => doc.body.dataset.view === 'empty'));
  assert.ok(await until(() => doc.getElementById('body-text').textContent.length > 20, 3000), 'it starts writing itself');
  assert.equal(doc.body.classList.contains('finished'), false);
  assert.match(doc.getElementById('replay-sim').textContent, /demonstration · this page’s heartbeat is simulated/, 'and says its heartbeat is not a real one');
  assert.equal(doc.getElementById('front-end').hidden, true);
  doc.getElementById('skip').click();
  assert.ok(await until(() => doc.body.classList.contains('finished'), 3000));
  const text = doc.getElementById('body-text').textContent;
  assert.match(text, /^Hello,/);
  assert.match(text, /You write on a Mac, with the app\./);
  assert.match(text, /Nothing is kept but a few numbers a second\. Never video\./);
  assert.match(text, /The letter lives only in its link\./);
  assert.ok(doc.querySelectorAll('#strip svg#trace path').length > 6, 'with the heartline in its margin');
  assert.ok(doc.querySelector('#body-text .f3'), 'and ink that warms');
  assert.equal(doc.getElementById('front-end').hidden, false);
  assert.equal(doc.getElementById('sample-link').getAttribute('href'), 'sample');
  assert.match(doc.querySelector('#write-entry summary').textContent, /^Write a letter$/);
  assert.match(doc.getElementById('write-entry').textContent, /opens in the Heartwritten app on a Mac/);
  assert.match(doc.title, /^Heartwritten · /);
  assert.equal(doc.getElementById('summary').hidden, true, 'no postscript about a heart nobody had');
  assert.equal(doc.querySelector('.view-letter ol'), null, 'no numbered steps');
  assert.doesNotMatch(doc.querySelector('main').textContent, /\u2014| - |diagnos|stress|health(?! advice)|lie detect/i);
  assert.deepEqual(errors, []);
  win.close();
});

test('after sealing, copying the link is confirmed in words', async () => {
  const html = (await readFile(new URL('dist/writer/index.html', root), 'utf8')).replace('<script src="./writer.js"></script>', '');
  const { win, doc, errors } = load(html, 'file:///app/dist/writer/index.html');
  let copied = '';
  Object.defineProperty(win.navigator, 'clipboard', { value: { writeText: async (t) => { copied = t; } }, configurable: true });
  win.heartwritten = { getConfig: async () => ({ hasKey: false, simulate: true, readerUrl: 'https://reader.test/' }), openPreview: () => true };
  win.eval(await readFile(new URL('dist/writer/writer.js', root), 'utf8'));
  await wait(50);
  const agree = doc.getElementById('agree');
  agree.checked = true;
  agree.dispatchEvent(new win.Event('change'));
  doc.getElementById('begin').click();
  assert.ok(await until(() => doc.body.dataset.step === 'write'));
  doc.getElementById('to').value = 'Maya';
  const body = doc.getElementById('body');
  body.value = 'Hello.';
  body.dispatchEvent(new win.InputEvent('input', { data: '.' }));
  doc.getElementById('seal-it').click();
  assert.ok(await until(() => doc.body.dataset.step === 'sealed'));
  assert.match(doc.getElementById('link').value, /^https:\/\/reader\.test\/#v1\./);
  assert.equal(doc.getElementById('share-label').textContent, 'Send Maya this private link');
  assert.equal(doc.getElementById('copied').hidden, true, 'no confirmation before anything is copied');
  doc.getElementById('copy').click();
  assert.ok(await until(() => doc.getElementById('copied').hidden === false));
  assert.equal(copied, doc.getElementById('link').value);
  assert.equal(doc.getElementById('copied').textContent, 'The link is copied. Paste it into a message to Maya.');
  assert.equal(doc.getElementById('copy').textContent, 'Copied');
  assert.deepEqual(errors, []);
  win.close();
});

test('labels are one serif in small capitals, and nothing is set below 13px', async () => {
  const css = [readerHtml.match(/<style>([\s\S]*?)<\/style>/)[1], await readFile(new URL('dist/writer/writer.css', root), 'utf8')].join('\n')
    .replace(/url\([^)]*\)/g, '');
  const sizes = [...css.matchAll(/font(?:-size)?:[^;}]*?(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
  assert.ok(sizes.length > 30);
  assert.ok(Math.min(...sizes) >= 13, `smallest type is ${Math.min(...sizes)}px`);
  assert.doesNotMatch(css.replace(/ui-monospace, Menlo, monospace/, ''), /sans-serif|Helvetica|SF Pro|Segoe|Roboto|Inter\b/, 'no second typeface for labels');
  assert.match(css, /all-small-caps/);
  assert.match(css, /oldstyle-nums/);
});

test('writer in simulated mode: consent, write, seal, save', async () => {
  const html = (await readFile(new URL('dist/writer/index.html', root), 'utf8'))
    .replace('<script src="./writer.js"></script>', '');
  const { win, doc, errors } = load(html, 'file:///app/dist/writer/index.html');
  const js = await readFile(new URL('dist/writer/writer.js', root), 'utf8');
  win.eval(js);

  assert.equal(doc.body.dataset.step, 'consent', 'nothing starts before consent');
  // The consent screen's words are unchanged by the redesign.
  const consent = doc.querySelector('.step-consent').textContent.replace(/\s+/g, ' ');
  for (const line of [
    'Write a letter that carries your heartbeat.',
    'While you write, your camera reads your pulse, your breathing and your smiles. Whoever you send it to watches the letter appear again at your pace, in ink coloured by your heart.',
    'Numbers only, a few a second. Never video, photos or your face.',
    'Nowhere until you seal it. A sealed letter lives inside its link or file, not on a server. You decide who gets it.',
    'I’m the only person on camera, and I agree to this.',
    'Turn on the camera',
    'Camera estimates, for feeling, not medicine. No diagnosis, no health advice.',
  ]) assert.ok(consent.includes(line), `consent screen still says: ${line}`);
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
  assert.equal(doc.title, 'Writing · Heartwritten');
  // The camera reports in at the top of the margin strip, not in a pill.
  assert.ok(doc.getElementById('strip').contains(doc.getElementById('hint')), 'camera status lives in the strip');
  assert.ok(await until(() => doc.getElementById('live').dataset.state === 'reading', 3000), 'the strip goes from starting to reading');
  assert.equal(doc.getElementById('hint').textContent, 'Reading you clearly');
  assert.ok(await until(() => /^\d+$/.test(doc.getElementById('live-bpm').textContent), 3000), 'live heart rate shows');
  const strip = doc.getElementById('strip');
  assert.equal(strip.parentElement, doc.getElementById('paper'), 'the live heartbeat is in the sheet’s margin strip');
  assert.ok(strip.contains(doc.getElementById('live-bpm')) && strip.contains(doc.getElementById('wave')) && strip.contains(doc.getElementById('trace')));

  doc.getElementById('to').value = 'Maya';
  doc.getElementById('from').value = 'Sam';
  const body = doc.getElementById('body');
  for (const ch of 'Hello Maya. I got it!') {
    body.value += ch;
    body.dispatchEvent(new win.InputEvent('input', { data: ch }));
    await wait(15);
  }
  await wait(600);
  assert.ok(doc.querySelector('#ink-mirror span[style*="color"]'), 'the words take their ink as they are typed');
  assert.equal(doc.getElementById('ink-mirror').textContent, 'Hello Maya. I got it!');
  assert.ok(doc.querySelector('#strip svg#trace path'), 'and the heartline draws beside them');
  assert.equal(doc.getElementById('seal-it').disabled, false);
  doc.getElementById('seal-it').click();
  assert.ok(await until(() => doc.body.dataset.step === 'sealed'), 'sealed');
  assert.ok(doc.querySelector('#seal svg'));
  assert.match(doc.getElementById('sealed-sub').textContent, /For Maya/);
  assert.match(doc.getElementById('link-note').textContent, /sample/);
  assert.equal(doc.title, 'Sealed · Heartwritten');
  assert.ok(doc.querySelector('.sealed .envelope #seal svg'), 'the seal sits on the envelope they will receive');
  // With no reader address there is no link, and the page says what to do instead.
  assert.ok(doc.querySelector('.share').classList.contains('no-link'));
  assert.match(doc.getElementById('link-note').textContent, /Save the letter as a file/);
  assert.equal(doc.getElementById('share').hidden, true);

  // The camera's other states have words of their own.
  const src = await readFile(new URL('src/writer/writer.js', root), 'utf8');
  for (const state of ['connecting', 'searching', 'settling', 'reading', 'error', 'off']) assert.match(src, new RegExp(`setStatus\\('${state}'|'${state}'`), state);
  assert.match(await readFile(new URL('src/writer/index.html', root), 'utf8'), /<meta name="viewport"/);
  assert.deepEqual(errors, []);
  win.close();
});
