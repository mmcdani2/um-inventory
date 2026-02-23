export async function mountHome() {
  const skus = document.getElementById("kpiSkus");
  const locs = document.getElementById("kpiLocs");
  const reorder = document.getElementById("kpiReorder");
  const tx7d = document.getElementById("kpiTx7d");

  const homeHint = document.getElementById("homeHint");

  const lMsg = document.getElementById("lMsg");
  const lCode = document.getElementById("lCode");
  const lName = document.getElementById("lName");
  const lSave = document.getElementById("lSave");
  const lCancel = document.getElementById("lCancel");

  const locTbody = document.querySelector("#locTable tbody");

  // Optional (only if present in HTML)
  const locHint = document.getElementById("locHint");

  // Guard ONLY required elements
  const missing = [];
  if (!skus) missing.push("kpiSkus");
  if (!locs) missing.push("kpiLocs");
  if (!reorder) missing.push("kpiReorder");
  if (!tx7d) missing.push("kpiTx7d");
  if (!homeHint) missing.push("homeHint");
  if (!lMsg) missing.push("lMsg");
  if (!lCode) missing.push("lCode");
  if (!lName) missing.push("lName");
  if (!lSave) missing.push("lSave");
  if (!lCancel) missing.push("lCancel");
  if (!locTbody) missing.push("#locTable tbody");
  if (missing.length) throw new Error(`Home page missing: ${missing.join(", ")}`);

  let editingId = null;
  let cachedLocations = [];

  function setLMsg(t, err = false) {
    lMsg.textContent = t || "";
    lMsg.classList.toggle("err", !!err);
  }

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[c]);

  function setModeEdit(on) {
    lSave.textContent = on ? "Save" : "Add";
    lCancel.disabled = !on;
  }

  function clearForm() {
    editingId = null;
    lCode.value = "";
    lName.value = "";
    setModeEdit(false);
    setLMsg("");
    lCode.focus();
  }

  async function load() {
    const [s, locList] = await Promise.all([
      window.api.homeStats(),
      window.api.locationsList(),
    ]);

    cachedLocations = locList;

    skus.textContent = String(s.total_skus ?? 0);
    locs.textContent = String(s.total_locations ?? 0);
    reorder.textContent = String(s.below_reorder ?? 0);
    tx7d.textContent = String(s.tx_7d ?? 0);

    homeHint.textContent =
      (s.total_locations ?? 0) === 0
        ? "No locations yet. Add at least SHOP-A1 and TRUCK-01."
        : "";

    locTbody.innerHTML = locList
      .map(
        (l) => `
          <tr data-id="${l.id}">
            <td class="mono">${esc(l.code)}</td>
            <td>${esc(l.name)}</td>
            <td class="mono">${esc(l.created_at)}</td>
          </tr>
        `,
      )
      .join("");

    if (locHint) {
      locHint.textContent = locList.length
        ? `${locList.length} location(s)`
        : "No locations yet.";
    }

    // click row to edit
    locTbody.querySelectorAll("tr[data-id]").forEach((tr) => {
      tr.addEventListener("click", () => {
        const id = Number(tr.dataset.id);
        const loc = cachedLocations.find((x) => Number(x.id) === id);
        if (!loc) return;

        editingId = id;
        lCode.value = loc.code || "";
        lName.value = loc.name || "";
        setModeEdit(true);
        setLMsg(`Editing: ${loc.code}`);
        lCode.focus();
      });
    });
  }

  async function save() {
    setLMsg("");
    lSave.disabled = true;

    try {
      if (!editingId) {
        await window.api.locationsCreate({ code: lCode.value, name: lName.value });
        setLMsg("Added.");
      } else {
        await window.api.locationsUpdate({
          id: editingId,
          code: lCode.value,
          name: lName.value,
        });
        setLMsg("Saved.");
      }

      window.dispatchEvent(new CustomEvent("data:changed"));
      await load();
      clearForm();
    } catch (e) {
      setLMsg(e.message || "Failed.", true);
    } finally {
      lSave.disabled = false;
    }
  }

  lSave.addEventListener("click", save);
  lCancel.addEventListener("click", clearForm);
  lName.addEventListener("keydown", (e) => {
    if (e.key === "Enter") save();
  });

  document
    .getElementById("btnExportInventoryCsv")
    ?.addEventListener("click", async () => {
      const [items, locs, onhandRows] = await Promise.all([
        window.api.itemsList(),
        window.api.locationsList(),
        window.api.reportsOnHand(),
      ]);

      const asOf = new Date().toISOString();

      const locCodes = locs
        .map((l) => String(l.code || "").trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));

      // sku -> (locCode -> qty)
      const bySku = new Map();
      for (const r of onhandRows) {
        const sku = String(r.sku ?? "").trim();
        const loc = String(r.location_code ?? "").trim();
        const qty = Number(r.on_hand ?? 0);
        if (!sku || !loc) continue;

        if (!bySku.has(sku)) bySku.set(sku, new Map());
        const m = bySku.get(sku);
        m.set(loc, (m.get(loc) ?? 0) + qty);
      }

      const headers = [
        { key: "as_of", label: "As Of" },
        { key: "category", label: "Category" },
        { key: "sku", label: "SKU / Part #" },
        { key: "description", label: "Description" },
        { key: "unit", label: "Unit" },
        { key: "reorder_point", label: "Reorder Pt" },
        { key: "reorder_qty", label: "Reorder Qty" },
        { key: "default_cost", label: "Cost" },
        { key: "on_hand_total", label: "On Hand Total" },
        ...locCodes.map((code) => ({ key: `loc_${code}`, label: code })),
      ];

      const rows = items.map((i) => {
        const sku = String(i.sku ?? "").trim();
        const locMap = bySku.get(sku) || new Map();

        const row = {
          as_of: asOf,
          category: i.category ?? "",
          sku,
          description: i.description ?? "",
          unit: i.unit ?? "",
          reorder_point: Number(i.reorder_point ?? 0),
          reorder_qty: Number(i.reorder_qty ?? 0),
          default_cost: Number(i.default_cost ?? 0),
          on_hand_total: Number(i.on_hand_total ?? 0),
        };

        for (const code of locCodes)
          row[`loc_${code}`] = Number(locMap.get(code) ?? 0);
        return row;
      });

      // Uses your existing CSV utils used on Items page
      const { toCsv, downloadCsv } = await import("../utils/csv.js");
      const csv = toCsv(rows, headers);
      const stamp = asOf.replace(/[:.]/g, "-");
      downloadCsv(`inventory_snapshot_${stamp}.csv`, csv);
    });

  // Quick Actions: router uses #routeId (no slash)
  document.querySelectorAll("[data-go]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const go = btn.dataset.go;
      if (!go) return;
      location.hash = `#${go}`;
    });
  });

  // DB reset button exists only on Home
  document.getElementById("btnDbReset")?.addEventListener("click", async () => {
    if (!confirm("Wipe ALL data (items, locations, balances, transactions)? This cannot be undone.")) return;
    await window.api.dbReset();
    window.dispatchEvent(new CustomEvent("data:changed"));
    alert("Database wiped.");
  });

  window.addEventListener("data:changed", load);

  await load();
  clearForm();
}