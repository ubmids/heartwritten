// recorder.js
// Records a letter while it is being written: every edit with its time, and
// the writer's signals sampled on a fixed clock. Pure logic, no DOM, so it is
// tested in Node.

import { FORMAT_VERSION } from './letter-format.js';

export const VITALS_HZ = 4;      // signals are sampled four times a second
export const WAVE_HZ = 30;       // the pulse wave kept for the seal
export const WAVE_SECONDS = 6;

/**
 * Smallest single edit that turns `prev` into `next`:
 * returns { pos, del, ins } or null when nothing changed.
 * Works for typing, backspace, paste, cut, autocorrect and IME commits.
 * With repeated characters ("aa" -> "aaa") the reported position may be one
 * of several equivalent ones; the resulting text is the same either way.
 */
export function diffText(prev, next) {
  if (prev === next) return null;
  let start = 0;
  const max = Math.min(prev.length, next.length);
  while (start < max && prev[start] === next[start]) start++;
  let endPrev = prev.length;
  let endNext = next.length;
  while (endPrev > start && endNext > start && prev[endPrev - 1] === next[endNext - 1]) {
    endPrev--; endNext--;
  }
  return { pos: start, del: endPrev - start, ins: next.slice(start, endNext) };
}

export class LetterRecorder {
  constructor({ now = () => Date.now() } = {}) {
    this._now = now;
    this.reset();
  }

  reset() {
    this.t0 = null;
    this.text = '';
    this.charTimes = [];     // insertion time of each character of `text`
    this.ops = [];
    this.samples = { bpm: [], br: [], sm: [] };
    this.wave = [];          // rolling pulse wave, values -127..127
    this.tookBack = 0;       // characters deleted along the way
  }

  /** ms since the first keystroke (or since start() was called). */
  elapsed() {
    if (this.t0 == null) return 0;
    return Math.max(0, this._now() - this.t0);
  }

  start() { if (this.t0 == null) this.t0 = this._now(); }

  /** Feed the full editor value after every input event. */
  edit(nextText) {
    this.start();
    const d = diffText(this.text, nextText);
    if (!d) return null;
    const t = this.elapsed();
    const last = this.ops[this.ops.length - 1];
    const tRounded = Math.max(Math.round(t), last ? last[0] : 0);
    this.ops.push([tRounded, d.pos, d.del, d.ins]);
    this.charTimes.splice(d.pos, d.del, ...new Array(d.ins.length).fill(tRounded));
    this.tookBack += d.del;
    this.text = nextText;
    return d;
  }

  /**
   * Called on the sampling clock with the latest live signals.
   * bpm: number|null, breath: -1..1|null, smile: 0..1|null
   */
  sample({ bpm, breath, smile }) {
    if (this.t0 == null) return;
    const due = Math.floor((this.elapsed() / 1000) * VITALS_HZ) + 1;
    while (this.samples.bpm.length < due) {
      this.samples.bpm.push(bpm > 0 ? Math.round(bpm) : 0);
      this.samples.br.push(breath == null ? 0 : clampInt(breath * 100, -100, 100));
      this.samples.sm.push(smile == null ? 0 : clampInt(smile * 9, 0, 9));
    }
  }

  /** Append pulse-wave samples (already resampled to WAVE_HZ, any scale). */
  pushWave(values) {
    for (const v of values) this.wave.push(v);
    const keep = WAVE_HZ * 20;
    if (this.wave.length > keep) this.wave.splice(0, this.wave.length - keep);
  }

  /**
   * Seal the letter. With share.edits off, the deletions are dropped and
   * the letter is rebuilt as if each final character had been typed once,
   * at the time it was typed.
   */
  finish({ from = '', to = '', day = '', sim = false, share = { edits: false, smiles: true } } = {}) {
    const ops = share.edits ? this.ops.map((o) => o.slice()) : opsFromCharTimes(this.text, this.charTimes);
    const sm = share.smiles ? this.samples.sm.slice() : this.samples.sm.map(() => 0);
    return {
      v: FORMAT_VERSION,
      from: from.slice(0, 80),
      to: to.slice(0, 80),
      day,
      sim: sim ? 1 : 0,
      share: { edits: !!share.edits, smiles: !!share.smiles },
      ops,
      vit: { hz: VITALS_HZ, bpm: this.samples.bpm.slice(), br: this.samples.br.slice(), sm },
      wave: { hz: WAVE_HZ, v: normalizeWave(this.wave.slice(-WAVE_HZ * WAVE_SECONDS)) },
    };
  }
}

/**
 * Rebuild a forward-only edit list from the final text and the time each
 * character was typed: characters appear in the order they were typed, each
 * at its place in the final text. Runs typed at the same moment are merged.
 */
export function opsFromCharTimes(text, times) {
  // Work in UTF-16 indices to stay aligned with the editor's value.
  const idx = Array.from({ length: text.length }, (_, i) => i);
  idx.sort((a, b) => times[a] - times[b] || a - b);
  const ops = [];
  // Fenwick tree for "how many revealed characters sit before index i".
  const tree = new Int32Array(text.length + 1);
  const add = (i) => { for (i++; i <= text.length; i += i & -i) tree[i]++; };
  const before = (i) => { let s = 0; for (; i > 0; i -= i & -i) s += tree[i]; return s; };
  for (const i of idx) {
    const pos = before(i);
    const t = times[i];
    const last = ops[ops.length - 1];
    if (last && last[0] === t && last[1] + last[3].length === pos) {
      last[3] += text[i];
    } else {
      ops.push([t, pos, 0, text[i]]);
    }
    add(i);
  }
  return ops;
}

/** Scale a wave to integers in -100..100 around its median. */
export function normalizeWave(values) {
  const vals = values.filter((v) => Number.isFinite(v));
  if (vals.length < 2) return [];
  const sorted = [...vals].sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)];
  let span = 0;
  for (const v of vals) span = Math.max(span, Math.abs(v - med));
  if (span === 0) return vals.map(() => 0);
  return vals.map((v) => clampInt(((v - med) / span) * 100, -100, 100));
}

function clampInt(x, lo, hi) {
  return Math.max(lo, Math.min(hi, Math.round(x)));
}
