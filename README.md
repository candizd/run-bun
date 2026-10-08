# Run & Bun Field Dex

**→ [candizd.github.io/run-bun](https://candizd.github.io/run-bun/)**

A Pokédex and nuzlocke tracker for the Run & Bun romhack, generated from the
three source files in this folder. No server, no npm, no internet at runtime.

Alongside the dex, the Run screen logs an encounter per location — caught,
skipped or lost — and tallies the run as you go.

## Open it

Use the link above, or double-click **`site/index.html`** to run it straight
from disk.

Your run is stored by your own browser (`localStorage`) and never leaves it:
nothing is uploaded, and two people using the hosted site do not see each
other's runs. Clearing site data clears the run, so the Run screen also exports
it as a JSON file — that export is the real backup.

## Rebuild it

Only needed when a source file changes.

```
pip install openpyxl
python build.py
```

`build.py` reads:

| File | What it provides |
| --- | --- |
| `Learnset, Evolution Methods and Abilities.txt` | 554 Pokémon: level-up moves, abilities, evolution methods, stat changes |
| `Pokémon Locations.xlsx` | 98 locations, encounter/temp/underwater tables, Game Corner, trades, gifts, fossils, roamers, unavailable list |
| `Item Locations.xlsx` | Heart Scales, Rare Candies, evolution items, held items, berries, TMs/HMs, move tutors, Mega Stones |

and writes `site/data.js` plus `site/sprites/`. Types and sprites are downloaded
once from the PokeAPI dataset and cached in `build/.cache` and `site/sprites`.

The build prints a short report of anything the source files leave dangling.
Currently three, all genuine gaps in the sources rather than parse failures:

- Kubfu's evolution names Urshifu-Single-Strike, which has no learnset entry
- The encounter tables list Bonsly and Comfey, which have no learnset entries

## What's in the site

- **Pokédex** — every Pokémon, filtered by name, type, or whether it's catchable.
- **Pokémon page** — abilities, the evolution line (branches included), where to
  find it, and **what evolving costs**: the level-up moves an evolved form never
  learns, what it gains, and which moves shift level. A family ledger at the
  bottom lays the whole line side by side.
- **Locations** — the full encounter table per place, with rates. The four
  places whose temp table differs (Rustboro City, Route 105, Route 118,
  Meteor Falls 1F1) get a Normal/Temp toggle. Items found there are listed below.
- **Items** — one searchable table, filtered by kind and by place.
- **Extras** — Game Corner prizes, trades, gifts, fossils, roamers, and the
  Pokémon the hack leaves out.
- **Run log** — see below.

Press `/` or `Ctrl+K` anywhere to search Pokémon, moves, places and items at once.

## Run log

One row per location, in the order you reach them. Mark each place **Caught**,
**Skipped** (you can still come back) or **Lost** (it fainted or fled), record
what you got, and add a note. Clicking an active status again clears it. `↺`
resets a single location; **Start a new run** clears all 98.

The same row appears at the top of every location page, so you can log an
encounter without leaving the table you're reading. The Locations index shows a
status square per place, so you can see at a glance where you still owe an
encounter.

### Where the log is saved, and how to not lose it

It saves to this browser's `localStorage` as you type — no server involved.
That storage is shared by every local file this browser opens and **is wiped
when you clear browsing data**. Use **Export backup** to write the run to a
JSON file, and **Import backup** to load it again. Export before anything you
would hate to redo.

## Accuracy

Everything about movesets, abilities, evolution methods, encounters and items
comes from your files. **Types and sprites come from the official games** — the
hack changes some Pokémon, so treat those two as a visual aid, not as truth.
Base stats are not shown at all, because no source here has the hack's values.

## Layout

```
build.py            orchestrator
build/
  names.py          folds the three spellings of each Pokémon onto one key
  learnsets.py      parses the txt, resolves implicit evolution targets
  locations.py      parses the encounter workbook
  items.py          parses the item workbook
  pokeapi.py        vanilla types, sprites, evolution chains (cached)
site/
  index.html  styles.css  app.js
  run-store.js      the run log's localStorage layer
  views/            one file per screen
  data.js           generated
  sprites/          generated
```
