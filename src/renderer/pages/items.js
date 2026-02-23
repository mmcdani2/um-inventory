import { toCsv, downloadCsv } from "../utils/csv.js";

export async function mountItems() {
  const btnRefresh = document.getElementById("itemsRefresh");
  const btnAddRow = document.getElementById("btnAddRow");
  const btnImportCsv = document.getElementById("btnImportCsv");
  const btnTemplateCsv = document.getElementById("btnTemplateCsv");
  const fileInput = document.getElementById("csvFile");

  const btnMenu = document.getElementById("btnMenu");
  const menuPanel = document.getElementById("menuPanel");

  const tbody = document.querySelector("#itemsTable tbody");
  const msg = document.getElementById("itemsMsg");
  const hint = document.getElementById("itemsHint"); // optional
  const btnExportItemsCsv = document.getElementById("btnExportItemsCsv");

  let items = [];

  tbody.addEventListener("click", async (e) => {
    const editBtn = e.target.closest("[data-edit]");
    const locBtn = e.target.closest("[data-locs]");

    if (editBtn) {
      const id = Number(editBtn.dataset.edit);
      const item = items.find((x) => Number(x.id) === id);
      if (!item) return;

      openModal(
        `Edit — ${item.sku}`,
        `
  <div class="edit-grid">
    <label class="field">
      <div class="lbl">Category</div>
      <input id="eCategory" class="input" value="${esc(item.category || "")}" />
    </label>

    <label class="field">
      <div class="lbl">Unit</div>
      <input id="eUnit" class="input" value="${esc(item.unit || "")}" />
    </label>

    <label class="field span-2">
      <div class="lbl">Description</div>
      <input id="eDesc" class="input" value="${esc(item.description || "")}" />
    </label>

    <label class="field span-2">
      <div class="lbl">Barcode</div>
      <input id="eBarcode" class="input mono" value="${esc(item.barcode || "")}" />
    </label>

    <label class="field">
      <div class="lbl">Par</div>
      <input id="eRP" class="input" type="number" step="1" value="${num(item.reorder_point)}" />
    </label>

    <label class="field">
      <div class="lbl">Restock</div>
      <input id="eRQ" class="input" type="number" step="1" value="${num(item.reorder_qty)}" />
    </label>

    <label class="field">
      <div class="lbl">Cost</div>
      <input id="eCost" class="input" inputmode="decimal" value="${Number(item.default_cost ?? 0).toFixed(2)}" />
    </label>

    <div class="msg span-2" id="eMsg"></div>
  </div>

  <div class="modal-actions">
    <button class="btn" data-close>Cancel</button>
    <button id="eSave" class="btn btn-primary">Save</button>
  </div>
`,
      );

      ["eCategory", "eUnit", "eDesc", "eBarcode", "eRP", "eRQ", "eCost"].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener("focus", () => el.select());
        el.addEventListener("mouseup", (ev) => ev.preventDefault());
      });

      const eCost = document.getElementById("eCost");
      eCost?.addEventListener("blur", () => {
        const n = Number(String(eCost.value || "").replace(/[$,]/g, ""));
        eCost.value = `$${(Number.isFinite(n) ? n : 0).toFixed(2)}`;
      });
      eCost?.addEventListener("focus", () => {
        eCost.value = String(eCost.value || "").replace(/[$,]/g, "");
        eCost.select();
      });

      document.getElementById("eSave").addEventListener("click", async () => {
        const eMsg = document.getElementById("eMsg");
        eMsg.textContent = "";

        document.getElementById("eCost")?.dispatchEvent(new Event("blur"));

        try {
          await window.api.itemsUpdate({
            id,
            category: document.getElementById("eCategory").value,
            unit: document.getElementById("eUnit").value,
            description: document.getElementById("eDesc").value,
            barcode: document.getElementById("eBarcode").value,
            reorder_point: document.getElementById("eRP").value,
            reorder_qty: document.getElementById("eRQ").value,
            default_cost: String(document.getElementById("eCost").value || "").replace(/[$,]/g, ""),
          });

          window.dispatchEvent(new CustomEvent("data:changed"));
          await load();
          document.getElementById("itemsModal").classList.add("hidden");
          setMsg("Saved.");
        } catch (err) {
          eMsg.textContent = err.message || "Failed to save.";
          eMsg.classList.add("err");
        }
      });

      return;
    }

    if (locBtn) {
      try {
        const sku = String(locBtn.dataset.locs || "");
        const rows = await window.api.reportsOnHand();
        const hits = rows.filter((r) => String(r.sku) === sku);

        const html = hits.length
          ? `
        <div class="hint">On-hand by Area for <span class="mono">${esc(sku)}</span></div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th style="width:140px">Area</th>
                <th>Name</th>
                <th class="right" style="width:120px">On Hand</th>
                <th style="width:180px">Updated</th>
              </tr>
            </thead>
            <tbody>
              ${hits
                .map(
                  (h) => `
                <tr>
                  <td class="mono">${esc(h.location_code)}</td>
                  <td>${esc(h.location_name || "")}</td>
                  <td class="right mono">${num(h.on_hand)}</td>
                  <td class="mono">${esc(h.updated_at || "")}</td>
                </tr>
              `,
                )
                .join("")}
            </tbody>
          </table>
        </div>
      `
          : `<div class="hint">No on-hand rows yet. This SKU has not been received into any Area.</div>`;

        openModal(`Locations — ${sku}`, html);
      } catch (err) {
        setMsg(`Locations modal error: ${err?.message || err}`, true);
      }
    }
  });

  function setMsg(text, isError = false) {
    msg.textContent = text || "";
    msg.classList.toggle("err", !!isError);
  }

  function ensureModal() {
    let el = document.getElementById("itemsModal");
    if (el) return el;

    el = document.createElement("div");
    el.id = "itemsModal";
    el.className = "modal hidden";
    el.innerHTML = `
    <div class="modal-backdrop" data-close></div>
    <div class="modal-card">
      <div class="modal-head">
        <div class="modal-title" id="itemsModalTitle">Details</div>
        <button class="btn" data-close>✕</button>
      </div>
      <div class="modal-body" id="itemsModalBody"></div>
      <div class="modal-foot">
        <button class="btn" data-close>Close</button>
      </div>
    </div>
  `;
    document.body.appendChild(el);

    el.addEventListener("click", (e) => {
      if (e.target.closest("[data-close]")) el.classList.add("hidden");
    });

    return el;
  }

  function openModal(title, html) {
    const m = ensureModal();
    m.querySelector("#itemsModalTitle").textContent = title;
    m.querySelector("#itemsModalBody").innerHTML = html;
    m.classList.remove("hidden");
  }

  function toggleMenu(open) {
    menuPanel.classList.toggle("hidden", !open);
  }

  btnMenu.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMenu(menuPanel.classList.contains("hidden"));
  });
  document.addEventListener("click", () => toggleMenu(false));
  menuPanel.addEventListener("click", (e) => e.stopPropagation());

  function wireItemsSearch() {
    const input = document.getElementById("itemsSearch");
    const clear = document.getElementById("itemsSearchClear");
    if (!input || !clear || !tbody) return;

    input.addEventListener("focus", () => input.select());

    const apply = () => {
      const q = input.value.trim().toLowerCase();
      const rows = tbody.querySelectorAll("tr");
      rows.forEach((tr) => {
        const hay = ((tr.innerText || "") + " " + (tr.dataset.barcode || "")).toLowerCase();
        tr.style.display = !q || hay.includes(q) ? "" : "none";
      });
    };

    input.addEventListener("input", apply);
    clear.addEventListener("click", () => {
      input.value = "";
      apply();
      input.focus();
    });

    apply();
  }

  async function load() {
    items = await window.api.itemsList();
    tbody.innerHTML = items.map((i) => rowHtml(i)).join("");

    if (hint) {
      hint.textContent = items.length ? `${items.length} item(s)` : "No items yet.";
    }

    document.getElementById("itemsSearch")?.dispatchEvent(new Event("input"));
  }

  function addEditableRow() {
    setMsg("");
    if (tbody.querySelector("tr[data-new='1']")) return;

    const tr = document.createElement("tr");
    tr.dataset.new = "1";
    tr.innerHTML = newRowHtml();
    tbody.prepend(tr);

    tr.querySelectorAll("input").forEach((input) => {
      const trySelectAll = () => {
        try {
          input.select();
          return true;
        } catch {
          return false;
        }
      };

      input.addEventListener("focus", () => {
        if (input.disabled || input.readOnly) return;
        setTimeout(() => {
          if (input.type === "number") input.dataset.autoclear = "1";
          else if (trySelectAll()) input.dataset.autoselect = "1";
          else input.dataset.autoclear = "1";
        }, 0);
      });

      input.addEventListener("mouseup", (e) => {
        if (input.dataset.autoselect === "1") {
          e.preventDefault();
          delete input.dataset.autoselect;
        }
      });

      input.addEventListener("keydown", (e) => {
        if (input.dataset.autoselect === "1") delete input.dataset.autoselect;

        if (input.dataset.autoclear === "1") {
          const isPrintable = e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
          if (isPrintable || e.key === "Backspace" || e.key === "Delete") {
            input.value = "";
            delete input.dataset.autoclear;
          }
        }
      });

      input.addEventListener("paste", () => {
        if (input.dataset.autoclear === "1") {
          input.value = "";
          delete input.dataset.autoclear;
        }
      });
    });

    tr.querySelector("input[name='barcode']").focus();

    tr.querySelector("[data-cancel]").addEventListener("click", () => tr.remove());

    tr.querySelector("[data-save]").addEventListener("click", async () => {
      setMsg("");
      const data = readRow(tr);

      try {
        await window.api.itemsCreate(data);
        setMsg("Added.");
        window.dispatchEvent(new CustomEvent("data:changed"));
        await load();
      } catch (err) {
        setMsg(err.message || "Failed to add item.", true);
      }
    });
  }

  function downloadTemplate() {
    const headers = [
      { key: "category", label: "Category" },
      { key: "barcode", label: "Barcode" },
      { key: "sku", label: "SKU / Part #" },
      { key: "description", label: "Description" },
      { key: "unit", label: "Unit" },
      { key: "on_hand", label: "On Hand" },
      { key: "reorder_point", label: "Par" },
      { key: "reorder_qty", label: "Restock" },
      { key: "cost", label: "Cost" },
      { key: "actions", label: "Actions" },
    ];

    const example = [
      {
        category: "Electrical",
        barcode: "036000291452",
        sku: "CAP-35-5",
        description: "Run Capacitor 35/5 MFD",
        unit: "EA",
        on_hand: "0",
        reorder_point: "2",
        reorder_qty: "5",
        cost: "18.50",
        actions: "",
      },
    ];

    const csv = toCsv(example, headers);
    downloadCsv("items_import_template.csv", csv);
    toggleMenu(false);
  }

  btnTemplateCsv.addEventListener("click", downloadTemplate);

  btnImportCsv.addEventListener("click", () => {
    setMsg("");
    toggleMenu(false);
    fileInput.click();
  });

  fileInput.addEventListener("change", async () => {
    const f = fileInput.files?.[0];
    fileInput.value = "";
    if (!f) return;

    setMsg("");
    btnImportCsv.disabled = true;
    btnTemplateCsv.disabled = true;

    try {
      const text = await f.text();
      const { itemsToCreate } = parseItemsCsv(text);

      const res = await window.api.itemsImportCsv({ items: itemsToCreate });
      setMsg(`Imported ${Number(res?.imported ?? 0)} item(s).`);
      window.dispatchEvent(new CustomEvent("data:changed"));
      await load();
    } catch (err) {
      setMsg(err.message || "Failed to import CSV.", true);
    } finally {
      btnImportCsv.disabled = false;
      btnTemplateCsv.disabled = false;
    }
  });

  btnExportItemsCsv?.addEventListener("click", async () => {
    setMsg("");
    toggleMenu(false);

    await load();
    const asOf = new Date().toISOString();

    const headers = [
      { key: "as_of", label: "As Of" },
      { key: "category", label: "Category" },
      { key: "barcode", label: "Barcode" },
      { key: "sku", label: "SKU / Part #" },
      { key: "description", label: "Description" },
      { key: "unit", label: "Unit" },
      { key: "on_hand_total", label: "On Hand Total" },
      { key: "reorder_point", label: "Par" },
      { key: "reorder_qty", label: "Restock" },
      { key: "default_cost", label: "Cost" },
    ];

    const rows = items.map((i) => ({
      as_of: asOf,
      category: i.category ?? "",
      barcode: i.barcode ?? "",
      sku: i.sku ?? "",
      description: i.description ?? "",
      unit: i.unit ?? "",
      on_hand_total: Number(i.on_hand_total ?? 0),
      reorder_point: Number(i.reorder_point ?? 0),
      reorder_qty: Number(i.reorder_qty ?? 0),
      default_cost: Number(i.default_cost ?? 0),
    }));

    const csv = toCsv(rows, headers);
    const stamp = asOf.replace(/[:.]/g, "-");
    downloadCsv(`items_snapshot_${stamp}.csv`, csv);
  });

  btnAddRow.addEventListener("click", addEditableRow);
  btnRefresh.addEventListener("click", load);
  window.addEventListener("data:changed", load);

  wireItemsSearch();
  await load();
  document.getElementById("itemsSearch")?.focus();
}

