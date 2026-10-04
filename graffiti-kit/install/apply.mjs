#!/usr/bin/env node
// Graffiti kit installer for TypeLab (M28).
//   node graffiti-kit/install/apply.mjs <path-to-typelab-repo> [--dry]
// 1. copies the three new modules into app/js
// 2. applies small anchored edits to existing files (exact text match, each anchor must occur exactly once)
// Every anchor is checked BEFORE anything is written; if one is missing (the file changed since the snapshot this
// was written against) nothing is touched and the report says which anchor to re-target. Safe to run twice:
// edits that are already in place are skipped.
import fs from 'node:fs';
import path from 'node:path';

const KIT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const root = path.resolve(args.find((a) => !a.startsWith('--')) || '.');
const app = path.join(root, 'app');
if (!fs.existsSync(path.join(app, 'index.html'))) { console.error('Not a TypeLab repo (no app/index.html): ' + root); process.exit(1); }

const FILES = ['js/effects-dynamic.js', 'js/graffiti.js', 'js/ui/mode-graffiti.js'];

// [file, anchor, replacement, alreadyMarker, optional, count]  (count = how many times the anchor must occur; all are replaced)
const EDITS = [
  // -- load order: effects after the other effect libraries, engine after tools.js, workspace after Paint
  ['index.html', '<script src="js/filters-texture.js"></script>', '<script src="js/filters-texture.js"></script>\n  <script src="js/effects-dynamic.js"></script>', 'js/effects-dynamic.js'],
  ['index.html', '<script src="js/tools.js"></script>', '<script src="js/tools.js"></script>\n  <script src="js/graffiti.js"></script>', 'js/graffiti.js'],
  ['index.html', '<script src="js/ui/mode-paint.js"></script>', '<script src="js/ui/mode-paint.js"></script>\n  <script src="js/ui/mode-graffiti.js"></script>', 'js/ui/mode-graffiti.js'],

  // -- tools.js: extension hook for tools that run their own stroke (T.ext[tool] = { down, move, up })
  ['js/tools.js', "    const painter = tool === 'brush' || tool === 'eraser' || tool === 'fxbrush';\n    // Alt + right-drag",
    "    const painter = tool === 'brush' || tool === 'eraser' || tool === 'fxbrush' || !!(T.ext && T.ext[tool]);\n    // Alt + right-drag", "|| !!(T.ext && T.ext[tool]);\n    // Alt + right-drag"],
  ['js/tools.js', "    if (tool === 'brush' || tool === 'eraser' || tool === 'fxbrush') {\n      if (strokeStart(tool, p.x, p.y, e)) drag = { kind: 'stroke' };",
    "    if (T.ext && T.ext[tool]) { if (T.ext[tool].down(p, e)) drag = { kind: 'ext', tool }; return; }\n    if (tool === 'brush' || tool === 'eraser' || tool === 'fxbrush') {\n      if (strokeStart(tool, p.x, p.y, e)) drag = { kind: 'stroke' };", "drag = { kind: 'ext', tool }"],
  ['js/tools.js', "    if (d.kind === 'stroke' && stroke) {", "    if (d.kind === 'ext') { T.ext[d.tool].move(p, e); return; }\n    if (d.kind === 'stroke' && stroke) {", "if (d.kind === 'ext') { T.ext[d.tool].move"],
  ['js/tools.js', "    } else if (d.kind === 'stroke') {\n      if (stroke) {", "    } else if (d.kind === 'ext') {\n      T.ext[d.tool].up(p, e);\n    } else if (d.kind === 'stroke') {\n      if (stroke) {", "T.ext[d.tool].up(p, e);"],
  ['js/tools.js', "} else if (st.tool === 'brush' || st.tool === 'eraser' || st.tool === 'fxbrush') V.request();",
    "} else if (st.tool === 'brush' || st.tool === 'eraser' || st.tool === 'fxbrush' || (T.ext && T.ext[st.tool])) V.request();", "|| (T.ext && T.ext[st.tool])) V.request();"],

  // -- view.js: brush circle for the new tools
  ['js/view.js', "const painter = tool === 'brush' || tool === 'eraser' || tool === 'fxbrush';",
    "const painter = tool === 'brush' || tool === 'eraser' || tool === 'fxbrush' || !!(TL.tools && TL.tools.ext && TL.tools.ext[tool]);", "TL.tools.ext && TL.tools.ext[tool]);"],

  // (the Acid tool's field raster must be an asset everywhere asset ids are collected: see SWEEP below)

  // -- FX & Filters: "Dynamic" gallery tab + ▶ on effect cards that can develop live
  ['js/ui/mode-fx.js', "const FAMILIES = ['Effects', 'Textures', 'Parametric', 'Craft Lab', 'Filter Gallery', 'Filter Menu'];",
    "const FAMILIES = ['Effects', 'Dynamic', 'Textures', 'Parametric', 'Craft Lab', 'Filter Gallery', 'Filter Menu'];", "'Effects', 'Dynamic',"],
  ['js/ui/mode-fx.js', "    'Effects': 'Glow, blur, distort, light, colour, post FX — the core effect library',",
    "    'Effects': 'Glow, blur, distort, light, colour, post FX — the core effect library',\n    'Dynamic': 'Live effects that develop over time (▶): denim washes, bleach, acid, permanganate — reactive to the fabric underneath',", "'Dynamic': 'Live effects"],
  ['js/ui/mode-fx.js', "      h('span', { class: 'fxname', onclick: toggleOpen, title: d.help || '' }, d.name),",
    "      h('span', { class: 'fxname', onclick: toggleOpen, title: d.help || '' }, d.name),\n      d.dynamic && TL.dyn ? TL.dyn.playButton(e) : null,", "TL.dyn.playButton(e)"],

  // -- shell.js: tab tooltip + hint bar text
  ['js/ui/shell.js', "export: 'PNG / SVG / fonts / print plates / mockups' };",
    "export: 'PNG / SVG / fonts / print plates / mockups', graffiti: 'spray can, acid / bleach on denim, live washes' };", "graffiti: 'spray can, acid"],
  ['js/ui/shell.js', "    hand: 'Drag to pan · mouse wheel zooms', zoom:",
    "    spray: 'Spray paint · hold still to build up (drips) · a selection is a stencil · Alt = pick colour · Alt + right-drag: width',\n    acid: 'Splatter / spray / pour bleach on the selected layer · it spreads while wet, then dries',\n    hand: 'Drag to pan · mouse wheel zooms', zoom:", "    spray: 'Spray paint"],

  // -- optional: the Start card lists the workspaces
  ['js/ui/variants.js', 'FX → Paint → Export.', 'FX → Paint → Graffiti → Export.', 'Paint → Graffiti → Export', true],
];

