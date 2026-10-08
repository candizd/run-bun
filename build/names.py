"""Canonical naming shared by every parser.

The three source files spell the same Pokemon three different ways:

    learnset txt      GeodudeAlolan      TyphlosionHisuian   UrshifuRapidStrikeStyle
    encounter xlsx    Geodude-A          Typhlosion-H        Urshifu-Rapid-Strike
    evolution text    Geodude-Alolan     Typhlosion-Hisuian  Urshifu-Rapid-Strike

`key()` folds all three onto one string so they can be joined.
"""

import re

# Regional suffixes get folded onto a single spelling.
_REGION_FOLD = [
    ("hisuian", "hisui"),
    ("alolan", "alola"),
    ("galarian", "galar"),
]

# Encounter-table shorthand that is NOT a region tag.
NON_REGIONAL_SUFFIX = {
    "Nidoran-F": "NidoranF",
    "Nidoran-M": "NidoranM",
    "Basculin-BS": "Basculin",
    "Shellos-East": "Shellos",
    "Deerling-A": "Deerling",
    "Deerling-S": "Deerling",
    "Deerling-W": "Deerling",
    "Sawsbuck-A": "Sawsbuck",
    "Sawsbuck-S": "Sawsbuck",
    "Sawsbuck-W": "Sawsbuck",
}

# Cosmetic / in-battle forms that share a learnset with their base form.
# encounter name -> (base learnset name, label, sprite variant slug)
#
# The slug is only needed for forms the PokeAPI dataset treats as purely
# cosmetic: those have no entry of their own, and their artwork lives at
# `sprites/pokemon/<base id>-<slug>.png`. Forms with real stat differences
# (Pumpkaboo sizes, Basculin stripes) resolve normally, so their slug is None.
COSMETIC_FORMS = {
    "Deerling-A": ("Deerling", "Autumn", "autumn"),
    "Deerling-S": ("Deerling", "Summer", "summer"),
    "Deerling-W": ("Deerling", "Winter", "winter"),
    "Sawsbuck-A": ("Sawsbuck", "Autumn", "autumn"),
    "Sawsbuck-S": ("Sawsbuck", "Summer", "summer"),
    "Sawsbuck-W": ("Sawsbuck", "Winter", "winter"),
    "Shellos-East": ("Shellos", "East Sea", "east"),
    "Basculin-BS": ("Basculin", "Blue-Striped", None),
}
for _colour in ("Blue", "Orange", "White", "Yellow"):
    COSMETIC_FORMS[f"Flabébé-{_colour}"] = ("Flabébé", f"{_colour} Flower", _colour.lower())
    COSMETIC_FORMS[f"Florges-{_colour}"] = ("Florges", f"{_colour} Flower", _colour.lower())
for _size in ("Small", "Large", "Super"):
    COSMETIC_FORMS[f"Pumpkaboo-{_size}"] = ("Pumpkaboo", f"{_size} Size", None)
for _pattern in (
    "Archipelago", "Continental", "Elegant", "Fancy", "Garden", "High-Plains",
    "Jungle", "Marine", "Meadow", "Modern", "Monsoon", "Ocean", "Polar",
    "River", "Sandstorm", "Savanna", "Sun",
):
    COSMETIC_FORMS[f"Vivillon-{_pattern}"] = (
        "Vivillon", _pattern.replace("-", " "), _pattern.lower())


def expand_encounter_name(raw):
    """`Geodude-A` -> `Geodude-Alolan`. Leaves everything else alone."""
    raw = raw.strip()
    if raw in NON_REGIONAL_SUFFIX or raw in COSMETIC_FORMS:
        return raw
    m = re.fullmatch(r"(.+)-([AGH])", raw)
    if m:
        region = {"A": "Alolan", "G": "Galarian", "H": "Hisuian"}[m.group(2)]
        return f"{m.group(1)}-{region}"
    return raw


# Misspellings in the spreadsheets, folded onto the learnset file's spelling.
SOURCE_TYPOS = {
    "cyndaquill": "cyndaquil",
    "rowlett": "rowlet",
    "hakomoo": "hakamoo",
    "growlithehisui": "growlithehisui",
}


def key(name):
    """Fold any spelling of a Pokemon name onto one comparable string."""
    name = name.strip()
    name = NON_REGIONAL_SUFFIX.get(name, name)
    if name in COSMETIC_FORMS:
        name = COSMETIC_FORMS[name][0]
    k = name.lower().replace("é", "e").replace("♀", "f").replace("♂", "m")
    k = re.sub(r"[^a-z0-9]", "", k)
    for long, short in _REGION_FOLD:
        k = k.replace(long, short)
    if k.endswith("style"):
        k = k[: -len("style")]
    return SOURCE_TYPOS.get(k, k)


# Names the source file spells without their punctuation.
DISPLAY_FIXUPS = {
    "Jangmoo": "Jangmo-o",
    "Hakamoo": "Hakamo-o",
    "Kommoo": "Kommo-o",
    "Farfetchd": "Farfetch'd",
    "FarfetchdGalarian": "Farfetch'd-Galarian",
    "Sirfetchd": "Sirfetch'd",
    "HoOh": "Ho-Oh",
    "MrMime": "Mr. Mime",
    "MrRime": "Mr. Rime",
    "MimeJr": "Mime Jr.",
    "TypeNull": "Type: Null",
    "TapuKoko": "Tapu Koko",
    "TapuLele": "Tapu Lele",
    "TapuBulu": "Tapu Bulu",
    "TapuFini": "Tapu Fini",
}


def display(name):
    """Human-facing name: `GeodudeAlolan` -> `Geodude-Alolan`."""
    name = name.strip()
    if name in DISPLAY_FIXUPS:
        return DISPLAY_FIXUPS[name]
    if re.fullmatch(r"[A-Za-z0-9'.é♀♂ -]+", name) and "-" in name:
        return name
    # Split a run-together form name back apart: TyphlosionHisuian -> Typhlosion-Hisuian
    for suffix in ("Hisuian", "Alolan", "Galarian", "Hisui", "Alola", "Galar"):
        if name.endswith(suffix) and len(name) > len(suffix):
            return f"{name[:-len(suffix)]}-{suffix}"
    m = re.fullmatch(r"(Nidoran)([FM])", name)
    if m:
        return "Nidoran-" + m.group(2)
    m = re.fullmatch(r"(Lycanroc|Toxtricity|Urshifu|Porygon)([A-Z].*)", name)
    if m:
        tail = re.sub(r"(?<!^)(?=[A-Z])", "-", m.group(2))
        tail = re.sub(r"-Style$", "", tail)
        return f"{m.group(1)}-{tail}"
    return name
