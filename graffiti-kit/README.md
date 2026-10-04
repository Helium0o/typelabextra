# Graffiti kit for TypeLab (M28): spray can, acid / bleach on denim, live washes

Drop-in code for the TypeLab session. It adds the **Graffiti** workspace (tab 6, between Paint and Export), a
**Spray can** and an **Acid / bleach** tool that keep reacting after you let go, and a new **Dynamic** effect family
(12 denim washes and bleach looks with a ▶ button) that also appears as its own tab in FX & Filters.

**Status:** built and tested in this planning session against the TypeLab snapshot it had (about half of the repo:
`app/`, `electron/`, `tools/exe-tests/`), in headless Chromium with software WebGL. **Not yet run inside the packaged
exe.** That is the first job for the TypeLab session (see "After installing").

Read `../HANDOVER-graffiti.md` for the research (how acid, bleach and stone wash react with denim, how spray paint
behaves) and the original spec. This README covers only the code.

---

## 1. Install (two commands)

```bash
node graffiti-kit/install/apply.mjs /path/to/typelab --dry   # checks every edit, writes nothing
node graffiti-kit/install/apply.mjs /path/to/typelab         # copies 3 files + applies the edits
```

What it does:

| | |
|---|---|
| **New files** | `app/js/effects-dynamic.js`, `app/js/graffiti.js`, `app/js/ui/mode-graffiti.js`, `tools/exe-tests/m28_graffiti.js` |
| `app/index.html` | 3 `<script>` tags (after `filters-texture.js`, after `tools.js`, after `ui/mode-paint.js`) |
| `app/js/tools.js` | Extension hook: `T.ext[tool] = { down, move, up }` for tools that run their own stroke, plus "painter" status (Alt = colour pick, Alt + right-drag = size) for those tools |
| `app/js/view.js` | Brush circle for the new tools |
| every copy of the asset-id pattern `(?:canvasId\|maskId\|imageId\|tileAsset\|motifId)` in `app/js` | adds `fieldId`, so the Acid tool's raster is saved, autosaved, frozen in history and restored. The snapshot has 4 copies (state.js ×2, export.js, autosave.js). The installer sweeps **all** of `app/js` (except `vendor/`) |
| `app/js/ui/mode-fx.js` | `'Dynamic'` gallery family + blurb; ▶ button on effect cards whose definition has `dynamic` |
| `app/js/ui/shell.js` | Tab tooltip + hint-bar text for `spray` / `acid` |
| `app/js/ui/variants.js` (optional) | Start card text "… Paint → Graffiti → Export" |

The installer matches **exact code snippets** (each must occur exactly once, in LF or CRLF files: the repo mixes both).
All of them are checked before anything is written, so if a file has changed since the snapshot, nothing is touched
and the report names the snippet. Re-target it in `install/apply.mjs` (`EDITS` array) and run again. Running it twice
is safe: finished edits show as `already done`.

Workspace order, tools and icons are added at run time by `mode-graffiti.js` / `graffiti.js` (`UI.modeOrder`,
`TL.tools.list`, `UI.I`), so `shell.js` / `kit.js` need no structural edits.

## 2. After installing (TypeLab session checklist)

1. `npm start` → press **6** → Graffiti. Click **Black** under Surface, pick the look *Black jeans · bleach splatter*,
   spray with **G**, splatter bleach with **J**.
2. Exe test (same harness as the other suites): `node cdp.mjs "evalfile:m28_graffiti.js" "saveimgs:m28_"`.
   Without the exe: `node graffiti-kit/tests/run-browser.mjs /path/to/typelab m28_graffiti.js ./out` (Playwright, headless).
3. Run the existing suites that touch shared code: `fxaudit.js` (now includes 12 Dynamic effects + 1 hidden one),
   `roundtrip.js` (its own asset regex at line 43 does not know `fieldId`; add it if it checks every asset),
   `cmds.js` (new Ctrl+K commands), `uistress.js` / `wsstress.js` (new workspace).
4. Add the ROADMAP entry (section 8), commit, rebuild the exe.

## 3. Files and how they work

### `effects-dynamic.js`: the Dynamic family
- Plain `FX.def` effects (`family: 'Dynamic'`), GPU shaders through the normal `FX.apply` path, so masks ("Paint area"),
  Mix, adjustment layers, whole-image scope and exports all work as with any effect.
