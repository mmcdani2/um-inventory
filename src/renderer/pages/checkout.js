export async function mountCheckout() {
  const msg = document.getElementById("cMsg");
  const btn = document.getElementById("cSubmit");

  const cJob = document.getElementById("cJob");
  const cTech = document.getElementById("cTech");
  const cLoc = document.getElementById("cLoc");
  const cItem = document.getElementById("cItem");          // hidden select (we'll keep it for submit)
  const cItemSearch = document.getElementById("cItemSearch");
  const cItemResults = document.getElementById("cItemResults");
  const cQty = document.getElementById("cQty");
  const cNotes = document.getElementById("cNotes");

  [cQty].forEach((el) =>
    el?.addEventListener("focus", () => el.select()),
  );

  function setMsg(t, err = false) { msg.textContent = t || ""; msg.classList.toggle("err", !!err); }

  async function loadPickers() {
    const [locs, items] = await Promise.all([
      window.api.locationsList(),
      window.api.itemsList(),
    ]);

    cLoc.innerHTML = `<option value="">Select...</option>` + locs.map(l =>
      `<option value="${l.id}">${escapeHtml(l.code)}${l.name ? " — " + escapeHtml(l.name) : ""}</option>`
    ).join("");

    // keep hidden select populated for submit (item_id comes from here)
    cItem.innerHTML = `<option value="">Select...</option>` + items.map(i =>
      `<option value="${i.id}">${escapeHtml(i.sku)} — ${escapeHtml(i.description)}</option>`
    ).join("");

    return items;
  }

  function wireItemSearch(items) {
    if (!cItemSearch || !cItemResults) return;

    const close = () => cItemResults.classList.add("hidden");
    const open = () => cItemResults.classList.remove("hidden");

    const pick = (it) => {
      cItem.value = String(it.id);
      cItemSearch.value = `${it.sku} — ${it.description}`;
      cItemResults.innerHTML = "";
      close();
      cQty.focus();
      cQty.select();
    };

    const render = (q) => {
      const needle = String(q || "").trim().toLowerCase();
      if (!needle) { cItemResults.innerHTML = ""; close(); return; }

      // barcode-first exact match
      const exact = items.find((i) => {
        const bc = String(i.barcode ?? "").trim().toLowerCase();
        return bc && bc === needle;
      });
      if (exact) return pick(exact);

      const hits = items
        .filter((i) => `${i.sku} ${i.description} ${i.barcode ?? ""}`.toLowerCase().includes(needle))
        .slice(0, 12);

      cItemResults.innerHTML = hits.map((it) => `
        <div class="pick" data-id="${it.id}">
          <div class="top">${escapeHtml(it.sku)} — ${escapeHtml(it.description)}</div>
          ${it.barcode ? `<div class="sub mono">${escapeHtml(it.barcode)}</div>` : ``}
        </div>
      `).join("");

      open();
    };

    cItemSearch.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;

      const first = cItemResults.querySelector("[data-id]");
      if (!first) return;

      e.preventDefault();
      const id = Number(first.dataset.id);
      const it = items.find((x) => Number(x.id) === id);
      if (it) pick(it);
    });

    cItemSearch.addEventListener("focus", () => cItemSearch.select());
    cItemSearch.addEventListener("input", () => render(cItemSearch.value));

    cItemResults.addEventListener("click", (e) => {
      const el = e.target.closest("[data-id]");
      if (!el) return;
      const id = Number(el.dataset.id);
      const it = items.find((x) => Number(x.id) === id);
      if (it) pick(it);
    });

    document.addEventListener("click", (e) => {
      if (e.target === cItemSearch || cItemResults.contains(e.target)) return;
      close();
    });
  }

  async function submit() {
    setMsg("");
    btn.disabled = true;

    try {
      const payload = {
        job_number: cJob.value,
        tech: cTech.value,
        location_id: cLoc.value,
        item_id: cItem.value,
        qty: cQty.value,
        notes: cNotes.value,
      };

      const res = await window.api.checkoutSubmit(payload);
      setMsg(`Checked out. TX #${res.transaction_id}`);
      window.dispatchEvent(new CustomEvent("data:changed"));
      cQty.value = "1";
      cNotes.value = "";
      cItemSearch?.focus();
      cItemSearch?.select();
    } catch (e) {
      setMsg(e.message || "Failed.", true);
    } finally {
      btn.disabled = false;
    }
  }

  btn.addEventListener("click", submit);
  cNotes.addEventListener("keydown", (e) => {
    // Ctrl+Enter submits; plain Enter makes a new line
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit();
  });

  const items = await loadPickers();
  wireItemSearch(items);
  cItemSearch?.focus();
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
