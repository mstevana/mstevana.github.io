# The node harness, preserved

These files have never been in the repo. CLAUDE.md says as much: *"There is no
test suite in the repo either. Sessions have built throwaway node harnesses…"*
They have in fact been rebuilt and extended continuously — T1 through T60 — and
they only ever existed in a session's scratch directory, which is ephemeral.

They are parked here because main was reverted to its 2026-08-21 17:00 UTC tree
and these bodies are **ahead of it**: they assert features that revert removed
(the puffball trap, `stunned` costing AC, the circle mound, the version number,
the tolerant save decoder, stairs not being walkable). Run against reverted main
they fail correctly, and rebuilding them from nothing would waste a day.

## Rebuilding

`build_harness.sh` concatenates the chunk files with the stubs and one test body:

```
C="stub.js 02_data.js 03_sprites.js 04_items_dungeon.js 05_char.js engine_stub.js 07_game.js ui_stub.js"
cat $C test_bugs_body.js > run_bugs.js     # T1-T60
cat $C test_body.js      > run_test.js     # pure rules
cat $C sim_body.js       > run_sim.js      # Monte-Carlo descent
cat $C trapcost_body.js  > run_trapcost.js # trap pricing
```

The chunk files come from `resplit.js`, which splits `crawl.html` on its section
banners. Always check the split round-trips byte-for-byte before trusting it:

```
cp crawl.html crawl_assembled.html && node resplit.js
cat 01_head.html 02_data.js 03_sprites.js 04_items_dungeon.js 05_char.js \
    06_engine.js 07_game.js 08_ui.js 09_boot.js > /tmp/reasm.html
printf '</script>\n</body>\n</html>\n' >> /tmp/reasm.html
cmp /tmp/reasm.html crawl_assembled.html
```

## What the harness cannot see

`engine_stub.js` replaces the whole of `06_engine.js`. **Nothing in three.js,
texture handling, geometry or rasterisation is covered by any of these tests** —
which is exactly where the crash under investigation lives. Engine changes have
to be measured in a real browser.

`engine_stub.js` here is the version carrying `pruneMonsterTextures` and
`prewarmMonsterFrames` stubs, which reverted main does not call. Harmless: an
unused function declaration.
