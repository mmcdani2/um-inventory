const $ = (id) => document.getElementById(id);

async function refresh() {
  const info = await window.api.dbGetInfo();
  $("dbPath").textContent = info.dbPath;
  $("rowCount").textContent = String(info.rowCount);
  $("lastRow").textContent = info.last ? JSON.stringify(info.last) : "—";
}

async function addRow() {
  const stamp = new Date().toLocaleString();
  await window.api.dbAddSmoke(`Smoke row @ ${stamp}`);
  await refresh();
}

window.addEventListener("DOMContentLoaded", () => {
  $("btnRefresh").addEventListener("click", refresh);
  $("btnAdd").addEventListener("click", addRow);
  refresh();
});
