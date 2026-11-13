// composeLetter.js
// Writes a letter from a script instead of a keyboard and a camera: the
// sample letter and the front page's letter to the visitor are made this
// way. The heartbeat in a composed letter is made up, so every composed
// letter is marked as simulated and can't pass for a real one.

import { LetterRecorder } from './recorder.js';

/**
 * @param {Array<[string, (string|number)?]>} steps
 *   ['type', text] | ['bpm', target] | ['smile', 0..1] | ['pause', ms] | ['back', n]
 * @param {object} meta   { from, to, day, share }
 * @param {object} [o]    { rest: starting heart rate, tau: ms the heart takes to follow, gap: ms per key }
 */
export function composeLetter(steps, meta = {}, { rest = 66, tau = 1500, gap = 135 } = {}) {
  let t = 0;
  const rec = new LetterRecorder({ now: () => t });
  let bpm = rest; let target = rest; let smile = 0; let fed = 0;
  const feed = () => {
    bpm += (target - bpm) * (1 - Math.exp(-(t - fed) / tau));
    fed = t;
    rec.sample({ bpm: bpm + Math.sin(t / 9000) * 1.5, breath: Math.sin((t / 1000) * (14 / 60) * Math.PI * 2), smile });
  };
  const k = gap / 135;
  for (const [what, v] of steps) {
    if (what === 'bpm') target = v;
    else if (what === 'smile') smile = v;
    else if (what === 'pause') { const end = t + v; while (t < end) { t += 250; feed(); } }
    else if (what === 'back') { for (let i = 0; i < v; i++) { t += 95 * k; rec.edit(rec.text.slice(0, -1)); feed(); } }
    else if (what === 'type') {
      for (const ch of v) {
        t += gap + (((ch.charCodeAt(0) * 37) % 70) + (ch === ' ' ? 40 : 0) + (/[.,]/.test(ch) ? 260 : 0)) * k;
        rec.edit(rec.text + ch);
        feed();
      }
    }
  }
  // Six seconds of a plain pulse wave for the seal.
  let phase = 0;
  for (let i = 0; i < 180; i++) {
    phase += (rest / 60) / 30;
    const p = phase % 1;
    rec.pushWave([p < 0.15 ? Math.sin((p / 0.15) * (Math.PI / 2)) : Math.exp((-3.2 * (p - 0.15)) / 0.85) + 0.12 * Math.exp(-((((p - 0.15) / 0.85) - 0.28) ** 2) / 0.004)]);
  }
  const letter = rec.finish({ share: { edits: true, smiles: true }, ...meta, sim: true });
  return { letter, text: rec.text, ms: t };
}
