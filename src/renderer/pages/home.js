export async function mountHome() {
  const btn = document.getElementById("lAdd");
  const tbody = document.querySelector("#locTable tbody");
  const hint = document.getElementById("locHint");
  const msg = document.getElementById("lMsg");

  const code = document.getElementById("lCode");
  const name = document.getElementById("lName");

  function setMsg(text, isError=false) {
    msg.textContent = text || "";
    msg.classList.toggle("err", !!isError);
  }

  async function load() {
    const locs = await window.api.locationsList();
    tbody.innerHTML = locs.map(l => `
      <tr>
        <td class="mono">${escapeHtml(l.code)}</td>
        <td>${escapeHtml(l.name)}</td>
        <td class="mono">${escapeHtml(l.created_at)}</td>
      </tr>
    `).join("");
    hint.textContent = locs.length ? `${locs.length} location(s)` : "No locations yet.";
  }

  async function add() {
    setMsg("");
    btn.disabled = true;
    try {
      await window.api.locationsCreate({ code: code.value, name: name.value });
      code.value = "";
      name.value = "";
      setMsg("Added.");
      await load();
      code.focus();
    } catch (e) {
      setMsg(e.message || "Failed.", true);
    } finally {
      btn.disabled = false;
    }
  }

  btn.addEventListener("click", add);
  name.addEventListener("keydown", (e) => { if (e.key === "Enter") add(); });

  await load();
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}
