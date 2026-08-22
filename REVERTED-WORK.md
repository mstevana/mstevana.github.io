# Work reverted from main on 2026-08-22

Main was taken back to the tree of `e9d41f1` — its tip at 17:00 UTC on
2026-08-21, last changed 2026-08-20 07:10 — because a crash was still being
reported and the base needed to be known-good. The revert commit on main is
`2f4c3db`; nothing was rewritten, so every commit below is still reachable, and
**this branch (`backup/main-2026-08-22-1251`) holds the complete 0.107 tree at
`4f30a9c`**.

Thirty commits from two sessions came out. To restore any single item:
`git checkout backup/main-2026-08-22-1251 -- crawl.html` for everything, or
`git show <sha>` for one change.

## What this revert does NOT undo

`8f00ca4` (2026-08-17) raised the monster sprite raster from 384px to 640px,
making every cached frame 2.8x heavier. It is **before** the cutoff and is still
in main. It is the most plausible surviving contributor to the memory ceiling.
If the crash outlives this revert, that is the next thing to try, and the revert
will have done its real job as a bisect step.

## Known consequence

The tolerant save decoder (`7770257`) is gone, so `b64ToU8` is strict again. A
save whose `grid` or `explored` field is not valid base64 makes "Continue the
descent" do nothing at all — verified: the reported depth-17 save fails this way
on the reverted build, and loads on it once the field is repaired. That fix is
independent of the crash and is the cheapest single thing to re-land.

---

## Session A — `claude/crawl-lines-of-code-f1kvj7`

| sha | when (UTC) | what |
|---|---|---|
| `0a5d238` | 08-21 19:38 | **Graphics setting: high / adaptive / low.** `GFX_MODES`, `GFX_RUNGS`, persisted in `crawl_gfx`, chips on the main menu. `high` draws at the display's own DPR (capped 3), `low` at 1.5, `adaptive` walks the rungs fed only by frames that did real work, with step-down (>26ms) and step-up (<19ms) apart so it settles. |
| `2e51784` | 08-21 21:45 | **Elite recolour as `feColorMatrix`, not `mix-blend-mode`.** CSS blend modes are not applied when an SVG is rasterised through an `Image`, so every elite was a flat opaque wash retaining 23–29% of the creature's modelling. As a filter it measures 101–103%. |
| `ec9a0b6` | 08-21 22:01 | **`monsterTexPx` sizes the raster for `enlarge`.** The three duergar that grow get `MON_TEX x ENLARGE_SCALE` rounded to 64, since the racial enlarge grows the billboard only. |
| `5214d5a` | 08-21 22:14 | **Bestiary reports type, speed and XP.** |
| `52dbc7d` | 08-21 22:45 | **Myconids: give the cap a surface.** |
| `874c96e` | 08-22 07:22 | **State the SVG's width/height before rasterising.** The sprites carry a viewBox and no size, so their intrinsic size is the CSS default 150x150. Blink re-rasterises at draw size; **WebKit does not**, so an iPhone was upscaling a 150px raster to 640 — a 4.3x win on WebKit, a no-op on Blink. |
| `219c662` | 08-22 07:29 | **Build version shown beside depth and theme.** |
| `7c5c6a2` | 08-22 11:04 | **Bound the monster frame cache to a floor.** The cache was global and never emptied: 683 textures / ~1.3 GB over a 24-floor descent. `startLevel` prunes once per floor to what the floor needs; peak falls to 187 MB. Deliberately *not* on `disposeLevel`, since `openBier`/`openForge`/`openAltar` rebuild mid-floor. Introduced `monFrameKey` and `MON_POSES` so rasteriser and prune cannot disagree. |
| `7eb9024` | 08-22 11:16 | **Free the level's materials and textures, not just geometry.** `R3.texCache` entries skipped (shared across floors). GPU textures 17 -> 77 over the same descent. |
| `bae9466` | 08-22 11:25 | **Revert of the spore cloud** (`085acf0` below), as part of the memory work. |

## Session B — `claude/crawl-html-dnd-game-ekhy7c`

