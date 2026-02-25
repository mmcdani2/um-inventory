﻿export async function mountHome() {

  function toast(text, isErr = false) {
    const el = document.createElement("div");
    el.textContent = text || "";

    let host = document.getElementById("toastHost");
    if (!host) {
      host = document.createElement("div");
      host.id = "toastHost";
      host.style.position = "fixed";
      host.style.top = "16px";
      host.style.right = "16px";
      host.style.display = "flex";
      host.style.flexDirection = "column";
      host.style.gap = "10px";
      host.style.zIndex = "9999";
      document.body.appendChild(host);
    }

    el.style.padding = "10px 12px";
    el.style.borderRadius = "10px";
    el.style.border = "1px solid rgba(255,255,255,.12)";
    el.style.background = "rgba(17, 24, 39, .92)";
    el.style.color = "white";
    el.style.boxShadow = "0 10px 30px rgba(0,0,0,.35)";
    el.style.maxWidth = "360px";
    el.style.fontSize = "13px";
    el.style.lineHeight = "1.25";
    if (isErr) el.style.borderColor = "rgba(239,68,68,.55)";

    host.appendChild(el);
    const t = setTimeout(() => el.remove(), 2600);
    el.addEventListener("click", () => {
      clearTimeout(t);
      el.remove();
    });
  }

  async function load() {
    try {
      const stats = await window.api.homeStats();

      if (kpiSkus) kpiSkus.textContent = String(stats?.total_skus ?? 0);
      if (kpiLocs) kpiLocs.textContent = String(stats?.total_locations ?? 0);
      if (kpiReorder)
        kpiReorder.textContent = String(stats?.below_reorder ?? 0);
      if (kpiTx7d) kpiTx7d.textContent = String(stats?.tx_7d ?? 0);
    } catch (e) {
      toast(e?.message || "Failed to load Home.", true);
    }
  }

  document.querySelectorAll("[data-go]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const go = btn.dataset.go;
      if (go) location.hash = `#${go}`;
    });
  });

  window.addEventListener("data:changed", load);
  await load();
}
