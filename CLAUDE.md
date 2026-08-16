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
- `depthAtkBonus(depth)` — flat attack bonus, `+1 a floor` but **capped at
  +20**, so it stops growing at depth 21. AC is **no longer** this curve
  halved: `depthACBonus` keeps the old, gentler `⌊⌊(depth−1)/2.5⌋/2⌋`, so
  making monsters land blows does not also quietly make them harder to kill
  and drag every fight out.

  **The cap has a consequence worth knowing before touching the deep end.**
  `threatOf` multiplies hp, damage and attack together, so past depth 21 the
  attack term is constant and only `depthScale` still lifts a creature's
  score. A deep slot is therefore carried by the creature's own stats, and
  the boss arc stops being automatically monotonic: the depth-33 roper came
  out 0.5% under the depth-30 lich and had to be given the bulk to clear it.
  Check T21 after any change to the deep table or to these dials.
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
pack until it wipes) is the tool.

**Know what the gear model does and does not cover before quoting it.** It
draws 6 open-floor rolls plus 3 hoard rolls a floor (3 more every fifth floor),
cumulative, best-in-slot kept forever, and equips weapon / armour / helmet /
boots / shield / amulet / both rings. It still ignores **wands and scrolls
entirely** (~40 and ~42 per descent, dropped on the floor), non-healing potions,
and ranged weapons; casters are modelled as a flat `level × 1.4` while slots
last. Gear also goes to the *first* character in party order who would improve,
not the one who gains most, and class is never consulted — which is why the
wizard ends up in full plate. Two of these gaps were fixed (see the band below);
the rest are live and make the model pessimistic on capability. It read **median death depth 31, middle
half 25–35** when the curve was authored; after the crypt work (seven new
heavy undead filling the deep bands, plus the undead damage rules) it
reads **median 26, middle half 22–29**. After the cave work (nine cave
creatures, the ambushers, the cave spawn bias) it reads **median 27,
middle half 24–30**; moving boss floors to every third level took it to
**median 28, middle half 26–30**. The duergar and myconid rosters left it
at **median 27, middle half 26–30**, the drow at **median 28, middle half
25–29**, and the sewers roster at **median 27, middle half 24–29**.

Restricting each theme to its own roster moved it to **median 26, middle half
21–28**, measured over 2000 descents against 2000 on the version before it. That is a real cost and it is not a tuning
error — see *A theme fields its own roster and nothing else* for what was
tried. Most of it was recovered there (the first attempt read median 26 with
the party arriving at depth 15 two levels short); what is left is that
`threatOf` cannot see what makes a floor of nothing but drow harder than its
score — AC, sleep poison, a line of casters — which is the same blind spot
that hid the myconid speed bug.

Then two things landed together and both of them moved it a long way.

**The harness had been understating the party, and every number above is
affected.** `equipFromFloor` refused shields outright (`betterFor` demanded
`kind==='weapon'` for either hand, so every shield routed to the off hand was
rejected) and mapped every ring to `ring1`, leaving `ring2` empty for the whole
descent. Fixing those two took the measured band from **median 26 to median 33,
middle half 30–40** — the party had been walking around missing up to +7 of
shield and a whole ring. Treat 33 as the honest baseline and everything
measured before it as a floor, not a reading.

**Then bosses were made to swing at least as well as the best warrior on their
own floor, and that cost eleven depths: median 33 → 22, middle half 20–27.**
Almost all of it is one detail — the clamp reads the *placed* monsters, so it
matches an **elite**. Clamping to the best non-elite instead measures **median
33**, indistinguishable from no clamp at all, because after the ogre mage fix
the bosses already beat every unmodified creature on their floors. So the whole
cost is bosses being pulled up to the top of the elite distribution, on a floor
every third level. It is a deliberate design choice and not a tuning error, but
know which of the two readings is in force before blaming a dial.

**Do not treat a number in the twenties as a shortfall on its own.** CLAUDE.md
carried an intended 30–40 for a long time on a harness that was under-gearing
the party, which kept inviting sessions to retune a curve that was working.

**And the number now reads 8–9, which is a decision rather than a bug.** It was
bisected commit by commit against the same harness, so only the game changes:

| after | median |
|---|---|
| before the weapons/armour/trinket expansion | **33** |
| after it | **21** |
| after `depthAtkBonus` was recut to `min(20, depth−1)` | **8** |

Isolated on the current build, the attack curve is nearly the whole of the
second drop: restoring the old `⌊(depth−1)/2.5⌋` measures **19**, while
restoring the halved ration faucet alone measures **9**. Softer slopes were
measured too — 0.75/floor gives 11, 0.6 and 0.5 both give 14.

**The curve was left as it is on purpose.** The judgement is that the harness
understates the party badly enough that the absolute figure cannot carry a
retune: it still ignores wands and scrolls entirely, non-healing potions and
ranged weapons, and flattens casters to `level × 1.4` — and monsters landing
blows far more often is exactly the axis a party's unused consumables answer.
So **do not chase this median**, and do not read the first drop as proof the
gear expansion was wrong either; adding item kinds dilutes the loot table, so
some of that 33 → 21 is the harness finding fewer slot upgrades rather than the
party being poorer. What the table is good for is *relative* checks — run it
before and after your own change and compare the two, which is the only way it
has ever been trustworthy.

No *content* pass has moved it, and each was checked the same way: removing
coffin and ossuary fights from the simulation leaves the median unchanged,
and so does skipping every ambush.

**Run the descent after adding a roster, not just the threat ratios.** The
myconids measured 0.69–1.35 of their per-monster share — a clean roster by
every static check — and still walled the descent at depth 16, because
`speed` had been read as a rate instead of a cooldown (see *Adding a
monster*). The budget cannot see a creature that simply moves faster than
the party can retreat; only the simulation can.

### Adding a roster moves the budget for everybody