function rowHtml(i) {
  return `
    <tr data-id="${i.id}" data-sku="${esc(i.sku)}" data-barcode="${esc(i.barcode || "")}">
      <td>${esc(i.category)}</td>
      <td class="mono">${esc(i.barcode || "")}</td>
      <td class="mono">${esc(i.sku)}</td>
      <td title="${esc(i.description)}">${esc(i.description)}</td>
      <td class="c">${esc(i.unit)}</td>
      <td class="c mono">${num(i.on_hand_total)}</td>
      <td class="c mono">${num(i.reorder_point)}</td>
      <td class="c mono">${num(i.reorder_qty)}</td>
      <td class="c mono">${money(i.default_cost)}</td>
      <td class="c">
        <div class="row-actions">
          <button class="btn" data-edit="${i.id}">Edit</button>
          <button class="btn" data-locs="${esc(i.sku)}">Locations</button>
        </div>
      </td>
    </tr>
  `;
}

function newRowHtml() {
  return `
    <td><input class="input input-mini" name="category" placeholder="Category" /></td>
    <td><input class="input input-mini mono" name="barcode" placeholder="Barcode" /></td>
    <td><input class="input input-mini mono" name="sku" placeholder="SKU*" /></td>
    <td><input class="input input-mini" name="description" placeholder="Description*" /></td>

    <td class="c"><input class="input input-mini ctext" name="unit" value="EA" /></td>
    <td class="c"><input class="input input-mini mono input-readonly ctext" value="—" disabled /></td>

    <td class="c"><input class="input input-mini ctext" name="reorder_point" inputmode="numeric" pattern="[0-9]*" value="0" /></td>
    <td class="c"><input class="input input-mini ctext" name="reorder_qty" inputmode="numeric" pattern="[0-9]*" value="0" /></td>

    <td class="c"><input class="input input-mini mono ctext" name="default_cost" inputmode="decimal" value="0.00" /></td>

    <td class="c">
      <div class="row-actions">
        <button class="btn btn-primary" data-save>Save</button>
        <button class="btn" data-cancel>Cancel</button>
      </div>
    </td>
  `;
}

