/* Shell: routing, shared DOM helpers, and the global finder.
   Views register themselves into Dex.views and render into #view. */

window.Dex = (function () {
  const data = window.DEX;
  const byKey = new Map(data.pokemon.map((p) => [p.key, p]));
  const locationsByName = new Map(data.locations.map((l) => [l.name, l]));

  const views = {};
  const viewRoot = document.getElementById("view");

  /* ---------- DOM helpers ---------- */

  function el(tag, props, ...children) {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(props || {})) {
      if (value === null || value === undefined || value === false) continue;
      if (name === "class") node.className = value;
      else if (name === "text") node.textContent = value;
      else if (name.startsWith("on")) node.addEventListener(name.slice(2), value);
      else if (name === "dataset") Object.assign(node.dataset, value);
      else node.setAttribute(name, value === true ? "" : value);
    }
    for (const child of children.flat()) {
      if (child === null || child === undefined || child === false) continue;
      node.append(child instanceof Node ? child : document.createTextNode(child));
    }
    return node;
  }

  const fragment = (...children) => {
    const frag = document.createDocumentFragment();
    frag.append(...children.flat().filter(Boolean));
    return frag;
  };

  /* ---------- shared pieces ---------- */

  const spriteUrl = (file) => (file ? "sprites/" + file : null);

  function typeBadges(types) {
    return el("div", { class: "types" },
      types.map((t) => el("span", { class: "type-badge t-" + t, text: t })));
  }

  /** A sprite + name that navigates to the Pokemon, or greys out if unknown. */
  function monLink(key, name, options) {
    const mon = byKey.get(key);
    const settings = options || {};
    const label = settings.label || (mon ? mon.name : name);
    const sprite = spriteUrl(settings.sprite || (mon && mon.sprite));

    const contents = [
      sprite && el("img", { src: sprite, alt: "", loading: "lazy" }),
      el("span", { text: label }),
      settings.note && el("span", { class: "tag", text: settings.note }),
    ];

    if (!mon) {
      return el("span", { class: "mon-link dead", title: "No learnset data in the source files" },
        contents);
    }
    return el("a", { class: "mon-link", href: "#/pokemon/" + key }, contents);
  }

  function panel(title, body, options) {
    const settings = options || {};
    return el("section", { class: "panel" },
      el("div", { class: "panel-head" },
        el("h2", { text: title }),
        settings.note && el("p", { text: settings.note }),
        settings.aside),
      el("div", { class: "panel-body" }, body));
  }

  /** `tableClass` is for layout variants, e.g. "fill-first" to let column one
      absorb the slack so numeric columns stay hugged to the right. */
  function table(headers, rows, tableClass) {
    if (!rows.length) return el("p", { class: "empty", text: "Nothing here." });
    return el("div", { class: "table-wrap" },
      el("table", { class: tableClass || null },
        el("thead", {}, el("tr", {}, headers.map((h) =>
          el("th", { class: h.align === "right" ? "num" : null, text: h.label || h })))),
        el("tbody", {}, rows)));
  }

  function rateCell(rate) {
    if (rate === null || rate === undefined) return el("td", { class: "num muted", text: "—" });
    return el("td", { class: "num" },
      el("span", { class: "rate-cell" },
        el("span", { text: rate + "%" }),
        el("span", { class: "rate-bar" },
          el("span", { style: "width:" + Math.min(100, rate) + "%" }))));
  }

  const normalise = (s) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  /* ---------- routing ---------- */

  function parseHash() {
    const raw = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
    const [name, ...rest] = raw.split("/");
    return { view: name || "dex", arg: rest.join("/") };
  }

  function render() {
    const route = parseHash();
    const view = views[route.view] || views.dex;

    for (const tab of document.querySelectorAll("#tabs a")) {
      tab.toggleAttribute("aria-current", tab.dataset.view === route.view);
      if (tab.dataset.view === route.view) tab.setAttribute("aria-current", "page");
    }

    viewRoot.replaceChildren();
    viewRoot.append(view.render(route.arg));
    if (!route.arg) window.scrollTo({ top: 0 });
    else document.documentElement.scrollTop = 0;
  }

  const go = (hash) => { location.hash = hash; };

  /* ---------- global finder ---------- */

  function buildFinderIndex() {
    const entries = [];
    for (const mon of data.pokemon) {
      entries.push({ group: "Pokémon", label: mon.name, hash: "#/pokemon/" + mon.key,
        sprite: mon.sprite, search: normalise(mon.name) });
    }
    for (const location of data.locations) {
      entries.push({ group: "Location", label: location.name,
        hash: "#/locations/" + encodeURIComponent(location.name),
        search: normalise(location.name) });
    }
    for (const item of data.items) {
      const label = item.move ? item.name + " " + item.move : item.name;
      entries.push({ group: item.category, label, hash: "#/items/" + encodeURIComponent(item.name),
        detail: item.places.join(", "), search: normalise(label) });
    }
    // Level-up moves, so "who learns Protect and where do I get it" is one search.
    const moves = new Map();
    for (const mon of data.pokemon) {
      for (const move of mon.moves) {
        if (!moves.has(move.move)) moves.set(move.move, 0);
        moves.set(move.move, moves.get(move.move) + 1);
      }
    }
    for (const [move, count] of moves) {
      entries.push({ group: "Move", label: move, hash: "#/dex/move/" + encodeURIComponent(move),
        detail: count + " learn it", search: normalise(move) });
    }
    return entries;
  }

  function setupFinder() {
    const input = document.getElementById("finder-input");
    const results = document.getElementById("finder-results");
    let index = null;
    let hits = [];
    let cursor = -1;

    const close = () => { results.hidden = true; cursor = -1; };

    function paint() {
      results.replaceChildren();
      if (!hits.length) { close(); return; }
      let group = null;
      hits.forEach((hit, i) => {
        if (hit.group !== group) {
          group = hit.group;
          results.append(el("span", { class: "label", text: group }));
        }
        results.append(el("a", {
          class: "finder-hit" + (i === cursor ? " active" : ""),
          href: hit.hash,
          onclick: () => { input.value = ""; close(); },
        },
          hit.sprite && el("img", { src: spriteUrl(hit.sprite), alt: "" }),
          el("span", { text: hit.label }),
          hit.detail && el("small", { text: hit.detail })));
      });
      results.hidden = false;
    }

    function search() {
      const query = normalise(input.value.trim());
      if (query.length < 2) { hits = []; close(); return; }
      if (!index) index = buildFinderIndex();
      const starts = [];
      const contains = [];
      for (const entry of index) {
        const at = entry.search.indexOf(query);
        if (at === 0) starts.push(entry);
        else if (at > 0) contains.push(entry);
        if (starts.length > 40) break;
      }
      hits = starts.concat(contains).slice(0, 24);
      cursor = -1;
      paint();
    }

    input.addEventListener("input", search);
    input.addEventListener("focus", search);

    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { input.value = ""; close(); input.blur(); }
      if (!hits.length) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        cursor = (cursor + (event.key === "ArrowDown" ? 1 : -1) + hits.length) % hits.length;
        paint();
        const active = results.querySelector(".finder-hit.active");
        if (active) active.scrollIntoView({ block: "nearest" });
      }
      if (event.key === "Enter") {
        event.preventDefault();
        go(hits[Math.max(0, cursor)].hash);
        input.value = "";
        close();
        input.blur();
      }
    });

    document.addEventListener("click", (event) => {
      if (!event.target.closest(".finder")) close();
    });

    document.addEventListener("keydown", (event) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
      if (event.key === "/" && !typing) { event.preventDefault(); input.focus(); }
      if (event.key === "k" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        input.focus();
        input.select();
      }
    });
  }

  function start() {
    setupFinder();
    window.addEventListener("hashchange", render);
    render();
  }

  return {
    data, byKey, locationsByName, views,
    el, fragment, spriteUrl, typeBadges, monLink, panel, table, rateCell,
    normalise, go, start,
  };
})();
