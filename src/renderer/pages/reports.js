export async function mountReports() {
  const btn = document.getElementById("repRefresh");

  const onhandBody = document.querySelector("#repTable tbody");
  const repHint = document.getElementById("repHint");

  const soBody = document.querySelector("#soTable tbody");
  const soHint = document.getElementById("soHint");

  const tabs = Array.from(document.querySelectorAll(".tab"));
  const paneOn = document.getElementById("repOnhand");
  const paneSo = document.getElementById("repSuggested");

  function setTab(id) {
    tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === id));
    paneOn.classList.toggle("hidden", id !== "onhand");
    paneSo.classList.toggle("hidden", id !== "suggested");
  }

  async function loadOnhand() {
    const rows = await window.api.reportsOnHand();
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

  tabs.forEach((t) => t.addEventListener("click", () => setTab(t.dataset.tab)));
  btn.addEventListener("click", loadAll);

  window.addEventListener("data:changed", loadAll);

  setTab("onhand");
  await loadAll();
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
