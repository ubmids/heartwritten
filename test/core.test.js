import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  encodeLetter, decodeLetter, pack, unpack, validate, finalText, extractToken, buildLink,
} from '../src/shared/letter-format.js';
import { diffText, LetterRecorder, opsFromCharTimes, normalizeWave, VITALS_HZ } from '../src/shared/recorder.js';
import { VitalsTracker, resample, hintFor } from '../src/shared/vitals.js';
import { Player, buildTimeline, bpmAt, inkFor, finalChars } from '../src/shared/playback.js';
import { summarize, sentences, median, formatDuration, excerpt } from '../src/shared/summary.js';
import { sealSvg } from '../src/shared/seal.js';
import { SimulatedSource } from '../src/shared/sim-source.js';

// A fake clock the recorder can read.
function clock() {
  let t = 1_000_000;
  const now = () => t;
  now.tick = (ms) => { t += ms; };
  return now;
}

// Types `s` into the recorder one char at a time, `gap` ms apart.
function type(rec, now, s, gap = 120) {
  for (const ch of s) { now.tick(gap); rec.edit(rec.text + ch); }
}

function backspace(rec, now, n, gap = 90) {
  for (let i = 0; i < n; i++) { now.tick(gap); rec.edit(rec.text.slice(0, -1)); }
}

function sampleLetter({ edits = true, smiles = true } = {}) {
  const now = clock();
  const rec = new LetterRecorder({ now });
  let bpm = 64;
  const feed = () => rec.sample({ bpm, breath: Math.sin(now() / 700), smile: bpm > 80 ? 0.9 : 0.1 });
  for (const ch of 'Dear Deola, I have news. ') { now.tick(150); rec.edit(rec.text + ch); feed(); }
  bpm = 88;
  for (const ch of 'I got the job I told you about!') { now.tick(130); rec.edit(rec.text + ch); feed(); }
  backspace(rec, now, 1); feed();
  rec.edit(`${rec.text}.`); feed();
  now.tick(12000); feed();     // a long pause
  bpm = 62;
  for (const ch of ' Thank you for believing in me when I did not.') { now.tick(160); rec.edit(rec.text + ch); feed(); }
  rec.pushWave(Array.from({ length: 300 }, (_, i) => Math.sin(i / 4)));
  return rec.finish({ from: 'Subomi', to: 'Deola', day: '2026-11-12', share: { edits, smiles } });
}

test('diffText finds the smallest edit', () => {
  assert.deepEqual(diffText('', 'a'), { pos: 0, del: 0, ins: 'a' });
  assert.deepEqual(diffText('abc', 'abXc'), { pos: 2, del: 0, ins: 'X' });
  assert.deepEqual(diffText('hello world', 'hello'), { pos: 5, del: 6, ins: '' });
  assert.deepEqual(diffText('I love it', 'I adore it'), { pos: 2, del: 3, ins: 'ador' });
  assert.equal(diffText('same', 'same'), null);
});

test('recorder replays to the exact final text, with and without edits', () => {
  for (const edits of [true, false]) {
    const letter = sampleLetter({ edits });
    const expected = 'Dear Deola, I have news. I got the job I told you about. Thank you for believing in me when I did not.';
    assert.equal(finalText(letter), expected);
    assert.equal(finalChars(letter).map((c) => c.ch).join(''), expected);
    validate(letter);
  }
});

test('with edits off, nothing deleted survives in the letter', () => {
  const now = clock();
  const rec = new LetterRecorder({ now });
  type(rec, now, 'I miss you');
  backspace(rec, now, 8);
  type(rec, now, 'am fine');
  const hidden = rec.finish({ share: { edits: false, smiles: true } });
  const json = JSON.stringify(pack(hidden));
  assert.ok(!json.includes('miss'), 'deleted words must not be in the payload');
  assert.ok(hidden.ops.every((op) => op[2] === 0), 'no deletions');
  assert.equal(finalText(hidden), 'I am fine');
  const shown = rec.finish({ share: { edits: true, smiles: true } });
  const p = new Player(shown);
  let sawIt = false;
  for (let at = 0; !p.done; at += 40) { p.advance(at); if (p.text().includes('I miss you')) sawIt = true; }
  assert.ok(sawIt, 'with edits on, the reader sees the words that were taken back');
});

