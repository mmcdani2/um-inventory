import { routes, getRoute } from "./router.js";

const $ = (id) => document.getElementById(id);

function setActiveNav(routeId) {
  document.querySelectorAll(".nav a").forEach((a) => {
    a.classList.toggle("active", a.dataset.route === routeId);
  });
}

async function loadView(routeId) {
  const route = getRoute(routeId);
  setActiveNav(route.id);
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

  if (route.id === "checkout") {
    const mod = await import("./pages/checkout.js");
    await mod.mountCheckout();
  }

  if (route.id === "counts") {
    const mod = await import("./pages/counts.js");
    await mod.mountCounts();
  }

  const url = new URL(window.location.href);
  url.hash = route.id;
  history.replaceState(null, "", url);
}

function renderNav() {
  const nav = $("nav");
  nav.innerHTML = routes
    .map((r) => `<a href="#${r.id}" data-route="${r.id}">${r.label}</a>`)
    .join("");

  nav.addEventListener("click", async (e) => {
    const a = e.target.closest("a");
    if (!a) return;
    e.preventDefault();
    const routeId = a.dataset.route || "home";
    setActiveNav(routeId); // optimistic (avoids any race where Home doesn't highlight)
    await loadView(routeId);
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
  console.log("[CANARY] renderer app.js DOMContentLoaded");
  renderNav();
  $("btnRefresh").addEventListener("click", refreshDbInfo);

  await refreshDbInfo();

  const initial = (location.hash || "#home").replace("#", "");
  await loadView(initial);
  const appEl = document.querySelector(".app");
  const btnSidebarToggle = $("btnSidebarToggle");
  const scrim = $("drawerScrim");

  let isMaximized = true;
  const syncDrawerMode = () => {
    const shouldDrawer = window.innerWidth <= 980 || !isMaximized;
    appEl?.classList.toggle("sidebar-drawer", shouldDrawer);
    if (!shouldDrawer) {
      appEl?.classList.remove("sidebar-open");
      scrim?.classList.add("hidden");
    }
    btnSidebarToggle?.setAttribute(
      "aria-expanded",
      appEl?.classList.contains("sidebar-open") ? "true" : "false",
    );
  };

  const openSidebar = () => {
    if (!appEl?.classList.contains("sidebar-drawer")) return;
    appEl.classList.add("sidebar-open");
    scrim?.classList.remove("hidden");
    btnSidebarToggle?.setAttribute("aria-expanded", "true");
  };

  const closeSidebar = () => {
    appEl?.classList.remove("sidebar-open");
    scrim?.classList.add("hidden");
    btnSidebarToggle?.setAttribute("aria-expanded", "false");
  };

  btnSidebarToggle?.addEventListener("click", () => {
    if (!appEl?.classList.contains("sidebar-drawer")) return;
    if (appEl.classList.contains("sidebar-open")) closeSidebar();
    else openSidebar();
  });
  scrim?.addEventListener("click", closeSidebar);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSidebar();
  });

  window.api.onWinUnmaximize(() => {
    isMaximized = false;
    syncDrawerMode();
  });
  window.api.onWinMaximize(() => {
    isMaximized = true;
    syncDrawerMode();
  });
  window.addEventListener("resize", syncDrawerMode);
  syncDrawerMode();

  window.addEventListener("hashchange", async () => {
    const routeId = (location.hash || "#home").replace("#", "");
    await loadView(routeId);
  });
});