| sha | when (UTC) | what |
|---|---|---|
| `8b8007c` | 08-21 19:55 | **Duergar: remove the haulage track.** Keep the technique in CLAUDE.md — anything running continuously along a passage is chosen per row/column, never per tile. |
| `c000471` | 08-21 21:52 | **Stairs: a spiral round a newel**, 12 treads over 540°, `RISE = WALLH/3`, godrays out of the well. `T_STAIRS` dropped from `walkableTile`; `tryMove` and the `stairs` raycast both route through `takeStairs`. Four call sites had to drop `T_STAIRS` from their walkable triples. |
| `27ca65a` | 08-21 22:04 | **Hew it out of the rock rather than build it.** `hew()` jitter, no cap or collars, treads run *into* the bore, one material throughout. |
| `ca9267c` | 08-21 22:17 | **A bored cylinder with four proud steps.** Tile supplies its own floor plate (in `floorMat`, not the wall's). `GODRAY_FLOOR = -WALLH/2`. Added the final connectivity gate in `tryGen` treating the stairwell as solid. |
| `42344a6` | 08-21 22:22 | **Treads were open shells.** A `CylinderGeometry` with `thetaLength < 2pi` generates no radial end walls — the risers did not exist. Rebuilt as `ExtrudeGeometry`; `hew` rewritten to hash the vertex *position*, since non-indexed geometry duplicates corners. |
| `3c62d5f` | 08-21 22:28 | **Light shafts fit the bore.** Cones were wider than the hole at floor level; rebuilt as `LatheGeometry` (cylinder-then-cone, break at the aperture), fade measured in world height via `yBot`/`yTop`. |
| `26a22bd` | 08-21 22:53 | **Version number, 0.100**, advancing on every merge to main. Deliberately separate from `serializeGame`'s `v`, which `loadGame` uses to delete incompatible saves. `stampVersion()` guarded for the node harness. |
| `4548ee3`, `841d08e`, `1b01f70`, `28d3ccf` | various | Version bumps 0.101 / 0.102 / 0.103 / 0.105. |
| `7ebd196` | 08-22 07:31 | **Myconid 1/5:** fix the white-out (stalks and torch both too pale), eight wall devices keyed on the variant itself, the grove's crop and casualties. |
| `092b152` | 08-22 07:34 | **Myconid 2/5:** the grove emits light — `myconidWallCanvas` returns `{cv,glow}`, rot burns sour green against everything else's violet. |
| `5617c5d` | 08-22 07:46 | **Myconid 3/5:** six furniture kinds on a new `L.myconid` hook (cluster, nursery, barrel, pods, compost, rapport bloom). |
| `f2b83f4` | 08-22 07:55 | **Myconid 4/5:** floor dressing, the **puffball trap** (Fortitude not Reflex, 5s, priced at 10.8 hp on `trapcost_body.js`), and **`stunned` given its 4 AC** — it blocked acting but cost no AC, contradicting both CLAUDE.md and 3.5. A real balance change. |
| `d117853` | 08-22 08:02 | **Myconid 5/5: the circle mound** on the ossuary/forge/chapel pattern — `T_PIT` after the connectivity check, shoves loot aside, never on the stairs, elite myconid keeper, `openMound`. T59. |
| `085acf0` | 08-22 08:17 | **Spore cloud** in the vertex shader. Measured at ~1.9% of frame time, inside the noise; 0/260/520/1040/2080 motes showed no monotonic trend. **Reverted by session A** in `bae9466` during the memory work. |
| `7770257` | 08-22 11:21 | **Tolerant save decoder.** `b64ToU8(b, want)` strips junk, re-pads, and fits to `w*h`; `loadGame` says something when it fails. T60. **Cheapest thing to re-land — independent of the crash.** |
| `9ccc558` | 08-22 12:51 | **Two monster-texture memory fixes.** (a) `CanvasTexture` keeps its canvas forever; shrunk to 1x1 in `tex.onUpdate`, with `renderer.initTexture` in the raster's `onload` to force the upload (release-on-draw alone recovered only 20 of 75 MB). (b) `monsterTexPx` follows the drawing buffer, `clamp(ceil(h*0.55/64)*64, 256, MON_TEX)`, frozen per floor in `R3.monTexPx`. Plus `webglcontextlost`/`restored` recovery, which the canvas release requires. Measured GPU+canvas on a DPR-3 phone at depth 17: high 175 -> 100 MB, low 175 -> 36 MB, desktop DPR 1 -> 16 MB. |

## Re-implementation order I would suggest

1. `7770257` — the tolerant decoder. Independent of everything, fixes a real dead-button bug.
2. `2e51784` and `874c96e` — both are pure art-correctness fixes with no memory cost.
3. Then attack the memory question from the 384/640 raster (`8f00ca4`) *before* re-landing `7c5c6a2`/`7eb9024`/`9ccc558`, so each is measured against a base that is not already over the ceiling.
4. The stairs, the myconid pass and the version number are self-contained and can come back whenever, in any order.
