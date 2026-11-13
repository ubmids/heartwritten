// writer.js
// The writing desk. Consent first, then the camera, then the letter.

import { LetterRecorder } from '../shared/recorder.js';
import { VitalsTracker, hintFor } from '../shared/vitals.js';
import { encodeLetter, buildLink, finalText } from '../shared/letter-format.js';
import { heat, inkAt } from '../shared/playback.js';
import { inkHtml, layoutStops, stopAt, drawTrace } from '../shared/sheet.js';
import { median, formatDuration } from '../shared/summary.js';
import { sealSvg } from '../shared/seal.js';
import { SimulatedSource } from '../shared/sim-source.js';
import readerHtml from '../../dist/reader/index.html';

const $ = (id) => document.getElementById(id);
const bridge = window.heartwritten || null;

const app = {
  cfg: { hasKey: false, simulate: true, readerUrl: '' },
  source: null,
  simulated: true,
  tracker: new VitalsTracker(),
  recorder: new LetterRecorder(),
  sampler: 0,
  drawer: 0,
  bpmHistory: [],
  marks: [],        // one per character: { heat, smile, t }
  lastIndex: 0,
  prevText: '',
  token: '',
  letter: null,
};

function setStep(step) { document.body.dataset.step = step; }

async function init() {
  if (bridge) app.cfg = await bridge.getConfig();
  app.simulated = app.cfg.simulate || !app.cfg.hasKey;
  $('mode-note').textContent = app.simulated
    ? 'No SmartSpectra key found, so the signals will be simulated and the letter marked as a sample. See the README to add your key.'
    : '';
  $('agree').addEventListener('change', () => { $('begin').disabled = !$('agree').checked; });
  $('begin').addEventListener('click', begin);
  $('body').addEventListener('input', onType);
  $('seal-it').addEventListener('click', seal);
  $('stop-camera').addEventListener('click', stopCamera);
  $('copy').addEventListener('click', copyLink);
  $('share').addEventListener('click', shareLink);
  $('preview-letter').addEventListener('click', previewLetter);
  $('save-file').addEventListener('click', saveFile);
  $('again').addEventListener('click', () => location.reload());
  window.addEventListener('resize', () => { if (document.body.dataset.step === 'write') { syncHead(); drawInk(); } });
}

// ---------------------------------------------------------------------------
// Camera

// Where the signals come from. Every source speaks the same few events
// (stream, validationStatus, metrics, notice, error) and has start() and
// stop(), so the desk doesn't care which one it has. A source that reads
// the camera somewhere else (for a writer served as a web page) slots in
// here as a third entry.
const SOURCES = {
  sim: async () => new SimulatedSource(),
  sdk: async ({ telemetry, smiles }) => {
    const { SmartSpectraSource } = await import('./sdk-source.js');
    return new SmartSpectraSource({ apiKey: await bridge.getApiKey(), telemetry, smiles });
  },
};

// What the camera is doing, said in the margin strip where the live pulse
// will be: asking, looking for a face, wanting more light, reading.
const STATES = { 0: 'settling', 5: 'dim', 6: 'dim', 10: 'tuning', 11: 'tuning' };
function setStatus(state, text) {
  const live = $('live');
  live.dataset.state = state;
  if (text) $('hint').textContent = text;
  syncHead();
}

// The writing starts below whatever the strip has to say.
function syncHead() {
  const field = $('ink-field');
  const live = $('live');
  if (!field || !live.offsetHeight) return;
  const now = parseFloat(field.style.marginTop) || 18;
  const natural = field.offsetTop - now;
  field.style.marginTop = `${Math.max(18, live.offsetHeight + 14 - natural - ($('page').offsetTop || 0))}px`;
}

async function begin() {
  $('begin').disabled = true;
  const share = choices();
  app.source = await SOURCES[app.simulated ? 'sim' : 'sdk'](share);
  $('sim-flag').hidden = !app.simulated;
  const src = app.source;
  src.on('stream', (stream) => {
    $('preview').srcObject = stream; $('preview').play().catch(() => {});
    if ($('live').dataset.state === 'connecting') setStatus('searching', 'Looking for your face');
  });
  src.on('validationStatus', (code, _ts, hint) => {
    if (code === 0) return setStatus(app.tracker.bpm ? 'reading' : 'settling', app.tracker.bpm ? 'Reading you clearly' : 'Finding your pulse');
    return setStatus(STATES[code] || 'searching', hintFor(code, hint));
  });
  src.on('metrics', (m) => onMetrics(m));
  src.on('notice', (msg) => { $('notice').textContent = msg; });
  src.on('error', (code, message) => {
    setStatus('error', code === 2 ? 'Your SmartSpectra key wasn’t accepted.' : `The camera stopped: ${message}`);
    $('notice').textContent = 'You can keep writing. The words from here on carry no heartbeat.';
  });
  setStep('write');
  document.title = 'Writing · Heartwritten';
  setStatus('connecting', app.simulated ? 'Starting' : 'Waiting for the camera. Allow it if you are asked.');
  await src.start();
  app.sampler = setInterval(() => app.recorder.sample(app.tracker.snapshot()), 250);
  app.drawer = requestAnimationFrame(drawWave);
  drawInk();
  $('body').focus();
}

