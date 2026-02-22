export async function mountReceive() {
  const msg = document.getElementById("rMsg");
  const btn = document.getElementById("rSubmit");

  const rInit = document.getElementById("rInit");
  const rVendor = document.getElementById("rVendor");
  const rPO = document.getElementById("rPO");
  const rLoc = document.getElementById("rLoc");

  // New: search UI + hidden item_id
  const rItemSearch = document.getElementById("rItemSearch");
  const rItemResults = document.getElementById("rItemResults");
  const rItem = document.getElementById("rItem"); // hidden input holding item_id

  const rQty = document.getElementById("rQty");
  const rCost = document.getElementById("rCost");
  const rNotes = document.getElementById("rNotes");

  // Guard: fail fast if HTML IDs don't match JS
  const missing = [];
  if (!msg) missing.push("rMsg");
  if (!btn) missing.push("rSubmit");
  if (!rInit) missing.push("rInit");
  if (!rVendor) missing.push("rVendor");
  if (!rPO) missing.push("rPO");
  if (!rLoc) missing.push("rLoc");
  if (!rItemSearch) missing.push("rItemSearch");
  if (!rItemResults) missing.push("rItemResults");
  if (!rItem) missing.push("rItem");
  if (!rQty) missing.push("rQty");
  if (!rCost) missing.push("rCost");
  if (!rNotes) missing.push("rNotes");
  if (missing.length)
    throw new Error(`Receive page missing: ${missing.join(", ")}`);

  let items = [];

  function setMsg(t, err = false) {
    msg.textContent = t || "";
    msg.classList.toggle("err", !!err);
  }

  async function loadPickers() {
    const [locs, itemsRes] = await Promise.all([
      window.api.locationsList(),
      window.api.itemsList(),
    ]);

    items = itemsRes || [];

    rLoc.innerHTML =
      `<option value="">Select...</option>` +
      locs
        .map(
          (l) =>
            `<option value="${l.id}">${escapeHtml(l.code)}${
              l.name ? " — " + escapeHtml(l.name) : ""
            }</option>`,
        )
        .join("");
    rLoc.value = "";
  }

  function wireItemSearch() {
    const close = () => rItemResults.classList.add("hidden");
    const open = () => rItemResults.classList.remove("hidden");

    const render = (q) => {
      const needle = String(q || "")
        .trim()
        .toLowerCase();
      if (!needle) {
        rItemResults.innerHTML = "";
        close();
        return;
      }

      const hits = items
        .filter((i) =>
          `${i.sku} ${i.description}`.toLowerCase().includes(needle),
        )
        .slice(0, 12);

      if (!hits.length) {
        rItemResults.innerHTML = `<div class="combo-empty">No matches</div>`;
        open();
        return;
      }

      rItemResults.innerHTML = hits
        .map(
          (i) => `
            <button type="button" class="combo-item" data-id="${i.id}">
              <span class="mono">${escapeHtml(i.sku)}</span> — ${escapeHtml(i.description)}
            </button>
          `,
        )
        .join("");

      open();
    };

    rItemSearch.addEventListener("input", () => {
      // clear selected item_id when user edits
      rItem.value = "";
      render(rItemSearch.value);
    });

    rItemSearch.addEventListener("focus", () => render(rItemSearch.value));

    document.addEventListener("click", (e) => {
      if (!e.target.closest(".combo")) close();
    });

    rItemResults.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-id]");
      if (!btn) return;

      const id = btn.getAttribute("data-id");
      const hit = items.find((x) => String(x.id) === String(id));
      if (!hit) return;

      rItem.value = String(hit.id);
      rItemSearch.value = `${hit.sku} — ${hit.description}`;
      close();
      rQty.focus();
    });

    // Optional: keyboard UX (Enter picks first result)
    rItemSearch.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const first = rItemResults.querySelector("[data-id]");
        if (first) {
          first.click();
          e.preventDefault();
        }
      }
      if (e.key === "Escape") close();
    });
  }

  async function submit() {
    setMsg("");
    btn.disabled = true;

    try {
      // Validation (prevents null/blank submits)
      if (!rInit.value.trim()) throw new Error("User initials required.");
      if (!rVendor.value.trim()) throw new Error("Vendor required.");
      if (!rLoc.value) throw new Error("Location required.");
      if (!rItem.value) throw new Error("Item required (search and select).");

      const payload = {
        user_initials: rInit.value,
        vendor: rVendor.value,
        po_number: rPO.value,
        location_id: rLoc.value,
        item_id: rItem.value, // hidden item_id
        qty: rQty.value,
        unit_cost: rCost.value,
        notes: rNotes.value,
      };

      const res = await window.api.receiveSubmit(payload);
      setMsg(`Received. TX #${res.transaction_id}`);
      window.dispatchEvent(new CustomEvent("data:changed"));

      // reset
      rQty.value = "1";
      rCost.value = "0";
      rNotes.value = "";
      rItem.value = "";
      rItemSearch.value = "";
      rItemSearch.focus();
    } catch (e) {
      setMsg(e.message || "Failed.", true);
    } finally {
      btn.disabled = false;
    }
  }

  btn.addEventListener("click", submit);

  rNotes.addEventListener("keydown", (e) => {
    // Ctrl+Enter submits; plain Enter makes a new line
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit();
  });

  await loadPickers();
  wireItemSearch();
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
