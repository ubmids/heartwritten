// reader.js
// The page a letter opens in. It reads the letter from the link's #fragment
// (or from the file it was saved into), never from a server, and replays it:
// the words in heart-ink, the heartline drawn down the margin beside them.
// With no letter in the link, the page itself is a letter to the visitor,
// written the same way.

import { decodeLetter, extractToken, finalText } from '../shared/letter-format.js';
import { Player, bpmAt, heat, inkAt, sampleAt, finalChars } from '../shared/playback.js';
import { summarize, median, formatDuration, excerpt } from '../shared/summary.js';
import { sealSvg } from '../shared/seal.js';
import { composeLetter } from '../shared/composeLetter.js';
import { esc, inkHtml, layoutStops, stopAt, drawTrace, foldHeight } from '../shared/sheet.js';

const $ = (id) => document.getElementById(id);
const stillPlease = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function embeddedToken() {
  const el = document.getElementById('letter-data');
  return el ? extractToken(el.textContent.trim()) : null;
}

function dayLabel(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) return '';
  const d = new Date(`${day}T12:00:00`);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

export async function boot() {
  const token = extractToken(location.hash) || embeddedToken();
  if (!token) return showFront();
  let letter;
  try {
    letter = await decodeLetter(token);
  } catch (e) {
    return showFront('This link doesn’t hold a whole letter. It may have been cut short when it was shared. Ask for it again, or for the letter as a file.');
  }
  showEnvelope(letter);
}

// ---------------------------------------------------------------------------
// The front page: a letter to the visitor. Its heartbeat is scripted, and the
// letterhead says so.

const FRONT = [
  ['type', 'Hello,\n\n'],
  ['type', 'This page is a letter, and it is writing itself the way a Heartwritten letter does when someone opens it. '],
  ['bpm', 71], ['type', 'Watch the line in the margin. That is a heartbeat. '],
  ['bpm', 97], ['type', 'Where the writer’s heart sped up, the line climbs and the ink warms, like this. '],
  ['bpm', 56], ['type', 'Then it settles, and the ink cools.\n\n'],
  ['bpm', 66], ['type', 'A real one is written in the Heartwritten app while the camera reads your pulse, your breathing and your smiles. Whoever you send it to watches it written again, at your pace. '],
  ['smile', 0.9], ['type', 'A pencil line marks where you smiled.'], ['smile', 0], ['type', '\n\n'],
  ['type', 'Three things to know.\nYou write on a Mac, with the app.\nNothing is kept but a few numbers a second. Never video.\n'],
  ['type', 'The letter lives only in its link. No server ever holds it.'],
];
const FRONT_SPEED = 1.5;

function showFront(message) {
  document.body.dataset.view = 'empty';
  if (message) {
    $('empty-text').textContent = message;
    $('empty-text').hidden = false;
  }
  $('front-title').hidden = false;
  document.title = message ? 'This link is incomplete · Heartwritten' : 'Heartwritten · letters that carry a heartbeat';
  const { letter } = composeLetter(FRONT, { from: 'Heartwritten' }, { rest: 66, tau: 650, gap: 34 });
  startReplay(letter, { front: true });
  // Nobody should have to wait for the page to finish writing to use it.
  if (stillPlease()) state.at = Infinity;
}

// ---------------------------------------------------------------------------
// The envelope

