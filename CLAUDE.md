# CLAUDE.md

Guidance for Claude Code (or any future editor) working in this repo.

## Location data arrays are append-only

`scotland.html` contains a planned "path code" feature: an ordered list of
selected locations gets encoded as a short string by numbering every
addable location (POI or route/railway stop) according to its **position**
in the data — the order categories appear in `CATEGORIES`, and the order
each location appears within its category's data array (`ROUTES`,
`RAILWAYS`, `DISTILLERIES`, `CASTLES`, `VIEWPOINTS`, `CAMPSITES`,
`FREECAMPS`, `AIRES`, `WATERPOINTS`, `ANCIENT`, `WILDLIFE`, `BREWERIES`,
`BEACHES`, and each route/railway's `stops` array).

Codes generated from these positions only stay valid if that ordering
never changes. Because of this, when editing any of these arrays:

- **Always append new entries at the end** of their array (or add a new
  category at the end of `CATEGORIES`). Never insert in the middle.
- **Never reorder or delete existing entries.** If an entry is wrong,
  correct its fields in place — don't remove and re-add it, and don't
  move it elsewhere in the array.
- **Never reorder the keys in `CATEGORIES`.**

If a location genuinely needs to be removed, prefer leaving a tombstone
(e.g. an `archived: true` flag it's filtered out of the UI) over deleting
its array entry, so it doesn't shift the position of everything after it.

If this discipline is ever broken (e.g. a bulk data cleanup reorders
things), bump the path-code format's data-version tag so previously
issued codes are detected as stale instead of silently resolving to the
wrong location.

# crawl.html — the dungeon crawler

One self-contained file: three.js r128 from a CDN, D&D 3.5 rules,
mobile-landscape. Everything (data, sprites, generation, engine, game
logic, UI, boot) lives in the single `<script>` block, roughly in that
order. There is no build step in the repo — `crawl.html` is the source.
Past sessions split it into chunks in a scratch directory to work on it
and concatenated them back; that scratch is ephemeral and is **not** in
the repo, so treat the committed file as authoritative.

There is no test suite in the repo either. Sessions have built throwaway
node harnesses that stub `window`/`document`/`THREE`, load the pure-logic
part of the file, and assert on it (the T1–T33 series referenced in the
git log). If you make a behavioural change, expect to rebuild a harness
rather than find one — and note that the numbering only ever grows, so the
git log is the index of what each one covers.

## The difficulty curve is authored, not emergent

Depth drives everything. The functions below are the dials, and they are
meant to be read together. Every one of them that returns a scalar is
non-decreasing in `depth` on purpose, and `threatBudget` is strictly
increasing. Breaking that is the main way to accidentally make a floor
easier than the one above it.

- `depthScale(depth)` — monster hp multiplier, `1 + 0.07·(depth−1)`.
- `depthAtkBonus(depth)` — flat attack bonus; half of it also goes to AC.
- `targetCount(depth)` — how many monsters a floor holds, capped at 30.
- `monsterThreat(m)` / `threatOf(key,depth,elite)` — one scalar score for
  a creature, from hp, average damage, attack, and a multiplier for
  ranged/caster/reach. `threatOf` computes it from the definition without
  building the monster; the two must agree.
- `spawnPool(depth)` — which creatures the depth allows, weighted. In
  band, weight follows a sine arc so a creature debuts, peaks mid-band
  and fades. One floor early it appears as a rare scout (0.18); past its
  band it lingers as a decaying veteran, floored at 0.05.
- `rawBudget` / `threatBudget(depth)` — the floor's total threat target.
  Memoised, and clamped to between `BUDGET_MIN_STEP` and
  `BUDGET_MAX_STEP` of the previous floor, so no single floor can spike.
- `poolCeiling(depth)` — what a floor could field if every slot held the
  heaviest thing the depth allows. The budget is capped by this and may
  then grow only at `BUDGET_TAIL_STEP`; without it the target runs away
  from the bestiary and every spawn resolves to the single biggest
  creature.

Generation does **not** spend the budget directly. It fixes the count
from `targetCount`, divides the budget to get a per-monster share, and
then weights `spawnPool` by how close each candidate's `threatOf` is to
that share (a Gaussian in log-space, widening with depth). The budget
therefore steers *which* creatures appear, not how many.

`eliteChance(depth)` (nothing before depth 8, rising to 35% by depth 30)
is rolled **before** the creature is chosen — roll the rank first, then
pick within it. Rolling the other way round overshoots the elite share
badly, because heavier variants match the budget better.

Rests are counted per floor in `G.L.restsHere`: the second camp on a
floor wakes nearby sleepers — as does any camp without food — and the
third summons a hunting pack. Resting spends a ration; without one the
party wakes at 40% hp with its spell slots still spent (conditions clear
either way, and smite and rage come back regardless).
`resolveRest(fed,rests)` holds all of that, split out of `tryRest`'s fade
timers so it can be tested directly. Negative levels are deliberately not
a condition, so they survive a rest and only `restoration` lifts them.
Ration drop rate rises as the larder empties, and that roll sits
**after** the healing and scroll bands in `monsterLoot` so it draws from
the gear share and leaves those tuned rates alone.

If you change any of this, sanity-check the whole curve rather than the
floor you were looking at. A Monte-Carlo descent (`sim_body.js` in the
scratch harness — auto-party, geared from plausible drops, fighting every
pack until it wipes) is the tool. It read **median death depth 31, middle
half 25–35** when the curve was authored; after the crypt work (seven new
heavy undead filling the deep bands, plus the undead damage rules) it
reads **median 26, middle half 22–29**. That is below the intended 30–40
band and has not been retuned — a deliberate decision to measure first.
The extra crypt encounters are *not* the cause: removing coffin and
ossuary fights from the simulation leaves the median unchanged, so the
movement is the bestiary and the damage rules.

## Adding a monster

`MONSTERS` is a plain object keyed by id, so ordering does not matter
here (unlike `scotland.html`). Touch all of these:

1. **`MONSTERS`** — the definition. `cr` drives XP via `XP_AWARD`; `hp`,
   `ac`, `atk`, `dmg`, `speed`, `type` are the combat numbers. Optional:
   `ranged:<tiles>`, `reach:true` (can strike from the back rank of a
   tile), `caster:{dmg,ranged,cd,fx,elem}`, and the special-attack flags
   `poison`, `disease`, `paralysis`, `energyDrain`, `regen`.
2. **`SPAWN_DEPTH`** — `[minDepth, maxDepth]`. Without an entry the
   creature never spawns naturally. Use `99` for "to the bottom". Bands
   should overlap; a gap leaves a floor with nothing new on it.
3. **`MONSTER_ART`** — keyed by the definition's **`spr`**, not by the
   monster key. Body art wraps the head in `|H|…|/H|` and the weapon arm
   in `|A|…|/A|` so `splitLayers` can animate them separately; `o.hp` and
   `o.ap` are the head and arm pivots, and `ad`/`aw`/`as` override the
   swing for creatures that carry a weapon across the body. Omitting the
   markers gives a static sprite that will not telegraph its attacks.
4. **Sprite scale** — `addMonsterSprite` has a hardcoded list of large
   creatures that render bigger. Add to it if the new creature is big.

Then check the knock-on effects: `threatOf` must score it sensibly (a
creature whose danger is not captured by hp/damage/attack will be
mis-placed by the budget), and if it is a caster give `caster.elem` one
of the `ELEMENTS` keys so elemental wards can resist it.

Undead take two extra flags, both read by `undeadDamageMult`:
`skeletal:true` (bludgeoning ×1.5, piercing ×0.5 — put it on things made
of bone, not on dried flesh like the mummy) and `incorporeal:true` (half
damage from a weapon with no enchantment and no affix). Incorporeality is
deliberately **halving and never immunity**: a wraith debuts at depth 12
and ordinary floor loot tops out at +3, so a party may hold nothing
magical at all. `threatOf` gives incorporeal creatures ×1.5 effective hp
to compensate, and `monsterThreat` must be kept in step with it.

Whether a creature counts as undead for the crypt spawn bias, for
Turn Undead and for the antitoxin-style loot faucets is `type:'undead'` —
there is no separate list to update.

`ELITES` templates apply on top of any creature, so a new monster
automatically gets six variants. Check the ones that add `reach` or
`poison` still make sense on it.

## Adding a level (theme)

Themes cycle every three floors: `THEMES[floor((depth−1)/3) % length]`.
Appending a fifth theme therefore changes which theme every floor past
the first twelve gets — that is cosmetic, but saves store `themeIdx`, so
inserting in the middle of `THEMES` re-skins existing saves. Append.

A theme is colours plus `roomBias` (how room-heavy vs maze-heavy the
generator is). Anything beyond colour is special-cased by **name**, and
three themes carry real machinery:

- **`Sewers`** — bigger starting dimensions, lake pits in large rooms,
  rivers down corridor middles, wall pipes, culvert arches where a river
  meets a wall, and grate doors.
- **`Caves`** — its own wall generator instead of the brickwork. `caveBaseCanvas`
  evaluates a periodic value-noise fBm per pixel for packed earth, and
  `caveWallCanvas` draws stones (half angular fragments, half worn) and
  cracks over it — **twelve** variants rather than six, so `wallVariant`
  and the material array take the count as a parameter. Caves also carry
  sparse emissive gem meshes, seeded from tile coordinates, and their floor
  is `caveFloorCanvas` on a **merged** mesh whose uvs come from world
  position. The other themes keep the instanced per-tile plane, which shows
  the whole texture on every tile — fine for flagstones, but it restarts the
  pattern at each tile edge and prints a grid onto bare ground.
- **`Crypt`** — the most machinery of the three. Wall furniture in
  `L.crypts` (burial nooks with an anthropoid sarcophagus, a stacked pair,
  a 3×3 grid of inscribed tomb plaques, a candle on an iron bracket, an
  empty recess); an ossuary chamber in `L.ossuary` with bone-stacked walls
  and a blocking bier; non-blocking floor dressing; and a ×4 undead spawn
  bias applied **at placement only** (see the curve section — putting it
  in `spawnPool` would taint `threatBudget`'s depth-keyed memo).

Search for `theme.name==='Sewers'`, `th.name==='Crypt'` and `th.name==='Caves'`
(plus the `cave` flag in `buildLevel`) to find every hook before adding a
fourth such theme. Both write an array onto the level
(`rivers`/`pipes`, `crypts`) in `tryGen` and read it back in `buildLevel`;
anything you add that way must also be carried through `serializeGame` and
`loadGame`, or a reloaded floor comes back stripped of it.

Wall features are built in a local frame — +X along the wall, +Y up, +Z
out into the room — and then turned to face the tile they were placed
against. **The sign depends on which way the scan ran**: crypt furniture
stores `dx,dy` as floor→wall and turns by `Math.atan2(-dx,-dy)`, while the
cave gem scan runs wall→floor and so turns by `Math.atan2(dx,dy)`. Getting
it backwards rotates the feature 180° and buries it inside the rock, where
it is invisible rather than obviously broken.

Any texture that must tile has to be periodic: the cave noise wraps its
lattice at `PER`, and everything drawn on top is stamped at x−128, x and
x+128 by the `wrapX` helper. The base is shared by every variant so two
adjacent tiles match texel-for-texel at their join. Note that a wall tile is a solid box, so nothing can genuinely be
cut into it: a "recess" is an unlit black panel drawn on the wall face
with a surround standing proud of it. That is the same trick the sewer
culvert arches use, and it is why recessed contents sit slightly forward
of the wall plane rather than behind it.

Depth-gated content that is not theme-driven and will need extending if
the dungeon grows:

- **`BOSSES`** — one entry per named boss with a `minD`. Every fifth
  floor is a boss floor. Past the last named entry `bossFor` cycles the
  list, each pass harder and titled by its circle, and cycled bosses also
  wear an elite mantle. Adding a named boss extends the run before
  cycling starts.
- **`trapDice` / `trapDC`** — damage keeps climbing with depth; the spot
  DC deliberately stops just short of a maxed rogue's take-10, so finding
  traps stays the rogue's job at any depth. Do not let the DC past that.
- **`bonusForDepth` / `affixChance`** — the gear ladder. `+4` and `+5`
  exist only in hoards and boss piles from depth 20 (and 28), and affixes
  ride the same schedule. Ordinary floor loot tops out at `+3` at any
  depth, on purpose.

## Crypt interactions

Two tappable things route through the `userData.kind` raycast dispatcher
in the boot file, alongside doors, traps, items and secrets:

- **`coffin`** — 55% dust, 25% grave goods, 20% wakes an undead. One shot
  each (`c.opened` is a list of slot indices, so a stacked pair opens
  independently), and opening wakes sleepers within 6 tiles.
- **`bier`** — the ossuary centrepiece, robbed once for a hoard, heard 8
  tiles out. Its guardian is an elite undead placed at generation.
- **`plaque`** — reads a generated epitaph. Deterministic in the plaque's
  own coordinates, so a stone always says the same thing.

Anything a crypt writes onto the level (`crypts`, `ossuary`, and the
`opened` flags inside them) must be carried through `serializeGame` and
`loadGame`, or a reloaded floor comes back looted-clean or bare.

Note that `openBier` calls `buildLevel` to show the shifted lid, so any
scenery built with `Math.random()` would visibly reshuffle the moment the
bier is opened. The bone stacking and the floor dressing are both seeded
from their own tile coordinates for exactly this reason.

## Known rough edge

The bestiary is no longer as thin at depth — the seven deep undead took
depth 40 from roughly 90% dragons and ogre mages to thirteen creature
kinds. What remains is that undead are now about half of every deep floor
whatever the theme, because they are most of what exists down there; a
non-crypt bias of 0.55 keeps crypts distinct, but more *living* heavies
would be the better fix.
