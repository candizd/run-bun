/* Locations: the encounter table for a place, plus anything you can pick up
   there. Four places have a second "temp" table; those get a toggle. */

Dex.views.locations = (function () {
  const { data, el, fragment, monLink, panel, table, rateCell, normalise } = Dex;

  const METHOD_ORDER = ["Land", "Surf", "Fishing", "Rock Smash", "Underwater", "Other"];

  const methodRank = (method) => {
    const index = METHOD_ORDER.indexOf(method);
    return index === -1 ? METHOD_ORDER.length : index;
  };

  function slotRows(slots) {
    return slots.map((slot) => el("tr", {},
      el("td", {}, monLink(slot.key, slot.name, {
        label: slot.name, sprite: data.forms[slot.name] && data.forms[slot.name].sprite,
      })),
      el("td", { class: "num lv", text: slot.levels || "—" }),
      rateCell(slot.rate),
      el("td", {},
        slot.tag && el("span", { class: "tag " + slot.tag.toLowerCase(), text: slot.tag }),
        slot.form && el("span", { class: "tag", text: slot.form }))));
  }

  function methodTables(slots) {
    const groups = new Map();
    for (const slot of slots) {
      if (!groups.has(slot.method)) groups.set(slot.method, []);
      groups.get(slot.method).push(slot);
    }
    const ordered = [...groups.entries()].sort((a, b) => methodRank(a[0]) - methodRank(b[0]));
    if (!ordered.length) {
      return el("p", { class: "empty", text: "No wild encounters here." });
    }
    return fragment(ordered.map(([method, group]) =>
      panel(method, table(
        [{ label: "Pokémon" }, { label: "Level", align: "right" },
         { label: "Rate", align: "right" }, { label: "Notes" }],
        slotRows(group), "fill-first"))));
  }

  function itemsAt(name) {
    const found = data.items.filter((item) => item.places.includes(name));
    if (!found.length) return null;
    const rows = found.map((item) => el("tr", {},
      el("td", {}, el("a", { href: "#/items/" + encodeURIComponent(item.name),
        text: item.move ? item.name + " " + item.move : item.name })),
      el("td", { class: "muted", text: item.category }),
      el("td", { text: [item.place, item.detail].filter(Boolean).join(" — ") })));
    return panel("Items found here", table(
      [{ label: "Item" }, { label: "Kind" }, { label: "Where exactly" }], rows));
  }

  function detail(name) {
    const location = Dex.locationsByName.get(name);
    if (!location) return el("p", { class: "empty", text: "No location by that name." });

    const body = el("div", {});
    const paint = (slots) => body.replaceChildren(methodTables(slots));

    let toggle = null;
    if (location.tempSlots) {
      const buttons = [
        ["Normal", location.slots],
        ["Temp", location.tempSlots],
      ].map(([label, slots], index) => el("button", {
        class: "chip", type: "button", text: label,
        "aria-pressed": index === 0 ? "true" : "false",
        onclick(event) {
          for (const other of toggle.children) other.setAttribute("aria-pressed", "false");
          event.currentTarget.setAttribute("aria-pressed", "true");
          paint(slots);
        },
      }));
      toggle = el("div", { class: "method-tabs" }, buttons);
    }

    paint(location.slots);

    return fragment(
      el("a", { class: "back-link", href: "#/locations", text: "← All locations" }),
      el("div", { class: "page-head" },
        el("h1", { text: name }),
        el("span", { class: "count", text: location.slots.length + " slots" })),
      // Log the encounter without leaving the table you are reading.
      el("div", { class: "run-inline" },
        Dex.views.run.trackerRow(location, null, "This run")),
      location.tempSlots && el("p", { class: "hint" },
        "This route's encounters differ between the normal and temp tables."),
      toggle,
      body,
      itemsAt(name));
  }

  function index() {
    const count = el("span", { class: "count" });
    const cards = data.locations.map((location) => {
      const mons = new Set(location.slots.map((s) => s.name));
      const entry = RunStore.get(location.name);
      return el("a", {
        class: "list-card",
        href: "#/locations/" + encodeURIComponent(location.name),
        dataset: { name: normalise(location.name), status: entry.status || "untouched" },
        title: entry.status
          ? Dex.views.run.STATUS_LABELS[entry.status] + (entry.mon ? ": " + entry.mon : "")
          : null,
      },
        el("span", { class: "list-name" },
          el("span", { class: "run-dot is-" + (entry.status || "untouched") }),
          location.name),
        el("span", { class: "list-meta", text: entry.mon || mons.size + " species" }));
    });

    const searchBox = el("input", {
      type: "search", placeholder: "Filter places…", "aria-label": "Filter locations",
    });

    function apply() {
      const query = normalise(searchBox.value.trim());
      let shown = 0;
      for (const card of cards) {
        const ok = !query || card.dataset.name.includes(query);
        card.classList.toggle("is-hidden", !ok);
        if (ok) shown += 1;
      }
      count.textContent = shown + " of " + cards.length;
    }

    searchBox.addEventListener("input", apply);
    apply();

    return fragment(
      el("div", { class: "page-head" }, el("h1", { text: "Locations" }), count),
      el("div", { class: "controls" }, searchBox),
      el("div", { class: "list-grid" }, cards));
  }

  return { render: (arg) => (arg ? detail(arg) : index()) };
})();
