// sim-source.js
// A stand-in for the camera, for development and tests only. It emits
// packets shaped like SmartSpectra's decoded Metrics so the rest of the app
// runs the same code path. The app labels every simulated session and every
// letter written with it, so a simulated letter can't pass for a real one.

export class SimulatedSource {
  constructor({ seed = 7, restingBpm = 66, now = () => performance.now() } = {}) {
    this.rest = restingBpm;
    this.now = now;
    this.seed = seed;
    this.handlers = {};
    this.timer = null;
    this.excite = 0;        // 0..1, nudged by bump()
  }

  on(event, fn) { this.handlers[event] = fn; return this; }

  emit(event, ...args) { const h = this.handlers[event]; if (h) h(...args); }

  /** Pretend something stirred the writer's heart. */
  bump(amount = 0.6) { this.excite = Math.min(1, this.excite + amount); }

  start() {
    this.t0 = this.now();
    this.lastUs = 0;
    this.phase = 0;
    this.breathPhase = 0;
    this.smileUntil = 0;
    this.emit('processingStatus', 3);
    this.emit('validationStatus', 0, 0, '');
    this.timer = setInterval(() => this.tick(), 200);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    this.emit('processingStatus', 1);
  }

  bpmNow(tS) {
    const drift = 3 * Math.sin(tS / 23) + 1.5 * Math.sin(tS / 7.3 + this.seed);
    return this.rest + drift + this.excite * 22;
  }

  /** Build one packet covering the time since the previous one. */
  tick() {
    const nowUs = Math.round((this.now() - this.t0) * 1000);
    const fromUs = this.lastUs;
    this.lastUs = nowUs;
    this.excite *= 0.985;
    const bpm = this.bpmNow(nowUs / 1e6);
    const trace = [];
    const breath = [];
    for (let t = fromUs; t < nowUs; t += 33333) {
      this.phase += (bpm / 60) * 0.033333;
      this.breathPhase += (14 / 60) * 0.033333;
      trace.push({ value: ppg(this.phase % 1), timestamp: t, stable: true, confidence: 80 });
      breath.push({ value: Math.sin(this.breathPhase * Math.PI * 2), timestamp: t, stable: true });
    }
    const tS = nowUs / 1e6;
    if (tS > this.smileUntil + 25 && Math.sin(tS * 1.7 + this.seed) > 0.995) this.smileUntil = tS + 2.5;
    const happy = tS < this.smileUntil ? 82 : 4;
    this.emit('metrics', {
      cardio: {
        pulseRate: [{ value: bpm, confidence: 78, stable: true, timestamp: nowUs }],
        arterialPressureTrace: trace,
      },
      breathing: {
        rate: [{ value: 14, confidence: 70, stable: true, timestamp: nowUs }],
        upperTrace: breath,
      },
      face: { expression: [{ stable: true, timestamp: nowUs, scores: [{ type: 5, confidence: happy }, { type: 6, confidence: 100 - happy }] }] },
    }, nowUs);
  }
}

// A rough pulse-wave shape: quick rise, slow fall, a small notch.
function ppg(p) {
  if (p < 0.15) return Math.sin((p / 0.15) * (Math.PI / 2));
  const d = (p - 0.15) / 0.85;
  return Math.exp(-3.2 * d) + 0.12 * Math.exp(-((d - 0.28) ** 2) / 0.004) - 0.05;
}