test('opsFromCharTimes keeps typing order for edits made mid-text', () => {
  // "ac" typed first, then "b" inserted between them later.
  const ops = opsFromCharTimes('abc', [0, 500, 10]);
  const letter = { ops, vit: { hz: 1, bpm: [], br: [], sm: [] }, wave: { hz: 25, v: [] }, share: {} };
  assert.equal(finalText(letter), 'abc');
  assert.deepEqual(ops.map((o) => o[0]), [0, 10, 500]);
});

test('smiles off means no smile samples are kept', () => {
  const letter = sampleLetter({ smiles: false });
  assert.ok(letter.vit.sm.every((x) => x === 0));
  const packed = pack(letter);
  assert.equal(packed.m, undefined);
});

test('pack/unpack and link encoding round-trip', async () => {
  const letter = sampleLetter();
  assert.deepEqual(unpack(pack(letter)), letter);
  const token = await encodeLetter(letter);
  assert.match(token, /^v1\.[A-Za-z0-9_-]+$/);
  const link = buildLink('https://example.test/read/', token);
  const back = await decodeLetter(link);
  assert.deepEqual(back, letter);
  assert.equal(extractToken(`https://x.test/#${token}`), token);
  assert.equal(extractToken('https://x.test/#nothing'), null);
});

test('a long letter still fits in a reasonable link', async () => {
  const now = clock();
  const rec = new LetterRecorder({ now });
  const para = 'It has been a strange and lovely year, and I keep wanting to tell you about the small things. ';
  for (let i = 0; i < 16; i++) {           // ~1,500 characters over ~4 minutes
    for (const ch of para) { now.tick(160); rec.edit(rec.text + ch); rec.sample({ bpm: 70 + (i % 5), breath: 0.2, smile: 0 }); }
  }
  rec.pushWave(Array.from({ length: 300 }, (_, i) => Math.sin(i / 4)));
  const token = await encodeLetter(rec.finish({ share: { edits: true, smiles: true } }));
  assert.ok(token.length < 12000, `token is ${token.length} chars`);
});

test('decoder rejects tampered or hostile letters', async () => {
  const bad = [
    { ...pack(sampleLetter()), v: 9 },
    { ...pack(sampleLetter()), o: [[0, 5, 0, 'x']] },          // insert past the end
    { ...pack(sampleLetter()), o: [[0, 0, 3, '']] },           // delete what isn't there
    { ...pack(sampleLetter()), vh: 999 },
  ];
  for (const p of bad) assert.throws(() => unpack(p));
  await assert.rejects(decodeLetter('v1.!!!'));
  await assert.rejects(decodeLetter('no letter here'));
});

test('vitals tracker reads SDK-shaped packets', () => {
  const v = new VitalsTracker();
  v.ingest({ cardio: { pulseRate: [{ value: 72, stable: false, timestamp: 1e6 }] } });
  assert.equal(v.bpm, null, 'unstable readings are ignored');
  const wave = v.ingest({
    cardio: {
      pulseRate: [{ value: 71.6, stable: true, confidence: 60, timestamp: { toNumber: () => 2e6 } }],
      arterialPressureTrace: Array.from({ length: 30 }, (_, i) => ({ value: Math.sin(i), timestamp: 2e6 + i * 33333 })),
    },
    breathing: { rate: [{ value: 13, stable: true }], upperTrace: Array.from({ length: 20 }, (_, i) => ({ value: i, timestamp: 2e6 + i * 50000 })) },
    face: { expression: [{ scores: [{ type: 5, confidence: 90 }, { type: 6, confidence: 10 }] }] },
  });
  assert.equal(v.bpm, 71.6);
  assert.equal(v.breathRate, 13);
  assert.ok(wave.length >= 28 && wave.length <= 31);
  const snap = v.snapshot();
  assert.equal(snap.smile, 0.9);
  assert.equal(snap.breath, 1, 'latest breath sample is the top of the range');
  // Heart rate goes stale when no fresh stable value arrives.
  v.ingest({ cardio: { arterialPressureTrace: [{ value: 0, timestamp: 9e6 }] } });
  assert.equal(v.bpm, null);
});

test('resample produces evenly spaced values', () => {
  const s = [{ value: 0, timestamp: 0 }, { value: 10, timestamp: 1e6 }];
  const r = resample(s, 10);
  assert.equal(r.length, 11);
  assert.equal(r[5], 5);
});

test('hints read like a person talking', () => {
  assert.equal(hintFor(5), 'A little more light, please');
  assert.equal(hintFor(999, 'SDK hint'), 'SDK hint');
});

