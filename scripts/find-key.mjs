// find-key.mjs: where the SmartSpectra key comes from, for the scripts.
// Same order as the app (app/main.cjs): the environment first, then the
// git-ignored .smartspectra-key file in the project folder. The key is
// returned to the caller and never printed.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

export function findKey({ env = process.env, root = ROOT } = {}) {
  const fromEnv = (env.SMARTSPECTRA_API_KEY || '').trim();
  if (fromEnv) return { key: fromEnv, source: 'SMARTSPECTRA_API_KEY' };
  try {
    const fromFile = readFileSync(join(root, '.smartspectra-key'), 'utf8').trim();
    if (fromFile) return { key: fromFile, source: '.smartspectra-key' };
  } catch { /* no key file */ }
  return { key: '', source: '' };
}
