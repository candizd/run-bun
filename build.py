#!/usr/bin/env python3
"""Build the Run & Bun dex.

    python build.py

Reads the three source files in this folder, downloads vanilla types and
sprites from the PokeAPI dataset (cached under build/.cache and site/sprites),
and writes site/data.js. Open site/index.html afterwards -- no server needed.
"""

import json
import os
import sys

from build import items as items_parser
from build import learnsets, locations as locations_parser, names, pokeapi

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(HERE, "site")
SPRITES = os.path.join(SITE, "sprites")

LEARNSET_FILE = "Learnset, Evolution Methods and Abilities.txt"
LOCATION_FILE = "Pokémon Locations.xlsx"
ITEM_FILE = "Item Locations.xlsx"


def build_evolution_lines(pokemon):
    """Group Pokemon into evolution families and record each one's parents."""
    by_key = {p["key"]: p for p in pokemon}
    children = {p["key"]: [] for p in pokemon}
    parents = {p["key"]: [] for p in pokemon}

    for entry in pokemon:
        for evo in entry["evolutions"]:
            for target in evo["targets"]:
                if target in by_key and target not in children[entry["key"]]:
                    children[entry["key"]].append(target)
                    parents[target].append(entry["key"])

    def root_of(key, seen=None):
        seen = seen or set()
        if key in seen or not parents[key]:
            return key
        seen.add(key)
        return root_of(parents[key][0], seen)

    lines = {}
    for entry in pokemon:
        root = root_of(entry["key"])
        entry["parents"] = parents[entry["key"]]
        entry["children"] = children[entry["key"]]
        entry["lineKey"] = root
        lines.setdefault(root, [])

    # Order each line breadth-first from its root so the UI can render stages.
    for root in lines:
        order, queue, seen = [], [root], {root}
        while queue:
            key = queue.pop(0)
            order.append(key)
            for child in children[key]:
                if child not in seen:
                    seen.add(child)
                    queue.append(child)
        lines[root] = order

    for entry in pokemon:
        entry["line"] = lines[entry["lineKey"]]
        entry["stage"] = entry["line"].index(entry["key"])

    return lines


def collect_encounters(location_data, pokemon_keys):
    """-> {pokemon key: [encounter, ...]}, preserving normal/temp differences."""
    found = {key: [] for key in pokemon_keys}
    unknown = set()

    for location in location_data["locations"]:
        normal = location["slots"]
        temp = location["tempSlots"] if location["tempSlots"] is not None else normal

        tally = {}
        for table_set, slots in (("normal", normal), ("temp", temp)):
            for slot in slots:
                signature = (slot["method"], slot["rate"], slot["levels"],
                             slot["name"], slot["tag"], slot["form"])
                record = tally.setdefault(signature, {"sets": set(), "slot": slot})
                record["sets"].add(table_set)

        for record in tally.values():
            slot = record["slot"]
            if slot["key"] not in found:
                unknown.add(slot["name"])
                continue
            found[slot["key"]].append({
                "location": location["name"],
                "method": slot["method"],
                "rate": slot["rate"],
                "levels": slot["levels"],
                "tag": slot["tag"],
                "form": slot["form"],
                "set": "both" if len(record["sets"]) == 2 else record["sets"].pop(),
            })

    return found, sorted(unknown)


def main():
    os.makedirs(SPRITES, exist_ok=True)
    report = []

    print("Reading learnsets...")
    entries = learnsets.parse(os.path.join(HERE, LEARNSET_FILE))
    reference = pokeapi.Reference()
    unnamed, guesses = learnsets.resolve_targets(entries, reference)
    print(f"  {len(entries)} Pokemon")
    for owner, target in unnamed:
        report.append(f"{owner}: evolution target '{target}' has no learnset entry")
    for owner, guess, raw, vanilla in guesses:
        report.append(f"{owner}: guessed '{guess}' for \"{raw}\" (vanilla: {vanilla})")

    print("Reading locations...")
    location_data = locations_parser.parse(os.path.join(HERE, LOCATION_FILE))
    location_names = [l["name"] for l in location_data["locations"]]
    print(f"  {len(location_names)} locations")

    print("Reading items...")
    item_data = items_parser.parse(os.path.join(HERE, ITEM_FILE), location_names)
    print(f"  {len(item_data['items'])} items")

    pokemon_keys = {e["key"] for e in entries}
    encounters, unknown_mons = collect_encounters(location_data, pokemon_keys)
    for name in unknown_mons:
        report.append(f"encounter tables list '{name}', which has no learnset entry")

    print("Resolving types and sprites...")
    forms = {}
    for encounter_name, (base, label, _slug) in names.COSMETIC_FORMS.items():
        forms[encounter_name] = {"base": names.key(base), "label": label}

    # (lookup name, cosmetic variant slug) per sprite we need
    sprite_targets = {e["key"]: (e["name"], None) for e in entries}
    for encounter_name, (base, _label, slug) in names.COSMETIC_FORMS.items():
        sprite_targets[encounter_name] = (
            (base, slug) if slug else (encounter_name, None))

    sprite_files, missing_sprites = {}, []
    for index, (key, (display_name, variant)) in enumerate(sorted(sprite_targets.items()), 1):
        identifier = reference.identifier(display_name)
        filename = reference.sprite(identifier, SPRITES, variant) if identifier else None
        if filename:
            sprite_files[key] = filename
        else:
            missing_sprites.append(display_name)
        if index % 50 == 0:
            print(f"  {index}/{len(sprite_targets)}", end="\r", flush=True)
    for name in missing_sprites:
        report.append(f"no sprite for '{name}'")
    print(f"  {len(sprite_files)} sprites")

    for encounter_name, form in forms.items():
        form["sprite"] = sprite_files.get(encounter_name)

    pokemon = []
    for entry in entries:
        identifier = reference.identifier(entry["name"])
        pokemon.append({
            "key": entry["key"],
            "name": entry["name"],
            "types": reference.type_names(identifier),
            "sprite": sprite_files.get(entry["key"]),
            "abilities": entry["abilities"],
            "statChanges": entry["statChanges"],
            "moves": entry["moves"],
            "evolutions": entry["evolutions"],
            "encounters": encounters[entry["key"]],
        })

    build_evolution_lines(pokemon)

    for item in item_data["items"]:
        if item["category"] == "Mega Stone":
            item["owner"] = items_parser.mega_stone_owner(item["name"], pokemon_keys)

    payload = {
        "pokemon": pokemon,
        "locations": location_data["locations"],
        "items": item_data["items"],
        "forms": forms,
        "extras": {
            "gameCorner": location_data["gameCorner"],
            "trades": location_data["trades"],
            "gifts": location_data["gifts"],
            "fossils": location_data["fossils"],
            "roaming": location_data["roaming"],
            "unavailable": location_data["unavailable"],
            "evolutionItemNote": item_data["evolutionItemNote"],
        },
    }

    output = os.path.join(SITE, "data.js")
    with open(output, "w", encoding="utf-8") as handle:
        handle.write("window.DEX = ")
        json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))
        handle.write(";\n")

    size = os.path.getsize(output) / 1024
    print(f"\nWrote {os.path.relpath(output, HERE)} ({size:.0f} KB)")

    if report:
        print(f"\n{len(report)} note(s) about the source data:")
        for line in report:
            print(f"  - {line}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
