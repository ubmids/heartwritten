// heartline.js
// The whole letter's heart rate drawn as one thin line of ink, the way a pen
// would trace it under a signature. Each stretch takes the ink colour the
// heart gave the words written then. Returns an SVG string.

import { inkFor } from './playback.js';
import { median } from './summary.js';

function smooth(xs, r) {
  return xs.map((_, i) => {
    let s = 0; let n = 0;
    for (let k = i - r; k <= i + r; k++) if (xs[k] > 0) { s += xs[k]; n++; }
    return n ? s / n : 0;
  });
}

/**
 * @param {object} letter decoded letter
 * @param {object} [o]
 * @param {number} [o.width=640]
 * @param {number} [o.height=56]
 * @param {string} [o.id='hl'] prefix for ids inside the SVG
 * @param {number} [o.stroke=1.6]
 */
export function heartlineSvg(letter, { width = 640, height = 56, id = 'hl', stroke = 1.6 } = {}) {
  const raw = letter.vit.bpm || [];
  const base = median(raw);
  const pts = smooth(raw, Math.max(1, Math.round((letter.vit.hz || 4) * 1.5)));
  const live = pts.filter((v) => v > 0);
  if (live.length < 4) return '';
  let lo = Math.min(...live); let hi = Math.max(...live);
  if (hi - lo < 8) { const m = (hi + lo) / 2; lo = m - 4; hi = m + 4; }
  const pad = stroke * 2;
  const n = pts.length;
  const x = (i) => (n > 1 ? (i / (n - 1)) * width : 0);
  const y = (v) => pad + (1 - (v - lo) / (hi - lo)) * (height - pad * 2);

  // Group into runs of about one colour so the SVG stays small.
  const step = Math.max(1, Math.floor(n / 160));
  const segs = [];
  let cur = null;
  for (let i = 0; i < n; i += step) {
    const v = pts[i];
    if (!(v > 0)) { cur = null; continue; }
    const colour = inkFor(raw[i] > 0 ? raw[i] : v, base);
    const p = `${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
    if (cur && cur.colour === colour) cur.d.push(p);
    else {
      const d = cur ? [cur.d[cur.d.length - 1], p] : [p];
      cur = { colour, d };
      segs.push(cur);
    }
  }
  const paths = segs
    .filter((s) => s.d.length > 1)
    .map((s) => `<path d="M${s.d.join(' L')}" stroke="${s.colour}" vector-effect="non-scaling-stroke"/>`)
    .join('');
  return `<svg class="heartline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="The writer’s heart rate across the letter, from ${Math.round(lo)} to ${Math.round(hi)} beats a minute">`
    + `<defs><clipPath id="${id}-drawn"><rect id="${id}-reveal" x="0" y="0" width="${width}" height="${height}"/></clipPath></defs>`
    + `<g clip-path="url(#${id}-drawn)" fill="none" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${paths}</g>`
    + '</svg>';
}

/** Fraction of the heartline that covers the writer's time t (ms). */
export function heartlineAt(letter, t) {
  const n = (letter.vit.bpm || []).length;
  if (n < 2) return 1;
  const i = (t / 1000) * (letter.vit.hz || 4);
  return Math.max(0, Math.min(1, i / (n - 1)));
}
