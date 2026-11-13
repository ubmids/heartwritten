// playback.js
// Replays a letter: the words reappear at the pace they were written, long
// pauses are shortened (but remembered), and every character keeps the
// heart rate its writer had when it was typed. Pure logic; the reader page
// draws what this returns.

import { finalText } from './letter-format.js';

export const DEFAULTS = {
  maxGapMs: 1400,        // no silence in the replay lasts longer than this
  longPauseMs: 8000,     // pauses longer than this get a quiet note in the margin
  speed: 1,              // 1 = the writer's real typing pace (after gap capping)
};

/**
 * Build the replay timeline. Returns
 * { ops: [{at, t, pos, del, ins}], pauses: [{at, t, ms, pos}], duration, writtenMs }
 * where `t` is the writer's real time and `at` the replay time.
 */
export function buildTimeline(letter, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const ops = [];
  const pauses = [];
  let at = 0;
  let prevT = null;
  let len = 0;
  for (const [t, pos, del, ins = ''] of letter.ops) {
    if (prevT != null) {
      const gap = t - prevT;
      at += Math.min(gap, o.maxGapMs) / o.speed;
      if (gap >= o.longPauseMs) pauses.push({ at, t: prevT, ms: gap, pos });
    } else {
      at = 600 / o.speed;   // a beat of stillness before the first word
    }
    // Long pastes would appear all at once; spread them like typing.
    if (ins.length > 12 && del === 0) {
      const chunk = 3;
      for (let k = 0; k < ins.length; k += chunk) {
        ops.push({ at: at + (k / chunk) * (24 / o.speed), t, pos: pos + k, del: 0, ins: ins.slice(k, k + chunk) });
      }
      at += Math.ceil(ins.length / chunk) * (24 / o.speed);
    } else {
      ops.push({ at, t, pos, del, ins });
    }
    len = len - del + ins.length;
    prevT = t;
  }
  const writtenMs = letter.ops.length ? letter.ops[letter.ops.length - 1][0] - letter.ops[0][0] : 0;
  return { ops, pauses, duration: at, writtenMs, length: len };
}

/** Value of a sampled series at writer-time t (ms). */
export function sampleAt(series, hz, tMs) {
  if (!series || !series.length) return 0;
  const i = Math.min(series.length - 1, Math.max(0, Math.floor((tMs / 1000) * hz)));
  return series[i];
}

/** Heart rate at writer-time t, looking a little either side when unknown. */
export function bpmAt(letter, tMs) {
  const { bpm, hz } = letter.vit;
  if (!bpm.length) return 0;
  const i = Math.min(bpm.length - 1, Math.max(0, Math.floor((tMs / 1000) * hz)));
  for (let d = 0; d < hz * 4; d++) {
    if (bpm[i - d] > 0) return bpm[i - d];
    if (bpm[i + d] > 0) return bpm[i + d];
  }
  return 0;
}

/**
 * Incremental player. Call advance(atMs) every frame; it applies every op
 * due by then and reports what changed.
 */
export class Player {
  constructor(letter, opts) {
    this.letter = letter;
    this.timeline = buildTimeline(letter, opts);
    this.reset();
  }

  reset() {
    this.i = 0;
    this.chars = [];      // [{ch, t}] the visible text, each char with its typing time
    this.at = 0;
    this.tookBack = 0;
  }

  get done() { return this.i >= this.timeline.ops.length; }

  /** Writer-time currently being replayed. */
  get writerTime() {
    const ops = this.timeline.ops;
    if (!ops.length) return 0;
    const k = Math.min(this.i, ops.length) - 1;
    return k < 0 ? ops[0].t : ops[k].t;
  }

  advance(atMs) {
    this.at = atMs;
    const ops = this.timeline.ops;
    let changed = false;
    while (this.i < ops.length && ops[this.i].at <= atMs) {
      const { t, pos, del, ins } = ops[this.i++];
      this.chars.splice(pos, del, ...splitUnits(ins, t));
      this.tookBack += del;
      changed = true;
    }
    return changed;
  }

  text() { return this.chars.map((c) => c.ch).join(''); }
}

function splitUnits(s, t) {
  // One entry per UTF-16 unit, to stay aligned with editor positions. The two
  // halves of an emoji share a time, so the reader draws them in one run.
  const out = [];
  for (let k = 0; k < s.length; k++) out.push({ ch: s[k], t });
  return out;
}

/**
 * How far a heartbeat sits from the writer's own usual level, from -1
 * (slower) through 0 (their usual) to 1 (much quicker). Everything the page
 * draws from the heart, the ink and the margin line, starts from this number.
 */
export const HEAT_SPAN = 14;   // beats a minute above the usual that count as "racing"

export function heat(bpm, baseline) {
  if (!(bpm > 0) || !(baseline > 0)) return 0;
  return Math.max(-1, Math.min(1, (bpm - baseline) / HEAT_SPAN));
}

/**
 * Ink colour. At the writer's usual heart rate the ink is iron-gall
 * blue-black. A quicker heart warms it through claret to vermilion; a slower
 * one cools it to a clear blue. Every stop passes WCAG AA on the paper.
 */
export const INK = {
  calm: [28, 34, 52],
  warm: [[140, 24, 44], [190, 48, 14]],
  cool: [24, 78, 160],
};

export function inkAt(h) {
  const rgb = (c) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
  const d = Math.max(-1, Math.min(1, h || 0));
  const mix = (a, b, f) => a.map((x, k) => Math.round(x + (b[k] - x) * f));
  if (d < 0) return rgb(mix(INK.calm, INK.cool, -d));
  if (d <= 0.5) return rgb(mix(INK.calm, INK.warm[0], d / 0.5));
  return rgb(mix(INK.warm[0], INK.warm[1], (d - 0.5) / 0.5));
}

export function inkFor(bpm, baseline) {
  return inkAt(heat(bpm, baseline));
}

/**
 * How much the ink feathers into the paper: 0 (crisp) to 3 (a soft bleed).
 * Only a quick heart feathers; calm and slow ink stays crisp.
 */
export function featherAt(h) {
  if (!(h > 0.3)) return 0;
  return h < 0.55 ? 1 : h < 0.8 ? 2 : 3;
}

/** Final characters of the letter, each with the time it was typed. */
export function finalChars(letter) {
  const p = new Player(letter, { maxGapMs: Infinity });
  p.advance(Infinity);
  return p.chars;
}

export { finalText };
