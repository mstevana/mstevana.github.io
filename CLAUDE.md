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
reads **median 26, middle half 22–29**. After the cave work (nine cave
creatures, the ambushers, the cave spawn bias) it reads **median 27,
middle half 24–30**; moving boss floors to every third level took it to
**median 28, middle half 26–30**.

**26–30 is the band. Do not treat it as a shortfall.** CLAUDE.md carried an
intended 30–40 for a long time and the game has never once hit it, which
kept inviting sessions to retune a curve that is working.

Neither content pass moved it, and both were checked the same way: removing
coffin and ossuary fights from the simulation leaves the median unchanged,
and so does skipping every ambush or flattening the cave bias to 1.

The cause is structural, and worth knowing before you touch any dial.
**The party is level-capped at 20 by depth 20** — `MAX_LEVEL` is 20 and a
descent banks enough XP for it around floor 20. From there to the bottom,
monsters keep compounding (`depthScale` +7% a floor, a rising
`depthAtkBonus`, a climbing `threatBudget`) while the party gains nothing
but gear, which itself stops at +5. Depths 20–28 are eight floors of a
party at its ceiling losing ground to depth. A run ends where character
growth ran out, not where the numbers were mistuned.

That cap is an **open question, not a settled one**: raising `MAX_LEVEL`,
slowing the XP curve so 20 lands nearer depth 30, or giving the party some
post-cap progression would all move the band, and any of them is a real
design decision rather than a tuning pass. Nobody has taken it. What is
settled is that the median is not to be chased by fiddling with
`depthScale`, `threatBudget` or the bestiary — those are not what is
holding it.

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

Cave creatures take two flags of their own. `cave:true` is the whole of
what the cave spawn bias reads — like `type:'undead'`, there is no list
elsewhere. `lurk:true` additionally makes the creature eligible to be
placed as an **ambusher** rather than a standing spawn (see below); only
give it to something whose idiom is waiting still, and give it a matching
formation in `addLurkerMesh` or it will hide inside a piercer's
stalactite.

Two special-attack flags were added with them and are read by
`monsterSpecials`: `gaze:{dc,dur}` (a Will save or the `stunned`
condition) and `hold:{dc,dur}` (a Reflex save or the `hold` condition).
Both conditions stop a character acting in `canAct` and cost 4 AC in
`charAC` — a condition that is not read by both is a badge that blocks
nothing.

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
  pattern at each tile edge and prints a grid onto bare ground. Caves also
  carry a ×4 spawn bias on `cave:true` creatures (×0.55 elsewhere) applied
  **at placement only**, exactly like the crypt's, and an array of
  **ambushers** in `L.lurkers`.
