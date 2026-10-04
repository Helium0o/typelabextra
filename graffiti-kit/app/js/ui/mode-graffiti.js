// TypeLab — Graffiti workspace (M28): spray can, acid / bleach on denim, live washes.
// Order of the panel: Surface (what you paint on) → the active tool's settings → Washes (live, ▶) → Looks (presets
// matched to reference photos) → Live (settle / replay / speed). Everything it adds is ordinary TypeLab data: paint
// layers, pattern layers and effects from the "Dynamic" family, so Layers, History, FX & Filters and Export just work.
(function (TL) {
  const U = TL.util;
  const h = U.h;
  const UI = TL.ui;
  const A = TL.act;
  const st = TL.st;
  const T = TL.tools;
  const GR = TL.graffiti;

  // ---------------------------------------------------------------- icons (20×20 stroke paths, like ui/kit.js)
  Object.assign(UI.I, {
    mGraffiti: '<rect x="6" y="7" width="7" height="10.5" rx="1.5"/><path d="M7.5 7V5h4v2M9.5 5V3.5h3"/><path d="M15 4.5h.01M16.5 3h.01M16.8 6h.01M14.8 2.2h.01" stroke-width="2"/>',
    spray: '<rect x="5" y="8" width="7" height="9.5" rx="1.5"/><path d="M6.5 8V6h4v2M8.5 6V4.5h3"/><path d="M14.5 5h.01M16.3 3.6h.01M16.6 6.6h.01M14.4 8.2h.01M17.4 9.4h.01" stroke-width="2"/>',
    acid: '<path d="M10 3c2.8 3.6 4.5 6.1 4.5 8.4a4.5 4.5 0 0 1-9 0C5.5 9.1 7.2 6.6 10 3z"/><path d="M8 12.2a2 2 0 0 0 2 2" opacity=".7"/>',
  });

  // ---------------------------------------------------------------- workspace position: after Paint, before Export
  if (!UI.modeOrder.includes('graffiti')) {
    const i = UI.modeOrder.indexOf('export');
    UI.modeOrder.splice(i < 0 ? UI.modeOrder.length : i, 0, 'graffiti');
  }

  // ---------------------------------------------------------------- surfaces (texturelib weaves)
  // scale: twill pitch that reads as denim on a typical document (change it in the Pattern workspace)
  const SURF = [
    ['raw', 'Raw indigo', 'tx-denim', ['#16264a', '#d9d2c0'], { wash: 0, irregularity: 0.85, slub: 0.5 }],
    ['mid', 'Mid indigo', 'tx-denim', ['#1f3561', '#d9d2c0'], { wash: 0.35 }],
    ['light', 'Stonewashed', 'tx-denim', ['#3a5a8c', '#d9d2c0'], { wash: 0.85 }],
    ['black', 'Black', 'tx-twill', ['#151517', '#38383a'], { over: 3, under: 1, direction: 'Z', slub: 0.3, irregularity: 0.5 }],
    ['grey', 'Grey', 'tx-twill', ['#4a4b4f', '#7d7e82'], { over: 3, under: 1, direction: 'Z', slub: 0.3 }],
  ];
  GR.makeSurface = (key) => {
    const s = SURF.find((q) => q[0] === key) || SURF[1];
    if (!TL.patterns.has(s[2])) { U.toast('The texture library is missing ' + s[2]); return null; }
    const L = TL.make.pattern(s[2], { name: s[1] + ' denim' });
    L.colors = s[3].slice();
    Object.assign(L.p, s[4]);
    L.scale = U.clamp(0.35 * Math.max(TL.doc.width, TL.doc.height) / 1920, 0.12, 2);
    // under any paint layers, so spray lands on top of it
    TL.addLayer(L);
    const ls = TL.doc.layers, i = ls.indexOf(L);
    if (i > 0) { ls.splice(i, 1); ls.splice(0, 0, L); }
    TL.select(L.id);
    TL.commit('Make denim');
    TL.emit('layers');
    return L;
  };
  // the layer a wash goes on: the selected layer, or a new surface
  const washTarget = (surfaceKey) => {
    let L = TL.cur();
    if (!L || L.type === 'paint' || L.type === 'text') L = TL.doc.layers.find((l) => l.type === 'pattern' || l.type === 'image') || null;
    if (!L) L = GR.makeSurface(surfaceKey || 'mid');
    return L;
  };

  // ---------------------------------------------------------------- looks (matched to the user's reference photos)
  // p = params; anything not listed keeps the effect's default. "play" = develop live when added.
  GR.LOOKS = [
    { id: 'black-splatter', name: 'Black jeans · bleach splatter', surf: 'black', fx: [['dyn_splatter', { dye: 2, size: 20, count: 0.7, cloud: 0.8, cloudSize: 300, lace: 0.95, speck: 0.7, rim: 0.3, warm: 0 }]] },
    { id: 'indigo-crumple', name: 'Indigo · crumple bleach, peach cores', surf: 'raw', fx: [['dyn_crumple', { dye: 1, coverage: 0.68, warm: 0.75, stretch: 1.4 }]] },
    { id: 'acid-80s', name: '80s acid wash', surf: 'mid', fx: [['dyn_stone', { dye: 1, fade: 0.45, t: 0.7 }], ['dyn_acid', { dye: 1, veins: 0.8, blotch: 0.65, fade: 0.4 }]] },
    { id: 'feather-marble', name: 'Light feather marble wash', surf: 'mid', fx: [['dyn_stone', { dye: 1, fade: 0.75, t: 0.85, salt: 0.5 }], ['dyn_marble', { dye: 1, amount: 0.8, base: 0.2, size: 260 }]] },
    { id: 'snow', name: 'Snow wash', surf: 'mid', fx: [['dyn_snow', { dye: 1 }]] },
    { id: 'stone-mid', name: 'Stonewash · mid', surf: 'raw', fx: [['dyn_stone', { dye: 1, fade: 0.6 }]] },
    { id: 'enzyme-vintage', name: 'Enzyme vintage', surf: 'mid', fx: [['dyn_enzyme', { dye: 1 }], ['dyn_tint', { amount: 0.25, dirty: 0.3 }]] },
    { id: 'pp-live', name: 'PP spray (watch it react)', surf: 'raw', fx: [['dyn_pp', { dye: 1, t: 1 }]] },
    { id: 'black-rust', name: 'Black jeans · rust bleach', surf: 'black', fx: [['dyn_crumple', { dye: 2, warm: 0.95, coverage: 0.6 }]] },
    { id: 'dirty-vintage', name: 'Dirty vintage', surf: 'light', fx: [['dyn_vintage', { dye: 1 }], ['dyn_tint', { dirty: 0.7 }]] },
  ];
  GR.applyLook = (id, opts = {}) => {
    const look = GR.LOOKS.find((q) => q.id === id);
    if (!look) return null;
    GR.settle();
    const L = opts.layer || washTarget(look.surf);
    if (!L) return null;
    // a look replaces the layer's earlier washes (painted bleach stays)
    L.effects = L.effects.filter((e) => { const d = TL.fx.get(e.type); return !(d && d.family === 'Dynamic' && e.type !== 'dyn_bleachpaint'); });
    const added = look.fx.map(([type, p]) => { const e = TL.make.effect(type); Object.assign(e.p, p); e.open = false; L.effects.push(e); return e; });
    TL.commit('Look: ' + look.name);
    TL.emit('effects');
    if (opts.play !== false) added.forEach((e) => TL.dyn.play(e));
    return L;
  };
  const addWash = (type) => {
    const L = washTarget();
    if (!L) return;
    const e = A.addEffect(type, { kind: 'layer', obj: L });
    e.open = true;
    TL.dyn.play(e);
  };

  // ---------------------------------------------------------------- panel sections
  const S = (label, key, min, max, step, obj, after) => UI.slider({ label, min, max, step, value: obj[key], def: obj[key], onInput: (v) => { obj[key] = v; if (after) after(v); TL.view.request(); } });
  const toolSeg = () => h('div', { class: 'row' }, h('label', null, 'Tool'), UI.seg([['spray', 'Spray can'], ['acid', 'Acid / bleach']], ['spray', 'acid'].includes(st.tool) ? st.tool : '', (v) => T.set(v)));

  function surfaceSection() {
    const body = h('div', { class: 'stack' },
      h('div', { class: 'row wrap tight' }, ...SURF.map(([k, name]) => UI.btn(name, () => GR.makeSurface(k), 'xs', 'Add a ' + name.toLowerCase() + ' denim layer'))),
      UI.note('Spray paints on a paint layer above. Acid and washes work on the selected layer — denim, an imported photo of jeans, or anything else.'));
    return UI.section('Surface', body, { id: 'g-surface' });
  }
  function spraySection() {
    const b = st.brushes.spray;
    const body = h('div', { class: 'stack' }, toolSeg(),
      UI.select('Cap', Object.entries(GR.CAPS).map(([k, c]) => [k, c.name]), b.cap, (v) => { b.cap = v; }),
      S('Width', 'size', 2, 800, 1, b), S('Distance', 'distance', 0.3, 3, 0.01, b), S('Pressure', 'pressure', 0.05, 1, 0.01, b), S('Opacity', 'opacity', 0.05, 1, 0.01, b),
      UI.color('Colour', st.color, (v) => { st.color = v; UI.buildRail(); }),
      S('Overspray', 'overspray', 0, 1, 0.01, b), S('Spits', 'spit', 0, 1, 0.01, b),
      UI.select('Surface', Object.entries(GR.SURFACES).map(([k, s]) => [k, s.name]), b.surface, (v) => { b.surface = v; }),
      h('div', { class: 'row' }, UI.check('Drips', b.drips, (v) => { b.drips = v; UI.buildInspector(); })));
    if (b.drips) body.append(S('Drips start', 'dripAt', 0, 1, 0.01, b), S('Drip length', 'dripLen', 0.1, 3, 0.01, b), S('Drying (s)', 'dry', 0.3, 8, 0.1, b));
    body.append(UI.note('Hold still to build paint up — too much and it runs. Closer = sharper and wetter; farther = wider, misty. A selection works as a stencil. Pen pressure is used.'));
    return UI.section('Spray can', body, { id: 'g-spray' });
  }
  function acidSection() {
    const b = st.brushes.acid, L = TL.cur(), e = L && GR.acidEffect(L, false);
    const body = h('div', { class: 'stack' }, toolSeg(),
      h('div', { class: 'row' }, h('label', null, 'Chemical'), UI.seg([[0, 'Bleach'], [1, 'Permanganate']], b.chem, (v) => { b.chem = +v; })),
      h('div', { class: 'row' }, h('label', null, 'Apply'), UI.seg([['splatter', 'Splatter'], ['spray', 'Spray'], ['pour', 'Pour']], b.apply, (v) => { b.apply = v; })),
      S('Size', 'size', 4, 800, 1, b), S('Strength', 'strength', 0.05, 1, 0.01, b), S('Liquid', 'amount', 0.1, 2, 0.01, b),
      S('Wicking', 'wick', 0, 1, 0.01, b), S('Drying (s)', 'dry', 0.5, 10, 0.1, b));
    if (e) {
      body.append(UI.select('Dye', TL.fx.get('dyn_bleachpaint').params.find((q) => q.k === 'dye').options.map((o, i) => [i, o]), e.p.dye, (v) => { e.p.dye = +v; TL.commit('Dye'); }),
        UI.slider({ label: 'Warm tones', min: 0, max: 1, step: 0.01, value: e.p.warm, def: 0, onInput: (v) => { e.p.warm = v; TL.touch(); }, onChange: () => TL.commit('Warm tones') }),
        UI.slider({ label: 'Tide mark', min: 0, max: 1, step: 0.01, value: e.p.rim, def: 0.45, onInput: (v) => { e.p.rim = v; TL.touch(); }, onChange: () => TL.commit('Tide mark') }));
      const row = h('div', { class: 'row wrap tight' });
      if (e.p.chem > 0.5 && e.p.neutral < 0.99) row.append(UI.btn('Neutralise', () => GR.neutralise(L), 'sm accent', 'Stop the permanganate: brown → bleached'));
      row.append(UI.btn('Replay', () => GR.replayAcid(L), 'xs', 'Rebuild from the recorded strokes'), UI.btn('Clear', () => GR.clearAcid(L), 'xs'));
      body.append(row);
    }
    body.append(UI.note('Bleach spreads through the weave while it is wet — further along the yarn — and keeps eating the dye until it dries. Permanganate stays purple, then brown, until you Neutralise.'));
    return UI.section('Acid / bleach', body, { id: 'g-acid' });
  }
  function washesSection() {
    const list = TL.fx.list.filter((f) => f.family === 'Dynamic' && !f.hidden);
    const grid = h('div', { class: 'row wrap tight' }, ...list.map((f) => UI.btn(f.name, () => addWash(f.id), 'xs', f.help || '')));
    const body = h('div', { class: 'stack' }, grid);
    // the selected layer's live effects, editable here (same cards as FX & Filters)
    const L = TL.cur();
    const mine = L ? L.effects.filter((e) => { const d = TL.fx.get(e.type); return d && d.family === 'Dynamic' && !d.hidden; }) : [];
    mine.forEach((e) => body.append(UI.effectCard(L.effects, e, L.effects.indexOf(e))));
    body.append(UI.note('Washes develop live (▶ replays). The result is exactly the Develop value — exports match what you see.'));
    return UI.section('Washes', body, { id: 'g-washes' });
  }
  function looksSection() {
    const body = h('div', { class: 'stack tight' }, ...GR.LOOKS.map((l) => h('button', { class: 'btn sm', style: 'text-align:left', onclick: () => GR.applyLook(l.id) }, l.name)));
    body.append(UI.note('A look replaces the washes on the selected layer (or makes a denim layer first).'));
    return UI.section('Looks', body, { id: 'g-looks' });
  }
  function liveSection() {
    const L = TL.cur();
    const body = h('div', { class: 'stack' },
      UI.slider({ label: 'Live speed', min: 0.25, max: 4, step: 0.05, value: st.graffiti.speed, def: 1, onInput: (v) => { st.graffiti.speed = v; } }),
      h('div', { class: 'row wrap tight' },
        UI.btn('Settle now', () => { GR.settle(); TL.dyn.stopAll(); }, 'xs', 'Finish drips, spreading bleach and running washes instantly'),
        L && L.type === 'paint' && L.strokes && L.strokes.length ? UI.btn('Replay spray', () => GR.replaySpray(L), 'xs', 'Rebuild this layer from its recorded strokes') : null));
    return UI.section('Live', body, { id: 'g-live', closed: true });
  }

  UI.registerMode({
    id: 'graffiti', label: 'Graffiti', icon: 'mGraffiti', tools: ['spray', 'acid', 'rect', 'ellipse', 'lasso', 'move', 'hand', 'zoom'],
    build(box) {
      const L = TL.cur();
      box.append(surfaceSection());
      if (st.tool === 'acid') box.append(acidSection()); else box.append(spraySection());
      box.append(washesSection(), looksSection(), liveSection());
      if (L) box.append(UI.section('Layer', UI.layerBasics(L), { id: 'g-layer', closed: true }));
    },
  });

  // Ctrl+K
  UI.addCommands(() => [
    { label: 'Spray can', cat: 'Graffiti', key: 'G', run: () => T.set('spray') },
    { label: 'Acid / bleach', cat: 'Graffiti', key: 'J', run: () => T.set('acid') },
    ...SURF.map(([k, name]) => ({ label: 'Make denim: ' + name, cat: 'Graffiti', run: () => { UI.setMode('graffiti'); GR.makeSurface(k); } })),
    ...GR.LOOKS.map((l) => ({ label: 'Look: ' + l.name, cat: 'Graffiti', run: () => { UI.setMode('graffiti'); GR.applyLook(l.id); } })),
    { label: 'Settle live effects', cat: 'Graffiti', run: () => { GR.settle(); TL.dyn.stopAll(); } },
  ]);
  // the inspector follows the tool inside this workspace
  TL.on('tool', () => { if (st.mode === 'graffiti') UI.buildInspector(); });
  GR.hook();
})(window.TL);
