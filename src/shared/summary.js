// summary.js
// The closing card a reader sees: how long the letter took, where the
// writer's heart was quickest and steadiest, and how often they smiled.
// Wellness wording only: these are camera estimates for feeling, not medicine.

import { bpmAt, finalChars } from './playback.js';

export function median(xs) {
  const v = xs.filter((x) => x > 0).sort((a, b) => a - b);
  if (!v.length) return 0;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2);
}

function percentile(xs, p) {
  const v = xs.filter((x) => x > 0).sort((a, b) => a - b);
  if (!v.length) return 0;
  return v[Math.min(v.length - 1, Math.max(0, Math.round((p / 100) * (v.length - 1))))];
}

/** Split text into sentences with their start/end indices. */
export function sentences(text) {
  const out = [];
  const re = /[^.!?\n]+[.!?]*["”’)]*|\n+/g;
  let m;
  while ((m = re.exec(text))) {
    const raw = m[0];
    const lead = raw.length - raw.trimStart().length;
    const s = raw.trim();
    if (!s) continue;
    out.push({ text: s, start: m.index + lead, end: m.index + lead + s.length });
  }
  return out;
}

export function summarize(letter) {
  const chars = finalChars(letter);
  const text = chars.map((c) => c.ch).join('');
  const baseline = median(letter.vit.bpm);
  const scored = [];
  for (const s of sentences(text)) {
    if (s.text.replace(/\W/g, '').length < 12) continue;   // too short to mean much
    const bs = [];
    for (let i = s.start; i < s.end; i++) {
      const b = bpmAt(letter, chars[i].t);
      if (b > 0) bs.push(b);
    }
    if (bs.length < 6) continue;
    scored.push({ text: s.text, bpm: Math.round(bs.reduce((a, b) => a + b, 0) / bs.length) });
  }
  let quickest = null;
  let steadiest = null;
  for (const s of scored) {
    if (!quickest || s.bpm > quickest.bpm) quickest = s;
    if (!steadiest || s.bpm < steadiest.bpm) steadiest = s;
  }
  // Only call out a difference that is actually there.
  if (quickest && steadiest && quickest.bpm - steadiest.bpm < 4) { quickest = null; steadiest = null; }
  if (quickest && quickest === steadiest) steadiest = null;

  let smiles = 0;
  const sm = letter.vit.sm;
  for (let i = 0; i < sm.length; i++) {
    if (sm[i] >= 6 && (i === 0 || sm[i - 1] < 6)) smiles++;
  }

  const ops = letter.ops;
  const writtenMs = ops.length ? ops[ops.length - 1][0] : 0;
  return {
    words: (text.match(/\S+/g) || []).length,
    writtenMs,
    baseline,
    low: percentile(letter.vit.bpm, 5),
    high: percentile(letter.vit.bpm, 95),
    quickest,
    steadiest,
    smiles: letter.share.smiles ? smiles : null,
    tookBack: letter.share.edits ? ops.reduce((n, op) => n + op[2], 0) : null,
  };
}

export function formatDuration(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} second${s === 1 ? '' : 's'}`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 60) return r ? `${m} min ${r} s` : `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
}

/** Short excerpt for quoting a sentence on the closing card. */
export function excerpt(s, max = 64) {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return `${cut.slice(0, sp > max * 0.6 ? sp : max).trimEnd()}…`;
}
