export async function mountReceive() {
  const msg = document.getElementById("rMsg");
  const btn = document.getElementById("rSubmit");

  const rInit = document.getElementById("rInit");
  const rVendor = document.getElementById("rVendor");
  const rPO = document.getElementById("rPO");
  const rLoc = document.getElementById("rLoc");
  const rItem = document.getElementById("rItem");
  const rQty = document.getElementById("rQty");
  const rCost = document.getElementById("rCost");
  const rNotes = document.getElementById("rNotes");

  function setMsg(t, err=false){ msg.textContent = t||""; msg.classList.toggle("err", !!err); }

  async function loadPickers() {
    const [locs, items] = await Promise.all([
      window.api.locationsList(),
      window.api.itemsList(),
    ]);

    rLoc.innerHTML = `<option value="">Select...</option>` + locs.map(l =>
      `<option value="${l.id}">${escapeHtml(l.code)}${l.name ? " — " + escapeHtml(l.name) : ""}</option>`
    ).join("");

    rItem.innerHTML = `<option value="">Select...</option>` + items.map(i =>
      `<option value="${i.id}">${escapeHtml(i.sku)} — ${escapeHtml(i.description)}</option>`
    ).join("");

    const preselectItemId = sessionStorage.getItem("receive:preselectItemId");
    if (preselectItemId) {
      sessionStorage.removeItem("receive:preselectItemId");
      rItem.value = preselectItemId;
      if (rItem.value === preselectItemId) {
        const resetLoc = sessionStorage.getItem("receive:resetLocation");
        if (resetLoc) {
          sessionStorage.removeItem("receive:resetLocation");
          rLoc.value = "";
        }
        setMsg("Select a location and enter Qty to receive.");
        setTimeout(() => rLoc.focus(), 0);
      }
    }
  }

  async function submit() {
    setMsg("");
    btn.disabled = true;

    try {
      const payload = {
        user_initials: rInit.value,
        vendor: rVendor.value,
        po_number: rPO.value,
        location_id: rLoc.value,
        item_id: rItem.value,
        qty: rQty.value,
        unit_cost: rCost.value,
        notes: rNotes.value,
      };

      const res = await window.api.receiveSubmit(payload);
      setMsg(`Received. TX #${res.transaction_id}`);
      window.dispatchEvent(new CustomEvent("data:changed"));
      rQty.value = "1";
      rCost.value = "0";
      rNotes.value = "";
      rItem.focus();
    } catch (e) {
      setMsg(e.message || "Failed.", true);
    } finally {
      btn.disabled = false;
    }
  }

  btn.addEventListener("click", submit);
  rNotes.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });

  await loadPickers();
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}
