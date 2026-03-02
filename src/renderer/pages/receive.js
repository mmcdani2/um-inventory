// src/renderer/pages/receive.js
export async function mountReceive() {
  // ---------- DOM ----------
  // Banner + location controls
  const activeLocationBanner = document.getElementById("activeLocationBanner");
  const activeLocationText = document.getElementById("activeLocationText");
  const activeLocationSubtext = document.getElementById("activeLocationSubtext");
  const btnClearLocation = document.getElementById("btnClearLocation");
  const btnChangeLocation = document.getElementById("btnChangeLocation");

  // Scan inputs + errors + status
  const locationScanInput = document.getElementById("locationScanInput");
  const locationScanError = document.getElementById("locationScanError");

  const itemScanInput = document.getElementById("itemScanInput");
  const itemScanError = document.getElementById("itemScanError");

  const lastScanStatus = document.getElementById("lastScanStatus");

  // Qty override
  const qtyOverrideEnabled = document.getElementById("qtyOverrideEnabled");
  const qtyOverrideInput = document.getElementById("qtyOverrideInput");

  // Lines + actions
  const receiveLinesList = document.getElementById("receiveLinesList");
  const emptyLinesHint = document.getElementById("emptyLinesHint");

  const btnUndoLast = document.getElementById("btnUndoLast");
  const btnClearBatch = document.getElementById("btnClearBatch");

  // Finalize bar
  const finalizeLineCount = document.getElementById("finalizeLineCount");
  const finalizeUnitCount = document.getElementById("finalizeUnitCount");
  const finalizeLocationText = document.getElementById("finalizeLocationText");
  const btnFinalizeReceive = document.getElementById("btnFinalizeReceive");

  // Optional details
  const receiveUserInitials = document.getElementById("receiveUserInitials");
  const receiveVendor = document.getElementById("receiveVendor");
  const receivePoNumber = document.getElementById("receivePoNumber");
  const receiveNotes = document.getElementById("receiveNotes");

  // Location change safety panel
  const locationChangeModal = document.getElementById("locationChangeModal");
  const btnLocationChangeCancel = document.getElementById("btnLocationChangeCancel");
  const btnLocationChangeClear = document.getElementById("btnLocationChangeClear");

  // Smart Add
  const smartAddWrap = document.getElementById("smartAddWrap");
  const btnSmartAddCancel = document.getElementById("btnSmartAddCancel");
  const btnSmartAddSave = document.getElementById("btnSmartAddSave");

  const smartAddBarcode = document.getElementById("smartAddBarcode");
  const smartAddSku = document.getElementById("smartAddSku");
  const smartAddDescription = document.getElementById("smartAddDescription");
  const smartAddCategory = document.getElementById("smartAddCategory");
  const smartAddUnit = document.getElementById("smartAddUnit");
  const smartAddVendor = document.getElementById("smartAddVendor");
  const smartAddDefaultCost = document.getElementById("smartAddDefaultCost");
  const smartAddReorderPoint = document.getElementById("smartAddReorderPoint");
  const smartAddReorderQty = document.getElementById("smartAddReorderQty");
  const smartAddBarcodeType = document.getElementById("smartAddBarcodeType");
  const smartAddPrintLabel = document.getElementById("smartAddPrintLabel");
  const smartAddStatus = document.getElementById("smartAddStatus");

  // ---------- state ----------
  let locs = [];
  let items = [];

  let activeLoc = null; // {id, code, name?}
  let pendingLoc = null; // for safety prompt

  // item_id -> { item_id, sku, description, unit_cost, qty }
  const linesByItemId = new Map();
  const undoStack = []; // { item_id, deltaQty }

  // Smart Add context
  let smartAddPendingQty = 1;

  // ---------- helpers ----------
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[c]);

  const toNum = (v, fallback = 0) => {
    const n = Number(String(v ?? "").trim());
    return Number.isFinite(n) ? n : fallback;
  };

  const setErr = (el, text) => {
    if (!el) return;
    el.textContent = text || "";
  };

  const setStatus = (text) => {
    if (!lastScanStatus) return;
    lastScanStatus.textContent = text || "";
  };

  const focusSelect = (el) => {
    if (!el) return;
    try {
      el.focus();
      el.select();
    } catch { }
  };

  function syncQtyOverrideEnabled() {
    const use = !!qtyOverrideEnabled?.checked;
    qtyOverrideInput.disabled = !use;
    if (!use) qtyOverrideInput.value = "1";
  }

  function getQtyForThisScan() {
    const useOverride = !!qtyOverrideEnabled?.checked;
    const qty = useOverride ? toNum(qtyOverrideInput.value, 1) : 1;
    return Number.isFinite(qty) && qty > 0 ? qty : 1;
  }

  function resetQtyOverrideIfUsed() {
    if (qtyOverrideEnabled?.checked) {
      qtyOverrideInput.value = "1";
      qtyOverrideEnabled.checked = false;
      syncQtyOverrideEnabled();
    }
  }

  function bannerTint(isSet) {
    // Use theme tokens via CSS vars if present; fallback to safe RGBA.
    // We apply inline style (no page CSS).
    if (!activeLocationBanner) return;

    if (!isSet) {
      activeLocationBanner.style.borderColor = "rgba(239,68,68,.55)";
      activeLocationBanner.style.background = "rgba(239,68,68,.10)";
      return;
    }
    activeLocationBanner.style.borderColor = "rgba(34,197,94,.55)";
    activeLocationBanner.style.background = "rgba(34,197,94,.10)";
  }

  function setActiveLocation(loc) {
    activeLoc = loc ? { id: loc.id, code: loc.code, name: loc.name || "" } : null;

    if (!activeLoc) {
      bannerTint(false);
      activeLocationText.textContent = "NONE SET";
      activeLocationSubtext.textContent = "Scan a location to continue.";
      finalizeLocationText.textContent = "—";
      itemScanInput.disabled = true;
      focusSelect(locationScanInput);
      syncFinalizeEnabled();
      return;
    }

    bannerTint(true);
    activeLocationText.textContent = activeLoc.code;
    activeLocationSubtext.textContent = activeLoc.name ? activeLoc.name : "";
    finalizeLocationText.textContent = activeLoc.code;
    itemScanInput.disabled = false;
    focusSelect(itemScanInput);
    syncFinalizeEnabled();
  }

  function syncFinalizeEnabled() {
    const hasLines = linesByItemId.size > 0;
    btnUndoLast.disabled = undoStack.length === 0;
    btnClearBatch.disabled = !hasLines;
    btnFinalizeReceive.disabled = !(activeLoc && hasLines) || smartAddIsOpen();
  }

  function renderLines() {
    const rows = Array.from(linesByItemId.values());
    const lineCount = rows.length;
    const totalUnits = rows.reduce((a, x) => a + Number(x.qty || 0), 0);

    finalizeLineCount.textContent = String(lineCount);
    finalizeUnitCount.textContent = String(totalUnits);

    receiveLinesList.innerHTML = rows
      .map(
        (ln) => `
        <li class="card-block" style="padding:10px 12px;">
          <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px;">
            <div style="min-width:0;">
              <div class="mono" style="font-weight:900;">${esc(ln.sku)}</div>
              <div class="msg" style="margin-top:4px;">${esc(ln.description)}</div>
            </div>
            <div style="display:flex; align-items:center; gap:10px;">
              <div class="mono" style="font-weight:900; font-size:16px;">${Number(ln.qty || 0)}</div>
              <button class="btn" type="button" data-remove="${ln.item_id}">Remove</button>
            </div>
          </div>
        </li>
      `,
      )
      .join("");

    emptyLinesHint.hidden = lineCount !== 0;
    syncFinalizeEnabled();
  }

  async function findLocationByCode(raw) {
    const needle = String(raw || "").trim().toLowerCase();
    if (!needle) return null;

    // Always fetch fresh locations instead of relying on stale in-memory locs
    const freshLocs = await window.api.locationsList();
    locs = Array.isArray(freshLocs) ? freshLocs : [];

    return (
      locs.find(
        (l) => String(l.code || "").trim().toLowerCase() === needle
      ) || null
    );
  }

  function findItemByScan(raw) {
    const needle = String(raw || "").trim().toLowerCase();
    if (!needle) return null;

    // Match house barcode
    const byHouse = items.find(
      (i) => String(i.barcode ?? "").trim().toLowerCase() === needle
    );
    if (byHouse) return byHouse;

    // Match vendor barcode
    const byVendor = items.find(
      (i) => String(i.vendor_barcode ?? "").trim().toLowerCase() === needle
    );
    if (byVendor) return byVendor;

    // Match SKU
    const bySku = items.find(
      (i) => String(i.sku ?? "").trim().toLowerCase() === needle
    );
    if (bySku) return bySku;

    return null;
  }

  function addScan(item, qtyToAdd) {
    const delta = Math.max(1, Number(qtyToAdd || 1));
    const key = Number(item.id);

    const existing = linesByItemId.get(key);
    if (existing) {
      existing.qty += delta;
      linesByItemId.set(key, existing);
    } else {
      linesByItemId.set(key, {
        item_id: key,
        sku: item.sku,
        description: item.description,
        unit_cost: toNum(item.default_cost, 0),
        qty: delta,
      });
    }

    undoStack.push({ item_id: key, deltaQty: delta });
    renderLines();

    setStatus(`OK: +${delta} ${item.sku} @ ${activeLoc.code}`);
    resetQtyOverrideIfUsed();
  }

  function undoLast() {
    const last = undoStack.pop();
    if (!last) return;

    const ln = linesByItemId.get(last.item_id);
    if (!ln) return;

    ln.qty -= last.deltaQty;
    if (ln.qty <= 0) linesByItemId.delete(last.item_id);
    else linesByItemId.set(last.item_id, ln);

    renderLines();
    setStatus("Undo: last scan removed");
    focusSelect(itemScanInput);
  }

  function clearBatch() {
    linesByItemId.clear();
    undoStack.length = 0;
    renderLines();
  }

  function openLocationChangePrompt(nextLoc) {
    pendingLoc = nextLoc;
    locationChangeModal.hidden = false;
    // Pull focus off scanners to prevent accidental scans while prompt is up
    btnLocationChangeClear?.focus();
    syncFinalizeEnabled();
  }

  function closeLocationChangePrompt() {
    pendingLoc = null;
    locationChangeModal.hidden = true;
    syncFinalizeEnabled();
  }

  function smartAddIsOpen() {
    return smartAddWrap && !smartAddWrap.hidden;
  }

  function guessItemFromBarcode(barcodeRaw) {
    const b = String(barcodeRaw || "").trim();
    const digitsOnly = /^[0-9]+$/.test(b);
    const len = b.length;

    // SKU: stable + unique enough (barcode itself). Prefix by type if it looks like UPC/EAN.
    const skuPrefix = digitsOnly
      ? (len === 12 ? "UPC" : len === 13 ? "EAN" : "BC")
      : "BC";

    const sku = `${skuPrefix}-${b}`;

    // Description/category: safe placeholders that keep flow moving.
    const description =
      digitsOnly && len === 12 ? `New item (UPC ${b})` :
        digitsOnly && len === 13 ? `New item (EAN ${b})` :
          `New item (${b})`;

    const category = "Uncategorized";

    return { sku, description, category };
  }

  async function openSmartAdd(barcodeValue, qtyToAdd) {
    smartAddPendingQty = Math.max(1, Number(qtyToAdd || 1));

    setErr(smartAddStatus, "");
    smartAddWrap.hidden = false;

    // Prefill
    smartAddBarcode.value = String(barcodeValue || "").trim();

    const guess = guessItemFromBarcode(smartAddBarcode.value);
    smartAddSku.value = guess.sku;
    smartAddDescription.value = guess.description;
    smartAddCategory.value = guess.category;
    smartAddUnit.value = smartAddUnit.value || "EA";
    smartAddVendor.value = "";
    smartAddDefaultCost.value = String(toNum(smartAddDefaultCost.value, 0) || 0);
    smartAddReorderPoint.value = String(toNum(smartAddReorderPoint.value, 0) || 0);
    smartAddReorderQty.value = String(toNum(smartAddReorderQty.value, 0) || 0);
    if (!smartAddBarcodeType.value) smartAddBarcodeType.value = "qr";
    if (smartAddPrintLabel) smartAddPrintLabel.checked = true;

    // Best-effort online lookup (offline-safe, fail-soft)
    try {
      setErr(smartAddStatus, "Looking up barcode…");

      const info = await window.api.barcodeLookup(smartAddBarcode.value);

      if (info) {
        if (info.title) smartAddDescription.value = info.title;

        if (info.category) {
          const parts = String(info.category)
            .split(">")
            .map((s) => s.trim())
            .filter(Boolean);
          smartAddCategory.value = parts.length ? parts[parts.length - 1] : String(info.category).trim();
        }

        if (info.brand) smartAddVendor.value = info.brand;

        setErr(smartAddStatus, "");
      } else {
        setErr(smartAddStatus, "");
      }
    } catch {
      setErr(smartAddStatus, "");
    }

    // Disable scanning while modal open
    itemScanInput.disabled = true;
    locationScanInput.disabled = true;

    setStatus(`NOT FOUND: ${smartAddBarcode.value} → Smart Add`);
    focusSelect(smartAddSku);
    syncFinalizeEnabled();
  }

  function closeSmartAdd() {
    smartAddWrap.hidden = true;

    // Re-enable scanning
    locationScanInput.disabled = false;
    itemScanInput.disabled = !activeLoc;

    setErr(smartAddStatus, "");
    smartAddPendingQty = 1;

    // Return focus to item scan if possible
    if (activeLoc) focusSelect(itemScanInput);
    else focusSelect(locationScanInput);

    syncFinalizeEnabled();
  }

  async function refreshItems() {
    const itemRes = await window.api.itemsList();
    items = Array.isArray(itemRes) ? itemRes : [];
  }

  async function printHouseLabel2x1({ type, value, sku, description }) {
    try {
      const pngDataUrl = await window.api.labelRenderBarcodePng({
        type,
        text: value
      });

      if (!pngDataUrl) return;

      const w = window.open("", "_blank", "noopener,noreferrer,width=500,height=400");
      if (!w) return;

      const safeSku = esc(sku || "");
      const safeDesc = esc(description || "");

      w.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Label</title>
<style>
  @page { size: 2in 1in; margin: 0; }
  html, body { width: 2in; height: 1in; margin:0; padding:0; }
  body { font-family: Arial, sans-serif; }
  .wrap {
    box-sizing:border-box;
    width:2in;
    height:1in;
    padding:8px;
    display:flex;
    flex-direction:column;
    justify-content:space-between;
  }
  .sku { font-weight:900; font-size:14px; }
  .desc { font-size:10px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .barcode { text-align:center; }
  img { max-width:100%; height:40px; }
</style>
</head>
<body>
  <div class="wrap">
    <div>
      <div class="sku">${safeSku}</div>
      <div class="desc">${safeDesc}</div>
    </div>
    <div class="barcode">
      <img src="${pngDataUrl}" />
    </div>
  </div>
<script>
  window.onload = () => {
    window.focus();
    window.print();
  };
</script>
</body>
</html>`);

      w.document.close();
    } catch (err) {
      console.error("Label print failed:", err);
    }
  }

  // ---------- load ----------
  async function loadData() {
    const [locRes, itemRes] = await Promise.all([window.api.locationsList(), window.api.itemsList()]);
    locs = Array.isArray(locRes) ? locRes : [];
    items = Array.isArray(itemRes) ? itemRes : [];
  }

  // ---------- events ----------
  // Select-all focus behavior
  [
    locationScanInput,
    itemScanInput,
    qtyOverrideInput,
    receiveUserInitials,
    receiveVendor,
    receivePoNumber,
    receiveNotes,
    smartAddBarcode,
    smartAddSku,
    smartAddDescription,
    smartAddCategory,
    smartAddUnit,
    smartAddVendor,
    smartAddDefaultCost,
    smartAddReorderPoint,
    smartAddReorderQty,
  ].forEach((el) => {
    el?.addEventListener("focus", () => {
      try {
        el.select();
      } catch { }
    });
  });

  qtyOverrideEnabled?.addEventListener("change", () => {
    syncQtyOverrideEnabled();
    if (qtyOverrideEnabled.checked) focusSelect(qtyOverrideInput);
    else focusSelect(itemScanInput);
  });

  // Location scan commit
  locationScanInput?.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();

    setErr(locationScanError, "");
    const raw = locationScanInput.value;
    const hit = await findLocationByCode(raw);

    if (!hit) {
      setErr(locationScanError, `Location not found: "${raw}"`);
      setStatus(`ERROR: location not found (${raw})`);
      focusSelect(locationScanInput);
      return;
    }

    // safety if batch has lines and location changes
    const hasLines = linesByItemId.size > 0;
    if (activeLoc && hasLines && hit.id !== activeLoc.id) {
      openLocationChangePrompt(hit);
      locationScanInput.value = "";
      return;
    }

    setActiveLocation(hit);
    setStatus(`OK: location set → ${hit.code}`);
    locationScanInput.value = "";
  });

  // Item scan commit
  itemScanInput?.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();

    setErr(itemScanError, "");

    if (!activeLoc) {
      setErr(itemScanError, "Set ACTIVE LOCATION first.");
      setStatus("ERROR: no active location");
      focusSelect(locationScanInput);
      return;
    }

    const raw = itemScanInput.value;
    const qty = getQtyForThisScan();

    let hit = findItemByScan(raw);

    if (!hit) {
      hit = await window.api.itemsFindByBarcode(raw);
    }

    if (!hit) {
      // NEW: try alias-table lookup (barcode -> existing item) before Smart Add
      try {
        const byAlias = await window.api.itemsFindByBarcode(raw);
        if (byAlias) {
          addScan(byAlias, qty);
          itemScanInput.value = "";
          focusSelect(itemScanInput);
          return;
        }
      } catch {
        // fail-soft, fall through to Smart Add
      }

      // Smart Add flow
      void openSmartAdd(raw, qty);
      itemScanInput.value = "";
      return;
    }

    addScan(hit, qty);
    itemScanInput.value = "";
    focusSelect(itemScanInput);
  });

  // Banner controls
  btnClearLocation?.addEventListener("click", () => {
    if (smartAddIsOpen()) return;

    if (linesByItemId.size > 0) {
      // fast safety
      const ok = confirm("Clear active location and discard current batch lines?");
      if (!ok) return;
      clearBatch();
    }

    setActiveLocation(null);
    setErr(locationScanError, "");
    setErr(itemScanError, "");
    setStatus("Cleared: scan a location to continue");
  });

  // "Change" just focuses location scan
  btnChangeLocation?.addEventListener("click", () => {
    if (smartAddIsOpen()) return;
    focusSelect(locationScanInput);
  });

  // Location change prompt
  btnLocationChangeCancel?.addEventListener("click", () => {
    closeLocationChangePrompt();
    focusSelect(itemScanInput);
  });

  btnLocationChangeClear?.addEventListener("click", () => {
    if (!pendingLoc) return;
    clearBatch();
    setActiveLocation(pendingLoc);
    setStatus(`OK: location changed → ${pendingLoc.code} (batch cleared)`);
    closeLocationChangePrompt();
  });

  // List remove
  receiveLinesList?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-remove]");
    if (!btn) return;

    const itemId = Number(btn.getAttribute("data-remove"));
    if (!itemId) return;

    linesByItemId.delete(itemId);
    renderLines();
    setStatus("Line removed");
    focusSelect(itemScanInput);
  });

  // Undo / clear batch
  btnUndoLast?.addEventListener("click", undoLast);

  btnClearBatch?.addEventListener("click", () => {
    if (smartAddIsOpen()) return;
    if (!linesByItemId.size) return;
    const ok = confirm("Clear current batch lines?");
    if (!ok) return;
    clearBatch();
    setStatus("Batch cleared");
    focusSelect(itemScanInput);
  });

  // Smart Add cancel/save
  btnSmartAddCancel?.addEventListener("click", () => {
    closeSmartAdd();
  });

  btnSmartAddSave?.addEventListener("click", async () => {
    setErr(smartAddStatus, "");

    const vendorBarcode = String(smartAddBarcode.value || "").trim();

    // Generate unique house barcode (internal)
    const houseBarcode =
      "HB-" +
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2, 6).toUpperCase();
    const sku = String(smartAddSku.value || "").trim();
    const description = String(smartAddDescription.value || "").trim();

    if (!vendorBarcode) return setErr(smartAddStatus, "Vendor Barcode is required.");
    if (!sku) return setErr(smartAddStatus, "SKU is required.");
    if (!description) return setErr(smartAddStatus, "Description is required.");

    btnSmartAddSave.disabled = true;

    try {
      const itemPayload = {
        sku,
        description,
        category: String(smartAddCategory.value || "").trim(),
        unit: String(smartAddUnit.value || "EA").trim() || "EA",
        vendor: String(smartAddVendor.value || "").trim(),
        barcode: houseBarcode,          // internal label
        vendor_barcode: vendorBarcode,  // original scanned UPC
        reorder_point: toNum(smartAddReorderPoint.value, 0),
        reorder_qty: toNum(smartAddReorderQty.value, 0),
        default_cost: toNum(smartAddDefaultCost.value, 0),
        is_active: 1,
      };

      const created = await window.api.itemsCreate(itemPayload);
      await refreshItems();

      // Find created item (prefer returned object)
      const createdItem =
        created && created.id
          ? created
          : items.find((i) => String(i.sku || "").toLowerCase() === sku.toLowerCase()) ||
          items.find((i) => String(i.barcode || "").toLowerCase() === houseBarcode.toLowerCase());

      if (!createdItem) throw new Error("Item created, but could not re-load it.");

      // Insert barcode aliases
      await window.api.itemsAttachBarcode({
        item_id: createdItem.id,
        barcode: houseBarcode,
        source: "house"
      });

      await window.api.itemsAttachBarcode({
        item_id: createdItem.id,
        barcode: vendorBarcode,
        source: "vendor"
      });

      console.log("Attached vendor barcode:", vendorBarcode);

      // Auto-add to receive batch
      addScan(createdItem, smartAddPendingQty);

      // Optional print
      if (smartAddPrintLabel?.checked) {
        printHouseLabel2x1({
          type: String(smartAddBarcodeType.value || "qr"),
          value: houseBarcode,
          sku,
          description,
        });
      }

      // Close and return to scan loop
      closeSmartAdd();
      window.dispatchEvent(new CustomEvent("data:changed"));
    } catch (e) {
      setErr(smartAddStatus, e?.message || "Smart Add failed.");
    } finally {
      btnSmartAddSave.disabled = false;
    }
  });

  // Finalize (ONE batch submit)
  btnFinalizeReceive?.addEventListener("click", async () => {
    setErr(itemScanError, "");
    setErr(locationScanError, "");

    if (smartAddIsOpen()) return;

    if (!activeLoc) {
      setErr(locationScanError, "Set ACTIVE LOCATION first.");
      return focusSelect(locationScanInput);
    }

    const lines = Array.from(linesByItemId.values());
    if (!lines.length) {
      setErr(itemScanError, "No lines to receive.");
      return focusSelect(itemScanInput);
    }

    btnFinalizeReceive.disabled = true;

    try {
      const payload = {
        user_initials: String(receiveUserInitials?.value || "").trim(),
        vendor: String(receiveVendor?.value || "").trim(),
        po_number: String(receivePoNumber?.value || "").trim(),
        notes: String(receiveNotes?.value || "").trim(),
        location_id: activeLoc.id,
        lines: lines.map((ln) => ({
          item_id: ln.item_id,
          qty: Number(ln.qty || 0),
          unit_cost: toNum(ln.unit_cost, 0),
        })),
      };

      await window.api.receiveSubmitBatch(payload);

      clearBatch();
      setStatus(`OK: batch finalized → ${activeLoc.code}`);
      window.dispatchEvent(new CustomEvent("data:changed"));

      // keep location sticky, keep scanning
      focusSelect(itemScanInput);
    } catch (e) {
      setErr(itemScanError, e?.message || "Finalize failed.");
      setStatus(`ERROR: finalize failed`);
      focusSelect(itemScanInput);
    } finally {
      syncFinalizeEnabled();
    }
  });

  // ---------- init ----------
  await loadData();
  syncQtyOverrideEnabled();
  renderLines();
  setActiveLocation(null);
  setStatus("Ready: scan a location");
  focusSelect(locationScanInput);

  // Refresh data when bulk import or other pages change data
  window.addEventListener("data:changed", async () => {
    await loadData();
  });
}