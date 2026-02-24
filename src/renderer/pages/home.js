﻿export async function mountHome() {
  const skus = document.getElementById("kpiSkus");
  const locs = document.getElementById("kpiLocs");
  const reorder = document.getElementById("kpiReorder");
  const tx7d = document.getElementById("kpiTx7d");

  const homeHint = document.getElementById("homeHint");

  const lMsg = document.getElementById("lMsg");
  const lCode = document.getElementById("lCode");
  const lName = document.getElementById("lName");
  const lSave = document.getElementById("lSave");
  const lReset = document.getElementById("lReset");

  const iMsg = document.getElementById("iMsg");
  const iSku = document.getElementById("iSku");
  const iDesc = document.getElementById("iDesc");
  const iCat = document.getElementById("iCat");
  const iUnit = document.getElementById("iUnit");
  const iPar = document.getElementById("iPar");
  const iRestock = document.getElementById("iRestock");
  const iCost = document.getElementById("iCost");
  const iSave = document.getElementById("iSave");
  const iReset = document.getElementById("iReset");

  const qMsg = document.getElementById("qMsg");
  const qLoc = document.getElementById("qLoc");
  const qItem = document.getElementById("qItem");
  const qQty = document.getElementById("qQty");
  const qCost = document.getElementById("qCost");
  const qReceive = document.getElementById("qReceive");
  const qCheckout = document.getElementById("qCheckout");
  const qReset = document.getElementById("qReset");

  let allLocs = [];
  let allItems = [];

  const setMsg = (el, text, isErr = false) => {
    if (!el) return;
    el.textContent = text || "";
    el.classList.toggle("err", !!isErr);
  };

  const clearForm = () => {
    if (lCode) lCode.value = "";
    if (lName) lName.value = "";
    setMsg(lMsg, "");

    if (iSku) iSku.value = "";
    if (iDesc) iDesc.value = "";
    if (iCat) iCat.value = "";
    if (iUnit) iUnit.value = "EA";
    if (iPar) iPar.value = "0";
    if (iRestock) iRestock.value = "0";
    if (iCost) iCost.value = "0.00";
    setMsg(iMsg, "");

    if (qLoc) qLoc.value = "";
    if (qItem) qItem.value = "";
    if (qQty) qQty.value = "1";
    if (qCost) qCost.value = "0.00";
    setMsg(qMsg, "");
  };

  const fmtMoney = (n) => {
    const x = Number(n ?? 0);
    if (!Number.isFinite(x)) return "0.00";
    return x.toFixed(2);
  };

  const load = async () => {
    try {
      const [kpi, locsList, itemsList] = await Promise.all([
        window.api.homeKpis(),
        window.api.locationsList(),
        window.api.itemsList(),
      ]);

      if (skus) skus.textContent = String(kpi?.skus ?? 0);
      if (locs) locs.textContent = String(kpi?.locations ?? 0);
      if (reorder) reorder.textContent = String(kpi?.reorder ?? 0);
      if (tx7d) tx7d.textContent = String(kpi?.tx7d ?? 0);

      if (homeHint) {
        const now = new Date().toLocaleString();
        homeHint.textContent = `Updated ${now}`;
      }

      allLocs = Array.isArray(locsList) ? locsList : [];
      allItems = Array.isArray(itemsList) ? itemsList : [];

      if (qLoc) {
        qLoc.innerHTML =
          `<option value="">Select...</option>` +
          allLocs
            .map(
              (l) =>
                `<option value="${l.id}">${escapeHtml(l.code)}${
                  l.name ? " — " + escapeHtml(l.name) : ""
                }</option>`,
            )
            .join("");
      }

      if (qItem) {
        qItem.innerHTML =
          `<option value="">Select...</option>` +
          allItems
            .map(
              (i) =>
                `<option value="${i.id}">${escapeHtml(i.sku)} — ${escapeHtml(
                  i.description,
                )}</option>`,
            )
            .join("");
      }
    } catch (e) {
      setMsg(homeHint, e?.message || "Failed to load Home.", true);
    }
  };

  // Create Location
  lSave?.addEventListener("click", async () => {
    setMsg(lMsg, "");
    const code = (lCode?.value || "").trim();
    const name = (lName?.value || "").trim();
    if (!code) return setMsg(lMsg, "Location code is required.", true);

    try {
      await window.api.locationsCreate({ code, name });
      setMsg(lMsg, "Location added.");
      window.dispatchEvent(new CustomEvent("data:changed"));
      clearForm();
      await load();
    } catch (e) {
      setMsg(lMsg, e?.message || "Failed to add location.", true);
    }
  });

  lReset?.addEventListener("click", clearForm);

  // Create Item
  iSave?.addEventListener("click", async () => {
    setMsg(iMsg, "");
    const sku = (iSku?.value || "").trim();
    const description = (iDesc?.value || "").trim();
    const category = (iCat?.value || "").trim();
    const unit = (iUnit?.value || "EA").trim();

    const reorder_point = String(Number(iPar?.value ?? 0) || 0);
    const reorder_qty = String(Number(iRestock?.value ?? 0) || 0);
    const default_cost = String(Number(iCost?.value ?? 0) || 0);

    if (!sku) return setMsg(iMsg, "SKU is required.", true);
    if (!description) return setMsg(iMsg, "Description is required.", true);

    try {
      await window.api.itemsCreate({
        sku,
        description,
        category,
        unit,
        reorder_point,
        reorder_qty,
        default_cost,
      });
      setMsg(iMsg, "Item added.");
      window.dispatchEvent(new CustomEvent("data:changed"));
      clearForm();
      await load();
    } catch (e) {
      setMsg(iMsg, e?.message || "Failed to add item.", true);
    }
  });

  iReset?.addEventListener("click", clearForm);

  // Quick Receive / Checkout
  const quickTx = async (type) => {
    setMsg(qMsg, "");
    const location_id = Number(qLoc?.value || 0);
    const item_id = Number(qItem?.value || 0);
    const qty = Number(qQty?.value || 0);
    const unit_cost = Number(String(qCost?.value || "0").replace(/[$,]/g, "") || 0);

    if (!location_id) return setMsg(qMsg, "Pick a location.", true);
    if (!item_id) return setMsg(qMsg, "Pick an item.", true);
    if (!Number.isFinite(qty) || qty <= 0) return setMsg(qMsg, "Qty must be > 0.", true);

    try {
      if (type === "receive") {
        await window.api.receiveCreate({
          location_id,
          lines: [{ item_id, qty, unit_cost: Number.isFinite(unit_cost) ? unit_cost : 0 }],
        });
      } else {
        await window.api.checkoutCreate({
          location_id,
          lines: [{ item_id, qty }],
        });
      }

      setMsg(qMsg, type === "receive" ? "Received." : "Checked out.");
      window.dispatchEvent(new CustomEvent("data:changed"));
      clearForm();
      await load();
    } catch (e) {
      setMsg(qMsg, e?.message || "Transaction failed.", true);
    }
  };

  qReceive?.addEventListener("click", () => quickTx("receive"));
  qCheckout?.addEventListener("click", () => quickTx("checkout"));
  qReset?.addEventListener("click", clearForm);

  // Select-all behavior for quick inputs
  [lCode, lName, iSku, iDesc, iCat, iUnit, iPar, iRestock, iCost, qQty, qCost].forEach((el) => {
    if (!el) return;
    el.addEventListener("focus", () => {
      try {
        el.select();
      } catch {}
    });
  });

  // Normalize cost field formatting
  qCost?.addEventListener("blur", () => {
    qCost.value = fmtMoney(String(qCost.value || "").replace(/[$,]/g, ""));
  });
  iCost?.addEventListener("blur", () => {
    iCost.value = fmtMoney(String(iCost.value || "").replace(/[$,]/g, ""));
  });

  // Quick nav buttons (no slash)
  document.querySelectorAll("[data-go]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const go = btn.dataset.go;
      if (!go) return;
      location.hash = `#${go}`;
    });
  });

  window.addEventListener("data:changed", load);

  await load();
  clearForm();
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}