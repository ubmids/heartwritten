// sdk-source.js
// The live camera source: SmartSpectra's Electron renderer SDK. It emits the
// same events as SimulatedSource, with each metrics packet already decoded.

import {
  SmartSpectraSDK, breathingMetrics, cardioMetrics, MetricType, SmartSpectraErrorCode,
} from '@smartspectra/node-sdk/renderer';
import { decodeMetrics } from '@smartspectra/node-sdk/messages';

export class SmartSpectraSource {
  constructor({ apiKey, telemetry = false, smiles = true }) {
    this.apiKey = apiKey;
    this.telemetry = telemetry;
    this.smiles = smiles;
    this.handlers = {};
    this.sdk = null;
    this.simulated = false;
  }

  on(event, fn) { this.handlers[event] = fn; return this; }

  emit(event, ...args) { const h = this.handlers[event]; if (h) h(...args); }

  metrics() {
    // Breathing and cardio for the heart and the breath; EXPRESSIONS alone
    // (not the whole face bundle) for smiles, since landmarks aren't needed.
    const m = [...breathingMetrics, ...cardioMetrics];
    if (this.smiles) m.push(MetricType.EXPRESSIONS);
    return m;
  }

  build() {
    this.sdk = new SmartSpectraSDK({
      apiKey: this.apiKey,
      requestedMetrics: this.metrics(),
      enableTelemetry: this.telemetry,
      enableAccumulatedOutput: false,
    });
    this.sdk.on('streamAvailable', (stream) => this.emit('stream', stream));
    this.sdk.on('processingStatus', (s) => this.emit('processingStatus', s));
    this.sdk.on('validationStatus', (code, ts, hint) => this.emit('validationStatus', code, ts, hint));
    this.sdk.on('metrics', (buf, ts) => {
      try { this.emit('metrics', decodeMetrics(buf), ts); } catch (e) { console.error('decode failed', e); }
    });
    this.sdk.on('error', (code, message, retryable) => this.onError(code, message, retryable));
  }

  async start() {
    if (!this.sdk) this.build();
    try {
      await this.sdk.start();
    } catch (err) {
      this.onError(err.code, err.message, err.retryable);
    }
  }

  async onError(code, message, retryable) {
    // A key that isn't allowed expressions still gets the heart and breath.
    if (code === SmartSpectraErrorCode.kMetricNotAuthorized && this.smiles) {
      this.smiles = false;
      this.emit('notice', 'Smiles aren’t available with this key, so they’re left out.');
      await this.stop();
      return this.start();
    }
    this.emit('error', code, message, retryable);
  }

  async stop() {
    if (!this.sdk) return;
    const sdk = this.sdk;
    this.sdk = null;
    try { await sdk.stop(); } catch { /* already stopped */ }
    try { sdk.destroy(); } catch { /* already destroyed */ }
  }
}

export { SmartSpectraErrorCode };
