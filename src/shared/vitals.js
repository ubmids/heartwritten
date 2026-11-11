// vitals.js
// Turns SmartSpectra `metrics` packets into the few live signals Heartwritten
// uses. Each packet from the SDK is a windowed slice (only what is new since
// the last packet), so this keeps its own small rolling state.
//
// Signals used:
//   cardio.pulseRate[]             -> heart rate, only when `stable`
//   cardio.arterialPressureTrace[] -> the pulse wave (the seal, the live ink line)
//   breathing.upperTrace[]         -> the breathing wave (the page breathes with it)
//   breathing.rate[]               -> breaths per minute (shown live)
//   face.expression[]              -> HAPPY confidence (a smile in the margin)

export const HAPPY = 5;            // presage.smartspectra.ExpressionType.HAPPY
const PULSE_STALE_MS = 6000;       // forget a heart rate this old
const BREATH_WINDOW_S = 20;

export function tsToUs(ts) {
  if (ts == null) return 0;
  if (typeof ts === 'number') return ts;
  if (typeof ts === 'bigint') return Number(ts);
  if (typeof ts.toNumber === 'function') return ts.toNumber();
  return Number(ts);
}

export class VitalsTracker {
  constructor() { this.reset(); }

  reset() {
    this.bpm = null;            // latest stable heart rate
    this.bpmAtUs = 0;
    this.breathRate = null;
    this.breathTrace = [];      // [{t, v}] last BREATH_WINDOW_S seconds
    this.pulseTrace = [];       // [{t, v}] last 10 seconds
    this.smile = 0;             // 0..1
    this.lastUs = 0;
    this.packets = 0;
  }

  /** Feed one decoded Metrics message. Returns the list of new pulse-wave values. */
  ingest(m) {
    this.packets++;
    const newWave = [];
    const cardio = m && m.cardio;
    const breathing = m && m.breathing;
    const face = m && m.face;

    for (const s of (cardio && cardio.pulseRate) || []) {
      const t = tsToUs(s.timestamp);
      this.lastUs = Math.max(this.lastUs, t);
      if (s.stable && Number.isFinite(s.value) && s.value > 25 && s.value < 230) {
        this.bpm = s.value;
        this.bpmAtUs = t;
      }
    }
    for (const s of (cardio && cardio.arterialPressureTrace) || []) {
      if (!Number.isFinite(s.value)) continue;
      const t = tsToUs(s.timestamp);
      this.lastUs = Math.max(this.lastUs, t);
      this.pulseTrace.push({ t, v: s.value });
      newWave.push(s);
    }
    for (const s of (breathing && breathing.upperTrace) || []) {
      if (!Number.isFinite(s.value)) continue;
      const t = tsToUs(s.timestamp);
      this.lastUs = Math.max(this.lastUs, t);
      this.breathTrace.push({ t, v: s.value });
    }
    for (const s of (breathing && breathing.rate) || []) {
      if (s.stable && Number.isFinite(s.value)) this.breathRate = s.value;
    }
    const expr = face && face.expression;
    if (expr && expr.length) {
      const latest = expr[expr.length - 1];
      const happy = (latest.scores || []).find((x) => x.type === HAPPY);
      this.smile = happy ? clamp01((happy.confidence || 0) / 100) : 0;
    }

    trimOlderThan(this.pulseTrace, this.lastUs - 10e6);
    trimOlderThan(this.breathTrace, this.lastUs - BREATH_WINDOW_S * 1e6);
    if (this.bpm != null && this.lastUs - this.bpmAtUs > PULSE_STALE_MS * 1000) this.bpm = null;
    return resample(newWave, 30);
  }

  /** Where the latest breath sits within the recent range, -1 (out) .. 1 (in). */
  breathPhase() {
    const tr = this.breathTrace;
    if (tr.length < 8) return null;
    let lo = Infinity; let hi = -Infinity;
    for (const { v } of tr) { if (v < lo) lo = v; if (v > hi) hi = v; }
    if (hi - lo < 1e-9) return 0;
    return ((tr[tr.length - 1].v - lo) / (hi - lo)) * 2 - 1;
  }

  /** The live signals the recorder samples. */
  snapshot() {
    return { bpm: this.bpm, breath: this.breathPhase(), smile: this.smile };
  }
}

/** Resample timestamped samples ({timestamp, value}) to `hz`, linear. */
export function resample(samples, hz) {
  if (samples.length < 2) return samples.map((s) => s.value);
  const pts = samples.map((s) => ({ t: tsToUs(s.timestamp), v: s.value })).sort((a, b) => a.t - b.t);
  const step = 1e6 / hz;
  const out = [];
  let j = 0;
  for (let t = pts[0].t; t <= pts[pts.length - 1].t; t += step) {
    while (j < pts.length - 2 && pts[j + 1].t < t) j++;
    const a = pts[j]; const b = pts[j + 1];
    const f = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
    out.push(a.v + (b.v - a.v) * Math.max(0, Math.min(1, f)));
  }
  return out;
}

/** Plain-language hints for the SDK's validation codes. */
export const HINTS = {
  0: 'Reading you clearly',
  1: 'I can’t see your face yet',
  2: 'Just one face, please',
  3: 'Slide a little to the centre',
  4: 'Move a little closer or further',
  5: 'A little more light, please',
  6: 'Too bright, ease the light',
  7: 'Sit back so your shoulders show',
  10: 'Tuning the camera…',
  11: 'The camera is running slowly',
  12: 'Keep your head still while you think',
  13: 'Lean back a little',
  14: 'Lean in a little',
  15: 'Lower the camera, or sit taller',
  16: 'Raise the camera a little',
  17: 'Look toward the screen',
};

export function hintFor(code, fallback) {
  return HINTS[code] || fallback || 'Settling in…';
}

function clamp01(x) { return Math.max(0, Math.min(1, x)); }

function trimOlderThan(arr, tMin) {
  let k = 0;
  while (k < arr.length && arr[k].t < tMin) k++;
  if (k) arr.splice(0, k);
}
