// TypeLab — Graffiti engine (M28): Spray can + Acid / bleach tools with live simulation.
//
// Spray can  — droplets, not a soft brush. Time-based emitter (holding still builds paint up), caps (skinny / fat /
//              soft / flare / calligraphy / outline), distance (softer, grainier, less paint per area), overspray halo,
//              spits, and DRIPS: wet paint is tracked on a grid; where it gets too thick a drip runs down, thins out
//              and ends in a bulb. Drips keep running after you let go until the paint is dry (live).
// Acid tool  — bleach / permanganate as a liquid on the fabric: drops, spray or splatter add liquid; the liquid spreads
//              (faster along the warp = vertical, sharp fronts like real wicking), eats the dye while wet and dries.
//              The result lives in a hidden "Painted Bleach" effect on the layer (effects-dynamic.js) and keeps
//              developing live after you let go.
//
// Deterministic: every stroke is simulated with a fixed time step from its recorded pointer samples and a seed, so
// "Replay strokes" rebuilds exactly the same pixels; the live view only decides how fast you watch it happen.
// Undo: one history step per stroke, taken when the stroke has settled (dry).
(function (TL) {
  const U = TL.util;
  const st = TL.st;
  const T = TL.tools;
  const GR = (TL.graffiti = {});

  // ---------------------------------------------------------------- settings (saved with projects like other brushes)
  st.brushes.spray = Object.assign({ size: 60, cap: 'fat', distance: 1, pressure: 1, opacity: 1, overspray: 0.35, spit: 0.08,
    drips: true, dripAt: 0.5, dripLen: 1, dry: 2.5, surface: 'wall', hardness: 0.5 }, st.brushes.spray || {});
  st.brushes.acid = Object.assign({ size: 90, chem: 0, apply: 'splatter', strength: 0.8, amount: 1, wick: 0.6, dry: 3, hardness: 0.5 }, st.brushes.acid || {});
  st.graffiti = Object.assign({ speed: 1 }, st.graffiti || {});

  // ---------------------------------------------------------------- tools (rail, keys, hint)
  if (!T.list.some((t) => t.id === 'spray')) T.list.push({ id: 'spray', key: 'g', name: 'Spray can' }, { id: 'acid', key: 'j', name: 'Acid / bleach' });
  T.ext = T.ext || {};

  // seeded RNG (mulberry32) + normal distribution
  const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const gauss = (r) => Math.sqrt(-2 * Math.log(Math.max(1e-9, r()))) * Math.cos(2 * Math.PI * r());
  const DT = 1 / 120; // simulation step (s)

  // caps: share of the width that is the soft gaussian (vs the flat disc), ellipse aspect + angle, droplet size
  GR.CAPS = {
    skinny: { name: 'Skinny', soft: 0.35, aspect: 1, drop: 0.8, rate: 1 },
    fat: { name: 'Fat', soft: 0.55, aspect: 1, drop: 1.2, rate: 1.3 },
    soft: { name: 'Soft', soft: 1, aspect: 1, drop: 0.9, rate: 0.9 },
    flare: { name: 'Flare', soft: 0.6, aspect: 0.35, drop: 1, rate: 1.1, follow: true },
    calli: { name: 'Calligraphy', soft: 0.3, aspect: 0.14, drop: 0.9, rate: 1, angle: -45 },
    outline: { name: 'Outline', soft: 0.15, aspect: 1, drop: 0.7, rate: 1.4 },
  };
  // surfaces: how far drips run, how fast paint dries, how droplets land
  GR.SURFACES = {
    wall: { name: 'Wall', drip: 1, dry: 1, bleed: 0 },
    fabric: { name: 'Fabric (soaks in)', drip: 0.35, dry: 0.6, bleed: 0.6 },
    glossy: { name: 'Glossy (metal / glass)', drip: 1.8, dry: 1.4, bleed: 0 },
    paper: { name: 'Paper', drip: 0.6, dry: 0.8, bleed: 0.3 },
  };

  // ---------------------------------------------------------------- pointer samples → position at a sim time
  const posAt = (pts, tm) => {
    if (!pts.length) return null;
    if (tm <= pts[0][2]) return pts[0];
    for (let i = 1; i < pts.length; i++) {
      if (pts[i][2] >= tm) {
        const a = pts[i - 1], b = pts[i], k = (tm - a[2]) / Math.max(1e-6, b[2] - a[2]);
        return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, tm, a[3] + (b[3] - a[3]) * k];
      }
    }
    return pts[pts.length - 1];
  };
  const emitting = (rec, simT) => rec.tEnd == null || simT * 1000 <= rec.tEnd;
  // samples are rounded when captured (not later), so the saved stroke replays bit-exactly
  const sample = (x, y, tm, pr) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10, Math.round(tm), Math.round(pr * 100) / 100];
  const pressureOf = (e) => (e && e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 1);

  // ================================================================ SPRAY CAN
  // A spray simulation: owns the stroke record and draws into `buf` (stroke-only pixels, composited by flush)
  function SpraySim(rec, w, h) {
    const b = rec.b, cap = GR.CAPS[b.cap] || GR.CAPS.fat, surf = GR.SURFACES[b.surface] || GR.SURFACES.wall;
    const r = rng(rec.seed);
    // CPU-rasterised (willReadFrequently): the live view redraws this canvas every frame, which would otherwise move
    // it to the GPU rasteriser and give anti-aliasing that differs from a replay by a few bytes
    const buf = U.canvas(w, h), x = buf.getContext('2d', { willReadFrequently: true });
    const CELL = 4, gw = Math.ceil(w / CELL), gh = Math.ceil(h / CELL);
    const wet = new Float32Array(gw * gh), wetT = new Float32Array(gw * gh), cool = new Float32Array(gw * gh);
    const drips = [];
    const R = Math.max(1, b.size / 2), dist = Math.max(0.2, b.distance);
    const dryT = Math.max(0.2, b.dry * surf.dry);
    const dropMean = Math.max(0.45, R * 0.022 * cap.drop * Math.sqrt(dist)); // farther = finer, more scattered
    // paint coverage per second at the centre: ~4 coats/s at distance 1, falls with distance²
    const perSec = 12 * b.pressure * cap.rate / (dist * dist) * (R * R) / (dropMean * dropMean) / 2.2;
    const thr = 16 - 12 * b.dripAt; // coats of wet paint before it runs
    let simT = 0, carry = 0, lastP = null, dir = [1, 0];
    x.fillStyle = rec.color;

    const addWet = (px, py, amt) => {
      const gx = Math.floor(px / CELL), gy = Math.floor(py / CELL);
      if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) return;
      const i = gy * gw + gx;
      wet[i] = wet[i] * Math.exp(-(simT - wetT[i]) / dryT) + amt; wetT[i] = simT;
      if (b.drips && wet[i] > thr && simT >= cool[i]) {
        const ex = wet[i] - thr * 0.7;
        wet[i] = thr * 0.7; cool[i] = simT + 0.7 + r() * 0.8;
        for (const n of [i - 1, i + 1]) if (n >= 0 && n < cool.length) cool[n] = Math.max(cool[n], simT + 0.4); // neighbours wait a bit
        drips.push({ x: (gx + r()) * CELL, y: (gy + 0.5) * CELL, m: ex, m0: ex, w: U.clamp(dropMean * 1.8 + 1.2 + ex * 0.15, 1.4, 9) * (0.6 + 0.6 * r()), ph: r() * 6.28, life: 0 });
      }
    };
    let dirty = null; // changed area since the last take()
    const mark = (x0, y0, x1, y1) => { if (!dirty) dirty = [x0, y0, x1, y1]; else { dirty[0] = Math.min(dirty[0], x0); dirty[1] = Math.min(dirty[1], y0); dirty[2] = Math.max(dirty[2], x1); dirty[3] = Math.max(dirty[3], y1); } };
    const dot = (px, py, rad, a) => {
      if (surf.bleed && rad > 0.6) rad *= 1 + surf.bleed * 0.35;
      mark(px - rad - 1, py - rad - 1, px + rad + 1, py + rad + 1);
      x.globalAlpha = a;
      x.beginPath(); x.arc(px, py, rad, 0, 6.2832); x.fill();
    };
    const emit = (p) => {
      const n0 = perSec * DT * p[3] + carry, n = Math.floor(n0);
      carry = n0 - n;
      const ang = cap.angle != null ? (cap.angle * Math.PI) / 180 : cap.follow ? Math.atan2(dir[1], dir[0]) + Math.PI / 2 : 0;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const sig = R * (0.45 + 0.15 * (dist - 1)), op = b.opacity;
      for (let i = 0; i < n; i++) {
        let u, v;
        if (r() < cap.soft) { u = gauss(r) * sig * 0.55; v = gauss(r) * sig * 0.55; } // soft cone
        else { const a = r() * 6.2832, d = Math.sqrt(r()) * R; u = Math.cos(a) * d; v = Math.sin(a) * d; } // flat core
        v *= cap.aspect;
        const px = p[0] + u * ca - v * sa, py = p[1] + u * sa + v * ca;
        const dr = dropMean * (0.45 + r() * 1.1);
        dot(px, py, dr, op * (0.55 + 0.45 * r()));
        addWet(px, py, (dr * dr * 3.14) / (CELL * CELL) * op);
      }
      // overspray: a thin halo of fine dots well outside the line
      const no = Math.floor(n * b.overspray * 0.25 + (r() < (n * b.overspray * 0.25) % 1 ? 1 : 0));
      for (let i = 0; i < no; i++) {
        const a = r() * 6.2832, d = R * (0.9 + Math.abs(gauss(r)) * 0.9 * dist);
        dot(p[0] + Math.cos(a) * d, p[1] + Math.sin(a) * d * cap.aspect, dropMean * (0.3 + r() * 0.5), op * 0.6);
      }
      // spits: a cold / low can throws big irregular blobs
      if (r() < b.spit * 0.015) {
        const a = r() * 6.2832, d = Math.sqrt(r()) * R * 0.8, cx = p[0] + Math.cos(a) * d, cy = p[1] + Math.sin(a) * d, rad = Math.max(1.2, R * 0.05) * (0.6 + r());
        dot(cx, cy, rad, op);
        for (let k = 0; k < 4; k++) dot(cx + gauss(r) * rad, cy + gauss(r) * rad, rad * 0.35 * r(), op);
        addWet(cx, cy, (rad * rad * 3.14) / (CELL * CELL) * 2);
      }
    };
    const stepDrips = () => {
      const g = 70 * surf.drip * b.dripLen;
      for (const d of drips) {
        if (d.dead) continue;
        d.life += DT;
        const v = Math.min(260, g * Math.sqrt(d.m)) * Math.exp(-d.life / (dryT * 1.5));
        const ny = d.y + v * DT, nx = d.x + Math.sin(d.ph + d.y * 0.03) * v * DT * 0.06; // slight waver
        const wd = Math.max(0.8, d.w * Math.min(1, 0.45 + 0.55 * d.m / d.m0));
        x.globalAlpha = b.opacity; x.strokeStyle = rec.color; x.lineWidth = wd; x.lineCap = 'round';
        x.beginPath(); x.moveTo(d.x, d.y); x.lineTo(nx, ny); x.stroke();
        mark(Math.min(d.x, nx) - wd, d.y - wd, Math.max(d.x, nx) + wd, ny + wd);
        d.m -= (v * DT) * 0.03 / Math.max(0.2, surf.drip * b.dripLen) + DT * 0.08;
        d.x = nx; d.y = ny;
        if (d.m <= d.m0 * 0.08 || v < 4 || d.y > h + 20) { d.dead = true; dot(d.x, d.y + wd * 0.3, wd * 0.72, b.opacity); }
      }
    };
    // advance to sim time `until` (s since stroke start). Paint comes out while simT is within the recorded
    // samples (up to rec.tEnd once released), so the live run and a replay emit exactly the same droplets.
    this.advance = (until, maxSteps = 1e9) => {
      let k = 0;
      while (simT < until && k < maxSteps) {
        if (emitting(rec, simT)) {
          const p = posAt(rec.pts, simT * 1000);
          if (p) {
            if (lastP) { const dx = p[0] - lastP[0], dy = p[1] - lastP[1], l = Math.hypot(dx, dy); if (l > 0.5) dir = [dx / l, dy / l]; }
            lastP = p;
            for (const [sx, sy] of T.symPoints(p[0], p[1], rec.off || [0, 0])) emit([sx, sy, p[2], p[3]]);
          }
        }
        stepDrips();
        simT += DT; k++;
      }
      x.globalAlpha = 1;
      return simT;
    };
    this.busy = () => drips.some((d) => !d.dead);
    this.time = () => simT;
    this.take = () => { const d = dirty; dirty = null; if (!d) return null; const x0 = Math.max(0, Math.floor(d[0])), y0 = Math.max(0, Math.floor(d[1])); return [x0, y0, Math.min(w, Math.ceil(d[2])) - x0, Math.min(h, Math.ceil(d[3])) - y0]; };
    this.buf = buf;
  }

  // ================================================================ ACID / BLEACH (liquid on fabric)
  function AcidSim(rec, field, fw, fh, cell) {
    const b = rec.b, r = rng(rec.seed);
    const N = fw * fh;
    const L = new Float32Array(N), D = new Float32Array(N), L2 = new Float32Array(N);
    // start from what the field already holds (earlier strokes)
    const fx = field.getContext('2d', { willReadFrequently: true });
    const img = fx.getImageData(0, 0, fw, fh), px = img.data;
    for (let i = 0; i < N; i++) { D[i] = px[i * 4] / 255; L[i] = px[i * 4 + 1] / 255; }
    // fibre permeability: one value per warp yarn segment (tall, thin) → ragged, grain-aligned fronts
    const perm = new Float32Array(N);
    const hr = rng(rec.seed ^ 0x5bd1e995);
    const colv = new Float32Array(fw); for (let i = 0; i < fw; i++) colv[i] = hr();
    for (let y = 0; y < fh; y++) for (let xx = 0; xx < fw; xx++) {
      const seg = Math.floor((y + colv[xx] * 7) / 5);
      perm[y * fw + xx] = 0.55 + 0.9 * (((Math.sin(xx * 12.9898 + seg * 78.233) * 43758.5453) % 1 + 1) % 1);
    }
    let bx0 = fw, by0 = fh, bx1 = -1, by1 = -1; // active box (cells)
    const grow = (x0, y0, x1, y1) => { bx0 = Math.max(0, Math.min(bx0, x0)); by0 = Math.max(0, Math.min(by0, y0)); bx1 = Math.min(fw - 1, Math.max(bx1, x1)); by1 = Math.min(fh - 1, Math.max(by1, y1)); };
    const drop = (dx, dy, rad, vol) => { // doc coords
      const cx = dx / cell, cy = dy / cell, rc = Math.max(0.6, rad / cell);
      const x0 = Math.floor(cx - rc), x1 = Math.ceil(cx + rc), y0 = Math.floor(cy - rc), y1 = Math.ceil(cy + rc);
      for (let y = Math.max(0, y0); y <= Math.min(fh - 1, y1); y++) for (let xx = Math.max(0, x0); xx <= Math.min(fw - 1, x1); xx++) {
        const d = Math.hypot(xx + 0.5 - cx, y + 0.5 - cy) / rc;
        if (d < 1) L[y * fw + xx] = Math.min(3, L[y * fw + xx] + vol * (1 - d * d));
      }
      grow(x0 - 2, y0 - 2, x1 + 2, y1 + 2);
    };
    let simT = 0, carry = 0, last = null, vel = [0, 0], pourT = 0;
    const R = Math.max(2, b.size / 2);
    const emit = (p, held) => {
      if (!held) return;
      const amt = b.amount;
      if (b.apply === 'spray') {
        const n0 = 260 * DT * p[3] * (R / 40) + carry, n = Math.floor(n0); carry = n0 - n;
        for (let i = 0; i < n; i++) drop(p[0] + gauss(r) * R * 0.45, p[1] + gauss(r) * R * 0.45, cell * (0.8 + r() * 1.6), 0.5 * amt);
      } else if (b.apply === 'pour') {
        pourT += DT;
        if (pourT > 0.05) { pourT = 0; drop(p[0] + gauss(r) * 2, p[1] + gauss(r) * 2, R * 0.35, 1.2 * amt); }
      } else { // splatter: drops flung along the motion, satellites, a few big blobs
        const sp = Math.hypot(vel[0], vel[1]);
        const n0 = (40 + sp * 0.12) * DT * p[3] * (R / 45) + carry, n = Math.floor(n0); carry = n0 - n;
        for (let i = 0; i < n; i++) {
          const fling = r() * Math.min(1.2, sp / 900) * R * 2.2;
          const ux = sp > 1 ? vel[0] / sp : 0, uy = sp > 1 ? vel[1] / sp : 0;
          const big = r() < 0.12;
          drop(p[0] + ux * fling + gauss(r) * R * 0.5, p[1] + uy * fling + gauss(r) * R * 0.5, (big ? R * 0.22 : R * 0.07) * (0.4 + r()), (big ? 1.4 : 0.9) * amt);
        }
      }
    };
    // nonlinear (porous medium) diffusion: flux ∝ mean wetness → sharp fronts; faster along the warp (y)
    const step = () => {
      if (bx1 < bx0) return;
      const cx = 0.1 * (1 - 0.45 * b.wick), cy = Math.min(0.24, 0.1 * (1 + 0.9 * b.wick));
      const evap = DT / Math.max(0.3, b.dry), rate = DT * 2.2 * b.strength;
      const x0 = Math.max(1, bx0 - 1), x1 = Math.min(fw - 2, bx1 + 1), y0 = Math.max(1, by0 - 1), y1 = Math.min(fh - 2, by1 + 1);
      let nx0 = fw, ny0 = fh, nx1 = -1, ny1 = -1;
      for (let y = y0; y <= y1; y++) {
        let i = y * fw + x0;
        for (let xx = x0; xx <= x1; xx++, i++) {
          const l = L[i];
          const fl = (j, c) => c * (L[j] - l) * Math.min(perm[i], perm[j]) * Math.min(1, (L[j] + l) * 0.9);
          let v = l + fl(i - 1, cx) + fl(i + 1, cx) + fl(i - fw, cy) + fl(i + fw, cy);
          if (v > 0.002) {
            D[i] += rate * (v / (v + 0.25)) * (1 - D[i]);
            v -= v * evap + 0.0015;
            if (v < 0) v = 0;
          } else v = 0;
          L2[i] = v;
          if (v > 0.003) { if (xx < nx0) nx0 = xx; if (xx > nx1) nx1 = xx; if (y < ny0) ny0 = y; if (y > ny1) ny1 = y; }
        }
      }
      for (let y = y0; y <= y1; y++) { const a = y * fw; L.set(L2.subarray(a + x0, a + x1 + 1), a + x0); }
      bx0 = nx0; by0 = ny0; bx1 = nx1; by1 = ny1;
    };
    let dirty = [fw, fh, -1, -1];
    this.advance = (until, maxSteps = 1e9) => {
      let k = 0;
      while (simT < until && k < maxSteps) {
        if (emitting(rec, simT)) {
          const p = posAt(rec.pts, simT * 1000);
          if (p) {
            if (last) { vel = [(p[0] - last[0]) / DT, (p[1] - last[1]) / DT]; }
            last = p;
            for (const [sx, sy] of T.symPoints(p[0], p[1], [0, 0])) emit([sx, sy, p[2], p[3]], true);
          }
        }
        if (bx1 >= bx0) dirty = [Math.min(dirty[0], bx0 - 2), Math.min(dirty[1], by0 - 2), Math.max(dirty[2], bx1 + 2), Math.max(dirty[3], by1 + 2)];
        step();
        simT += DT; k++;
      }
      return simT;
    };
    // write the changed part of the field (R = dye removed, G = wet, A = 255)
    this.flush = () => {
      if (dirty[2] < dirty[0]) return false;
      const x0 = Math.max(0, dirty[0]), y0 = Math.max(0, dirty[1]), x1 = Math.min(fw - 1, dirty[2]), y1 = Math.min(fh - 1, dirty[3]);
      const ww = x1 - x0 + 1, hh = y1 - y0 + 1;
      const part = fx.createImageData(ww, hh), q = part.data;
      for (let y = 0; y < hh; y++) for (let xx = 0; xx < ww; xx++) {
        const i = (y0 + y) * fw + x0 + xx, o = (y * ww + xx) * 4;
        q[o] = Math.round(Math.min(1, D[i]) * 255); q[o + 1] = Math.round(Math.min(1, L[i]) * 255); q[o + 2] = 0; q[o + 3] = 255;
      }
      fx.putImageData(part, x0, y0);
      dirty = bx1 >= bx0 ? [bx0 - 2, by0 - 2, bx1 + 2, by1 + 2] : [fw, fh, -1, -1];
      return true;
    };
    this.busy = () => bx1 >= bx0;
    this.time = () => simT;
  }

  // ---------------------------------------------------------------- the target of a stroke
  const sprayTarget = () => {
    let L = TL.cur();
    if (L && L.locked) { U.toast('Layer is locked'); return null; }
    if (!L || L.type !== 'paint') { L = TL.addLayer(TL.make.paint({ name: 'Spray' })); TL.emit('layers'); }
    return L;
  };
  // the field effect on a layer (created on first use)
  GR.fieldCell = () => Math.max(2, Math.ceil(Math.max(TL.doc.width, TL.doc.height) / 1400));
  GR.acidEffect = (L, create = true) => {
    let e = (L.effects || []).find((x) => x.type === 'dyn_bleachpaint');
    if (!e && create) {
      const cell = GR.fieldCell();
      e = TL.make.effect('dyn_bleachpaint');
      e.fieldId = TL.asset.blank(Math.ceil(TL.doc.width / cell), Math.ceil(TL.doc.height / cell), '#000000');
      e.p.chem = st.brushes.acid.chem; e.p.neutral = st.brushes.acid.chem ? 0 : 1;
      e.open = false;
      L.effects.push(e);
      TL.emit('effects');
    }
    return e;
  };

  // ---------------------------------------------------------------- live runner (one stroke at a time)
  let live = null; // { kind, sim, rec, L, t0, held, raf, ... }
  const now = () => performance.now();
  const frame = () => {
    if (!live) return;
    const lv = live;
    const tReal = ((now() - lv.t0) / 1000) * st.graffiti.speed;
    const pts = lv.rec.pts;
    if (lv.held) {
      // keep the newest pointer sample "now" so holding still keeps spraying (dwell builds up paint)
      const lp = pts[pts.length - 1], tm = tReal * 1000;
      if (lp && tm > lp[2] + 16) pts.push(sample(lp[0], lp[1], tm, lp[3]));
    }
    lv.sim.advance(lv.held ? Math.min(tReal, pts[pts.length - 1][2] / 1000) : tReal, 40);
    draw(lv);
    if (lv.held || lv.sim.busy() || lv.sim.time() * 1000 <= lv.rec.tEnd) lv.raf = requestAnimationFrame(frame);
    else finish();
  };
  const draw = (lv) => {
    if (lv.kind === 'spray') {
      // only the area that changed this frame: base underneath, then the stroke on top
      const r = lv.sim.take();
      if (!r || r[2] <= 0 || r[3] <= 0) return;
      const [rx, ry, rw, rh] = r, x = lv.canvas.getContext('2d');
      x.save(); x.beginPath(); x.rect(rx, ry, rw, rh); x.clip();
      x.globalCompositeOperation = 'copy'; x.drawImage(lv.base, 0, 0); x.globalCompositeOperation = 'source-over';
      let src = lv.sim.buf;
      if (st.selection) { // stencil: only inside the selection
        const s = lv.scratch || (lv.scratch = U.canvas(src.width, src.height)), sx = s.getContext('2d');
        sx.save(); sx.beginPath(); sx.rect(rx, ry, rw, rh); sx.clip();
        sx.globalCompositeOperation = 'copy'; sx.drawImage(src, 0, 0);
        sx.globalCompositeOperation = 'destination-in'; sx.drawImage(TL.asset.get(st.selection.maskId), -lv.off[0], -lv.off[1]);
        sx.restore(); src = s;
      }
      x.drawImage(src, rx, ry, rw, rh, rx, ry, rw, rh);
      x.restore();
      TL.asset.bump(lv.id);
    } else if (lv.sim.flush()) TL.asset.bump(lv.e.fieldId);
    TL.view.request(true);
  };
  const finish = () => {
    const lv = live;
    if (!lv) return;
    cancelAnimationFrame(lv.raf);
    live = null;
    draw(lv);
    // keep the stroke as data (Replay strokes)
    const rec = lv.rec;
    rec.t = Math.round(lv.sim.time() * 1000) / 1000;
    const host = lv.kind === 'spray' ? lv.L : lv.e;
    (host.strokes = host.strokes || []).push(rec);
    TL.commit(lv.kind === 'spray' ? 'Spray' : 'Bleach');
    if (lv.kind === 'acid' && lv.e.p.chem > 0.5 && TL.ui && TL.ui.buildInspector) TL.ui.buildInspector(); // Neutralise button
  };
  // settle now: run the rest of the simulation instantly (a new stroke, Settle button, export, mode change)
  GR.settle = () => {
    if (!live) return;
    if (live.held) release();
    let guard = 0;
    live.sim.advance(live.rec.tEnd / 1000 + DT);
    while (live.sim.busy() && guard++ < 200) live.sim.advance(live.sim.time() + 0.5);
    finish();
  };
  GR.busy = () => !!live;

  const begin = (kind, p, e) => {
    if (T.notReady()) return false;
    if (live) GR.settle();
    const pr = pressureOf(e);
    if (kind === 'spray') {
      const L = sprayTarget();
      if (!L) return false;
      const id = (L.canvasId = TL.asset.cow(L.canvasId));
      const canvas = TL.asset.get(id);
      const rec = { tool: 'spray', seed: (Math.random() * 1e9) >>> 0, color: st.color, b: Object.assign({}, st.brushes.spray), sym: st.sym || 'off', off: [L.ox || 0, L.oy || 0], pts: [sample(p.x - (L.ox || 0), p.y - (L.oy || 0), 0, pr)] };
      const sim = new SpraySim(rec, canvas.width, canvas.height);
      live = { kind, sim, rec, L, id, canvas, base: U.cloneCanvas(canvas), off: [L.ox || 0, L.oy || 0], t0: now(), held: true };
    } else {
      const L = TL.cur();
      if (!L) { U.toast('Select the layer to bleach (Graffiti → Make denim)'); return false; }
      if (L.locked) { U.toast('Layer is locked'); return false; }
      const fx = GR.acidEffect(L);
      fx.fieldId = TL.asset.cow(fx.fieldId);
      const field = TL.asset.get(fx.fieldId);
      if (st.brushes.acid.chem) fx.p.neutral = 0; fx.p.chem = st.brushes.acid.chem;
      const rec = { tool: 'acid', seed: (Math.random() * 1e9) >>> 0, b: Object.assign({}, st.brushes.acid), sym: st.sym || 'off', pts: [sample(p.x, p.y, 0, pr)] };
      const cell = TL.doc.width / field.width;
      const sim = new AcidSim(rec, field, field.width, field.height, cell);
      live = { kind, sim, rec, L, e: fx, t0: now(), held: true };
    }
    live.raf = requestAnimationFrame(frame);
    return true;
  };
  const moveTo = (p, e) => {
    if (!live || !live.held) return;
    const pts = live.rec.pts, tm = Math.max(pts[pts.length - 1][2], ((now() - live.t0) / 1000) * st.graffiti.speed * 1000);
    const o = live.kind === 'spray' ? live.off : [0, 0];
    if (pts.length < 6000) pts.push(sample(p.x - o[0], p.y - o[1], tm, pressureOf(e)));
  };
  // button up: the stroke's paint ends at the release time (a last sample where the can stopped)
  const release = () => {
    if (!live || !live.held) return;
    const pts = live.rec.pts, lp = pts[pts.length - 1];
    const tm = Math.max(lp[2], ((now() - live.t0) / 1000) * st.graffiti.speed * 1000);
    if (tm > lp[2]) pts.push(sample(lp[0], lp[1], tm, lp[3]));
    live.rec.tEnd = pts[pts.length - 1][2];
    live.held = false;
  };
  T.ext.spray = { down: (p, e) => begin('spray', p, e), move: moveTo, up: release };
  T.ext.acid = { down: (p, e) => begin('acid', p, e), move: moveTo, up: release };

  // ---------------------------------------------------------------- replay (rebuild a layer's strokes exactly)
  GR.replaySpray = (L) => {
    if (!L || L.type !== 'paint' || !L.strokes || !L.strokes.length) return false;
    GR.settle();
    const id = (L.canvasId = TL.asset.cow(L.canvasId)), c = TL.asset.get(id), x = c.getContext('2d');
    x.clearRect(0, 0, c.width, c.height);
    const prevSym = st.sym;
    for (const rec of L.strokes) {
      st.sym = rec.sym || 'off';
      const sim = new SpraySim(rec, c.width, c.height);
      sim.advance(rec.tEnd / 1000 + DT);
      while (sim.busy()) sim.advance(sim.time() + 0.5);
      x.drawImage(sim.buf, 0, 0);
    }
    st.sym = prevSym;
    TL.asset.bump(id);
    TL.commit('Replay strokes');
    TL.view.request(true);
    return true;
  };
  GR.replayAcid = (L) => {
    const e = L && GR.acidEffect(L, false);
    if (!e || !e.strokes || !e.strokes.length) return false;
    GR.settle();
    e.fieldId = TL.asset.cow(e.fieldId);
    const f = TL.asset.get(e.fieldId), fx = f.getContext('2d');
    fx.fillStyle = '#000'; fx.fillRect(0, 0, f.width, f.height);
    const prevSym = st.sym;
    for (const rec of e.strokes) {
      st.sym = rec.sym || 'off';
      const sim = new AcidSim(rec, f, f.width, f.height, TL.doc.width / f.width);
      sim.advance(rec.tEnd / 1000 + DT);
      while (sim.busy()) sim.advance(sim.time() + 0.5);
      sim.flush();
    }
    st.sym = prevSym;
    TL.asset.bump(e.fieldId);
    TL.commit('Replay bleach');
    TL.view.request(true);
    return true;
  };
  GR.clearAcid = (L) => {
    const i = L ? (L.effects || []).findIndex((x) => x.type === 'dyn_bleachpaint') : -1;
    if (i < 0) return;
    GR.settle();
    L.effects.splice(i, 1);
    TL.commit('Clear bleach');
    TL.emit('effects');
  };
  GR.neutralise = (L) => {
    const e = L && GR.acidEffect(L, false);
    if (!e) return;
    GR.settle();
    e.p.neutral = 0;
    TL.dyn.play(e, { from: 0, to: 1, seconds: 1.5 });
  };
  // the history must never capture a half-run stroke: settle before undo / redo / save / export / workspace change
  const settleFirst = (obj, k) => { const f = obj && obj[k]; if (typeof f !== 'function' || f.__settles) return; obj[k] = function (...a) { GR.settle(); if (TL.dyn) TL.dyn.stopAll(); return f.apply(this, a); }; obj[k].__settles = true; };
  GR.hook = () => {
    ['undo', 'redo'].forEach((k) => settleFirst(TL.hist, k));
    if (TL.exp) Object.keys(TL.exp).filter((k) => /^(save|export|png|svg|imageBlob|renderFinal|buildFont|glyphSheet)/i.test(k)).forEach((k) => settleFirst(TL.exp, k));
    if (TL.ui) settleFirst(TL.ui, 'setMode');
  };
  GR.hook(); // again from mode-graffiti.js once every module is loaded
})(window.TL);
