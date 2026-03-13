﻿// src/renderer/pages/locations.js
export async function mountLocations() {
  const lCode = document.getElementById("lCode");
  const lName = document.getElementById("lName");
  const lSave = document.getElementById("lSave");
  const lClear = document.getElementById("lClear");
  const lMsg = document.getElementById("lMsg");

  const locSearch = document.getElementById("locSearch");
  const locSearchClear = document.getElementById("locSearchClear");
  const table = document.getElementById("locTable");
  const tbody = document.querySelector("#locTable tbody");

  let locs = [];
  let currentParentId = null;

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

  function ensureToolbar() {
    let bar = document.getElementById("locHierarchyBar");
    if (bar) return bar;

    const host = table?.closest(".card-block");
    if (!host) return null;

    const searchWrap = host.querySelector(".items-search");

    bar = document.createElement("div");
    bar.id = "locHierarchyBar";
    bar.style.display = "flex";
    bar.style.gap = "10px";
    bar.style.alignItems = "center";
    bar.style.flexWrap = "wrap";
    bar.style.marginBottom = "12px";
    bar.innerHTML = `
      <button id="locUpBtn" class="btn" type="button">Up One Level</button>
      <button id="locRootBtn" class="btn btn-ghost" type="button">Top Level</button>
      <div id="locBreadcrumb" class="hint"></div>
    `;

    if (searchWrap) host.insertBefore(bar, searchWrap);
    else host.insertBefore(bar, table?.closest(".table-wrap") || null);

    return bar;
  }

  function getChildren(parentId) {
    return (locs || []).filter((l) => {
      const pid = l?.parent_location_id ?? null;
      return Number(pid || 0) === Number(parentId || 0);
    });
  }

  function getLocById(id) {
    return (locs || []).find((x) => Number(x.id) === Number(id)) || null;
  }

  function getBreadcrumbNodes() {
    const nodes = [];
    let cursor = currentParentId;

    while (cursor) {
      const loc = getLocById(cursor);
      if (!loc) break;
      nodes.unshift(loc);
      const next = Number(loc.parent_location_id || 0);
      cursor = next > 0 ? next : null;
    }

    return nodes;
  }

  function renderBreadcrumb() {
    ensureToolbar();

    const upBtn = document.getElementById("locUpBtn");
    const rootBtn = document.getElementById("locRootBtn");
    const crumb = document.getElementById("locBreadcrumb");

    const nodes = getBreadcrumbNodes();
    const atRoot = !currentParentId;

    if (upBtn) upBtn.disabled = atRoot;
    if (rootBtn) rootBtn.disabled = atRoot;

    if (!crumb) return;

    if (nodes.length === 0) {
      crumb.innerHTML = `<span class="mono">Top Level</span>`;
      return;
    }

    const html = [
      `<button class="btn btn-ghost" type="button" data-crumb-root="1">Top Level</button>`,
      ...nodes.map(
        (node) => `
          <span class="muted">/</span>
          <button
            class="btn btn-ghost"
            type="button"
            data-crumb-id="${node.id}"
          >${esc(node.code)}</button>
        `,
      ),
    ].join("");

    crumb.innerHTML = html;
  }

  const applyFilter = () => {
    const q = String(locSearch?.value || "")
      .trim()
      .toLowerCase();

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
      <div class="modal-card" style="max-width:560px">
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
    const parentOptions = (locs || [])
      .filter((x) => Number(x.id) !== Number(loc.id))
      .sort((a, b) => {
        const ap = Number(a.parent_location_id || 0) - Number(b.parent_location_id || 0);
        if (ap !== 0) return ap;
        const so = Number(a.sort_order || 0) - Number(b.sort_order || 0);
        if (so !== 0) return so;
        return String(a.code || "").localeCompare(String(b.code || ""));
      });

    m.querySelector("#locModalTitle").textContent = `Edit — ${loc.code}`;

    m.querySelector("#locModalBody").innerHTML = `
      <div class="edit-grid">
        <label class="field">
          <div class="lbl">Code</div>
          <input id="eLocCode" class="input mono" value="${esc(loc.code || "")}" />
        </label>

        <label class="field">
          <div class="lbl">Sort Order</div>
          <input id="eLocSortOrder" class="input" type="number" step="1" value="${esc(
            Number(loc.sort_order || 0),
          )}" />
        </label>

        <label class="field span-2">
          <div class="lbl">Name</div>
          <input id="eLocName" class="input" value="${esc(loc.name || "")}" />
        </label>

        <label class="field span-2">
          <div class="lbl">Parent</div>
          <select id="eLocParentId" class="input">
            <option value="">Top Level</option>
            ${parentOptions
              .map(
                (x) => `
                  <option value="${x.id}" ${
                    Number(x.id) === Number(loc.parent_location_id || 0) ? "selected" : ""
                  }>
                    ${esc(x.code)}${x.name ? ` — ${esc(x.name)}` : ""}
                  </option>
                `,
              )
              .join("")}
          </select>
        </label>

        <label class="field span-2" style="display:flex; gap:10px; align-items:center;">
          <input id="eLocCountEnabled" type="checkbox" ${
            Number(loc.count_enabled) === 0 ? "" : "checked"
          } />
          <div class="lbl" style="margin:0">Include in counts</div>
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
    const eParentId = m.querySelector("#eLocParentId");
    const eSortOrder = m.querySelector("#eLocSortOrder");
    const eCountEnabled = m.querySelector("#eLocCountEnabled");
    const eMsg = m.querySelector("#eLocMsg");

    const setEMsg = (t, err = false) => {
      eMsg.textContent = t || "";
      eMsg.classList.toggle("err", !!err);
    };

    [eCode, eName, eSortOrder].forEach((inp) =>
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
    eSortOrder?.addEventListener("keydown", onEnterSave);

    m.querySelector("#eLocSave").addEventListener("click", async () => {
      setEMsg("");
      try {
        await window.api.locationsUpdate({
          id: loc.id,
          code: String(eCode.value || "").trim(),
          name: String(eName.value || "").trim(),
          parent_location_id: String(eParentId.value || "").trim() || null,
          sort_order: Number(eSortOrder.value || 0),
          count_enabled: eCountEnabled.checked ? 1 : 0,
        });

        m.classList.add("hidden");
        window.dispatchEvent(new CustomEvent("data:changed"));
        await load();
      } catch (e) {
        setEMsg(e?.message || "Save failed.", true);
      }
    });

    m.querySelector("#eLocDelete").addEventListener("click", async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      setEMsg("");

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
        await window.api.locationsDelete(loc.id);
        m.classList.add("hidden");
        window.dispatchEvent(new CustomEvent("data:changed"));

        if (
          currentParentId &&
          Number(currentParentId) === Number(loc.id)
        ) {
          currentParentId = Number(loc.parent_location_id || 0) || null;
        }

        await load();
      } catch (e) {
        setEMsg(e?.message || "Delete failed.", true);
      }
    });

    m.classList.remove("hidden");
    eName?.focus();
    eName?.select();
  }

  function renderLevel() {
    if (!tbody) return;

    const rows = getChildren(currentParentId).sort((a, b) => {
      const so = Number(a.sort_order || 0) - Number(b.sort_order || 0);
      if (so !== 0) return so;
      return String(a.code || "").localeCompare(String(b.code || ""));
    });

    tbody.innerHTML = rows
      .map((l) => {
        const childCount = getChildren(l.id).length;

        return `
          <tr
            data-id="${l.id}"
            data-hay="${esc(
              `${l.code || ""} ${l.name || ""} ${childCount ? "children" : ""}`,
            ).toLowerCase()}"
          >
            <td class="mono">${esc(l.code)}</td>
            <td>
              <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
                <div>
                  <div>${esc(l.name || "")}</div>
                  <div class="hint">
                    ${Number(l.count_enabled) === 0 ? "Excluded from counts" : "Included in counts"}
                    ${childCount ? ` • ${childCount} child ${childCount === 1 ? "location" : "locations"}` : ""}
                  </div>
                </div>
                <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end;">
                  ${
                    childCount
                      ? `<button class="btn btn-ghost" type="button" data-open-children="${l.id}">Open</button>`
                      : ""
                  }
                  <button class="btn btn-ghost" type="button" data-edit-location="${l.id}">Edit</button>
                </div>
              </div>
            </td>
            <td class="mono">${esc(l.created_at || "")}</td>
          </tr>
        `;
      })
      .join("");

    applyFilter();
    renderBreadcrumb();
  }

  async function load() {
    setMsg("");

    try {
      locs = await window.api.locationsList();
    } catch (e) {
      setMsg(e?.message || "Failed to load locations.", true);
      return;
    }

    const exists =
      !currentParentId ||
      (locs || []).some((x) => Number(x.id) === Number(currentParentId));

    if (!exists) currentParentId = null;

    renderLevel();
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
      const siblings = getChildren(currentParentId);
      const maxSort = siblings.reduce(
        (max, x) => Math.max(max, Number(x.sort_order || 0)),
        0,
      );

      await window.api.locationsCreate({
        code,
        name,
        parent_location_id: currentParentId,
        sort_order: maxSort + 10,
        count_enabled: 1,
      });

      setMsg(currentParentId ? "Child location added." : "Location added.");
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
    const openBtn = e.target.closest("[data-open-children]");
    if (openBtn) {
      currentParentId = Number(openBtn.dataset.openChildren);
      if (locSearch) locSearch.value = "";
      renderLevel();
      return;
    }

    const editBtn = e.target.closest("[data-edit-location]");
    if (editBtn) {
      const id = Number(editBtn.dataset.editLocation);
      const loc = getLocById(id);
      if (loc) openEditLocationModal(loc);
      return;
    }

    const tr = e.target.closest("tr[data-id]");
    if (!tr) return;

    const id = Number(tr.dataset.id);
    const loc = getLocById(id);
    if (!loc) return;

    const childCount = getChildren(loc.id).length;
    if (childCount > 0) {
      currentParentId = loc.id;
      if (locSearch) locSearch.value = "";
      renderLevel();
      return;
    }

    openEditLocationModal(loc);
  });

  document.addEventListener("click", (e) => {
    const rootBtn = e.target.closest("[data-crumb-root]");
    if (rootBtn) {
      currentParentId = null;
      if (locSearch) locSearch.value = "";
      renderLevel();
      return;
    }

    const crumbBtn = e.target.closest("[data-crumb-id]");
    if (crumbBtn) {
      currentParentId = Number(crumbBtn.dataset.crumbId) || null;
      if (locSearch) locSearch.value = "";
      renderLevel();
      return;
    }

    const upBtn = e.target.closest("#locUpBtn");
    if (upBtn) {
      const current = getLocById(currentParentId);
      currentParentId = Number(current?.parent_location_id || 0) || null;
      if (locSearch) locSearch.value = "";
      renderLevel();
      return;
    }

    const topBtn = e.target.closest("#locRootBtn");
    if (topBtn) {
      currentParentId = null;
      if (locSearch) locSearch.value = "";
      renderLevel();
    }
  });

  window.addEventListener("data:changed", load);

  ensureToolbar();
  await load();
  lCode?.focus();
}