This is the mechanism behind the whole drift in the table above, and it is
easy to miss because it is not a bug in anything.

`rawBudget` is the pool's **weighted mean** threat times `targetCount`:

```js
for(const [k,w] of pool){tw+=w;ts+=w*threatOf(k,depth);}
return (ts/tw)*targetCount(depth)*early;
```

So **any creature banded above the pool's mean at a given depth raises the
budget at that depth — for every roster on it**. The sewers roster was
written with a CR 3 ooze and a CR 4 cutthroat banded from depth 5, which is
inside the Sewers' own block (4–6) where the pool mean is 17. They sat at
2.3× and 3.2× that mean, lifted the depth 4–6 budget by 38%, and took the
descent from median 28 to 26 before a single deep creature was involved.
Both were rebuilt as CR 1–2.

Two rules fall out of it, and neither is the ratio-to-share guideline:

- **Check the pool mean at the depths a new band actually covers**, not just
  the ratio at the band centre. Share is roughly the mean, so 2–3× share
  at a shallow depth is 2–3× the mean, and four such creatures move it.
- **A themed roster's *mean* ratio matters more than any one creature's**,
  because that roster is now *every* body on its own floor. The sewers' deep
  four averaged 1.20× share and put a depth-26 floor 22% over budget against
  a 12% baseline; trimmed to a mean of 1.0 it came back.

