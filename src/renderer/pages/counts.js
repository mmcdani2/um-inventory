export async function mountCounts() {
  const msg = document.getElementById("kMsg");
  const hint = document.getElementById("kHint");
  const btnLoad = document.getElementById("kLoad");
  const btnSave = document.getElementById("kSave");

  const kInit = document.getElementById("kInit");
  const kLoc = document.getElementById("kLoc");
  const tbody = document.querySelector("#kTable tbody");

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
            `<option value="${l.id}">${escapeHtml(l.code)}${l.name ? " — " + escapeHtml(l.name) : ""}</option>`,
        )
        .join("");
  }

  async function loadTable() {
    setMsg("");
    hint.textContent = "";
    btnSave.disabled = false;

    if (!kLoc.value) {
      setMsg("Select a location.", true);
      return;
    }

    const [items, onhandRows] = await Promise.all([
      window.api.itemsList(),
      window.api.reportsOnHand(), // we’ll filter by location id via code match below (simple for now)
    ]);

    // Build a map: location_code + sku -> on_hand
    // We only have location_code in reportsOnHand. So we’ll map selected location id -> code.
    const locs = await window.api.locationsList();
    const selectedLoc = locs.find((l) => String(l.id) === String(kLoc.value));
    const locCode = selectedLoc?.code;

    const onHandBySku = new Map();
    for (const r of onhandRows) {
      if (r.location_code === locCode)
        onHandBySku.set(r.sku, Number(r.on_hand ?? 0));
    }

    tbody.innerHTML = items
      .map((i) => {
        const theo = onHandBySku.get(i.sku) ?? 0;
        return rowHtml(i, theo);
      })
      .join("");

    // variance math on input
    tbody.querySelectorAll("input[data-actual]").forEach((inp) => {
      inp.addEventListener("input", () => {
        const tr = inp.closest("tr");
        const theo = Number(tr.dataset.theo || 0);
        const act = Number(inp.value || 0);
        const v = act - theo;
        tr.querySelector("[data-variance]").textContent = String(v);
      });
    });

    hint.textContent = `${items.length} item(s) loaded for ${locCode || "location"}. Fill only what you counted.`;
  }

  btnLoad.addEventListener("click", loadTable);
  btnSave.addEventListener("click", async () => {
    setMsg("");
    if (!kInit.value.trim()) {
      setMsg("User initials required.", true);
      return;
    }
    if (!kLoc.value) {
      setMsg("Location required.", true);
      return;
    }

    const rows = Array.from(tbody.querySelectorAll("tr"));
    const toSave = [];

    for (const tr of rows) {
      const inp = tr.querySelector("input[data-actual]");
      const raw = (inp?.value ?? "").trim();
      if (raw === "") continue; // only save rows you touched

      const actual = Number(raw);
      if (!Number.isFinite(actual) || actual < 0) {
        setMsg("Actual must be a number >= 0 (fix highlighted rows).", true);
        inp.classList.add("bad");
        return;
      }
      inp.classList.remove("bad");

      const sku = tr.dataset.sku;
      toSave.push({ sku, actual_qty: actual });
    }

    if (toSave.length === 0) {
      setMsg("Nothing to save. Enter at least one actual count.", true);
      return;
    }

    // Map SKU -> item_id
    const items = await window.api.itemsList();
    const itemIdBySku = new Map(items.map((i) => [i.sku, i.id]));

    btnSave.disabled = true;

    try {
      let saved = 0;
      for (const row of toSave) {
        const item_id = itemIdBySku.get(row.sku);
        if (!item_id) continue;

        await window.api.countsSubmit({
          user_initials: kInit.value,
          location_id: kLoc.value,
          item_id,
          actual_qty: row.actual_qty,
          notes: "Table count",
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

function rowHtml(i, theo) {
  return `
    <tr data-sku="${escapeHtml(i.sku)}" data-theo="${theo}">
      <td>${escapeHtml(i.category)}</td>
      <td class="mono">${escapeHtml(i.sku)}</td>
      <td>${escapeHtml(i.description)}</td>
      <td class="right mono">${theo}</td>
      <td class="right">
        <input class="input input-mini" data-actual="1" type="number" step="1" placeholder="" />
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
