export async function mountHome() {
  const skus = document.getElementById("kpiSkus");
  const locs = document.getElementById("kpiLocs");
  const reorder = document.getElementById("kpiReorder");
  const tx7d = document.getElementById("kpiTx7d");

  const homeHint = document.getElementById("homeHint");

  const lMsg = document.getElementById("lMsg");
  const lCode = document.getElementById("lCode");
  const lName = document.getElementById("lName");
  const lSave = document.getElementById("lSave");
  const lCancel = document.getElementById("lCancel");

  const locTbody = document.querySelector("#locTable tbody");
  const locHint = document.getElementById("locHint");

  let editingId = null;
  let cachedLocations = [];

  function setLMsg(t, err = false) {
    lMsg.textContent = t || "";
    lMsg.classList.toggle("err", !!err);
  }
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

  function setModeEdit(on) {
    lSave.textContent = on ? "Save" : "Add";
    lCancel.disabled = !on;
  }

  function clearForm() {
    editingId = null;
    lCode.value = "";
    lName.value = "";
    setModeEdit(false);
    setLMsg("");
    lCode.focus();
  }

  async function load() {
    const [s, locList] = await Promise.all([
      window.api.homeStats(),
      window.api.locationsList(),
    ]);

    cachedLocations = locList;

    skus.textContent = String(s.total_skus ?? 0);
    locs.textContent = String(s.total_locations ?? 0);
    reorder.textContent = String(s.below_reorder ?? 0);
    tx7d.textContent = String(s.tx_7d ?? 0);

    homeHint.textContent =
      (s.total_locations ?? 0) === 0
        ? "No locations yet. Add at least SHOP-A1 and TRUCK-01."
        : "";

    locTbody.innerHTML = locList
      .map(
        (l) => `
      <tr data-id="${l.id}">
        <td class="mono">${esc(l.code)}</td>
        <td>${esc(l.name)}</td>
        <td class="mono">${esc(l.created_at)}</td>
      </tr>
    `,
      )
      .join("");

    locHint.textContent = locList.length
      ? `${locList.length} location(s)`
      : "No locations yet.";

    // click row to edit
    locTbody.querySelectorAll("tr[data-id]").forEach((tr) => {
      tr.addEventListener("click", () => {
        const id = Number(tr.dataset.id);
        const loc = cachedLocations.find((x) => Number(x.id) === id);
        if (!loc) return;

        editingId = id;
        lCode.value = loc.code || "";
        lName.value = loc.name || "";
        setModeEdit(true);
        setLMsg(`Editing: ${loc.code}`);
        lCode.focus();
      });
    });
  }

  async function save() {
    setLMsg("");
    lSave.disabled = true;

    try {
      if (!editingId) {
        // CREATE
        await window.api.locationsCreate({
          code: lCode.value,
          name: lName.value,
        });
        setLMsg("Added.");
      } else {
        // UPDATE
        await window.api.locationsUpdate({
          id: editingId,
          code: lCode.value,
          name: lName.value,
        });
        setLMsg("Saved.");
      }

      window.dispatchEvent(new CustomEvent("data:changed"));
      await load();
      clearForm();
    } catch (e) {
      setLMsg(e.message || "Failed.", true);
    } finally {
      lSave.disabled = false;
    }
  }

  lSave.addEventListener("click", save);
  lCancel.addEventListener("click", clearForm);
  lName.addEventListener("keydown", (e) => {
    if (e.key === "Enter") save();
  });

  document.querySelectorAll("[data-go]").forEach((btn) => {
    btn.addEventListener("click", () => {
      location.hash = btn.dataset.go;
    });
  });

  window.addEventListener("data:changed", load);

  await load();
  clearForm();
}
