/* The run log: one row per location, in game order, recording what you took
   there. Locations are listed in the order the source workbook lists them,
   which is the order you reach them. */

Dex.views.run = (function () {
  const { data, byKey, el, fragment, spriteUrl, normalise } = Dex;

  const STATUS_LABELS = { caught: "Caught", skipped: "Skipped", lost: "Lost" };
  const STATUS_HINTS = {
    caught: "You have this one",
    skipped: "Passed on it — you can still come back",
    lost: "Encounter burned: it fainted or fled",
  };

  /** Every species you could log at a place, for the row's suggestion list. */
  const speciesAt = (location) => [...new Set(
    [...location.slots, ...(location.tempSlots || [])].map((slot) => slot.name))].sort();

  const monFor = (name) => byKey.get(normalise(name).replace(/[^a-z0-9]/g, ""));

  /* ---------- one location row, reused on the Locations pages ---------- */

  /** `label` replaces the location link when the page heading already names it. */
  function trackerRow(location, onChange, label) {
    const name = location.name;
    const listId = "species-" + normalise(name).replace(/[^a-z0-9]+/g, "-");

    const portrait = el("span", { class: "run-portrait" });
    const monInput = el("input", {
      type: "text", list: listId, placeholder: "What did you get?",
      "aria-label": "Caught at " + name, value: RunStore.get(name).mon || "",
    });

    const buttons = RunStore.STATUSES.map((status) => el("button", {
      class: "chip run-status is-" + status, type: "button",
      text: STATUS_LABELS[status], title: STATUS_HINTS[status],
      onclick() { RunStore.toggleStatus(name, status); refresh(); onChange && onChange(); },
    }));

    const note = el("input", {
      type: "text", class: "run-note", placeholder: "Note",
      "aria-label": "Note for " + name, value: RunStore.get(name).note || "",
    });

    function refresh() {
      const entry = RunStore.get(name);
      buttons.forEach((button, index) =>
        button.setAttribute("aria-pressed",
          String(entry.status === RunStore.STATUSES[index])));
      monInput.value = entry.mon || "";
      note.value = entry.note || "";
      const mon = entry.mon && monFor(entry.mon);
      portrait.replaceChildren(mon
        ? el("img", { src: spriteUrl(mon.sprite), alt: mon.name, title: mon.name })
        : el("span", { class: "run-portrait-blank", text: entry.mon ? "?" : "" }));
      row.dataset.status = entry.status || "untouched";
    }

    monInput.addEventListener("change", () => {
      RunStore.set(name, { mon: monInput.value.trim() });
      refresh();
      onChange && onChange();
    });
    note.addEventListener("change", () => RunStore.set(name, { note: note.value.trim() }));

    const row = el("div", { class: "run-row" },
      label
        ? el("span", { class: "run-place label", text: label })
        : el("a", { class: "run-place", href: "#/locations/" + encodeURIComponent(name),
            text: name }),
      el("div", { class: "run-status-group" }, buttons),
      el("label", { class: "run-catch" }, portrait, monInput,
        el("datalist", { id: listId },
          speciesAt(location).map((species) => el("option", { value: species })))),
      note,
      el("button", {
        class: "run-reset", type: "button", title: "Clear this location",
        "aria-label": "Clear " + name, text: "↺",
        onclick() { RunStore.reset(name); refresh(); onChange && onChange(); },
      }));

    refresh();
    return row;
  }

  /* ---------- summary ---------- */

  function summary(names) {
    const tally = RunStore.counts(names);
    const done = tally.caught + tally.skipped + tally.lost;
    const bar = el("div", { class: "run-bar" },
      RunStore.STATUSES.map((status) => el("span", {
        class: "is-" + status,
        style: "width:" + ((tally[status] / names.length) * 100).toFixed(2) + "%",
      })));

    return el("div", { class: "run-summary" },
      bar,
      el("div", { class: "run-tallies" },
        RunStore.STATUSES.map((status) => el("span", { class: "run-tally is-" + status },
          el("b", { text: String(tally[status]) }), " " + STATUS_LABELS[status])),
        el("span", { class: "run-tally" },
          el("b", { text: String(tally.untouched) }), " untouched"),
        el("span", { class: "run-tally muted", text: done + " of " + names.length + " logged" })));
  }

  /* ---------- page ---------- */

  function render() {
    const locations = data.locations;
    const names = locations.map((l) => l.name);

    const summaryHost = el("div", {});
    const paintSummary = () => summaryHost.replaceChildren(summary(names));

    const rows = locations.map((location) => trackerRow(location, paintSummary));
    paintSummary();

    const runName = el("input", {
      type: "text", class: "run-name", placeholder: "Name this run",
      "aria-label": "Run name", value: RunStore.all().name || "",
    });
    runName.addEventListener("change", () => RunStore.setName(runName.value.trim()));

    const searchBox = el("input", {
      type: "search", placeholder: "Filter places…", "aria-label": "Filter locations",
    });

    let statusFilter = "";
    const filterChips = [
      ["", "All"],
      ["untouched", "Untouched"],
      ...RunStore.STATUSES.map((status) => [status, STATUS_LABELS[status]]),
    ].map(([value, label], index) => el("button", {
      class: "chip", type: "button", text: label,
      "aria-pressed": index === 0 ? "true" : "false",
      onclick(event) {
        statusFilter = value;
        for (const chip of event.currentTarget.parentNode.children) {
          chip.setAttribute("aria-pressed", String(chip === event.currentTarget));
        }
        apply();
      },
    }));

    function apply() {
      const query = normalise(searchBox.value.trim());
      for (const row of rows) {
        const place = normalise(row.querySelector(".run-place").textContent);
        const ok = (!query || place.includes(query))
          && (!statusFilter || row.dataset.status === statusFilter);
        row.classList.toggle("is-hidden", !ok);
      }
    }
    searchBox.addEventListener("input", apply);

    const fileInput = el("input", {
      type: "file", accept: "application/json,.json", hidden: true,
      onchange(event) {
        const file = event.currentTarget.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            RunStore.importJson(String(reader.result));
            window.location.reload();
          } catch (error) {
            window.alert(error.message);
          }
        };
        reader.readAsText(file);
        event.currentTarget.value = "";
      },
    });

    const actions = el("div", { class: "run-actions" },
      el("button", {
        class: "chip", type: "button", text: "Export backup",
        onclick() {
          const url = URL.createObjectURL(RunStore.exportBlob());
          const link = el("a", {
            href: url,
            download: "run-and-bun-" + (RunStore.all().name || "run").replace(/\W+/g, "-")
              + ".json",
          });
          document.body.append(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 2000);
        },
      }),
      el("button", {
        class: "chip", type: "button", text: "Import backup",
        onclick() { fileInput.click(); },
      }),
      el("button", {
        class: "chip danger", type: "button", text: "Start a new run",
        onclick() {
          if (!window.confirm("Clear every location in this run? Export a backup first "
            + "if you want to keep it.")) return;
          RunStore.resetAll(false);
          window.location.reload();
        },
      }),
      fileInput);

    const problem = RunStore.problem();

    return fragment(
      el("div", { class: "page-head" },
        el("h1", { text: "Run log" }),
        el("span", { class: "count", text: names.length + " locations" })),
      problem && el("p", { class: "run-problem", text: problem }),
      el("div", { class: "controls" }, runName, actions),
      summaryHost,
      el("p", { class: "hint" },
        "Saved in this browser as you type. Clearing browsing data wipes it, "
        + "so export a backup before anything you would hate to redo."),
      el("div", { class: "controls" }, searchBox, el("div", { class: "chips" }, filterChips)),
      el("div", { class: "run-list" }, rows));
  }

  return { render, trackerRow, STATUS_LABELS };
})();
