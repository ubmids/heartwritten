// sdk-smoke.mjs
// Headless check that the SmartSpectra SDK loads and that Heartwritten reads
// its packets. With a key and a short face video it runs a real measurement:
//
//   SMARTSPECTRA_API_KEY=... npm run smoke -- path/to/face-clip.mp4
//
// Without a key it only checks that the native runtime loads.

import { createRequire } from 'node:module';
import { VitalsTracker } from '../src/shared/vitals.js';

const require = createRequire(import.meta.url);
const ss = require('@smartspectra/node-sdk');
const { decodeMetrics } = require('@smartspectra/node-sdk/messages');

console.log(`SmartSpectra SDK ${ss.SmartSpectraSDK.version} loaded on ${process.platform}-${process.arch}`);
try {
  const cams = ss.SmartSpectraSDK.availableCameras();
  console.log(`Cameras found: ${cams.length}`);
} catch (e) {
  console.log(`Camera discovery unavailable here (${e.message})`);
}

const key = process.env.SMARTSPECTRA_API_KEY;
const clip = process.argv[2];
if (!key || !clip) {
  console.log('No key or clip given: load check passed. Pass both to run a real measurement.');
  process.exit(0);
}

const metrics = [...ss.breathingMetrics, ...ss.cardioMetrics, ss.MetricType.EXPRESSIONS];
const sdk = new ss.SmartSpectraSDK({ apiKey: key, requestedMetrics: metrics, enableTelemetry: false });
const vitals = new VitalsTracker();
let packets = 0;
sdk.on('metrics', (buf) => { packets++; vitals.ingest(decodeMetrics(buf)); });
sdk.on('validationStatus', (code, _ts, hint) => { if (code !== 0) console.log(`validation ${code} ${hint || ''}`); });
sdk.on('error', (code, msg) => console.error(`SDK error ${code}: ${msg}`));
sdk.useFile(clip, { interframeDelayMs: 33 });
sdk.start();
sdk.waitUntilComplete(180000);
await sdk.destroy();

const snap = vitals.snapshot();
console.log(`packets=${packets} bpm=${snap.bpm?.toFixed(1) ?? '—'} breathsPerMin=${vitals.breathRate ?? '—'} pulseSamples=${vitals.pulseTrace.length} smile=${snap.smile}`);
if (!packets || !vitals.pulseTrace.length) {
  console.error('FAIL: no pulse data came back');
  process.exit(1);
}
console.log('PASS');
