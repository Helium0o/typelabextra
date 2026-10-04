# Handover: new "Graffiti" workspace for TypeLab (acid, spray can, live effects)

**From:** a planning session (2026-10-04) · **For:** the session that builds TypeLab · **Status:** nothing coded yet. This is the spec, the research and a code map.

> The planning session only had **about half of the TypeLab files** (a zip of `app/`, `electron/`, `tools/exe-tests/`,
> `ROADMAP.md`, `package.json`). You have the full repo. Line numbers below are from that snapshot, so re-check them
> before you edit. If a file named here has changed, trust the code over this note.

---

## ★ Update, round 2 (2026-10-04): working code is ready, start with `graffiti-kit/`

- **The user answered:** question 1 (tab after Paint, Export moves to key 7) is OK, and question 2 (denim first) is OK.
  They sent **reference photos** (`graffiti-kit/reference/ref1..5`):
  1. black jeans with bleach splatter
  2. dark indigo crumple bleach with peach cores
  3. 80s acid-wash jacket
  4. light feather-marble wash
  5. a wash glossary chart: Acid, Antique, Crosshatch, Dirty, Hand Sanding, Rinse, Sandblast, Sandwash, Stonewash,
     Tinted, Vintage, Whisker
- **Built and tested** (headless Chromium against the snapshot, not yet in the exe): `graffiti-kit/`
  - Graffiti workspace, Spray can with live drips, and Acid / bleach tool with live spreading and permanganate stages.
  - The "Dynamic" effect family (12 washes with ▶), 5 denim surfaces, and 10 looks matched to the photos.
  - An installer with anchored edits (`graffiti-kit/install/apply.mjs`) and an exe-compatible test (`m28_graffiti.js`).
- **This covers M28a, M28b and M28c** from section 7, plus the denim part of M28e (looks / presets).
- **Still open:** M28d (whiskers, honeycombs, rips with weft bridges), "Piece from text", a run inside the exe and an exe
  rebuild. The open questions left are 3 (raster vs editable strokes: built as raster + stored strokes + exact Replay),
  5 (mockups) and 6 (pen tablet: pressure is read, tilt is not).
- **Start here:** `graffiti-kit/README.md` → install (§1) → checklist (§2).

---

## 0. TL;DR

1. Add a **7th workspace tab, "Graffiti"**, for spray-can painting and acid / bleach / stone-wash effects on denim.
2. The effects must be **dynamic**: they keep reacting after you paint. Bleach spreads through the weave, paint drips
   run down, permanganate goes from purple to brown to bleached. They also react to what's underneath: the twill,
   folds, seams, the dye type and the layer's shape.
3. Add a new **"Dynamic" effect category** (a `dynamic` flag on the effect definition, a ▶ play button and a *Develop*
   time slider), so the same live effects also work from the FX & Filters workspace.
4. **Rule:** "live" applies to the screen only. Every result must be **reproducible from saved data** (strokes + seed + time),
   so undo, autosave, export at any scale and the export preview match what the user saw. ROADMAP still says
   *OUT: video, animation*. Don't add video export. Animation happens only while the user is watching.
5. Suggested milestones: **M28a–M28e** (section 7). Commit at the end of each one and tick it in `ROADMAP.md`, the same way
   M0–M27 were done.

---

## 1. What the user asked for (verbatim)

> Graffiti - acid and spray can effects, must be dynamic, if needed add another category for dynamic effects,
> live-ish type of effects where they will be reactive
>
> research how acid reacts to denim (acid, stone wash, other types of effects)

How to read it:
- "**another tab**" means a new workspace in the top bar, next to Type · Pattern · Dither · FX · Paint · Export.
- "**dynamic / live-ish / reactive**" means the effect changes over a short time and responds to input and surface (section 5).
  It does *not* mean exporting video.
- "**acid**" covers the whole denim chemical-wash family: acid / moon wash, bleach, potassium permanganate, snow wash,
  plus the mechanical ones (stone wash) the user named. All of it is in section 3.

---

## 2. TypeLab in 60 seconds (what you need to know before touching it)

- Electron desktop app (`package.json` v2.3.0, `npm start`, `npm run dist` builds the Windows NSIS + portable exe).
  Plain JS with no bundler: every file is an IIFE that hangs off the global `window.TL`, loaded in order by
  `app/index.html`. **A new file must be added to the `<script>` list in `app/index.html`** in the right order
  (after its dependencies, before `main.js`).
- WebGL2 is required (`TL.gl`, `app/js/gl.js`). Effects are GLSL fragment shaders run through `FX.apply`.
- The document is `TL.doc` (layers, `finish` = whole-image effect + dither stack). UI state is `TL.st`. `TL.commit(label)` = undo
  step. `TL.touch()` = live update without an undo step. `TL.emit('layers'|'effects'|…)` → UI refresh.
