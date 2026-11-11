// reader.js
// The page a letter opens in. It reads the letter from the link's #fragment
// (or from the file it was saved into), never from a server, and replays it.

import { decodeLetter, extractToken, finalText } from '../shared/letter-format.js';
import { Player, bpmAt, inkFor, sampleAt } from '../shared/playback.js';
import { summarize, median, formatDuration, excerpt } from '../shared/summary.js';
import { sealSvg } from '../shared/seal.js';
import { heartlineSvg, heartlineAt } from '../shared/heartline.js';

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
  if (message) {
    $('empty-text').textContent = message;
    $('empty-text').hidden = false;
  }
  inkSpecimen();
}

// The front page's specimen: a few lines of the sample letter in the ink a
// rising heartbeat gives them, over the heartline that drew them.
const SPECIMEN = [
  ['So, slowly: ', 66],
  ['they called this morning. ', 79],
  ['I got it. I actually got it!', 91, true],
  [' You were the first person I wanted to tell.', 84],
];
function inkSpecimen() {
  const text = $('specimen-text');
  if (!text || text.dataset.inked) return;
  text.dataset.inked = '1';
  text.innerHTML = SPECIMEN
    .map(([s, bpm, smiled]) => `<span style="color:${inkFor(bpm, 66)}"${smiled ? ' class="smiled"' : ''}>${esc(s)}</span>`)
    .join('');
  // A long calm stretch first, so the line's baseline matches the text's (66).
  const bpm = new Array(40).fill(66);
  for (const [, b] of SPECIMEN.slice(1)) for (let i = 0; i < 12; i++) bpm.push(b);
  for (let i = 0; i < 10; i++) bpm.push(70);
  const curve = bpm.map((b, i) => Math.round(b + Math.sin(i / 2.2) * 1.5));
  $('specimen-line').innerHTML = heartlineSvg({ vit: { bpm: curve, hz: 2 } }, { id: 'sp', height: 40 });
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
  $('open-letter').addEventListener('click', () => $('seal-button').click(), { once: true });
}

// ---------------------------------------------------------------------------
// Replay

const state = { lastRun: -1, speed: 1, sound: false, audio: null, raf: 0, player: null, startedAt: 0, at: 0, paused: false };

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
  $('signature').textContent = '';
  $('letter-day').textContent = dayLabel(letter.day);
  $('replay-sim').hidden = !letter.sim;
  $('heartline').innerHTML = heartlineSvg(letter, { id: 'hl' });
  $('heartline-who').textContent = letter.from ? `${letter.from}’s heart while writing` : 'Their heart while writing';
  const s = summarize(letter);
  $('heartline-range').textContent = s.low > 0 && s.high > 0 ? `${s.low} to ${s.high} beats a minute` : '';
  state.lastRun = -1;
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
  const reveal = document.getElementById('hl-reveal');
  if (reveal) reveal.setAttribute('width', String(640 * (state.player.done ? 1 : heartlineAt(letter, t))));
}

function lastOpAt() {
  const { ops } = state.player.timeline;
  const k = state.player.i - 1;
  return k >= 0 ? ops[k].at : 0;
}

function render() {
  const { player, letter, baseline } = state;
  const chars = player.chars;
  // Long pauses are noted in the margin, beside the line they happened on.
  const notes = state.pauses.filter((pz) => pz.at <= state.at);
  const marks = new Map();
  notes.forEach((pz, k) => {
    const at = Math.min(chars.length, Math.max(0, pz.pos));
    if (!marks.has(at)) marks.set(at, k);
  });
  const newest = chars.reduce((m, c) => Math.max(m, c.t), -1);
  const fresh = newest > state.lastRun;
  let html = '';
  let i = 0;
  let caret = '';
  const smileAt = (t) => letter.share.smiles && sampleAt(letter.vit.sm, letter.vit.hz, t) >= 6;
  while (i < chars.length) {
    if (marks.has(i)) html += `<span class="pz-mark" data-k="${marks.get(i)}"></span>`;
    const t = chars[i].t;
    let j = i;
    let run = '';
    while (j < chars.length && chars[j].t === t && (j === i || !marks.has(j))) { run += chars[j].ch; j++; }
    const ink = inkFor(bpmAt(letter, t), baseline);
    const cls = [smileAt(t) ? 'smiled' : '', fresh && t === newest && !state.player.done ? 'wet' : ''].filter(Boolean).join(' ');
    run = esc(run).replace(/\n/g, '<br>');
    html += `<span style="color:${ink}"${cls ? ` class="${cls}"` : ''}>${run}</span>`;
    if (t === newest) caret = ink;
    i = j;
  }
  if (marks.has(chars.length)) html += `<span class="pz-mark" data-k="${marks.get(chars.length)}"></span>`;
  state.lastRun = newest;
  $('body-text').innerHTML = html + '<span class="caret" aria-hidden="true"></span>';
  if (caret) $('body-text').style.setProperty('--caret', caret);
  $('pauses').innerHTML = notes.map((pz, k) => `<li data-k="${k}">paused ${formatDuration(pz.ms)}</li>`).join('');
  placeNotes();
  $('took-back').textContent = letter.share.edits && player.tookBack
    ? `${player.tookBack} character${player.tookBack === 1 ? '' : 's'} taken back`
    : '';
}

// Lines the margin notes up with the words they belong to.
function placeNotes() {
  const paper = $('paper');
  let floor = 0;
  for (const li of document.querySelectorAll('#pauses li')) {
    const mark = paper.querySelector(`.pz-mark[data-k="${li.dataset.k}"]`);
    if (!mark) { li.hidden = true; continue; }
    const top = Math.max(floor, mark.offsetTop + 4);
    li.style.top = `${top}px`;
    floor = top + 40;
  }
}

function finish() {
  const { letter } = state;
  render();
  $('signature').textContent = letter.from || '';
  const reveal = document.getElementById('hl-reveal');
  if (reveal) reveal.setAttribute('width', '640');
  document.body.classList.add('finished');
  const s = summarize(letter);
  const base = state.baseline;
  const who = letter.from ? esc(letter.from) : 'They';
  const rows = [];
  const lead = [`Written in ${formatDuration(s.writtenMs)}`, `${s.words} words`];
  rows.push(`<p class="lead">${lead.join(', ')}.</p>`);
  if (s.quickest) rows.push(`<p>Quickest at <q style="color:${inkFor(s.quickest.bpm, base)}">${esc(excerpt(s.quickest.text))}</q><span class="bpm-tag">${s.quickest.bpm} a minute</span></p>`);
  if (s.steadiest) rows.push(`<p>Steadiest at <q style="color:${inkFor(s.steadiest.bpm, base)}">${esc(excerpt(s.steadiest.text))}</q><span class="bpm-tag">${s.steadiest.bpm} a minute</span></p>`);
  const extra = [];
  if (s.smiles) extra.push(`${who} smiled ${s.smiles === 1 ? 'once' : s.smiles === 2 ? 'twice' : `${s.smiles} times`}, and the words glow where.`);
  if (s.tookBack) extra.push(`${s.tookBack} characters were written and taken back.`);
  if (extra.length) rows.push(`<p>${extra.join(' ')}</p>`);
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
  window.addEventListener('resize', () => { if (state.player) placeNotes(); });
}

if (typeof document !== 'undefined' && !globalThis.__HW_NO_AUTOBOOT__) {
  wireControls();
  boot();
}
