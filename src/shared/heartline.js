// heartline.js
// The margin heartline: one continuous pulse trace that runs down the strip
// of chart paper bound into the left of the letter. Each line of writing sits
// beside the stretch of trace drawn while it was written. Where the heart was
// quicker the beats stand taller, closer together and warmer; where the
// writer stopped to think, the pen rests and the line goes quiet.
//
// A letter keeps the heart rate four times a second, not every beat, so the
// beats are drawn from the rate: their spacing and height follow it. Pure
// logic, no DOM: it turns positions down the page into SVG paths.

import { inkAt } from './playback.js';

// One beat, as [phase, deflection] points: a small rise, a sharp spike, a
// dip, a slow swell.
const BEAT = [
  [0, 0], [0.07, 0.09], [0.15, 0], [0.27, 0], [0.31, -0.13], [0.45, 1],
  [0.57, -0.23], [0.62, 0], [0.71, 0.08], [0.81, 0.2], [0.92, 0.05], [1, 0],
];

function beatShape(p) {
  for (let k = 1; k < BEAT.length; k++) {
    if (p <= BEAT[k][0]) {
      const [p0, v0] = BEAT[k - 1]; const [p1, v1] = BEAT[k];
      return v0 + (v1 - v0) * ((p - p0) / (p1 - p0 || 1));
    }
  }
  return 0;
}

const lerp = (a, b, f) => a + (b - a) * f;

/** Length of one beat down the page, in px, for a heat of -1..1. */
export function beatLength(h, scale = 1) {
  return scale * (h >= 0 ? lerp(17.6, 10.5, h) : lerp(17.6, 23, -h));
}

/** Height of the spike, in px, for a heat of -1..1. */
export function beatHeight(h, scale = 1) {
  return scale * (h >= 0 ? lerp(12, 34, h) : lerp(12, 8.5, -h));
}

/**
 * @param {Array<{y:number, heat:number}>} stops  positions down the strip, in
 *        writing order, each with the heat (-1..1) of the heart at that point
 * @param {object} [o]
 * @param {number} [o.x=60]       where the resting line sits across the strip
 * @param {number} [o.scale=1]    1 on a desk, smaller on a phone
 * @param {number} [o.dir=-1]     which way the spike points (-1 = away from the text)
 * @param {Array<{y:number, len:number}>} [o.rests]  stretches where the pen rested
 * @returns {{ svg: string, head: {x:number, y:number, heat:number}|null, beats: number, peak: number }}
 */
export function marginTrace(stops, { x = 60, scale = 1, dir = -1, rests = [] } = {}) {
  const pts = stops.filter((s) => Number.isFinite(s.y)).slice().sort((a, b) => a.y - b.y);
  if (pts.length < 2 || pts[pts.length - 1].y - pts[0].y < 1) return { svg: '', head: null, beats: 0, peak: 0 };
  const y0 = pts[0].y; const y1 = pts[pts.length - 1].y;
  const step = 0.75;
  const runs = [];
  let cur = null;
  let phase = 0.3;
  let k = 0;
  let peak = 0;
  let lastH = 0;
  for (let y = y0; y <= y1 + 1e-6; y += step) {
    while (k < pts.length - 2 && pts[k + 1].y < y) k++;
    const a = pts[k]; const b = pts[k + 1];
    const f = b.y === a.y ? 1 : Math.max(0, Math.min(1, (y - a.y) / (b.y - a.y)));
    const h = lerp(a.heat || 0, b.heat || 0, f);
    let quiet = 1;
    for (const r of rests) {
      const d = Math.abs(y - r.y) / (r.len / 2);
      if (d < 1) quiet = Math.min(quiet, d < 0.7 ? 0.05 : 0.05 + 0.95 * ((d - 0.7) / 0.3));
    }
    phase += step / beatLength(h, scale);
    const dx = beatHeight(h, scale) * beatShape(phase % 1) * quiet;
    peak = Math.max(peak, Math.abs(dx));
    const px = x + dir * dx;
    const tone = Math.round(h * 8) / 8;
    const p = `${px.toFixed(1)} ${y.toFixed(1)}`;
    if (cur && cur.tone === tone) cur.d.push(p);
    else {
      const d = cur ? [cur.d[cur.d.length - 1], p] : [p];
      cur = { tone, d };
      runs.push(cur);
    }
    lastH = h;
  }
  const svg = runs
    .filter((r) => r.d.length > 1)
    .map((r) => `<path d="M${r.d.join('L')}" stroke="${inkAt(r.tone)}" stroke-width="${(1.45 + Math.max(0, r.tone) * 0.5).toFixed(2)}"/>`)
    .join('');
  return { svg, head: { x, y: y1, heat: lastH }, beats: Math.floor(phase), peak };
}
