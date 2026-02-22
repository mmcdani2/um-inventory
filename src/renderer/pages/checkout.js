export async function mountCheckout() {
  const msg = document.getElementById("cMsg");
  const btn = document.getElementById("cSubmit");

  const cJob = document.getElementById("cJob");
  const cTech = document.getElementById("cTech");
  const cLoc = document.getElementById("cLoc");
  const cItem = document.getElementById("cItem");
  const cQty = document.getElementById("cQty");
  const cNotes = document.getElementById("cNotes");

  function setMsg(t, err=false){ msg.textContent = t||""; msg.classList.toggle("err", !!err); }

  async function loadPickers() {
    const [locs, items] = await Promise.all([
      window.api.locationsList(),
      window.api.itemsList(),
    ]);

    cLoc.innerHTML = `<option value="">Select...</option>` + locs.map(l =>
      `<option value="${l.id}">${escapeHtml(l.code)}${l.name ? " — " + escapeHtml(l.name) : ""}</option>`
    ).join("");

    cItem.innerHTML = `<option value="">Select...</option>` + items.map(i =>
      `<option value="${i.id}">${escapeHtml(i.sku)} — ${escapeHtml(i.description)}</option>`
    ).join("");
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
      cItem.focus();
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

  await loadPickers();
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}
