// src/renderer/pages/receive.js
export async function mountReceive() {
  // ---------- DOM ----------
  // Banner + location controls
  const activeLocationBanner = document.getElementById("activeLocationBanner");
  const activeLocationText = document.getElementById("activeLocationText");
  const activeLocationSubtext = document.getElementById(
    "activeLocationSubtext",
  );
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
  const btnLocationChangeCancel = document.getElementById(
    "btnLocationChangeCancel",
  );
  const btnLocationChangeClear = document.getElementById(
    "btnLocationChangeClear",
  );

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
  const smartAddModeCreate = document.getElementById("smartAddModeCreate");
  const smartAddModeAttach = document.getElementById("smartAddModeAttach");
  const smartAddAttachWrap = document.getElementById("smartAddAttachWrap");
  const smartAddAttachSearch = document.getElementById("smartAddAttachSearch");
  const smartAddAttachSelect = document.getElementById("smartAddAttachSelect");
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
    String(s ?? "").replace(
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
    } catch {}
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
    activeLoc = loc
      ? { id: loc.id, code: loc.code, name: loc.name || "" }
      : null;

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

  function findLocationByCode(raw) {
    const needle = String(raw || "")
      .trim()
      .toLowerCase();
    if (!needle) return null;
    return (
      locs.find(
        (l) =>
          String(l.code || "")
            .trim()
            .toLowerCase() === needle,
      ) || null
    );
  }

  function findItemByScan(raw) {
    const needle = String(raw || "")
      .trim()
      .toLowerCase();
    if (!needle) return null;

    const byBarcode = items.find(
      (i) =>
        String(i.barcode ?? "")
          .trim()
          .toLowerCase() === needle,
    );
    if (byBarcode) return byBarcode;

    const bySku = items.find(
      (i) =>
        String(i.sku ?? "")
          .trim()
          .toLowerCase() === needle,
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
      ? len === 12
        ? "UPC"
        : len === 13
          ? "EAN"
          : "BC"
      : "BC";

    const sku = `${skuPrefix}-${b}`;

    // Description/category: safe placeholders that keep flow moving.
    const description =
      digitsOnly && len === 12
        ? `New item (UPC ${b})`
        : digitsOnly && len === 13
          ? `New item (EAN ${b})`
          : `New item (${b})`;

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
    smartAddDefaultCost.value = String(
      toNum(smartAddDefaultCost.value, 0) || 0,
    );
    smartAddReorderPoint.value = String(
      toNum(smartAddReorderPoint.value, 0) || 0,
    );
    smartAddReorderQty.value = String(toNum(smartAddReorderQty.value, 0) || 0);
    if (!smartAddBarcodeType.value) smartAddBarcodeType.value = "qr";
    if (smartAddPrintLabel) smartAddPrintLabel.checked = true;

    // Default Smart Add mode = Create
    setSmartAddMode("create");
    if (smartAddAttachSearch) smartAddAttachSearch.value = "";
    fillAttachSelect("");

    // Best-effort online lookup (offline-safe, fail-soft)
    try {
      setErr(smartAddStatus, "Looking up barcode…");

      const info = await window.api.barcodeLookup(smartAddBarcode.value);
      if (info) {
        if (info.title) smartAddDescription.value = info.title;
        // Auto-suggest top 5 existing items (Attach mode helper)
        const suggestions = suggestExistingItemsFromLookup(info);
        if (suggestions.length) {
          fillAttachSelectWithItems(suggestions);

          // Show Attach UI and hint operator (don’t force it, just surface it)
          if (smartAddAttachWrap) smartAddAttachWrap.hidden = false;
          setErr(
            smartAddStatus,
            `Possible matches found (${suggestions.length}). Switch to "Attach" to link this barcode.`,
          );
        }
        if (info.category) {
          const parts = String(info.category)
            .split(">")
            .map((s) => s.trim())
            .filter(Boolean);
          smartAddCategory.value = parts.length
            ? parts[parts.length - 1]
            : String(info.category).trim();
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

  function getSmartAddMode() {
    return smartAddModeAttach?.checked ? "attach" : "create";
  }

  function setSmartAddMode(mode) {
    const isAttach = mode === "attach";
    if (smartAddModeCreate) smartAddModeCreate.checked = !isAttach;
    if (smartAddModeAttach) smartAddModeAttach.checked = isAttach;

    if (smartAddAttachWrap) smartAddAttachWrap.hidden = !isAttach;

    // Disable create fields when attaching to existing
    const disableCreateFields = isAttach;
    [
      smartAddSku,
      smartAddDescription,
      smartAddCategory,
      smartAddUnit,
      smartAddVendor,
      smartAddDefaultCost,
      smartAddReorderPoint,
      smartAddReorderQty,
    ].forEach((el) => {
      if (el) el.disabled = disableCreateFields;
    });
  }

  function fillAttachSelect(filterText = "") {
    if (!smartAddAttachSelect) return;

    const q = String(filterText || "")
      .trim()
      .toLowerCase();
    const matches = (items || [])
      .filter((i) => i && i.id)
      .filter((i) => {
        if (!q) return true;
        const sku = String(i.sku || "").toLowerCase();
        const desc = String(i.description || "").toLowerCase();
        return sku.includes(q) || desc.includes(q);
      })
      .slice(0, 50);

    smartAddAttachSelect.innerHTML = matches
      .map((i) => {
        const label =
          `${String(i.sku || "").trim()} — ${String(i.description || "").trim()}`.slice(
            0,
            120,
          );
        return `<option value="${Number(i.id)}">${esc(label)}</option>`;
      })
      .join("");
  }

  function suggestExistingItemsFromLookup(info) {
    if (!info) return [];

    const title = String(info.title || "").toLowerCase();
    const brand = String(info.brand || "").toLowerCase();
    const category = String(info.category || "").toLowerCase();

    const tokens = (s) =>
      String(s || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .split(/\s+/)
        .filter((t) => t.length >= 3);

    const tTitle = new Set(tokens(title));
    const tBrand = new Set(tokens(brand));
    const tCat = new Set(tokens(category));

    const scoreItem = (it) => {
      const sku = String(it.sku || "").toLowerCase();
      const desc = String(it.description || "").toLowerCase();
      const vndr = String(it.vendor || "").toLowerCase();
      const cat = String(it.category || "").toLowerCase();

      const itTokens = new Set(tokens(`${sku} ${desc} ${vndr} ${cat}`));

      let score = 0;
      for (const t of tTitle) if (itTokens.has(t)) score += 3;
      for (const t of tBrand)
        if (itTokens.has(t) || vndr.includes(brand)) score += 4;
      for (const t of tCat) if (itTokens.has(t)) score += 1;

      // small boosts
      if (brand && vndr.includes(brand)) score += 5;
      if (title && desc.includes(title.slice(0, Math.min(12, title.length))))
        score += 2;

      return score;
    };

    const ranked = (items || [])
      .filter((it) => it && it.id && it.is_active !== 0)
      .map((it) => ({ it, score: scoreItem(it) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((x) => x.it);

    return ranked;
  }

  function fillAttachSelectWithItems(list) {
    if (!smartAddAttachSelect) return;
    const rows = Array.isArray(list) ? list : [];
    smartAddAttachSelect.innerHTML = rows
      .map((i) => {
        const label =
          `${String(i.sku || "").trim()} — ${String(i.description || "").trim()}`.slice(
            0,
            120,
          );
        return `<option value="${Number(i.id)}">${esc(label)}</option>`;
      })
      .join("");
  }

  async function attachBarcodeToItem(itemId, barcode) {
    // source is HOUSE by policy
    await window.api.itemsAttachBarcode({
      item_id: Number(itemId),
      barcode: String(barcode || "").trim(),
      source: "house",
    });
  }

  function printHouseLabel2x1({ type, value, sku, description }) {
    // NOTE: This is NOT a PDF generator (no deps). It opens a print window sized via CSS @page.
    // It’s stable enough for v1 on cheap printers if scaling is set to 100%.
    const w = window.open(
      "",
      "_blank",
      "noopener,noreferrer,width=500,height=400",
    );
    if (!w) return;

    const safeSku = esc(sku || "");
    const safeDesc = esc(description || "");
    const safeVal = esc(value || "");

    // Barcode rendering: v1 uses QR only (built-in via simple SVG fallback is not available without libs).
    // For Code128 we print human-readable value and rely on later backend/native print support.
    // This keeps flow working NOW; we can upgrade rendering later with a tiny lib.
    const codeHtml =
      type === "qr"
        ? `<div style="font-size:12px; margin-bottom:6px;">QR: ${safeVal}</div>
           <div style="font-size:11px; opacity:.9;">(QR rendering will be added next step)</div>`
        : `<div style="font-size:12px; margin-bottom:6px;">CODE128: ${safeVal}</div>
           <div style="font-size:11px; opacity:.9;">(Code128 rendering will be added next step)</div>`;

    w.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Label</title>
<style>
  @page { size: 2in 1in; margin: 0; }
  html, body { width: 2in; height: 1in; margin:0; padding:0; }
  body { font-family: Arial, sans-serif; }
  .wrap { box-sizing:border-box; width:2in; height:1in; padding:8px; display:flex; flex-direction:column; justify-content:space-between; }
  .sku { font-weight:900; font-size:14px; line-height:1.1; }
  .desc { font-size:10px; line-height:1.1; opacity:.95; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .code { font-size:10px; line-height:1.1; }
</style>
</head>
<body>
  <div class="wrap">
    <div>
      <div class="sku">${safeSku}</div>
      <div class="desc">${safeDesc}</div>
    </div>
    <div class="code">
      ${codeHtml}
    </div>
  </div>
<script>
  window.onload = () => { window.focus(); window.print(); };
</script>
</body>
</html>`);
    w.document.close();
  }

  // ---------- load ----------
  async function loadData() {
    const [locRes, itemRes] = await Promise.all([
      window.api.locationsList(),
      window.api.itemsList(),
    ]);
    locs = Array.isArray(locRes) ? locRes : [];
    items = Array.isArray(itemRes) ? itemRes : [];
  }

  // Smart Add mode toggles
  smartAddModeCreate?.addEventListener("change", () => {
    if (smartAddModeCreate.checked) setSmartAddMode("create");
  });
  smartAddModeAttach?.addEventListener("change", () => {
    if (smartAddModeAttach.checked) setSmartAddMode("attach");
  });

  // Attach search
  smartAddAttachSearch?.addEventListener("input", () => {
    fillAttachSelect(smartAddAttachSearch.value);
  });
  smartAddAttachSearch?.addEventListener("focus", () => {
    try {
      smartAddAttachSearch.select();
    } catch {}
  });

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
      } catch {}
    });
  });

  qtyOverrideEnabled?.addEventListener("change", () => {
    syncQtyOverrideEnabled();
    if (qtyOverrideEnabled.checked) focusSelect(qtyOverrideInput);
    else focusSelect(itemScanInput);
  });

  // Location scan commit
  locationScanInput?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();

    setErr(locationScanError, "");
    const raw = locationScanInput.value;
    const hit = findLocationByCode(raw);

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

    const hit = findItemByScan(raw);

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
      const ok = confirm(
        "Clear active location and discard current batch lines?",
      );
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

    const barcode = String(smartAddBarcode.value || "").trim();
    if (!barcode) return setErr(smartAddStatus, "Barcode is required.");

    btnSmartAddSave.disabled = true;

    try {
      const mode = getSmartAddMode();

      if (mode === "attach") {
        const itemId = Number(smartAddAttachSelect?.value || 0);
        if (!itemId)
          return setErr(smartAddStatus, "Select an existing item to attach.");

        await attachBarcodeToItem(itemId, barcode);

        // fetch canonical item (alias lookup) then add to batch
        const found = await window.api.itemsFindByBarcode(barcode);
        if (!found) throw new Error("Barcode attached, but lookup failed.");

        addScan(found, smartAddPendingQty);

        if (smartAddPrintLabel?.checked) {
          printHouseLabel2x1({
            type: String(smartAddBarcodeType.value || "qr"),
            value: barcode,
            sku: found.sku,
            description: found.description,
          });
        }

        closeSmartAdd();
        window.dispatchEvent(new CustomEvent("data:changed"));
        return;
      }

      // mode === "create"
      const sku = String(smartAddSku.value || "").trim();
      const description = String(smartAddDescription.value || "").trim();
      if (!sku) return setErr(smartAddStatus, "SKU is required.");
      if (!description)
        return setErr(smartAddStatus, "Description is required.");

      const itemPayload = {
        sku,
        description,
        category: String(smartAddCategory.value || "").trim(),
        unit: String(smartAddUnit.value || "EA").trim() || "EA",
        vendor: String(smartAddVendor.value || "").trim(),
        // Do NOT rely on items.barcode (barcode is an alias)
        barcode: null,
        reorder_point: toNum(smartAddReorderPoint.value, 0),
        reorder_qty: toNum(smartAddReorderQty.value, 0),
        default_cost: toNum(smartAddDefaultCost.value, 0),
        is_active: 1,
      };

      const created = await window.api.itemsCreate(itemPayload);

      const createdId = Number(created?.id || 0);
      const finalItemId = createdId || null;

      // Attach scanned barcode as HOUSE alias
      if (finalItemId) {
        await attachBarcodeToItem(finalItemId, barcode);
      } else {
        // fallback: refresh and find by sku
        await refreshItems();
        const bySku = items.find(
          (i) => String(i.sku || "").toLowerCase() === sku.toLowerCase(),
        );
        if (!bySku?.id)
          throw new Error("Item created, but could not resolve new item id.");
        await attachBarcodeToItem(bySku.id, barcode);
      }

      // Resolve item via alias and add
      const found = await window.api.itemsFindByBarcode(barcode);
      if (!found) throw new Error("Item created, but barcode lookup failed.");

      addScan(found, smartAddPendingQty);

      if (smartAddPrintLabel?.checked) {
        printHouseLabel2x1({
          type: String(smartAddBarcodeType.value || "qr"),
          value: barcode,
          sku: found.sku,
          description: found.description,
        });
      }

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
}