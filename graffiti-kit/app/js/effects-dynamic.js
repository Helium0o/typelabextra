// TypeLab — Dynamic effects (M28): denim washes and bleach / acid looks that develop over time.
// Every effect here has a "Develop" time param; the effect is a pure function of (image, params, seed, time), so the
// live ▶ animation, undo, autosave, every export scale and the export preview all agree. ▶ only animates the
// time param in the live view (TL.dyn.play) — nothing is ever exported as video.
// Reactive to the surface: the dye type can be read from the layer's own colour (Dye: Auto), bright folds /
// highlights fade first ("Follow folds"), the twill / yarn texture of the layer stays visible inside bleached areas,
// and bleach wicks further along the warp (vertical yarns) than across it.
// Colour reactions (research: graffiti-kit/README.md · HANDOVER-graffiti.md §3.3): indigo → sky blue → near white,
// over-bleached cores go peach; sulfur black → grey → off-white, or rust / orange with "Warm / rust tones".
(function (TL) {
  const FX = TL.fx;
  const G = TL.gl;
  const { R, PX, SEL, C, SEED } = FX.H;
  const FAM = 'Dynamic';
  const def = (cat, d) => FX.def(Object.assign({ family: FAM, cat, dynamic: { param: 't', seconds: 2.5 } }, d));

  // ---------------------------------------------------------------- shared GLSL
  const LIB = `
float fibN(vec2 P, float sc){ return vnoise(vec2(P.x/(sc*0.6), P.y/(sc*6.0))); }      // fibre streak along the warp (vertical)
float yarnR(vec2 D){ float w=1.6; float c=floor(D.x/w); return hash12(vec2(c, floor((D.y+c*1.7)/(w*3.2)))); } // one value per warp-yarn float
float ridgedN(vec2 p){ float a=0.5,s=0.0; for(int i=0;i<5;i++){ s+=a*(1.0-abs(vnoise(p)*2.0-1.0)); p=p*2.03+vec2(7.3,1.9); a*=0.5; } return s/0.97; }
vec2 dwarp(vec2 p, float k, float sd){ return p + k*(vec2(fbm(p+sd*1.37), fbm(p+sd*0.71+vec2(5.2,1.3)))-0.5); }
// which dye: 0 auto (from the layer colour), 1 indigo, 2 black (sulfur), 3 grey (sulfur bottom), 4 custom
int dyeOf(float sel, vec3 avg){ int k=int(sel+0.5); if(k!=0) return k; vec3 h=rgb2hsv(avg); // blue-ish = indigo (the white weft lowers saturation)
  if(h.x>0.5 && h.x<0.78 && h.y>0.08) return 1; return h.z<0.4 ? 2 : 3; }
// the colour a dyed yarn turns into when a share d (0..1) of its dye is gone
vec3 discharge(vec3 c, float d, int k, float warm, vec3 custom){
  d=clamp(d,0.0,1.0); vec3 a,b,w;
  if(k==1){ a=vec3(0.47,0.61,0.78); b=vec3(0.86,0.91,0.95); w=vec3(0.94,0.76,0.63); }
  else if(k==2){ a=vec3(0.44,0.44,0.45); b=vec3(0.90,0.89,0.87); w=vec3(0.70,0.38,0.22); }
  else if(k==3){ a=vec3(0.52,0.56,0.62); b=vec3(0.86,0.87,0.88); w=vec3(0.86,0.70,0.56); }
  else { a=mix(c,custom,0.6); b=custom; w=custom; }
  vec3 r = d<0.55 ? mix(c,a,d/0.55) : mix(a,b,(d-0.55)/0.45);
  if(k==2) r = mix(r, mix(w, vec3(0.93,0.80,0.64), smoothstep(0.55,1.0,d)), warm*smoothstep(0.1,0.55,d)); // black dyes go rust → tan
  else r = mix(r, w, warm*smoothstep(0.68,1.0,d));                                                        // over-bleached cores go peach
  return r;
}
// discharge with the weave kept as detail; d = 0 returns the input exactly
vec3 dis(vec3 c, float d, int k, float warm, vec3 custom, float det, float keep){ return discharge(c, d, k, warm, custom)*mix(1.0, det, keep*min(1.0, d*3.0)); }
// yarn-by-yarn break-up of a smooth discharge (ring dyeing: whole yarns lose their indigo shell, "salt & pepper")
float salty(float d, vec2 D, float amt){ return clamp(d + (yarnR(D)-0.5)*amt*4.0*d*(1.0-d), 0.0, 1.0); }
`;
  // u_tex = layer, u_tex2 = small blur (local average: keeps the weave as detail), u_tex3 = wide blur (folds)
  const HEAD = `
vec2 P=gl_FragCoord.xy; vec2 D=P/u_scale; vec4 s=T(P); if(s.a<0.002){ o=vec4(0.0); return; }
vec3 c=unp(s); vec3 avg=unp(T2(P)); float det=clamp(luma(c)/max(luma(avg),0.03),0.55,1.6);
float fold=clamp((luma(avg)-luma(unp(T3(P))))*4.0+0.5,0.0,1.0); int k=dyeOf(p_dye, unp(T3(P))); vec3 cust=p_custom.rgb;
`;
  const OUT = `o=pm(clamp(col,0.0,1.0), s.a);`;
  const F = (body) => LIB + 'void main(){' + HEAD + body + OUT + '}';
  const run = (src) => (c) => {
    const b1 = c.blur(c.src, 2.5 * c.scale), b2 = c.blur(c.src, 28 * c.scale);
    return c.pass(F(src), { u_tex: c.src, u_tex2: b1, u_tex3: b2 });
  };
  const DYE = () => SEL('dye', 'Dye', ['Auto (from colour)', 'Indigo (blue jeans)', 'Black (sulfur)', 'Grey (sulfur bottom)', 'Custom colour']);
  const CUST = () => Object.assign(C('custom', 'Bleached colour', '#e8e2d6'), { when: (p) => p.dye === 4 });
  const WARM = (d = 0) => R('warm', 'Warm / rust tones', 0, 1, d, 0.01);
  const T_ = (d = 0.75) => Object.assign(R('t', 'Develop', 0, 1, d, 0.01), { help: '▶ plays it from 0 to here' });

  // ================================================================ BLEACH & ACID
  def('Bleach & acid', { id: 'dyn_splatter', name: 'Bleach Splatter', help: 'Drops, spray dots and cloudy bleached areas; spots grow, wick along the yarn and leave tide marks',
    params: [T_(0.8), DYE(), PX('size', 'Spot size', 2, 300, 26, 0.5), R('count', 'Spots', 0, 1, 0.55, 0.01), R('cloud', 'Cloud bleach', 0, 1, 0.55, 0.01),
      PX('cloudSize', 'Cloud size', 20, 3000, 300, 1), R('lace', 'Foam lace', 0, 1, 0.65, 0.01), R('speck', 'Fine spray dots', 0, 1, 0.45, 0.01),
      R('wick', 'Wicking along yarn', 0, 1, 0.5, 0.01), R('rim', 'Tide mark', 0, 1, 0.35, 0.01), WARM(), CUST(), SEED()],
    run: run(`
      float sd=p_seed; float grow=sqrt(max(p_t,0.0));
      // cloudy bleached zones (where the bleach soaked in)
      float cl=fbm(dwarp(P/p_cloudSize, 1.3, sd));
      float thr=mix(0.98, 0.36, p_cloud*p_t);
      float cloudD=smoothstep(thr, thr+0.1, cl + (fibN(P, p_cloudSize*0.05)-0.5)*0.12*p_wick);
      float band=smoothstep(thr-0.2, thr, cl)*(1.0-cloudD);           // just outside a cloud: foam lace / dense spots
      float dens=p_count*0.55 + p_lace*band*0.6;
      float spot=0.0, rim=0.0;
      for(int sc=0; sc<3; sc++){
        float cs=p_size*(sc==0 ? 2.4 : sc==1 ? 1.0 : 0.42); vec2 q=P/cs; vec2 ci=floor(q);
        for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){
          vec2 g=ci+vec2(float(x),float(y)); float fs=float(sc)*13.7+sd*7.31;
          if(hash12(g*1.37+fs) > dens*(sc==2 ? 1.3 : 1.0)) continue;
          vec2 dv=q-(g+hash22(g+fs)); dv.y*=mix(1.0,0.66,p_wick);    // spreads further along the warp
          float r=(0.16+0.3*hash12(g+19.1+fs))*grow;
          float dd=length(dv)/max(r,1e-3) + (fibN(P, cs*0.06)-0.5)*0.35*p_wick;
          spot=max(spot, 1.0-smoothstep(0.82,1.0,dd));
          rim=max(rim, smoothstep(0.62,0.92,dd)*(1.0-smoothstep(0.92,1.1,dd)));
        }
      }
      float speck=step(1.0-p_speck*0.22*(0.25+band+cloudD*0.5)*p_t, hash12(floor(D/1.4)+sd));
      float d=max(max(cloudD, spot), speck*0.85);
      d*=0.86+0.14*fibN(P, 6.0*u_scale);
      d=salty(d, D, 0.35);
      vec3 col=dis(c, d, k, p_warm, cust, det, 0.7);
      col=mix(col, dis(c, 0.3, k, p_warm*1.4, cust, det, 1.0), rim*p_rim*(1.0-cloudD)*0.75); // dye pushed to the rim
    `) });

  def('Bleach & acid', { id: 'dyn_crumple', name: 'Crumple Bleach', help: 'Scrunched fabric + bleach: cloudy blooms along the folds, feathery edges, peach over-bleached cores',
    params: [T_(0.75), DYE(), PX('size', 'Fold size', 20, 3000, 240, 1), R('stretch', 'Stretch (along legs)', 0.3, 4, 1.4, 0.01), R('coverage', 'Coverage', 0, 1, 0.66, 0.01),
      R('soft', 'Soft edge', 0, 1, 0.4, 0.01), R('fibre', 'Feathered edges', 0, 1, 0.6, 0.01), WARM(0.7), CUST(), SEED()],
    run: run(`
      float sd=p_seed; vec2 q=P/p_size; q.y/=p_stretch;
      vec2 w=dwarp(q, 1.7, sd); float h=fbm(w)*0.85 + 0.15*ridgedN(q*3.0+sd);
      h+=(vnoise(rot2(w, 0.6)*vec2(9.0, 70.0))-0.5)*0.16*p_fibre + (vnoise(D/1.5)-0.5)*0.05*p_fibre;   // feathery fibres along the folds
      float thr=mix(0.92, 0.32, p_coverage*sqrt(max(p_t,0.0))); float e=0.02+p_soft*0.2;
      float d=smoothstep(thr, thr+e, h)*0.72 + 0.28*smoothstep(thr+e, thr+e+0.18, h);
      d=salty(d, D, 0.3);
      vec3 col=dis(c, d, k, p_warm, cust, det, 0.7);
    `) });

  def('Bleach & acid', { id: 'dyn_acid', name: 'Acid Wash', help: '80s acid / moon wash: pumice soaked in permanganate — sharp, marbled, high-contrast veins',
    params: [T_(0.75), DYE(), PX('size', 'Marble size', 10, 2000, 150, 1), R('veins', 'Veins', 0, 1, 0.75, 0.01), R('blotch', 'Blotches', 0, 1, 0.5, 0.01),
      R('contrast', 'Contrast', 0, 1, 0.75, 0.01), R('grain', 'Stone grain', 0, 1, 0.6, 0.01), R('fade', 'Overall fade', 0, 1, 0.35, 0.01), WARM(), CUST(), SEED()],
    run: run(`
      float sd=p_seed; vec2 q=P/p_size; float tt=sqrt(max(p_t,0.0));
      float gr=(hash12(floor(D/1.2)+sd)-0.5)*0.22*p_grain + (fibN(P, 4.0*u_scale)-0.5)*0.1*p_grain;
      float v=1.0-abs(fbm(dwarp(q, 2.3, sd))*2.0-1.0); v=pow(v, mix(2.0, 7.0, p_contrast));
      float vt=1.0-0.6*tt*p_veins; float vd=smoothstep(vt, vt+0.06, v+gr);
      float bl=fbm(dwarp(q*0.55, 1.1, sd+3.0)); float bt=mix(0.95, 0.42, p_blotch*tt); float bd=smoothstep(bt, bt+0.12, bl+gr);
      float d=max(vd, bd); d=max(d, p_fade*p_t*0.5 + (yarnR(D)-0.5)*0.12*p_t);
      d=salty(d, D, 0.25)*min(1.0, p_t*20.0);
      vec3 col=dis(c, d, k, p_warm, cust, det, 0.75);
    `) });

  def('Bleach & acid', { id: 'dyn_marble', name: 'Feather Marble Wash', help: 'Light wash with feathery, fibrous bleached swirls (modern marble / cloud wash)',
    params: [T_(0.75), DYE(), PX('size', 'Patch size', 20, 3000, 320, 1), R('amount', 'Amount', 0, 1, 0.65, 0.01), R('feather', 'Feathering', 0, 1, 0.8, 0.01),
      R('swirl', 'Swirl', 0, 3, 1.5, 0.01), R('base', 'Base wash', 0, 1, 0.45, 0.01), WARM(), CUST(), SEED()],
    run: run(`
      float sd=p_seed; vec2 q=P/p_size;
      vec2 w=dwarp(q, p_swirl, sd); w=dwarp(w*1.7, p_swirl*0.6, sd+2.0); float h=fbm(w);
      float f=vnoise(rot2(w, 0.9)*vec2(14.0, 120.0)), f2=vnoise(D/1.3);                 // hairy fibres that follow the swirl
      h+=(f-0.5)*0.22*p_feather + (f2-0.5)*0.06*p_feather;
      float thr=mix(0.82, 0.36, p_amount*sqrt(max(p_t,0.0)));
      float d=smoothstep(thr, thr+0.1+0.14*p_feather, h)*(0.62+0.38*f);
      d=max(d*min(1.0, p_t*20.0), p_base*p_t*0.62); d=salty(d, D, 0.4);
      vec3 col=dis(c, d, k, p_warm, cust, det, 0.8);
    `) });

  def('Bleach & acid', { id: 'dyn_snow', name: 'Snow Wash', help: 'Permanganate poured on dry stones: many small frosty flakes, clustered on the folds',
    params: [T_(0.75), DYE(), PX('size', 'Flake size', 1, 80, 6, 0.25), R('density', 'Density', 0, 1, 0.6, 0.01), R('cluster', 'Clustering', 0, 1, 0.6, 0.01),
      PX('clusterSize', 'Cluster size', 20, 3000, 200, 1), R('fade', 'Overall fade', 0, 1, 0.25, 0.01), WARM(), CUST(), SEED()],
    run: run(`
      float sd=p_seed; float cl=fbm(dwarp(P/p_clusterSize, 1.0, sd)); float dens=p_density*mix(1.0, smoothstep(0.35,0.7,cl)*1.6, p_cluster);
      vec2 q=P/p_size; vec2 ci=floor(q); float fl=0.0;
      for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){ vec2 g=ci+vec2(float(x),float(y));
        if(hash12(g*1.31+sd) > dens*0.7) continue;
        float r=(0.25+0.5*hash12(g+7.7+sd))*sqrt(max(p_t,0.0)); float dd=length(q-(g+hash22(g+sd)))/max(r,1e-3) + (hash12(floor(D)+g)-0.5)*0.5;
        fl=max(fl, 1.0-smoothstep(0.7,1.0,dd)); }
      float d=max(fl, p_fade*p_t*0.5); d=salty(d, D, 0.3);
      vec3 col=dis(c, d, k, p_warm, cust, det, 0.75);
    `) });

  def('Bleach & acid', { id: 'dyn_pp', name: 'PP Spray (permanganate)', help: 'Live chemistry: wet purple → brown manganese → neutralised and bleached. Use "Paint area" to place it',
    dynamic: { param: 't', seconds: 4 },
    params: [Object.assign(R('t', 'Stage', 0, 1, 1, 0.01), { help: '0–0.3 wet purple · 0.3–0.65 brown · 0.65–1 neutralised' }), DYE(), PX('size', 'Cloud size', 10, 3000, 180, 1),
      R('amount', 'Amount', 0, 1, 0.65, 0.01), R('soft', 'Softness', 0, 1, 0.7, 0.01), R('folds', 'Follow folds', 0, 1, 0.5, 0.01), WARM(), CUST(), SEED()],
    run: run(`
      float sd=p_seed; float n=fbm(dwarp(P/p_size, 0.8, sd)) + (fold-0.5)*p_folds*0.5 + (hash12(floor(D/1.3)+sd)-0.5)*0.12;
      float thr=mix(0.9, 0.3, p_amount); float m=smoothstep(thr, thr+0.04+p_soft*0.35, n);
      float s1=smoothstep(0.0,0.25,p_t), s2=smoothstep(0.28,0.6,p_t), s3=smoothstep(0.65,0.95,p_t);
      vec3 col=mix(c, dis(c, salty(m*0.95, D, 0.35), k, p_warm, cust, det, 0.7), s3);
      col=mix(col, vec3(0.42,0.12,0.40)*det*mix(1.0, luma(c)*2.0+0.4, 0.4), m*s1*(1.0-s2)*0.8);  // wet permanganate
      col=mix(col, vec3(0.36,0.24,0.14)*det, m*s2*(1.0-s3)*0.85);                               // manganese dioxide
    `) });

  // ================================================================ WASHES
  def('Denim washes', { id: 'dyn_stone', name: 'Stone Wash', help: 'Pumice abrasion: overall fade, salt & pepper yarns, folds and seams fade first',
    params: [T_(0.7), DYE(), R('fade', 'Fade', 0, 1, 0.55, 0.01), R('salt', 'Salt & pepper', 0, 1, 0.6, 0.01), R('streaks', 'Vertical streaks', 0, 1, 0.5, 0.01),
      R('folds', 'Follow folds', 0, 1, 0.6, 0.01), PX('size', 'Mottle size', 10, 2000, 110, 1), WARM(), CUST(), SEED()],
    run: run(`
      float sd=p_seed; float mo=fbm(P/p_size+sd);
      float d=p_fade*p_t*0.8*(0.7+0.6*mo) + p_folds*(fold-0.5)*0.7*p_t + p_streaks*(fibN(P, 9.0*u_scale)-0.5)*0.35*p_t;
      d=salty(clamp(d,0.0,1.0), D, p_salt*0.8);
      vec3 col=dis(c, d, k, p_warm, cust, det, 0.85);
    `) });

  def('Denim washes', { id: 'dyn_enzyme', name: 'Enzyme Wash', help: 'Cellulase enzymes: softer, even fade; loose indigo backstains the light parts blue; Ozone cleans that up',
    params: [T_(0.7), DYE(), R('fade', 'Fade', 0, 1, 0.5, 0.01), PX('size', 'Mottle size', 10, 2000, 220, 1), R('salt', 'Salt & pepper', 0, 1, 0.3, 0.01),
      R('backstain', 'Backstain', 0, 1, 0.5, 0.01), R('ozone', 'Ozone clean-up', 0, 1, 0, 0.01), WARM(), CUST(), SEED()],
    run: run(`
      float d=p_fade*p_t*0.75*(0.85+0.3*fbm(P/p_size+p_seed)); d=salty(d, D, p_salt*0.6);
      vec3 col=dis(c, d, k, p_warm, cust, det, 0.85);
      col=mix(col, col*vec3(0.80,0.90,1.04)+vec3(0.0,0.02,0.06), p_backstain*p_t*(1.0-p_ozone)*smoothstep(0.5,0.9,luma(col)));
      col=mix(col, vec3(luma(col))*vec3(1.0,0.99,0.95), 0.3*p_ozone*p_t);
    `) });

  def('Denim washes', { id: 'dyn_bleachwash', name: 'Bleach Wash', help: 'Chlorine bleach bath: even lightening; not neutralised = yellowing; black denim goes brown / orange (Warm)',
    params: [T_(0.7), DYE(), R('strength', 'Strength', 0, 1, 0.65, 0.01), R('even', 'Evenness', 0, 1, 0.8, 0.01), PX('size', 'Unevenness size', 10, 3000, 400, 1),
      R('yellow', 'Yellowing (not neutralised)', 0, 1, 0, 0.01), WARM(), CUST(), SEED()],
    run: run(`
      float d=p_strength*p_t*(p_even + (1.0-p_even)*fbm(P/p_size+p_seed)*1.4); d=salty(clamp(d,0.0,1.0), D, 0.3);
      vec3 col=dis(c, d, k, p_warm, cust, det, 0.85);
      col=mix(col, col*vec3(1.0,0.95,0.78), p_yellow*d);
    `) });

  def('Denim washes', { id: 'dyn_sand', name: 'Sandblast / Hand Sanding', help: 'Local soft fades on the high points (thighs, seat, knees), grainy',
    params: [T_(0.75), DYE(), SEL('where', 'Where', ['Folds & highlights', 'Centre of the shape', 'Everywhere']), R('amount', 'Amount', 0, 1, 0.6, 0.01),
      PX('size', 'Patch size', 10, 3000, 260, 1), R('grain', 'Grain', 0, 1, 0.6, 0.01), WARM(), CUST(), SEED()],
    run: run(`
      int wh=int(p_where+0.5); float zone;
      if(wh==0) zone=smoothstep(0.45,0.8,fold)*0.8+0.2*fbm(P/p_size+p_seed);
      else if(wh==1){ vec2 cc=(P-u_bounds.xy)/max(u_bounds.zw,vec2(1.0))-0.5; zone=1.0-smoothstep(0.1,0.5,length(cc*vec2(1.6,1.0))); zone*=0.75+0.5*fbm(P/p_size+p_seed); }
      else zone=0.5+0.5*fbm(P/p_size+p_seed);
      float d=zone*p_amount*p_t + (hash12(floor(D/1.1)+p_seed)-0.5)*0.3*p_grain*zone;
      d=salty(clamp(d,0.0,1.0), D, 0.5)*min(1.0, p_t*20.0);
      vec3 col=dis(c, d, k, p_warm, cust, det, 0.8);
    `) });

  def('Denim washes', { id: 'dyn_tint', name: 'Tinted / Dirty Wash', help: 'A beige / coffee tint over the wash; Dirt settles in the creases',
    params: [T_(0.7), C('tint', 'Tint', '#b39a70'), R('amount', 'Amount', 0, 1, 0.5, 0.01), R('dirty', 'Dirt in creases', 0, 1, 0.5, 0.01), Object.assign(SEL('dye', 'Dye', ['Auto']), { when: () => false }), Object.assign(C('custom', 'unused', '#ffffff'), { when: () => false })],
    run: run(`
      vec3 tc=p_tint.rgb/max(luma(p_tint.rgb),0.2); vec3 col=mix(c, c*tc*0.95, p_amount*p_t);
      col=mix(col, col*tc*0.6, p_dirty*p_t*smoothstep(0.55,0.15,fold));
    `) });

  def('Denim washes', { id: 'dyn_vintage', name: 'Antique / Vintage', help: 'Uneven (crosshatch) yarns, soft overall fade and a little tint — the catch-all retro look',
    params: [T_(0.7), DYE(), R('fade', 'Fade', 0, 1, 0.45, 0.01), R('hatch', 'Crosshatch (uneven yarn)', 0, 1, 0.6, 0.01), R('tintAmt', 'Tint', 0, 1, 0.3, 0.01),
      C('tint', 'Tint colour', '#c9b48e'), WARM(), CUST(), SEED()],
    run: run(`
      float hx=vnoise(vec2(D.x/2.2, p_seed)), hy=vnoise(vec2(p_seed+9.0, D.y/2.6)); float hv=vnoise(vec2(D.x/40.0, D.y/400.0)+p_seed);
      float d=p_fade*p_t*0.7 + p_hatch*p_t*((hx-0.5)*0.35 + (hy-0.5)*0.2 + (hv-0.5)*0.3);
      d=salty(clamp(d,0.0,1.0), D, 0.5);
      vec3 col=dis(c, d, k, p_warm, cust, det, 0.85);
      col=mix(col, col*p_tint.rgb*1.3, p_tintAmt*p_t);
    `) });

  // ================================================================ painted bleach (the Acid tool's live field)
  // The Acid tool (graffiti.js) simulates the liquid on the CPU and stores it in e.fieldId (R = dye removed,
  // G = still wet). This effect only draws it, so it is exact at any export scale.
  FX.def({ id: 'dyn_bleachpaint', name: 'Painted Bleach', family: FAM, cat: 'Bleach & acid', hidden: true, dynamic: { param: 'neutral', seconds: 1.5 },
    help: 'Made by the Acid tool in the Graffiti workspace',
    params: [SEL('chem', 'Chemical', ['Chlorine bleach', 'Permanganate (PP)']), Object.assign(R('neutral', 'Neutralised', 0, 1, 1, 0.01), { help: 'Permanganate: purple / brown until neutralised' }),
      DYE(), R('rim', 'Tide mark', 0, 1, 0.45, 0.01), WARM(), CUST()],
    run: (c, p, e) => {
      const fc = e && e.fieldId && TL.asset.get(e.fieldId);
      if (!fc) return c.src;
      const b1 = c.blur(c.src, 2.5 * c.scale), b2 = c.blur(c.src, 28 * c.scale);
      const ft = G.upload(fc);
      const out = c.pass(LIB + `
void main(){` + HEAD + `
  vec2 uv=P/u_res; vec2 tx=1.5/vec2(textureSize(u_tex4,0)); vec4 f=texture(u_tex4, uv);
  float d=f.r, wet=f.g;
  float g=length(vec2(texture(u_tex4, uv+vec2(tx.x,0.0)).r-texture(u_tex4, uv-vec2(tx.x,0.0)).r, texture(u_tex4, uv+vec2(0.0,tx.y)).r-texture(u_tex4, uv-vec2(0.0,tx.y)).r));
  float rim=smoothstep(0.05,0.25,g)*smoothstep(0.15,0.0,abs(d-0.3))*p_rim;
  float dd=salty(smoothstep(0.04, 0.5, d)*(0.88+0.12*fibN(P, 6.0*u_scale)), D, 0.3);
  vec3 col=dis(c, dd, k, p_warm, cust, det, 0.7);
  col=mix(col, dis(c, 0.22, k, p_warm*1.4, cust, det, 1.0), rim*0.85);
  col*=1.0-0.32*wet;                                                            // wet fabric is darker
  if(p_chem>0.5){ float nn=p_neutral; col=mix(col, vec3(0.42,0.12,0.40)*det, wet*0.75*(1.0-nn)); col=mix(col, vec3(0.36,0.24,0.14)*det, d*(1.0-wet)*0.85*(1.0-nn)); }
` + OUT + '}', { u_tex: c.src, u_tex2: b1, u_tex3: b2, u_tex4: ft });
      G.release(ft);
      return out;
    } });

  // ================================================================ ▶ live develop (view-only animation)
  const running = new Map();
  TL.dyn = {
    running,
    // animate e.p[param] from 0 (or `from`) to its current value; one undo step at the end
    play(e, opts = {}) {
      const d = FX.get(e.type);
      if (!d || !d.dynamic) return;
      const k = d.dynamic.param, to = opts.to != null ? opts.to : (e.p[k] > 0.02 ? e.p[k] : 1), from = opts.from != null ? opts.from : 0;
      const dur = (opts.seconds || d.dynamic.seconds || 2.5) * 1000 / Math.max(0.1, (TL.st.graffiti && TL.st.graffiti.speed) || 1);
      TL.dyn.stop(e, true);
      const t0 = performance.now();
      const job = { e, raf: 0, to };
      const tick = () => {
        const u = Math.min(1, (performance.now() - t0) / dur);
        e.p[k] = from + (to - from) * u;
        TL.touch();
        if (u < 1) job.raf = requestAnimationFrame(tick);
        else { running.delete(e.id); TL.commit('Develop ' + d.name); if (TL.ui && TL.ui.buildInspector) TL.ui.buildInspector(); if (opts.done) opts.done(); }
      };
      running.set(e.id, job);
      job.raf = requestAnimationFrame(tick);
    },
    // stop now; `jump` = keep the final value (no half-developed state left behind)
    stop(e, jump) {
      const job = running.get(e.id);
      if (!job) return;
      cancelAnimationFrame(job.raf);
      running.delete(e.id);
      if (jump) { e.p[FX.get(e.type).dynamic.param] = job.to; TL.touch(); }
    },
    stopAll() { for (const job of Array.from(running.values())) TL.dyn.stop(job.e, true); },
    playButton(e) {
      const U = TL.util;
      const b = U.h('button', { class: 'ib dynplay', title: 'Play: develop this effect live (the result is the same as the slider value)' }, running.has(e.id) ? '❚❚' : '▶');
      b.onclick = (ev) => { ev.stopPropagation(); if (running.has(e.id)) TL.dyn.stop(e, true); else TL.dyn.play(e); b.textContent = running.has(e.id) ? '❚❚' : '▶'; };
      return b;
    },
  };
})(window.TL);
