// make-sample.mjs: writes a sample letter (simulated signals, marked as a
// sample) so the reader can be tried without the app. Prints its token and
// writes dist/sample-letter.html and dist/reader/sample.html.
import { writeFile, readFile } from 'node:fs/promises';
import { LetterRecorder } from '../src/shared/recorder.js';
import { encodeLetter } from '../src/shared/letter-format.js';

let t = 0;
const now = () => t;
const rec = new LetterRecorder({ now });
let bpm = 66;
let smile = 0;
let wavePhase = 0;
const feed = () => {
  rec.sample({ bpm: bpm + Math.sin(t / 9000) * 2, breath: Math.sin((t / 1000) * (14 / 60) * Math.PI * 2), smile });
};
const typeText = (s, gap = 135) => {
  for (const ch of s) {
    t += gap + ((ch.charCodeAt(0) * 37) % 70) + (ch === ' ' ? 40 : 0) + (/[.,]/.test(ch) ? 260 : 0);
    rec.edit(rec.text + ch);
    feed();
  }
};
const back = (n) => { for (let i = 0; i < n; i++) { t += 95; rec.edit(rec.text.slice(0, -1)); feed(); } };
const pause = (ms) => { const end = t + ms; while (t < end) { t += 250; feed(); } };

typeText('Maya,\n\n');
typeText('I wanted to write this down instead of saying it on the phone, because I always rush the good parts. ');
pause(4000);
typeText('So, slowly: ');
bpm = 79; typeText('they called this morning. ');
bpm = 91; smile = 0.9; typeText('I got it. I actually got it!');
pause(2500); smile = 0;
typeText(' You were the first person I wanted to tell. ');
bpm = 84;
pause(14000);
typeText('I keep thinking about the night you sat on my floor and read my application out loud, and I was so sure it was ');
typeText('terrible'); back(8); typeText('not good enough');
typeText('. You told me to send it anyway. ');
bpm = 68;
typeText('I don’t think I would have.\n\n');
bpm = 64;
typeText('Thank you for believing in me before I did. Dinner is on me, wherever you want, as many times as you want.\n\n');
smile = 0.85; typeText('See you Friday.'); smile = 0;
for (let i = 0; i < 180; i++) { wavePhase += (66 / 60) / 30; const p = wavePhase % 1; rec.pushWave([p < 0.15 ? Math.sin(p / 0.15 * Math.PI / 2) : Math.exp(-3.2 * (p - 0.15) / 0.85) + 0.12 * Math.exp(-(((p - 0.15) / 0.85 - 0.28) ** 2) / 0.004)]); }

const letter = rec.finish({ from: 'Sam', to: 'Maya', day: '2026-11-12', sim: true, share: { edits: true, smiles: true } });
const token = await encodeLetter(letter);
const reader = await readFile(new URL('../dist/reader/index.html', import.meta.url), 'utf8');
const sampleHtml = reader.replace('<!--__LETTER_DATA__-->', `<script id="letter-data" type="application/x-heartwritten">${token}</script>`);
await writeFile(new URL('../dist/sample-letter.html', import.meta.url), sampleHtml);
// Also served by the hosted reader at /sample, so a sample opens from a short link.
await writeFile(new URL('../dist/reader/sample.html', import.meta.url), sampleHtml);
await writeFile(new URL('../dist/sample-token.txt', import.meta.url), token);
console.log(`sample letter: ${rec.text.length} chars, written over ${(t / 60000).toFixed(1)} min, token ${token.length} chars`);