function showEnvelope(letter) {
  document.body.dataset.view = 'envelope';
  document.title = `${letter.to ? `A letter for ${letter.to}` : 'A letter for you'} · Heartwritten`;
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

const state = {
  speed: 1, sound: false, audio: null, raf: 0, player: null, letter: null, front: false,
  at: 0, last: 0, nextBeat: 0, lastRun: -1, notes: [], hint: null, hinted: false, handsOff: 0, seen: new Set(), notesHtml: '',
};

function openLetter(letter) {
  document.body.dataset.view = 'breaking';
  setTimeout(() => {
    document.body.dataset.view = 'letter';
    startReplay(letter);
  }, 900);
}

function startReplay(letter, { front = false } = {}) {
  // The sheet unfolds once, when it first comes out of the envelope.
  if (!state.player) document.querySelector('.view-letter .sheet-wrap').classList.add('unfolding');
  const player = new Player(letter);
  Object.assign(state, {
    player, letter, front, baseline: median(letter.vit.bpm), at: 0, last: performance.now(), nextBeat: 0, lastRun: -1, hint: null, seen: new Set(), notesHtml: '',
    speed: front ? FRONT_SPEED : state.speed,
  });
  state.notes = marginNotes(letter, player.timeline);
  document.body.classList.remove('finished');
  $('signature').textContent = '';
  $('summary').hidden = true;
  $('front-end').hidden = true;
  $('letter-day').textContent = front ? '' : dayLabel(letter.day);
  $('replay-sim').textContent = front ? 'A demonstration · this page’s heartbeat is simulated' : 'Sample · simulated heartbeat';
  $('replay-sim').hidden = !letter.sim;
  $('pulse').hidden = false;
  $('heart').hidden = false;
  if (!front) fillPostscript(letter);
  buildGhost();
  render();
  cancelAnimationFrame(state.raf);
  state.raf = requestAnimationFrame(frame);
}

// What gets pencilled in the margin: long pauses, and words taken back.
function marginNotes(letter, timeline) {
  const notes = timeline.pauses.map((pz) => ({ kind: 'pause', at: pz.at, pos: pz.pos, text: `paused ${formatDuration(pz.ms)}` }));
  if (letter.share.edits) {
    let run = null;
    for (const op of timeline.ops) {
      if (op.del > 0) {
        if (!run) { run = { kind: 'back', n: 0 }; notes.push(run); }
        run.n += op.del; run.at = op.at; run.pos = op.pos + op.ins.length;
        run.text = `took back ${run.n} character${run.n === 1 ? '' : 's'}`;
      } else run = null;
    }
  }
  return notes.sort((a, b) => a.at - b.at);
}

function frame(now) {
  const dt = Math.min(100, now - state.last);
  state.last = now;
  state.at += dt * state.speed;
  const p = state.player;
  if (p.advance(state.at)) render();
  pulse(now);
  if (p.done) return finish();
  state.raf = requestAnimationFrame(frame);
}

// The mark at the pen's tip beats at the writer's rate at this point in the
// letter, the figure under it says the rate, and the strip swells with their
// breathing.
function pulse(now) {
  const { letter } = state;
  const t = state.player.writerTime + Math.max(0, state.at - lastOpAt());
  const bpm = bpmAt(letter, t);
  const heart = $('heart');
  $('heart-bpm').textContent = bpm > 0 ? String(bpm) : '·';
  $('strip').style.setProperty('--pulse-ink', inkAt(heat(bpm, state.baseline)));
  if (bpm > 0 && now >= state.nextBeat) {
    state.nextBeat = now + (60000 / bpm) / Math.max(1, state.speed * 0.6 + 0.4);
    heart.classList.remove('beat');
    void heart.offsetWidth;
    heart.classList.add('beat');
    if (state.sound) thump();
  }
  const br = sampleAt(letter.vit.br, letter.vit.hz, t) / 100;
  $('strip').style.setProperty('--b', ((br + 1) / 2).toFixed(3));
}

function lastOpAt() {
  const { ops } = state.player.timeline;
  const k = state.player.i - 1;
  return k >= 0 ? ops[k].at : 0;
}

// Characters -> what the sheet draws: each with its heat, and whether the
// writer was smiling.
function unitsFor(chars, { newest = -1 } = {}) {
  const { letter, baseline } = state;
  const smiles = letter.share.smiles;
  return chars.map((c) => ({
    ch: c.ch,
    heat: heat(bpmAt(letter, c.t), baseline),
    smile: smiles && sampleAt(letter.vit.sm, letter.vit.hz, c.t) >= 6,
    wet: c.t === newest,
  }));
}

function marksFor(notes, length) {
  const marks = new Map();
  for (const note of notes) {
    const at = Math.min(length, Math.max(0, note.pos));
    note.index = at;
    marks.set(at, `${marks.get(at) || ''}<span class="pz-mark" data-k="${note.k}" data-note="${esc(note.text)}"></span>`);
  }
  return marks;
}

function render() {
  const { player, letter } = state;
  const chars = player.chars;
  const newest = chars.reduce((m, c) => Math.max(m, c.t), -1);
  const fresh = newest > state.lastRun && !player.done;
  state.lastRun = newest;
  const units = unitsFor(chars, { newest: fresh ? newest : -2 });

  // The one-time hint, the first time the ink clearly warms.
  if (!state.front && !state.hinted) {
    const warm = units.findIndex((u) => u.heat >= 0.45);
    if (warm !== -1) {
      state.hinted = true;
      const who = letter.from ? `${letter.from}’s` : 'their';
      state.hint = { kind: 'hint', at: 0, pos: warm, text: `the ink warms where ${who} heart sped up` };
      $('ink-hint').textContent = state.hint.text;
      $('ink-hint').hidden = false;
    }
  }
  const notes = state.notes.filter((n) => n.at <= state.at);
  notes.forEach((n, k) => { n.k = k; });
  const marks = marksFor(notes, chars.length);

  const body = $('body-text');
  body.innerHTML = `${inkHtml(units, marks)}<span class="caret" aria-hidden="true"></span>`;
  const last = units[units.length - 1];
  if (last) body.style.setProperty('--caret', inkAt(last.heat));

  // The heartline beside the lines, the pen's tip, and the notes.
  const { stops, lineH } = layoutStops(body, units.map((u) => u.heat));
  const top = body.offsetTop || 0;
  const narrow = ($('strip').clientWidth || 108) < 84;
  const rests = notes.filter((n) => n.kind === 'pause').map((n) => {
    const s = stopAt(stops, n.index - 1);
    return s ? { y: s.y, len: narrow ? 10 : 15 } : null;
  }).filter(Boolean);
  const head = drawTrace($('trace'), $('strip'), stops, { top, rests });
  const penY = head ? head.y : top + lineH * 0.5;
  if (head) { $('heart').style.left = `${head.x.toFixed(1)}px`; $('heart').style.top = `${head.y.toFixed(1)}px`; }
  $('heart').hidden = !head || player.done;
  $('pulse').style.top = `${(penY + 11).toFixed(1)}px`;

  // Pencil notes hang in the right margin beside their line. The list is
  // only redrawn when it changes, so a note fades in once and then stays put.
  const pencilled = state.hint ? [...notes, state.hint] : notes;
  let floor = 0;
  const added = [];
  const html = pencilled
    .map((n) => ({ n, s: stopAt(stops, n.kind === 'hint' ? n.pos : n.index - 1) }))
    .sort((a, b) => (a.s ? a.s.line : 0) - (b.s ? b.s.line : 0))
    .map(({ n, s }) => {
      const y = Math.max(floor, top + (s ? s.line : 0) * lineH + 4);
      floor = y + (n.kind === 'hint' ? 68 : 44);
      const isNew = !state.seen.has(n.text);
      if (isNew) added.push(n.text);
      return `<li class="${n.kind}${isNew ? ' new' : ''}" style="top:${y.toFixed(0)}px">${esc(n.text)}</li>`;
    }).join('');
  if (added.length || html.replace(/ new"/g, '"') !== state.notesHtml) {
    $('pauses').innerHTML = html;
    state.notesHtml = html.replace(/ new"/g, '"');
    added.forEach((t) => state.seen.add(t));
  }

  fold();
  follow();
}

// A finished copy of the sheet, never shown, so the page knows how tall the
// letter will stand and where its folds fall.
function buildGhost() {
  const { letter, front } = state;
  const chars = finalChars(letter);
  const all = state.notes.map((n, k) => ({ ...n, k }));
  const page = $('page').cloneNode(true);
  for (const el of [page, ...page.querySelectorAll('[id]')]) el.removeAttribute('id');
  page.querySelector('.body-text').innerHTML = inkHtml(unitsFor(chars), marksFor(all, chars.length));
  page.querySelector('.signature').textContent = letter.from || '';
  page.querySelector('.postscript').hidden = front;
  page.querySelector('.front-end').hidden = !front;
  const ghost = $('ghost');
  ghost.innerHTML = '<div class="strip"></div>';
  ghost.appendChild(page);
}

// The sheet opens a third at a time, as the writing reaches each crease.
function fold() {
  const paper = $('paper');
  const body = $('body-text');
  const full = $('ghost').offsetHeight;
  if (!full) return;
  const done = state.player.done;
  const page = $('page');
  const need = done ? page.offsetTop + page.offsetHeight : body.offsetTop + body.offsetHeight + 100;
  const { height, panel } = foldHeight(need, Math.max(full, done ? need : 0), done);
  paper.style.height = `${Math.round(height)}px`;
  [$('crease-1'), $('crease-2')].forEach((c, k) => {
    c.hidden = !panel || height < panel * (k + 1) + 44;
    c.style.top = `${Math.round(panel * (k + 1))}px`;
  });
}

// Keep the line being written in view, unless the reader is scrolling.
function follow() {
  const caret = document.querySelector('#body-text .caret');
  if (!caret || performance.now() < state.handsOff || (state.front && stillPlease())) return;
  const r = caret.getBoundingClientRect();
  const room = window.innerHeight - 190;
  if (r.bottom > room) window.scrollBy({ top: r.bottom - room + 70, behavior: stillPlease() ? 'auto' : 'smooth' });
}

function fillPostscript(letter) {
  const s = summarize(letter);
  const base = state.baseline;
  const who = letter.from ? esc(letter.from) : 'They';
  const whose = letter.from ? `${esc(letter.from)}’s` : 'their';
  const rows = [];
  const range = s.low > 0 && s.high > s.low ? `, with ${whose} heart between ${s.low} and ${s.high} beats a minute` : '';
  rows.push(`<p class="lead">Written in ${formatDuration(s.writtenMs)}, ${s.words} words${range}.</p>`);
  if (s.quickest) rows.push(`<p>Quickest at <q style="color:${inkAt(heat(s.quickest.bpm, base))}">${esc(excerpt(s.quickest.text))}</q><span class="bpm-tag">${s.quickest.bpm} a minute</span></p>`);
  if (s.steadiest) rows.push(`<p>Steadiest at <q style="color:${inkAt(heat(s.steadiest.bpm, base))}">${esc(excerpt(s.steadiest.text))}</q><span class="bpm-tag">${s.steadiest.bpm} a minute</span></p>`);
  const extra = [];
  if (s.smiles) extra.push(`${who} smiled ${s.smiles === 1 ? 'once' : s.smiles === 2 ? 'twice' : `${s.smiles} times`}. Those words are underlined in pencil.`);
  if (s.tookBack) extra.push(`${s.tookBack} character${s.tookBack === 1 ? ' was' : 's were'} written and taken back.`);
  if (extra.length) rows.push(`<p>${extra.join(' ')}</p>`);
  $('summary-body').innerHTML = rows.join('');
  $('copy-text').textContent = 'Copy the words';
  $('copy-text').onclick = async () => {
    try { await navigator.clipboard.writeText(finalText(letter)); $('copy-text').textContent = 'Copied'; } catch { /* clipboard blocked */ }
  };
}

function finish() {
  const { letter, front } = state;
  document.body.classList.add('finished');
  $('signature').textContent = letter.from || '';
  $(front ? 'front-end' : 'summary').hidden = false;
  render();
  if (front) return;
  const ps = $('summary').getBoundingClientRect();
  if (ps.top > window.innerHeight * 0.6 && performance.now() >= state.handsOff) {
    window.scrollBy({ top: ps.top - window.innerHeight * 0.45, behavior: stillPlease() ? 'auto' : 'smooth' });
  }
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
    window.scrollTo({ top: 0 });
    startReplay(state.letter);
  });
  const handsOff = () => { state.handsOff = performance.now() + 4000; };
  window.addEventListener('wheel', handsOff, { passive: true });
  window.addEventListener('touchmove', handsOff, { passive: true });
  window.addEventListener('hashchange', () => location.reload());
  const relayout = () => { if (state.player) render(); };
  $('write-entry').addEventListener('toggle', relayout);
  window.addEventListener('resize', relayout);
  // The embedded font can land a moment after the first lines are drawn.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);
  // And the sheet is measured properly once it has finished unfolding.
  const wrap = document.querySelector('.view-letter .sheet-wrap');
  wrap.addEventListener('animationend', (e) => { if (e.target === wrap) { wrap.classList.remove('unfolding'); relayout(); } });
}

if (typeof document !== 'undefined' && !globalThis.__HW_NO_AUTOBOOT__) {
  wireControls();
  boot();
}
