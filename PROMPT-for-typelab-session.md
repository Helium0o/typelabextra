# Prompt to paste into the TypeLab session

Copy everything between the lines below into the TypeLab Claude session, and attach `typelab-graffiti-kit.zip`.

---

I'm attaching `typelab-graffiti-kit.zip`. It contains a finished, tested add-on for TypeLab: a new **Graffiti** workspace
(spray can with live drips, an acid / bleach tool that spreads through the denim weave, and a new "Dynamic" effect family
of 12 denim washes with a ▶ live-develop button). Another session built it from about half of TypeLab's files and tested
it in headless Chromium. It has **not** been run inside the packaged exe yet. This is milestone **M28**.

Please do this, in order:

1. **Read first:** unzip it into a scratch folder (not into the repo). Read `graffiti-kit/README.md` (the code: what it
   adds, how to install, test results, known limits). Then skim `HANDOVER-graffiti.md`: the "★ Update, round 2" box at
   the top, the research in §3–§5, and the gotchas in §8. My reference photos are in `graffiti-kit/reference/ref1..5`.
   The matching results are `result-*.jpg`.
2. **Dry-run the installer** from the repo root: `node <scratch>/graffiti-kit/install/apply.mjs . --dry`. It edits
   TypeLab files by exact-text anchors and writes nothing if any anchor is missing. If one fails, the file has changed
   since the snapshot: re-target that anchor in `install/apply.mjs` (`EDITS` array) by reading the current code, then
   dry-run again. Don't hand-edit around it.
3. **Install for real** (same command without `--dry`). Then check `git diff` reads sensibly. Also grep the whole repo
   for any other copy of the asset-id pattern `(?:canvasId|maskId|imageId|tileAsset|motifId)` that the installer's sweep
   didn't cover (it only sweeps `app/js`). For example, `tools/exe-tests/roundtrip.js` needs `|fieldId` if it checks
   every asset.
4. **Test inside the exe**, the way the other suites run (`tools/exe-tests/README.md`):
   `node cdp.mjs "evalfile:m28_graffiti.js" "saveimgs:m28_"`. Expected: `errs: []`, `sprayReplayDiff` /
   `acidReplayDiff` / `roundTripDiff` = 0, every Dynamic effect `t0 0.00` and `repeat 0.00`, one history step per stroke.
   Then run the existing suites touching shared code: `fxaudit.js`, `roundtrip.js`, `cmds.js`, `uistress.js` /
   `wsstress.js`. Also run `framemon.js` while spraying on a 1920×1080 document (the target is the usual 60 fps live view).
5. **Hand-test like a user:**
   - Press 6 → Graffiti → Surface **Black** → Look *Black jeans · bleach splatter*.
   - Spray with **G**: hold still to get drips, use a selection as a stencil.
   - Splatter with **J** using Permanganate, then **Neutralise**.
   - Press ▶ on a wash card. Undo / redo mid-animation. Export PNG and look at the export preview.
   - Save → reopen.

   Compare the looks with my photos and tune colours in `discharge()` (`app/js/effects-dynamic.js`) if needed.
6. Fix anything that breaks. Keep the rules from the README: deterministic, Develop 0 = untouched, live = Replay, one undo
   step per stroke. Then add the M28 entry to `ROADMAP.md` (ready text in README §8), commit, and rebuild the exe.
7. **Afterwards (ask me before starting):** the remaining items:
   - Whisker / honeycomb creases (drawn curves)
   - Rips with the white weft threads bridging the hole
   - "Piece from text" (fill fade + outline + 3D + shines + drips from a text layer)
   - Pen tilt
   - A jeans mockup

Decisions already made: the Graffiti tab sits after Paint (Export moves to key 7), and denim comes first (walls later). Spray
paints into a paint layer, with every stroke also stored as data for exact Replay.

---

## What's in the zip

| Path | What |
|---|---|
| `PROMPT-for-typelab-session.md` | this file |
| `HANDOVER-graffiti.md` | the full handover: request, TypeLab code map, denim / acid / bleach research, spray-can research, design rules, milestones, gotchas |
| `graffiti-kit/README.md` | the code: install, checklist, architecture, effect list, test results, limits, ROADMAP entry |
| `graffiti-kit/app/js/effects-dynamic.js` | Dynamic effect family (12 washes + hidden *Painted Bleach*), `TL.dyn` live-play |
| `graffiti-kit/app/js/graffiti.js` | Spray can + Acid tool simulations, replay, settle, tool hooks |
| `graffiti-kit/app/js/ui/mode-graffiti.js` | the Graffiti workspace (surfaces, tool panels, washes, looks, Ctrl+K) |
| `graffiti-kit/install/apply.mjs` | installer (anchored edits, dry-run, idempotent) |
| `graffiti-kit/tests/m28_graffiti.js` | exe-compatible test (`cdp.mjs evalfile:`) |
| `graffiti-kit/tests/run-browser.mjs` | headless runner for the same test (Playwright) |
| `graffiti-kit/reference/ref1..5` | the user's reference photos |
| `graffiti-kit/reference/result-*.jpg` | what the kit produced in testing |
