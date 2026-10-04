// M28 Graffiti: workspace, Dynamic effects (identity at t=0, deterministic, scale), spray can (live drips, one
// history step, replay = identical), acid (field, live spreading, permanganate neutralise), looks, save round trip.
// exe:  node cdp.mjs "evalfile:m28_graffiti.js" "saveimgs:m28_"      browser: node graffiti-kit/tests/run-browser.mjs
const U = TL.util, GR = TL.graffiti, out = { errs: [] };
const oe = console.error; console.error = (...a) => { out.errs.push(a.map(String).join(' ').slice(0, 200)); oe.apply(console, a); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const px = (c) => c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data;
const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };
const comp = (s) => TL.render.composite(s, { useCache: false });
window.__sheets = {};
const shot = (name, c) => { window.__sheets[name] = c.toDataURL('image/png'); };
try {
  TL.newDoc(800, 1000, '#ffffff'); TL.hist.reset();
  // ---------------------------------------------------------------- 1. workspace
  out.modes = TL.ui.modeOrder.join(' ');
  TL.ui.setMode('graffiti');
  out.key6 = TL.ui.modeOrder[5];
  out.inspector = ['Surface', 'Spray can', 'Washes', 'Looks'].filter((t) => !document.querySelector('#inspector').textContent.includes(t)).join(',') || 'ok';
  out.tools = ['spray', 'acid'].map((t) => (TL.tools.ext && TL.tools.ext[t] ? t : 'MISSING ' + t)).join(',');
  out.dynTab = TL.fx.list.filter((f) => f.family === 'Dynamic' && !f.hidden).length;

  // ---------------------------------------------------------------- 2. Dynamic effects
  const L = GR.makeSurface('mid');
  for (let k = 0; k < 12; k++) { comp(0.5); await wait(120); } // texture tile on the workers
  const base = px(comp(0.5));
  { const big = comp(1), sm = U.canvas(big.width / 2, big.height / 2); sm.getContext('2d').drawImage(big, 0, 0, sm.width, sm.height); out.scaleBaseline = '1x vs 0.5x with no effect: ' + diff(px(sm), base).toFixed(1); }
  out.fx = [];
  const ids = TL.fx.list.filter((f) => f.family === 'Dynamic' && !f.hidden).map((f) => f.id);
  const sheet = U.canvas(200 * 4, 250 * Math.ceil(ids.length / 4)), sx = sheet.getContext('2d');
  for (const [i, id] of ids.entries()) {
    const e = TL.make.effect(id); L.effects = [e];
    e.p.t = 0; const z = px(comp(0.5));
    e.p.t = 1; const c1 = comp(0.5), a = px(c1), a2 = px(comp(0.5));
    const big = comp(1), sm = U.canvas(c1.width, c1.height); sm.getContext('2d').drawImage(big, 0, 0, sm.width, sm.height);
    out.fx.push(`${id}: t0 ${diff(base, z).toFixed(2)} · t1 ${diff(base, a).toFixed(1)} · repeat ${diff(a, a2).toFixed(2)} · 1x vs 0.5x ${diff(px(sm), a).toFixed(1)}`);
    sx.drawImage(c1, (i % 4) * 200, Math.floor(i / 4) * 250, 200, 250);
  }
  shot('effects', sheet);
  L.effects = [];

  // ---------------------------------------------------------------- 3. spray can
  TL.st.color = '#e8202a';
  Object.assign(TL.st.brushes.spray, { size: 60, cap: 'fat', distance: 1, pressure: 1, drips: true, dripAt: 0.6, dripLen: 1, dry: 1.5, surface: 'wall' });
  TL.tools.set('spray');
  const h0 = TL.hist.stack.length;
  const sp = TL.tools.ext.spray;
  sp.down({ x: 200, y: 200 }, { pointerType: 'mouse' });
  for (let i = 0; i <= 20; i++) { await wait(25); sp.move({ x: 200 + i * 15, y: 200 }, {}); }
  await wait(900); // hold still → paint builds up → drips
  sp.up({}, {});
  const pl = TL.cur();
  await wait(250);
  out.sprayLiveAfterRelease = GR.busy();
  let g = 0; while (GR.busy() && g++ < 150) await wait(100);
  out.sprayHistorySteps = TL.hist.stack.length - h0;
  const c = TL.asset.get(pl.canvasId), d1 = px(c);
  let painted = 0, drips = 0;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) { if (d1[(y * c.width + x) * 4 + 3] > 20) { painted++; if (y > 270 && Math.abs(x - 500) < 70) drips++; } }
  out.spray = { layer: pl.type, painted, dripPixels: drips, strokes: (pl.strokes || []).length };
  const live = U.cloneCanvas(c);
  GR.replaySpray(pl);
  out.sprayReplayDiff = diff(d1, px(TL.asset.get(pl.canvasId))).toFixed(4);
  // settle mid-stroke must give the same pixels as letting it run
  sp.down({ x: 150, y: 600 }, { pointerType: 'mouse' }); for (let i = 0; i < 10; i++) { await wait(20); sp.move({ x: 150 + i * 20, y: 620 }, {}); }
  sp.up({}, {}); GR.settle();
  const afterSettle = px(TL.asset.get(pl.canvasId)); GR.replaySpray(pl);
  out.settleVsReplay = diff(afterSettle, px(TL.asset.get(pl.canvasId))).toFixed(4);
  shot('spray', comp(1));
  void live;

  // ---------------------------------------------------------------- 4. acid / bleach on the denim layer
  TL.select(L.id); TL.tools.set('acid');
  Object.assign(TL.st.brushes.acid, { chem: 1, apply: 'splatter', size: 120, strength: 0.9, amount: 1, wick: 0.7, dry: 2 });
  const ac = TL.tools.ext.acid, h1 = TL.hist.stack.length;
  ac.down({ x: 400, y: 500 }, { pointerType: 'mouse' });
  for (let i = 0; i < 15; i++) { await wait(20); ac.move({ x: 400 + i * 18, y: 500 + i * 6 }, {}); }
  ac.up({}, {});
  await wait(200);
  out.acidLiveAfterRelease = GR.busy();
  const fe = GR.acidEffect(L, false);
  const midWet = (() => { const f = px(TL.asset.get(fe.fieldId)); let w = 0; for (let i = 1; i < f.length; i += 4) w = Math.max(w, f[i]); return w; })();
  g = 0; while (GR.busy() && g++ < 200) await wait(100);
  const f1 = px(TL.asset.get(fe.fieldId));
  let bleached = 0, wet = 0; for (let i = 0; i < f1.length; i += 4) { if (f1[i] > 40) bleached++; if (f1[i + 1] > 5) wet++; }
  out.acid = { effect: fe.type, wetWhileLive: midWet, bleachedCells: bleached, wetAfterDry: wet, historySteps: TL.hist.stack.length - h1, neutral: fe.p.neutral };
  shot('acid-permanganate', comp(1));
  GR.neutralise(L); await wait(1900);
  out.acid.neutralAfter = fe.p.neutral;
  shot('acid-neutralised', comp(1));
  GR.replayAcid(L);
  out.acidReplayDiff = diff(f1, px(TL.asset.get(fe.fieldId))).toFixed(4);

  // ---------------------------------------------------------------- 5. looks
  out.looks = [];
  const looks = U.canvas(200 * 5, 250 * 2), lx = looks.getContext('2d');
  for (const [i, lk] of GR.LOOKS.entries()) {
    TL.newDoc(800, 1000, '#ffffff');
    const LL = GR.applyLook(lk.id, { play: false });
    for (let k = 0; k < 8; k++) { comp(0.5); await wait(100); }
    const cc = comp(0.5);
    lx.drawImage(cc, (i % 5) * 200, Math.floor(i / 5) * 250, 200, 250);
    out.looks.push(lk.id + ': ' + LL.effects.map((e) => e.type).join('+'));
  }
  shot('looks', looks);

  // ---------------------------------------------------------------- 6. live ▶ animation, undo, save round trip
  TL.newDoc(600, 600, '#ffffff');
  const L2 = GR.applyLook('pp-live');
  await wait(400); const midT = L2.effects[0].p.t;
  g = 0; while (TL.dyn.running.size && g++ < 80) await wait(100);
  out.play = { midT: +midT.toFixed(2), endT: L2.effects[0].p.t, running: TL.dyn.running.size };
  TL.tools.set('acid'); TL.select(L2.id);
  ac.down({ x: 300, y: 300 }, {}); await wait(60); ac.up({}, {}); GR.settle();
  const json = JSON.stringify(TL.doc);
  out.saveIncludesField = TL.asset.docIds().includes(GR.acidEffect(L2, false).fieldId);
  const ids2 = [...json.matchAll(/"(?:canvasId|maskId|imageId|tileAsset|motifId|fieldId)":"([^"]+)"/g)].map((m) => m[1]);
  const assets = {}; ids2.forEach((id) => { const cv = TL.asset.get(id); if (cv) assets[id] = cv.toDataURL('image/png'); });
  const before = px(comp(0.5));
  await TL.exp.openObject({ app: 'TypeLab', version: 1, doc: JSON.parse(json), assets, fonts: [] });
  for (let k = 0; k < 8; k++) { comp(0.5); await wait(100); }
  out.roundTripDiff = diff(before, px(comp(0.5))).toFixed(3);
  out.undo = (() => { const n = TL.hist.idx; TL.hist.undo(); const ok = TL.hist.idx === n - 1 || n <= 0; TL.hist.redo(); return ok; })();
} catch (err) { out.errs.push('EXCEPTION ' + (err && err.stack || err)); }
console.error = oe;
return JSON.stringify(out, null, 1);
