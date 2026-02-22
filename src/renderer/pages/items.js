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
  const hint = document.getElementById("itemsHint");
  const msg = document.getElementById("itemsMsg");

  let items = [];

  function setMsg(text, isError = false) {
    msg.textContent = text || "";
    msg.classList.toggle("err", !!isError);
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

  async function load() {
    items = await window.api.itemsList();
    tbody.innerHTML = items.map((i) => rowHtml(i)).join("");
    hint.textContent = items.length
      ? `${items.length} item(s)`
      : "No items yet.";
  }

  function addEditableRow() {
    setMsg("");
    if (tbody.querySelector("tr[data-new='1']")) return;

    const tr = document.createElement("tr");
    tr.dataset.new = "1";
    tr.innerHTML = newRowHtml();
    tbody.prepend(tr);

    // Select-all on focus for the add-row inputs (so you can click and type immediately).
    // For <input type="number">, select() can throw, so we fall back to clearing on first input.
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
        // Defer so the click that focused the input doesn't clear selection/caret.
        setTimeout(() => {
          if (input.type === "number") {
            input.dataset.autoclear = "1";
          } else if (trySelectAll()) {
            input.dataset.autoselect = "1";
          } else {
            input.dataset.autoclear = "1";
          }
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

    tr.querySelector("input[name='sku']").focus();

    tr.querySelector("[data-cancel]").addEventListener("click", () =>
      tr.remove(),
    );

    tr.querySelector("[data-save]").addEventListener("click", async () => {
      setMsg("");
      const data = readRow(tr);

      try {
        const created = await window.api.itemsCreate(data);
        window.dispatchEvent(new CustomEvent("data:changed"));

        if (created?.id) {
          // New-item workflow: always send the user to Receive so on-hand is captured intentionally per location.
          sessionStorage.setItem(
            "receive:preselectItemId",
            String(created.id),
          );
          sessionStorage.setItem("receive:resetLocation", "1");
          location.hash = "#receive";
          return;
        }

        setMsg("Added.");
        await load();
      } catch (e) {
        setMsg(e.message || "Failed to add item.", true);
      }
    });
  }

  function downloadTemplate() {
    // Template includes low-priority fields too, because CSV import should be “full fidelity”.
    const headers = [
      { key: "sku", label: "sku" },
      { key: "description", label: "description" },
      { key: "category", label: "category" },
      { key: "unit", label: "unit" },
      { key: "vendor", label: "vendor" },
      { key: "barcode", label: "barcode" },
      { key: "reorder_point", label: "reorder_point" },
      { key: "reorder_qty", label: "reorder_qty" },
      { key: "default_cost", label: "default_cost" },
      { key: "is_active", label: "is_active" },
    ];

    const example = [
      {
        sku: "CAP-35-7.5",
        description: "35/5 MFD Run Capacitor",
        category: "Electrical",
        unit: "EA",
        vendor: "Gemaire",
        barcode: "",
        reorder_point: "2",
        reorder_qty: "5",
        default_cost: "18.50",
        is_active: "1",
      },
    ];

    const csv = toCsv(example, headers);
    downloadCsv("items_import_template.csv", csv);
    toggleMenu(false);
  }

  btnTemplateCsv.addEventListener("click", downloadTemplate);

  btnImportCsv.addEventListener("click", () => {
    setMsg(
      "CSV import parsing is next step. Template download works now.",
      true,
    );
    fileInput.click();
  });

  btnAddRow.addEventListener("click", addEditableRow);
  btnRefresh.addEventListener("click", load);
  window.addEventListener("data:changed", load);

  await load();
}

function rowHtml(i) {
  return `
    <tr data-id="${i.id}">
      <td>${esc(i.category)}</td>
      <td class="mono">${esc(i.sku)}</td>
      <td title="${esc(i.description)}">${esc(i.description)}</td>
      <td class="c">${esc(i.unit)}</td>
<td class="c mono">${num(i.on_hand_total)}</td>
<td class="c mono">${num(i.reorder_point)}</td>
<td class="c mono">${num(i.reorder_qty)}</td>
<td class="c mono">${money(i.default_cost)}</td>
<td class="c"></td>
    </tr>
  `;
}

function newRowHtml() {
  return `
    <td><input class="input input-mini" name="category" placeholder="Category" /></td>
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
    sku: v("sku"),
    description: v("description"),
    category: v("category"),
    unit: v("unit") || "EA",
    reorder_point: v("reorder_point"),
    reorder_qty: v("reorder_qty"),
    default_cost: v("default_cost") || "0",
  };
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
