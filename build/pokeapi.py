"""Vanilla Pokemon reference data: types, sprites and evolution chains.

Run & Bun's own files carry no types and no artwork, so those come from the
PokeAPI dataset instead. The hack rewrites abilities, learnsets and evolution
methods, so anything sourced here is labelled "vanilla" in the UI.

The vanilla evolution chains are used only to *disambiguate* targets the txt
leaves implicit -- the methods themselves always come from the hack's own file.
"""

import csv
import io
import os
import urllib.request

CSV_BASE = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/"
SPRITE_BASE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/"
CSV_FILES = ["pokemon.csv", "pokemon_types.csv", "types.csv", "pokemon_species.csv"]

# Names the mechanical slug rules get wrong.
IDENTIFIER_OVERRIDES = {
    "hakomo-o": "hakamo-o",          # misspelled in the source file
    "basculin-bs": "basculin-blue-striped",
    "deerling-a": "deerling-autumn",
    "deerling-s": "deerling-summer",
    "deerling-w": "deerling-winter",
    "sawsbuck-a": "sawsbuck-autumn",
    "sawsbuck-s": "sawsbuck-summer",
    "sawsbuck-w": "sawsbuck-winter",
    "calyrex-ice-rider": "calyrex-ice",
    "calyrex-shadow-rider": "calyrex-shadow",
    "wormadam-sandy-cloak": "wormadam-sandy",
    "wormadam-trash-cloak": "wormadam-trash",
    "urshifu-rapid-strike": "urshifu-rapid-strike",
    "urshifu-single-strike": "urshifu-single-strike",
    "type-null": "type-null",
    "nidoran-f": "nidoran-f",
    "nidoran-m": "nidoran-m",
}

# Fallbacks tried in order when the plain slug is not a real PokeAPI entry.
FORM_SUFFIX_FALLBACKS = [
    "-standard", "-incarnate", "-altered", "-land", "-plant", "-ordinary",
    "-aria", "-baile", "-midday", "-red-striped", "-solo", "-disguised",
    "-average", "-amped", "-shield", "-male", "-ice", "-single-strike",
    "-red-meteor", "-full-belly", "-natural", "-zero", "-hero",
]


def _cache_dir():
    here = os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(here, ".cache")
    os.makedirs(path, exist_ok=True)
    return path


def _download(url, dest):
    request = urllib.request.Request(url, headers={"User-Agent": "run-bun-dex/1.0"})
    with urllib.request.urlopen(request, timeout=60) as response:
        data = response.read()
    with open(dest, "wb") as handle:
        handle.write(data)
    return data


def _load_csv(filename):
    path = os.path.join(_cache_dir(), filename)
    if not os.path.exists(path):
        _download(CSV_BASE + filename, path)
    with open(path, encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


class Reference:
    def __init__(self):
        self.pokemon = {row["identifier"]: row for row in _load_csv("pokemon.csv")}
        self.species = {row["identifier"]: row for row in _load_csv("pokemon_species.csv")}
        self._species_by_id = {row["id"]: row for row in self.species.values()}

        type_names = {row["id"]: row["identifier"] for row in _load_csv("types.csv")}
        self.types = {}
        for row in sorted(_load_csv("pokemon_types.csv"), key=lambda r: int(r["slot"])):
            self.types.setdefault(row["pokemon_id"], []).append(type_names[row["type_id"]])

        # species id -> identifiers that evolve from it
        self.evolves_into = {}
        for row in self.species.values():
            parent = row["evolves_from_species_id"]
            if parent:
                self.evolves_into.setdefault(parent, []).append(row["identifier"])

    def identifier(self, display_name):
        """Best-effort PokeAPI identifier for a Run & Bun display name."""
        slug = (display_name.lower()
                .replace("é", "e").replace("♀", "-f").replace("♂", "-m")
                .replace("'", "").replace(".", "").replace(":", "")
                .replace(" ", "-"))
        slug = (slug.replace("-alolan", "-alola")
                    .replace("-galarian", "-galar")
                    .replace("-hisuian", "-hisui"))
        slug = IDENTIFIER_OVERRIDES.get(slug, slug)

        if slug in self.pokemon:
            return slug
        for suffix in FORM_SUFFIX_FALLBACKS:
            if slug + suffix in self.pokemon:
                return slug + suffix
        return None

    def type_names(self, identifier):
        row = self.pokemon.get(identifier)
        return self.types.get(row["id"], []) if row else []

    def vanilla_evolution_targets(self, identifier):
        """Identifiers this Pokemon evolves into in the official games.

        Regional forms are not separate species in the dataset, so the base
        species chain is looked up and the region tag re-applied.
        """
        if not identifier:
            return []
        region = ""
        for tag in ("-alola", "-galar", "-hisui"):
            if identifier.endswith(tag):
                region, identifier = tag, identifier[: -len(tag)]
                break

        row = self.pokemon.get(identifier) or self.pokemon.get(identifier + region)
        if not row:
            return []
        species = self._species_by_id.get(row["species_id"])
        if not species:
            return []

        targets = []
        for child in self.evolves_into.get(species["id"], []):
            if region and child + region in self.pokemon:
                targets.append(child + region)
            else:
                targets.append(child)
        return targets

    def sprite(self, identifier, dest_dir, variant=None):
        """Download the 96x96 sprite. Returns the written filename, or None.

        `variant` picks a cosmetic form's artwork (`585-autumn.png`), which the
        dataset files do not list as a Pokemon of its own.
        """
        row = self.pokemon.get(identifier)
        if not row:
            return None
        stem = f"{row['id']}-{variant}" if variant else row["id"]
        filename = f"{stem}.png"
        dest = os.path.join(dest_dir, filename)
        if os.path.exists(dest) and os.path.getsize(dest) > 0:
            return filename
        try:
            data = _download(f"{SPRITE_BASE}{stem}.png", dest)
        except Exception:
            if os.path.exists(dest):
                os.remove(dest)
            return None
        if not data.startswith(b"\x89PNG"):
            os.remove(dest)
            return None
        return filename
