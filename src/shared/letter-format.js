// letter-format.js
// The wire format of a Heartwritten letter, and how it is packed into a link.
//
// A letter is plain data. It never goes to a server: the writer app packs it
// into the #fragment of a link (browsers never send the fragment over the
// network) or into a self-contained .html file.
//
// Decoded shape (version 1):
// {
//   v: 1,
//   from: "Subomi",          // optional, as typed by the writer
//   to: "Deola",             // optional
//   day: "2026-11-12",       // the day it was sealed, no time of day
//   sim: 0 | 1,              // 1 when the signals were simulated (sample letters)
//   share: { edits: bool, smiles: bool },
//   ops: [[t, pos, del, ins], ...]   // replayable edits, t = ms since start
//   vit: { hz, bpm: [...], br: [...], sm: [...] }  // signals sampled over time
//   wave: { hz, v: [...] }           // a few seconds of the pulse wave, for the seal
// }
//
// On the wire the ops and samples are delta- and integer-coded, then the JSON
// is deflated and base64url-encoded.

export const FORMAT_VERSION = 1;
export const LINK_PREFIX = 'v1.';
// Times are stored in 10 ms ticks to keep the numbers small.
const TICK_MS = 10;

const MAX_TEXT = 20000;
const MAX_OPS = 40000;
const MAX_SAMPLES = 20000;

/** Turn a decoded letter into the compact JSON-able form. */
export function pack(letter) {
  validate(letter);
  let prevT = 0;
  const ops = letter.ops.map(([t, pos, del, ins]) => {
    const tick = Math.round(t / TICK_MS);
    const dt = tick - prevT;
    prevT = tick;
    return ins ? [dt, pos, del, ins] : [dt, pos, del];
  });
  return {
    v: FORMAT_VERSION,
    f: letter.from || undefined,
    to: letter.to || undefined,
    d: letter.day || undefined,
    s: letter.sim ? 1 : undefined,
    sh: (letter.share.edits ? 1 : 0) | (letter.share.smiles ? 2 : 0),
    o: ops,
    vh: letter.vit.hz,
    b: deltaCode(letter.vit.bpm),
    r: deltaCode(letter.vit.br),
    m: letter.share.smiles ? letter.vit.sm : undefined,
    wh: letter.wave.hz,
    w: deltaCode(letter.wave.v),
  };
}

/** Inverse of pack(). Throws on anything malformed. */
export function unpack(p) {
  if (!p || p.v !== FORMAT_VERSION) throw new Error('Unsupported letter version');
  let t = 0;
  const ops = (p.o || []).map((op) => {
    t += op[0];
    return [t * TICK_MS, op[1], op[2], op[3] || ''];
  });
  const share = { edits: !!(p.sh & 1), smiles: !!(p.sh & 2) };
  const bpm = deltaDecode(p.b || []);
  const letter = {
    v: FORMAT_VERSION,
    from: p.f || '',
    to: p.to || '',
    day: p.d || '',
    sim: p.s ? 1 : 0,
    share,
    ops,
    vit: {
      hz: p.vh || 1,
      bpm,
      br: deltaDecode(p.r || []),
      sm: share.smiles && Array.isArray(p.m) ? p.m : new Array(bpm.length).fill(0),
    },
    wave: { hz: p.wh || 25, v: deltaDecode(p.w || []) },
  };
  validate(letter);
  return letter;
}

/** Checks the shape and bounds of a decoded letter. */
export function validate(letter) {
  const fail = (why) => { throw new Error(`Invalid letter: ${why}`); };
  if (!letter || typeof letter !== 'object') fail('not an object');
  if (!Array.isArray(letter.ops) || letter.ops.length > MAX_OPS) fail('ops');
  let len = 0;
  let lastT = -1;
  for (const op of letter.ops) {
    if (!Array.isArray(op) || op.length < 3) fail('op shape');
    const [t, pos, del, ins = ''] = op;
    if (!isInt(t) || t < lastT) fail('op time');
    if (!isInt(pos) || pos < 0 || pos > len) fail('op position');
    if (!isInt(del) || del < 0 || pos + del > len) fail('op delete');
    if (typeof ins !== 'string') fail('op insert');
    len = len - del + ins.length;
    if (len > MAX_TEXT) fail('text too long');
    lastT = t;
  }
  const vit = letter.vit;
  if (!vit || !(vit.hz > 0) || vit.hz > 50) fail('vit.hz');
  for (const k of ['bpm', 'br', 'sm']) {
    if (!Array.isArray(vit[k]) || vit[k].length > MAX_SAMPLES) fail(`vit.${k}`);
    if (!vit[k].every(isInt)) fail(`vit.${k} values`);
  }
  if (!letter.wave || !Array.isArray(letter.wave.v) || letter.wave.v.length > 2000) fail('wave');
  if (!(letter.wave.hz > 0) || letter.wave.hz > 120) fail('wave.hz');
  for (const k of ['from', 'to']) {
    if (letter[k] != null && (typeof letter[k] !== 'string' || letter[k].length > 80)) fail(k);
  }
  if (!letter.share || typeof letter.share !== 'object') fail('share');
  return true;
}

/** Replays the ops and returns the final text. */
export function finalText(letter) {
  let s = '';
  for (const [, pos, del, ins = ''] of letter.ops) s = s.slice(0, pos) + ins + s.slice(pos + del);
  return s;
}

// ---------------------------------------------------------------------------
// Link encoding

/** Letter -> "v1.<base64url of deflated JSON>" */
export async function encodeLetter(letter) {
  const json = JSON.stringify(pack(letter));
  const bytes = await deflate(new TextEncoder().encode(json));
  return LINK_PREFIX + toBase64Url(bytes);
}

/** "v1.<...>" (or a whole URL / fragment containing it) -> letter */
export async function decodeLetter(token) {
  const raw = extractToken(token);
  if (!raw) throw new Error('No letter in this link');
  const bytes = fromBase64Url(raw.slice(LINK_PREFIX.length));
  if (bytes.length > 2_000_000) throw new Error('Letter too large');
  const json = new TextDecoder().decode(await inflate(bytes));
  return unpack(JSON.parse(json));
}

/** Pulls the letter token out of a URL, a hash or a bare token. */
export function extractToken(input) {
  if (typeof input !== 'string') return null;
  const at = input.indexOf(LINK_PREFIX);
  if (at === -1) return null;
  const tok = input.slice(at).split(/[&\s]/)[0];
  return /^v1\.[A-Za-z0-9_-]+$/.test(tok) ? tok : null;
}

export function buildLink(base, token) {
  const clean = String(base || '').split('#')[0];
  return `${clean}#${token}`;
}

// ---------------------------------------------------------------------------
// helpers

function isInt(n) { return Number.isInteger(n); }

function deltaCode(arr) {
  let prev = 0;
  return arr.map((x) => { const d = x - prev; prev = x; return d; });
}

function deltaDecode(arr) {
  let acc = 0;
  return arr.map((d) => (acc += d));
}

async function pipeThrough(bytes, stream) {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

async function deflate(bytes) { return pipeThrough(bytes, new CompressionStream('deflate-raw')); }
async function inflate(bytes) { return pipeThrough(bytes, new DecompressionStream('deflate-raw')); }

export function toBase64Url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
