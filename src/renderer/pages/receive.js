export async function mountReceive() {
  const msg = document.getElementById("rMsg");
  const btn = document.getElementById("rSubmit");

  const rInit = document.getElementById("rInit");
  const rVendor = document.getElementById("rVendor");
  const rPO = document.getElementById("rPO");
  const rLoc = document.getElementById("rLoc");

  // Search UI + hidden item_id
  const rItemSearch = document.getElementById("rItemSearch");
  const rItemResults = document.getElementById("rItemResults");
  const rItem = document.getElementById("rItem"); // hidden input holding item_id

  const rQty = document.getElementById("rQty");
  const rCost = document.getElementById("rCost");
  const rNotes = document.getElementById("rNotes");

  // Bulk receive UI
  const btnBulkTemplate = document.getElementById("btnBulkTemplate");
  const btnBulkImport = document.getElementById("btnBulkImport");
  const bulkFile = document.getElementById("bulkFile");

  // Select-all for fast overwrite
  [rQty, rCost].forEach((el) =>
    el?.addEventListener("focus", () => el.select()),
  );

  // Guard: fail fast if HTML IDs don't match JS
  const missing = [];
  if (!msg) missing.push("rMsg");
  if (!btn) missing.push("rSubmit");
  if (!rInit) missing.push("rInit");
  if (!rVendor) missing.push("rVendor");
  if (!rPO) missing.push("rPO");
  if (!rLoc) missing.push("rLoc");
  if (!rItemSearch) missing.push("rItemSearch");
  if (!rItemResults) missing.push("rItemResults");
  if (!rItem) missing.push("rItem");
  if (!rQty) missing.push("rQty");
  if (!rCost) missing.push("rCost");
  if (!rNotes) missing.push("rNotes");
  // bulk controls are optional, but warn if partially missing
  const bulkMissing = [];
  if (btnBulkTemplate && (!btnBulkImport || !bulkFile))
    bulkMissing.push("btnBulkImport/bulkFile");
  if (btnBulkImport && (!btnBulkTemplate || !bulkFile))
    bulkMissing.push("btnBulkTemplate/bulkFile");
  if (bulkFile && (!btnBulkTemplate || !btnBulkImport))
    bulkMissing.push("btnBulkTemplate/btnBulkImport");

  if (missing.length)
    throw new Error(`Receive page missing: ${missing.join(", ")}`);
  if (bulkMissing.length)
    setMsg(`Bulk UI partially missing: ${bulkMissing.join(", ")}`, true);

  let items = [];

  function setMsg(t, err = false) {
    msg.textContent = t || "";
    msg.classList.toggle("err", !!err);
  }

  async function loadPickers() {
    const [locs, itemsRes] = await Promise.all([
      window.api.locationsList(),
      window.api.itemsList(),
    ]);

    items = itemsRes || [];

    rLoc.innerHTML =
      `<option value="">Select...</option>` +
      locs
        .map(
          (l) =>
            `<option value="${l.id}">${escapeHtml(l.code)}${
              l.name ? " — " + escapeHtml(l.name) : ""
            }</option>`,
        )
        .join("");
    rLoc.value = "";
  }

  function wireItemSearch() {
    const close = () => rItemResults.classList.add("hidden");
    const open = () => rItemResults.classList.remove("hidden");

    const render = (q) => {
            const needle = String(q || "").trim().toLowerCase();
      if (!needle) {
        rItemResults.innerHTML = "";
        close();
        return;
      }

      // 1) Barcode-first: exact match -> instant select (no dropdown scrolling)
      const exactByBarcode = items.find((i) => {
        const bc = String(i.barcode ?? "").trim().toLowerCase();
        return bc && bc === needle;
      });

      if (exactByBarcode) {
        rItem.value = String(exactByBarcode.id);
        rItemSearch.value = `${exactByBarcode.sku} — ${exactByBarcode.description}`;
        rItemResults.innerHTML = "";
        close();
        rQty.focus();
        return;
      }

      // 2) Fallback: normal contains search (sku/desc/barcode)
      const hits = items
        .filter((i) =>
          `${i.sku} ${i.description} ${i.barcode ?? ""}`
            .toLowerCase()
            .includes(needle),
        )
        .slice(0, 12);

      rItemResults.innerHTML = hits
        .map(
          (i) => `
            <button type="button" class="combo-item" data-id="${i.id}">
              <span class="mono">${escapeHtml(i.sku)}</span> — ${escapeHtml(i.description)}
            </button>
          `,
        )
        .join("");

      open();
    };

    rItemSearch.addEventListener("input", () => {
      rItem.value = "";
      render(rItemSearch.value);
    });

    rItemSearch.addEventListener("focus", () => render(rItemSearch.value));

    document.addEventListener("click", (e) => {
      if (!e.target.closest(".combo")) close();
    });

    rItemResults.addEventListener("click", (e) => {
      const btnEl = e.target.closest("[data-id]");
      if (!btnEl) return;

      const id = btnEl.getAttribute("data-id");
      const hit = items.find((x) => String(x.id) === String(id));
      if (!hit) return;

      rItem.value = String(hit.id);
      rItemSearch.value = `${hit.sku} — ${hit.description}`;
      close();
      rQty.focus();
    });

    rItemSearch.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const first = rItemResults.querySelector("[data-id]");
        if (first) {
          first.click();
          e.preventDefault();
        }
      }
      if (e.key === "Escape") close();
    });
  }

  async function submit() {
    setMsg("");
    btn.disabled = true;

    try {
      if (!rInit.value.trim()) throw new Error("User initials required.");
      if (!rVendor.value.trim()) throw new Error("Vendor required.");
      if (!rLoc.value) throw new Error("Location required.");
      if (!rItem.value) throw new Error("Item required (search and select).");

      const payload = {
        user_initials: rInit.value,
        vendor: rVendor.value,
        po_number: rPO.value,
        location_id: rLoc.value,
        item_id: rItem.value,
        qty: rQty.value,
        unit_cost: rCost.value,
        notes: rNotes.value,
      };

      const res = await window.api.receiveSubmit(payload);
      setMsg(`Received. TX #${res.transaction_id}`);
      window.dispatchEvent(new CustomEvent("data:changed"));

      // reset
      rQty.value = "1";
      rCost.value = "0";
      rNotes.value = "";
      rItem.value = "";
      rItemSearch.value = "";
      rItemSearch.focus();
    } catch (e) {
      setMsg(e.message || "Failed.", true);
    } finally {
      btn.disabled = false;
    }
  }

  btn.addEventListener("click", submit);

  rNotes.addEventListener("keydown", (e) => {
    // Ctrl+Enter submits; plain Enter makes a new line
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit();
  });

  // --- CSV helpers (local) ---
  function toCsv(rows, headers) {
    const esc = (v) => {
      const s = String(v ?? "");
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const head = headers.map((h) => esc(h)).join(",");
    const body = rows
      .map((r) => headers.map((h) => esc(r[h])).join(","))
      .join("\n");
    return `${head}\n${body}\n`;
  }

  function downloadCsv(filename, csv) {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    const pushField = () => {
      row.push(field);
      field = "";
    };
    const pushRow = () => {
      pushField();
      rows.push(row);
      row = [];
    };

    const s = String(text ?? "");
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];

      if (inQuotes) {
        if (ch === '"') {
          const next = s[i + 1];
          if (next === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += ch;
        }
        continue;
      }

      if (ch === '"') {
        inQuotes = true;
        continue;
      }
      if (ch === ",") {
        pushField();
        continue;
      }
      if (ch === "\n") {
        pushRow();
        continue;
      }
      if (ch === "\r") continue;
      field += ch;
    }

    if (inQuotes) throw new Error("CSV parse error: unmatched quote.");
    if (field.length || row.length) pushRow();

    while (
      rows.length &&
      rows[rows.length - 1].every((c) => String(c ?? "").trim() === "")
    ) {
      rows.pop();
    }
    return rows;
  }

  function norm(s) {
    return String(s ?? "")
      .replace(/^\uFEFF/, "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  // --- Bulk template + bulk import wiring ---
  if (btnBulkTemplate && btnBulkImport && bulkFile) {
    btnBulkTemplate.addEventListener("click", async () => {
      setMsg("");
      const itemsNow = await window.api.itemsList();

      const headers = [
        "location_code",
        "sku",
        "description",
        "unit",
        "qty",
        "unit_cost",
        "vendor",
        "po_number",
        "notes",
        "user_initials",
      ];

      const rows = (itemsNow || [])
        .slice()
        .sort(
          (a, b) =>
            String(a.category ?? "").localeCompare(String(b.category ?? "")) ||
            String(a.sku ?? "").localeCompare(String(b.sku ?? "")),
        )
        .map((i) => ({
          location_code: "", // user fills (or paste down a single code)
          sku: i.sku ?? "",
          description: i.description ?? "",
          unit: i.unit ?? "",
          qty: "",
          unit_cost: "",
          vendor: "INITIAL COUNT",
          po_number: "",
          notes: "",
          user_initials: "",
        }));

      const csv = toCsv(rows, headers);
      const stamp = new Date().toISOString().slice(0, 10);
      downloadCsv(`count_sheet_${stamp}.csv`, csv);
    });

    btnBulkImport.addEventListener("click", () => {
      setMsg("");
      bulkFile.click();
    });

    bulkFile.addEventListener("change", async () => {
      const f = bulkFile.files?.[0];
      bulkFile.value = "";
      if (!f) return;

      setMsg("");
      btn.disabled = true;

      try {
        const text = await f.text();
        const rows = parseCsv(text);
        if (!rows.length) throw new Error("CSV is empty.");

        const header = rows[0].map(norm);
        const required = ["location_code", "sku", "qty"];
        for (const col of required) {
          if (!header.includes(col))
            throw new Error(`CSV missing required column: ${col}`);
        }
        const idx = Object.fromEntries(header.map((h, i) => [h, i]));

        const [locs, itemsNow] = await Promise.all([
          window.api.locationsList(),
          window.api.itemsList(),
        ]);

        const locIdByCode = new Map(
          locs.map((l) => [String(l.code).trim().toLowerCase(), l.id]),
        );
        const itemIdBySku = new Map(
          (itemsNow || []).map((i) => [
            String(i.sku).trim().toLowerCase(),
            i.id,
          ]),
        );

        let imported = 0;

        for (let i = 1; i < rows.length; i++) {
          const r = rows[i];
          if (!r || r.every((c) => String(c ?? "").trim() === "")) continue;

          const location_code = String(r[idx.location_code] ?? "").trim();
          const sku = String(r[idx.sku] ?? "").trim();
          const qtyRaw = String(r[idx.qty] ?? "").trim();

          if (!location_code || !sku || !qtyRaw) continue; // skip incomplete rows

          const location_id = locIdByCode.get(location_code.toLowerCase());
          const item_id = itemIdBySku.get(sku.toLowerCase());
          const qty = Number(qtyRaw);

          if (!location_id)
            throw new Error(
              `Row ${i + 1}: unknown location_code "${location_code}"`,
            );
          if (!item_id) throw new Error(`Row ${i + 1}: unknown sku "${sku}"`);
          if (!Number.isFinite(qty) || qty <= 0)
            throw new Error(`Row ${i + 1}: qty must be > 0`);

          const unit_cost = header.includes("unit_cost")
            ? String(r[idx.unit_cost] ?? "").trim()
            : "";
          const vendor = header.includes("vendor")
            ? String(r[idx.vendor] ?? "").trim()
            : "INITIAL COUNT";
          const po_number = header.includes("po_number")
            ? String(r[idx.po_number] ?? "").trim()
            : "";
          const notes = header.includes("notes")
            ? String(r[idx.notes] ?? "").trim()
            : "Bulk receive";
          const user_initials = header.includes("user_initials")
            ? String(r[idx.user_initials] ?? "").trim()
            : "";

          await window.api.receiveSubmit({
            user_initials: user_initials || rInit.value || "",
            vendor: vendor || rVendor.value || "INITIAL COUNT",
            po_number: po_number || rPO.value || "",
            location_id,
            item_id,
            qty,
            unit_cost: unit_cost || "0",
            notes,
          });

          imported++;
        }

        setMsg(`Bulk receive complete. Imported ${imported} line(s).`);
        window.dispatchEvent(new CustomEvent("data:changed"));
      } catch (e) {
        setMsg(e.message || "Bulk receive failed.", true);
      } finally {
        btn.disabled = false;
      }
    });
  }

  await loadPickers();
  wireItemSearch();
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
