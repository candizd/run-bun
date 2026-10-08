"""Parse `Learnset, Evolution Methods and Abilities.txt`.

Each blank-line separated block is one Pokemon:

    Bulbasaur
    Lv.  1     Tackle
    ...
    Ability 1: Overgrow
    Ability 2: None
    Hidden Ability: Chlorophyll
    Evolves at level 16
"""

import re

from . import names

# Evolution lines, most specific pattern first. Each handler returns a dict.
_EVO_PATTERNS = [
    # "Evolves into Hitmonlee at level 20 if Attack is greater than Defense"
    (r"Evolves into (?P<target>.+?) at level (?P<level>\d+) if (?P<cond>.+)",
     lambda m: dict(kind="level", level=int(m["level"]), condition=m["cond"],
                    targets=[m["target"]])),
    # "Evolves into Typhlosion-Hisuian by leveling up at Mt. Pyre"
    (r"Evolves into (?P<target>.+?) by leveling up at (?P<place>.+)",
     lambda m: dict(kind="place", place=m["place"], targets=[m["target"]])),
    # "Evolves into Avalugg-Hisuian by leveling up with Ancient Power"
    (r"Evolves into (?P<target>.+?) by leveling up with (?P<move>.+)",
     lambda m: dict(kind="move", move=m["move"], targets=[m["target"]])),
    # "Evolves at level 20 into Slowbro"
    (r"Evolves at level (?P<level>\d+) into (?P<target>.+)",
     lambda m: dict(kind="level", level=int(m["level"]), targets=_split(m["target"]))),
    # "Evolves at level 30, regardless of gender" / "... in a rainy route"
    (r"Evolves at level (?P<level>\d+)(?:,)? (?P<cond>.+)",
     lambda m: dict(kind="level", level=int(m["level"]), condition=m["cond"])),
    (r"Evolves at level (?P<level>\d+)",
     lambda m: dict(kind="level", level=int(m["level"]))),
    # "Evolves 36" -- typo for the line above, appears once (Chespin).
    (r"Evolves (?P<level>\d+)",
     lambda m: dict(kind="level", level=int(m["level"]))),
    # "Evolves by leveling up at New Mauville"
    (r"Evolves by leveling up at (?P<place>.+)",
     lambda m: dict(kind="place", place=m["place"])),
    # "Evolves by leveling up with Ancient Power"
    (r"Evolves by leveling up with (?P<move>.+)",
     lambda m: dict(kind="move", move=m["move"])),
    # "Evolves by Moon Stone into Huntail"
    (r"Evolves by (?P<item>.+?) into (?P<target>.+)",
     lambda m: dict(kind="item", item=m["item"], targets=_split(m["target"]))),
    # "Evolves by Dusk Stone"
    (r"Evolves by (?P<item>.+)",
     lambda m: dict(kind="item", item=m["item"])),
]

# "Urshifu-Rapid-Strike or Urshifu-Single-Strike, depending on it's personality value"
_SPLIT_TAIL = re.compile(r",\s*depending on .*$", re.I)


def _split(target_text):
    """Turn an evolution target phrase into a list of target names."""
    target_text = _SPLIT_TAIL.sub("", target_text).strip().rstrip(".")
    return [t.strip() for t in re.split(r"\s+or\s+", target_text) if t.strip()]


def _parse_evolution(line):
    for pattern, build in _EVO_PATTERNS:
        m = re.fullmatch(pattern, line)
        if m:
            evo = build(m)
            evo.setdefault("targets", [])
            evo["raw"] = line
            return evo
    raise ValueError(f"unrecognised evolution line: {line!r}")


def parse(path):
    """Return a list of Pokemon dicts in source-file order."""
    text = open(path, encoding="utf-8", errors="replace").read()
    entries = []
    current = None

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue

        if line.startswith("Lv."):
            level, move = re.fullmatch(r"Lv\.\s*(\d+)\s+(.+)", line).groups()
            current["moves"].append({"level": int(level), "move": move.strip()})
        elif line.startswith("Ability 1:"):
            current["abilities"]["primary"] = _ability(line)
        elif line.startswith("Ability 2:"):
            current["abilities"]["secondary"] = _ability(line)
        elif line.startswith("Hidden Ability:"):
            current["abilities"]["hidden"] = _ability(line)
        elif line.startswith("Stat changes:"):
            current["statChanges"] = line.split(":", 1)[1].strip()
        elif line.startswith("Evolves"):
            current["evolutions"].append(_parse_evolution(line))
        else:
            current = {
                "key": names.key(line),
                "name": names.display(line),
                "sourceName": line,
                "moves": [],
                "abilities": {"primary": None, "secondary": None, "hidden": None},
                "statChanges": None,
                "evolutions": [],
            }
            entries.append(current)

    return entries


def _ability(line):
    value = line.split(":", 1)[1].strip()
    return None if value.lower() == "none" else value


def resolve_targets(entries, reference):
    """Fill in the evolution target that the source file leaves implicit.

    Most lines just say "Evolves at level 16" and rely on the next Pokemon in
    the file being the result -- but that is not always true (Magneton's
    New Mauville evolution is Magnezone, which is nowhere near it in the file).
    So the file order is only trusted when the vanilla evolution chain agrees,
    or when the chain offers no opinion at all.

    Named targets ("... into Slowking") always win. Returns
    (unnamed_targets, low_confidence_guesses) for the build report.
    """
    by_key = {e["key"]: e for e in entries}
    unnamed = []
    guesses = []

    for index, entry in enumerate(entries):
        vanilla = {
            names.key(t)
            for t in reference.vanilla_evolution_targets(
                reference.identifier(entry["name"]))
        }
        vanilla_here = [k for k in vanilla if k in by_key]

        for evo in entry["evolutions"]:
            if evo["targets"]:
                resolved = []
                for target in evo["targets"]:
                    match = by_key.get(names.key(target))
                    if match:
                        resolved.append(match["key"])
                    else:
                        # A form the hack references but does not ship a
                        # learnset for; keep the name so it can still be shown.
                        resolved.append(None)
                        unnamed.append((entry["name"], target))
                        evo.setdefault("unlinked", []).append(names.display(target))
                evo["targets"] = [k for k in resolved if k]
                continue

            evo["inferred"] = True
            next_key = entries[index + 1]["key"] if index + 1 < len(entries) else None

            if next_key and next_key in vanilla:
                evo["targets"] = [next_key]
            elif len(vanilla_here) == 1:
                evo["targets"] = vanilla_here
            elif next_key:
                evo["targets"] = [next_key]
                guesses.append((entry["name"], by_key[next_key]["name"],
                                evo["raw"], sorted(vanilla_here)))
            else:
                unnamed.append((entry["name"], "<no following entry>"))

    return unnamed, guesses