- **`Crypt`** — the most machinery of the three. Wall furniture in
  `L.crypts` (burial nooks with an anthropoid sarcophagus, a stacked pair,
  a 3×3 grid of inscribed tomb plaques, a candle on an iron bracket, an
  empty recess); an ossuary chamber in `L.ossuary` with bone-stacked walls
  and a blocking bier; non-blocking floor dressing; and a ×4 undead spawn
  bias applied **at placement only** (see the curve section — putting it
  in `spawnPool` would taint `threatBudget`'s depth-keyed memo).

- **`Duergar`** — halls, not caves: the highest `roomBias` of any theme,
  because they are built. Eight wall variants over one shared base that
  carries the courses, the gold fillets and the channel the inscription
  runs in — a band on only some variants would stop dead at a tile join,
  so only the runes inside it vary. Runes are Dethek, which is chiselled
  and so has no curves. Polished slab floor, stone doors, and wall
  furniture in `L.duergar`: engaged fluted half-columns, and torches whose
  point light is registered in `R3.candleFlames` (the flicker loop reads
  each flame's own `base` intensity, so a wall torch is not a candle).

Search for `theme.name==='Sewers'`, `th.name==='Crypt'`, `th.name==='Caves'`
and `th.name==='Duergar'`
(plus the `cave`/`duer` flags in `buildLevel`) to find every hook before
adding a fifth such theme.

**Appending a theme moves which depth is which theme**, which broke seven
tests that had depths hardcoded. They now ask by name — `depthOf(name)` and
`depthsOf(name)` in the harness — so the next theme will not break them.
Two statistical checks were also sitting near their tolerances and had to
be widened rather than relaxed (T22's packing, T29's crypt undead share);
the crypt's share genuinely falls with each roster added, measured at 78.5%
at depth 9 against 69.3% at depth 24. Each writes an array onto the level (`rivers`/`pipes`,
`crypts`/`ossuary`, `lurkers`) in `tryGen` and reads it back in
`buildLevel`; anything you add that way must also be carried through
`serializeGame` and `loadGame`, or a reloaded floor comes back stripped
of it.

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

- **`BOSSES`** — one entry per named boss with a `minD`. **Every third
  floor from depth 6 is a boss floor**, which is also the last floor of a
  theme block (`THEMES[floor((depth−1)/3)]`), so a boss caps the theme you
  have been walking through instead of landing in the middle of the next
  one. `minD` therefore steps by 3, one named boss per boss floor, and
  three places must agree: `isBossLevel` in `tryGen`, the `/3` in
  `bossFor`'s cycle arithmetic, and the ⚔ in `refreshDepthTag`.

  The first theme block is exempt. On floor 3 the party is still level 1 —
  32 hit points between four of them, a 3-hp wizard — against a boss
  carrying 2.5× hp and **+2 AC**, which at that attack bonus is unhittable
  rather than hard. A simulated descent walled there at 99%.

  Past the last named entry `bossFor` cycles the list, each pass harder
  and titled by its circle, and cycled bosses also wear an elite mantle.
  Adding a named boss extends the run before cycling starts.

  A cycled boss's **hit points come from `BOSS_BASE_HP`, the list's own
  mean, not from the creature the cycle named.** A bugbear base is a
  quarter of a dragon's, so raw base hp handed you a boss a third of the
  one three floors above, and the sawtooth repeated on every pass. Named
  bosses keep their own creature's hp — they are hand-placed for their
  depth, and Sinshara is a caster whose danger is her spells.

  That split is why T21 measures the two arcs on different things: the
  named arc on `monsterThreat` (which credits spells, reach and riders,
  so Sinshara's low hp is not a regression) and the cycled arc on `maxHp`.
  A cycled boss's *damage* is still whatever creature the list named, so
  its threat still steps down at the named→cycled handover — that is the
  list starting over, and it is by design.
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

The ossuary is sited **after** loot is placed, so the bier can land on top
of a floor item. It must **shove what is underneath aside, never delete
it**: the level's only key is one of the things it can land on, and a bier
that swallows it seals the locked room for good. That was a real bug, at
about one crypt floor in two thousand — rare enough that T6 caught it once
in a run of twenty levels and looked like a flake. T42 samples enough
crypt floors to catch it outright.

Note that `openBier` calls `buildLevel` to show the shifted lid, so any
scenery built with `Math.random()` would visibly reshuffle the moment the
bier is opened. The bone stacking and the floor dressing are both seeded
from their own tile coordinates for exactly this reason.

## Cave ambushes

A creature with `lurk:true` can be placed as an **ambusher** instead of a
standing spawn: an entry in `L.lurkers` that the level renders as rock,
not as a monster. Three to five go on a cave floor, and **each one
removes an ordinary spawn** from `monsters` so the floor keeps the head
count and the threat `targetCount`/`threatBudget` gave it — the ambush
changes a floor's shape, not its difficulty. The trade explicitly skips
`boss` and `ossuary` monsters; popping the last-pushed monster instead
eats the boss on every third floor. Which creature a lurker is comes from
the same log-space Gaussian against the floor's per-monster share that a
standing spawn uses, so a deep floor does not ambush the party with a
piercer.

The lifecycle has exactly two ends, both in `revealLurker`, and both
finish with a real awake monster where the rock was:

- **Spotted** — `passiveSearch` scans lurkers on precisely a trap's
  terms: a rogue takes 10 on `searchBonus` over `{party tile, ahead 1,
  ahead 2}`, everyone else gets **one** `noticeBonus` glance apiece
  (`l.noticeTried`) over `{ahead 1, party tile}`. Spotting pays **no XP**
  — the reward is not being ambushed, and paying for it would invite
  scanning every wall.
- **Sprung** — `checkLurkers` fires on Manhattan distance ≤ 1. The
  monster gets `atkCd:0.15` so it lands a blow before the party braces.

Both are called from `afterPartyMove`, **scan first**: the party can only
reach distance 1 by passing through distance 2, so a rogue always gets its
look before the thing is on top of them.

Scenery is `addLurkerMesh` / `removeLurkerMesh` in the engine, registered
in `R3.lurkerMeshes` by lurker index and cleared in `disposeLevel`. Each
kind wears its own formation, seeded from its own tile coordinates for the
same reason the crypt's dressing is (`openBier` rebuilds the level), and
pitched at the *shadowed* rock — a formation that catches the eye is not an
ambush, and the tell is meant to be the rogue's. A new `lurk` creature
without a branch in there hides inside a piercer's stalactite.

The formations are faced with the walls' own textures, read back off
`R3.wallMats` (stashed by `buildLevel`, nulled by `disposeLevel`). The maps
are **shared, never cloned** — nothing extra is uploaded — and each piece
takes a different one of the twelve variants. Because a shared map cannot
carry per-mesh `repeat`/`offset`, `roughen` scales and shifts the *uv
attribute* instead: pass it the piece's real circumference and its height
over `WALLH` and its grain comes out at the walls' texel density rather
than one whole map stretched over a lump. Two things learned the hard way:
the per-vertex jitter that suits a 6-sided cone turns an 80-face
icosahedron into a spiky cut gem, so lumps want roughly a third of it; and
anything hanging from the roof needs a `rootAt` skirt, because the ceiling
is drawn in its own texture and without one a stalactite ends in mid-air
against a surface it shares no colour with.

`lurkers` must be carried through `serializeGame` and `loadGame` like
everything else a theme writes onto the level.

## Area spells have shapes

A spell with `target:'foes'` must carry an `area`, and `spellArea` turns it
into the set of tiles it covers:

| shape | spells | footprint |
|---|---|---|
| `burst` | fireball, ice storm, cloudkill | disc of radius `r` about where it lands |
| `column` | flame strike | the same, but a tight pillar |
| `line` | lightning bolt | `len` tiles straight ahead, one wide |
| `cone` | cone of cold, waves of exhaustion | widening from the caster, `len` deep |

3.5 measures in feet at five to the tile, which makes a lightning bolt 24
tiles and a fireball 4 in radius. The bolt does not fit a dungeon whose
rooms are six across, so the **lengths are pulled in and the shapes and
their relative sizes are what is kept** — do not "correct" them back to
the book numbers without re-measuring the descent.

A burst, column and cone all **flood outward from their origin through
open tiles**. That is closer to a 3.5 spread, which bends around corners —
a fireball thrown past a doorway comes through the gap and fans out
beyond, but never through the stone beside it — and it is the fix for what
was there before. The old code gathered with `losClear`, which is a
**straight-line test that answers false for anything off the party's own
row or column**; every blast was clipped into a narrow wedge that never
reached past the front rank. `losClear` is still right for its own job
(can this monster shoot down the corridor at the party) and is left alone.

A bolt is aimed by facing and a cone comes off the caster, so either can
catch nothing at all; `castSpell` refuses rather than spending the slot on
empty air. The footprint is painted with a burst per few tiles rather than
one blob, so the player can see which shape went out.

**The party is never caught in its own area spells** — the filter only
walks `G.L.monsters`. That is deliberate and asserted in T43, so turning
friendly fire on is a decision someone makes on purpose rather than a
regression.

## The wizard's spellbook

The wizard is the only prepared caster, and `preparesSpells(ch)` is the
single test for it — a cleric still knows their whole divine list and
spends slots from it in the moment. Three fields carry the wizard:

- **`ch.book`** — the spells written down. Starts as `WIZ_START_BOOK`,
  grows by one `studyPick` per level (highest circle they can reach, so a
  bad run with scrolls can never leave them mute), and by scribing.
- **`ch.memo`** — the loadout chosen at the last camp. It persists, so a
  player who does not want to fiddle just rests and gets the same again.
- **`ch.prepared`** — what is left of that loadout. `spendPrepared`
  removes one copy per casting; `resetDaily` refills it from `memo`.

Because only a **fed** camp calls `resetDaily`, a cold camp leaves a
wizard holding whatever they had left — the same rule the other classes
already followed, and the reason the ration matters to them most.

`ensureBook(ch)` is both the constructor and the migration: a wizard from
a save written before any of this arrives with no `book` at all, and gets
one sized to their level plus a filled loadout rather than an empty spell
screen. It is called from `mkCharacter` and from `deserializeGame`.

Two exemptions worth not "fixing":

- **Items ignore the book entirely.** `castSpell` skips the preparation
  gate when `opts.item` is set, because a scroll or a wand carries its own
  magic. This is the same branch that skips the slot check.
- **`scribeScroll` refuses divine spells, anything above
  `maxCircle(ch.level)`, and duplicates** — and consumes the scroll on
  success, so finding one is a choice between a casting now and the spell
  for the rest of the run.

Memorising is wired into `tryRest`, not into the spell screen: `tryRest`
walks every living preparer through `UI.openMemo` and only then calls
`doRest`. `G._preparing` guards the re-entry. Putting it anywhere else
would let a player re-prepare between fights, which is the decision the
whole system exists to make.

## Hands and their timers

`ch.cdL` / `ch.cdR` are two independent cooldowns, and which one a use arms
is decided by **where the thing was held**, not by what it is:

- `armHand(ch,slot,v)` — a one-handed weapon, a potion, a wand, a scroll.
  Anything worked from a hand occupies that hand alone, so a second wand in
  the other hand keeps its own timer exactly as a second sword does.
- `armBoth(ch,v)` — a two-handed weapon, and a **memorised** spell, which
  is gestures and components rather than an object.

Both item paths (`useHand` and the pack) thread their hand slot through, and
fall back to `armBoth` when there isn't one — an item used from the pack has
no hand to charge. `Math.max(handCd(...),v)` everywhere, so arming a hand
can never *shorten* a longer timer already on it.

The gates match: `useHand` checks `handCd(ch,slot)`, a two-hander and a
memorised spell check `anyHandCd(ch)`. `castSpell` deliberately skips its
`anyHandCd` gate for items, because the caller has already checked the one
hand that matters.

Note the tick is `if(ch.cdL>0)ch.cdL-=dt`, so a timer undershoots slightly
negative on its last frame and stops there. Harmless — every gate tests
`>0` — but don't read a negative as a bug.

## Left and right

Both sides of a fight pair up by position: a character on the left of the
formation meets the monster on the left of the line, and that monster
swings back at them. `SIDE_L`/`SIDE_R`, `monsterSide`, `charSide`,
`charOnSide` and `facingMonsterAt` hold all of it.

**The two conventions are opposite, which is the whole reason they are
named rather than inlined:**

- A tile packs monsters 0–1 in front and 2–3 behind, and `rankOffset` puts
  the **odd** slot of each pair on the party's **left**.
- The party portraits are a 2×2 CSS grid laid out `[0][1]` over `[2][3]`,
  so the **even** party indices are the **left** column.

The monster half was measured, not derived: dot each sprite's position
against the camera's own `matrixWorld` right vector. Deriving it by hand
gets the sign wrong, and an earlier probe that read `projectToScreen`
without rendering first reported a mapping that flipped between facings —
it was reading a stale camera matrix, not finding a bug.

Rank matches too. The two formations face each other square on, so
`pickPartyTarget` reaches for the same side **and** the same rank: a
front-rank monster meets the party's front rank, and a back-rank monster
(which needs reach to swing at all) goes for the party's back rank. Every
way a monster reaches the party runs through that one function — melee,
shots, and a caster's bolt.

A character holds their place only while they can fight for it. Down, or
unable to act (`canAct` covers paralysis, hold, sleep, stun), and the lane
opens: the blow reaches past them to whoever else is in that lane. Note the
order of the two fallbacks, which is the part worth not breaking — a
monster tries **both ranks of its own side** before it will cross to the
other. Trying the other side first would make a character *safer* by being
paralysed, since blows would flow away from them; as written, if they are
the last one standing in their lane the blows are still theirs.

On the party's side of it, a lone monster holds the centre of its tile
(`rankOffset` returns zero offsets below two occupants), so everyone
fights it, and `facingMonsterAt` with no character returns the front-most,
which is what movement blocking wants.

`packRanks` renumbers slots as monsters die, so a line re-forms and sides
are reassigned — that is deliberate, not drift.

## The DEX cap

`dexACBonus` clamps the DEX modifier to the body armour's `maxDex`
(clothes 99, leather 6, breastplate 3, full plate 1) and `charAC` is the
only consumer. Three things that are correct and look like bugs:

- **Reflex saves keep the whole modifier.** The cap is an AC rule in 3.5,
  not a general encumbrance, so `charSaves` uses raw `abilMod(ch,'dex')`.
- **A DEX penalty is never raised to the cap** — `clamp(mod,-5,maxDex)`,
  so a clumsy character in plate keeps their −2.
- **Enchantment does not buy capped DEX back.** A +3 plate adds 3 AC and
  still caps DEX at 1.

It was always applied; what was missing is that nothing said so. The stats
screen now prints `AC 20 (DEX +1 of +4 — Full plate caps it at +1)`
whenever the cap is actually biting, and nothing when it is not.

## The log

The 📜 button (and `L`) opens `ovl-log`: every message the party is shown,
and the arithmetic behind every roll. `GLOG` is a capped ring in memory —
`LOG_MAX` entries — and is deliberately **not** serialised, so it is a
record of the session rather than something that bloats a save.

Two lines per entry: what happened, and the check under it. Attacks made
and attacks taken both go through `logStrike`, so they read identically;
saves go through `logSave`. `UI.toast` writes its own message to the log
on the way past, so anything the player is told is already captured — new
messages need no extra call.

Spell damage was the awkward part. Each spell rolls inside its own
`dmgFn`, so there is no dice notation to read off a definition. `roll`
therefore appends to `_rollTrace` whenever that is armed, and `traceRoll`
arms it around a call and hands back both the value and the dice. It is
null at rest, restores the previous trace on the way out (so nesting does
not swallow the outer dice), and costs one null check per roll.

`renderLog` rebuilds on open rather than on every entry — opening any
overlay pauses the game, so nothing can be appended while the panel is up.
It scrolls to the bottom **after** `show`, because a hidden element has no
`scrollHeight`.

Testing combat from the node harness needs two things that the real game
defers: monster swings land on a `setTimeout` (stub it to run straight
through) and offensive spells resolve when their bolt arrives (set
`G.fx=[]` and call `updateFx(10)`, which lands everything in flight via
the `f.t>6` branch). T37 covers the whole of this.

## The thin ordinary roster — measured, and deliberately left

The bestiary is no longer thin at depth in total: the seven deep undead
took depth 40 from roughly 90% dragons and ogre mages to thirteen creature
kinds, and the nine cave creatures widened the mid-depths further. What is
thin is the **ordinary** roster — everything that is neither `type:'undead'`
nor `cave:true`:

| depths | ordinary creatures in band |
|---|---|
| 1–8 | 5–9 — healthy |
| 9–13 | 3–4 — collapses |
| 14–30 | **exactly 5** (ogre, minotaur, troll, dragon, ogre mage) |
| 31+ | decays to 1, then 0 by 44 |

So the themed rosters are better stocked at depth than the default one,
and the leak runs both ways: a deep dungeon floor is roughly a third
undead, and depth 13–15 dungeon floors run about half cave roster. The
0.55 off-theme bias is what keeps crypts and caves distinct at all.

**This was costed and declined.** Filling depths 9–30 is around nine
creatures — definitions, `SPAWN_DEPTH` bands, layered `MONSTER_ART` and
threat tuning apiece. It buys variety and nothing else: with the band
settled at 26–30 it is not a difficulty lever, and the depth 31+ column
above is content no run reaches. If you pick it up, aim it at 9–30 and
skip the deep band; do not treat the table above as a bug list.
