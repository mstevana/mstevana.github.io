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
