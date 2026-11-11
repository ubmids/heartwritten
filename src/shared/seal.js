// seal.js
// A wax seal drawn from the writer's own pulse. The wave recorded in the last
// seconds before sealing is wrapped once around the seal, so no two seals
// look alike. Returns an SVG string; deterministic for the same input.

const SIZE = 200;
const C = SIZE / 2;

function hash(values) {
  let h = 2166136261;
  for (const v of values) { h ^= (v + 1000) & 0xffff; h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function rng(seed) {
  let s = seed || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 10000) / 10000; };
}

function polar(r, a) { return [C + r * Math.cos(a), C + r * Math.sin(a)]; }

function pathFrom(points) {
  return `${points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')} Z`;
}

function smooth(values, k) {
  if (!values.length) return values;
  return values.map((_, i) => {
    let s = 0; let n = 0;
    for (let d = -k; d <= k; d++) {
      const j = (i + d + values.length) % values.length;
      s += values[j]; n++;
    }
    return s / n;
  });
}

function escapeXml(s) {
  return String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
}

/**
 * @param {number[]} wave  pulse wave, -100..100 (may be empty)
 * @param {object}   opts  { initial, bpm, id }
 */
export function sealSvg(wave, { initial = '', bpm = 0, id = 'seal' } = {}) {
  const w = wave && wave.length >= 16 ? wave : flatline(120);
  const rand = rng(hash(w));
  const uid = `${id}-${hash(w).toString(36)}`;

  // Melted wax edge: an irregular blob, a little different every time.
  const edge = [];
  const blobs = 7 + Math.floor(rand() * 4);
  const phase = rand() * Math.PI * 2;
  for (let i = 0; i < 160; i++) {
    const a = (i / 160) * Math.PI * 2;
    const r = 88 + 4.5 * Math.sin(a * blobs + phase) + 2.2 * Math.sin(a * (blobs + 5) + phase * 2) + (rand() - 0.5) * 1.6;
    edge.push(polar(r, a));
  }

  // Pressed rim.
  const rim = [];
  for (let i = 0; i < 120; i++) rim.push(polar(70, (i / 120) * Math.PI * 2));

  // The pulse ring: the wave wrapped once around the seal.
  const sm = smooth(w, 1);
  const ring = [];
  const N = sm.length;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 - Math.PI / 2;
    ring.push(polar(56 + (sm[i] / 100) * 9, a));
  }

  const letter = escapeXml((initial || '♥').slice(0, 2).toUpperCase());
  const bpmText = bpm > 0 ? `${Math.round(bpm)} BPM` : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}" role="img" aria-label="Wax seal made from the writer's pulse">
  <defs>
    <radialGradient id="${uid}-wax" cx="38%" cy="32%" r="75%">
      <stop offset="0%" stop-color="#d4504c"/>
      <stop offset="55%" stop-color="#a3232a"/>
      <stop offset="100%" stop-color="#6c1219"/>
    </radialGradient>
    <radialGradient id="${uid}-press" cx="60%" cy="65%" r="70%">
      <stop offset="0%" stop-color="#8e1a21"/>
      <stop offset="100%" stop-color="#b8343a"/>
    </radialGradient>
    <filter id="${uid}-soft" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="2.4"/>
      <feOffset dx="0" dy="3" result="b"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.45"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <g filter="url(#${uid}-soft)">
    <path d="${pathFrom(edge)}" fill="url(#${uid}-wax)"/>
    <path d="${pathFrom(rim)}" fill="url(#${uid}-press)" stroke="#5e0f15" stroke-opacity="0.55" stroke-width="1.4"/>
    <path d="${pathFrom(ring)}" fill="none" stroke="#f3c9c2" stroke-opacity="0.85" stroke-width="2.2" stroke-linejoin="round"/>
    <text x="${C}" y="${C + 13}" text-anchor="middle" font-family="Iowan Old Style, Palatino, Georgia, serif" font-size="40" font-style="italic" fill="#f3c9c2" fill-opacity="0.9">${letter}</text>
    ${bpmText ? `<text x="${C}" y="${C + 34}" text-anchor="middle" font-family="Iowan Old Style, Palatino, Georgia, serif" font-size="9" letter-spacing="2" fill="#f3c9c2" fill-opacity="0.7">${bpmText}</text>` : ''}
    <ellipse cx="${C - 30}" cy="${C - 42}" rx="20" ry="9" fill="#fff" fill-opacity="0.12" transform="rotate(-30 ${C - 30} ${C - 42})"/>
  </g>
</svg>`;
}

function flatline(n) {
  // A gentle placeholder beat when no wave was captured.
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = (i % 30) / 30;
    out.push(Math.round(p < 0.12 ? Math.sin(p / 0.12 * Math.PI) * 80 : p < 0.3 ? -Math.sin((p - 0.12) / 0.18 * Math.PI) * 20 : 0));
  }
  return out;
}