async function stopCamera() {
  const src = app.source;
  app.source = null;
  if (src) await src.stop();
  app.tracker.reset();
  $('preview').srcObject = null;
  setStatus('off', 'Camera off. The rest of the letter keeps no heartbeat.');
  $('stop-camera').disabled = true;
  document.body.classList.add('camera-off');
}

function onMetrics(m) {
  const wave = app.tracker.ingest(m);
  if (wave.length) app.recorder.pushWave(wave);
  const t = app.tracker;
  if (t.bpm) {
    app.bpmHistory.push(t.bpm);
    if (app.bpmHistory.length > 400) app.bpmHistory.shift();
  }
  $('live-bpm').textContent = t.bpm ? Math.round(t.bpm) : '·';
  const state = $('live').dataset.state;
  if (t.bpm && state === 'settling') setStatus('reading', 'Reading you clearly');
  else if (!t.bpm && state === 'reading') setStatus('settling', 'Finding your pulse');
  // The cursor, the figure and the mark at the pen's tip take the ink the
  // heart is choosing right now.
  if (t.bpm) {
    const ink = inkAt(heatNow());
    $('body').style.caretColor = ink;
    $('strip').style.setProperty('--pulse-ink', ink);
  }
  const breath = t.breathPhase();
  if (breath != null) $('strip').style.setProperty('--b', ((breath + 1) / 2).toFixed(3));
  $('live-br').textContent = t.breathRate ? Math.round(t.breathRate) : '·';
  $('live-smile').classList.toggle('on', choices().smiles && t.smile >= 0.6);
}

