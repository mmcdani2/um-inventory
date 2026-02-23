// TODO (Counts engine hardening):
// - Decide if "All Areas" stays; if yes, fix header alignment + improve UX.
// - Print count sheets:
//   - per-location printable view (Category -> SKU order, blank Actual column)
//   - include header (Location, date, user initials) + page numbers.
// - Fast entry mode:
//   - Enter on Actual field jumps to next row’s Actual
//   - Arrow up/down also moves between Actual inputs
//   - Optional: auto-focus first Actual after Load
// - Ensure initial counts create inventory_balances rows (UPSERT) reliably.
// - Add “show zeros” toggle in single-location mode.
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

      const itemBySku = new Map(items.map((i) => [String(i.sku), i]));
      const locByCode = new Map(locs.map((l) => [String(l.code), l]));

      // Prebuild location select options (All Areas rows)
      const locOptionsHtml =
        `<option value="">Select...</option>` +
        locs
          .slice()
          .sort((a, b) => String(a.code).localeCompare(String(b.code)))
          .map((l) => `<option value="${l.id}">${escapeHtml(l.code)}</option>`)
          .join("");

      // Build: location_id|sku -> on_hand (for theoretical lookup)
      const onHandByLocSku = new Map();
      for (const r of onhandRows) {
        const loc = locByCode.get(String(r.location_code ?? ""));
        if (!loc) continue;

        const sku = String(r.sku ?? "");
        const key = `${loc.id}|${sku}`;
        const qty = Number(r.on_hand ?? 0);

        onHandByLocSku.set(key, (onHandByLocSku.get(key) ?? 0) + qty);
      }

      if (isAll) {
        // For each sku, detect if it exists in exactly one location (preselect)
        const locIdsBySku = new Map(); // sku -> Set(location_id)
        for (const r of onhandRows) {
          const sku = String(r.sku ?? "");
          const loc = locByCode.get(String(r.location_code ?? ""));
          if (!sku || !loc) continue;

          if (!locIdsBySku.has(sku)) locIdsBySku.set(sku, new Set());
          locIdsBySku.get(sku).add(loc.id);
        }

        // Sort: preselected location_code (if exactly one) -> category -> sku
        const sorted = [...items].sort((a, b) => {
          const aSku = String(a.sku ?? "");
          const bSku = String(b.sku ?? "");

          const aSet = locIdsBySku.get(aSku);
          const bSet = locIdsBySku.get(bSku);

          const aLocId = aSet && aSet.size === 1 ? [...aSet][0] : 0;
          const bLocId = bSet && bSet.size === 1 ? [...bSet][0] : 0;

          const aCode = aLocId
            ? locs.find((l) => l.id === aLocId)?.code || ""
            : "ZZZ";
          const bCode = bLocId
            ? locs.find((l) => l.id === bLocId)?.code || ""
            : "ZZZ";
          if (aCode !== bCode) return aCode.localeCompare(bCode);

          const aCat = String(a.category ?? "").toLowerCase();
          const bCat = String(b.category ?? "").toLowerCase();
          if (aCat !== bCat) return aCat.localeCompare(bCat);

          return aSku.toLowerCase().localeCompare(bSku.toLowerCase());
        });

        tbody.innerHTML = sorted
          .map((i) => {
            const sku = String(i.sku ?? "");
            const set = locIdsBySku.get(sku);
            const preLocId = set && set.size === 1 ? String([...set][0]) : "";

            const theo = preLocId
              ? (onHandByLocSku.get(`${preLocId}|${sku}`) ?? 0)
              : 0;

            return `
              <tr data-sku="${escapeHtml(sku)}" data-theo="${theo}">
                <td>
                  <select class="input input-mini" data-row-loc="1">
                    ${locOptionsHtml}
                  </select>
                </td>
                <td>${escapeHtml(i.category)}</td>
                <td class="mono">${escapeHtml(i.sku)}</td>
                <td>${escapeHtml(i.description)}</td>
                <td class="right mono" data-theo-cell>${theo}</td>
                <td class="right">
                  <input class="input input-mini" data-actual="1" type="number" step="1" />
                </td>
                <td class="right mono" data-variance>0</td>
                <td>${escapeHtml(i.unit)}</td>
              </tr>
            `;
          })
          .join("");

        // Preselect location and update theoretical when location changes
        tbody.querySelectorAll("tr").forEach((tr) => {
          const sku = tr.dataset.sku;
          const sel = tr.querySelector("[data-row-loc]");
          const theoCell = tr.querySelector("[data-theo-cell]");
          const inp = tr.querySelector("input[data-actual]");

          // Preselect if exactly one location already holds it
          const set = locIdsBySku.get(sku);
          if (set && set.size === 1) sel.value = String([...set][0]);

          const recalc = () => {
            const locId = Number(sel.value || 0);
            const theo = locId
              ? (onHandByLocSku.get(`${locId}|${sku}`) ?? 0)
              : 0;
            tr.dataset.theo = String(theo);
            theoCell.textContent = String(theo);

            const act = Number(inp.value || 0);
            tr.querySelector("[data-variance]").textContent = String(
              act - theo,
            );
          };

          sel.addEventListener("change", recalc);
        });

        hint.textContent = `All Areas: ${items.length} SKU(s). Pick a Location for each row you count.`;
      } else {
        const selectedLoc = locs.find(
          (l) => String(l.id) === String(kLoc.value),
        );
        const locCode = selectedLoc?.code;

        // Single location: only rows that exist in balances for that location
        const rows = onhandRows
          .filter(
            (r) => String(r.location_code ?? "") === String(locCode ?? ""),
          )
          .map((r) => ({
            sku: String(r.sku ?? ""),
            theo: Number(r.on_hand ?? 0),
          }));

        rows.sort((a, b) => {
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
            return rowHtmlSingle(i, r.theo);
          })
          .join("");

        hint.textContent = `Loaded ${rows.length} row(s) for ${locCode || "location"}. Fill only what you counted.`;
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
        ? Number(tr.querySelector("[data-row-loc]")?.value || 0)
        : Number(kLoc.value || 0);

      if (isAll && !location_id) {
        inp?.classList.add("bad");
        return setMsg(
          "Pick a Location for each row you count (All Areas mode).",
          true,
        );
      }

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

function rowHtmlSingle(i, theo) {
  return `
    <tr data-sku="${escapeHtml(i.sku)}" data-theo="${theo}">
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
