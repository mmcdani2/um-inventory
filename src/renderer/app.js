import { routes, getRoute } from "./router.js";

const $ = (id) => document.getElementById(id);

function setActiveNav(routeId) {
  document.querySelectorAll(".nav a").forEach((a) => {
    a.classList.toggle("active", a.dataset.route === routeId);
  });
}

function isAdminUnlocked() {
  return sessionStorage.getItem("adminUnlocked") === "1";
}

function unlockAdminPrompt() {
  return new Promise((resolve) => {
    // modal shell
    const wrap = document.createElement("div");
    wrap.className = "modal";
    wrap.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-card" style="max-width:420px">
        <div class="modal-head">
          <div class="modal-title">Admin Password</div>
          <button class="btn" data-cancel>✕</button>
        </div>
        <div class="modal-body">
          <label class="field">
            <div class="lbl">Password</div>
            <input id="adminPw" class="input" type="password" autocomplete="off" />
          </label>
          <div class="msg err hidden" id="adminErr">Wrong password.</div>
        </div>
        <div class="modal-actions">
          <button class="btn" data-cancel>Cancel</button>
          <button class="btn btn-primary" data-ok>Unlock</button>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);

    const input = wrap.querySelector("#adminPw");
    const err = wrap.querySelector("#adminErr");

    const close = (ok) => {
      wrap.remove();
      resolve(ok);
    };

    const tryUnlock = () => {
      const pw = String(input.value || "");
      if (pw !== "umadmin") {
        err.classList.remove("hidden");
        input.focus();
        input.select();
        return;
      }
      sessionStorage.setItem("adminUnlocked", "1");
      close(true);
    };

    wrap.addEventListener("click", (e) => {
      if (e.target.closest("[data-cancel]") || e.target.classList.contains("modal-backdrop")) {
        close(false);
      }
      if (e.target.closest("[data-ok]")) tryUnlock();
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") tryUnlock();
      if (e.key === "Escape") close(false);
    });

    setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
  });
}

async function loadView(routeId) {
  const route = getRoute(routeId);

  // Admin gate (session only)
  if (route.id === "admin" && !isAdminUnlocked()) {
    const ok = await unlockAdminPrompt();
    if (!ok) {
      location.hash = "#home";
      return;
    }
    // re-render nav so Admin link becomes visible after unlock
    renderNav();
  }

  setActiveNav(route.id);

  const res = await fetch(route.file);
  const html = await res.text();
  $("view").innerHTML = html;

  if (route.id === "items") {
    const mod = await import("./pages/items.js");
    await mod.mountItems();
  }
  
  if (route.id === "locations") {
    const mod = await import("./pages/locations.js");
    await mod.mountLocations();
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

  if (route.id === "admin") {
    const mod = await import("./pages/admin.js");
    await mod.mountAdmin();
  }

  const url = new URL(window.location.href);
  url.hash = route.id;
  history.replaceState(null, "", url);
}

function renderNav() {
  const nav = $("nav");

  const visibleRoutes = routes;

  nav.innerHTML = visibleRoutes
    .map((r) => `<a href="#${r.id}" data-route="${r.id}">${r.label}</a>`)
    .join("");

  nav.addEventListener("click", async (e) => {
    const a = e.target.closest("a");
    if (!a) return;
    e.preventDefault();
    const routeId = a.dataset.route || "home";
    setActiveNav(routeId); // optimistic
    await loadView(routeId);
  });
}

async function refreshDbInfo() {
  const info = await window.api.dbGetInfo();
  $("dbPath").textContent = info.dbPath;
  $("schemaVersion").textContent = info.schemaVersion ? String(info.schemaVersion) : "—";
}

window.addEventListener("DOMContentLoaded", async () => {
  console.log("[NAV HTML]", document.getElementById("nav")?.innerHTML);
  console.log("[NAV ROUTES]", routes.map(r => r.id));
  renderNav();
  $("btnRefresh")?.addEventListener("click", refreshDbInfo);

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