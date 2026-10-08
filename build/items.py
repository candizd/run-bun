"""Parse `Item Locations.xlsx` into one flat, searchable item list.

Every sheet has its own shape (some are one table, some are two tables side by
side, some open with a note), so each is handled explicitly. The payoff is a
single row type the UI can filter by category, by name and by place.
"""

import re

import openpyxl

from . import names

# Place names that appear in item descriptions but are not encounter locations.
EXTRA_PLACES = [
    "Lilycove Department Store", "Lilycove Deparment Store", "Slateport Harbor",
    "Weather Institute", "Devon Corp", "Mauville City", "Lavaridge Town",
    "Rustboro City", "Petalburg City", "Fortree City", "Fallarbor Town",
    "Sootopolis City", "Dewford Town", "Verdanturf Town", "Pacifidlog Town",
    "Mossdeep City", "Slateport City", "Lilycove City", "Oldale Town",
    "Littleroot Town", "Ever Grande City", "Victory Road", "Shoal Cave",
    "Safari Zone", "Aqua Hideout", "Magma Hideout", "Abandoned Ship",
    "Granite Cave", "Meteor Falls", "Mt. Pyre", "New Mauville",
    "Petalburg Woods", "Scorched Slab", "Seafloor Cavern", "Cave of Origin",
    "Rusturf Tunnel", "Fiery Path", "Jagged Pass", "Desert Underpass",
    "Mirage Tower", "Sky Pillar", "Altering Cave", "Slateport Museum",
    "Dewford Town Hall", "Seashore House", "Battle Tent",
]

_CANONICAL_PLACE = {
    "Lilycove Deparment Store": "Lilycove Department Store",
}


def _cell(value):
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def _rows(worksheet):
    return [[_cell(c) for c in row] for row in worksheet.iter_rows(values_only=True)]


def _pairs(rows, name_column, detail_column, skip_headers=()):
    """Yield (name, detail) from two adjacent columns, ignoring headers/blanks."""
    for row in rows:
        if len(row) <= detail_column:
            continue
        name, detail = row[name_column], row[detail_column]
        if not name or not detail:
            continue
        if name in skip_headers or name.lower() in ("item", "move", "berry"):
            continue
        yield name, detail


class PlaceIndex:
    """Finds known place names inside free-text item descriptions."""

    def __init__(self, encounter_locations):
        vocabulary = set(EXTRA_PLACES)
        for location in encounter_locations:
            vocabulary.add(location)
            # "Granite Cave B1F" / "Mt. Pyre (Summit)" -> the place itself
            base = re.sub(r"\s*\(.*?\)\s*$", "", location)
            base = re.sub(r"\s+(B?\d+F.*|Rooms?\b.*|Room \d.*|Entrance.*)$", "", base)
            if base:
                vocabulary.add(base.strip())
        # Longest first so "New Mauville" wins over "Mauville City".
        self.vocabulary = sorted(vocabulary, key=len, reverse=True)

    def find(self, text):
        found, remaining = [], text
        for place in self.vocabulary:
            if place.lower() in remaining.lower():
                canonical = _CANONICAL_PLACE.get(place, place)
                if canonical not in found:
                    found.append(canonical)
                remaining = re.sub(re.escape(place), " ", remaining, flags=re.I)
        for match in re.finditer(r"Routes?\s+((?:\d+[,\s]*(?:and\s*)?)+)", text, re.I):
            for number in re.findall(r"\d+", match.group(1)):
                route = f"Route {number}"
                if route not in found:
                    found.append(route)
        return sorted(found)


def parse(path, encounter_locations):
    workbook = openpyxl.load_workbook(path, data_only=True)
    places = PlaceIndex(encounter_locations)
    items = []

    def add(category, name, detail, place="", extra=None, move=None):
        text = " ".join(part for part in (place, detail) if part)
        items.append({
            "category": category,
            "name": name,
            "place": place,
            "detail": detail,
            "extra": extra,
            "move": move,
            "places": places.find(text),
        })

    # Heart Scales / Rare Candies: column A is the place, column B the hint.
    for sheet, label in (("Heart Scales", "Heart Scale"),
                         ("Rare Candies", "Rare Candy")):
        for place, detail in _rows(workbook[sheet])[1:]:
            if place and detail:
                add(label, label, detail, place=place)

    evolution = _rows(workbook["Evolution Items"])
    note = evolution[0][0]
    for name, detail in _pairs(evolution[1:], 0, 1):
        add("Evolution Item", name, detail)

    held = _rows(workbook["Held Items"])
    for name, detail in _pairs(held, 0, 1):
        add("Held Item", name, detail)
    for row in held:
        if len(row) >= 6 and row[3] and row[4] and row[3].lower() != "berry":
            add("Berry", row[3], row[4], extra=row[5] or None)

    machines = _rows(workbook["TMHMs and Move Tutors"])
    for name, detail in _pairs(machines, 0, 1):
        match = re.fullmatch(r"((?:TM|HM)\d+)\s+(.+)", name)
        if match:
            code, move = match.groups()
            add("TM" if code.startswith("TM") else "HM", code, detail, move=move.strip())
        else:
            add("TM", name, detail)
    for name, detail in _pairs(machines, 3, 4):
        add("Move Tutor", name, detail, move=name)

    for name, detail in _pairs(_rows(workbook["Mega Stones"])[1:], 0, 1):
        add("Mega Stone", name, detail)

    return {"items": items, "evolutionItemNote": note}


MEGA_STONE_FIXUPS = {"Cameruptitte": "Cameruptite"}


def mega_stone_owner(stone_name, pokemon_keys):
    """`Gyaradosite` -> the key of the Pokemon it belongs to.

    The stone names clip their owner in inconsistent ways (Alakazite drops
    "am", Aggronite keeps everything), so the trimmed stem is matched against
    real Pokemon keys by longest common prefix rather than exactly.
    """
    stem = names.key(re.sub(r"(ite|nite|ium)\s*[XY]?$", "",
                            MEGA_STONE_FIXUPS.get(stone_name, stone_name)))
    if len(stem) < 4:
        return None

    best, best_score = None, 0
    for candidate in pokemon_keys:
        shared = 0
        for a, b in zip(stem, candidate):
            if a != b:
                break
            shared += 1
        if shared > best_score:
            best, best_score = candidate, shared
    if best and best_score >= max(4, len(stem) - 2):
        return best
    return None
