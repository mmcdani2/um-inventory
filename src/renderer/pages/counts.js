export async function mountCounts() {
  const msg = document.getElementById("kMsg");
  const hint = document.getElementById("kHint");
  const btnLoad = document.getElementById("kLoad");
  const btnSave = document.getElementById("kSave");

  const kInit = document.getElementById("kInit");
  const kLoc = document.getElementById("kLoc");
  const tbody = document.querySelector("#kTable tbody");

  // Guard
  const missing = [];
  if (!msg) missing.push("kMsg");
  if (!hint) missing.push("kHint");
  if (!btnLoad) missing.push("kLoad");
  if (!btnSave) missing.push("kSave");
  if (!kInit) missing.push("kInit");
  if (!kLoc) missing.push("kLoc");
  if (!tbody) missing.push("#kTable tbody");
  if (missing.length)
    throw new Error(`Counts page missing: ${missing.join(", ")}`);

  function setMsg(t, err = false) {
    msg.textContent = t || "";
    msg.classList.toggle("err", !!err);
  }

  async function loadLocations() {
    const locs = await window.api.locationsList();
    kLoc.innerHTML =
      `<option value="">Select...</option>` +
      `<option value="__ALL__">All Areas</option>` +
      locs
        .map(
          (l) =>
            `<option value="${l.id}">${escapeHtml(l.code)}${
              l.name ? " — " + escapeHtml(l.name) : ""
            }</option>`,
        )
        .join("");
  }

  async function loadTable() {
    setMsg("");
    hint.textContent = "";
    btnSave.disabled = false;

    if (!kLoc.value) {
      setMsg("Select a location (or All Areas).", true);
      return;
    }

    const isAll = kLoc.value === "__ALL__";

    try {
      const [items, onhandRows, locs] = await Promise.all([
        window.api.itemsList(),
        window.api.reportsOnHand(),
        window.api.locationsList(),
      ]);

      const locByCode = new Map(locs.map((l) => [l.code, l]));

      if (isAll) {
        // rows = one per (location_code, sku) that exists in balances
        const rows = onhandRows
          .map((r) => {
            const loc = locByCode.get(r.location_code);
            return {
              location_id: loc?.id || 0,
              location_code: String(r.location_code ?? ""),
              sku: String(r.sku ?? ""),
              on_hand: Number(r.on_hand ?? 0),
            };
          })
          .filter((r) => r.location_id);

        const itemBySku = new Map(items.map((i) => [String(i.sku), i]));

        rows.sort((a, b) => {
          if (a.location_code !== b.location_code)
            return a.location_code.localeCompare(b.location_code);

          const ai = itemBySku.get(a.sku);
          const bi = itemBySku.get(b.sku);

          const aCat = String(ai?.category ?? "").toLowerCase();
          const bCat = String(bi?.category ?? "").toLowerCase();
          if (aCat !== bCat) return aCat.localeCompare(bCat);

          return a.sku.toLowerCase().localeCompare(b.sku.toLowerCase());
        });

        tbody.innerHTML = rows
          .map((r) => {
            const i = itemBySku.get(r.sku);
            if (!i) return "";
            return rowHtml(i, r.on_hand, r.location_code, r.location_id);
          })
          .join("");

        hint.textContent = `Loaded ${rows.length} row(s) for All Areas. Fill only what you counted.`;
      } else {
        const selectedLoc = locs.find(
          (l) => String(l.id) === String(kLoc.value),
        );
        const locCode = selectedLoc?.code;

        // Sum on-hand by SKU for this location
        const onHandBySku = new Map();
        for (const r of onhandRows) {
          if (r.location_code !== locCode) continue;
          const sku = String(r.sku ?? "");
          const qty = Number(r.on_hand ?? 0);
          onHandBySku.set(sku, (onHandBySku.get(sku) ?? 0) + qty);
        }

        const sorted = [...items].sort((a, b) => {
          const aCat = String(a.category ?? "").toLowerCase();
          const bCat = String(b.category ?? "").toLowerCase();
          if (aCat !== bCat) return aCat.localeCompare(bCat);
          return String(a.sku ?? "")
            .toLowerCase()
            .localeCompare(String(b.sku ?? "").toLowerCase());
        });

        tbody.innerHTML = sorted
          .map((i) => {
            const theo = onHandBySku.get(i.sku) ?? 0;
            return rowHtml(i, theo, null, null);
          })
          .join("");

        hint.textContent = `Loaded ${items.length} item(s) for ${locCode || "location"}. Fill only what you counted.`;
      }

      // variance math on input
      tbody.querySelectorAll("input[data-actual]").forEach((inp) => {
        inp.addEventListener("input", () => {
          const tr = inp.closest("tr");
          const theo = Number(tr.dataset.theo || 0);
          const act = Number(inp.value || 0);
          tr.querySelector("[data-variance]").textContent = String(act - theo);
        });
      });
    } catch (e) {
      setMsg(e.message || "Failed loading counts.", true);
    }
  }

  btnLoad.addEventListener("click", loadTable);

  btnSave.addEventListener("click", async () => {
    setMsg("");
    if (!kInit.value.trim()) return setMsg("User initials required.", true);
    if (!kLoc.value) return setMsg("Location required.", true);

    const isAll = kLoc.value === "__ALL__";
    const trs = Array.from(tbody.querySelectorAll("tr"));

    // Map SKU -> item_id
    const items = await window.api.itemsList();
    const itemIdBySku = new Map(items.map((i) => [String(i.sku), i.id]));

    const toSave = [];
    for (const tr of trs) {
      const inp = tr.querySelector("input[data-actual]");
      const raw = (inp?.value ?? "").trim();
      if (raw === "") continue;

      const actual = Number(raw);
      if (!Number.isFinite(actual) || actual < 0) {
        inp?.classList.add("bad");
        return setMsg(
          "Actual must be a number >= 0 (fix highlighted rows).",
          true,
        );
      }
      inp?.classList.remove("bad");

      const sku = tr.dataset.sku;
      const item_id = itemIdBySku.get(sku);
      if (!item_id) continue;

      const location_id = isAll
        ? Number(tr.dataset.locationId || 0)
        : Number(kLoc.value || 0);

      if (!location_id)
        return setMsg("Missing location on one or more rows. Reload.", true);

      toSave.push({ item_id, location_id, actual_qty: actual });
    }

    if (!toSave.length)
      return setMsg("Nothing to save. Enter at least one actual count.", true);

    btnSave.disabled = true;
    try {
      let saved = 0;
      for (const r of toSave) {
        await window.api.countsSubmit({
          user_initials: kInit.value,
          location_id: r.location_id,
          item_id: r.item_id,
          actual_qty: r.actual_qty,
          notes: isAll ? "All Areas table count" : "Table count",
        });
        saved++;
      }
      setMsg(`Saved ${saved} count(s).`);
      window.dispatchEvent(new CustomEvent("data:changed"));
    } catch (e) {
      setMsg(e.message || "Failed saving counts.", true);
    } finally {
      btnSave.disabled = false;
    }
  });

  await loadLocations();
}

function rowHtml(i, theo, areaLabel, locationId) {
  const isAllRow = locationId != null;

  return `
    <tr data-sku="${escapeHtml(i.sku)}" data-theo="${theo}" ${
      isAllRow ? `data-location-id="${Number(locationId)}"` : ""
    }>
      ${isAllRow ? `<td class="mono">${escapeHtml(areaLabel || "")}</td>` : ""}
      <td>${escapeHtml(i.category)}</td>
      <td class="mono">${escapeHtml(i.sku)}</td>
      <td>${escapeHtml(i.description)}</td>
      <td class="right mono">${theo}</td>
      <td class="right">
        <input class="input input-mini" data-actual="1" type="number" step="1" />
      </td>
      <td class="right mono" data-variance>0</td>
      <td>${escapeHtml(i.unit)}</td>
    </tr>
  `;
}

function escapeHtml(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
}
