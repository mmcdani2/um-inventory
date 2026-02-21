import { toCsv, downloadCsv } from "../utils/csv.js";

export async function mountReports() {
  const btnRefresh = document.getElementById("repRefresh");
  const btnExpOn = document.getElementById("expOnhand");
  const btnExpSo = document.getElementById("expSO");

  const onhandBody = document.querySelector("#repTable tbody");
  const repHint = document.getElementById("repHint");

  const soBody = document.querySelector("#soTable tbody");
  const soHint = document.getElementById("soHint");

  const tabs = Array.from(document.querySelectorAll(".tab"));
  const paneOn = document.getElementById("repOnhand");
  const paneSo = document.getElementById("repSuggested");

  let cacheOnhand = [];
  let cacheSo = [];

  function setTab(id) {
    tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === id));
    paneOn.classList.toggle("hidden", id !== "onhand");
    paneSo.classList.toggle("hidden", id !== "suggested");
  }

  async function loadOnhand() {
    const rows = await window.api.reportsOnHand();
    cacheOnhand = rows;

    onhandBody.innerHTML = rows
      .map(
        (r) => `
      <tr>
        <td class="mono">${escapeHtml(r.location_code)}${r.location_name ? " — " + escapeHtml(r.location_name) : ""}</td>
        <td>${escapeHtml(r.category)}</td>
        <td class="mono">${escapeHtml(r.sku)}</td>
        <td>${escapeHtml(r.description)}</td>
        <td class="right mono">${fmtNum(r.on_hand)}</td>
        <td>${escapeHtml(r.unit)}</td>
        <td class="mono">${escapeHtml(r.updated_at)}</td>
      </tr>
    `,
      )
      .join("");

    repHint.textContent = rows.length
      ? `${rows.length} row(s)`
      : "No on-hand yet.";
  }

  async function loadSuggested() {
    const rows = await window.api.reportsSuggestedOrders();
    cacheSo = rows;

    soBody.innerHTML = rows
      .map(
        (r) => `
      <tr>
        <td>${escapeHtml(r.vendor)}</td>
        <td>${escapeHtml(r.category)}</td>
        <td class="mono">${escapeHtml(r.sku)}</td>
        <td>${escapeHtml(r.description)}</td>
        <td class="right mono">${fmtNum(r.on_hand_total)}</td>
        <td class="right mono">${fmtNum(r.reorder_point)}</td>
        <td class="right mono">${fmtNum(r.reorder_qty)}</td>
        <td>${escapeHtml(r.unit)}</td>
      </tr>
    `,
      )
      .join("");

    soHint.textContent = rows.length
      ? `${rows.length} item(s) need reorder`
      : "Nothing flagged for reorder.";
  }

  async function loadAll() {
    await Promise.all([loadOnhand(), loadSuggested()]);
  }

  btnExpOn.addEventListener("click", () => {
    const csv = toCsv(cacheOnhand, [
      { key: "location_code", label: "Location Code" },
      { key: "location_name", label: "Location Name" },
      { key: "category", label: "Category" },
      { key: "sku", label: "SKU" },
      { key: "description", label: "Description" },
      { key: "on_hand", label: "On Hand" },
      { key: "unit", label: "Unit" },
      { key: "updated_at", label: "Updated At" },
    ]);
    downloadCsv(`on_hand_${todayStamp()}.csv`, csv);
  });

  btnExpSo.addEventListener("click", () => {
    const csv = toCsv(cacheSo, [
      { key: "vendor", label: "Vendor" },
      { key: "category", label: "Category" },
      { key: "sku", label: "SKU" },
      { key: "description", label: "Description" },
      { key: "on_hand_total", label: "On Hand Total" },
      { key: "reorder_point", label: "Reorder Point" },
      { key: "reorder_qty", label: "Reorder Qty" },
      { key: "unit", label: "Unit" },
    ]);
    downloadCsv(`suggested_order_${todayStamp()}.csv`, csv);
  });

  tabs.forEach((t) => t.addEventListener("click", () => setTab(t.dataset.tab)));
  btnRefresh.addEventListener("click", loadAll);
  window.addEventListener("data:changed", loadAll);

  setTab("onhand");
  await loadAll();
}

function todayStamp() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function fmtNum(n) {
  const x = Number(n ?? 0);
  return Number.isFinite(x) ? x.toString() : "0";
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
