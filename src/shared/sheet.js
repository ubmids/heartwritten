// sheet.js
// The sheet of paper, as the reader and the writer both draw it: words in
// heart-ink on the right, the heartline in the strip of chart paper down the
// left. This is the part that touches the page; the drawing logic it calls
// (ink, heartline) is pure and tested on its own.

import { inkAt, featherAt } from './playback.js';
import { marginTrace } from './heartline.js';

export function esc(s) {
  return String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
}

const tone = (h) => Math.round((h || 0) * 16) / 16;

/**
 * The letter's words as HTML, each run in the ink its heartbeat gave it.
 * @param {Array<{ch:string, heat:number, smile?:boolean, wet?:boolean}>} units
 * @param {Map<number,string>} [marks]  HTML to drop in before the character at an index
 */
export function inkHtml(units, marks = new Map()) {
  let html = '';
  let smiling = false;
  let i = 0;
  const closeSmile = () => { if (smiling) { html += '</span>'; smiling = false; } };
  while (i < units.length) {
    if (marks.has(i)) { closeSmile(); html += marks.get(i); }
    const u = units[i];
    const h = tone(u.heat);
    let j = i;
    let run = '';
    while (j < units.length && tone(units[j].heat) === h && !!units[j].smile === !!u.smile && !!units[j].wet === !!u.wet && (j === i || !marks.has(j))) {
      run += units[j].ch; j++;
    }
    if (u.smile && !smiling) { html += '<span class="smiled">'; smiling = true; }
    if (!u.smile) closeSmile();
    const cls = [featherAt(h) ? `f${featherAt(h)}` : '', u.wet ? 'wet' : ''].filter(Boolean).join(' ');
    html += `<span style="color:${inkAt(h)}"${cls ? ` class="${cls}"` : ''}>${esc(run)}</span>`;
    i = j;
  }
  closeSmile();
  if (marks.has(units.length)) html += marks.get(units.length);
  return html;
}

/**
 * Where each character sits down the page. A line of writing maps onto the
 * stretch of strip beside it: the start of the line is the top of the
 * stretch, the end of the line is the bottom. Returns stops for marginTrace,
 * measured from the top of `body`.
 */
export function layoutStops(body, heats, { every = 2 } = {}) {
  const n = heats.length;
  const view = body.ownerDocument.defaultView;
  const lineH = parseFloat(view.getComputedStyle(body).lineHeight);
  const width = body.clientWidth;
  const range = body.ownerDocument.createRange();
  if (!(lineH > 0) || !(width > 0) || typeof range.getClientRects !== 'function') return estimateStops(body.textContent, heats);
  const box = body.getBoundingClientRect();
  // If the sheet is mid-unfold its rectangles are squashed; undo that.
  const sx = box.width / body.offsetWidth || 1;
  const sy = box.height / body.offsetHeight || 1;
  const walker = body.ownerDocument.createTreeWalker(body, 4 /* text nodes */);
  const stops = [];
  let i = 0;
  let first = null;
  for (let node = walker.nextNode(); node && i < n; node = walker.nextNode()) {
    const len = node.data.length;
    for (let k = 0; k < len && i < n; k++, i++) {
      if (node.data[k] === '\n' || (i % every && i !== n - 1)) continue;
      range.setStart(node, k);
      range.setEnd(node, k + 1);
      const r = range.getClientRects()[0];
      if (!r || !r.height) continue;
      const rTop = (r.top - box.top) / sy;
      if (first == null) first = rTop;
      const line = Math.round((rTop - first) / lineH);
      const x = Math.max(0, Math.min(1, (r.right - box.left) / sx / width));
      stops.push({ i, line, y: (line + x) * lineH, heat: heats[i] });
    }
  }
  return { stops, lineH, measured: true };
}

// With no layout to measure (tests, or a page that isn't on screen), guess
// the lines from the character count so the heartline still has a shape.
function estimateStops(text, heats, cols = 52, lineH = 34) {
  const stops = [];
  let line = 0; let col = 0;
  for (let i = 0; i < heats.length; i++) {
    const ch = text[i];
    if (ch === '\n') { line++; col = 0; continue; }
    if (++col > cols) { line++; col = 1; }
    stops.push({ i, line, y: (line + col / cols) * lineH, heat: heats[i] });
  }
  return { stops, lineH, measured: false };
}

/** The stop nearest a character index (for hanging a note beside its line). */
export function stopAt(stops, index) {
  let best = null;
  for (const s of stops) {
    if (s.i > index) return best || s;
    best = s;
  }
  return best;
}

/**
 * Draw the heartline into the strip's <svg>. `top` is how far down the strip
 * the writing starts. Returns the pen's position, in the strip's own pixels.
 */
export function drawTrace(svg, strip, stops, { top = 0, rests = [] } = {}) {
  const w = strip.clientWidth || 108;
  const narrow = w < 84;
  const { svg: paths, head, beats } = marginTrace(
    stops.map((s) => ({ y: s.y + top, heat: s.heat })),
    { x: w - (narrow ? 16 : 30), scale: narrow ? 0.6 : 1, rests: rests.map((r) => ({ y: r.y + top, len: r.len })) },
  );
  svg.innerHTML = paths;
  svg.dataset.beats = String(beats);
  return head;
}

/**
 * How tall the sheet should stand right now, and where its two creases fall.
 * The sheet was folded in thirds. It opens to its first fold (or less, on a
 * long sheet) and then grows with the writing, so it is never much bigger
 * than the letter on it.
 * @param {number} need  px the writing needs so far
 * @param {number} full  px the finished sheet will be
 */
const FIRST_OPENING = 320;

export function foldHeight(need, full, done = false) {
  if (!(full > 0)) return { height: 0, panel: 0 };
  const panel = full >= 480 ? full / 3 : 0;
  if (done) return { height: full, panel };
  return { height: Math.min(full, Math.max(need, Math.min(panel || full, FIRST_OPENING))), panel };
}