function readRow(tr) {
  const v = (name) => tr.querySelector(`[name='${name}']`)?.value ?? "";
  return {
    barcode: v("barcode"),
    sku: v("sku"),
    description: v("description"),
    category: v("category"),
    unit: v("unit") || "EA",
    reorder_point: v("reorder_point"),
    reorder_qty: v("reorder_qty"),
    default_cost: v("default_cost") || "0",
  };
}

function parseItemsCsv(csvText) {
  const expectedHeaders = [
    "Category",
    "Barcode",
    "SKU / Part #",
    "Description",
    "Unit",
    "On Hand",
    "Par",
    "Restock",
    "Cost",
    "Actions",
  ];

  const rows = parseCsv(csvText).filter((r) => r.some((c) => String(c ?? "").trim() !== ""));
  if (rows.length === 0) throw new Error("CSV is empty.");

  const headerRow = rows[0].map((h) => normalizeHeader(h));
  const expectedNorm = expectedHeaders.map((h) => normalizeHeader(h));

  if (headerRow.length !== expectedNorm.length || headerRow.some((h, i) => h !== expectedNorm[i])) {
    throw new Error(`CSV headers must match Items table exactly:\n${expectedHeaders.join(", ")}`);
  }

  const errors = [];
  const itemsToCreate = [];
  const seenSku = new Set();

  for (let i = 1; i < rows.length; i++) {
    const rowNum = i + 1;
    const r = [...rows[i]];
    while (r.length < expectedHeaders.length) r.push("");
    if (r.length > expectedHeaders.length) {
      errors.push(`Row ${rowNum}: too many columns.`);
      continue;
    }

    const rowErrors = [];
    const [
      category,
      barcode,
      sku,
      description,
      unit,
      onHand,
      reorderPoint,
      reorderQty,
      cost,
      actions,
    ] = r.map((x) => String(x ?? "").trim());

    const reorderPointNum = parseOptionalNumber(reorderPoint, rowNum, "Par", rowErrors);
    const reorderQtyNum = parseOptionalNumber(reorderQty, rowNum, "Restock", rowErrors);
    const costNum = parseOptionalNumber(cost, rowNum, "Cost", rowErrors);

    // Keep these columns in template for human familiarity, but enforce: blank only
    if (onHand) rowErrors.push(`Row ${rowNum}: On Hand must be blank (stock comes from Receive/Counts).`);
    if (actions) rowErrors.push(`Row ${rowNum}: Actions must be blank.`);

    if (!sku) rowErrors.push(`Row ${rowNum}: SKU / Part # is required.`);
    if (!description) rowErrors.push(`Row ${rowNum}: Description is required.`);

    const skuKey = sku.toLowerCase();
    if (sku && seenSku.has(skuKey)) rowErrors.push(`Row ${rowNum}: duplicate SKU.`);
    if (sku) seenSku.add(skuKey);

    if (rowErrors.length) {
      errors.push(...rowErrors);
      continue;
    }

    itemsToCreate.push({
      __row: rowNum,
      sku,
      barcode,
      description,
      category,
      unit: unit || "EA",
      reorder_point: String(reorderPointNum ?? 0),
      reorder_qty: String(reorderQtyNum ?? 0),
      default_cost: String(costNum ?? 0),
    });
  }

  if (errors.length) {
    const preview = errors.slice(0, 10).join("\n");
    const more = errors.length > 10 ? `\n…plus ${errors.length - 10} more.` : "";
    throw new Error(`CSV validation failed:\n${preview}${more}`);
  }

  return { itemsToCreate };
}

function normalizeHeader(s) {
  return String(s ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\s*\/\s*/g, " / ");
}

function parseOptionalNumber(raw, rowNum, label, errors) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const cleaned = s.replace(/[$,]/g, "");
  const x = Number(cleaned);
  if (!Number.isFinite(x)) {
    errors.push(`Row ${rowNum}: ${label} must be a number.`);
    return null;
  }
  return x;
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

  while (rows.length && rows[rows.length - 1].every((c) => String(c ?? "").trim() === "")) {
    rows.pop();
  }
  return rows;
}

function num(n) {
  const x = Number(n ?? 0);
  return Number.isFinite(x) ? x.toString() : "0";
}

function money(n) {
  const x = Number(n ?? 0);
  if (!Number.isFinite(x)) return "$0.00";
  return x.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}