// The asset-id pattern is copied in several files (snapshot: state.js ×2, export.js save, autosave.js) — every copy
// gets "fieldId" so the Acid tool's field is saved, autosaved, frozen in history and restored.
const SWEEP = { find: '(?:canvasId|maskId|imageId|tileAsset|motifId)', repl: '(?:canvasId|maskId|imageId|tileAsset|motifId|fieldId)', min: 4 };

const report = [];
const pending = new Map(); // file → new text
let failed = 0;
for (const [rel, anchor0, repl0, marker0, optional, count = 1] of EDITS) {
  const f = path.join(app, rel);
  if (!fs.existsSync(f)) { report.push(`MISSING FILE  ${rel}`); failed++; continue; }
  let txt = pending.has(f) ? pending.get(f) : fs.readFileSync(f, 'utf8');
  // the repo mixes LF and CRLF files: match the file's own line endings
  const nl = (x) => (x && /\r\n/.test(txt) ? x.replace(/\r?\n/g, '\r\n') : x);
  const anchor = nl(anchor0), repl = nl(repl0), marker = nl(marker0);
  if (marker && txt.includes(marker)) { report.push(`already done  ${rel}: ${anchor.split('\n')[0].trim().slice(0, 70)}`); continue; }
  const n = txt.split(anchor).length - 1;
  if (n !== count) {
    report.push(`${optional ? 'skipped (opt)' : 'ANCHOR ' + (n ? `FOUND ${n}x, EXPECTED ${count}x` : 'NOT FOUND')}  ${rel}: ${anchor.split('\n')[0].trim().slice(0, 90)}`);
    if (!optional) failed++;
    continue;
  }
  txt = txt.split(anchor).join(repl);
  pending.set(f, txt);
  report.push(`edit          ${rel}: ${anchor.split('\n')[0].trim().slice(0, 70)}`);
}
{
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((x) => (x.isDirectory() ? (x.name === 'vendor' ? [] : walk(path.join(d, x.name))) : x.name.endsWith('.js') ? [path.join(d, x.name)] : []));
  let n = 0, done = 0;
  for (const f of walk(path.join(app, 'js'))) {
    const txt = pending.has(f) ? pending.get(f) : fs.readFileSync(f, 'utf8');
    done += txt.split(SWEEP.repl).length - 1;
    const k = txt.split(SWEEP.find).length - 1;
    if (!k) continue;
    n += k;
    pending.set(f, txt.split(SWEEP.find).join(SWEEP.repl));
    report.push(`edit ×${k}       ${path.relative(app, f)}: asset-id pattern += fieldId`);
  }
  if (n + done < SWEEP.min) { report.push(`ASSET PATTERN FOUND ${n + done}x, EXPECTED >= ${SWEEP.min}x — check how asset ids are collected`); failed++; }
}
console.log(report.join('\n'));
if (failed) { console.error(`\n${failed} anchor(s) failed — nothing was written. Re-target them in install/apply.mjs (see INSTALL in graffiti-kit/README.md).`); process.exit(2); }
if (dry) { console.log('\n--dry: nothing written'); process.exit(0); }
for (const rel of FILES) {
  const to = path.join(app, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(path.join(KIT, 'app', rel), to);
  console.log('copied        app/' + rel);
}
for (const [f, txt] of pending) fs.writeFileSync(f, txt);
// exe tests next to the others
const tdir = path.join(root, 'tools', 'exe-tests');
if (fs.existsSync(tdir)) for (const t of fs.readdirSync(path.join(KIT, 'tests')).filter((n) => /^m28_.*\.js$/.test(n))) { fs.copyFileSync(path.join(KIT, 'tests', t), path.join(tdir, t)); console.log('copied        tools/exe-tests/' + t); }
console.log('\nDone. Start the app (npm start) and open the Graffiti tab (key 6).');
