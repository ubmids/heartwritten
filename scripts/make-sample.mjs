// make-sample.mjs: writes a sample letter (simulated signals, marked as a
// sample) so the reader can be tried without the app. Prints its token and
// writes dist/sample-letter.html and dist/reader/sample.html.
import { writeFile, readFile } from 'node:fs/promises';
import { composeLetter } from '../src/shared/composeLetter.js';
import { encodeLetter } from '../src/shared/letter-format.js';
import { buildTimeline, bpmAt, heat } from '../src/shared/playback.js';
import { median } from '../src/shared/summary.js';

// The news comes first, so the heart moves within the first ten seconds of
// the replay. The rest of the letter is calmer, which is what sets the
// writer's usual level and makes the opening stand out.
const { letter, text, ms } = composeLetter([
  ['type', 'Maya,\n\n'],
  ['bpm', 85], ['type', 'They called this morning. '],
  ['bpm', 93], ['smile', 0.9], ['type', 'I got it. I actually got it!'],
  ['pause', 2500], ['smile', 0], ['bpm', 85],
  ['type', ' You were the first person I wanted to tell. '],
  ['bpm', 72], ['pause', 9000],
  ['bpm', 67], ['type', 'I wanted to write this down instead of saying it on the phone, because I always rush the good parts. '],
  ['type', 'I keep thinking about the night you sat on my floor and read my application out loud, and I was so sure it was '],
  ['bpm', 75], ['type', 'terrible'], ['back', 8], ['type', 'not good enough'],
  ['bpm', 68], ['type', '. You told me to send it anyway. '],
  ['bpm', 60], ['type', 'I don’t think I would have.\n\n'],
  ['bpm', 61], ['type', 'Thank you for believing in me before I did. Dinner is on me, wherever you want, as many times as you want.\n\n'],
  ['bpm', 69], ['smile', 0.85], ['type', 'See you Friday.'],
], { from: 'Sam', to: 'Maya', day: '2026-11-12' });

const token = await encodeLetter(letter);
const reader = await readFile(new URL('../dist/reader/index.html', import.meta.url), 'utf8');
const sampleHtml = reader.replace('<!--__LETTER_DATA__-->', `<script id="letter-data" type="application/x-heartwritten">${token}</script>`);
await writeFile(new URL('../dist/sample-letter.html', import.meta.url), sampleHtml);
// Also served by the hosted reader at /sample, so a sample opens from a short link.
await writeFile(new URL('../dist/reader/sample.html', import.meta.url), sampleHtml);
await writeFile(new URL('../dist/sample-token.txt', import.meta.url), token);

// When, in the replay, the ink first clearly warms.
const base = median(letter.vit.bpm);
const first = buildTimeline(letter).ops.find((op) => heat(bpmAt(letter, op.t), base) >= 0.5);
console.log(`sample letter: ${text.length} chars, written over ${(ms / 60000).toFixed(1)} min, token ${token.length} chars, usual heart ${base}, ink first warms ${(first.at / 1000).toFixed(1)} s into the replay`);
