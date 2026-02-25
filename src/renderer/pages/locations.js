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
        String(s ?? "").replace(/[&<>"']/g, (c) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
        })[c]);

    const applyFilter = () => {
        const q = String(locSearch?.value || "").trim().toLowerCase();
        tbody?.querySelectorAll("tr").forEach((tr) => {
            const hay = String(tr.dataset.hay || "");
            tr.style.display = !q || hay.includes(q) ? "" : "none";
        });
    };

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

        // select-all behavior
        const eCode = m.querySelector("#eLocCode");
        const eName = m.querySelector("#eLocName");
        [eCode, eName].forEach((inp) => {
            inp?.addEventListener("focus", () => inp.select());
        });

        const onEnterSave = (ev) => {
            if (ev.key === "Enter") {
                ev.preventDefault();
                m.querySelector("#eLocSave").click();
            }
        };
        eCode?.addEventListener("keydown", onEnterSave);
        eName?.addEventListener("keydown", onEnterSave);

        const eMsg = m.querySelector("#eLocMsg");
        const setEMsg = (t, err = false) => {
            eMsg.textContent = t || "";
            eMsg.classList.toggle("err", !!err);
        };

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

        // Delete is gated; actual delete IPC may not exist yet (we’ll wire it next step)
        m.querySelector("#eLocDelete").addEventListener("click", async () => {
            setEMsg("");

            if (sessionStorage.getItem("adminUnlocked") !== "1") {
                setEMsg("Admin unlock required to delete.", true);
                return;
            }

            setEMsg("Delete not wired yet (needs IPC).", true);
        });

        m.classList.remove("hidden");
        eName?.focus();
        eName?.select();
    }

    async function load() {
        setMsg("");
        locs = await window.api.locationsList();
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