- Rasters live in an asset store: `TL.asset.blank(w,h[,fill])`, `.get(id)`, `.add(canvas)`, `.cow(id)` (copy-on-write
  before painting). Old rasters in history get frozen to WebP; `T.notReady()` guards painting.
- The ROADMAP says "resume point: find the first unchecked box". Last done: **M27** (patterngen handoff). This work is
  **M28**.
- Testing is done **inside the real exe** over Chrome DevTools Protocol: `tools/exe-tests/README.md`, `cdp.mjs`,
  suites like `fxaudit.js` (every effect min/mid/max), `uistress.js`, `roundtrip.js`, `cmds.js`. Add `m28_*.js` suites the same way.

### 2.1 Code map: exactly where things plug in

| What | Where (snapshot) | Notes |
|---|---|---|
| Workspace list + order | `app/js/ui/shell.js:14` `UI.modeOrder = ['type','pattern','dither','fx','paint','export']` | Add `'graffiti'`. Keys 1–7 come from the regex at `shell.js:481` (`/^[1-7]$/`). Right now key 7 falls back to FX (old "filters" alias, `ALIAS` at `shell.js:15`). Once there are 7 tabs, 7 opens the 7th tab. Keep the `ALIAS` for old saved `localStorage` values. |
| Tab tooltip text | `shell.js:47` `MODE_HINT` | Add `graffiti: 'spray paint, acid / bleach / stone wash on denim, live effects'`. |
| Registering a workspace | `UI.registerMode({ id, label, icon, tools:[…], build(box){…} })`; example `app/js/ui/mode-paint.js:91` | `build` fills the inspector. Use `UI.section`, `UI.slider`, `UI.select`, `UI.seg`, `UI.color`, `UI.pickerRow`, `UI.btn`, `UI.note` from `ui/kit.js`. |
| Tab icon | `app/js/ui/kit.js:47` (icon table, e.g. `mPaint`) | 20×20 stroke SVG paths. Add `mGraffiti` (spray can) and tool icons (`spray`, `acid`, `stone`, …). |
| Tools (rail + shortcut keys) | `app/js/tools.js:9` `T.list` | Taken keys: v t a p b e f m u l h z. Free: **g** (spray can), **j** / **q** / **w** / **c** etc. `T.set` (`tools.js:34`) jumps to the workspace that owns a tool. |
| Brush engine | `tools.js:127` `brushTarget`, `:169` `strokeStart`, `:206` `stamp`, `:211` `strokeTo`, `flush/flushNow` | Dab-stamping on a buffer canvas, symmetry (`T.symPoints`), texture-brush via `CanvasPattern`. **No pen pressure is read anywhere** (`grep pressure` = 0). Add `e.pressure` from PointerEvents yourself. |
| Per-tool brush settings | `app/js/state.js:104` `st.brushes = { brush, fxbrush, … }` | Each tool keeps its own settings and they're saved in projects/autosave (M22). Add `spray`, `acid`, `stone` entries. |
| Effect definition API | `app/js/effects.js:7–25` | `FX.def({ id, name, cat, params:[R/PX/SEL/B/C/SEED], frag \| run, help, hidden, family, sdf, prepare })`. `PX` params are in document px and get multiplied by render scale. |
| Effect runner | `effects.js:556` `FX.apply` | `run(ctx, p, e)` gets `ctx.pass(glsl, inputs, uniforms)`, `ctx.blur`, `ctx.seeds` (jump-flood SDF), `ctx.peakAlpha`, `ctx.cpu(tex, fn)`. Handles mix + painted masks (`e.maskId`) for you. |
| GLSL helpers | `gl.js:21–45` | `T(P)` sample, `T0/T2/T3`, `unp` (unpremultiply), `pm`, `luma`, `hash12`, `hash22`, `vnoise`, `fbm`, `rot2`, `over`, `rgb2hsv`, `sdist`, … Output `o` is **premultiplied** (see `cr_crossstitch`, `filters-craft.js`: `o=vec4(col*A,A)`). |
| Filter families (gallery tabs) | `filters-craft.js:4–6` (`FAM='Craft Lab'`, `def(cat, d)`) | Copy this pattern for a new family file, e.g. `app/js/effects-dynamic.js` with `family: 'Dynamic'`. |
| FX & Filters gallery | `app/js/ui/mode-fx.js` | Effect cards (`effectCard`), "Paint area" (FX brush masks). Gallery tabs are a **hard-coded list**: `FAMILIES` + `BLURB` at `mode-fx.js:79–88`. Add `'Dynamic'` there. Add the ▶ play control on cards whose definition has `dynamic`. |
| Float-texture simulation precedent | `app/js/texturelib-gpu.js:~234` (`reaction-diffusion`), `:386` `RGBA32F`, `:396` `EXT_color_buffer_float` check | Gray–Scott ping-pong on float textures already works in this app. Reuse the approach for drips and wicking. `G.tex()` itself is RGBA8 (`gl.js:157`). |
| Layer types + factories | `state.js:148` `TL.make` | **`TL.migrate` drops unknown layer types** (`state.js:222`, `tmpl` map at `:235`). A new `graffiti` layer type must be added there too or it disappears on reopen. |
| Rendering a layer | `app/js/render.js:51` (paint branch), `:80` `R.layer` (cache) | Add a branch for the new layer type. The render cache key must include strokes, sim params and time. |
| Ctrl+K command palette | `shell.js:400` `UI.palette`, `UI.addCommands(fn)` | Effects get "Add effect/filter" entries automatically. Add commands for the new tools and presets. |
| Existing related effects (**reuse / don't duplicate**) | `effects.js:195` **Melt / Drip** · `filters-craft.js:66` **Denim** (`cr_denim`) · `filters-craft.js:125` **Stencil Spray** (overspray + drips) · `filters-gallery.js:177/181` **Spatter**, **Sprayed Strokes** · `vendor/texturelib.js:1104` **denim weave** (3/1 Z twill, slubs, indigo warp, ecru weft, wash) + presets `raw-denim`, `stonewash-denim` (`:6101`) | The texturelib denim generator is the natural **surface** for the acid tools. Get it through the Pattern workspace or a texture filter instead of writing a new weave. |

---

## 3. Research: how acid and other washes react with denim

### 3.1 Why denim reacts the way it does (the model you are simulating)

1. **Weave.** Denim is a **3/1 right-hand (Z) twill** and warp-faced. The face is about 75% warp yarn, the back is mostly weft.
   The diagonal twill line rises to the right. Every effect should show this grain.
2. **Warp = indigo, weft = undyed (white / ecru).** As the blue warp wears or bleaches, the white weft shows through more.
3. **Ring dyeing.** Indigo sits in a **thin outer shell of each warp yarn and the core stays white**. Indigo is
   physically trapped, not chemically bonded, so abrasion removes it. Wear doesn't make the blue smoothly paler. It
   **exposes white core yarn by yarn**, which gives the "salt and pepper" speckle at the scale of single yarns.
4. **Ring-spun slubs.** Uneven yarn (thick / thin spots) makes **vertical streaks** in fades. texturelib already has
   `slub` and `irregularity` for this.
5. **Raised areas fade first.** Anything mechanical (stones, sanding, wear) hits high points: seams, hems, folds,
   pocket edges, creases, and the top of each twill rib. A **height map** (folds + seams + twill) drives abrasion.
6. **Liquids wick along yarns.** Bleach or permanganate on cotton spreads by capillary action, faster **along** the yarns
   (warp/weft directions) than diagonally. Spots get slightly squared-off, fibrous edges, and dye pushed to the front
   leaves a **tide mark** (a rim). The longer liquid sits, the bigger the mark.
7. **The dye decides the colour you get.** Bleaching does not always go "towards white" (table 3.3).

### 3.2 Treatment catalogue (what each looks like and how to model it)

| Treatment | What really happens | Visual signature | How to model (GPU) | "Dynamic" part |
|---|---|---|---|---|
| **Acid wash / moon wash / marble wash** (1980s) | Pumice stones pre-soaked in **potassium permanganate (KMnO₄, ~3–6%)**, sometimes + phosphoric acid, **tumbled dry** with the garment. Where a soaked stone touches the crumpled fabric it bleaches hard. Brown **manganese dioxide** is then neutralised (e.g. sodium metabisulfite / peroxide) and rinsed. | **High-contrast, sharp-edged, marbled veins** of white/pale blue on darker blue. Strongest on random crumple ridges. Non-uniform. | Random **crumple height field** (ridged fbm, folded noise, a few large folds). Bleach where ridge height > threshold that drops over *time*. Sharp edge plus a little feather. Twill + ring-dye speckle inside the bleached zone. | *Develop* grows the veins. Optional "unrinsed" stage: veins are brown/purple before **Neutralise**. |
| **Snow wash** | KMnO₄ poured onto **dry** pumice or rubber balls, tumbled. Reddish-purple stage, then frost after rinses. | Frosty, **many small snowflake-like speckles**, more even spread than acid wash. | Poisson-distributed small impacts × crumple ridges, small radius, high count. | Speckles appear over time. Purple → brown → white stages. |
| **Stone wash** | Pumice tumbled **wet**: mechanical abrasion. | Overall softer fade, **salt-and-pepper**, stronger on seams, hems, folds. "Roping" (alternating light/dark twist marks) along hems. | Abrasion = height map (seams/folds/twill rib tops) × stone-impact noise × time. Remove indigo **per yarn** (threshold on a per-yarn random value, so whole yarns go white). | Longer tumble = lighter. Seams light up first. |
| **Enzyme wash** (cellulase) | Enzyme eats surface cellulose fibre, so indigo goes with it. Gentler than stones. | Smoother, **lower-contrast** fade than stone wash, softer hand. **Backstaining**: loosened indigo redeposits on white weft/pockets, which turn bluish. | Low-frequency uniform fade + small speckle + **blue tint added to light/white areas** (backstain). | Fade over time. Backstain amount rises then "clean-up" lowers it. |
| **Bleach wash** (sodium hypochlorite, chlorine) | Chemical oxidation of the dye, all over. Strength and time decide the level. Not neutralised → **yellowing**. | Light → mid → "super bleach" uniformly paler, slight greenish/yellow cast when overdone. **Black denim goes brown/orange**. | Global colour ramp (3.3) driven by `strength × time`, + yellowing if `neutralise` off. | Progressive lightening while it "sits". |
| **Bleach splatter / spray / pour** (DIY look) | Drops of bleach on the fabric. They wick, spread while wet, then stop when rinsed/dry. | Round-ish spots with **fibrous, slightly grain-aligned edges**, paler centre, **tide-mark rim** (on black denim the rim is orange/rust). Satellite droplets + streaks in the throw direction. | Per-drop **anisotropic front growth**: a distance field with a metric stretched along warp/weft + noise, so radius grows ~√t. Rim = band at the current front. Splatter generator: main drop + satellites along a throw vector. | **The main live effect.** Spots keep growing for N seconds after you click, then settle. |
| **PP spray / PP rub** (potassium permanganate, local) | KMnO₄ sprayed with a gun (or rubbed with a sponge) on chosen zones (thighs, seat, knees) to brighten them. Purple on contact → brown MnO₂ → **neutralised** → light. | Soft gradient highlights on high points, often with whiskers. | Spray-can kernel (section 4) as a **lightening** mask instead of paint, × height map. | Colour stages: **wet purple → brown → (Neutralise) → bleached**. |
| **Ozone wash** | Ozone gas fades indigo. No water. Also removes backstaining. | Even, slightly grey/"vintage" cast, clean whites. | Global fade + desaturate slightly + cancel backstain. | Fade over time. |
| **Laser** | Laser burns the indigo layer away with pixel precision. Used for whiskers, prints, **text and images**. | Exact grayscale image as fade depth. At low res you can see a dotty raster. | Take any layer (text!) as a fade map. Optional dot/raster screen. **TypeLab is a type tool, so "laser your text onto denim" fits well.** | Optional "burn-in" reveal over time. |
| **Whiskers / honeycombs / stacks** | Sanding, laser or resin-set creases that mimic wear. Whiskers fan across the front thigh/crotch, honeycombs sit behind the knee, stacks are horizontal hem creases. | Pale, tapered crease bands. Sharpness varies. Grain shows inside. | User draws a curve → tapered lightening band (SDF to the stroke) with twill + yarn speckle. Honeycomb = Voronoi-ish crease cells. | Wear grows with time. |
| **Distress: grind / rips** | Grinding frays edges. Rips cut the warp, and the **white weft threads stay bridging the hole horizontally**. | Fringe at edges, white horizontal threads over the hole (very recognisable). | Hole mask → inside it draw weft threads (horizontal lines with jitter, slight sag), frayed blue warp tips at the hole edge. | Fray grows with time (optional). |
| **Tint / overdye after wash** | Wash first, then a light dye bath (sand, grey, "dirty"). | Whole garment shifted (warmer, greyer). Whites are no longer white. | Final multiply/colour tint. | — |
| **Bleach tie-dye / crumple (shibori)** | Fabric twisted, bunched or bound, then bleach applied. Bleach reaches only the exposed folds. | Spirals, radial bursts, crystal/crackle patterns. | Fold/twist mapping of a crumple field (spiral warp) → ridge threshold. | Develops over time. |

### 3.3 Colour reaction by base dye (starting values, tune against photos)

Bleaching does **not** always go to white. What you get depends on the dye:

| Base fabric | Fade / bleach progression (dark → light) | Notes |
|---|---|---|
| **Indigo (classic blue jeans)** | `#16264a` raw → `#1f3561` dark → `#3a5a8c` stonewash → `#6f8db5` light → `#a9bfd8` bleach → `#cfdbe7` super bleach → `#e8e6dc` exposed white core / ecru weft | First two and the stonewash value come from texturelib presets (`raw-denim`, default `indigo`, `stonewash-denim`). Overdone chlorine bleach without neutralising adds a **yellow cast** (mix toward `#e9e2c4`). |
| **Black, sulfur-dyed** (almost all black denim) | `#1b1b1d` → charcoal `#3a3a3e` (abrasion only) | Fades to **grey** with abrasion. |
| **Black + chlorine bleach** | `#1b1b1d` → brown `#5a3a28` → rust/orange `#a0522d` → pale tan `#d2b48c` | "Black" is really several dyes. Bleach removes the blue part first and leaves red/yellow, so it goes **orange/brown**. The exact shade varies by maker, so expose a "dye mix" or hue slider. Spot **rims are more orange**. |
| **Sulfur-bottom indigo** (black under blue) | Fades to **greyish blue** instead of sky blue. Bleach gives a grey/brown-tinged result. | Mix the indigo ramp toward grey as it lightens. |
| **Sulfur-top indigo** (black over blue) | Starts almost black-blue, fades to a greenish/grey blue. | — |
| **Grey / coloured / overdyed** | Varies. Usually the overdye leaves first. | Let the user pick 2–3 dye layers that come off in order. |
| **Potassium permanganate stages** (any base) | Liquid purple `#7b2d8e` → MnO₂ brown `#6b4423` → (neutralise) bleached result of the base ramp | A real-world "live" sequence. Show it in the stages. |

Store these as **named colour ramps** in one table (e.g. `DENIM_DYES` in the new file) so presets and tools share them.
Look at the existing `palettes.js` / "colour ramps" (M24) and reuse the format if it fits.

### 3.4 Sources used
- Acid wash = pumice + KMnO₄ (3–6%), sharp blue/white contrast, MnO₂ removal: [Coats – Denim Wash](https://www.coats.com/en-us/information-hub/denim-wash), [Textile Blog – Acid washing process](https://www.textileblog.com/acid-washing-process-of-denim-jeans/), [Academia – Acid wash with damp pumice](https://www.academia.edu/69606249/Technology_of_Acid_Wash_on_Woven_Denim_Apparel_with_Damp_Pumice_Stone), [TEG – Guide to denim washes](https://tegmade.com/resources/a-guide-to-denim-washes-and-techniques/)
- Wash types (stone, enzyme, snow, PP spray, ozone, laser, whiskers): [Jing Sourcing – 10 denim wash types](https://jingsourcing.com/b-denim-washing-types/), [denimmanufacturer.net – Stone, Enzyme, Laser & Ozone](https://denimmanufacturer.net/denim-washing-techniques/), [Cottonworks – Denim finishing](https://cottonworks.com/learning-hub/denim/denim-finishing/), [ResearchGate – Washing techniques for denim jeans](https://www.researchgate.net/publication/282933807_Washing_techniques_for_denim_jeans), [ResearchGate – PP spray / rub / bleach spray figure](https://www.researchgate.net/figure/Different-Types-of-Washed-Denim-Fabric-Potassium-Permanganate-Spray-Rub-Bleach-Spray_fig1_303205771)
- Ring dyeing, white core, warp/weft, salt-and-pepper: [Heddels – Ring dyeing](https://www.heddels.com/dictionary/ring-dyeing/), [Denimhunters – Why denim fades](https://denimhunters.com/denim-wiki/denim-explained/why-denim-fades/), [Fitted Underground – Science of fading](https://fittedunderground.com/blogs/denim-university/how-does-raw-denim-fade)
- Black denim + bleach → orange/brown: [Wikipedia – Sulfur dye](https://en.wikipedia.org/wiki/Sulfur_dye), [Paula Burch – bleaching black producing orange](http://www.pburch.net/dyeing/blog/2017/02/16/bleaching-a-black-t-shirt-is-producing-orange-how-can-i-get-white/), [BLAKC – colour-fast denim](https://blakc.co.in/blogs/news/colour-fast-denim-science)
- Spots grow the longer bleach sits, halo marks on denim: [A Beautiful Mess – bleach-spotted fabric](https://abeautifulmess.com/2015/03/try-this-bleach-spotted-fabric.html), [The Stain Library – denim](https://thestainlibrary.com/surfaces/denim/)

Hex values and the "√t front growth" / "anisotropic wicking" modelling are this session's engineering choices. They are
**not** measured, so tune them against reference photos and ask the user for theirs.

---

## 4. Research: how a spray can behaves (for the Spray can tool)

| Real behaviour | What to simulate |
|---|---|
| Spray is a **cone of droplets**. Density is highest in the centre and falls off toward the edge. | Per dab, scatter N droplets with a Gaussian-ish radius distribution. **Draw dots, not a soft-brush blob.** Grain is the whole look. |
| **Distance:** further = wider, softer, grainier, less paint per area. Closer = thin, sharp, heavy, and drips. (Writers hold ~15–30 cm.) | `distance` param: spot radius ∝ distance, paint per area ∝ 1/distance², droplet spread ↑. Alt+wheel or pen tilt could change distance live. |
| **Caps:** *skinny* (thin line), *fat* (wide), *soft* (fuzzy edge), *flare / calligraphy* (elliptical, directional), *outline* caps. | Cap = kernel preset {radius, falloff, aspect, angle, droplet size range}. Don't use real cap brand names in the UI (generic names: Skinny, Fat, Soft, Flare, Calligraphy). |
| **Speed:** slow = dense, fast = light/misty. **Dwell** (holding still) builds up paint. | Paint added ∝ dt, not ∝ distance moved. Keep the stroke timestamps. The current brush stamps by spacing only (`strokeTo`), so the spray tool needs its own **time-based** emitter (rAF loop while the button is held). |
| **Overspray:** a thin halo of sparse dots around every line. | Second, wider, very sparse droplet ring. Slider "Overspray". |
| **Spits / sputter:** a low or cold can, or a half-pressed cap, throws irregular big blobs. | Random large droplets, probability ↑ with "Can pressure ↓" / "Spit" slider. |
| **Drips:** where wet paint is too thick (close + slow), it runs down, thins, wobbles and ends in a **bulb**. It stops when the paint dries. Absorbent surfaces (fabric) give short drips, glossy walls give long ones. | Track a **wet-paint thickness** field. Where it passes a threshold, spawn a drip particle that moves down (gravity, optional angle), speed ∝ excess paint, deposits a trail, loses mass, ends in a bulb, slight sideways noise. Drying time per surface. **Drips keep running after the mouse is released. That's the live part.** |
| **Opacity builds up:** one thin pass is see-through, more passes cover. Wet-on-wet layers mix a little at the edges. | Accumulate coverage, not alpha replace. |
| **Surface shows through:** brick/concrete tooth breaks the grain. On fabric, paint catches on the twill ribs and soaks in. | Multiply droplet acceptance by surface height (the layer below or a denim/brick pattern): ribs catch, valleys stay lighter on thin coats. |
| **Stencils:** overspray creeps under the edge. | Reuse selections / a layer as a stencil mask with a soft under-spray band. The existing *Stencil Spray* filter has overspray maths to borrow. |
| **Graffiti piece anatomy:** fill (often a fade) → outline → 3D / shadow block → highlights / "shines" → background / cloud. Styles: tag, throw-up (bubble letters), piece, wildstyle. | A one-click **"Piece from text"** panel: takes the selected text layer and builds fill fade + outline + 3D block + shines + drips as an editable effect stack. Fits TypeLab's type focus. Check which existing effects (stroke, long shadow / extrude, glow) can be reused first. |

Spray-paint sources: [Wikipedia – Spray paint](https://en.wikipedia.org/wiki/Spray_paint), [Wikipedia – Overspray](https://en.wikipedia.org/wiki/Overspray),
[Graffstorm – can control](https://graffstorm.com/can-control), [Union Heights – spray caps guide](https://unionheights.com.au/blog/mastering-spray-paint-caps-a-comprehensive-guide-/),
[aescripts Sprayon](https://aescripts.com/sprayon/) (a commercial procedural spray plugin with droplet grain, overspray mist,
sputter flecks and procedural drips: a good feature checklist).

---

## 5. What "dynamic / reactive" means here (design rules)

The user wants **live-ish** effects. Three kinds of reactivity, all required:

1. **Reacts to input:** stroke speed, dwell time, distance, pen pressure (add `PointerEvent.pressure`), throw direction for splatter.
2. **Reacts to time:** it keeps going after you let go. Drips run, bleach spots spread and develop rims, permanganate goes
   purple → brown, acid veins grow. Then it **settles** (a few seconds, configurable) or the user hits **Freeze / Neutralise**.
3. **Reacts to the surface:** the layer(s) underneath. Twill direction steers wicking. A height map (folds, seams, rib tops)
   steers abrasion and acid. Dye type picks the colour ramp. Alpha/shape limits where it lands (acid only on fabric, paint
   only on the wall layer if "Clip to layer below" is on).

**Hard rules (or exports, undo and autosave break):**
- **Deterministic.** Result = f(saved strokes, params, seed, `time`). No `Math.random()` at render time: seed everything
  (`hash12`, `SEED()` param).
- **Time is a saved parameter** (`develop`/`t`, seconds of simulated time, clamped). "Live" just means the view animates
  `t` from 0 to its target in real time. Export renders at the final `t`.
- **Resolution-independent.** Simulate in **document space** (like the dither engine, "grid = doc size / pixel size",
  ROADMAP Design), never in screen pixels. Diffusion/drip step sizes are in doc px. For large docs run the sim on a coarser
  doc-space grid and upsample. Preview and export must match (check in `export-preview.js`).
- **Cached.** Simulations are expensive: cache the sim result by (input hash, params, t) the same way `R.cache` caches
  layers. While dragging sliders use the existing fast paths (`TL.view.drawing`, `FX.liveAsync()`).
- **Animation stops.** The rAF loop only runs while something is still developing. Idle = 0 CPU/GPU. No video export (ROADMAP OUT list).
- **Undo:** one `TL.commit` per finished stroke, not per animation frame (use `TL.touch()` while animating).

### 5.1 The "Dynamic" effect category (the user's "another category")

Add a flag on effect definitions, for example:

```js
FX.def({ id: 'dyn_acidwash', name: 'Acid Wash', family: 'Dynamic', cat: 'Denim washes',
  dynamic: { param: 't', seconds: 3 },          // ▶ animates p.t from 0 to its value over ~3 s
  params: [ R('t', 'Develop', 0, 1, 0.6, 0.01), SEL('dye', 'Dye', ['indigo','black (sulfur)','sulfur bottom','sulfur top']), … , SEED() ],
  run: (c, p, e) => { … } });
```

- New file `app/js/effects-dynamic.js` (family `'Dynamic'`, like `filters-craft.js`). To get its own gallery tab, add `'Dynamic'` to `FAMILIES` and a line to `BLURB` in `mode-fx.js:79–88` (the tabs are a hard-coded list).
- In `mode-fx.js` `effectCard`: if `d.dynamic`, add a ▶/❚❚ button and a "Replay" button next to the name that animate `e.p[d.dynamic.param]`.
- Inside the Graffiti workspace these same effects are the "wash" presets, so it's one implementation with two entry points.

**v1 effects for the category** (closed-form shaders: no simulation needed, `t` just moves thresholds and fronts):
Acid Wash · Snow Wash · Stone Wash · Enzyme Wash (+ backstain) · Bleach Wash · Ozone Fade · Bleach Splatter (seeded spots,
growing fronts + tide rims) · PP Spray zones · Crumple / Spiral Bleach · Laser Fade (uses a layer as the image) ·
Wet Drips (on any layer's shape, extends the existing Melt / Drip with `t`).

**v2 (true simulation, float ping-pong like `texturelib-gpu.js` reaction-diffusion):** wicking that follows the actual
weave texture, and paint drips that collide/merge. Use these only where the closed-form look isn't good enough.

---

## 6. Graffiti workspace spec (UI)

**Tab:** "Graffiti", icon `mGraffiti`. Position: see open question 1.

**Tool rail:** `spray` (Spray can, **G**) · `acid` (Acid / bleach bottle) · `stone` (Stone / wear brush: abrasion, whiskers) ·
`rect` `ellipse` `lasso` (stencil selections) · `move` · `hand` · `zoom`. The existing `brush`/`eraser` can stay in Paint.

**Inspector sections** (follow the Simple-interface rules from M25/M26: quick picks first, max two levels of disclosure):

1. **Surface:** "Paint on: new graffiti layer / selected layer". Buttons **Make denim** (adds a pattern layer from
   texturelib `denim` with a colourway: Raw indigo, Mid, Stonewash, Black, Grey, Ecru, White), **Make wall** (brick /
   concrete if a generator exists). "Clip to layer below". "Dye" dropdown (table 3.3).
2. **Spray can** (when `spray` is active): Cap (Skinny, Fat, Soft, Flare, Calligraphy, Outline) · Colour + recent
   colours · Distance · Pressure · Overspray · Spit · **Drips** (on/off, threshold, max length, dry time) · Symmetry (reuse
   `st.sym`).
3. **Acid / bleach** (when `acid` is active): Chemical (Chlorine bleach / Permanganate (PP) / Acid stones / Snow / Enzyme /
   Ozone) · Apply as (Spray / Splatter / Drops / Pour / Brush / Tumble whole layer) · Strength · Spread time · Wicking
   along weave · Tide-mark rim · **Neutralise** button (ends the reaction: PP brown → bleached, stops bleach) · live
   colour-ramp preview strip.
4. **Wear** (when `stone` is active): Abrasion · Whiskers (draw curves) · Honeycombs · Seam roping · Grind edges · Rips (with weft bridges).
5. **Live:** ▶ / ❚❚, Speed, Settle now, Replay from strokes, Seed. A small "developing…" indicator while it runs.
6. **Presets:** 80s Acid Wash · Moon Wash · Snow Wash · Light / Mid / Heavy Stone Wash · Enzyme Vintage · Bleach-Splatter
   Black Jeans (orange rims) · PP Thigh Fades + Whiskers · Laser Text on Denim · Throw-up · Wildstyle + drips · Stencil.
   Presets set params only. They keep the user's colours and layers (same as the Logo Camo preset picker, M17).
7. **Piece from text:** visible when a text layer is selected (section 4, last row).

**Data model** (suggestion): new layer type `graffiti`:

```js
{ type: 'graffiti', name, strokes: [ { tool: 'spray'|'acid'|'stone', pts: [[x, y, tMs, pressure], …],
    color, cap, distance, chem, strength, seed, … } ],
  surface: { dye: 'indigo', layerId: null }, t: 1, settle: 3, bakedId: null /* optional raster cache */ }
```

Strokes as data keep it **editable, resolution-independent and re-simulatable**. Remember: `TL.make.graffiti`,
`TL.migrate` (`tmpl`), `render.js` branch, SVG export (raster fallback is fine), history size (strokes can be large, so
consider compressing point arrays), autosave, Layers panel row/icon.

The **simpler fallback** if time is short: spray straight into a `paint` layer canvas (like the texture brush) and keep
"dynamic" only in the effects (5.1). It's less editable but much less work. Ask the user (open question 3).

---

## 7. Milestone plan (add to `ROADMAP.md` as M28a–e)

| # | Scope | Done when |
|---|---|---|
| **M28a** | Workspace shell: tab, icon, hint, key 7, Ctrl+K entries, empty sections, tool stubs. **Spray can v1**: time-based droplet emitter, caps, distance, overspray, spit, dwell build-up, pressure. Into a paint layer first. | Tab works, keys 1–7 correct, old saved mode `filters` still opens FX. Spray looks grainy, not airbrush. Drawing stays at 60 fps on 1920×1080. `uistress.js` / `cmds.js` pass. |
| **M28b** | **Dynamic category** + `dynamic` flag + ▶ on effect cards. Denim colour ramps (3.3). Closed-form effects: Acid, Snow, Stone, Enzyme, Bleach, Ozone, PP zones, Laser Fade, Crumple/Spiral. **Make denim** button. | Every effect passes `fxaudit.js` (min/mid/max, all sliders). Export = preview at 1×/2×/4× (export preview). Same seed → same pixels. Visual sheet compared with reference photos (ask the user for theirs). |
| **M28c** | **Live reactions:** bleach splatter/drops with growing anisotropic fronts + tide rims, PP purple→brown→neutralise, **drips** that keep running after release (sim in doc space, float textures with RGBA8 fallback), settle/freeze, caching. `graffiti` layer type with strokes as data (if chosen). | Live animation stops when settled (0% idle). Undo = one step per stroke. Save → reopen → identical. Autosave/crash recovery restores it. `roundtrip.js` extended. |
| **M28d** | **Wear:** whiskers, honeycombs, seam roping, grind, rips with weft bridges. Surface reactivity (height map from folds/seams/twill drives abrasion and acid). | Seams/folds visibly fade first. Rips show white weft threads. |
| **M28e** | Presets, **Piece from text**, Simple/Standard/Compact interface variants, help text, full exe test pass (new `m28_*.js` suites), ROADMAP updated, **rebuild exe**. | Same bar as M16/M27: no console errors, no long tasks on tab open, memory stable in `soak.js`. |

Commit at the end of each milestone (`git log --oneline` is the progress record).

---

## 8. Gotchas (learned from the snapshot)

- **Unknown layer types are dropped by `TL.migrate`**. Register new types there.
- `PX(...)` params are in **document px** and get × scale. Plain `R(...)` do not. Use `PX` for anything that is a size or distance.
- Shaders get **premultiplied** input. `unp()` before colour maths, write premultiplied `o`.
- `FX.apply` scales down anything bigger than `G.maxSize` and back up afterwards. Keep sims in doc space so this stays consistent.
- `G.tex()` is RGBA8. Sims that accumulate need float (`RGBA16F/32F` + `EXT_color_buffer_float`, see `texturelib-gpu.js:386–396`) **with a fallback** (pack into RGBA8 or run on CPU workers like `dither-worker.js`).
- `st.brush` points at the active tool's settings set (`state.js:114`). Add new sets to `st.brushes` so they're saved.
- Single-key shortcuts must not fire from focused sliders (fixed in M9; `U.isTyping`). Keep using `UI.stopKeys` on inputs.
- **No brands/trademarks** in names or presets: no spray-paint brands, cap brands or jean brands. The project already
  avoids recreating trademarks (M6 note about BAPE).
- Tests run in the **packaged exe**, not a browser (M12 removed browser fallbacks). Use a separate test instance (`--user-data-dir`).
- Performance bar the user is used to: 60 fps live view (M13), no long tasks when a tab opens (M22).

---

## 9. Open questions to ask the user first (with defaults if they don't answer)

1. **Tab position.** Default: after Paint, so the order is `Type · Pattern · Dither · FX · Paint · Graffiti · Export`, and
   Export moves from key 6 to key 7. The other option is to append Graffiti last (Export keeps 6).
2. **Surface focus.** Is it mainly **denim** (jeans/jacket mockups) or **walls** too? Default: denim first, wall second.
3. **Editable strokes** (new `graffiti` layer, more work) **or raster** (paint layer, faster to ship)? Default: raster in M28a, layer type in M28c.
4. **Reference photos** of the acid/bleach looks they want (especially black-denim bleach colour and acid-wash vein size).
5. Should Graffiti results also feed the **mockups** (tee / hoodie / jeans; there's no jeans mockup yet, `mockup.js`)? Default: yes, later.
6. Pen tablet in use? (Pressure/tilt support is new code.)
