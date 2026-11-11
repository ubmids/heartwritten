// reader.js
// The page a letter opens in. It reads the letter from the link's #fragment
// (or from the file it was saved into), never from a server, and replays it.

import { decodeLetter, extractToken, finalText } from '../shared/letter-format.js';
import { Player, bpmAt, inkFor, sampleAt } from '../shared/playback.js';
import { summarize, median, formatDuration, excerpt } from '../shared/summary.js';
import { sealSvg } from '../shared/seal.js';

const $ = (id) => document.getElementById(id);

function embeddedToken() {
  const el = document.getElementById('letter-data');
  return el ? extractToken(el.textContent.trim()) : null;
}

function esc(s) {
  return String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
}

function dayLabel(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) return '';
  const d = new Date(`${day}T12:00:00`);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

export async function boot() {
  const token = extractToken(location.hash) || embeddedToken();
  if (!token) return showEmpty();
  let letter;
  try {
    letter = await decodeLetter(token);
  } catch (e) {
    return showEmpty('This link doesn’t hold a whole letter. It may have been cut short when it was shared.');
  }
  showEnvelope(letter);
}

function showEmpty(message) {
  document.body.dataset.view = 'empty';
  if (message) $('empty-text').textContent = message;
}

// ---------------------------------------------------------------------------
// The envelope

function showEnvelope(letter) {
  document.body.dataset.view = 'envelope';
  const base = median(letter.vit.bpm);
  const initial = (letter.from || '').trim().charAt(0);
  $('seal').innerHTML = sealSvg(letter.wave.v, { initial, bpm: base });
  const to = letter.to ? `For ${esc(letter.to)}` : 'A letter for you';
  const from = letter.from ? `sealed with ${esc(letter.from)}’s heartbeat` : 'sealed with a heartbeat';
  $('envelope-to').innerHTML = to;
  $('envelope-from').innerHTML = from;
  $('envelope-day').textContent = dayLabel(letter.day);
  $('sim-badge').hidden = !letter.sim;
  if (base > 0) $('seal').style.setProperty('--beat', `${(60 / base).toFixed(3)}s`);
  const open = () => openLetter(letter);
  $('seal-button').addEventListener('click', open, { once: true });
}

// ---------------------------------------------------------------------------
// Replay

const state = { speed: 1, sound: false, audio: null, raf: 0, player: null, startedAt: 0, at: 0, paused: false };

function openLetter(letter) {
  document.body.dataset.view = 'breaking';
  setTimeout(() => startReplay(letter), 900);
}

function startReplay(letter) {
  document.body.dataset.view = 'letter';
  const player = new Player(letter);
  state.player = player;
  state.letter = letter;
  state.baseline = median(letter.vit.bpm);
  state.pauses = player.timeline.pauses;
  state.at = 0;
  state.last = performance.now();
  state.nextBeat = 0;
  $('salutation').textContent = letter.to ? `To ${letter.to},` : '';
  $('signature').textContent = '';
  $('letter-day').textContent = dayLabel(letter.day);
  $('replay-sim').hidden = !letter.sim;
  render(true);
  cancelAnimationFrame(state.raf);
  state.raf = requestAnimationFrame(frame);
}

function frame(now) {
  const dt = Math.min(100, now - state.last);
  state.last = now;
  if (!state.paused) state.at += dt * state.speed;
  const p = state.player;
  const changed = p.advance(state.at);
  if (changed) render();
  pulse(now);
  if (p.done) return finish();
  state.raf = requestAnimationFrame(frame);
}

// The heart in the margin beats at the writer's rate at this point in the
// letter; the page rises and falls with their breathing.
function pulse(now) {
  const { letter } = state;
  const t = state.player.writerTime + Math.max(0, state.at - lastOpAt());
  const bpm = bpmAt(letter, t);
  const heart = $('heart');
  $('heart-bpm').textContent = bpm > 0 ? String(bpm) : '·';
  heart.style.color = inkFor(bpm, state.baseline);
  if (bpm > 0 && now >= state.nextBeat) {
    state.nextBeat = now + (60000 / bpm) / Math.max(1, state.speed * 0.6 + 0.4);
    heart.classList.remove('beat');
    void heart.offsetWidth;
    heart.classList.add('beat');
    if (state.sound) thump();
  }
  const br = sampleAt(letter.vit.br, letter.vit.hz, t) / 100;
  $('paper').style.setProperty('--breath', br.toFixed(3));
}

