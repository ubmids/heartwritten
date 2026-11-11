// writer.js
// The writing desk. Consent first, then the camera, then the letter.

import { LetterRecorder } from '../shared/recorder.js';
import { VitalsTracker, hintFor } from '../shared/vitals.js';
import { encodeLetter, buildLink, finalText } from '../shared/letter-format.js';
import { inkFor } from '../shared/playback.js';
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
  $('preview-letter').addEventListener('click', previewLetter);
  $('save-file').addEventListener('click', saveFile);
  $('again').addEventListener('click', () => location.reload());
}

// ---------------------------------------------------------------------------
// Camera

async function begin() {
  $('begin').disabled = true;
  const share = choices();
  if (app.simulated) {
    app.source = new SimulatedSource();
    $('sim-flag').hidden = false;
  } else {
    const { SmartSpectraSource } = await import('./sdk-source.js');
    const apiKey = await bridge.getApiKey();
    app.source = new SmartSpectraSource({ apiKey, telemetry: share.telemetry, smiles: share.smiles });
  }
  const src = app.source;
  src.on('stream', (stream) => { $('preview').srcObject = stream; $('preview').play().catch(() => {}); });
  src.on('validationStatus', (code, _ts, hint) => {
    $('hint').textContent = hintFor(code, hint);
    $('hint').dataset.ok = String(code === 0);
  });
  src.on('metrics', (m) => onMetrics(m));
  src.on('notice', (msg) => { $('notice').textContent = msg; });
  src.on('error', (code, message) => {
    $('hint').textContent = code === 2 ? 'Your SmartSpectra key wasn’t accepted.' : `The camera stopped: ${message}`;
    $('hint').dataset.ok = 'false';
  });
  setStep('write');
  await src.start();
  app.sampler = setInterval(() => app.recorder.sample(app.tracker.snapshot()), 250);
  app.drawer = requestAnimationFrame(drawWave);
  $('body').focus();
}

async function stopCamera() {
  const src = app.source;
  app.source = null;
  if (src) await src.stop();
  app.tracker.reset();
  $('preview').srcObject = null;
  $('hint').textContent = 'Camera off. The rest of the letter keeps no heartbeat.';
  $('hint').dataset.ok = 'false';
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
  $('live-bpm').textContent = t.bpm ? Math.round(t.bpm) : '—';
  $('live-br').textContent = t.breathRate ? Math.round(t.breathRate) : '—';
  $('live-smile').classList.toggle('on', choices().smiles && t.smile >= 0.6);
}

function drawWave() {
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
    ctx.lineWidth = 2.2;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = inkFor(app.tracker.bpm, median(app.bpmHistory));
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

function onType(e) {
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
  $('link').value = link || 'Set a reader address to share by link, or save it as a file.';
  $('copy').disabled = !link;
  $('link-note').textContent = link.length > 6000
    ? 'This is a long letter, so the link is long. Some chat apps cut long links; if it won’t open for them, send the file instead.'
    : (app.simulated ? 'Marked as a sample letter, because the signals were simulated.' : '');
  setStep('sealed');
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText($('link').value);
    $('copy').textContent = 'Copied';
    setTimeout(() => { $('copy').textContent = 'Copy link'; }, 1600);
  } catch {
    $('link').select();
  }
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
