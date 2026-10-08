/* Items: one table for every pickup in the game, filtered by kind and place.
   Answers both "where is the Dawn Stone" and "what's on Route 119". */

Dex.views.items = (function () {
  const { data, el, fragment, monLink, table, normalise } = Dex;

  const CATEGORY_ORDER = ["TM", "HM", "Move Tutor", "Evolution Item", "Held Item",
    "Berry", "Mega Stone", "Heart Scale", "Rare Candy"];

  const rank = (category) => {
    const index = CATEGORY_ORDER.indexOf(category);
    return index === -1 ? CATEGORY_ORDER.length : index;
  };

  const categories = [...new Set(data.items.map((i) => i.category))]
    .sort((a, b) => rank(a) - rank(b));

  // TMs and tutors are what you look up mid-run; the 30 Heart Scale hiding
  // spots are not. Sort so the useful half of the table is the visible half.
  const ordered = data.items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => rank(a.item.category) - rank(b.item.category) || a.index - b.index)
    .map((entry) => entry.item);

  const places = [...new Set(data.items.flatMap((i) => i.places))]
    .sort((a, b) => {
      const routeA = /^Route (\d+)$/.exec(a);
      const routeB = /^Route (\d+)$/.exec(b);
      if (routeA && routeB) return Number(routeA[1]) - Number(routeB[1]);
      if (routeA) return -1;
      if (routeB) return 1;
      return a.localeCompare(b);
    });

  function row(item) {
    const label = item.move && item.name !== item.move
      ? item.name + " " + item.move
      : item.name;
    return el("tr", {
      dataset: {
        search: normalise([label, item.place, item.detail].filter(Boolean).join(" ")),
        category: item.category,
        places: item.places.join("|"),
      },
    },
      el("td", {},
        el("strong", { text: label }),
        item.owner && fragment(" ", monLink(item.owner, item.owner))),
      // Heart Scale / Rare Candy are their own category; don't say it twice.
      el("td", { class: "muted nowrap", text: item.category === item.name ? "" : item.category }),
      el("td", {},
        item.place && el("strong", { text: item.place + " — " }),
        item.detail,
        item.extra && el("span", { class: "muted", text: "  Yield: " + item.extra })));
  }

  function render(arg) {
    const rows = ordered.map(row);

    const searchBox = el("input", {
      type: "search", placeholder: "Search items, moves, hints…",
      "aria-label": "Search items", value: arg || "",
    });

    const placeSelect = el("select", { "aria-label": "Filter by place" },
      el("option", { value: "", text: "Anywhere" }),
      places.map((place) => el("option", { value: place, text: place })));

    const active = new Set();
    const chips = categories.map((category) =>
      el("button", {
        class: "chip", type: "button", "aria-pressed": "false", text: category,
        onclick(event) {
          const on = active.has(category);
          if (on) active.delete(category); else active.add(category);
          event.currentTarget.setAttribute("aria-pressed", String(!on));
          apply();
        },
      }));

    const count = el("span", { class: "count" });

    function apply() {
      const query = normalise(searchBox.value.trim());
      const place = placeSelect.value;
      let shown = 0;
      for (const node of rows) {
        const ok = (!query || node.dataset.search.includes(query))
          && (!active.size || active.has(node.dataset.category))
          && (!place || node.dataset.places.split("|").includes(place));
        node.hidden = !ok;
        if (ok) shown += 1;
      }
      count.textContent = shown + " of " + rows.length;
    }

    searchBox.addEventListener("input", apply);
    placeSelect.addEventListener("change", apply);
    apply();

    return fragment(
      el("div", { class: "page-head" }, el("h1", { text: "Items" }), count),
      el("div", { class: "controls" },
        searchBox,
        placeSelect,
        el("div", { class: "chips" }, chips)),
      el("p", { class: "hint", text: data.extras.evolutionItemNote }),
      table([{ label: "Item" }, { label: "Kind" }, { label: "Where" }], rows));
  }

  return { render };
})();
