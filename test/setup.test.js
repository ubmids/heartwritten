// Checks of the promises the README and PRIVACY.md make about the key and
// about SDK telemetry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findKey } from '../scripts/find-key.mjs';

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), 'utf8');

test('the key is found in the environment first, then in .smartspectra-key', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hw-key-'));
  try {
    assert.deepEqual(findKey({ env: {}, root: dir }), { key: '', source: '' });
    await writeFile(join(dir, '.smartspectra-key'), '  file-key\n');
    assert.deepEqual(findKey({ env: {}, root: dir }), { key: 'file-key', source: '.smartspectra-key' });
    assert.deepEqual(findKey({ env: { SMARTSPECTRA_API_KEY: ' env-key ' }, root: dir }),
      { key: 'env-key', source: 'SMARTSPECTRA_API_KEY' });
    await writeFile(join(dir, '.smartspectra-key'), '\n');
    assert.equal(findKey({ env: {}, root: dir }).key, '', 'an empty key file counts as no key');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the key file is git-ignored', async () => {
  const lines = (await read('.gitignore')).split('\n').map((l) => l.trim());
  assert.ok(lines.includes('.smartspectra-key'));
});

test('SDK telemetry is off unless the writer ticks the box', async () => {
  const html = await read('src/writer/index.html');
  const box = html.match(/<input[^>]*id="opt-telemetry"[^>]*>/);
  assert.ok(box, 'the telemetry choice is on the consent screen');
  assert.doesNotMatch(box[0], /\bchecked\b/, 'and it starts unticked');
  assert.match(await read('src/writer/sdk-source.js'), /telemetry = false/);
  assert.match(await read('src/writer/sdk-source.js'), /enableTelemetry: this\.telemetry/);
  const smoke = await read('scripts/sdk-smoke.mjs');
  assert.match(smoke, /enableTelemetry: false/);
  assert.doesNotMatch(smoke, /enableTelemetry: true/);
});