function drawWave(now) {
  // The mark at the pen's tip beats in time with you.
  if (app.tracker.bpm && now >= (app.nextBeat || 0)) {
    app.nextBeat = now + 60000 / app.tracker.bpm;
    const heart = $('heart');
    heart.classList.remove('beat');
    void heart.offsetWidth;
    heart.classList.add('beat');
  }
  const c = $('wave');
  const ctx = c.getContext && c.getContext('2d');
  if (!ctx) return;
  const W = c.width; const H = c.height;
  ctx.clearRect(0, 0, W, H);
  const tr = app.tracker.pulseTrace;
  if (tr.length > 4) {
    const tEnd = tr[tr.length - 1].t;
    const span = 6e6;
    let lo = Infinity; let hi = -Infinity;
    for (const { t, v } of tr) if (t >= tEnd - span) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    const range = hi - lo || 1;
    ctx.lineWidth = 2.6;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = inkAt(heatNow());
    ctx.beginPath();
    let first = true;
    for (const { t, v } of tr) {
      if (t < tEnd - span) continue;
      const x = ((t - (tEnd - span)) / span) * W;
      const y = H - 6 - ((v - lo) / range) * (H - 12);
      if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  app.drawer = requestAnimationFrame(drawWave);
}

// ---------------------------------------------------------------------------
// Writing

// The words take the ink of the heart that wrote them, as you write, and the
// heartline grows down the margin beside them. The textarea's own text is
// transparent; a mirror behind it draws the ink.
const LONG_PAUSE_MS = 8000;

function heatNow() {
  return app.tracker.bpm ? heat(app.tracker.bpm, median(app.bpmHistory)) : 0;
}

function inkEdit(next) {
  const prev = app.prevText;
  const n = Math.min(prev.length, next.length);
  let a = 0;
  while (a < n && prev[a] === next[a]) a++;
  let b = 0;
  while (b < n - a && prev[prev.length - 1 - b] === next[next.length - 1 - b]) b++;
  const added = Math.max(0, next.length - a - b);
  const mark = { heat: heatNow(), smile: choices().smiles && app.tracker.smile >= 0.6, t: app.recorder.elapsed() };
  app.marks.splice(a, prev.length - a - b, ...Array.from({ length: added }, () => mark));
  app.lastIndex = Math.max(0, a + added - 1);
  app.prevText = next;
  drawInk();
}

function drawInk() {
  const text = app.prevText;
  const units = Array.from(text, (ch, i) => ({ ch, heat: (app.marks[i] || {}).heat || 0, smile: (app.marks[i] || {}).smile }));
  const mirror = $('ink-mirror');
  mirror.innerHTML = `${inkHtml(units)}${text.endsWith('\n') ? ' ' : ''}`;
  const ta = $('body');
  ta.style.height = 'auto';
  ta.style.height = `${Math.max(ta.scrollHeight, 0)}px`;
  drawMargin(units);
}

// The strip beside the sheet: the heartline for what is written so far, and
// the live figure at the line being written.
function drawMargin(units) {
  const field = $('ink-field');
  const top = field.offsetTop + ($('page').offsetTop || 0);
  const { stops, lineH } = layoutStops($('ink-mirror'), units.map((u) => u.heat));
  const rests = [];
  for (let i = 1; i < app.marks.length; i++) {
    if (app.marks[i].t - app.marks[i - 1].t >= LONG_PAUSE_MS) {
      const s = stopAt(stops, i - 1);
      if (s) rests.push({ y: s.y, len: 15 });
    }
  }
  const head = drawTrace($('trace'), $('strip'), stops, { top, rests });
  const here = stopAt(stops, app.lastIndex);
  const atEnd = head && app.lastIndex >= units.length - 1;
  $('heart').hidden = !atEnd;
  if (atEnd) { $('heart').style.left = `${head.x.toFixed(1)}px`; $('heart').style.top = `${head.y.toFixed(1)}px`; }
  $('pulse').style.top = `${(top + (here ? here.y : lineH * 0.4) + 11).toFixed(1)}px`;
}

function onType(e) {
  inkEdit(e.target.value);
  app.recorder.edit(e.target.value);
  if (app.simulated && app.source && e.data === '!') app.source.bump(0.5);
  $('seal-it').disabled = !e.target.value.trim();
  updateClock();
}

function updateClock() {
  const words = (app.recorder.text.match(/\S+/g) || []).length;
  $('clock').textContent = `Writing for ${formatDuration(app.recorder.elapsed())} · ${words} word${words === 1 ? '' : 's'} · nothing saved yet`;
}
setInterval(() => { if (app.recorder.t0 != null && document.body.dataset.step === 'write') updateClock(); }, 1000);

function choices() {
  return {
    smiles: $('opt-smiles').checked,
    edits: $('opt-edits').checked,
    telemetry: $('opt-telemetry').checked,
  };
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Sealing

async function seal() {
  $('seal-it').disabled = true;
  clearInterval(app.sampler);
  cancelAnimationFrame(app.drawer);
  const src = app.source;
  app.source = null;
  if (src) await src.stop();
  $('preview').srcObject = null;

  const { smiles, edits } = choices();
  const letter = app.recorder.finish({
    from: $('from').value.trim(),
    to: $('to').value.trim(),
    day: today(),
    sim: app.simulated,
    share: { smiles, edits },
  });
  app.letter = letter;
  app.token = await encodeLetter(letter);
  const base = median(letter.vit.bpm);
  $('seal').innerHTML = sealSvg(letter.wave.v, { initial: letter.from.charAt(0), bpm: base });
  const bits = [];
  if (letter.to) bits.push(`For ${letter.to}`);
  bits.push(`written in ${formatDuration(app.recorder.elapsed())}`);
  if (base) bits.push(`your heart around ${base} bpm`);
  $('sealed-sub').textContent = `${bits.join(' · ')}.`;
  const link = app.cfg.readerUrl ? buildLink(app.cfg.readerUrl, app.token) : '';
  $('link').value = link;
  $('copy').disabled = !link;
  document.querySelector('.share').classList.toggle('no-link', !link);
  $('share-label').textContent = link ? `Send ${letter.to || 'them'} this private link` : 'No link to send yet';
  $('share').hidden = !link || typeof navigator.share !== 'function';
  $('copied').hidden = true;
  document.title = 'Sealed · Heartwritten';
  $('link-note').textContent = link.length > 6000
    ? 'This is a long letter, so the link is long. Some chat apps cut long links; if it won’t open for them, send the file instead.'
    : !link ? 'No reader address is set, so there is no link. Save the letter as a file and send that instead.'
      : (app.simulated ? 'Marked as a sample letter, because the signals were simulated.' : '');
  if (!link && app.simulated) $('link-note').textContent += ' It is marked as a sample letter, because the signals were simulated.';
  setStep('sealed');
}

async function copyLink() {
  const who = (app.letter && app.letter.to) || 'them';
  try {
    await navigator.clipboard.writeText($('link').value);
    $('copy').textContent = 'Copied';
    $('copied').textContent = `The link is copied. Paste it into a message to ${who}.`;
    setTimeout(() => { $('copy').textContent = 'Copy again'; }, 1600);
  } catch {
    // No clipboard here: select it so one keystroke copies it.
    $('link').focus();
    $('link').select();
    $('copied').textContent = 'The link is selected. Copy it from the box above.';
  }
  $('copied').hidden = false;
}

async function shareLink() {
  try { await navigator.share({ title: 'A letter for you', url: $('link').value }); } catch { /* closed without sharing */ }
}

function previewLetter() {
  if (bridge) return bridge.openPreview(app.token);
  return window.open(`../reader/index.html#${app.token}`, '_blank', 'noopener');
}

export function letterFileHtml(token) {
  return readerHtml.replace('<!--__LETTER_DATA__-->',
    `<script id="letter-data" type="application/x-heartwritten">${token}</script>`);
}

function saveFile() {
  const html = letterFileHtml(app.token);
  const name = (app.letter.to || 'you').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'you';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  a.download = `a-letter-for-${name}.html`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export { finalText };

if (!globalThis.__HW_NO_AUTOBOOT__) init();
