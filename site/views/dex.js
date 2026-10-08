/* The dex grid: every Pokemon in the hack, filtered by name, type,
   availability, or (via the finder) by a move it learns. */

Dex.views.dex = (function () {
  const { data, el, fragment, spriteUrl, normalise } = Dex;

  const TYPES = [...new Set(data.pokemon.flatMap((p) => p.types))].sort();

  const sourceCount = (mon) =>
    mon.encounters.length + (specialSources(mon).length ? 1 : 0);

  /** Gifts, trades, Game Corner prizes and roamers that name this Pokemon. */
  function specialSources(mon) {
    const extras = data.extras;
    const found = [];
    const mentions = (text) => normalise(text).includes(normalise(mon.name));

    for (const gift of extras.gifts) {
      if (mentions(gift.pokemon)) found.push({ kind: "Gift", where: gift.location });
    }
    for (const trade of extras.trades) {
      if (mentions(trade.offered)) found.push({ kind: "Trade", where: trade.location });
    }
    for (const reward of extras.gameCorner.rewards) {
      if (reward.pokemon.some((p) => p.key === mon.key)) {
        found.push({ kind: "Game Corner", where: reward.badge });
      }
    }
    for (const roamer of extras.roaming) {
      if (roamer.pokemon.some((p) => p.key === mon.key)) {
        found.push({ kind: "Roaming", where: "Routes " + roamer.routes });
      }
    }
    return found;
  }

  function card(mon) {
    const obtainable = sourceCount(mon) > 0;
    return el("a", {
      class: "mon-card t-" + (mon.types[0] || "normal"),
      href: "#/pokemon/" + mon.key,
      dataset: {
        name: normalise(mon.name),
        types: mon.types.join(" "),
        obtainable: obtainable ? "yes" : "no",
      },
    },
      el("img", { src: spriteUrl(mon.sprite), alt: "", loading: "lazy", width: 96, height: 96 }),
      el("span", { class: "mon-name", text: mon.name }),
      Dex.typeBadges(mon.types),
      !obtainable && el("span", { class: "unobtainable", text: "not catchable" }));
  }

  function render(arg) {
    const moveFilter = arg && arg.startsWith("move/") ? arg.slice(5) : null;
    const learners = moveFilter
      ? new Set(data.pokemon
          .filter((p) => p.moves.some((m) => m.move === moveFilter))
          .map((p) => p.key))
      : null;

    const pool = learners
      ? data.pokemon.filter((p) => learners.has(p.key))
      : data.pokemon;

    const count = el("span", { class: "count" });
    const grid = el("div", { class: "grid" }, pool.map(card));
    const cards = [...grid.children];

    const searchBox = el("input", {
      type: "search", placeholder: "Filter by name…", "aria-label": "Filter by name",
    });
    const availability = el("select", { "aria-label": "Availability" },
      el("option", { value: "all", text: "Everything" }),
      el("option", { value: "yes", text: "Catchable in-game" }),
      el("option", { value: "no", text: "Not catchable" }));

    const activeTypes = new Set();
    const typeChips = TYPES.map((type) =>
      el("button", {
        class: "chip type-chip t-" + type, type: "button",
        "aria-pressed": "false", text: type,
        onclick(event) {
          const on = activeTypes.has(type);
          if (on) activeTypes.delete(type); else activeTypes.add(type);
          event.currentTarget.setAttribute("aria-pressed", String(!on));
          apply();
        },
      }));

    function apply() {
      const query = normalise(searchBox.value.trim());
      const want = availability.value;
      let shown = 0;
      for (const node of cards) {
        const { name, types, obtainable } = node.dataset;
        const typeList = types.split(" ");
        const ok = (!query || name.includes(query))
          && (want === "all" || obtainable === want)
          && (!activeTypes.size || [...activeTypes].every((t) => typeList.includes(t)));
        node.classList.toggle("is-hidden", !ok);
        if (ok) shown += 1;
      }
      count.textContent = shown + " of " + cards.length;
    }

    searchBox.addEventListener("input", apply);
    availability.addEventListener("change", apply);
    apply();

    return fragment(
      el("div", { class: "page-head" },
        el("h1", { text: moveFilter ? "Learns " + moveFilter : "Pokédex" }),
        count,
        moveFilter && el("a", { class: "back-link", href: "#/dex", text: "← All Pokémon" })),
      el("div", { class: "controls" },
        searchBox,
        availability,
        el("div", { class: "chips" }, typeChips)),
      grid);
  }

  return { render, specialSources, sourceCount };
})();