function lastOpAt() {
  const { ops } = state.player.timeline;
  const k = state.player.i - 1;
  return k >= 0 ? ops[k].at : 0;
}

function render() {
  const { player, letter, baseline } = state;
  const chars = player.chars;
  let html = '';
  let i = 0;
  const smileAt = (t) => letter.share.smiles && sampleAt(letter.vit.sm, letter.vit.hz, t) >= 6;
  while (i < chars.length) {
    const t = chars[i].t;
    let j = i;
    let run = '';
    while (j < chars.length && chars[j].t === t) { run += chars[j].ch; j++; }
    const bpm = bpmAt(letter, t);
    const cls = smileAt(t) ? ' class="smiled"' : '';
    run = esc(run).replace(/\n/g, '<br>');
    html += `<span style="color:${inkFor(bpm, baseline)}"${cls}>${run}</span>`;
    i = j;
  }
  $('body-text').innerHTML = html + '<span class="caret" aria-hidden="true"></span>';
  // Long pauses are noted in the margin, in order.
  const notes = state.pauses.filter((pz) => pz.at <= state.at);
  $('pauses').innerHTML = notes.map((pz) => `<li>paused ${formatDuration(pz.ms)}</li>`).join('');
  $('took-back').textContent = letter.share.edits && player.tookBack
    ? `${player.tookBack} character${player.tookBack === 1 ? '' : 's'} taken back`
    : '';
}

function finish() {
  const { letter } = state;
  render();
  $('signature').textContent = letter.from ? `— ${letter.from}` : '';
  document.body.classList.add('finished');
  const s = summarize(letter);
  const rows = [];
  rows.push(`<p class="sum-lead">Written in ${formatDuration(s.writtenMs)}, ${s.words} words.</p>`);
  if (s.low > 0 && s.high > 0) rows.push(`<p>${esc(letter.from || 'Their')}${letter.from ? '’s' : ''} heart ran between <b>${s.low}</b> and <b>${s.high}</b> beats a minute while writing.</p>`);
  if (s.quickest) rows.push(`<p class="q">Quickest at <q>${esc(excerpt(s.quickest.text))}</q> <span>${s.quickest.bpm} bpm</span></p>`);
  if (s.steadiest) rows.push(`<p class="q">Steadiest at <q>${esc(excerpt(s.steadiest.text))}</q> <span>${s.steadiest.bpm} bpm</span></p>`);
  if (s.smiles) rows.push(`<p>${letter.from ? esc(letter.from) : 'They'} smiled ${s.smiles === 1 ? 'once' : `${s.smiles} times`}; the words glow where.</p>`);
  if (s.tookBack) rows.push(`<p>${s.tookBack} characters were written and taken back.</p>`);
  $('summary-body').innerHTML = rows.join('');
  $('summary').hidden = false;
  $('copy-text').onclick = async () => {
    try { await navigator.clipboard.writeText(finalText(letter)); $('copy-text').textContent = 'Copied'; } catch { /* clipboard blocked */ }
  };
}

// ---------------------------------------------------------------------------
// Controls

function thump() {
  if (!state.audio) state.audio = new AudioContext();
  const ctx = state.audio;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.setValueAtTime(64, ctx.currentTime);
  o.frequency.exponentialRampToValueAtTime(38, ctx.currentTime + 0.16);
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
  o.connect(g).connect(ctx.destination);
  o.start();
  o.stop(ctx.currentTime + 0.25);
}

function wireControls() {
  for (const b of document.querySelectorAll('[data-speed]')) {
    b.addEventListener('click', () => {
      state.speed = Number(b.dataset.speed);
      for (const o of document.querySelectorAll('[data-speed]')) o.setAttribute('aria-pressed', String(o === b));
    });
  }
  $('skip').addEventListener('click', () => { if (state.player) state.at = Infinity; });
  $('sound').addEventListener('click', () => {
    state.sound = !state.sound;
    $('sound').setAttribute('aria-pressed', String(state.sound));
    $('sound').textContent = state.sound ? 'Heartbeat sound on' : 'Hear the heartbeat';
  });
  $('replay').addEventListener('click', () => {
    document.body.classList.remove('finished');
    $('summary').hidden = true;
    startReplay(state.letter);
  });
  window.addEventListener('hashchange', () => location.reload());
}

if (typeof document !== 'undefined' && !globalThis.__HW_NO_AUTOBOOT__) {
  wireControls();
  boot();
}