- Every effect has `dynamic: { param, seconds }` and a time param (`t` = *Develop*, 0..1). The effect is a pure function
  of image + params + seed + t. **Develop = 0 returns the input exactly** (tested), so ▶ starts from the untouched layer.
- `TL.dyn.play(e)` animates the param from 0 to its value in the live view (`TL.touch()` per frame) and commits **one**
  history step at the end. `TL.dyn.stop(e, jump)`, `TL.dyn.stopAll()`, `TL.dyn.playButton(e)`. Undo / redo / save /
  export / workspace change stop running animations (jump to the final value) first.
- Shared GLSL:
  - `discharge(c, d, dye, warm, custom)` is the colour a dyed yarn turns into when a share `d` of its dye is gone.
    Indigo goes to sky blue, then near-white, with **peach** over-bleached cores. Sulfur black goes grey, then off-white,
    or **rust → tan** with *Warm tones*. Grey (sulfur bottom) goes to grey-blue.
  - `dis(...)` is the same but keeps the weave as detail (the local-contrast ratio of the layer).
  - `salty()` breaks the fade up yarn by yarn (ring dyeing: "salt & pepper").
  - `fibN()` gives fibre streaks along the warp.
- **Reactive to the surface:**
  - *Dye: Auto* reads the layer's average colour (blue hue = indigo, dark = black, else grey).
  - "Follow folds" uses brightness relative to a wide blur as height, so on a photo of jeans the folds and highlights
    fade first. On a flat pattern it's neutral.
  - Splatter spots wick further along the yarn (vertical).
- Hidden effect `dyn_bleachpaint` (*Painted Bleach*) draws the Acid tool's field (`e.fieldId`: R = dye removed, G = still
  wet) with tide-mark rims (field gradient), wet-darkening, and the permanganate stages (`chem`, `neutral`).

| id | name | made for | key params |
|---|---|---|---|
| `dyn_splatter` | Bleach Splatter | ref 1 (black jeans) | spots ×3 scales grow √t, cloud bleach, foam lace, fine spray dots, wicking, tide mark |
| `dyn_crumple` | Crumple Bleach | ref 2 (indigo, peach cores) | fold size, stretch along legs, coverage, feathered edges, warm (peach / rust) |
| `dyn_acid` | Acid Wash | ref 3, glossary "Acid Wash" | marble veins, blotches, contrast, stone grain, overall fade |
| `dyn_marble` | Feather Marble Wash | ref 4 | patch size, swirl, feathering (fibres follow the swirl), base wash |
| `dyn_snow` | Snow Wash | research | flake size, density, clustering |
| `dyn_pp` | PP Spray (permanganate) | research | *Stage*: 0–0.3 wet purple, 0.3–0.65 brown MnO₂, 0.65–1 neutralised |
| `dyn_stone` | Stone Wash | glossary "Stonewash", "Sandwash" | fade, salt & pepper, vertical streaks, follow folds |
| `dyn_enzyme` | Enzyme Wash | research | fade, backstain (blue in the light parts), ozone clean-up |
| `dyn_bleachwash` | Bleach Wash | research | strength, evenness, yellowing (not neutralised) |
| `dyn_sand` | Sandblast / Hand Sanding | glossary "Sandblasting", "Hand Sanding" | where: folds & highlights / centre / everywhere |
| `dyn_tint` | Tinted / Dirty Wash | glossary "Tinted", "Dirty Wash" | tint colour, dirt in creases |
| `dyn_vintage` | Antique / Vintage | glossary "Antique", "Crosshatch", "Vintage" | uneven-yarn crosshatch, fade, tint |

Not built yet from the glossary: **Whisker Wash** (needs drawn crease curves) and **New Vintage Tatter** (rips with white
weft bridges). "Rinse wash", "Indigo" and "Twill" are surfaces (the *Raw indigo* / *Black* surfaces), not washes.