test('timeline shortens long pauses and remembers them', () => {
  const letter = sampleLetter();
  const tl = buildTimeline(letter);
  assert.ok(tl.pauses.length >= 1, 'the 12 s pause is noted');
  assert.ok(tl.pauses[0].ms >= 12000);
  assert.ok(tl.duration < tl.writtenMs, 'replay is shorter than the writing');
  for (let i = 1; i < tl.ops.length; i++) assert.ok(tl.ops[i].at >= tl.ops[i - 1].at);
});

test('player shows the writer taking a word back', () => {
  const letter = sampleLetter({ edits: true });
  const p = new Player(letter);
  let sawBang = false;
  for (let at = 0; !p.done; at += 50) {
    p.advance(at);
    if (p.text().endsWith('about!')) sawBang = true;
  }
  assert.ok(sawBang, 'the exclamation mark appears before it is replaced');
  assert.equal(p.tookBack, 1);
  assert.equal(p.text(), finalText(letter));
});

test('ink warms with a quicker heart and stays calm otherwise', () => {
  assert.equal(inkFor(66, 66), 'rgb(28, 34, 52)');
  assert.equal(inkFor(0, 66), 'rgb(28, 34, 52)');
  const warm = inkFor(90, 66).match(/\d+/g).map(Number);
  assert.ok(warm[0] > 150 && warm[2] < 50);
  const cool = inkFor(50, 66).match(/\d+/g).map(Number);
  assert.ok(cool[2] > 120 && cool[0] < 60, 'a slower heart cools the ink');
});

test('summary finds the quickest and steadiest sentences', () => {
  const s = summarize(sampleLetter());
  assert.match(s.quickest.text, /got the job/);
  assert.match(s.steadiest.text, /believing in me/);
  assert.ok(s.quickest.bpm > s.steadiest.bpm);
  assert.equal(s.tookBack, 1);
  assert.ok(s.smiles >= 1);
  assert.ok(s.words > 15);
  assert.equal(median([0, 60, 70, 80]), 70);
  assert.equal(formatDuration(75_000), '1 min 15 s');
  assert.equal(excerpt('a '.repeat(80)).endsWith('…'), true);
});

test('summary says nothing about the heart when it barely moved', () => {
  const now = clock();
  const rec = new LetterRecorder({ now });
  for (const ch of 'One calm sentence here. And another calm sentence.') { now.tick(150); rec.edit(rec.text + ch); rec.sample({ bpm: 70, breath: 0, smile: 0 }); }
  const s = summarize(rec.finish({}));
  assert.equal(s.quickest, null);
  assert.equal(s.steadiest, null);
});

test('sentences splits on punctuation and new lines', () => {
  assert.deepEqual(sentences('Hi there. How are you?\nGood!').map((s) => s.text), ['Hi there.', 'How are you?', 'Good!']);
});

test('bpmAt looks past gaps in the signal', () => {
  const letter = { vit: { hz: VITALS_HZ, bpm: [0, 0, 70, 0, 0], br: [], sm: [] } };
  assert.equal(bpmAt(letter, 0), 70);
  assert.equal(bpmAt(letter, 1000), 70);
});

test('seal is deterministic, unique per pulse and safe to inline', () => {
  const a = sealSvg(normalizeWave(Array.from({ length: 180 }, (_, i) => Math.sin(i / 5))), { initial: 'S', bpm: 68 });
  const b = sealSvg(normalizeWave(Array.from({ length: 180 }, (_, i) => Math.sin(i / 5))), { initial: 'S', bpm: 68 });
  const c = sealSvg(normalizeWave(Array.from({ length: 180 }, (_, i) => Math.sin(i / 3))), { initial: 'S', bpm: 68 });
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^<svg[\s\S]*<\/svg>$/);
  assert.match(a, /68 BPM/);
  const evil = sealSvg([], { initial: '<script>' });
  assert.ok(!evil.includes('<script>'));
});

test('simulated source drives the same tracker path', async () => {
  let t = 0;
  const sim = new SimulatedSource({ now: () => t });
  const v = new VitalsTracker();
  sim.on('metrics', (m) => v.ingest(m));
  sim.start();
  clearInterval(sim.timer);
  for (let i = 0; i < 60; i++) { t += 200; sim.tick(); }
  assert.ok(v.bpm > 55 && v.bpm < 90, `bpm ${v.bpm}`);
  assert.ok(v.pulseTrace.length > 100);
  assert.notEqual(v.breathPhase(), null);
});
