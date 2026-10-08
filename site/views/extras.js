/* Everything that is not a wild encounter: prizes, trades, gifts, fossils,
   roamers, and the list of Pokemon the hack leaves out. */

Dex.views.extras = (function () {
  const { data, el, fragment, monLink, panel, table } = Dex;

  const monList = (entries) =>
    el("span", { class: "mon-row" },
      entries.map((entry) => monLink(entry.key, entry.name)));

  function render() {
    const extras = data.extras;

    const gameCorner = panel("Game Corner prizes",
      table([{ label: "Badge" }, { label: "You can receive" }],
        extras.gameCorner.rewards.map((reward) => el("tr", {},
          el("td", { class: "nowrap", text: reward.badge }),
          el("td", {}, monList(reward.pokemon))))),
      { note: extras.gameCorner.note });

    const trades = panel("In-game trades",
      table([{ label: "Hand over" }, { label: "Where" }, { label: "You get" }],
        extras.trades.map((trade) => el("tr", {},
          el("td", { text: trade.wanted }),
          el("td", {}, el("a", { href: "#/locations/" + encodeURIComponent(trade.location),
            text: trade.location })),
          el("td", { text: trade.offered })))));

    const gifts = panel("Gifts",
      table([{ label: "Where" }, { label: "What" }],
        extras.gifts.map((gift) => el("tr", {},
          el("td", { text: gift.location }),
          el("td", { text: gift.pokemon })))));

    const fossils = panel("Fossils",
      table([{ label: "Where" }, { label: "Details" }],
        extras.fossils.map((fossil) => el("tr", {},
          el("td", { class: "nowrap", text: fossil.location }),
          el("td", { text: fossil.detail })))));

    const roaming = panel("Roaming legendaries",
      fragment(extras.roaming.map((roamer) => fragment(
        el("p", { class: "hint", text: "Routes " + roamer.routes }),
        monList(roamer.pokemon)))),
      { note: "Available after the story event at Sootopolis City." });

    const unavailable = panel("Not in the hack",
      fragment(extras.unavailable.map((group) => el("div", { class: "gen-block" },
        el("span", { class: "label", text: group.generation }),
        el("p", { class: "muted", text: group.pokemon.join(", ") })))));

    return fragment(
      el("div", { class: "page-head" }, el("h1", { text: "Extras" })),
      el("div", { class: "cols" },
        fragment(gameCorner, trades, gifts),
        fragment(roaming, fossils)),
      unavailable);
  }

  return { render };
})();