### `graffiti.js`: Spray can + Acid tool (live simulations)
- **Spray can** (`SpraySim`, CPU Canvas2D):
  - A time-based droplet emitter at a fixed step (1/120 s): holding still builds paint up.
  - Caps: Skinny / Fat / Soft / Flare (follows the stroke) / Calligraphy (45°) / Outline.
  - Distance: wider, softer and grainier, with paint per area falling ∝ 1/distance².
  - Overspray halo, spits (big irregular blobs), pen pressure.
  - A wet-paint grid (4 px cells, lazy exponential drying). Where it passes the threshold, a **drip** spawns: it runs
    down, thins, wavers slightly and ends in a bulb. Drips keep running after release until dry.
  - Surfaces (Wall / Fabric / Glossy / Paper) change drip length, drying time and droplet bleed.
  - A selection works as a stencil.
- **Acid tool** (`AcidSim`, CPU, on a grid of `doc/1400` cells, min 2 px):
  - Splatter (flung along the motion, satellites, a few big drops), Spray, Pour.
  - The liquid spreads with **porous-medium diffusion** (flux ∝ wetness, so fronts are sharp like real wicking). It is
    faster vertically (along the warp, *Wicking*) and has per-yarn permeability (ragged, grain-aligned edges).
  - It eats dye while wet, then dries.
  - Bleach or Permanganate: permanganate stays purple/brown until **Neutralise** (animated).
  - Writes only the changed area of the field each frame.
- **Deterministic and replayable:**
  - Each stroke is stored as data: `{ tool, seed, color, b: settings, sym, off, pts: [[x, y, ms, pressure]], tEnd }`.
    Spray strokes go on the paint layer (`L.strokes`), acid strokes on the effect (`e.strokes`).
  - Samples are rounded when captured. The live run never simulates past the newest sample, and paint stops at `tEnd`.
  - So **the live result and "Replay" are byte-identical** (tested: diff 0.0000). The stroke buffer is CPU-rasterised
    (`willReadFrequently`) on purpose: GPU canvas anti-aliasing made live and replay differ by a few bytes.
- **History:** one step per stroke (*Spray* / *Bleach*), committed when the stroke has settled. Undo, redo, save,
  export and workspace changes **settle** a running stroke first (`GR.settle()`), so history never holds a half-run stroke.
- API:
  - `TL.graffiti.settle()`, `.busy()`, `.replaySpray(L)`, `.replayAcid(L)`, `.clearAcid(L)`, `.neutralise(L)`
  - `.acidEffect(L, create)`, `.makeSurface(key)`, `.applyLook(id, {layer, play})`, `.LOOKS`, `.CAPS`, `.SURFACES`
- Settings live in `st.brushes.spray` / `st.brushes.acid` (they ride along with projects like the other brushes) and
  `st.graffiti.speed` (live speed).

### `ui/mode-graffiti.js`: the workspace
- **Surface:** Raw indigo / Mid indigo / Stonewashed (texturelib `tx-denim`), Black / Grey (`tx-twill`, 3/1). Placed
  at the bottom of the stack, twill scale tied to document size.
