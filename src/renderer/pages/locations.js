// src/renderer/pages/locations.js
export async function mountLocations() {
  const lCode = document.getElementById("lCode");
  const lName = document.getElementById("lName");
  const lSave = document.getElementById("lSave");
  const lClear = document.getElementById("lClear");
  const lMsg = document.getElementById("lMsg");

  const locSearch = document.getElementById("locSearch");
  const locSearchClear = document.getElementById("locSearchClear");
  const tbody = document.querySelector("#locTable tbody");

  let locs = [];

  const setMsg = (t, err = false) => {
    if (!lMsg) return;
    lMsg.textContent = t || "";
    lMsg.classList.toggle("err", !!err);
  };

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

  const applyFilter = () => {
    const q = String(locSearch?.value || "")
      .trim()
      .toLowerCase();
    tbody?.querySelectorAll("tr").forEach((tr) => {
      const hay = String(tr.dataset.hay || "");
      tr.style.display = !q || hay.includes(q) ? "" : "none";
    });
  };

  // --- Admin unlock (same behavior as app.js) ---
  const isAdminUnlocked = () => sessionStorage.getItem("adminUnlocked") === "1";

  function unlockAdminPrompt() {
    return new Promise((resolve) => {
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
        if (
          e.target.closest("[data-cancel]") ||
          e.target.classList.contains("modal-backdrop")
        ) {
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

  // --- Modal helpers ---
  function ensureModal() {
    let el = document.getElementById("locModal");
    if (el) return el;

    el = document.createElement("div");
    el.id = "locModal";
    el.className = "modal hidden";
    el.innerHTML = `
      <div class="modal-backdrop" data-close></div>
      <div class="modal-card" style="max-width:520px">
        <div class="modal-head">
          <div class="modal-title" id="locModalTitle">Edit Location</div>
          <button class="btn" data-close>✕</button>
        </div>
        <div class="modal-body" id="locModalBody"></div>
      </div>
    `;
    document.body.appendChild(el);

    el.addEventListener("click", (e) => {
      if (e.target.closest("[data-close]")) el.classList.add("hidden");
    });

    return el;
  }

  function openEditLocationModal(loc) {
    const m = ensureModal();
    m.querySelector("#locModalTitle").textContent = `Edit — ${loc.code}`;

    m.querySelector("#locModalBody").innerHTML = `
      <div class="edit-grid">
        <label class="field">
          <div class="lbl">Code</div>
          <input id="eLocCode" class="input mono" value="${esc(loc.code || "")}" />
        </label>

        <label class="field span-2">
          <div class="lbl">Name</div>
          <input id="eLocName" class="input" value="${esc(loc.name || "")}" />
        </label>

        <div class="msg span-2" id="eLocMsg"></div>

        <div class="modal-actions span-2">
          <button id="eLocSave" class="btn btn-primary">Save</button>
          <button class="btn" data-close>Cancel</button>
          <button id="eLocDelete" class="btn btn-danger">Delete</button>
        </div>
      </div>
    `;

    const eCode = m.querySelector("#eLocCode");
    const eName = m.querySelector("#eLocName");
    const eMsg = m.querySelector("#eLocMsg");

    const setEMsg = (t, err = false) => {
      eMsg.textContent = t || "";
      eMsg.classList.toggle("err", !!err);
    };

    // select-all
    [eCode, eName].forEach((inp) =>
      inp?.addEventListener("focus", () => inp.select()),
    );

    const onEnterSave = (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        m.querySelector("#eLocSave").click();
      }
    };
    eCode?.addEventListener("keydown", onEnterSave);
    eName?.addEventListener("keydown", onEnterSave);

    // Save
    m.querySelector("#eLocSave").addEventListener("click", async () => {
      setEMsg("");
      try {
        await window.api.locationsUpdate({
          id: loc.id,
          code: String(eCode.value || "").trim(),
          name: String(eName.value || "").trim(),
        });
        m.classList.add("hidden");
        await load();
      } catch (e) {
        setEMsg(e?.message || "Save failed.", true);
      }
    });

    // Delete (admin unlock modal like Admin page)
    m.querySelector("#eLocDelete").addEventListener("click", async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      setEMsg("");

      // Ensure admin unlocked using same modal flow as app.js
      if (!isAdminUnlocked()) {
        const okUnlock = await unlockAdminPrompt();
        if (!okUnlock) {
          setEMsg("Admin unlock cancelled.", true);
          return;
        }
      }

      const ok = confirm(
        `Delete location "${loc.code}"? This cannot be undone.`,
      );
      if (!ok) return;

      try {
        if (!window.api.locationsDelete) {
          throw new Error("locationsDelete is not exposed in preload.js");
        }
        await window.api.locationsDelete(loc.id);

        m.classList.add("hidden");
        window.dispatchEvent(new CustomEvent("data:changed"));
        await load();
      } catch (e) {
        setEMsg(e?.message || "Delete failed.", true);
      }
    });

    m.classList.remove("hidden");
    eName?.focus();
    eName?.select();
  }

  async function load() {
    setMsg("");
    try {
      locs = await window.api.locationsList();
    } catch (e) {
      setMsg(e?.message || "Failed to load locations.", true);
      return;
    }

    if (!tbody) return;

    tbody.innerHTML = (locs || [])
      .map(
        (l) => `
          <tr data-id="${l.id}" data-hay="${esc((l.code || "") + " " + (l.name || "")).toLowerCase()}">
            <td class="mono">${esc(l.code)}</td>
            <td>${esc(l.name || "")}</td>
            <td class="mono">${esc(l.created_at || "")}</td>
          </tr>
        `,
      )
      .join("");

    applyFilter();
  }

  const clearForm = () => {
    if (lCode) lCode.value = "";
    if (lName) lName.value = "";
    lCode?.focus();
  };

  lCode?.addEventListener("focus", () => lCode.select());
  lName?.addEventListener("focus", () => lName.select());

  lSave?.addEventListener("click", async () => {
    setMsg("");
    const code = String(lCode?.value || "").trim();
    const name = String(lName?.value || "").trim();
    if (!code) return setMsg("Code is required.", true);

    try {
      await window.api.locationsCreate({ code, name });
      setMsg("Location added.");
      clearForm();
      window.dispatchEvent(new CustomEvent("data:changed"));
      await load();
    } catch (e) {
      setMsg(e?.message || "Failed to add location.", true);
    }
  });

  lClear?.addEventListener("click", () => {
    setMsg("");
    clearForm();
  });

  locSearch?.addEventListener("focus", () => locSearch.select());
  locSearch?.addEventListener("input", applyFilter);
  locSearchClear?.addEventListener("click", () => {
    if (locSearch) locSearch.value = "";
    applyFilter();
    locSearch?.focus();
  });

  tbody?.addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-id]");
    if (!tr) return;

    const id = Number(tr.dataset.id);
    const loc = (locs || []).find((x) => Number(x.id) === id);
    if (loc) openEditLocationModal(loc);
  });

  window.addEventListener("data:changed", load);

  await load();
  lCode?.focus();
}
