#!/bin/sh
# Rebuilds every node harness from the chunk files. Run this after editing any
# chunk — a stale harness silently tests the previous version of the game.
cd "$(dirname "$0")"
C="stub.js 02_data.js 03_sprites.js 04_items_dungeon.js 05_char.js engine_stub.js 07_game.js ui_stub.js"
cat $C test_bugs_body.js > run_bugs.js
cat $C test_body.js      > run_test.js
cat $C sim_body.js       > run_sim.js
cat $C sim_diag_body.js  > run_sim_diag.js
cat $C purity_body.js    > run_purity.js
cat $C budget_body.js    > run_budget.js
cat $C cover_body.js     > run_cover.js
cat $C trapcost_body.js  > run_trapcost.js
