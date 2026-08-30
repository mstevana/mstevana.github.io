# CLAUDE.md

Guidance for Claude Code (or any future editor) working in this repo.

The Scotland map that used to live here as `scotland.html` moved to its own
repository, `mstevana/scotland`, and is served from
https://mstevana.github.io/scotland/. What remains here is a redirect stub at
`scotland.html` (and `index.htm`) so older links keep working — both forward the
query string, since shared links carry the path selection in `?path=`.

The dungeon crawler that used to live here as `crawl.html` moved to its own
repository, `mstevana/crawl`, and is served from
https://mstevana.github.io/crawl/. Its working notes — the difficulty curve, the
sprite pipeline, the themes and everything learned the hard way — moved with it,
so look there before changing anything about the game. What remains here is a
redirect stub at `crawl.html` so older links, bookmarks and any home-screen
shortcut keep working; it forwards the query string and hash, and because the
new URL is on the same origin the saved game carries over untouched.

Nothing in this repository is a running page any more. Both `crawl.html` and
`scotland.html` (and `index.htm`) are redirect stubs to the repositories that
now own them. Edit those stubs only to keep the forwarding working.