Also worth knowing: **`poolCeiling` is a separate trap in the same area.**
It reads the single heaviest creature a depth allows, so a new roster's top
creature out-weighing the incumbent top creature lifts the cap the budget
is allowed to grow into. The black pudding did that at depth 23 (822 against
the myconid elder's 714) and was sized down for it.

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

## Sprites are lit now

`THREE.Sprite` uses `SpriteMaterial`, which **ignores every light in the scene**.
For a long time that meant a creature ten tiles down a corridor was exactly as
bright as one standing in the party's torchlight, while the wall beside it fell
off to black — which is what made monsters read as stickers pasted onto the
picture rather than things standing in the room.

A sprite has no normal to shade with, so the whole billboard is shaded at once:
`lightAt(x,y,z)` evaluates the ambient, the torch and the short-range fill at the
sprite's own position, and the result is multiplied into `material.color`.

**Two call sites, and the split is not optional.** `shadeSprites()` runs from the
render loop after the torch is positioned, and handles **floor items only**.
Monsters are shaded at the end of `updateSprites` in `07_game.js`, because that
function runs *later in the same frame* and writes `material.color` itself — it
carries the bloodied tint (green and blue drain as hit points fall) and the
sleeping tint. Anything the render loop wrote for a monster would simply be
overwritten a moment later, silently. That is exactly what happened on the first
attempt: the shading looked like it worked, and the apparent difference between
two screenshots was the torch flicker between captures. **Pin
`R3.torch.intensity` before comparing frames.**

What monsters had before was not nothing, but it was invented:
`clamp(1.5/(1+0.55*d), 0.22, 1)` — flat next to the real falloff, pure
greyscale, floored at 0.22, and static. The visible win is less the falloff than
the **colour temperature**: a creature now carries the torch's warmth and guts
with its flicker, so it belongs to the same room as the stone.

The falloff is three.js r128's own non-physical point attenuation,
`clamp(1 - d/range, 0, 1) ^ decay`, so a sprite dims on exactly the curve the
stonework around it does — including the flicker, since it reads
`light.intensity` live.

Two constants, and both are needed:

- **`SPRITE_GAIN` (0.55).** This shades a flat billboard as though it were a
  white surface square-on to the light, which is the brightest any real surface
  could be. Left at 1 the sum clamps to full out to about four tiles and nothing
  visibly falls off at all. The walls do not have that problem because they are
  Lambert shaded, mostly oblique, and painted well under white.
- **`SPRITE_FLOOR` (0.13).** The one deliberate untruth: past the torch's reach a
  creature would otherwise go pure black, and a monster you cannot see at all is
  worse than one you can barely make out. It keeps a silhouette.

Known limitation, worth fixing before adding more shading: the tint multiplies
the *whole* map, so self-luminous parts dim with everything else — glowing eyes,
the `windup` aura, an elite's aura. Splitting the emissive parts out as a second
additive sprite is the fix, and the `sharp` layer is the natural seam.

## Sprite modelling: rim, contact shadow, eye glow

Three things sit on top of the flat art, all of them in the wrapper rather than
in any individual creature, so all 78 get them at once.

- **Rim light** (`rimF`, applied to the composed `parts` group). Offset the
  sprite's own alpha away from the light, subtract it from the original, and the
  crescent that remains is a lit edge. One filter, no duplicated geometry, and it
  follows internal gaps as well as the outer silhouette. **It was tuned down
  twice**: at 0.5 opacity over a 1.5/1.7 offset every creature wore a thick pale
  band, the art lost its contrast and the bestiary went soft and bright. It is
  0.9/1.1 at 0.22 now — a rim light should be noticed without being looked at.
- **Contact occlusion** (`occF` + `silF`). The three layers are drawn
  independently and land on each other with nothing to say they touch. This lays
  a soft dark blot of the head and arm onto the **base only**, masked to the
  base's silhouette so it never spills onto the background and the outline stays
  exactly as authored. Head and arm share **one** filter pass, not one each.
- **Ground shadow** (`addMonsterShadow`). A quad lying flat in the room rather
  than an ellipse painted at the bottom of the billboard — it takes the same
  perspective the flagstones do. The pool stays **under** the feet and only the
  tail leans away from the torch: offsetting the whole thing is what a light at
  the eye would really do, and it puts the shadow entirely behind the creature
  where its own sprite hides it. Geometrically right and invisible. The contact
  patch is the part that grounds it.
- **Eye glow** (`addMonsterGlow`). A second, additive sprite riding at the head,
  tinted with the creature's own `o.eye` and deliberately **not** shaded, because
  shading multiplies the map and put a creature's eyes out at exactly the range
  where they should be the only thing visible. Given only to creatures whose art
  actually calls `gEye` (detected as `url(#ec)` in the sharp layer), so oozes and
  fungi do not light up. Placed from `o.hp`, the head pivot, which is in the
  art's own 64-unit space and maps straight onto the sprite quad.

**Filters are the expensive half of rasterising a frame, and it is paid on the
main thread during play.** Measured over 36 frames at 384px: 11.3ms plain,
+5.9ms for the contact shadow, +7.4ms for the rim, 24.6ms for both. That lands
as a stutter the first time a creature winds up, which is the worst possible
moment — so `prewarmMonsterFrames` rasterises all six poses of every kind on a
floor while the level is being built, where a hitch is expected. The texture
cache is global and keyed by kind, so it is paid once per creature type per run.
Anything new added to the wrapper should be measured the same way, and note that
timing `drawImage` alone measures nothing: the rasterisation happens during the
image *decode*, so time from setting `src` to `onload`.

## The detail pass and `MONSTER_DETAIL`

The bestiary averaged about **16 drawing primitives a creature**, which is thin
for art meant to read as detailed — 40–80 is the range that does. Rather than
hand-surgery on 78 sprite strings, detail is written once as a vocabulary of
reusable pieces (`kitHumanoid`, `faceDetail`, `plateBands`, `hideDetail`,
`oozeDetail`, `fungalDetail`) and applied through **`MONSTER_DETAIL`**, a table
keyed by `spr`. `monsterSVG` appends each entry into the layer it names, so it
inherits that layer's transform and roughness pass and **the authored
silhouettes and pivots are never touched**. `base` draws over the torso and
under the arm; `head` rides with the head and nods with it.

Everything is placed off **`o.hp`, the head pivot**, which sits at the neck. It
is the one landmark every humanoid shares, so "a belt at `hp + 16`" lands
correctly on creatures of very different proportions without a coordinate table
per creature. Anything random is seeded, because a frame that reshuffles between
poses flickers.

**All 78 creatures are covered**: 75 carry a `MONSTER_DETAIL` entry, and the
goblin, orc and hobgoblin are detailed **inline in their own entries** instead
and are deliberately absent from the table.

`boneDetail` — ribs, sternum and joint shading, kept low-contrast because the
creatures are already pale — came in with the deep tier.

Per-material shading (`metalSheen`, `clothFolds` — a hard narrow specular for
plate, broad soft folds for cloth, through this same table) was also tried and
**removed**. The gap it addressed is real: `bodyGrad` gives every creature one
radial ramp, so steel, cloth and bone catch the light identically. It cost
nothing at raster time. It was simply not wanted.

A strand-based hair generator was tried on the drow and **removed**: it did make
the hair read as locks rather than as a moulded shell, but it was not wanted.
Note if anyone revisits it that hair is read from the separations BETWEEN locks
rather than from its outline, that a drow's face is a cut-out in the middle of
the hair mass (so a fan of strands from the crown sweeps across the face), and
that the drop wanted is to the hairline, not to the chin.

Two things learned by looking rather than reasoning:

- **A strap has to be narrow and dark-edged.** The first `kitHumanoid` used a
  third of the torso width in a mid-brown; after the roughness displacement that
  read as a pale smear across the belly of every large creature — worst on the
  gnoll, minotaur and ogre. Thin, dark, with one lit edge and a small boss is
  what makes leather look like leather.
- **Gills hang from the rim of a cap and follow its curve.** Drawn as a straight
  row of verticals they landed across the middle of the cap and read as a row of
  teeth on the shrieker and the myconid guard.

**Detail is geometry rather than filters, and geometry is close to free here.**
Measured back-to-back on one machine: the build before any detail 48.1ms, after
the whole shallow tier 46.5ms, and with all 78 detailed 46.8ms — i.e. no
measurable cost at all. The expensive half is the filters.

**Do not compare raster timings taken at different points in a session.** An
earlier reading of this had detail climbing 24.6 → 25.7 → 31.1ms and concluded
it was getting expensive; re-measuring those same commits later gave 48.1, 46.5
and 46.8. The machine had slowed under load, and the "trend" was entirely that.
Any timing claim here has to come from checking out both builds and measuring
them one after the other.

`prewarmMonsterFrames` still spreads the work: `idle0` is forced up front and
the other five poses drain a couple at a time through `requestIdleCallback`,
which is worth doing regardless of the absolute number because the filters
genuinely cost tens of milliseconds a frame. Anything the player reaches before
its turn comes up still rasterises lazily on first use, exactly as it always did. Check two things when
adding more — that it reads at the size it is actually seen (an in-game capture
at two tiles, not just a large sheet), and that no stroke leaves the 64-unit
viewBox. Note when checking the latter that `hideDetail` emits relative
linetos (`l dx dy`), so a naive coordinate scan reports false positives.

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

   Six poses exist — `idle0/idle1`, `walk0/walk1`, `windup`, `strike` — and
   `poseXf` moves the whole body in every one of them, so walking and the
   telegraph work for any creature regardless of layers. What the layers add is
   the part that reads: `headXf` bobs and nods the `|H|` layer, `armXf` hauls
   the `|A|` layer back and drives it through. **`windup` also flares an
   eye-coloured aura**, which is the telegraph a layerless creature would still
   get. T51 asserts all of it, including that no pose renders identically to
   `idle0` and that all six attack paths (`monsterMelee`, `monsterShoot`,
   `monsterCast`, `bossSummon`, `bossBarrage`, `bossSweep`) call `windupAnim`.

   **A pivot left at `[0,0]` is worse than no layer**: the part rotates about
   the canvas corner and flies off screen. The kobold carried `ap:[0,0]` for
   exactly as long as it had no arm to swing.

   **One layer is the requirement, not both.** A rat, a spider, a kobold
   and an ooze have no arm to swing — they strike with the head, and the
   head layer plus the `sharp` pose is the whole telegraph. Six creatures
   carry a head layer and no arm for exactly that reason, and nothing in
   the bestiary is fully static. A test that demands `|A|` of a quadruped
   is wrong about anatomy rather than finding a gap.
4. **Sprite scale** — `addMonsterSprite` has a hardcoded list of large
   creatures that render bigger. Add to it if the new creature is big.

Then check the knock-on effects: `threatOf` must score it sensibly (a
creature whose danger is not captured by hp/damage/attack will be
mis-placed by the budget), and if it is a caster give `caster.elem` one
of the `ELEMENTS` keys so elemental wards can resist it.

## Sneak attack: unaware, asleep, or flat-footed

`canSneak(ch,m)` is the whole rule — `!m.awake || m.sleep || !m.acted`. A rogue
adds its dice against a creature that has not noticed the party, one put out by
the `sleep` spell, and one that has noticed but **has not yet struck back**.
Against nothing else: a monster busy swinging at another character does not
qualify, and neither does one physically held, because a pinned creature still
sees the knife coming. Both of those clauses used to exist and were deliberately
removed.

The third clause is 3.5's flat-footed, and it is what makes the ability fire at
all. Awareness alone could not carry it: `updateMonsters` wakes anything within
two steps whether or not it can see, so a creature a rogue can reach in melee is
awake **by definition** — walking a party up to a monster on 176 generated
floors, the target had noticed them every single time and the dice never landed
once. Measured the same way with the flat-footed clause, the rogue opens with
sneak attack on **85% of approaches** (162 sampled).

`m.acted` is set in the six monster attack paths (`monsterMelee`,
`monsterShoot`, `monsterCast`, `bossSummon`, `bossBarrage`, `bossSweep`),
immediately before `windupAnim` — **not inside `windupAnim`**, which early-returns
when the creature has no sprite. Noticing the party is not acting, and neither
is walking towards them; only committing to a blow is.

The flag is never reset, and does not need to be: a monster that loses the party
goes back to `!m.awake`, which makes it sneakable again through the first clause.

T54 asserts the truth table, that all six paths set the flag, and the two-step
waking rule alongside it, so the day one changes the other is re-examined with it.

## What wakes a sleeping monster

Two things, and they are deliberately different shapes.

**Sight** — `sightClear` from the monster to the party — wakes it at whatever
range the line reaches, with no distance cap of its own. There used to be one
at seven steps.

`sightClear` is a **true line**, not `losClear`. The two answer different
questions and both are still used:

- `losClear` is straight-line only, same row or column. That is the right
  test for **shooting**, because a bolt travels a lane, and every attack site
  still uses it.
- `sightClear` walks the real line between two tiles and is the right test
  for **noticing** — waking, losing interest, a guard's leash, and whether an
  undead can be shown a holy symbol.

Where the line steps diagonally `sightClear` also refuses to thread the seam
between two corners: at least one of the two tiles it passes between has to
be open. Without that, a monster sees through a solid diagonal wall, which is
the classic way this goes wrong.

Range is bounded by the caller rather than by a constant — the wake check
needs a distance-field entry and that field stops at 22 steps, so nothing
notices the party across a cavern it would take half a minute to walk.

Measured on depth-14 floors, monsters already awake when a fight starts:
2.42 with the old row-or-column test, **2.85** with a true line. Modest,
because dungeon floors are mostly corridors and small rooms where a diagonal
is blocked anyway — the change shows up in open caves and halls.

Within **two steps** a monster wakes regardless of the sight line; that close
it hears and smells the party.

**Noise** — `combatNoise(x,y,r)` with `COMBAT_NOISE` at 5 — is the one that
matters, and it is a **flood fill, not a radius**. Sound rounds corners and
does not pass through stone, so a monster five steps away down a passage hears
a fight and one three tiles away through a wall does not. Closed doors stop
it, on the same terms the party's own distance field uses. It fires from
`damageMonster` and from `hurtChar`, so a blow taken is as loud as one dealt,
and it early-outs when nothing on the floor is still asleep, because the fill
is pure waste then. Measured: 2.33 awake before a blow lands, 3.43 after.

Neither shows up in the descent simulation — `fightPack` has no approach
phase and wakes nothing — so this class of change is measured on a real
`updateMonsters` loop. T53 does it.

Two constants in `07_game.js` scale what a definition's `speed` actually
buys, and both are applied at use rather than baked into the data:
`MOVE_RATE` (1.25) divides every movement cooldown — chasing, wandering and
routed alike, so a creature does not sprint at the party and then amble the
moment it loses them — and `ENGAGE_CD` (0.5) clamps `atkCd`/`castCd` on the
tick a monster comes into range. That clamp is **`Math.min`, never
assignment**: an ambusher's 0.15 and a vanished shadowblade's 0.2 are
already shorter and must stay so. It also fires on *entering* range rather
than every tick, or nothing would ever have a cadence.

Measured from ten tiles out to the first blow landing: 13.4s with neither,
11.5s with the movement rate alone, 11.4s with the clamp alone, **9.5s with
both** — and the spread collapses from 2.8s to 0.95s, because the random
1.5–3.5s `atkCd` a monster is built with no longer leaks into its first
swing. Note the **descent simulation cannot see either dial**: `fightPack`
resolves packs to the death with no approach phase, and `monsterDpr` models
output as `dmg/(speed*1.6)`, reading `speed` as an attack cadence when it is
really the movement cooldown. Anything that changes pacing has to be
measured on a real `updateMonsters` loop, which is what T52 does.

**`speed` is a movement cooldown, so lower is faster.** It is seconds
between steps: `m.moveCd = m.speed * slowMult`. The piercer, an ambusher
that cannot walk at all, is the slowest thing in the game at 2.6, and
nothing is below 1. Read the other way round it is silently catastrophic
and `threatOf` will not see it — a shrieker written as `speed:0.01`
"because it is rooted" came out a hundred times faster than anything else
in the dungeon, chased the party down on sight, and walled a simulated
descent at **depth 16** while every threat ratio still measured fine.
T45 now asserts `speed >= 1` across the whole bestiary.

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

Myconids take one flag, `myconid:true`, which is the whole of what the
grove spawn bias reads. Three optional behaviours ride on it, all in
`07_game.js`: `distress:true` (being hurt wakes myconids within 7 tiles),
`shriek:true` (screams once on seeing the party within 6 and wakes within
11), and `spores:{dc,dur,kind}` (a Fortitude save or `stunned`/`hold`,
read by `monsterSpecials` alongside the cave creatures' `gaze` and `hold`).

Drow take `drow:true` for the house spawn bias, and two innate powers read by
`monsterSpecials`: `drowpoison:{dc,dur}` (a Fortitude save or `sleep` — the
worst thing in the game to fail, since `canAct` and `charAC` both read it) and
`faerie:{dc,dur}` (a Reflex save or the `faerie` condition).

**`faerie` is the one condition only `charAC` reads**, and that is deliberate
rather than the badge-that-blocks-nothing mistake described above: faerie fire
outlines you in cold light, which costs you your cover and nothing else. It is
−2 AC, not the −4 a helpless character takes, and `canAct` ignores it.

Note that an **elf shrugs drow poison off entirely** — `addCond` refuses `sleep`
outright for a sleep-immune race. That is the engine's rule and not 3.5's, and
it is left alone: the drow's own kin being proof against the drow's signature
weapon is a better story than the errata.

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
  field `cave:true` creatures and nothing else (see *A theme fields its own
  roster*), and carry an array of **ambushers** in `L.lurkers`.
- **`Crypt`** — the most machinery of the three. Wall furniture in
  `L.crypts` (burial nooks with an anthropoid sarcophagus, a stacked pair,
  a 3×3 grid of inscribed tomb plaques, a candle on an iron bracket, an
  empty recess); an ossuary chamber in `L.ossuary` with bone-stacked walls
  and a blocking bier; non-blocking floor dressing; and a floor that fields
  the undead and nobody else. `openCoffin` filters to `type:'undead'` on its
  own account rather than leaning on the theme, because a coffin holds a
  corpse whatever floor it is standing on.

- **`Duergar`** — halls, not caves: the highest `roomBias` of any theme,
  because they are built. Eight wall variants over one shared base that
  carries the courses, the gold fillets and the channel the inscription
  runs in — a band on only some variants would stop dead at a tile join,
  so only the runes inside it vary. Runes are Dethek, which is chiselled
  and so has no curves. Polished slab floor, stone doors, and wall
  furniture in `L.duergar`: engaged fluted half-columns, and torches whose
  point light is registered in `R3.candleFlames` (the flicker loop reads
  each flame's own `base` intensity, so a wall torch is not a candle).

- **`Myconid`** — a grove that grew rather than one that was built, and the
  only theme that replaces the **ceiling** as well as the walls and floor:
  `myconidCeilCanvas` draws the gilled underside of the caps overhead,
  `myconidWallCanvas` gives six stalk variants over one shared base, and the
  floor is gravel. The light is purple — `THEMES` carries `light` and `fill`
  for it, and `buildLevel` tints `R3.torch` from `th.light`, so a theme can
  now recolour the party's own lantern. Doors are dried stalks, roughly cut
  and bolted. A floor of `myconid:true` creatures and nothing else.

  The stalks are drawn by sampling a wandering edge every 4 pixels with a
  per-stalk phase. At 16 the kinks landed at the same height in every stalk
  and the wall read as a bamboo fence.

- **`Drow`** — a house, and the only theme whose decoration gives off light.
  Small black bricks (eight courses of six, with a one-pixel draft rather than
  the duergar's five, which at this size would swallow the brick) and a thin
  frieze channel cut through the third course of the shared base, so a wall
  reads as one running inscription rather than a repeated stamp; eight variants
  change only what is written in it.

  The script is **Espruar**, which is written with a pen and so is the exact
  inverse of Dethek: not a straight stroke anywhere. A glyph is a leaning
  S-spine with a bowl hung off one side and a flourish or a closed loop off the
  other.

  **The theme carries two palettes and they are not interchangeable.** `frieze`
  is the single violet that *all drow script* burns in — the wall inscription
  and the glyph on a gate. It used to cycle `th.glyphs` per variant, which made
  one running text read as eight separate decorations. `glyphs` is now the
  glazing only, and stays three colours, because a rose window is stained glass
  and is meant to be varied. T46 asserts both.

  **`drowWallCanvas` is the only wall builder that returns a pair**, `{cv,glow}`
  — the stone, and a black sheet carrying only the burning parts — and
  `buildLevel` wires the second up as `emissiveMap`. A colour map can only make
  something *pale* in torchlight; light of its own needs an emissive map, and
  that is the whole point of faerzress. Everything else in `buildLevel` treats
  a builder's return value as a canvas, so the branch keys off `built.glow`.

  Also: wrought-iron gates that you can see through (they take the sewer
  grate's `alphaTest` path — `grate` in `buildLevel` is now "Sewers or Drow"),
  rose windows in `L.drow` glazed from `th.glyphs`, and occasional stalactites
  seeded from tile coordinates like the cave gems, so they need no save data.

  Four things that had to be seen rather than reasoned about:

  - **Do not retint the torch.** The grove's trick turns black brick lilac. The
    colour in a drow house comes from the things that are burning, so `light`
    and `fill` here are a cold near-white.
  - **Brick faces at −0.06 read light grey at torch range.** "Black brick" has
    to survive being stood next to, not only being seen down a corridor; they
    sit at −0.20/−0.27.
  - **Lit glass adds the torch to its own colour and a violet pane comes out
    white.** The glass is a source, not a surface: `MeshBasicMaterial`. The
    lead tracery has to stay matte for the same reason.
  - **A stalactite handed `ceilTex` directly gets a flat wash.** `repeat` lives
    on the texture, not the material, and `ceilTex` carries `(L.w, L.h)` for
    the one big ceiling plane. It needs a clone with `repeat` back at 1.
  - **Painting the emissive map is a second, separate job.** `em` is its own
    canvas, so anything drawn over the frieze on the colour map does *not* hide
    the frieze's light: the first pilaster had the inscription burning straight
    through the column. Whatever covers the frieze band has to punch `em` black
    at the same three `wrapX` offsets — and **fade rather than cut**, because a
    glyph clipped mid-stroke leaves a bright vertical sliver just outside the
    punched rectangle.
  - **A thing that stands out of a wall is read by its body, not its highlight.**
    The `variant%4===1` pilaster was two silver hairlines eight pixels apart with
    no shaft between them, no capital and no plinth, run full height straight
    through the frieze. It read as two stray scratches in the texture — which is
    exactly how it was reported. It needs a shaded shaft, a shadow thrown onto
    the brick beside it, mouldings top and bottom, and the frieze stopping at it.

Search for `theme.name==='Sewers'`, `th.name==='Crypt'`, `th.name==='Caves'`,
`th.name==='Duergar'`, `th.name==='Myconid'` and `th.name==='Drow'`
(plus the `cave`/`duer`/`myco`/`drow` flags in `buildLevel`) to find every hook
before adding a seventh such theme.

**Appending a theme moves which depth is which theme**, which broke seven
tests that had depths hardcoded. They now ask by name — `depthOf(name)` and
`depthsOf(name)` in the harness — so the next theme will not break them.
Two statistical checks were also sitting near their tolerances and had to
be widened rather than relaxed (T22's packing, T29's crypt undead share);
the crypt's share genuinely falls with each roster added, because each one
widened the off-theme draw the bias had to beat. Both are exact now — a
theme fields its own roster and nothing else — so they assert 100% and 0%
rather than a band, and cannot drift as rosters are added.

Each theme with machinery writes an array onto the level (`rivers`/`pipes`,
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

- **`BOSS_TABLE`** — bosses, keyed by theme and then by tier. **A boss belongs
  to the floor it caps.** Boss floors are every third level from depth 6, and
  because themes cycle every three floors the theme of a boss floor walks
  Sewers, Crypt, Caves, Duergar, Myconid, Drow, Dungeon and starts over 21
  depths later. `bossSlot(depth)` returns that theme and the tier — how many of
  that theme's boss floors have already been passed.

  Depth 3 is exempt. On floor 3 the party is still level 1 — 32 hit points
  between four of them, a 3-hp wizard — against a boss carrying 2.5× hp and
  **+2 AC**, which at that attack bonus is unhittable rather than hard. A
  simulated descent walled there at 99%. That exemption is why the Dungeon's
  own first boss floor is 24 rather than 3.

  **A slot holds a list, and one entry is drawn at random per floor**, so a
  boss floor is not the same fight every run. The price is a stricter
  invariant: every candidate in a slot must out-threat *every* candidate in
  the slot three floors above it, because any pair can come up together. T21
  checks the table pairwise rather than checking a median.

  Three places must agree on the cadence: `isBossLevel` in `tryGen`, the `/3`
  in `bossSlot`, and the ⚔ in `refreshDepthTag`.

  The arc was **solved against the bestiary rather than asserted**: the table
  was first filled entirely from creatures that already existed, and only then
  were five written for the slots where no creature both fitted the window and
  read as that faction's ruler — a wererat guildmaster and guild lord, a
  duergar thane, a hobgoblin warlord and a fire giant king. Each was sized to
  its window *before* a line of the table moved. Depth 45 is the one slot that
  had no arithmetic answer at all: the stone giant tops out at 4158 against the
  drider's 4182 three floors above.

  Four slots carry two candidates — depths 6, 9, 12 and 24, all of them inside
  a normal run — so the boss floors a player actually reaches are the ones that
  vary. T50 asserts they genuinely draw differently rather than merely being
  allowed to.

  **A boss-only creature with no slot is dead content.** When the table
  replaced the old flat list the myconid sovereign fell out of it entirely —
  she scored 6057 at depth 39 against a window of 3253–4182. Being boss-only
  is exactly what makes the numbers free to move, so she was resized into the
  slot rather than dropped. Check this whenever the table changes.

  Past the last written tier a theme's deepest ruler returns, titled by the
  circle it belongs to. Nothing reaches that in practice — no simulated run
  has passed depth 31 — but a boss floor must always have something on it.

  A returning boss's **hit points come from `BOSS_BASE_HP`, the table's own
  mean, not from the creature named.** A wererat base is a fraction of a
  lich's, so raw base hp made a deep boss weaker than the one three floors
  above it. The creature still decides how the fight goes — its damage, its
  reach, whether it casts — but its weight class comes from the depth.

  **Attack is guaranteed, not inherited — and the guarantee runs last.**
  A boss takes its creature's attack plus a flat `+2`, and `threatOf` multiplies
  hp, damage and attack together, so a boss can clear its threat window
  comfortably on bulk and spells while being out-swung by the mooks around it.
  Sinshara of the Veil did: the ogre mage carried `atk:7`, the lowest in the
  whole Dungeon roster, so her depth-24 boss came out at **+18 on a floor where
  the ordinary stone giant swings at +22**. Since AC climbs faster than the
  party's attack by design, being short there is the difference between a fight
  and a formality.

  So the last thing `tryGen` does is raise the boss's attack to the best on its
  own floor. Two reasons it has to be *there* and read the **placed monsters**
  rather than the pool:

  - `makeElite` adds attack, so a floor can field an elite that out-swings every
    unmodified creature the depth allows. Reading the pool left ten of the
    fourteen bosses short.
  - The **ossuary guardian is placed after the boss**, and it is an elite undead
    — it out-swung the crypt bosses by up to four even after the pool fix.

  The ogre mage was also fixed at the source (`atk:11`, seating it between the
  war priest and the ettin), because a creature that cannot hit is wrong whether
  or not it is wearing a boss's name that day. T50 generates 364 boss floors and
  fails if anything standing on one out-swings the boss.

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

## Spell effects are shaped

Every offensive spell used to be one glowing blob (`fxGlowTex`) flying to the
first foe plus up to nine identical bursts on the footprint — a fireball and
cloudkill differed only in hex colour. Effects are now dispatched through three
tables at the cast site in `07_game.js`, and a spell in none of them keeps the
legacy blob-and-bursts:

- **`SPELL_PROJ`** — how the bolt travels, where there is one: the fireball's
  bead, cloudkill's rolling fog bank (slow on purpose — the book has the cloud
  reach you before it kills you, so damage still resolves on arrival), the acid
  arrow. Options: texture, scale, speed, tint, riding light (`lite`/`liteI` —
  per-spell strength, a bead lights the corridor and an arrow only glimmers),
  `spin`, `rot`, a `trail` of additive puffs, and `delay` for volleys. Magic
  missile is its own block above the table: N staggered darts, one damage roll,
  landed with the last.
- **`SPELL_INSTANT`** — spells with no projectile at all: the bolt, both cones,
  ice storm, flame strike, the three rays. These resolve at the word of command.
- **`SPELL_IMPACT`** — the shaped impact itself, keyed like `SPELL_FX`,
  called with `(at, areaTiles, color, foes, casterLevel)`.

**Every foe-targeted spell now has a bespoke impact**, not just the area
blasts. The single-target damage spells route through `SPELL_INSTANT` +
`SPELL_IMPACT` too: burning hands is a screen-space fire fan (`firefan2d`,
sharing the cold cone's wedge geometry), flaming sphere a low spinning
projectile that *rolls* to the foe's feet (its own cast block, distinct from
the fireball bead), enervation/slay-living/vampiric-touch build on the ray and
converging-`shard` machinery, sound burst is expanding `rings2d` shells, and
phantasmal killer looms `fxPhantomTex` up off the floor via the `phantom` kind.
The control spells (sleep, web, hold, slow, doom, dispel) are shaped the same
way — web is `fxWebTex` on a `decal` kind, hold is converging gold `shard`s,
slow reuses `rings2d` (now colour-parametrised), the rest are tinted
`shard`/`mist`/`flash`.

**Friendly spells have no target sprite** — the party is the camera — so they
wash the whole view instead. `friendlyFx(sp)` (called from `castSpell`'s
self/ally/allies branches) classifies by the spell's own fields
(`healFn`/`raise`/`buff` shape) and picks a `flourish2d` overlay: a green heal
bloom, a cool cleanse shimmer, a gold blessing (cyan for haste), an edge-dome
ward, or a golden raise radiance — each paired with a party-position light
flash. `spawnPartyFlash` guards on `R3.camera` so the node harness is safe, and
the capture rig overrides `UI.pickAlly` to auto-resolve ally-targeted casts.

**The screen-space rule, paid for three times before it was learned:** any
shape that extends away from the first-person camera — the bolt's lane, a
cone's wedge, a ray's beam — must be drawn as a 2D overlay (`fx2dBegin`, a
canvas inside `#view-wrap`, positions via `projectToScreen`). A world-space
ribbon down the lane is seen almost end-on: its whole length projects into a
few dozen pixels and any geometry there sums under additive blending into one
white wad. Corollaries learned on the way: sprite quads write depth across
their transparent margins (monster sprites now carry `alphaTest:0.08` so
effects behind them stop getting rectangular holes; the bolt also sets
`depthTest:false`), and billboarded polylines need rung-continuity or they
twist into bowties. One overlay effect draws per frame — each clears the shared
canvas — which holds because only the party casts overlay spells.

**`R3.fxLight` is one PointLight parked in the scene at intensity 0**, moved
and driven by `flash` fx and riding projectiles. It must never be added or
removed at runtime: three.js compiles materials against the light count, and a
transient light recompiles every shader mid-fight. It is also a term in
`lightAt`, so monsters are lit by the spell striking them — without that a
fireball lit the stonework while the creatures inside it stayed dark.

Anything near the camera must scale down: constant world-size trail puffs and
darts balloon at the muzzle (the wake scales by distance from the eye; the
missile volley launches from most of a tile ahead). The party's arrows —
bow, crossbow, acid arrow — fly upright, tip up and fletching down, because a
horizontal arrow receding from the eye reads as a sideways smudge.

Every fx kind must terminate cleanly under one big `updateFx(10)` step — the
node tests land spells that way — and a negative `t` is the scheduling idiom
(staggered flames, hail with its splash timed to the landing, volley delays).

The capture harness is `shots/spellfx.js` (+`stitchfx.js`): it casts in a
deterministic arena, pauses the game the same tick, steps `updateFx` by hand,
and detects the impact rather than guessing flight time. It picks the cleric
for divine spells — a wizard refuses them silently, and flame strike once
photographed four frames of nothing — and prints CAST REFUSED when a cast does
not happen.

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

**A monster picks its mark one of two ways, and which one depends on whether
it is standing in a line or standing alone.** `pickPartyTarget` branches on
`monstersOn(m.x,m.y).length>1`, and the split is deliberate rather than a
special case: `rankOffset` only spreads a tile's occupants apart once there
are two of them, so a line has visible sides and a lone creature does not.

**In a line** (a tile holding several monsters) both sides pair up by
position: a character on the left of the formation meets the monster on the
left of the line, and that monster swings back at them. `SIDE_L`/`SIDE_R`,
`monsterSide`, `charSide`, `charOnSide` and `facingMonsterAt` hold all of it,
and the rank and lane rules below apply.

**Alone**, a monster holds the centre of its tile and so has no file to meet.
It takes one of the two characters **facing** it at random — a fresh roll for
every blow, so the front rank shares the punishment instead of one file
soaking it — and reaches past to the **back rank**, again at random, only once
both of the front two are down. That is what keeps the casters alive behind
the line. It applies to a lone archer and a lone caster exactly as it does to
a lone brute, because every path runs through the one function.

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

Rank matches too, **in the line case**. The two formations face each other
square on, so `pickPartyTarget` reaches for the same side **and** the same
rank: a front-rank monster meets the party's front rank, and a back-rank
monster (which needs reach to swing at all) goes for the party's back rank.
Every way a monster reaches the party runs through that one function — melee,
shots, and a caster's bolt.

In the line case a character holds their place only while they can fight for
it. Down, or
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

## A theme fields its own roster and nothing else

`themedPool(depth)` is the whole rule, and `THEME_FLAG` is the one place a
theme's membership is defined. A floor draws only from creatures that belong
to the theme standing on it. Undead are `type:'undead'` — the same test Turn
Undead and the loot faucets use — and the other six carry a boolean on the
definition (`cave`, `duergar`, `myconid`, `drow`, `sewers`, `dungeon`).

This replaced a weighting: a theme's own creatures were multiplied by 4 and
everybody else's by an `OFF` of 0.35, so floors ran 48–94% their own theme
with the rest wandering through. `OFF` had to be re-tuned every time a roster
was added, because a single ×4 competes against every foreign roster at once.
That whole mechanism is gone — with it the seven bias constants in `tryGen`,
`openCoffin`'s separate off-weight, and the tuning treadmill.

Three consequences, all measured, none of them a bug to be fixed later:

- **Every creature must belong to a roster.** An unflagged creature used to
  spawn everywhere at weight 1; now it is never placed at all. `ogre` was the
  last unflagged one and is `cave:true` now, banded 6–12 so it covers the
  Caves block at 10–12 rather than only touching its first floor. T55 fails
  if any banded creature is an orphan.
- **A roster must reach every floor its theme owns.** `spawnPool` never drops
  a creature once its band opens — past it, it lingers at a floor of 0.05 —
  so this can only fail below a roster's shallowest debut. The duergar own
  13–15 and only two of their six debuted before 14, which made those three
  floors a two-creature floor repeated; the shadowblade and stonepriest were
  pulled forward to 12 and 14. T55 asserts three kinds minimum on all 60
  floors of every theme.
- **Variety per floor is the price.** A floor drew on 5–16 distinct kinds
  when four foreign rosters were thinned into it, and fields 3.9–6.8 of its
  own now. That is the trade, and the bar in the tests moved from "8 kinds"
  to "not one creature repeated".

**The count now gives way where the roster cannot match the budget.** The
whole bestiary always held something cheap enough to pad a floor out; one
roster does not. Depth 12 is a cave whose lightest creature scores 48, depth
13 opens the duergar block where the lightest thing alive is 155 against a
per-monster share of 60 — that floor was placing twenty bodies for **three
times its budget**. So `nMon` is now `min(targetCount, budget / lightest)`,
floored at `COUNT_MIN_FRAC` (0.55) of the target so a heavy roster cannot
empty a level out. Where the roster has anything near the share — most floors
— it buys more than the target and nothing changes.

**So every roster needs a creature at the price its budget wants to spend,
and that is a standing requirement rather than a one-off tuning job.** The
`lightest` term is a *minimum*, so one cheap creature fixes a roster and no
number of heavy ones will. When `depthAtkBonus` was later capped at +20 the
early slope steepened (+3 → +9 at depth 10), and because `threatOf` multiplies
attack in, a flat bonus inflates a weak creature's score proportionally far
more than a strong one's — so `lightest` climbed faster than the pool mean
that sets the budget, and `budget / lightest` fell through the floor. Caves
and Duergar were the two rosters with no cheap rung (troglodyte 58 and duergar
warrior 227 at their own depths, against kobold 2 / rat 6 / skeleton 8
elsewhere), so a depth-10 cave floor could afford ten bodies against a target
of eighteen and read as abandoned. The **stirge** and the **duergar drudge**
are that missing rung; both floors field their full target again.

Note what this means for the dials: raising `COUNT_MIN_FRAC` would have made
the count look right while leaving the floors *unfunded* — measured, depth 10
went from 53% to 105% over budget, because the floor can add bodies but cannot
conjure cheap ones. Fix the roster, not the fraction.

**`rawBudget` and `poolCeiling` deliberately still read the whole
`spawnPool`.** This was tried the other way round first and it is worse:
`threatBudget` is a *chain*, each floor clamped to a step off the one above,
so a pool that jumps every three floors lets whichever theme sits at depth 5
depress every budget below it. Measured, the party reached depth 15 two
levels short (14.1 against 16.1) because the shallow floors it had been
levelling on were lighter. The budget says how hard a depth should be; the
roster says who is on it; `nMon` reconciles them.

Two rules from building the last two rosters still apply:

- **A flag must reach a floor of its own theme.** Under the old weighting a
  flag that never reached its own theme was a pure penalty — 0.35 everywhere
  and ×4 nowhere. Under the rule it is worse than a penalty: the creature
  cannot spawn anywhere at all. That is why the bugbear's band was stretched
  to touch depth 3. T48, T49 and T55 all assert it.
- **Dungeon and Sewers are bimodal by construction.** Their blocks sit at
  1–3 / 22–24 and 4–6 / 25–27, twenty floors apart with nothing between, so
  their rosters need a shallow tier and a deep tier and nothing in the
  middle. Every other theme's two blocks are 21 floors apart too, but their
  creatures' bands are wide enough to cover both.

The one place rosters still touch each other is `rawBudget`, which is why the
warning in *Adding a roster moves the budget for everybody* is still live.
