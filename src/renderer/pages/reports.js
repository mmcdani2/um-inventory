export async function mountReports() {
  const btn = document.getElementById("repRefresh");
  const tbody = document.querySelector("#repTable tbody");
  const hint = document.getElementById("repHint");

  async function load() {
    const rows = await window.api.reportsOnHand();
    tbody.innerHTML = rows.map(r => `
      <tr>
        <td class="mono">${escapeHtml(r.location_code)}${r.location_name ? " — " + escapeHtml(r.location_name) : ""}</td>
        <td>${escapeHtml(r.category)}</td>
        <td class="mono">${escapeHtml(r.sku)}</td>
        <td>${escapeHtml(r.description)}</td>
        <td class="right mono">${fmtNum(r.on_hand)}</td>
        <td>${escapeHtml(r.unit)}</td>
        <td class="mono">${escapeHtml(r.updated_at)}</td>
      </tr>
    `).join("");

    hint.textContent = rows.length ? `${rows.length} row(s)` : "No on-hand yet (receive something first).";
  }

  btn.addEventListener("click", load);
  await load();
  window.addEventListener("data:changed", load);
}

function fmtNum(n) {
  const x = Number(n ?? 0);
  return Number.isFinite(x) ? x.toString() : "0";
}
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}
