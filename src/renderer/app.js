import { routes, getRoute } from "./router.js";

const $ = (id) => document.getElementById(id);

function setActiveNav(routeId) {
  document.querySelectorAll(".nav a").forEach((a) => {
    a.classList.toggle("active", a.dataset.route === routeId);
  });
}

async function loadView(routeId) {
  const route = getRoute(routeId);
  const res = await fetch(route.file);
  const html = await res.text();
  $("view").innerHTML = html;
  if (route.id === "items") {
    const mod = await import("./pages/items.js");
    await mod.mountItems();
  }

  if (route.id === "home") {
    const mod = await import("./pages/home.js");
    await mod.mountHome();
  }

  if (route.id === "receive") {
    const mod = await import("./pages/receive.js");
    await mod.mountReceive();
  }

  if (route.id === "reports") {
    const mod = await import("./pages/reports.js");
    await mod.mountReports();
  }

  const url = new URL(window.location.href);
  url.hash = route.id;
  history.replaceState(null, "", url);

  setActiveNav(route.id);
}

function renderNav() {
  const nav = $("nav");
  nav.innerHTML = routes
    .map((r) => `<a href="#${r.id}" data-route="${r.id}">${r.label}</a>`)
    .join("");

  nav.addEventListener("click", (e) => {
    const a = e.target.closest("a");
    if (!a) return;
    e.preventDefault();
    loadView(a.dataset.route);
  });
}

async function refreshDbInfo() {
  const info = await window.api.dbGetInfo();
  $("dbPath").textContent = info.dbPath;
  $("schemaVersion").textContent = info.schemaVersion
    ? String(info.schemaVersion)
    : "—";
}

window.addEventListener("DOMContentLoaded", async () => {
  renderNav();
  $("btnRefresh").addEventListener("click", refreshDbInfo);

  await refreshDbInfo();

  const initial = (location.hash || "#home").replace("#", "");
  await loadView(initial);
});
