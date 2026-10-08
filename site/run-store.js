/* Where the current run's encounter log lives.
   One run at a time, kept in localStorage, saved on every change.

   Storage on a file:// page is shared by every local page in this browser and
   is wiped when you clear browsing data, so the Run screen also offers an
   export file. That is the real backup; this is the convenience. */

window.RunStore = (function () {
  const KEY = "runbun.run.v1";
  const STATUSES = ["caught", "skipped", "lost"];

  let state = { name: "", entries: {} };
  let broken = null;
  const listeners = [];

  function read() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        state = { name: parsed.name || "", entries: parsed.entries || {} };
      }
    } catch (error) {
      broken = "Could not read saved run data: " + error.message;
    }
  }

  function write() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      broken = null;
    } catch (error) {
      broken = "Could not save: " + error.message
        + ". Export your run before closing this tab.";
    }
    for (const listener of listeners) listener(state);
  }

  const get = (location) => state.entries[location] || { status: "", mon: "", note: "" };

  /** Writes one field. Empty entries are dropped so the blob stays small. */
  function set(location, patch) {
    const next = { ...get(location), ...patch };
    if (!next.status && !next.mon && !next.note) delete state.entries[location];
    else state.entries[location] = next;
    write();
  }

  function toggleStatus(location, status) {
    const current = get(location).status;
    set(location, { status: current === status ? "" : status });
  }

  function reset(location) {
    delete state.entries[location];
    write();
  }

  function resetAll(keepName) {
    state = { name: keepName ? state.name : "", entries: {} };
    write();
  }

  const setName = (name) => { state.name = name; write(); };

  function counts(locations) {
    const tally = { caught: 0, skipped: 0, lost: 0, untouched: 0 };
    for (const location of locations) {
      const status = get(location).status;
      tally[STATUSES.includes(status) ? status : "untouched"] += 1;
    }
    return tally;
  }

  function exportBlob() {
    return new Blob(
      [JSON.stringify({ ...state, exported: new Date().toISOString() }, null, 2)],
      { type: "application/json" });
  }

  /** Replaces the whole run. Throws with a readable message on bad input. */
  function importJson(text) {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || typeof parsed.entries !== "object") {
      throw new Error("That file is not a Run & Bun run export.");
    }
    state = { name: parsed.name || "", entries: parsed.entries };
    write();
  }

  read();

  return {
    STATUSES,
    get, set, toggleStatus, reset, resetAll, setName, counts,
    exportBlob, importJson,
    all: () => state,
    problem: () => broken,
    subscribe: (fn) => listeners.push(fn),
  };
})();
