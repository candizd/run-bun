/* One Pokemon: identity, evolution line, what evolving costs you, and where
   it lives. The "cost of evolving" ledger is the reason this dex exists --
   in a hardcore run the level-up list you give up matters more than the stats
   you gain. */

Dex.views.pokemon = (function () {
  const { data, byKey, el, fragment, spriteUrl, monLink, panel, table, rateCell } = Dex;

  const itemsByName = new Map(data.items.map((i) => [i.name, i]));

  /** move name -> sorted levels it is learned at */
  function moveMap(mon) {
    const map = new Map();
    for (const entry of mon.moves) {
      if (!map.has(entry.move)) map.set(entry.move, []);
      map.get(entry.move).push(entry.level);
    }
    for (const levels of map.values()) levels.sort((a, b) => a - b);
    return map;
  }

  const earliest = (map, move) => (map.has(move) ? map.get(move)[0] : null);

  function walk(mon, direction) {
    const seen = new Set();
    const out = [];
    const queue = [...mon[direction]];
    while (queue.length) {
      const key = queue.shift();
      if (seen.has(key) || !byKey.has(key)) continue;
      seen.add(key);
      out.push(byKey.get(key));
      queue.push(...byKey.get(key)[direction]);
    }
    return out;
  }

  /* ---------- evolution line ---------- */

  function methodText(evo) {
    if (evo.kind === "level") return "Lv " + evo.level;
    if (evo.kind === "item") return evo.item;
    if (evo.kind === "move") return "Level up knowing " + evo.move;
    if (evo.kind === "place") return "Level up at " + evo.place;
    return evo.raw;
  }

  function methodNode(evo) {
    const text = methodText(evo);
    if (evo.kind === "item" && itemsByName.has(evo.item)) {
      return el("a", { class: "evo-method", href: "#/items/" + encodeURIComponent(evo.item),
        text: text, title: "Where to find " + evo.item });
    }
    if (evo.kind === "place" && Dex.locationsByName.has(evo.place)) {
      return el("a", { class: "evo-method", href: "#/locations/" + encodeURIComponent(evo.place),
        text: text });
    }
    return el("span", { class: "evo-method", text: text });
  }

  function stageNode(mon, current) {
    return el("a", {
      class: "evo-stage",
      href: "#/pokemon/" + mon.key,
      "aria-current": mon.key === current.key ? "true" : null,
    },
      el("img", { src: spriteUrl(mon.sprite), alt: "", width: 72, height: 72 }),
      el("span", { class: "evo-name", text: mon.name }));
  }

  /* Branches stack vertically so Slowpoke reads as two separate outcomes
     rather than one three-stage chain. */
  function subtree(stage, current, seen) {
    if (seen.has(stage.key)) return [stageNode(stage, current)];
    seen.add(stage.key);

    const branches = [];
    for (const evo of stage.evolutions) {
      const arrow = () => el("div", { class: "evo-arrow" },
        methodNode(evo),
        evo.condition && el("span", { class: "evo-cond", text: evo.condition }));

      for (const targetKey of evo.targets) {
        const target = byKey.get(targetKey);
        if (!target) continue;
        branches.push(el("div", { class: "evo-branch" },
          arrow(), subtree(target, current, seen)));
      }
      for (const name of evo.unlinked || []) {
        branches.push(el("div", { class: "evo-branch" }, arrow(),
          el("span", { class: "evo-stage", title: "No learnset data in the source files" },
            el("span", { class: "evo-name muted", text: name }))));
      }
    }

    return [
      stageNode(stage, current),
      branches.length ? el("div", { class: "evo-branches" }, branches) : null,
    ].filter(Boolean);
  }

  function evolutionLine(mon) {
    const root = byKey.get(mon.line[0]);
    if (!root || mon.line.length < 2) return null;
    return el("div", { class: "evo-line" }, subtree(root, mon, new Set()));
  }

  /* ---------- what evolving costs ---------- */

  function moveChip(move, level, from) {
    return el("span", { class: "move-chip" },
      el("b", { text: move }),
      level !== null && el("span", { class: "at", text: "Lv " + level }),
      from && el("span", { class: "from", text: from }));
  }

  function card(kind, heading, who, chips) {
    return el("div", { class: "ledger-card " + kind },
      el("h3", {}, heading[0], el("span", { class: "who", text: who }), heading[1] || ""),
      el("div", { class: "move-chips" }, chips));
  }

  const sortedBy = (map, moves) =>
    moves.slice().sort((a, b) => earliest(map, a) - earliest(map, b) || a.localeCompare(b));

  /** Everything one evolution step changes, always read earlier stage -> later. */
  function compare(before, after) {
    const from = moveMap(before);
    const to = moveMap(after);
    const dropped = sortedBy(from, [...from.keys()].filter((m) => !to.has(m)));
    const gained = sortedBy(to, [...to.keys()].filter((m) => !from.has(m)));
    const shifted = sortedBy(from, [...from.keys()]
      .filter((m) => to.has(m) && earliest(to, m) !== earliest(from, m)));
    return { from, to, dropped, gained, shifted };
  }

  /* Losses first, then gains, then timing: the cost is what you came for.
     Wording stays neutral about how many steps away a form is, because these
     comparisons run against every ancestor and descendant, not just adjacent
     ones -- what matters is the form you end up on. */
  function ledger(mon) {
    const cards = [];
    const add = (rank, node) => cards.push({ rank, node });

    for (const ancestor of walk(mon, "parents")) {
      const { from, to, dropped, shifted } = compare(ancestor, mon);
      if (dropped.length) {
        add(0, card("", ["Teach as ", " — " + mon.name + " never learns these"],
          ancestor.name, dropped.map((move) => moveChip(move, earliest(from, move)))));
      }
      if (shifted.length) {
        add(2, card("shift", ["Different level than as "], ancestor.name,
          shifted.map((move) => moveChip(move, null,
            "Lv " + earliest(from, move) + " → " + earliest(to, move)))));
      }
    }

    for (const child of walk(mon, "children")) {
      const { from, to, dropped, gained, shifted } = compare(mon, child);
      if (dropped.length) {
        add(0, card("", ["", " never learns these"], child.name,
          dropped.map((move) => moveChip(move, earliest(from, move)))));
      }
      if (gained.length) {
        add(1, card("gain", ["New on "], child.name,
          gained.map((move) => moveChip(move, earliest(to, move)))));
      }
      if (shifted.length) {
        add(2, card("shift", ["Different level on "], child.name,
          shifted.map((move) => moveChip(move, null,
            "Lv " + earliest(from, move) + " → " + earliest(to, move)))));
      }
    }

    return cards.sort((a, b) => a.rank - b.rank).map((entry) => entry.node);
  }

  /* ---------- the whole family, side by side ---------- */

  function familyMatrix(mon) {
    const line = mon.line.map((key) => byKey.get(key)).filter(Boolean);
    if (line.length < 2) return null;

    const maps = line.map(moveMap);
    const edges = [];
    line.forEach((stage, index) => {
      for (const childKey of stage.children) {
        const childIndex = line.findIndex((s) => s.key === childKey);
        if (childIndex >= 0) edges.push([index, childIndex]);
      }
    });

    const allMoves = [...new Set(line.flatMap((s) => s.moves.map((m) => m.move)))];
    allMoves.sort((a, b) => {
      const levelA = Math.min(...maps.map((m) => earliest(m, a) ?? 999));
      const levelB = Math.min(...maps.map((m) => earliest(m, b) ?? 999));
      return levelA - levelB || a.localeCompare(b);
    });

    const rows = allMoves.map((move) => {
      const lost = edges.some(([from, to]) => maps[from].has(move) && !maps[to].has(move));
      return el("tr", { class: lost ? "lost" : null },
        el("td", {}, el("span", { class: "move-name", text: move })),
        maps.map((map) => el("td", {
          class: "stage-cell " + (map.has(move) ? "has" : "lacks"),
          text: map.has(move) ? map.get(move).map((l) => "Lv " + l).join(", ") : "—",
        })));
    });

    return table(
      [{ label: "Move" }, ...line.map((s) => ({ label: s.name, align: "right" }))],
      rows, "matrix fill-first");
  }

  /* ---------- where to find it ---------- */

  function encounters(mon) {
    const rows = mon.encounters
      .slice()
      .sort((a, b) => a.location.localeCompare(b.location) || a.method.localeCompare(b.method))
      .map((encounter) => el("tr", {},
        el("td", {}, el("a", {
          href: "#/locations/" + encodeURIComponent(encounter.location),
          text: encounter.location,
        })),
        el("td", { class: "nowrap", text: encounter.method }),
        el("td", { class: "num lv", text: encounter.levels || "—" }),
        rateCell(encounter.rate),
        el("td", {},
          encounter.tag && el("span", { class: "tag " + encounter.tag.toLowerCase(),
            text: encounter.tag }),
          encounter.form && el("span", { class: "tag", text: encounter.form }),
          encounter.set !== "both" && el("span", { class: "tag temp",
            text: encounter.set === "temp" ? "temp table only" : "normal table only" }))));

    const specials = Dex.views.dex.specialSources(mon).map((source) =>
      el("tr", {},
        el("td", { text: source.where }),
        el("td", { class: "nowrap", text: source.kind }),
        el("td", { class: "num muted", text: "—" }),
        el("td", { class: "num muted", text: "—" }),
        el("td", {}, el("span", { class: "tag gift", text: "one-off" }))));

    const all = rows.concat(specials);
    if (!all.length) {
      return el("p", { class: "empty", text: "Not catchable in Run & Bun." });
    }
    return table(
      [{ label: "Where" }, { label: "How" }, { label: "Level", align: "right" },
       { label: "Rate", align: "right" }, { label: "Notes" }],
      all, "fill-first");
  }

  /* ---------- page ---------- */

  function render(key) {
    const mon = byKey.get(key);
    if (!mon) {
      return el("p", { class: "empty", text: "No Pokémon by that name." });
    }

    const abilities = [
      ["Ability 1", mon.abilities.primary],
      ["Ability 2", mon.abilities.secondary],
      ["Hidden", mon.abilities.hidden],
    ];

    const megaStone = data.items.find((i) => i.category === "Mega Stone" && i.owner === mon.key);

    const head = el("div", { class: "detail-head t-" + (mon.types[0] || "normal") },
      el("div", { class: "detail-portrait" },
        el("img", { src: spriteUrl(mon.sprite), alt: mon.name, width: 128, height: 128 })),
      el("div", {},
        el("h1", { text: mon.name }),
        Dex.typeBadges(mon.types),
        el("div", { class: "ability-row" },
          abilities.map(([label, value]) => el("div", {},
            el("span", { class: "label", text: label }),
            el("strong", { class: value ? null : "none", text: value || "—" })))),
        mon.statChanges && el("p", { class: "stat-note", text: "Stat changes: " + mon.statChanges }),
        megaStone && el("p", { class: "hint" },
          "Mega Stone: ",
          el("a", { href: "#/items/" + encodeURIComponent(megaStone.name), text: megaStone.name }),
          " — " + megaStone.detail)));

    const line = evolutionLine(mon);
    const cards = ledger(mon);
    const matrix = familyMatrix(mon);

    const moveRows = mon.moves
      .slice()
      .sort((a, b) => a.level - b.level)
      .map((entry) => el("tr", {},
        el("td", { class: "num lv", text: "Lv " + entry.level }),
        el("td", {}, el("a", { href: "#/dex/move/" + encodeURIComponent(entry.move),
          text: entry.move, title: "Who else learns " + entry.move }))));

    return fragment(
      head,
      line && panel("Evolution line", line),
      cards.length
        ? panel("What evolving costs", fragment(
            el("p", { class: "hint" },
              "Level-up moves only. A move dropped here cannot be relearned on the "
              + "evolved form, so teach it before you evolve."),
            el("div", { class: "ledger" }, cards)))
        : null,
      el("div", { class: "cols" },
        panel("Level-up moves", table(
          [{ label: "Level", align: "right" }, { label: "Move" }], moveRows, "fill-last")),
        panel("Where to find it", encounters(mon))),
      matrix && panel("Family move ledger", matrix, {
        note: "Every level-up move in the line. Rows flagged in red are lost at some evolution step.",
      }));
  }

  return { render };
})();