- **Tool settings:** whichever of Spray can / Acid is active, with a tool switch inside.
- **Washes:** buttons for all 12 Dynamic effects (they're added to the selected layer and play live), plus the
  layer's Dynamic effect cards (same cards as FX & Filters, with ▶).
- **Looks:** 10 presets. A look replaces the layer's washes and keeps painted bleach.
- **Live:** speed, Settle now, Replay spray.
- **Ctrl+K:** Spray can, Acid / bleach, Make denim ×5, Look ×10, Settle.
- **Keys:** G = Spray can, J = Acid / bleach, 6 = Graffiti.

| Look | Matches |
|---|---|
| Black jeans · bleach splatter | ref 1 |
| Indigo · crumple bleach, peach cores | ref 2 |
| 80s acid wash | ref 3 |
| Light feather marble wash | ref 4 |
| Snow wash, Stonewash · mid, Enzyme vintage, PP spray (watch it react), Black jeans · rust bleach, Dirty vintage | research / glossary |

## 4. Test results (headless Chromium, SwiftShader WebGL, snapshot repo + kit)

`m28_graffiti.js`:

| Check | Result |
|---|---|
| console errors | 0 |
| tab order | `type pattern dither fx paint graffiti export` (key 6 = Graffiti) |
| Dynamic effects | 12 in the gallery |
| each effect at Develop 0 | identical to the input (diff 0.00) |
| each effect rendered twice | identical (0.00) |
| 1× vs 0.5× render | mean diff 7.5–13.8, against 11.4 for the plain denim. The difference comes from the fine twill, not the effects |
| spray | paints a misty line and drips under the held spot, still live after release, 1 history step, replay 0.0000, settle-then-replay 0.0000 |
| acid (permanganate) | live after release, dries completely (0 wet cells), 1 history step, Neutralise animates 0 → 1, replay 0.0000 |
| ▶ live play | half-way value seen mid-play; ends at the target; nothing left running |
| save → open round trip with the bleach field | identical (0.000); the field is in `TL.asset.docIds()` |
| undo / redo | OK |

Frame time at 1920×1080 (headless, software GL, so slow overall; compare relative numbers only):

| Stroke | Median frame |
|---|---|
| spray stroke | 70 ms |
| TypeLab's existing paint brush (same harness) | 96 ms |
| acid splatter / pour | ~55 ms |

The first acid stroke compiles its shader (one spike, ~0.25–0.6 s on software GL). Expect much faster on a real GPU
in the exe; measure with the existing `framemon.js`.

Images: `reference/result-*.jpg` (effects on indigo and black, looks, spray drips, permanganate before/after
neutralising, the two UI screens) next to the user's references `reference/ref1..5`.

## 5. Known limits / next steps
- **Whiskers, honeycombs, rips with weft bridges, "Piece from text"** (handover §4, §6) are not built yet.
- Spray paints into a paint layer raster (strokes are kept, so it can be replayed). Editing an old stroke's colour or
  cap would need a re-simulation UI on top of `replaySpray`.
- *Painted Bleach* has one `neutral` value per layer. A new permanganate stroke re-opens the purple/brown stage for the
  whole layer until Neutralise is pressed again.
- The acid grid is `doc/1400` (2 px cells on a 1920 document). Very large documents get coarser cells. Edges are
  smoothed in the shader, but a 4K export of a small document stays at the document's grid.
- Live preview uses the app's fast path while things animate (`TL.touch()` → `view.interact`), so detail can drop
  for a moment during ▶. The final frame is exact.
- Colour values are engineering estimates tuned against the 4 reference photos. Tune `discharge()` once the user
  sees it in the exe.
- Constants worth tuning (all in `graffiti.js`):

  | What | Where |
  |---|---|
  | spray density | `perSec` (`12 *`) |
  | drip threshold | `thr = 16 - 12 * dripAt` |
  | drip speed / loss | `g = 70`, `0.03` |
  | acid spread | `cx`, `cy` |
  | acid reaction rate | `rate` |
  | acid evaporation | `evap` |

## 6. Data added to documents (all ordinary TypeLab data)
- paint layer: `strokes: [stroke]` (optional; old TypeLab versions ignore it)
- effect `dyn_bleachpaint`: `fieldId` (asset, saved like `maskId`), `strokes: [stroke]`
- `TL.migrate` keeps unknown keys on layers and effects, so nothing else is needed. Documents without the kit still
  open: unknown effect types are dropped by `fixEffects`, as for any missing effect.

## 7. Uninstall
`git checkout -- app/index.html app/js` and delete the three new files.

## 8. ROADMAP entry (paste under M27)
```
- [x] M28 Graffiti workspace (2026-10-xx, graffiti kit): tab 6 between Paint and Export. Spray can (G): droplet emitter,
  caps (skinny / fat / soft / flare / calligraphy / outline), distance, pressure, overspray, spits, wet-paint grid →
  drips that run after release until dry, surfaces, selection = stencil. Acid / bleach (J): splatter / spray / pour,
  liquid spreads through the weave (porous-medium diffusion, faster along the warp, ragged yarn edges), eats dye while
  wet, tide marks; permanganate purple → brown → Neutralise. New "Dynamic" effect family (12, ▶ develops live, Develop
  0 = untouched, deterministic): Bleach Splatter, Crumple Bleach, Acid / Snow / Feather Marble / Stone / Enzyme / Bleach
  wash, PP Spray stages, Sandblast, Tinted / Dirty, Antique / Vintage; dye-aware colour (indigo → sky → white / peach,
  sulfur black → grey / rust). Strokes stored as data, live = Replay byte-identical, one history step per stroke.
  Surfaces (raw / mid / stonewashed indigo, black, grey), 10 looks matched to the user's reference photos.
```
